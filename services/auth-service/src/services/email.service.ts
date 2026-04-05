import nodemailer, { Transporter } from 'nodemailer';

type EmailServiceOptions = {
  smtpHost?: string;
  smtpPort?: number;
  smtpUser?: string;
  smtpPass?: string;
  fromEmail: string;
};

export class EmailService {
  private readonly transporter: Transporter;
  private readonly fromEmail: string;

  constructor(options: EmailServiceOptions) {
    this.fromEmail = options.fromEmail;

    if (options.smtpHost && options.smtpUser && options.smtpPass) {
      this.transporter = nodemailer.createTransport({
        host: options.smtpHost,
        port: options.smtpPort ?? 587,
        secure: (options.smtpPort ?? 587) === 465,
        auth: {
          user: options.smtpUser,
          pass: options.smtpPass
        }
      });
    } else {
      this.transporter = nodemailer.createTransport({
        jsonTransport: true
      });
    }
  }

  async sendOtpEmail(to: string, otp: string, type: 'VERIFY_EMAIL' | 'RESET_PASSWORD') {
    const title = type === 'VERIFY_EMAIL' ? 'Verify your email' : 'Reset your password';
    const description =
      type === 'VERIFY_EMAIL'
        ? 'Use this one-time password to verify your Think AI account.'
        : 'Use this one-time password to reset your Think AI password.';

    const html = `
      <div style="font-family:Segoe UI,Helvetica,Arial,sans-serif;max-width:560px;margin:0 auto;padding:24px;background:#f8fafc;color:#0f172a;">
        <h2 style="margin:0 0 12px;">${title}</h2>
        <p style="margin:0 0 16px;line-height:1.5;">${description}</p>
        <div style="font-size:32px;font-weight:700;letter-spacing:4px;background:white;border:1px solid #e2e8f0;border-radius:8px;padding:16px;text-align:center;">${otp}</div>
        <p style="margin:16px 0 0;line-height:1.5;">Your OTP is valid for 5 minutes.</p>
      </div>
    `;

    await this.transporter.sendMail({
      from: this.fromEmail,
      to,
      subject: `Think AI OTP: ${otp}`,
      html
    });
  }
}
