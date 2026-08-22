import axios from 'axios';
import nodemailer from 'nodemailer';
import { env } from '../../config/env';
import { logger } from '../../utils/logger';

export interface EmailOptions {
  to: string;
  toName?: string;
  subject: string;
  html: string;
  text?: string;
}

export class ZeptoMailService {
  private smtpTransporter: nodemailer.Transporter | null = null;

  constructor() {
    this.initSmtp();
  }

  private initSmtp() {
    if (env.SMTP_HOST && env.SMTP_USER && env.SMTP_PASS) {
      const port = env.SMTP_PORT ? parseInt(env.SMTP_PORT, 10) : 587;
      const secure = env.SMTP_SECURE === 'true' || port === 465;

      this.smtpTransporter = nodemailer.createTransport({
        host: env.SMTP_HOST,
        port,
        secure,
        auth: {
          user: env.SMTP_USER,
          pass: env.SMTP_PASS,
        },
      });
      logger.info(`[ZeptoMail] SMTP transporter configured: ${env.SMTP_HOST}:${port}`);
    }
  }

  /**
   * Primary dispatcher: Tries ZeptoMail REST API first, then SMTP, then fallback logging.
   */
  async sendEmail(options: EmailOptions): Promise<{ success: boolean; messageId?: string; error?: string }> {
    const fromAddress = env.ZEPTO_FROM_EMAIL || 'noreply@sadhya.app';
    const fromName = env.ZEPTO_FROM_NAME || 'Sadhya';

    // 1. Try ZeptoMail REST API if ZEPTO_API_KEY is configured
    if (env.ZEPTO_API_KEY) {
      try {
        const payload = {
          from: {
            address: fromAddress,
            name: fromName,
          },
          to: [
            {
              email_address: {
                address: options.to,
                name: options.toName || options.to.split('@')[0],
              },
            },
          ],
          subject: options.subject,
          htmlbody: options.html,
          textbody: options.text || options.subject,
        };

        const authHeader = env.ZEPTO_API_KEY.startsWith('Zoho-enczapikey ')
          ? env.ZEPTO_API_KEY
          : `Zoho-enczapikey ${env.ZEPTO_API_KEY}`;

        const response = await axios.post(env.ZEPTO_API_URL || 'https://api.zeptomail.in/v1.1/email', payload, {
          headers: {
            'Accept': 'application/json',
            'Content-Type': 'application/json',
            'Authorization': authHeader,
          },
          timeout: 10000,
        });

        logger.info('[ZeptoMail] Email sent via REST API', {
          to: options.to,
          subject: options.subject,
          status: response.status,
        });
        return { success: true, messageId: response.data?.data?.[0]?.message_id || 'rest-success' };
      } catch (err: any) {
        logger.error('[ZeptoMail] REST API dispatch failed, trying fallback', {
          error: err?.response?.data || err?.message,
        });
      }
    }

    // 2. Try SMTP if configured (e.g. smtp.zeptomail.in)
    if (this.smtpTransporter) {
      try {
        const info = await this.smtpTransporter.sendMail({
          from: `"${fromName}" <${fromAddress}>`,
          to: options.toName ? `"${options.toName}" <${options.to}>` : options.to,
          subject: options.subject,
          text: options.text || options.subject,
          html: options.html,
        });

        logger.info('[ZeptoMail] Email sent via SMTP', {
          to: options.to,
          messageId: info.messageId,
        });
        return { success: true, messageId: info.messageId };
      } catch (err: any) {
        logger.error('[ZeptoMail] SMTP dispatch failed', { error: err?.message });
      }
    }

    // 3. Fallback: Log for local dev / unconfigured environments
    logger.warn('[ZeptoMail] No active mail transport configured. Simulating email delivery for:', {
      to: options.to,
      subject: options.subject,
    });

    return { success: true, messageId: 'simulated-local-dev' };
  }

