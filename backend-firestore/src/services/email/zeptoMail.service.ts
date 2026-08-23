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
   * Primary dispatcher: Tries ZeptoMail REST API first, then SMTP fallback.
   */
  async sendEmail(options: EmailOptions): Promise<{ success: boolean; messageId?: string; error?: string }> {
    const fromAddress = env.ZEPTO_FROM_EMAIL || 'noreply@sadhya.app';
    const fromName = env.ZEPTO_FROM_NAME || 'Sadhya';

    // 1. Try ZeptoMail REST API
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
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${subject}</title>
</head>
<body style="margin: 0; padding: 0; background-color: #f8fafc; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #1e293b; -webkit-font-smoothing: antialiased;">
  <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="background-color: #f8fafc; padding: 40px 15px;">
    <tr>
      <td align="center">
        <!-- Main Card -->
        <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="max-width: 580px; background-color: #ffffff; border: 1px solid #e2e8f0; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05);">
          <!-- Header -->
          <tr>
            <td style="padding: 36px 40px 24px; border-bottom: 1px solid #f1f5f9; text-align: left;">
              <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%">
                <tr>
                  <td>
                    <span style="font-size: 24px; font-weight: 800; color: #0f172a; letter-spacing: -0.5px; text-decoration: none;">
                      Sadhya<span style="color: #65a30d;">.</span>
                    </span>
                  </td>
                  <td align="right">
                    <span style="font-size: 12px; font-weight: 600; color: #64748b; background-color: #f1f5f9; padding: 4px 10px; border-radius: 20px; text-transform: uppercase; letter-spacing: 0.5px;">Account Verification</span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Body Content -->
          <tr>
            <td style="padding: 36px 40px 40px;">
              <h1 style="margin: 0 0 16px; font-size: 20px; font-weight: 700; color: #0f172a; line-height: 1.3;">
                Confirm your email address
              </h1>
              <p style="margin: 0 0 20px; font-size: 15px; line-height: 1.6; color: #475569;">
                Hello <strong>${name}</strong>,
              </p>
              <p style="margin: 0 0 28px; font-size: 15px; line-height: 1.6; color: #475569;">
                Thank you for joining Sadhya. Please verify your email address to activate your account and access your AI tutor, smart notebooks, and practice engine.
              </p>

              <!-- CTA Button -->
              <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="margin: 32px 0;">
                <tr>
                  <td align="left">
                    <a href="${verificationLink}" target="_blank" rel="noopener noreferrer" style="display: inline-block; background-color: #0f172a; color: #ffffff; font-size: 15px; font-weight: 600; text-decoration: none; padding: 14px 32px; border-radius: 10px; text-align: center;">
                      Verify Email Address
                    </a>
                  </td>
                </tr>
              </table>

              <!-- Notice Box -->
              <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 10px; padding: 16px; margin-top: 28px;">
                <p style="margin: 0 0 8px; font-size: 13px; font-weight: 600; color: #334155;">
                  Button not working?
                </p>
                <p style="margin: 0; font-size: 12.5px; line-height: 1.5; color: #64748b; word-break: break-all;">
                  Copy and paste this link into your browser:<br>
                  <a href="${verificationLink}" style="color: #2563eb; text-decoration: underline;">${verificationLink}</a>
                </p>
              </div>

              <p style="margin: 28px 0 0; font-size: 13.5px; color: #64748b; line-height: 1.5;">
                This verification link is valid for <strong>24 hours</strong>. If you did not create a Sadhya account, you can safely ignore this email.
              </p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding: 24px 40px; background-color: #f8fafc; border-top: 1px solid #e2e8f0; text-align: left;">
              <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%">
                <tr>
                  <td style="font-size: 12.5px; color: #64748b; line-height: 1.6;">
                    <strong>Sadhya Technologies Pvt. Ltd.</strong><br>
                    Bengaluru, Karnataka, India • <a href="https://sadhya.app" style="color: #64748b; text-decoration: underline;">sadhya.app</a>
                  </td>
                  <td align="right" style="font-size: 12px; color: #94a3b8;">
                    <a href="https://sadhya.app/privacy" style="color: #64748b; text-decoration: none; margin-left: 10px;">Privacy</a>
                    <a href="https://sadhya.app/terms" style="color: #64748b; text-decoration: none; margin-left: 10px;">Terms</a>
                    <a href="https://sadhya.app/help" style="color: #64748b; text-decoration: none; margin-left: 10px;">Help</a>
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
    const subject = 'Reset your Sadhya password';

    const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${subject}</title>
</head>
<body style="margin: 0; padding: 0; background-color: #f8fafc; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #1e293b; -webkit-font-smoothing: antialiased;">
  <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="background-color: #f8fafc; padding: 40px 15px;">
    <tr>
      <td align="center">
        <!-- Main Card -->
        <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="max-width: 580px; background-color: #ffffff; border: 1px solid #e2e8f0; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05);">
          <!-- Header -->
          <tr>
            <td style="padding: 36px 40px 24px; border-bottom: 1px solid #f1f5f9; text-align: left;">
              <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%">
                <tr>
                  <td>
                    <span style="font-size: 24px; font-weight: 800; color: #0f172a; letter-spacing: -0.5px; text-decoration: none;">
                      Sadhya<span style="color: #65a30d;">.</span>
                    </span>
                  </td>
                  <td align="right">
                    <span style="font-size: 12px; font-weight: 600; color: #b91c1c; background-color: #fef2f2; padding: 4px 10px; border-radius: 20px; text-transform: uppercase; letter-spacing: 0.5px;">Security Alert</span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Body Content -->
          <tr>
            <td style="padding: 36px 40px 40px;">
              <h1 style="margin: 0 0 16px; font-size: 20px; font-weight: 700; color: #0f172a; line-height: 1.3;">
                Password Reset Request
              </h1>
              <p style="margin: 0 0 20px; font-size: 15px; line-height: 1.6; color: #475569;">
                Hello <strong>${name}</strong>,
              </p>
              <p style="margin: 0 0 28px; font-size: 15px; line-height: 1.6; color: #475569;">
                We received a request to reset the password for your Sadhya account (<strong>${email}</strong>). Click the button below to choose a new password.
              </p>

              <!-- CTA Button -->
              <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="margin: 32px 0;">
                <tr>
                  <td align="left">
                    <a href="${resetLink}" target="_blank" rel="noopener noreferrer" style="display: inline-block; background-color: #0f172a; color: #ffffff; font-size: 15px; font-weight: 600; text-decoration: none; padding: 14px 32px; border-radius: 10px; text-align: center;">
                      Reset Your Password
                    </a>
                  </td>
                </tr>
              </table>

              <!-- Notice Box -->
              <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 10px; padding: 16px; margin-top: 28px;">
                <p style="margin: 0 0 8px; font-size: 13px; font-weight: 600; color: #334155;">
                  Button not working?
                </p>
                <p style="margin: 0; font-size: 12.5px; line-height: 1.5; color: #64748b; word-break: break-all;">
                  Copy and paste this link into your browser:<br>
                  <a href="${resetLink}" style="color: #2563eb; text-decoration: underline;">${resetLink}</a>
                </p>
              </div>

              <p style="margin: 28px 0 0; font-size: 13.5px; color: #64748b; line-height: 1.5;">
                This password reset link is valid for <strong>1 hour</strong>. If you did not request a password reset, your account is safe and you can disregard this email.
              </p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding: 24px 40px; background-color: #f8fafc; border-top: 1px solid #e2e8f0; text-align: left;">
              <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%">
                <tr>
                  <td style="font-size: 12.5px; color: #64748b; line-height: 1.6;">
                    <strong>Sadhya Security Team</strong><br>
                    Bengaluru, Karnataka, India • <a href="https://sadhya.app" style="color: #64748b; text-decoration: underline;">sadhya.app</a>
                  </td>
                  <td align="right" style="font-size: 12px; color: #94a3b8;">
                    <a href="https://sadhya.app/privacy" style="color: #64748b; text-decoration: none; margin-left: 10px;">Privacy</a>
                    <a href="https://sadhya.app/terms" style="color: #64748b; text-decoration: none; margin-left: 10px;">Terms</a>
                    <a href="https://sadhya.app/help" style="color: #64748b; text-decoration: none; margin-left: 10px;">Help</a>
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
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${subject}</title>
</head>
<body style="margin: 0; padding: 0; background-color: #f8fafc; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #1e293b; -webkit-font-smoothing: antialiased;">
  <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="background-color: #f8fafc; padding: 40px 15px;">
    <tr>
      <td align="center">
        <!-- Main Card -->
        <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="max-width: 600px; background-color: #ffffff; border: 1px solid #e2e8f0; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05);">
          
          <!-- Header Hero -->
          <tr>
            <td style="padding: 40px 40px 30px; background-color: #0f172a; text-align: left;">
              <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%">
                <tr>
                  <td>
                    <span style="font-size: 26px; font-weight: 800; color: #ffffff; letter-spacing: -0.5px;">
                      Sadhya<span style="color: #c8e558;">.</span>
                    </span>
                  </td>
                  <td align="right">
                    <span style="font-size: 11.5px; font-weight: 700; color: #0f172a; background-color: #c8e558; padding: 5px 12px; border-radius: 20px; text-transform: uppercase; letter-spacing: 0.5px;">
                      ${isTeacher ? 'Teacher Suite' : 'AI Learning Platform'}
                    </span>
                  </td>
                </tr>
              </table>

              <h1 style="margin: 28px 0 10px; font-size: 22px; font-weight: 700; color: #ffffff; line-height: 1.3;">
                Welcome to the future of learning, ${name}! 🚀
              </h1>
              <p style="margin: 0; font-size: 14.5px; line-height: 1.6; color: #94a3b8;">
                Your account is active. Explore what you can achieve with Sadhya starting today:
              </p>
            </td>
          </tr>

          <!-- Feature Cards Grid -->
          <tr>
            <td style="padding: 32px 40px 24px;">
              <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%">
                
                <!-- Feature 1 -->
                <tr>
                  <td style="padding: 16px 0; border-bottom: 1px solid #f1f5f9;">
                    <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%">
                      <tr>
                        <td width="42" valign="top" style="padding-top: 2px;">
                          <div style="width: 32px; height: 32px; border-radius: 8px; background-color: #f1f5f9; text-align: center; line-height: 32px; font-size: 16px;">
                            🎯
                          </div>
                        </td>
                        <td style="padding-left: 12px;">
                          <h3 style="margin: 0 0 4px; font-size: 15px; font-weight: 600; color: #0f172a;">
                            ${isTeacher ? 'Classroom Cohorts & Assignments' : 'Exam-Specific AI Tutor'}
                          </h3>
                          <p style="margin: 0; font-size: 13.5px; line-height: 1.5; color: #64748b;">
                            ${isTeacher ? 'Create structured batches, share interactive resources, and track student mastery in real time.' : 'Syllabus-aligned preparation covering NEET, JEE, UPSC CSE, SSC CGL, Banking, and State Board exams.'}
                          </p>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>

                <!-- Feature 2 -->
                <tr>
                  <td style="padding: 16px 0; border-bottom: 1px solid #f1f5f9;">
                    <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%">
                      <tr>
                        <td width="42" valign="top" style="padding-top: 2px;">
                          <div style="width: 32px; height: 32px; border-radius: 8px; background-color: #f1f5f9; text-align: center; line-height: 32px; font-size: 16px;">
                            ⚡
                          </div>
                        </td>
                        <td style="padding-left: 12px;">
                          <h3 style="margin: 0 0 4px; font-size: 15px; font-weight: 600; color: #0f172a;">
                            6-Step Deep Reasoning Engine
                          </h3>
                          <p style="margin: 0; font-size: 13.5px; line-height: 1.5; color: #64748b;">
                            Never settle for just the final answer. Understand every problem through first-principles breakdown, formula recall, and mistake prevention.
                          </p>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>

                <!-- Feature 3 -->
                <tr>
                  <td style="padding: 16px 0; border-bottom: 1px solid #f1f5f9;">
                    <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%">
                      <tr>
                        <td width="42" valign="top" style="padding-top: 2px;">
                          <div style="width: 32px; height: 32px; border-radius: 8px; background-color: #f1f5f9; text-align: center; line-height: 32px; font-size: 16px;">
                            🎙️
                          </div>
                        </td>
                        <td style="padding-left: 12px;">
                          <h3 style="margin: 0 0 4px; font-size: 15px; font-weight: 600; color: #0f172a;">
                            Audio Lessons & Podcast Studio
                          </h3>
                          <p style="margin: 0; font-size: 13.5px; line-height: 1.5; color: #64748b;">
                            Convert textbook chapters, PDF notes, or lecture concepts into cinematic 2-host audio podcasts you can listen to on the go.
                          </p>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>

                <!-- Feature 4 -->
                <tr>
                  <td style="padding: 16px 0;">
                    <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%">
                      <tr>
                        <td width="42" valign="top" style="padding-top: 2px;">
                          <div style="width: 32px; height: 32px; border-radius: 8px; background-color: #f1f5f9; text-align: center; line-height: 32px; font-size: 16px;">
                            📝
                          </div>
                        </td>
                        <td style="padding-left: 12px;">
                          <h3 style="margin: 0 0 4px; font-size: 15px; font-weight: 600; color: #0f172a;">
                            Smart Notebooks & Diagnostic Tests
                          </h3>
                          <p style="margin: 0; font-size: 13.5px; line-height: 1.5; color: #64748b;">
                            Generate mindmaps, flashcards, and adaptive diagnostic tests that pinpoint and reinforce your weak areas.
                          </p>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>

              </table>

              <!-- Main Action Button -->
              <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="margin: 32px 0 16px;">
                <tr>
                  <td align="center">
                    <a href="${dashboardUrl}" target="_blank" rel="noopener noreferrer" style="display: block; background-color: #0f172a; color: #ffffff; font-size: 15px; font-weight: 600; text-decoration: none; padding: 15px 32px; border-radius: 10px; text-align: center;">
                      ${isTeacher ? 'Open Teacher Workspace' : 'Open My Dashboard & Start Learning'} →
                    </a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding: 24px 40px; background-color: #f8fafc; border-top: 1px solid #e2e8f0; text-align: left;">
              <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%">
                <tr>
                  <td style="font-size: 12.5px; color: #64748b; line-height: 1.6;">
                    <strong>Sadhya Technologies Pvt. Ltd.</strong><br>
                    Bengaluru, Karnataka, India • <a href="https://sadhya.app" style="color: #64748b; text-decoration: underline;">sadhya.app</a>
                  </td>
                  <td align="right" style="font-size: 12px; color: #94a3b8;">
                    <a href="https://sadhya.app/privacy" style="color: #64748b; text-decoration: none; margin-left: 10px;">Privacy</a>
                    <a href="https://sadhya.app/terms" style="color: #64748b; text-decoration: none; margin-left: 10px;">Terms</a>
                    <a href="https://sadhya.app/help" style="color: #64748b; text-decoration: none; margin-left: 10px;">Help</a>
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
}

export const zeptoMailService = new ZeptoMailService();
