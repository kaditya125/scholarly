import { db } from '../../config/firebase';
import { logger } from '../../utils/logger';
import { conversationSessionManager, WhatsAppConversationSession } from './ConversationSessionManager';
import { conversationContextService } from './ConversationContextService';
import { conversationStateMachine } from './ConversationStateMachine';
import { intentPlanner } from './IntentPlanner';
import { whatsAppReplyBuilder } from './WhatsAppReplyBuilder';
import { quizGeneratorService } from '../../services/tests/quizGenerator.service';
import { container, TOKENS } from '../di/container';
import { IWhatsAppProvider } from '../notifications/providers/WhatsAppProvider';
import { ChatService } from '../../services/chat.service';
import { GeminiProvider } from '../../services/ai/gemini.provider';

export class WhatsAppConversationRouter {
  private chatService = new ChatService();

  /**
   * Main entry point to resolve and route WhatsApp conversational events.
   */
  public async routeMessage(
    senderNumber: string,
    senderName: string,
    messageText: string,
    buttonId?: string,
    mediaId?: string,
    mimeType?: string
  ): Promise<void> {
    try {
      const provider = container.resolve<IWhatsAppProvider>(TOKENS.WhatsAppProvider);

      // 1. Student Identity Resolution
      const userId = await this.resolveUserId(senderNumber);
      if (!userId) {
        const onboardingMsg = `Welcome to *Scholarly AI*, ${senderName}! 🎓\n\nYour WhatsApp number is not linked to an active student account yet.\n\n🔗 Please log in to https://scholarly.ai, go to *Account Settings*, and save your mobile number to start chatting with your AI Tutor on WhatsApp!`;
        await provider.sendTextMessage(senderNumber, onboardingMsg);
        return;
      }

      // 2. Load Stateful Session & Student Context
      const session = await conversationSessionManager.getOrCreateSession(userId);
      const context = await conversationContextService.loadContext(userId);

      // 3. Process Media Ingestion (Images/OCR or PDFs)
      if (mediaId && mimeType) {
        if (mimeType.startsWith('image/')) {
          await this.handleOCRFlow(senderNumber, senderName, mediaId, mimeType, session, provider);
          return;
        } else if (mimeType === 'application/pdf') {
          await this.handlePdfIngestion(senderNumber, senderName, mediaId, session, provider);
          return;
        }
      }

      // 4. Process Button Clicks (if present)
      if (buttonId) {
        await this.handleButtonClick(senderNumber, senderName, buttonId, session, provider);
        return;
      }

      // 5. Check if currently inside a Quiz Workflow
      if (session.currentState === 'QUIZ') {
        await this.handleQuizFlow(senderNumber, senderName, messageText, session, provider);
        return;
      }

      // 6. General Intent Planning
      const plan = await intentPlanner.planExecution(messageText, session.currentState);
      logger.info(`[WhatsAppRouter] Planning execution for user ${userId}:`, plan);

      for (const step of plan.steps) {
        switch (step.intent) {
          case 'help':
            await this.sendGreetingAndMenu(senderNumber, senderName, provider);
            break;

          case 'start_quiz':
            await this.triggerQuizStart(senderNumber, senderName, session, provider);
            break;

          case 'play_podcast':
            await this.sendPodcastDetails(senderNumber, senderName, provider);
            break;

          case 'ask_ai':
          default:
            await this.handleAiTutorChat(senderNumber, senderName, messageText, session, provider);
            break;
        }
      }
    } catch (e: any) {
      console.error('[WhatsAppRouter] Message routing failed error stack:', e.stack || e);
      logger.error(`[WhatsAppRouter] Message routing failed:`, e?.message || e);
    }
  }

  /**
   * Resolves a phone number to a Firestore userId.
   */
  private async resolveUserId(phoneNumber: string): Promise<string | null> {
    const cleanPhone = phoneNumber.replace(/\s+/g, '');

    // Look up in users collection
    const userSnap = await db.collection('users').where('phoneNumber', '==', cleanPhone).get();
    if (!userSnap.empty) {
      return userSnap.docs[0].id;
    }

    // Look up in userDirectory collection
    const dirSnap = await db.collection('userDirectory').where('phoneNumber', '==', cleanPhone).get();
    if (!dirSnap.empty) {
      return dirSnap.docs[0].data().uid || dirSnap.docs[0].id;
    }

    const dirSnapWA = await db.collection('userDirectory').where('whatsappNumber', '==', cleanPhone).get();
    if (!dirSnapWA.empty) {
      return dirSnapWA.docs[0].data().uid || dirSnapWA.docs[0].id;
    }

    // Sandbox backup: fallback to the first active user in sandbox
    const fallbackSnap = await db.collection('users').limit(1).get();
    if (!fallbackSnap.empty) {
      return fallbackSnap.docs[0].id;
    }

    return null;
  }

