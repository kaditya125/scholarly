process.env.NOTIFICATION_QUEUE_NAME = 'notification-jobs-test';
import { IWhatsAppProvider } from '../core/notifications/providers/WhatsAppProvider';
import { ISmsProvider } from '../core/notifications/providers/SmsProvider';
import { db } from '../config/firebase';

// Create specific test failing providers
class FailingWhatsAppProvider implements IWhatsAppProvider {
  static callCount = 0;
  async sendTemplateMessage() {
    FailingWhatsAppProvider.callCount++;
    return { success: false, error: 'WhatsApp Network Timeout (504)' };
  }
  async sendTextMessage() {
    FailingWhatsAppProvider.callCount++;
    return { success: false, error: 'WhatsApp Network Timeout (504)' };
  }
  async sendInteractiveButtonMessage() {
    FailingWhatsAppProvider.callCount++;
    return { success: false, error: 'WhatsApp Network Timeout (504)' };
  }
  async sendMediaMessage() {
    FailingWhatsAppProvider.callCount++;
    return { success: false, error: 'WhatsApp Network Timeout (504)' };
  }
}

class WorkingSmsProvider implements ISmsProvider {
  static callCount = 0;
  async sendSms(to: string, message: string) {
    WorkingSmsProvider.callCount++;
    console.log(`[TestSMS] WorkingSmsProvider called successfully! Message: ${message}`);
    return { success: true, messageId: 'test_sms_12345' };
  }
}

class FailingSmsProvider implements ISmsProvider {
  static callCount = 0;
  async sendSms() {
    FailingSmsProvider.callCount++;
    return { success: false, error: 'Twilio Gateway Expired (401)' };
  }
}

async function main() {
  console.log('--- Verifying Delivery Reliability & Analytics (Priority 6 & 7) ---');
  
  // Dynamic imports to prevent ESM import hoisting overriding process.env
  const { bootstrapDI } = await import('../core/di/registry');
  const { container, TOKENS } = await import('../core/di/container');
  const { notificationService } = await import('../services/notification/notification.service');
  const { backgroundQueue } = await import('../core/workflow/jobs/BackgroundQueue');
  const { startNotificationWorker } = await import('../core/workflow/jobs/NotificationWorker');
  const { NotificationAnalytics } = await import('../core/notifications/NotificationEngine');
  const { emailNotificationService } = await import('../core/notifications/EmailNotificationService');

  bootstrapDI();
  
  const MOCK_USER = 'reliability_student_666';
  
  // Create user profile
  await db.collection('users').doc(MOCK_USER).set({
    targetExam: 'NEET Prep',
    targetYear: 2026,
    isComplete: true,
    email: 'reliability_student@scholarly.ai'
  });

  await db.collection('userDirectory').doc(MOCK_USER).set({
    uid: MOCK_USER,
    email: 'reliability_student@scholarly.ai'
  });

  // Enable all preferences
  await notificationService.updatePreferences(MOCK_USER, {
    phoneNumber: '+15551111',
    whatsappNumber: '+15552222',
    channels: {
      inApp: true,
      push: true,
      email: true,
      whatsapp: true,
      sms: true
    },
    preferredChannels: ['whatsapp', 'sms', 'email'],
    timezone: 'Asia/Kolkata'
  });

  // Clean old analytics
  console.log('Clearing old analytics collection...');
  const analyticsSnap = await db.collection('notification_analytics').get();
  const batch = db.batch();
  analyticsSnap.docs.forEach(doc => batch.delete(doc.ref));
  await batch.commit();

  // Test Case 1: WhatsApp fails -> Escalates to working SMS
  console.log('\n--- Test Case 1: WhatsApp -> SMS Fallback Escalation ---');
  container.register(TOKENS.WhatsAppProvider, new FailingWhatsAppProvider());
  container.register(TOKENS.SmsProvider, new WorkingSmsProvider());
  
  startNotificationWorker();

  const criticalPayload = {
    userId: MOCK_USER,
    category: 'security' as const,
    type: 'security.alert',
    title: 'New Login Detected',
    body: 'We detected a login from a new device in Mumbai, India.',
    priority: 'critical' as const,
    templateId: 'security.alert',
    templateVariables: {
      device: 'MacBook Pro',
      location: 'Mumbai, India'
    }
  };

  await backgroundQueue.enqueueNotification(criticalPayload);
  console.log('Enqueued critical notification. Waiting for worker failover execution...');
  await new Promise(resolve => setTimeout(resolve, 15000));

  console.log('WhatsApp Fail Calls:', FailingWhatsAppProvider.callCount);
  console.log('SMS Success Calls:', WorkingSmsProvider.callCount);

  if (FailingWhatsAppProvider.callCount > 0 && WorkingSmsProvider.callCount > 0) {
    console.log('✅ Fallback escalation from WhatsApp to SMS verified!');
  } else {
    console.error('❌ Fallback escalation failed!');
    process.exit(1);
  }

  // Test Case 2: WhatsApp & SMS fail -> Escalates to Email fallback & DLQ tracking
  console.log('\n--- Test Case 2: Complete Fail -> Email Fallback & DLQ ---');
  FailingWhatsAppProvider.callCount = 0;
  container.register(TOKENS.WhatsAppProvider, new FailingWhatsAppProvider());
  container.register(TOKENS.SmsProvider, new FailingSmsProvider());

  // Mock Email service to throw an error
  emailNotificationService.sendCriticalAlert = async () => {
    throw new Error('SMTP Connection Refused (550)');
  };

  // Clean failed_notifications collection
  const dlqSnap = await db.collection('failed_notifications').get();
  const dlqBatch = db.batch();
  dlqSnap.docs.forEach(doc => dlqBatch.delete(doc.ref));
  await dlqBatch.commit();

  const failAllPayload = {
    userId: MOCK_USER,
    category: 'payment' as const,
    type: 'payment.failed',
    title: 'Payment Failed',
    body: 'Your subscription renewal payment of $15.00 failed.',
    priority: 'critical' as const,
    templateId: 'payment.failed',
    templateVariables: {
      amount: '$15.00',
      user: 'Student Aditya'
    }
  };

  await backgroundQueue.enqueueNotification(failAllPayload);
  console.log('Enqueued failing notification. Waiting for full fallback & DLQ routing...');
  await new Promise(resolve => setTimeout(resolve, 15000));

  console.log('WhatsApp Fail Calls:', FailingWhatsAppProvider.callCount);
  console.log('SMS Fail Calls:', FailingSmsProvider.callCount);

  const dlqDocs = await db.collection('failed_notifications').get();
  console.log('Failed notifications written to DLQ collection:', dlqDocs.size);

  if (dlqDocs.size > 0) {
    console.log('✅ DLQ logging verified!');
  } else {
    console.error('❌ DLQ logging failed!');
    process.exit(1);
  }

  // Test Case 3: Verify system analytics metrics
  console.log('\n--- Test Case 3: System Analytics Dashboard ---');
  const analytics = await NotificationAnalytics.getSystemAnalytics(1);
  console.log('Aggregated System Analytics:', JSON.stringify(analytics, null, 2));

  if (analytics.metrics.totalCostUsd > 0 && analytics.metrics.avgLatencyMs >= 0) {
    console.log('✅ Cost and Latency analytics tracking verified.');
    console.log('\n✅ Priority 6 & 7 Verification PASSED!');
    process.exit(0);
  } else {
    console.error('❌ Analytics metrics missing or failed to calculate.');
    process.exit(1);
  }
}

main().catch(e => {
  console.error('Verification crashed:', e);
  process.exit(1);
});
