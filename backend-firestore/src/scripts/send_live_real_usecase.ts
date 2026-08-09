import { db } from '../config/firebase';
import { container, TOKENS } from '../core/di/container';
import { bootstrapDI } from '../core/di/registry';

class ForcedAllChannelsIntelligenceService {
  async evaluate(payload: any) {
    return {
      priority: payload.priority || 'high',
      recommendedChannels: ['in_app', 'push', 'whatsapp', 'sms', 'email'],
      deliveryTimeDelayMs: 0,
      predictedCtr: 0.95,
      customBody: payload.body
    };
  }
}

async function main() {
  console.log('=== DISPATCHING REAL USE-CASE TO LIVE CHANNELS ===');
  
  bootstrapDI();

  // Override Intelligence Service to force all channels simultaneously
  container.register(TOKENS.NotificationIntelligenceService, new ForcedAllChannelsIntelligenceService());

  const { backgroundQueue } = await import('../core/workflow/jobs/BackgroundQueue');
  const { startNotificationWorker } = await import('../core/workflow/jobs/NotificationWorker');
  const { notificationService } = await import('../services/notification/notification.service');

  // Clean queue. This script dispatches a real notification to live channels
  // (Twilio/WhatsApp) and REQUIRES a reachable Redis broker. The `queue!`
  // non-null assertions reflect that precondition \u2014 see BackgroundQueue.ts
  // for the brokerless-dev null-guard path.
  console.log('Draining and cleaning background queues to clear legacy failed/delayed jobs...');
  await backgroundQueue.queue!.drain();
  await backgroundQueue.queue!.clean(0, 1000, 'failed');
  await backgroundQueue.queue!.clean(0, 1000, 'completed');
  await backgroundQueue.queue!.clean(0, 1000, 'delayed');

  // Start the worker processing the queue
  startNotificationWorker();

  const STUDENT_ID = 'live_usecase_student_abc';

  // 1. Clean previous state
  const notifs = await db.collection('users').doc(STUDENT_ID).collection('notifications').get();
  const batch = db.batch();
  notifs.docs.forEach(doc => batch.delete(doc.ref));
  await batch.commit();

  // 2. Setup user directory & profile
  await db.collection('users').doc(STUDENT_ID).set({
    targetExam: 'NEET Prep',
    targetYear: 2026,
    isComplete: true,
    email: 'adityakumar.study@scholarly.ai'
  });
  await db.collection('userDirectory').doc(STUDENT_ID).set({
    uid: STUDENT_ID,
    email: 'adityakumar.study@scholarly.ai'
  });

  // 3. Configure preferences: enable all channels, set contact info, disable quiet hours
  console.log('Configuring student preferences...');
  await notificationService.updatePreferences(STUDENT_ID, {
    phoneNumber: '+919102202267', // Live Twilio receiver
    whatsappNumber: '+919102202267', // Live Meta WhatsApp receiver (Must be verified in Meta dashboard!)
    timezone: 'Asia/Kolkata',
    channels: {
      inApp: true,
      push: true,
      email: true,
      whatsapp: true,
      sms: true
    },
    quietHours: undefined // Ensure instant delivery
  });

  // 4. Enqueue real use case notification payload
  console.log('Enqueuing learning notification event: podcast.completed...');
  await backgroundQueue.enqueueNotification({
    userId: STUDENT_ID,
    category: 'learning',
    type: 'podcast.completed',
    title: 'Atomic Structure Audio Summary',
    body: 'Great job! Your customized revision podcast for Atomic Structure is ready to play. 🎧',
    priority: 'high'
  });

  // Wait 12 seconds for the BullMQ worker to pick it up and run the delivery channels
  console.log('Waiting for worker processing E2E delivery...');
  await new Promise(resolve => setTimeout(resolve, 12000));

  console.log('\n=== Live Usecase Dispatch Completed ===');
  process.exit(0);
}

main().catch(e => {
  console.error('Usecase dispatch script failed:', e);
  process.exit(1);
});
