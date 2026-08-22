/**
 * @file MessagingNodes.ts
 * @description In-app, Email, and WhatsApp communication nodes for Scholarly Automation Studio with deduplication.
 */

import { z } from 'zod';
import { WorkflowNodeHandler } from '../WorkflowNodeRegistry';
import { WorkflowExecutionContext } from '../../types/workflow.types';
import { db } from '../../../../config/firebase';
import { container, TOKENS } from '../../../di/container';
import { IWhatsAppProvider } from '../../../notifications/providers/WhatsAppProvider';
import { emailNotificationService } from '../../../notifications/EmailNotificationService';

export const SendInAppNotificationNode: WorkflowNodeHandler = {
  type: 'SEND_IN_APP_NOTIFICATION',
  category: 'Messaging',
  label: 'Send In-App Notification',
  description: 'Delivers a rich in-app notification to the student or teacher dashboard with idempotency.',
  icon: 'Bell',
  requiresStudent: true,
  producesExternalSideEffect: true,
  supportsSimulation: true,
  configSchema: z.object({
    title: z.string().min(1).max(100),
    body: z.string().min(1).max(500),
    category: z.enum(['learning', 'reminder', 'progress', 'recommendation']).default('learning'),
    actionUrl: z.string().optional()
  }),
  inputSchema: z.record(z.unknown()),
  outputSchema: z.object({
    notificationId: z.string(),
    userId: z.string(),
    delivered: z.boolean(),
    simulated: z.boolean(),
    idempotentReplay: z.boolean().optional()
  }),
  validateConfig(config) {
    if (!config.title || !config.body) {
      return { valid: false, errors: ['title and body are required.'] };
    }
    return { valid: true };
  },
  async execute(ctx: WorkflowExecutionContext, config) {
    const studentId = ctx.studentId;
    if (!studentId) {
      throw new Error('[SendInAppNotificationNode] Missing studentId in execution context.');
    }

    if (ctx.isSimulation) {
      return {
        notificationId: `sim_notif_${Date.now()}`,
        userId: studentId,
        delivered: true,
        simulated: true
      };
    }

    // Idempotency check: notification already created for this execution?
    const existingSnap = await db
      .collection('notifications')
      .where('userId', '==', studentId)
      .where('workflowExecutionId', '==', ctx.executionId)
      .limit(1)
      .get();

    if (!existingSnap.empty) {
      return {
        notificationId: existingSnap.docs[0].id,
        userId: studentId,
        delivered: true,
        simulated: false,
        idempotentReplay: true
      };
    }

    const notifRef = db.collection('notifications').doc();
    await notifRef.set({
      id: notifRef.id,
      userId: studentId,
      title: config.title,
      body: config.body,
      category: config.category || 'learning',
      actionUrl: config.actionUrl || '',
      read: false,
      createdAt: new Date().toISOString(),
      workflowExecutionId: ctx.executionId
    });

    return {
      notificationId: notifRef.id,
      userId: studentId,
      delivered: true,
      simulated: false,
      idempotentReplay: false
    };
  }
};

export const SendEmailNode: WorkflowNodeHandler = {
  type: 'SEND_EMAIL',
  category: 'Messaging',
  label: 'Send Email',
  description: 'Sends an email update or progress digest to the student or teacher.',
  icon: 'Mail',
  requiresStudent: true,
  producesExternalSideEffect: true,
  supportsSimulation: true,
  configSchema: z.object({
    subject: z.string().min(1).max(150),
    bodyText: z.string().min(1)
  }),
  inputSchema: z.record(z.unknown()),
  outputSchema: z.object({
    delivered: z.boolean(),
    simulated: z.boolean(),
    idempotentReplay: z.boolean().optional()
  }),
  validateConfig(config) {
    if (!config.subject || !config.bodyText) {
      return { valid: false, errors: ['subject and bodyText are required.'] };
    }
    return { valid: true };
  },
  async execute(ctx: WorkflowExecutionContext, config) {
    const studentId = ctx.studentId;
    if (!studentId) {
      throw new Error('[SendEmailNode] Missing studentId in execution context.');
    }

    if (ctx.isSimulation) {
      return {
        delivered: true,
        simulated: true
      };
    }

    // Idempotency log
    const dedupDocId = `email_dedup_${ctx.executionId}_${studentId}`;
    const dedupRef = db.collection('messagingEventsDedup').doc(dedupDocId);
    const existingSnap = await dedupRef.get();

    if (existingSnap.exists) {
      return {
        delivered: true,
        simulated: false,
        idempotentReplay: true
      };
    }

    await dedupRef.set({
      executionId: ctx.executionId,
      studentId,
      type: 'email',
      dispatchedAt: Date.now()
    });

    await emailNotificationService.sendCriticalAlert({
      userId: studentId,
      category: 'learning',
      type: 'workflow.email_digest',
      title: config.subject,
      body: config.bodyText,
      priority: 'high'
    });

    return {
      delivered: true,
      simulated: false,
      idempotentReplay: false
    };
  }
};

export const SendWhatsAppNode: WorkflowNodeHandler = {
  type: 'SEND_WHATSAPP',
  category: 'Messaging',
  label: 'Send WhatsApp Reminder',
  description: 'Sends a high-priority WhatsApp reminder or revision nudge via official provider with idempotency.',
  icon: 'MessageCircle',
  requiresStudent: true,
  producesExternalSideEffect: true,
  supportsSimulation: true,
  configSchema: z.object({
    messageText: z.string().min(1).max(1000),
    templateId: z.string().optional()
  }),
  inputSchema: z.record(z.unknown()),
  outputSchema: z.object({
    delivered: z.boolean(),
    phoneNumber: z.string().optional(),
    simulated: z.boolean(),
    idempotentReplay: z.boolean().optional()
  }),
  validateConfig(config) {
    if (!config.messageText) {
      return { valid: false, errors: ['messageText is required.'] };
    }
    return { valid: true };
  },
  async execute(ctx: WorkflowExecutionContext, config) {
    const studentId = ctx.studentId;
    if (!studentId) {
      throw new Error('[SendWhatsAppNode] Missing studentId in execution context.');
    }

    const userDoc = await db.collection('users').doc(studentId).get();
    const userData = userDoc.data() || {};
    const phone = userData.phoneNumber || userData.phone || userData.whatsappNumber;

    if (!phone && !ctx.isSimulation) {
      throw new Error(`[SendWhatsAppNode] Student ${studentId} has no phone number on record.`);
    }

    if (ctx.isSimulation) {
      return {
        delivered: true,
        phoneNumber: phone || '+919999999999',
        simulated: true
      };
    }

    // WhatsApp Idempotency Check
    const dedupDocId = `wa_dedup_${ctx.executionId}_${studentId}`;
    const dedupRef = db.collection('messagingEventsDedup').doc(dedupDocId);
    const existingSnap = await dedupRef.get();

    if (existingSnap.exists) {
      return {
        delivered: true,
        phoneNumber: phone,
        simulated: false,
        idempotentReplay: true
      };
    }

    await dedupRef.set({
      executionId: ctx.executionId,
      studentId,
      type: 'whatsapp',
      dispatchedAt: Date.now()
    });

    const waProvider = container.resolve<IWhatsAppProvider>(TOKENS.WhatsAppProvider);
    const res = await waProvider.sendTextMessage(phone, config.messageText);

    return {
      delivered: res.success,
      phoneNumber: phone,
      simulated: false,
      idempotentReplay: false
    };
  }
};
