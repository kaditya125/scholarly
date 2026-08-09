import { bootstrapDI } from '../core/di/registry';
import { notificationService } from '../services/notification/notification.service';
import { backgroundQueue } from '../core/workflow/jobs/BackgroundQueue';
import { startNotificationWorker, notificationWorker } from '../core/workflow/jobs/NotificationWorker';
import { db } from '../config/firebase';
import { logger } from '../utils/logger';

async function main() {
  console.log('--- Verifying Message Templates & Quiet Hours (Priority 4 & 5) ---');
  
  bootstrapDI();
  startNotificationWorker();
  
  const MOCK_USER = 'sched_tpl_verification_student_777';
  
  // Clean up user config
  await db.collection('users').doc(MOCK_USER).set({
    targetExam: 'JEE Advanced',
    targetYear: 2027
  });

  // 1. Configure user preferences (No quiet hours, templates enabled)
  console.log('Configuring preferences (Quiet Hours disabled)...');
  await notificationService.updatePreferences(MOCK_USER, {
    timezone: 'Asia/Kolkata',
    quietHours: undefined // Disabled
  });

  console.log('\n--- Test Case 1: Template Rendering ---');
  const payloadWithTemplate = {
    userId: MOCK_USER,
    category: 'learning' as const,
    type: 'podcast.completed',
    title: 'Placeholder Title',
    body: 'Placeholder Body',
    priority: 'high' as const,
    templateId: 'podcast.ready',
    templateVariables: {
      concept: 'Organic Chemistry',
      user: 'Student Aditya'
    }
  };

  // Publish to background queue
  await backgroundQueue.enqueueNotification(payloadWithTemplate);
  console.log('Enqueued template notification. Waiting for worker processing...');
  
  // Wait a short time for worker processing
  await new Promise(resolve => setTimeout(resolve, 5000));

  // Retrieve notifications for user from Firestore to check if template was rendered
  const snapshot = await db.collection('users').doc(MOCK_USER).collection('notifications').get();
  let templateRenderPassed = false;
  
  snapshot.docs.forEach(doc => {
    const data = doc.data();
    console.log('Processed In-App Notification Title:', data.title);
    console.log('Processed In-App Notification Body:', data.body);
    if (data.title === 'Podcast Generated' && data.body.includes('Organic Chemistry')) {
      templateRenderPassed = true;
    }
  });

  if (!templateRenderPassed) {
    console.error('❌ Template rendering failed!');
    process.exit(1);
  }
  console.log('✅ Template rendering verified.');

  // 2. Test Case 2: Quiet Hours Rescheduling
  console.log('\n--- Test Case 2: Timezone-Aware Quiet Hours Delay ---');
  // Configure quiet hours to cover current local time (12:00 AM / 00:00 is within 22:00 - 07:00)
  console.log('Setting quiet hours to 22:00 to 07:00 (active now)...');
  await notificationService.updatePreferences(MOCK_USER, {
    timezone: 'Asia/Kolkata',
    quietHours: {
      start: '22:00',
      end: '07:00'
    }
  });

  // Clear previous notifications
  const batch = db.batch();
  snapshot.docs.forEach(doc => batch.delete(doc.ref));
  await batch.commit();

  const payloadQuietHours = {
    userId: MOCK_USER,
    category: 'learning' as const,
    type: 'podcast.completed',
    title: 'Thermodynamics Podcast',
    body: 'Your podcast has been successfully generated.',
    priority: 'high' as const
  };

  // We should listen to worker or intercept rescheduling
  console.log('Enqueued notification during quiet hours. Expecting reschedule delay...');
  await backgroundQueue.enqueueNotification(payloadQuietHours);

  // Wait for worker to pick up and reschedule
  await new Promise(resolve => setTimeout(resolve, 5000));

  // Check if any notification was written to Firestore (should be 0 because it got rescheduled!)
  const snapAfterQuiet = await db.collection('users').doc(MOCK_USER).collection('notifications').get();
  console.log('Number of notifications written during active quiet hours:', snapAfterQuiet.size);

  if (snapAfterQuiet.size === 0) {
    console.log('✅ Quiet Hours rescheduling verified (0 immediate writes).');
    console.log('\n✅ Priority 4 & 5 Verification PASSED!');
    process.exit(0);
  } else {
    console.error('❌ Quiet Hours failed! Notification was immediately written to DB.');
    process.exit(1);
  }
}

main().catch(e => {
  console.error('Verification crashed:', e);
  process.exit(1);
});