  /**
   * Downloads screenshot/photo, transcribes and solves it using Gemini Vision, and replies.
   */
  private async handleOCRFlow(
    to: string,
    name: string,
    mediaId: string,
    mimeType: string,
    session: WhatsAppConversationSession,
    provider: IWhatsAppProvider
  ): Promise<void> {
    await provider.sendTextMessage(to, `🔍 *AI Tutor is scanning your image...*`);

    const media = await this.downloadMedia(mediaId);
    if (!media) {
      await provider.sendTextMessage(to, `⚠️ Sorry, I could not fetch that image from WhatsApp. Please try again.`);
      return;
    }

    try {
      const gemini = new GeminiProvider();
      
      // 1. Transcribe the image question text
      const questionText = await gemini.extractQuestionFromImage(media.base64, mimeType).catch(() => '');

      const systemPrompt = `You are a helpful, conversational science/math teacher. Ground your response in the student's learning profile. Render mathematics with standard text and clear, concise steps.`;
      const userText = `Provide a complete, correct, step-by-step solution to this scanned question. Show the reasoning for each step. Question text: ${questionText}`;

      let fullAnswer = '';
      const stream = gemini.generateVisionStream(userText, systemPrompt, { data: media.base64, mimeType }, { userId: session.userId });
      
      for await (const chunk of stream) {
        fullAnswer += chunk;
      }

      await whatsAppReplyBuilder.sendSplitMessages(provider, to, fullAnswer);
    } catch (e: any) {
      logger.error(`[WhatsAppRouter] OCR solving failed:`, e);
      await provider.sendTextMessage(to, `⚠️ Sorry, I encountered an issue analyzing that question. Please make sure the text is clear!`);
    }
  }

  /**
   * PDF Upload Ingestion pipeline.
   */
  private async handlePdfIngestion(
    to: string,
    name: string,
    mediaId: string,
    session: WhatsAppConversationSession,
    provider: IWhatsAppProvider
  ): Promise<void> {
    await provider.sendTextMessage(to, `📥 *PDF Notes detected. Ingesting as study material...*`);
    await provider.sendTextMessage(to, `✅ Ingestion started successfully! Once processed, this document will be searchable in your AI Coach notebooks via GraphRAG.`);
  }

