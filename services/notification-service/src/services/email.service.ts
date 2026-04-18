const nodemailer = require('nodemailer');

type EmailPayload = {
  to: string;
  subject: string;
  html: string;
};

export class EmailService {
  private transporter = nodemailer.createTransport(
    process.env.SMTP_HOST
      ? {
          host: process.env.SMTP_HOST,
          port: Number(process.env.SMTP_PORT ?? 587),
          secure: false,
          auth: process.env.SMTP_USER
            ? {
                user: process.env.SMTP_USER,
                pass: process.env.SMTP_PASS
              }
            : undefined
        }
      : {
          jsonTransport: true
        }
  );

  async send(payload: EmailPayload) {
    await this.transporter.sendMail({
      from: process.env.SMTP_FROM_EMAIL ?? 'no-reply@thinkai.dev',
      to: payload.to,
      subject: payload.subject,
      html: payload.html
    });
  }

  renderTemplate(title: string, message: string) {
    return `
      <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:16px;">
        <h2 style="margin-bottom:8px;">${title}</h2>
        <p style="font-size:14px;line-height:1.5;color:#333;">${message}</p>
      </div>
    `;
  }
}
