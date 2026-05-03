import { Queue, Worker } from 'bullmq';
import nodemailer from 'nodemailer';
import { connection } from './connection';

const EMAIL_QUEUE_NAME = 'admin-email';

// ─── Queue ────────────────────────────────────────────────────────────────────

export type EmailJobPayload = {
  to: string;
  templateName: 'welcome' | 'ban_notification' | 'mute_notification' | 'admin_message' | 'password_reset';
  variables: Record<string, string>;
};

export const emailQueue = new Queue(EMAIL_QUEUE_NAME, {
  connection,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: 'exponential', delay: 2000 },
    removeOnComplete: true,
    removeOnFail: false
  }
});

export async function enqueueEmail(payload: EmailJobPayload) {
  return emailQueue.add('email:send', payload, {
    jobId: `email:${payload.templateName}:${payload.to}:${Date.now()}`
  });
}

// ─── Templates ───────────────────────────────────────────────────────────────

const TEMPLATES: Record<EmailJobPayload['templateName'], { subject: string; html: (vars: Record<string, string>) => string }> = {
  welcome: {
    subject: 'Welcome to ThinkAI',
    html: (v) => `
      <h2>Welcome, ${v.name ?? v.email}!</h2>
      <p>Your account has been created by an administrator.</p>
      <p>You can now sign in at <a href="${v.appUrl ?? 'https://app.thinkai.dev'}">${v.appUrl ?? 'https://app.thinkai.dev'}</a>.</p>
      <p>Your temporary password is: <strong>${v.tempPassword ?? '(set by admin)'}</strong></p>
    `
  },
  ban_notification: {
    subject: 'Your account has been suspended',
    html: (v) => `
      <h2>Account Suspended</h2>
      <p>Hi ${v.name ?? v.email},</p>
      <p>Your ThinkAI account has been suspended${v.reason ? ` for the following reason: <em>${v.reason}</em>` : ''}.</p>
      <p>If you believe this is a mistake, please contact our support team.</p>
    `
  },
  mute_notification: {
    subject: 'Your account has been muted',
    html: (v) => `
      <h2>Account Muted</h2>
      <p>Hi ${v.name ?? v.email},</p>
      <p>Your ThinkAI account has been muted until <strong>${v.mutedUntil}</strong>.</p>
    `
  },
  admin_message: {
    subject: (v: Record<string, string>) => v.subject ?? 'Message from ThinkAI Admin',
    html: (v: Record<string, string>) => `
      <h2>${v.title ?? 'Admin Notification'}</h2>
      <p>Hi ${v.name ?? v.email},</p>
      <p>${v.message}</p>
    `
  } as any,
  password_reset: {
    subject: 'Set your ThinkAI password',
    html: (v) => {
      const resetUrl = `${v.appUrl || 'http://localhost:3001'}/reset-password?email=${encodeURIComponent(v.email)}&otp=${v.otp}`;
      return `
        <div style="font-family: sans-serif; max-width: 600px; margin: auto; padding: 20px; border: 1px solid #eee; border-radius: 10px;">
          <h2 style="color: #333;">Welcome to ThinkAI</h2>
          <p>Hi ${v.name ?? v.email},</p>
          <p>An account has been created for you by an administrator. To get started, please set your password by clicking the button below:</p>
          <div style="text-align: center; margin: 30px 0;">
            <a href="${resetUrl}" style="background-color: #4F46E5; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold; display: inline-block;">Set My Password</a>
          </div>
          <p style="color: #666; font-size: 14px;">Alternatively, copy and paste this link into your browser:</p>
          <p style="color: #4F46E5; font-size: 12px; word-break: break-all;">${resetUrl}</p>
          <hr style="border: 0; border-top: 1px solid #eee; margin: 20px 0;" />
          <p style="color: #999; font-size: 12px;">This link will expire in 24 hours for security reasons.</p>
        </div>
      `;
    }
  }
};

// ─── Worker ───────────────────────────────────────────────────────────────────

export function startEmailWorker(logger: { info: (...a: unknown[]) => void; error: (...a: unknown[]) => void }) {
  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT ?? 587),
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS
    }
  });

  const worker = new Worker(
    EMAIL_QUEUE_NAME,
    async (job) => {
      const data = job.data as EmailJobPayload;
      const template = TEMPLATES[data.templateName];
      if (!template) throw new Error(`Unknown email template: ${data.templateName}`);

      const subject = typeof template.subject === 'function'
        ? (template.subject as any)(data.variables)
        : template.subject;

      await transporter.sendMail({
        from: process.env.SMTP_FROM_EMAIL ?? 'no-reply@thinkai.dev',
        to: data.to,
        subject,
        html: template.html(data.variables)
      });

      logger.info({ to: data.to, template: data.templateName }, 'Email sent');
    },
    { connection }
  );

  worker.on('error', (err) => logger.error({ err }, 'Email worker error'));
  worker.on('failed', (job, err) => logger.error({ jobId: job?.id, err }, 'Email job failed'));

  return worker;
}
