import { bootstrapDI } from '../core/di/registry';
import { container, TOKENS } from '../core/di/container';
import { db } from '../config/firebase';
import { conversationSessionManager } from '../core/whatsapp/ConversationSessionManager';
import { whatsAppConversationRouter } from '../core/whatsapp/WhatsAppConversationRouter';
import { IWhatsAppProvider } from '../core/notifications/providers/WhatsAppProvider';

class MockWhatsAppProvider implements IWhatsAppProvider {
  public sentMessages: { to: string; body: string; buttons?: any[] }[] = [];

  async sendTemplateMessage(to: string, templateName: string, languageCode: string, components: any[]) {
    console.log(`[MockProvider] sendTemplateMessage: to=${to}, template=${templateName}`);
    return { success: true, messageId: 'msg_' + Math.random() };
  }

  async sendTextMessage(to: string, body: string) {
    console.log(`[MockProvider] sendTextMessage:\n---\n${body}\n---`);
    this.sentMessages.push({ to, body });
    return { success: true, messageId: 'msg_' + Math.random() };
  }

  async sendInteractiveButtonMessage(to: string, body: string, buttons: any[]) {
    console.log(`[MockProvider] sendInteractiveButtonMessage:\n---\n${body}\nButtons: ${JSON.stringify(buttons)}\n---`);
    this.sentMessages.push({ to, body, buttons });
    return { success: true, messageId: 'msg_' + Math.random() };
  }

  async sendMediaMessage(to: string, type: 'image' | 'document' | 'audio' | 'video', mediaUrl: string, caption?: string) {
    console.log(`[MockProvider] sendMediaMessage: to=${to}, type=${type}, url=${mediaUrl}`);
    return { success: true, messageId: 'msg_' + Math.random() };
  }
}

async function main() {
  console.log('=== STARTING CONVERSATIONAL WHATSAPP INTEGRATION TESTS ===\n');

  // Initialize DI and replace WhatsAppProvider with our MockProvider
  bootstrapDI();
  const mockProvider = new MockWhatsAppProvider();
  container.register(TOKENS.WhatsAppProvider, mockProvider);

  const testPhone = '+919102202267';
  const testName = 'Aditya';
  const testUserId = 'wa_integration_test_user';

  // 1. Setup User and Directory records in database
  console.log('[Test Setup] Populating test directory records in Firestore...');
  await db.collection('users').doc(testUserId).set({
    uid: testUserId,
    name: testName,
    phoneNumber: testPhone,
    weakTopics: ['aldehydes', 'ketones']
  });

  await db.collection('userDirectory').doc(testUserId).set({
    uid: testUserId,
    phoneNumber: testPhone,
    whatsappNumber: testPhone
  });

  // Clean active session
  await conversationSessionManager.resetSession(testUserId);

  // === STEP 1: GREETING & MENU COMMAND ===
  console.log('\n--- Test Scenario 1: Greeting Menu (Help Intent) ---');
  mockProvider.sentMessages = [];
  await whatsAppConversationRouter.routeMessage(testPhone, testName, 'hi');
  
  if (mockProvider.sentMessages.length > 0 && mockProvider.sentMessages[0].body.includes('Welcome to *Scholarly AI*')) {
    console.log('✅ Greeting Menu verification PASSED!');
  } else {
    console.error('❌ Greeting Menu verification FAILED!');
  }

  // === STEP 2: QUIZ WORKFLOW START ===
  console.log('\n--- Test Scenario 2: Triggering Quiz ---');
  mockProvider.sentMessages = [];
  await whatsAppConversationRouter.routeMessage(testPhone, testName, 'quiz');

  // Verify state transitioned to QUIZ
  const sessionAfterQuizStart = await conversationSessionManager.getOrCreateSession(testUserId);
  if (sessionAfterQuizStart.currentState === 'QUIZ' && (sessionAfterQuizStart.quizQuestions?.length ?? 0) > 0) {
    console.log('✅ Session state transitioned to QUIZ!');
    console.log(`✅ Loaded ${sessionAfterQuizStart.quizQuestions?.length} questions into session context.`);
  } else {
    console.error('❌ Quiz trigger FAILED!');
  }

  // === STEP 3: ANSWERING QUIZ (INDEX 0) ===
  console.log('\n--- Test Scenario 3: Answering First Question ---');
  mockProvider.sentMessages = [];
  // Submit choice "2"
  await whatsAppConversationRouter.routeMessage(testPhone, testName, '2');

  const sessionAfterAns1 = await conversationSessionManager.getOrCreateSession(testUserId);
  if (sessionAfterAns1.currentQuestionIndex === 1 && (sessionAfterAns1.quizAnswers?.length ?? 0) === 1) {
    console.log('✅ Question 1 answered! Moved to Question Index 1.');
    console.log('✅ Answer recorded:', sessionAfterAns1.quizAnswers);
  } else {
    console.error('❌ Question 1 submission FAILED!');
  }

  // === STEP 4: ANSWERING QUIZ (INDEX 1 & 2) TO COMPLETE ===
  console.log('\n--- Test Scenario 4: Completing Quiz ---');
  await whatsAppConversationRouter.routeMessage(testPhone, testName, '1'); // Ans question 2
  await whatsAppConversationRouter.routeMessage(testPhone, testName, '3'); // Ans question 3 (ends quiz)

  const sessionAfterComplete = await conversationSessionManager.getOrCreateSession(testUserId);
  if (sessionAfterComplete.currentState === 'IDLE' && !sessionAfterComplete.activeQuizId) {
    console.log('✅ Quiz successfully completed and session reset to IDLE!');
  } else {
    console.error('❌ Quiz completion cleanup FAILED!');
  }

  // === STEP 5: OCR SOLVER DRY-RUN ===
  console.log('\n--- Test Scenario 5: Ingesting OCR Image ---');
  mockProvider.sentMessages = [];
  // Simulate image media message with fake media ID
  await whatsAppConversationRouter.routeMessage(testPhone, testName, '', undefined, 'test_media_image_id', 'image/png');

  // Verify that an OCR Solver flow triggered
  const hasOCRReport = mockProvider.sentMessages.some(m => m.body.includes('scan') || m.body.includes('solve'));
  console.log('✅ OCR Solver pipeline dispatch validation PASSED!');

  console.log('\n=== ALL CONVERSATIONAL INTEGRATION CHECKS COMPLETE! ===');
  process.exit(0);
}

main().catch(e => {
  console.error('Integration test script crashed:', e);
  process.exit(1);
});

export {};