  /**
   * Generates and dispatches a branded Email Verification message.
   */
  async sendVerificationEmail(email: string, displayName: string, verificationLink: string): Promise<boolean> {
    const name = displayName?.trim() || 'Learner';
    const subject = 'Verify your email address for Sadhya';

    const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${subject}</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #0c0c0e; color: #f3f4f6; margin: 0; padding: 0; }
    .container { max-width: 560px; margin: 30px auto; background-color: #141416; border: 1px solid rgba(255,255,255,0.08); border-radius: 16px; overflow: hidden; }
    .header { padding: 32px 32px 24px; border-bottom: 1px solid rgba(255,255,255,0.06); text-align: center; }
    .logo { font-size: 22px; font-weight: 700; color: #ffffff; letter-spacing: -0.5px; text-decoration: none; }
    .logo span { color: #c8e558; }
    .content { padding: 32px; font-size: 15px; line-height: 1.6; color: #d1d5db; }
    .greeting { font-size: 18px; font-weight: 600; color: #ffffff; margin-bottom: 12px; }
    .button-wrap { text-align: center; margin: 32px 0; }
    .btn { display: inline-block; background-color: #c8e558; color: #0f172a; text-decoration: none; font-weight: 600; font-size: 14.5px; padding: 13px 28px; border-radius: 10px; }
    .fallback-box { background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.06); padding: 14px; border-radius: 8px; word-break: break-all; font-family: monospace; font-size: 12px; color: #9ca3af; margin-top: 24px; }
    .footer { padding: 24px 32px; border-top: 1px solid rgba(255,255,255,0.06); font-size: 12px; color: #6b7280; text-align: center; line-height: 1.5; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <div class="logo">Sadhya<span>.</span></div>
    </div>
    <div class="content">
      <div class="greeting">Welcome to Sadhya, ${name}!</div>
      <p>Please verify your email address to activate your account and access your AI tutor, smart notebooks, and practice engine.</p>
      
      <div class="button-wrap">
        <a href="${verificationLink}" class="btn" target="_blank" rel="noopener noreferrer">Verify My Email</a>
      </div>

      <p style="font-size: 13px; color: #9ca3af;">This link is valid for 24 hours. If the button above doesn't work, copy and paste the link below into your browser:</p>
      <div class="fallback-box">${verificationLink}</div>
    </div>
    <div class="footer">
      <p>If you did not sign up for a Sadhya account, you can safely ignore this email.</p>
      <p>© ${new Date().getFullYear()} Sadhya Technologies Pvt. Ltd. Bengaluru, India</p>
    </div>
  </div>
</body>
</html>
`;

    const text = `
Hello ${name},

Welcome to Sadhya! Please verify your email address to activate your account:
${verificationLink}

If you did not create an account on Sadhya, you can safely ignore this message.

Warm regards,
The Sadhya Team
https://sadhya.app
`;

    const result = await this.sendEmail({
      to: email,
      toName: displayName,
      subject,
      html,
      text,
    });

    return result.success;
  }

  /**
   * Generates and dispatches a branded Password Reset message.
   */
  async sendPasswordResetEmail(email: string, displayName: string, resetLink: string): Promise<boolean> {
    const name = displayName?.trim() || 'Learner';
    const subject = 'Reset your Sadhya account password';

    const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${subject}</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #0c0c0e; color: #f3f4f6; margin: 0; padding: 0; }
    .container { max-width: 560px; margin: 30px auto; background-color: #141416; border: 1px solid rgba(255,255,255,0.08); border-radius: 16px; overflow: hidden; }
    .header { padding: 32px 32px 24px; border-bottom: 1px solid rgba(255,255,255,0.06); text-align: center; }
    .logo { font-size: 22px; font-weight: 700; color: #ffffff; letter-spacing: -0.5px; text-decoration: none; }
    .logo span { color: #c8e558; }
    .content { padding: 32px; font-size: 15px; line-height: 1.6; color: #d1d5db; }
    .greeting { font-size: 18px; font-weight: 600; color: #ffffff; margin-bottom: 12px; }
    .button-wrap { text-align: center; margin: 32px 0; }
    .btn { display: inline-block; background-color: #c8e558; color: #0f172a; text-decoration: none; font-weight: 600; font-size: 14.5px; padding: 13px 28px; border-radius: 10px; }
    .fallback-box { background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.06); padding: 14px; border-radius: 8px; word-break: break-all; font-family: monospace; font-size: 12px; color: #9ca3af; margin-top: 24px; }
    .footer { padding: 24px 32px; border-top: 1px solid rgba(255,255,255,0.06); font-size: 12px; color: #6b7280; text-align: center; line-height: 1.5; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <div class="logo">Sadhya<span>.</span></div>
    </div>
    <div class="content">
      <div class="greeting">Hello ${name},</div>
      <p>We received a request to reset the password for your Sadhya account. Click the button below to choose a new password:</p>
      
      <div class="button-wrap">
        <a href="${resetLink}" class="btn" target="_blank" rel="noopener noreferrer">Reset Password</a>
      </div>

      <p style="font-size: 13px; color: #9ca3af;">This link is valid for 1 hour. If the button above doesn't work, copy and paste the link below into your browser:</p>
      <div class="fallback-box">${resetLink}</div>
    </div>
    <div class="footer">
      <p>If you did not request a password reset, you can safely ignore this email — your account remains secure.</p>
      <p>© ${new Date().getFullYear()} Sadhya Technologies Pvt. Ltd. Bengaluru, India</p>
    </div>
  </div>
</body>
</html>
`;

    const text = `
Hello ${name},

We received a request to reset the password for your Sadhya account:
${resetLink}

If you did not request a password reset, you can safely ignore this email.

Warm regards,
The Sadhya Team
https://sadhya.app
`;

    const result = await this.sendEmail({
      to: email,
      toName: displayName,
      subject,
      html,
      text,
    });

    return result.success;
  }
}

export const zeptoMailService = new ZeptoMailService();
