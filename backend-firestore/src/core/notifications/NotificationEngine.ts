import { z } from 'zod';
import { logger } from '../../utils/logger';
import { db } from '../../config/firebase';

// --- Constants & Config ---
export const NOTIFICATION_CONFIG = {
  MAX_TITLE_LENGTH: 100,
  MAX_BODY_LENGTH: 500,
  DEFAULT_PRIORITY: 'low' as const,
  RETRY_MAX_ATTEMPTS: 5,
  RETRY_BACKOFF_MS: 1000,
};

export const NOTIFICATION_CATEGORIES = [
  'learning', 'ai', 'system', 'security', 'social', 'administrative', 
  'subscription', 'payment', 'achievement', 'reminder', 'progress', 'recommendation'
] as const;

export const NOTIFICATION_PRIORITIES = ['critical', 'high', 'medium', 'low', 'silent'] as const;

// --- Types & Models ---
export type NotificationCategory = typeof NOTIFICATION_CATEGORIES[number];
export type NotificationPriority = typeof NOTIFICATION_PRIORITIES[number];

export interface NotificationPayload {
  userId: string;
  category: NotificationCategory;
  type: string;
  title: string;
  body: string;
  priority?: NotificationPriority;
  actionUrl?: string;
  metadata?: Record<string, any>;
  correlationId?: string;
  templateId?: string;
  templateVariables?: Record<string, string>;
}

// --- Validator ---
const NotificationSchema = z.object({
  userId: z.string().min(1),
  category: z.enum(NOTIFICATION_CATEGORIES),
  type: z.string().min(1),
  title: z.string().max(NOTIFICATION_CONFIG.MAX_TITLE_LENGTH),
  body: z.string().max(NOTIFICATION_CONFIG.MAX_BODY_LENGTH),
  priority: z.enum(NOTIFICATION_PRIORITIES).optional(),
  actionUrl: z.string().optional(),
  metadata: z.record(z.any()).optional(),
  correlationId: z.string().optional(),
  templateId: z.string().optional(),
  templateVariables: z.record(z.string()).optional()
});

export class NotificationValidator {
  static validate(payload: any): NotificationPayload {
    return NotificationSchema.parse(payload);
  }
}

// --- Error Handling ---
export class NotificationError extends Error {
  constructor(message: string, public readonly payload?: any) {
    super(message);
    this.name = 'NotificationError';
  }
}

// --- Logger ---
export class NotificationLogger {
  static logCreated(payload: NotificationPayload) {
    logger.info(`[Notification] Created: ${payload.type} for user ${payload.userId}`);
  }
  static logFailed(error: any, payload?: any) {
    logger.error(`[Notification] Failed`, { error: error.message, payload });
  }
}

// --- Analytics ---
export class NotificationAnalytics {
  static async trackDelivered(payload: NotificationPayload) {
    try {
      await db.collection('notification_analytics').add({
        event: 'DELIVERED',
        userId: payload.userId,
        category: payload.category,
        type: payload.type,
        priority: payload.priority || 'low',
        timestamp: Date.now()
      });
    } catch (e) {
      logger.error('[NotificationAnalytics] Failed to track delivery', e);
    }
  }
  
  static async trackFailed(payload: NotificationPayload, reason: string) {
    try {
      await db.collection('notification_analytics').add({
        event: 'FAILED',
        userId: payload.userId,
        category: payload.category,
        type: payload.type,
        reason,
        timestamp: Date.now()
      });
    } catch (e) {
      logger.error('[NotificationAnalytics] Failed to track failure', e);
    }
  }

  static async trackClicked(notificationId: string, actionUrl: string) {
    try {
      await db.collection('notification_analytics').add({
        event: 'CLICKED',
        notificationId,
        actionUrl,
        timestamp: Date.now()
      });
    } catch (e) {
      logger.error('[NotificationAnalytics] Failed to track click', e);
    }
  }

