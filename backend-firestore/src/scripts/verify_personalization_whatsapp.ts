import { bootstrapDI } from '../core/di/registry';
import { container, TOKENS } from '../core/di/container';
import { NotificationIntelligenceService } from '../core/notifications/NotificationIntelligenceService';
import { IWhatsAppProvider } from '../core/notifications/providers/WhatsAppProvider';
import { db } from '../config/firebase';

async function main() {
  console.log('--- Verifying AI Personalization & WhatsApp Features (Priority 8 & 9) ---');
  
  bootstrapDI();
  
  const MOCK_USER = 'persona_student_555';
  
  // 1. Setup Student Profile in Firestore with Weak Topics and 5 Days Streak
  console.log('Setting up student profile and stats in Firestore...');
  await db.collection('users').doc(MOCK_USER).set({
    targetExam: 'JEE Advanced',
    targetYear: 2027,
    isComplete: true,
    email: 'persona_student@sadhya.app'
  });
  
  await db.collection('users').doc(MOCK_USER).collection('intelligence').doc('preferences').set({
    language: 'English',
    depth: 'standard'
  });

  // Write weak topic to user memory
  await db.collection('users').doc(MOCK_USER).collection('memory').doc('global').set({
    weakTopics: ['Quantum Mechanics'],
    strongTopics: ['Algebra'],
    learningSpeed: 'fast'
  });

  // Write streak to user stats
  await db.collection('user_stats').doc(MOCK_USER).set({
    gamification: {
      studyStreakDays: 5,
      xp: 450,
      level: 3
    }
  });

  // 2. Resolve and Test NotificationIntelligenceService
  const intelService = container.resolve<NotificationIntelligenceService>(TOKENS.NotificationIntelligenceService);
  console.log('✅ Resolved NotificationIntelligenceService');

  // Test Case 1: Weak Topic Revision Notification
  console.log('\n--- Test Case 1: AI Personalized Weak Topic Revision ---');
  const payloadWeakTopic = {
    userId: MOCK_USER,
    category: 'learning' as const,
    type: 'weak_topic.detected',
    title: 'Study Reminder',
    body: 'Time to study your revision card.',
    priority: 'high' as const
  };

  const resultWeakTopic = await intelService.evaluate(payloadWeakTopic);
  console.log('Original Body: "Time to study your revision card."');
  console.log('AI Personalized Body:', resultWeakTopic.customBody);

  // Test Case 2: Study Streak Notification
  console.log('\n--- Test Case 2: AI Personalized Study Streak ---');
  const payloadStreak = {
    userId: MOCK_USER,
    category: 'reminder' as const,
    type: 'study.reminder',
    title: 'Daily Reminder',
    body: 'Do not forget your daily study session.',
    priority: 'medium' as const
  };

  const resultStreak = await intelService.evaluate(payloadStreak);
  console.log('Original Body: "Do not forget your daily study session."');
  console.log('AI Personalized Body:', resultStreak.customBody);

  // 3. Resolve and Test WhatsApp features (Buttons & Media)
  console.log('\n--- Test Case 3: WhatsApp Buttons & Media Delivery ---');
  const waProvider = container.resolve<IWhatsAppProvider>(TOKENS.WhatsAppProvider);
  
  console.log('Testing WhatsApp Quick Replies...');
  const btnResult = await waProvider.sendInteractiveButtonMessage(
    '+15550199',
    'Select a study option:',
    [
      { id: 'start_quiz', title: 'Start Quiz' },
      { id: 'listen_podcast', title: 'Listen Podcast' }
    ]
  );
  console.log('WhatsApp Buttons Result:', btnResult);

  console.log('\nTesting WhatsApp PDF Attachment delivery...');
  const mediaResult = await waProvider.sendMediaMessage(
    '+15550199',
    'document',
    'https://sadhya.app/assets/pdf/quantum_mechanics_notes.pdf',
    'Your Quantum Mechanics study notes are ready!',
    'Quantum_Mechanics_Notes.pdf'
  );
  console.log('WhatsApp Media Result:', mediaResult);

  if (
    resultWeakTopic.customBody &&
    resultStreak.customBody &&
    btnResult.success &&
    mediaResult.success
  ) {
    console.log('\n✅ Priority 8 & 9 Verification PASSED!');
    process.exit(0);
  } else {
    console.error('\n❌ Verification FAILED!');
    process.exit(1);
  }
}

main().catch(e => {
  console.error('Verification crashed:', e);
  process.exit(1);
});
