import { WhatsAppState } from './ConversationSessionManager';
import { logger } from '../../utils/logger';

export class ConversationStateMachine {
  private transitions: Record<WhatsAppState, WhatsAppState[]> = {
    IDLE: ['QUIZ', 'PODCAST', 'OCR', 'DOCUMENT_UPLOAD', 'SUMMARY', 'REVISION', 'STUDY_PLAN', 'VOICE_CHAT', 'MEMORY_UPDATE'],
    QUIZ: ['IDLE', 'OCR'], // Allow interrupting quiz with OCR screenshots to solve doubts mid-quiz
    PODCAST: ['IDLE', 'OCR'],
    OCR: ['IDLE', 'QUIZ', 'PODCAST'], // OCR can return to quiz/podcast once processed
    DOCUMENT_UPLOAD: ['IDLE'],
    SUMMARY: ['IDLE', 'QUIZ'], // SUMMARY can transition to quiz
    REVISION: ['IDLE'],
    STUDY_PLAN: ['IDLE'],
    VOICE_CHAT: ['IDLE'],
    MEMORY_UPDATE: ['IDLE'],
  };

  /**
   * Validates if a state transition is legal.
   * Logs warnings and rejects illegal transitions.
   */
  public transition(from: WhatsAppState, to: WhatsAppState): WhatsAppState {
    if (from === to) return from;

    const allowed = this.transitions[from] || [];
    if (allowed.includes(to)) {
      logger.info(`[StateMachine] Transitioned state: ${from} ➔ ${to}`);
      return to;
    }

    logger.warn(`[StateMachine] Illegal state transition attempted: ${from} ➔ ${to}. Reverting to IDLE.`);
    return 'IDLE';
  }
}

export const conversationStateMachine = new ConversationStateMachine();
