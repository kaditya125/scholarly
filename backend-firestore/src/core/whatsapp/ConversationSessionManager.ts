import { db } from '../../config/firebase';
import { logger } from '../../utils/logger';

export type WhatsAppState =
  | 'IDLE'
  | 'QUIZ'
  | 'PODCAST'
  | 'OCR'
  | 'DOCUMENT_UPLOAD'
  | 'SUMMARY'
  | 'REVISION'
  | 'STUDY_PLAN'
  | 'VOICE_CHAT'
  | 'MEMORY_UPDATE';

export interface WhatsAppConversationSession {
  userId: string;
  currentState: WhatsAppState;
  activeNotebookId?: string;
  activeQuizId?: string;
  currentQuestionIndex?: number;
  quizQuestions?: any[];
  quizAnswers?: number[];
  selectedLanguage?: string;
  lastInteractionTime: number;
}

const SESSION_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes

export class ConversationSessionManager {
  private collection = db.collection('conversation_sessions');

  /**
   * Retrieves an active conversation session for a user.
   * If it doesn't exist, returns a new IDLE session.
   * If the session has expired, resets the state to IDLE.
   */
  async getOrCreateSession(userId: string): Promise<WhatsAppConversationSession> {
    try {
      const docRef = this.collection.doc(userId);
      const doc = await docRef.get();

      const now = Date.now();
      const defaultSession: WhatsAppConversationSession = {
        userId,
        currentState: 'IDLE',
        selectedLanguage: 'en',
        lastInteractionTime: now,
      };

      if (!doc.exists) {
        await docRef.set(defaultSession);
        return defaultSession;
      }

      const session = doc.data() as WhatsAppConversationSession;

      // Check for timeout / session expiration
      if (now - session.lastInteractionTime > SESSION_TIMEOUT_MS) {
        logger.info(`[SessionManager] Session for ${userId} expired due to inactivity. Resetting to IDLE.`);
        const updated: WhatsAppConversationSession = {
          ...session,
          currentState: 'IDLE',
          currentQuestionIndex: undefined,
          activeQuizId: undefined,
          quizQuestions: undefined,
          quizAnswers: undefined,
          lastInteractionTime: now,
        };
        await docRef.set(updated);
        return updated;
      }

      return session;
    } catch (e: any) {
      logger.error(`[SessionManager] Error loading session for ${userId}:`, e);
      throw e;
    }
  }

  /**
   * Saves/Updates a conversation session in Firestore.
   */
  async saveSession(session: WhatsAppConversationSession): Promise<void> {
    try {
      session.lastInteractionTime = Date.now();
      await this.collection.doc(session.userId).set(session);
    } catch (e: any) {
      logger.error(`[SessionManager] Error saving session for ${session.userId}:`, e);
      throw e;
    }
  }

  /**
   * Resets the session state back to IDLE.
   */
  async resetSession(userId: string): Promise<WhatsAppConversationSession> {
    const fresh: WhatsAppConversationSession = {
      userId,
      currentState: 'IDLE',
      selectedLanguage: 'en',
      lastInteractionTime: Date.now(),
    };
    await this.saveSession(fresh);
    return fresh;
  }
}

export const conversationSessionManager = new ConversationSessionManager();
