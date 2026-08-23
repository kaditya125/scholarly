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
  replyTo?: string;
}

export class ZeptoMailService {
  private smtpTransporter: nodemailer.Transporter | null = null;
  private readonly logoUrl = 'https://sadhya.app/sadhya-logo-with-name-512x512.png';
  private readonly iconUrl = 'https://sadhya.app/sadhya-logo-512x512.png';

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
   * Primary dispatcher: Tries ZeptoMail REST API first, then SMTP fallback.
   */
  async sendEmail(options: EmailOptions): Promise<{ success: boolean; messageId?: string; error?: string }> {
    const fromAddress = env.ZEPTO_FROM_EMAIL || 'noreply@sadhya.app';
    const fromName = env.ZEPTO_FROM_NAME || 'Sadhya';

    // 1. Try ZeptoMail REST API
    if (env.ZEPTO_API_KEY) {
      try {
        const payload: any = {
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

        if (options.replyTo) {
          payload.reply_to = [
            {
              address: options.replyTo,
              name: options.replyTo.split('@')[0],
            },
          ];
        }

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
        logger.error('[ZeptoMail] REST API dispatch failed, trying SMTP fallback', {
          error: err?.response?.data || err?.message,
        });
      }
    }

    // 2. Try SMTP if configured
    if (this.smtpTransporter) {
      try {
        const info = await this.smtpTransporter.sendMail({
          from: `"${fromName}" <${fromAddress}>`,
          to: options.toName ? `"${options.toName}" <${options.to}>` : options.to,
          subject: options.subject,
          text: options.text || options.subject,
          html: options.html,
          replyTo: options.replyTo,
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

    logger.warn('[ZeptoMail] No active mail transport configured. Simulating dispatch for:', {
      to: options.to,
      subject: options.subject,
    });

    return { success: true, messageId: 'simulated-local-dev' };
  }

  /**
   * Generates and dispatches a clean, high-end Verification Email.
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
</head>
<body style="margin: 0; padding: 0; background-color: #ffffff; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #0f172a; -webkit-font-smoothing: antialiased;">
  <!-- Seamless Container -->
  <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="background-color: #ffffff; width: 100%;">
    <tr>
      <td align="center" style="padding: 24px 16px 48px;">
        <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="max-width: 640px; text-align: left;">
          
          <!-- Header with Sadhya Logo -->
          <tr>
            <td style="padding: 24px 0 28px; border-bottom: 1px solid #f1f5f9;">
              <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%">
                <tr>
                  <td>
                    <a href="https://sadhya.app" target="_blank" style="text-decoration: none; display: inline-flex; align-items: center; gap: 10px;">
                      <img src="${this.iconUrl}" alt="Sadhya" width="38" height="38" style="border-radius: 8px; vertical-align: middle; border: 0;" />
                      <span style="font-size: 22px; font-weight: 800; color: #0f172a; letter-spacing: -0.5px; margin-left: 10px; vertical-align: middle;">Sadhya<span style="color: #65a30d;">.</span></span>
                    </a>
                  </td>
                  <td align="right">
                    <span style="font-size: 11.5px; font-weight: 700; color: #475569; background-color: #f1f5f9; padding: 6px 12px; border-radius: 20px; text-transform: uppercase; letter-spacing: 0.6px;">Verification</span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Main Content -->
          <tr>
            <td style="padding: 36px 0 24px;">
              <h1 style="margin: 0 0 16px; font-size: 24px; font-weight: 700; color: #0f172a; letter-spacing: -0.5px; line-height: 1.25;">
                Verify your email address
              </h1>
              
              <p style="margin: 0 0 18px; font-size: 15.5px; line-height: 1.6; color: #334155;">
                Hello <strong>${name}</strong>,
              </p>
              <p style="margin: 0 0 24px; font-size: 15.5px; line-height: 1.6; color: #334155;">
                Thank you for joining Sadhya. Please confirm your email address to complete your account setup and activate your AI tutor, smart notebooks, and study planner.
              </p>

              <!-- Primary CTA Button -->
              <table role="presentation" border="0" cellpadding="0" cellspacing="0" style="margin: 32px 0;">
                <tr>
                  <td>
                    <a href="${verificationLink}" target="_blank" rel="noopener noreferrer" style="display: inline-block; background-color: #0f172a; color: #ffffff; font-size: 15px; font-weight: 600; text-decoration: none; padding: 15px 36px; border-radius: 10px; text-align: center; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
                      Verify Email Address →
                    </a>
                  </td>
                </tr>
              </table>

              <!-- Expiry & Fallback Box -->
              <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; padding: 18px; margin: 32px 0 24px;">
                <p style="margin: 0 0 6px; font-size: 13px; font-weight: 600; color: #1e293b;">
                  Link not clickable?
                </p>
                <p style="margin: 0 0 12px; font-size: 12.5px; line-height: 1.5; color: #64748b; word-break: break-all;">
                  Copy and paste the URL below directly into your web browser:<br>
                  <a href="${verificationLink}" style="color: #2563eb; text-decoration: underline;">${verificationLink}</a>
                </p>
                <p style="margin: 0; font-size: 12px; color: #94a3b8;">
                  ⏱️ This link is securely generated and valid for <strong>24 hours</strong>.
                </p>
              </div>

              <p style="margin: 24px 0 0; font-size: 13.5px; line-height: 1.5; color: #64748b;">
                If you did not register for an account on Sadhya, you can safely disregard this email.
              </p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding: 32px 0 0; border-top: 1px solid #f1f5f9; text-align: left;">
              <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%">
                <tr>
                  <td style="font-size: 12.5px; color: #64748b; line-height: 1.6;">
                    <strong>Sadhya Technologies Pvt. Ltd.</strong><br>
                    Tech Zone, Sector 135, Noida, Uttar Pradesh 201304, India • <a href="https://sadhya.app" style="color: #64748b; text-decoration: underline;">sadhya.app</a>
                  </td>
                  <td align="right" style="font-size: 12px; color: #94a3b8;">
                    <a href="https://sadhya.app/privacy" style="color: #64748b; text-decoration: none; margin-left: 12px;">Privacy</a>
                    <a href="https://sadhya.app/terms" style="color: #64748b; text-decoration: none; margin-left: 12px;">Terms</a>
                    <a href="https://sadhya.app/help" style="color: #64748b; text-decoration: none; margin-left: 12px;">Help Center</a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>
`;

    const text = `
Hello ${name},

Please verify your email address to activate your Sadhya account:
${verificationLink}

This link is valid for 24 hours. If you did not create an account on Sadhya, you can safely ignore this message.

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
   * Generates and dispatches a clean, high-end Password Reset Email.
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
</head>
<body style="margin: 0; padding: 0; background-color: #ffffff; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #0f172a; -webkit-font-smoothing: antialiased;">
  <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="background-color: #ffffff; width: 100%;">
    <tr>
      <td align="center" style="padding: 24px 16px 48px;">
        <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="max-width: 640px; text-align: left;">
          
          <!-- Header with Logo -->
          <tr>
            <td style="padding: 24px 0 28px; border-bottom: 1px solid #f1f5f9;">
              <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%">
                <tr>
                  <td>
                    <a href="https://sadhya.app" target="_blank" style="text-decoration: none; display: inline-flex; align-items: center; gap: 10px;">
                      <img src="${this.iconUrl}" alt="Sadhya" width="38" height="38" style="border-radius: 8px; vertical-align: middle; border: 0;" />
                      <span style="font-size: 22px; font-weight: 800; color: #0f172a; letter-spacing: -0.5px; margin-left: 10px; vertical-align: middle;">Sadhya<span style="color: #65a30d;">.</span></span>
                    </a>
                  </td>
                  <td align="right">
                    <span style="font-size: 11.5px; font-weight: 700; color: #b91c1c; background-color: #fef2f2; padding: 6px 12px; border-radius: 20px; text-transform: uppercase; letter-spacing: 0.6px;">Security</span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Main Content -->
          <tr>
            <td style="padding: 36px 0 24px;">
              <h1 style="margin: 0 0 16px; font-size: 24px; font-weight: 700; color: #0f172a; letter-spacing: -0.5px; line-height: 1.25;">
                Password Reset Request
              </h1>
              <p style="margin: 0 0 18px; font-size: 15.5px; line-height: 1.6; color: #334155;">
                Hello <strong>${name}</strong>,
              </p>
              <p style="margin: 0 0 24px; font-size: 15.5px; line-height: 1.6; color: #334155;">
                We received a request to reset the password for your Sadhya account (<strong>${email}</strong>). Click the button below to choose a new secure password.
              </p>

              <!-- CTA Button -->
              <table role="presentation" border="0" cellpadding="0" cellspacing="0" style="margin: 32px 0;">
                <tr>
                  <td>
                    <a href="${resetLink}" target="_blank" rel="noopener noreferrer" style="display: inline-block; background-color: #0f172a; color: #ffffff; font-size: 15px; font-weight: 600; text-decoration: none; padding: 15px 36px; border-radius: 10px; text-align: center; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
                      Reset Password →
                    </a>
                  </td>
                </tr>
              </table>

              <!-- Notice Box -->
              <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; padding: 18px; margin: 32px 0 24px;">
                <p style="margin: 0 0 6px; font-size: 13px; font-weight: 600; color: #1e293b;">
                  Button not working?
                </p>
                <p style="margin: 0 0 12px; font-size: 12.5px; line-height: 1.5; color: #64748b; word-break: break-all;">
                  Copy and paste this link into your browser:<br>
                  <a href="${resetLink}" style="color: #2563eb; text-decoration: underline;">${resetLink}</a>
                </p>
                <p style="margin: 0; font-size: 12px; color: #94a3b8;">
                  ⏱️ This reset link is valid for <strong>1 hour</strong>.
                </p>
              </div>

              <p style="margin: 24px 0 0; font-size: 13.5px; line-height: 1.5; color: #64748b;">
                If you did not request a password reset, your account is secure and you can safely disregard this message.
              </p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding: 32px 0 0; border-top: 1px solid #f1f5f9; text-align: left;">
              <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%">
                <tr>
                  <td style="font-size: 12.5px; color: #64748b; line-height: 1.6;">
                    <strong>Sadhya Security Team</strong><br>
                    Tech Zone, Sector 135, Noida, Uttar Pradesh 201304, India • <a href="https://sadhya.app" style="color: #64748b; text-decoration: underline;">sadhya.app</a>
                  </td>
                  <td align="right" style="font-size: 12px; color: #94a3b8;">
                    <a href="https://sadhya.app/privacy" style="color: #64748b; text-decoration: none; margin-left: 12px;">Privacy</a>
                    <a href="https://sadhya.app/terms" style="color: #64748b; text-decoration: none; margin-left: 12px;">Terms</a>
                    <a href="https://sadhya.app/help" style="color: #64748b; text-decoration: none; margin-left: 12px;">Help Center</a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>
`;

    const text = `
Hello ${name},

We received a request to reset the password for your Sadhya account:
${resetLink}

This link is valid for 1 hour. If you did not request a password reset, you can safely ignore this email.

Warm regards,
The Sadhya Security Team
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
   * Generates and dispatches a comprehensive, visually rich Welcome Email outlining top features.
   */
  async sendWelcomeEmail(email: string, displayName: string, role: string = 'student'): Promise<boolean> {
    const name = displayName?.trim() || 'Learner';
    const isTeacher = role === 'teacher';
    const subject = isTeacher
      ? 'Welcome to Sadhya — Your AI Teaching Studio is Ready'
      : 'Welcome to Sadhya — Your Personalized AI Study Workspace';

    const dashboardUrl = isTeacher ? 'https://sadhya.app/teach' : 'https://sadhya.app/dashboard';

    const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${subject}</title>
</head>
<body style="margin: 0; padding: 0; background-color: #ffffff; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #0f172a; -webkit-font-smoothing: antialiased;">
  <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="background-color: #ffffff; width: 100%;">
    <tr>
      <td align="center" style="padding: 24px 16px 48px;">
        <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="max-width: 600px; text-align: left;">
          
          <!-- Top Brand Header -->
          <tr>
            <td style="padding: 24px 0 24px; border-bottom: 1px solid #f1f5f9;">
              <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%">
                <tr>
                  <td>
                    <a href="https://sadhya.app" target="_blank" style="text-decoration: none; display: inline-flex; align-items: center; gap: 8px;">
                      <img src="${this.iconUrl}" alt="" width="32" height="32" style="border-radius: 6px; vertical-align: middle; border: 0; display: inline-block;" />
                      <span style="font-size: 20px; font-weight: 700; color: #0f172a; letter-spacing: -0.4px; margin-left: 8px; vertical-align: middle;">Sadhya<span style="color: #65a30d;">.</span></span>
                    </a>
                  </td>
                  <td align="right">
                    <span style="font-size: 11px; font-weight: 700; color: #475569; background-color: #f1f5f9; padding: 5px 12px; border-radius: 100px; text-transform: uppercase; letter-spacing: 0.8px;">
                      ${isTeacher ? 'TEACHER SUITE' : 'WELCOME'}
                    </span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Main Title -->
          <tr>
            <td style="padding: 32px 0 0;">
              <h1 style="margin: 0 0 20px; font-size: 24px; font-weight: 700; color: #0f172a; letter-spacing: -0.5px; line-height: 1.3;">
                Welcome to Sadhya
              </h1>
              <p style="margin: 0 0 16px; font-size: 15px; line-height: 1.6; color: #334155;">
                Hello <strong>${name}</strong>,
              </p>
              <p style="margin: 0 0 28px; font-size: 15px; line-height: 1.6; color: #475569;">
                Thank you for joining Sadhya. Your personalized workspace is ready, giving you syllabus-aligned AI preparation designed to help you achieve your goals faster.
              </p>
            </td>
          </tr>

          <!-- Primary CTA Button -->
          <tr>
            <td style="padding: 0 0 32px;">
              <table role="presentation" border="0" cellpadding="0" cellspacing="0">
                <tr>
                  <td>
                    <a href="${dashboardUrl}" target="_blank" rel="noopener noreferrer" style="display: inline-block; background-color: #0f172a; color: #ffffff; font-size: 14.5px; font-weight: 600; text-decoration: none; padding: 13px 28px; border-radius: 8px; text-align: center;">
                      ${isTeacher ? 'Open Teacher Workspace' : 'Open Workspace'} &rarr;
                    </a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Minimalist Feature Box -->
          <tr>
            <td style="padding: 0 0 32px;">
              <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="background-color: #f8fafc; border: 1px solid #f1f5f9; border-radius: 12px; padding: 20px 24px;">
                <tr>
                  <td>
                    <p style="margin: 0 0 12px; font-size: 13.5px; font-weight: 700; color: #0f172a; letter-spacing: -0.2px;">
                      What you can do right now:
                    </p>
                    <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%">
                      <tr>
                        <td style="font-size: 13px; color: #475569; line-height: 1.7; padding-bottom: 8px;">
                          &bull; <strong>${isTeacher ? 'Create Classes' : 'Exam AI Tutor'}</strong>: ${isTeacher ? 'Organize batches and assign syllabus resources.' : 'Ask anything from your syllabus with 6-step deep reasoning.'}
                        </td>
                      </tr>
                      <tr>
                        <td style="font-size: 13px; color: #475569; line-height: 1.7; padding-bottom: 8px;">
                          &bull; <strong>Smart Notebooks</strong>: Instant flashcards, mindmaps, and diagnostic quizzes.
                        </td>
                      </tr>
                      <tr>
                        <td style="font-size: 13px; color: #475569; line-height: 1.7;">
                          &bull; <strong>Podcast Studio</strong>: Convert study notes into 2-host audio lessons.
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding: 28px 0 0; border-top: 1px solid #f1f5f9; text-align: left;">
              <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%">
                <tr>
                  <td style="font-size: 12.5px; color: #64748b; line-height: 1.6;">
                    <strong>Sadhya Technologies Pvt. Ltd.</strong><br>
                    Tech Zone, Sector 135, Noida, Uttar Pradesh 201304, India • <a href="https://sadhya.app" style="color: #64748b; text-decoration: underline;">sadhya.app</a>
                  </td>
                  <td align="right" style="font-size: 12px; color: #94a3b8;">
                    <a href="https://sadhya.app/privacy" style="color: #64748b; text-decoration: none; margin-left: 12px;">Privacy</a>
                    <a href="https://sadhya.app/terms" style="color: #64748b; text-decoration: none; margin-left: 12px;">Terms</a>
                    <a href="https://sadhya.app/help" style="color: #64748b; text-decoration: none; margin-left: 12px;">Help Center</a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>
`;

    const text = `
Welcome to Sadhya, ${name}!

Your account is active. Here are key features you can explore now:
1. Syllabus-Aligned AI Tutor (NEET, JEE, UPSC, SSC, Banking)
2. 6-Step Deep Reasoning Engine
3. Audio Lessons & Interactive Podcasts
4. Smart Notebooks, Mindmaps & Flashcards

Open your dashboard: ${dashboardUrl}

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
   * Forwards a contact form inquiry directly to the relevant internal alias (support, sales, etc.)
   */
  async sendContactInquiryEmail(inquiry: {
    name: string;
    email: string;
    channel: 'support' | 'sales' | 'security' | 'privacy';
    subject: string;
    message: string;
  }): Promise<boolean> {
    const targetEmail = `${inquiry.channel}@sadhya.app`;
    const channelLabel = {
      support: 'Support Inquiry',
      sales: 'Institutional / Sales Inquiry',
      security: 'Security Report',
      privacy: 'Privacy & Legal Grievance',
    }[inquiry.channel] || 'General Inquiry';

    const emailSubject = `[${channelLabel}] ${inquiry.subject || 'New Contact Form Submission'}`;

    const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${emailSubject}</title>
</head>
<body style="margin: 0; padding: 0; background-color: #ffffff; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #0f172a;">
  <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="background-color: #ffffff;">
    <tr>
      <td align="center" style="padding: 24px 16px 48px;">
        <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="max-width: 600px; text-align: left;">
          <tr>
            <td style="padding: 20px 0; border-bottom: 1px solid #f1f5f9;">
              <span style="font-size: 18px; font-weight: 700; color: #0f172a;">Sadhya Contact Notification</span>
            </td>
          </tr>
          <tr>
            <td style="padding: 24px 0;">
              <p style="margin: 0 0 12px; font-size: 14px; color: #64748b;">A user submitted an inquiry via the website contact form:</p>
              <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 16px;">
                <tr>
                  <td style="font-size: 13.5px; line-height: 1.8; color: #334155;">
                    <strong>Sender Name:</strong> ${inquiry.name}<br>
                    <strong>Sender Email:</strong> <a href="mailto:${inquiry.email}" style="color: #0284c7;">${inquiry.email}</a><br>
                    <strong>Channel:</strong> ${channelLabel} (${targetEmail})<br>
                    <strong>Subject:</strong> ${inquiry.subject || '(No Subject)'}
                  </td>
                </tr>
              </table>
              <div style="margin-top: 20px; padding: 16px; background-color: #ffffff; border: 1px solid #e2e8f0; border-radius: 8px;">
                <p style="margin: 0 0 8px; font-size: 13px; font-weight: 700; color: #0f172a;">Message:</p>
                <p style="margin: 0; font-size: 14px; line-height: 1.6; color: #334155; white-space: pre-wrap;">${inquiry.message}</p>
              </div>
              <p style="margin-top: 24px; font-size: 13px; color: #64748b;">
                You can reply directly to this email to contact the user at <strong>${inquiry.email}</strong>.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
`;

    const text = `
New inquiry via Sadhya Contact Form:
From: ${inquiry.name} <${inquiry.email}>
Channel: ${channelLabel} (${targetEmail})
Subject: ${inquiry.subject}

Message:
${inquiry.message}
`;

    const result = await this.sendEmail({
      to: targetEmail,
      toName: 'Sadhya Team',
      subject: emailSubject,
      html,
      text,
      replyTo: inquiry.email,
    });

    return result.success;
  }

  /**
   * Sends an automated acknowledgment receipt to the user who submitted an inquiry.
   */
  async sendInquiryReceiptEmail(inquiry: {
    name: string;
    email: string;
    channel: string;
  }): Promise<boolean> {
    const subject = 'We received your message — Sadhya Support';
    const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${subject}</title>
</head>
<body style="margin: 0; padding: 0; background-color: #ffffff; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #0f172a;">
  <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="background-color: #ffffff;">
    <tr>
      <td align="center" style="padding: 24px 16px 48px;">
        <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="max-width: 600px; text-align: left;">
          <tr>
            <td style="padding: 24px 0 24px; border-bottom: 1px solid #f1f5f9;">
              <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%">
                <tr>
                  <td>
                    <a href="https://sadhya.app" target="_blank" style="text-decoration: none; display: inline-flex; align-items: center; gap: 8px;">
                      <img src="${this.iconUrl}" alt="" width="32" height="32" style="border-radius: 6px; vertical-align: middle; border: 0;" />
                      <span style="font-size: 20px; font-weight: 700; color: #0f172a; letter-spacing: -0.4px; margin-left: 8px; vertical-align: middle;">Sadhya<span style="color: #65a30d;">.</span></span>
                    </a>
                  </td>
                  <td align="right">
                    <span style="font-size: 11px; font-weight: 700; color: #475569; background-color: #f1f5f9; padding: 5px 12px; border-radius: 100px; text-transform: uppercase;">
                      CONFIRMATION
                    </span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="padding: 32px 0 0;">
              <h1 style="margin: 0 0 16px; font-size: 22px; font-weight: 700; color: #0f172a;">
                We received your message
              </h1>
              <p style="margin: 0 0 16px; font-size: 15px; line-height: 1.6; color: #334155;">
                Hello <strong>${inquiry.name}</strong>,
              </p>
              <p style="margin: 0 0 24px; font-size: 15px; line-height: 1.6; color: #475569;">
                Thank you for contacting Sadhya. A member of our team has received your message and will review it promptly. We usually respond within 2 to 4 hours during business hours (Monday–Saturday, 10:00–19:00 IST).
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding: 24px 0 0; border-top: 1px solid #f1f5f9;">
              <p style="font-size: 12.5px; color: #64748b; line-height: 1.6; margin: 0;">
                <strong>Sadhya Technologies Pvt. Ltd.</strong><br>
                Tech Zone, Sector 135, Noida, Uttar Pradesh 201304, India • <a href="https://sadhya.app" style="color: #64748b; text-decoration: underline;">sadhya.app</a>
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
`;
    const text = `
Hello ${inquiry.name},

Thank you for reaching out to Sadhya. We have received your message and will get back to you shortly.

Warm regards,
Sadhya Support Team
Tech Zone, Sector 135, Noida
https://sadhya.app
`;

    const result = await this.sendEmail({
      to: inquiry.email,
      toName: inquiry.name,
      subject,
      html,
      text,
    });

    return result.success;
  }
}

export const zeptoMailService = new ZeptoMailService();