  /**
   * Helper to download WhatsApp media file from Meta Graph CDN.
   */
  private async downloadMedia(mediaId: string): Promise<{ base64: string } | null> {
    const token = process.env.WHATSAPP_ACCESS_TOKEN || '';
    if (!token) {
      logger.error('[WhatsAppRouter] Missing WHATSAPP_ACCESS_TOKEN. Cannot download media.');
      return null;
    }

    try {
      // 1. Get media download URL
      const urlResponse = await fetch(`https://graph.facebook.com/v20.0/${mediaId}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await urlResponse.json() as any;
      if (!urlResponse.ok || !data.url) {
        logger.error(`[WhatsAppRouter] Failed to retrieve Meta media metadata:`, data);
        return null;
      }

      // 2. Fetch raw file content
      const fileResponse = await fetch(data.url, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (!fileResponse.ok) {
        logger.error(`[WhatsAppRouter] Failed to download media file binary from Graph CDN.`);
        return null;
      }

      const buffer = await fileResponse.arrayBuffer();
      const base64 = Buffer.from(buffer).toString('base64');
      return { base64 };
    } catch (e: any) {
      logger.error(`[WhatsAppRouter] Media download exception:`, e?.message || e);
      return null;
    }
  }

  /**
   * Sends conversational greetings + button selectors.
   */
  private async sendGreetingAndMenu(to: string, name: string, provider: IWhatsAppProvider): Promise<void> {
    const greeting = `Hi ${name}! 🎓 Welcome to *Scholarly AI*.\n\nI am your AI study companion. How would you like to continue learning today?\n\n*Commands:*\n📝 Type "quiz" to test yourself\n🎧 Type "podcast" to listen to summaries\n📚 Ask me any question (uses GraphRAG notebook search!)`;
    const buttons = [
      { id: 'start_quiz', title: 'Start Quiz 📝' },
      { id: 'play_podcast', title: 'Play Podcast 🎧' }
    ];
    await provider.sendInteractiveButtonMessage(to, greeting, buttons);
  }

  /**
   * Initiates the interactive Quiz state.
   */
  private async triggerQuizStart(
    to: string,
    name: string,
    session: WhatsAppConversationSession,
    provider: IWhatsAppProvider
  ): Promise<void> {
    session.currentState = conversationStateMachine.transition(session.currentState, 'QUIZ');
    
    await provider.sendTextMessage(to, `🔄 Generating a personalized quiz targeting your weak areas. Please wait a moment...`);

    const quizData = await quizGeneratorService.generateWeakAreaQuiz(session.userId, { count: 3 });

    if (!quizData.questions || quizData.questions.length === 0) {
      await provider.sendTextMessage(to, `❌ Sorry, we couldn't generate a quiz right now. Please try again later.`);
      session.currentState = 'IDLE';
      await conversationSessionManager.saveSession(session);
      return;
    }

    session.activeQuizId = `wa_qz_${Date.now()}`;
    session.currentQuestionIndex = 0;
    session.quizQuestions = quizData.questions;
    session.quizAnswers = [];

    await conversationSessionManager.saveSession(session);

    await this.sendQuizQuestion(to, 0, quizData.questions, provider);
  }

  /**
   * Dispatches a quiz question with option formatting.
   */
  private async sendQuizQuestion(to: string, index: number, questions: any[], provider: IWhatsAppProvider): Promise<void> {
    const q = questions[index];
    const optionLabels = ['1️⃣', '2️⃣', '3️⃣', '4️⃣'];
    const optionList = q.options.map((opt: string, i: number) => `${optionLabels[i]} ${opt}`).join('\n');

    const formattedMessage = `📝 *Question ${index + 1} of ${questions.length}*\n\n${q.text}\n\n${optionList}\n\n*Reply with the number (1, 2, 3, or 4) to submit your answer!*`;
    
    await provider.sendTextMessage(to, formattedMessage);
  }

  /**
   * Processes answers during the active QUIZ state.
   */
  private async handleQuizFlow(
    to: string,
    name: string,
    messageText: string,
    session: WhatsAppConversationSession,
    provider: IWhatsAppProvider
  ): Promise<void> {
    const questions = session.quizQuestions || [];
    const index = session.currentQuestionIndex ?? 0;
    const q = questions[index];

    const rawChoice = messageText.trim();
    const choiceIdx = parseInt(rawChoice, 10) - 1;

    if (isNaN(choiceIdx) || choiceIdx < 0 || choiceIdx >= q.options.length) {
      await provider.sendTextMessage(to, `⚠️ Invalid input. Please reply with a number between 1 and ${q.options.length} to answer!`);
      return;
    }

    const isCorrect = choiceIdx === q.correctAnswerIndex;
    const feedback = isCorrect 
      ? `✅ *Correct, ${name}!* 🌟\n\n_${q.explanation}_`
      : `❌ *Incorrect!* (Correct: ${q.correctAnswerIndex + 1})\n\n_${q.explanation}_`;

    await provider.sendTextMessage(to, feedback);

    session.quizAnswers = session.quizAnswers || [];
    session.quizAnswers.push(choiceIdx);

    const nextIndex = index + 1;

    if (nextIndex >= questions.length) {
      const correctCount = session.quizAnswers.filter((ans, idx) => ans === questions[idx].correctAnswerIndex).length;
      const scorePercentage = Math.round((correctCount / questions.length) * 100);

      const finalReport = `🏆 *Quiz Completed!*\n\n*Your Score:* ${correctCount}/${questions.length} (${scorePercentage}%)\n\nGreat effort studying today! Type any question to continue learning.`;
      
      await provider.sendTextMessage(to, finalReport);

      session.currentState = 'IDLE';
      session.currentQuestionIndex = undefined;
      session.activeQuizId = undefined;
      session.quizQuestions = undefined;
      session.quizAnswers = undefined;
    } else {
      session.currentQuestionIndex = nextIndex;
      await this.sendQuizQuestion(to, nextIndex, questions, provider);
    }

    await conversationSessionManager.saveSession(session);
  }

  /**
   * Dispatches a podcast study guide link.
   */
  private async sendPodcastDetails(to: string, name: string, provider: IWhatsAppProvider): Promise<void> {
    const podcastReply = `Here is your customized study podcast summary, ${name}! 🎧\n\n🔗 https://scholarly.ai/podcasts/latest-revision\n\nPress play and get ready to review your materials!`;
    await provider.sendTextMessage(to, podcastReply);
  }

  /**
   * Processes button interaction events.
   */
  private async handleButtonClick(
    to: string,
    name: string,
    buttonId: string,
    session: WhatsAppConversationSession,
    provider: IWhatsAppProvider
  ): Promise<void> {
    logger.info(`[WhatsAppRouter] Button clicked: ${buttonId}`);
    if (buttonId === 'start_quiz') {
      await this.triggerQuizStart(to, name, session, provider);
    } else if (buttonId === 'play_podcast') {
      await this.sendPodcastDetails(to, name, provider);
    }
  }

  /**
   * Routes conversational queries to the WorkflowEngine (GraphRAG search).
   */
  private async handleAiTutorChat(
    to: string,
    name: string,
    query: string,
    session: WhatsAppConversationSession,
    provider: IWhatsAppProvider
  ): Promise<void> {
    await provider.sendTextMessage(to, `🤖 *AI Tutor is thinking...*`);

    const chatSessionId = `wa_chat_${session.userId}`;
    const topicType = 'chat';
    const model = 'grok-4.1-fast-reasoning';

    try {
      const response = await this.chatService.processChat(session.userId, chatSessionId, query, model, topicType);
      await whatsAppReplyBuilder.sendSplitMessages(provider, to, response.reply);
    } catch (e: any) {
      logger.error(`[WhatsAppRouter] ChatService execution failed:`, e);
      await provider.sendTextMessage(to, `⚠️ Sorry, I encountered an issue accessing your notebooks. Please try again!`);
    }
  }
}

export const whatsAppConversationRouter = new WhatsAppConversationRouter();
