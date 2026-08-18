import { eventBus } from '../core/events/EventBus';
import { registerEventSubscribers } from '../core/events/subscribers';
import { logger } from '../utils/logger';

/**
 * Script to simulate various notification scenarios to test the end-to-end pipeline.
 * Usage: npx ts-node src/scripts/simulateNotifications.ts
 */
async function simulate() {
  const MOCK_USER_ID = 'simulation_user_123';
  logger.info('--- Starting Notification Simulation ---');
  registerEventSubscribers();

  // 1. Simulate a standard successful event
  logger.info('[Simulate] 1. Triggering standard podcast completion...');
  await eventBus.publish('podcast.completed', {
    podcastId: 'pod_abc123',
    userId: MOCK_USER_ID,
    durationMs: 1200000,
    fileUrl: 'https://sadhya.app/audio.mp3'
  } as any);

  // 2. Simulate AI classification of a critical alert
  logger.info('[Simulate] 2. Triggering a critical system alert (simulated via dm received)...');
  await eventBus.publish('notification.created', {
    userId: MOCK_USER_ID,
    category: 'system',
    type: 'billing.failed',
    title: 'Payment Failed',
    body: 'Your recent subscription payment failed. Please update your card.',
    priority: 'critical' // Explicitly critical
  });

  // 3. Simulate Spam to trigger Redis Rate Limiter
  logger.info('[Simulate] 3. Triggering 5 identical notebook ingestion events rapidly (Spam Test)...');
  for (let i = 0; i < 5; i++) {
    await eventBus.publish('notebook.ingested', {
      notebookId: 'src_duplicate_999',
      userId: MOCK_USER_ID,
      title: 'Physics Chapter 1'
    } as any); // Using 'as any' just in case title isn't allowed, but we want it for the message
  }

  // 4. Simulate a silent AI notification drop
  logger.info('[Simulate] 4. Triggering a low-value event that AI might classify as silent...');
  await eventBus.publish('notification.created', {
    userId: MOCK_USER_ID,
    category: 'system',
    type: 'system.background_sync',
    title: 'Background Sync Complete',
    body: 'Your offline data has been synced to the server. No action is needed.'
    // AI should classify this as "silent" or "low"
  });

  logger.info('--- Simulation Events Dispatched ---');
  logger.info('Please check the worker logs to verify:');
  logger.info('- Multi-channel push for critical billing alert');
  logger.info('- Suppression of 4 out of 5 duplicate notebook events');
  logger.info('- AI classification of the background sync event');
  
  // Keep process alive for a few seconds to let BullMQ and events finish
  setTimeout(() => {
    logger.info('Exiting simulator.');
    process.exit(0);
  }, 5000);
}

// Run simulation
simulate().catch(e => {
  logger.error('Simulation failed', e);
  process.exit(1);
});