  static async trackSent(payload: NotificationPayload, channel: string, latencyMs: number, costUsd: number) {
    try {
      await db.collection('notification_analytics').add({
        event: 'SENT',
        userId: payload.userId,
        category: payload.category,
        type: payload.type,
        channel,
        latencyMs,
        costUsd,
        timestamp: Date.now()
      });
    } catch (e) {
      logger.error('[NotificationAnalytics] Failed to track sent event', e);
    }
  }

  static async trackRead(notificationId: string, userId: string) {
    try {
      await db.collection('notification_analytics').add({
        event: 'READ',
        notificationId,
        userId,
        timestamp: Date.now()
      });
    } catch (e) {
      logger.error('[NotificationAnalytics] Failed to track read event', e);
    }
  }

  static async trackDismissed(notificationId: string, userId: string) {
    try {
      await db.collection('notification_analytics').add({
        event: 'DISMISSED',
        notificationId,
        userId,
        timestamp: Date.now()
      });
    } catch (e) {
      logger.error('[NotificationAnalytics] Failed to track dismissal', e);
    }
  }

  static async getSystemAnalytics(days: number = 7) {
    const since = Date.now() - (days * 86400000);
    const snapshot = await db.collection('notification_analytics')
      .where('timestamp', '>=', since)
      .get();
      
    let delivered = 0;
    let failed = 0;
    let clicked = 0;
    let read = 0;
    let dismissed = 0;
    let totalCostUsd = 0;
    let totalLatencyMs = 0;
    let latencyCount = 0;

    const spamSuppressed: Record<string, number> = {};
    const categoryVolume: Record<string, number> = {};
    const channelVolume: Record<string, number> = {};

    snapshot.docs.forEach((doc: any) => {
      const data = doc.data();
      if (data.event === 'DELIVERED') {
        delivered++;
        categoryVolume[data.category] = (categoryVolume[data.category] || 0) + 1;
      } else if (data.event === 'FAILED') {
        failed++;
        if (data.reason) {
          spamSuppressed[data.reason] = (spamSuppressed[data.reason] || 0) + 1;
        }
      } else if (data.event === 'CLICKED') {
        clicked++;
      } else if (data.event === 'READ') {
        read++;
      } else if (data.event === 'DISMISSED') {
        dismissed++;
      } else if (data.event === 'SENT') {
        if (typeof data.costUsd === 'number') totalCostUsd += data.costUsd;
        if (typeof data.latencyMs === 'number') {
          totalLatencyMs += data.latencyMs;
          latencyCount++;
        }
        if (data.channel) {
          channelVolume[data.channel] = (channelVolume[data.channel] || 0) + 1;
        }
      }
    });

    return {
      periodDays: days,
      metrics: {
        totalDelivered: delivered,
        totalFailedOrSuppressed: failed,
        totalClicked: clicked,
        totalRead: read,
        totalDismissed: dismissed,
        totalCostUsd: Number(totalCostUsd.toFixed(4)),
        avgLatencyMs: latencyCount > 0 ? Math.round(totalLatencyMs / latencyCount) : 0,
        clickThroughRate: delivered > 0 ? (clicked / delivered * 100).toFixed(2) + '%' : '0%',
      },
      spamSuppression: spamSuppressed,
      deliveryByCategory: categoryVolume,
      deliveryByChannel: channelVolume
    };
  }
}

// --- Factory ---
export class NotificationFactory {
  static createLearningAlert(userId: string, title: string, body: string, actionUrl?: string): NotificationPayload {
    return {
      userId,
      category: 'learning',
      type: 'learning.alert',
      title,
      body,
      priority: 'high',
      actionUrl
    };
  }
  static createSecurityAlert(userId: string, title: string, body: string): NotificationPayload {
    return {
      userId,
      category: 'security',
      type: 'security.alert',
      title,
      body,
      priority: 'critical'
    };
  }
}
