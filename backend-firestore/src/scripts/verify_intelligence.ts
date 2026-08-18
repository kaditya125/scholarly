import { bootstrapDI } from '../core/di/registry';
import { container, TOKENS } from '../core/di/container';
import { NotificationIntelligenceService } from '../core/notifications/NotificationIntelligenceService';
import { NotificationPayload } from '../core/notifications/NotificationEngine';
import { db } from '../config/firebase';

async function main() {
  console.log('--- Verifying Notification Intelligence Engine (Priority 2) ---');

  // 1. Bootstrap DI Container
  bootstrapDI();

  // 2. Setup mock student database record to test context intelligence integration
  const MOCK_USER = 'verification_student_999';
  console.log(`Setting up mock profile & stats for ${MOCK_USER} in Firestore...`);
  
  await db.collection('users').doc(MOCK_USER).set({
    targetExam: 'JEE Advanced',
    targetYear: 2027,
    isComplete: true,
    email: 'verify_jee_student@sadhya.app'
  });
  
  await db.collection('users').doc(MOCK_USER).collection('intelligence').doc('preferences').set({
    language: 'English',
    depth: 'deep'
  });

  // 3. Resolve NotificationIntelligenceService
  const intelService = container.resolve<NotificationIntelligenceService>(TOKENS.NotificationIntelligenceService);
  if (!intelService) {
    throw new Error('NotificationIntelligenceService could not be resolved from DI Container!');
  }
  console.log('✅ Resolved NotificationIntelligenceService');

  // 4. Evaluate a mock notification payload
  const mockPayload: NotificationPayload = {
    userId: MOCK_USER,
    category: 'learning',
    type: 'podcast.completed',
    title: 'Thermodynamics Podcast Ready',
    body: 'Your 15-minute podcast covering First Law of Thermodynamics has been generated.',
    priority: 'medium'
  };

  console.log('\nEvaluating mock payload through AI Intelligence Engine...');
  const recommendation = await intelService.evaluate(mockPayload);
  console.log('AI Recommendation Output:', JSON.stringify(recommendation, null, 2));

  // Verify fields are returned correctly
  if (
    recommendation.priority && 
    Array.isArray(recommendation.recommendedChannels) && 
    typeof recommendation.deliveryTimeDelayMs === 'number' && 
    typeof recommendation.predictedCtr === 'number' &&
    recommendation.customBody
  ) {
    console.log('\n✅ Priority 2 Verification PASSED!');
    process.exit(0);
  } else {
    console.error('\n❌ Priority 2 Verification FAILED! Missing expected output fields.');
    process.exit(1);
  }
}

main().catch(e => {
  console.error('Verification crashed:', e);
  process.exit(1);
});
