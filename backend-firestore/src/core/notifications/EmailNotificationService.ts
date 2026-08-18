import nodemailer from 'nodemailer';
import { NotificationPayload } from './NotificationEngine';
import { logger } from '../../utils/logger';
import { connectionRepository } from '../../repositories/connection.repository';
import { env } from '../../config/env';

export class EmailNotificationService {
  private transporter: nodemailer.Transporter;

  private isInitialized = false;

  constructor() {
    if (env.SMTP_HOST && env.SMTP_USER && env.SMTP_PASS) {
      const port = env.SMTP_PORT ? parseInt(env.SMTP_PORT, 10) : 587;
      const secure = env.SMTP_SECURE === 'true' || port === 465;
      
      this.transporter = nodemailer.createTransport({
        host: env.SMTP_HOST,
        port: port,
        secure: secure,
        auth: {
          user: env.SMTP_USER,
          pass: env.SMTP_PASS
        }
      });
      this.isInitialized = true;
      logger.info(`[EmailService] Initialized production SMTP transporter: ${env.SMTP_HOST}`);
    } else {
      this.transporter = nodemailer.createTransport({
        host: 'smtp.ethereal.email',
        port: 587,
        auth: {
          user: 'mock_user@ethereal.email',
          pass: 'mock_password'
        }
      });
    }
  }

  private async ensureInitialized() {
    if (this.isInitialized) return;
    const isDummy = (this.transporter.options as any).auth?.user === 'mock_user@ethereal.email';
    if (isDummy) {
      try {
        const testAccount = await nodemailer.createTestAccount();
        this.transporter = nodemailer.createTransport({
          host: 'smtp.ethereal.email',
          port: 587,
          secure: false,
          auth: {
            user: testAccount.user,
            pass: testAccount.pass
          }
        });
        logger.info(`[EmailService] Dynamically initialized Ethereal SMTP test account: ${testAccount.user}`);
      } catch (e: any) {
        logger.error('[EmailService] Failed to create dynamic Ethereal test account', e);
      }
    }
    this.isInitialized = true;
  }

  /**
   * Instantly sends an email for critical alerts.
   */
  async sendCriticalAlert(payload: NotificationPayload): Promise<void> {
    try {
      await this.ensureInitialized();
      // Look up user's email via connectionRepository or userProfileService
      const user = await connectionRepository.getDirectory(payload.userId);
      if (!user?.email) {
        logger.warn(`[EmailService] Cannot send critical email to ${payload.userId} (no email found)`);
        return;
      }

      const mailOptions = {
        from: env.SMTP_FROM || '"Sadhya Alerts" <alerts@sadhya.app>',
        to: user.email,
        subject: `[Critical] ${payload.title}`,
        text: `${payload.body}\n\nAction required: ${payload.actionUrl || 'Log in to Sadhya.'}`,
        html: `
          <div style="font-family: sans-serif; padding: 20px;">
            <h2 style="color: #e11d48;">${payload.title}</h2>
            <p>${payload.body}</p>
            ${payload.actionUrl ? `<a href="${payload.actionUrl}" style="display: inline-block; padding: 10px 20px; background-color: #4f46e5; color: white; text-decoration: none; border-radius: 5px;">Take Action</a>` : ''}
          </div>
        `
      };

      const info = await this.transporter.sendMail(mailOptions);
      logger.info(`[EmailService] Critical email sent to ${user.email}`);
      const previewUrl = nodemailer.getTestMessageUrl(info);
      if (previewUrl) {
        logger.info(`[EmailService] Ethereal Email Preview URL: ${previewUrl}`);
      }
    } catch (error) {
      logger.error(`[EmailService] Failed to send email to ${payload.userId}`, error);
    }
  }

  /**
   * Sends a batched daily/weekly digest. 
   * Usually invoked by a cron job checking the users' preferences.
   */
  async sendDigest(userId: string, summaries: string[]): Promise<void> {
    try {
      const user = await connectionRepository.getDirectory(userId);
      if (!user?.email) return;

      const mailOptions = {
        from: '"Sadhya Digest" <digest@sadhya.app>',
        to: user.email,
        subject: `Your Sadhya Activity Digest`,
        html: `
          <div style="font-family: sans-serif; padding: 20px;">
            <h2>Here's what you missed</h2>
            <ul>
              ${summaries.map(s => `<li>${s}</li>`).join('\n')}
            </ul>
          </div>
        `
      };

      await this.transporter.sendMail(mailOptions);
      logger.info(`[EmailService] Digest email sent to ${user.email}`);
    } catch (error) {
      logger.error(`[EmailService] Failed to send digest email to ${userId}`, error);
    }
  }
}

export const emailNotificationService = new EmailNotificationService();
