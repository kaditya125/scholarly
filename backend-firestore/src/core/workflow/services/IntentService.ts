import { ChatMessage } from '../../../types';
import { isGreetingMessage } from '../../../config/prompts';

/**
 * Result of intent classification for a chat turn. Mirrors exactly the inline logic
 * that used to live in WorkflowEngine.executeStream (greeting/short-history detection,
 * mode selection, and the human-readable "how it's doing it" detail line).
 */
export interface IntentResult {
  mode: string;
  isGreeting: boolean;
  isShortHistory: boolean;
  /** True when the turn should take the casual greeting/onboarding fast-reply path. */
  isGreetingFlow: boolean;
  wordCount: number;
  kind: string;
}

/**
 * IntentService — classifies the user's turn (greeting vs. learning question) and picks
 * the response mode. Pure and synchronous (no provider calls on the streaming path), which
 * matches the previous behavior: the streaming pipeline never called the intent LLM prompt;
 * it used `isGreetingMessage` + history length + `mode`.
 */
export class IntentService {
  classify(query: string, history: ChatMessage[], mode?: string): IntentResult {
    const resolvedMode = mode || 'TEACHER';
    const isGreeting = isGreetingMessage(query);
    const isShortHistory = history.filter((m) => m.role !== 'system').length <= 2;
    const isGreetingFlow = isGreeting && isShortHistory;
    const wordCount = query.trim().split(/\s+/).filter(Boolean).length;
    const kind = isGreetingFlow ? 'a casual / greeting message' : 'a learning question';
    return { mode: resolvedMode, isGreeting, isShortHistory, isGreetingFlow, wordCount, kind };
  }

  /** The intent "detail" progress line shown live in the client. */
  buildDetailMessage(intent: IntentResult): string {
    return `Read your ${intent.wordCount}-word message, classified it as ${intent.kind} and picked ${intent.mode} mode.`;
  }
}

export const intentService = new IntentService();
