import { logger } from '../../utils/logger';
import { GeminiProvider } from '../../services/ai/gemini.provider';

export type UserIntent =
  | 'start_quiz'
  | 'play_podcast'
  | 'help'
  | 'ask_ai'
  | 'solve_question'; // Solves screenshot questions

export interface ExecutionStep {
  intent: UserIntent;
  parameter?: string; // Optional context details like "Physics", "Atomic Structure"
}

export interface ExecutionPlan {
  steps: ExecutionStep[];
}

export class IntentPlanner {
  private llm = new GeminiProvider();

  /**
   * Evaluates incoming message content and constructs an ExecutionPlan.
   * Leverages fast keyword mapping for efficiency, falling back to GenAI for complex prompts.
   */
  public async planExecution(messageText: string, activeState?: string): Promise<ExecutionPlan> {
    const text = messageText.trim().toLowerCase();

    // 1. Hardcoded Fast-Paths
    if (text === 'help' || text === 'menu' || text === 'hi' || text === 'hello' || text === 'hii') {
      return { steps: [{ intent: 'help' }] };
    }
    if (text.includes('quiz') && (text.includes('start') || text.includes('take') || text.includes('give'))) {
      return { steps: [{ intent: 'start_quiz' }] };
    }
    if (text.includes('podcast') && (text.includes('play') || text.includes('listen') || text.includes('audio'))) {
      return { steps: [{ intent: 'play_podcast' }] };
    }

    // 2. State-Based Submissions
    if (activeState === 'QUIZ') {
      // If the user is currently taking a quiz, any simple reply is treated as a quiz answer submission
      return { steps: [{ intent: 'ask_ai' }] }; 
    }

    // 3. Fallback: LLM Classification for Multi-Intent or Contextual Parsing
    try {
      const systemPrompt = 'You are a query classifier. Categorize the user request into a sequence of intents. Output ONLY a valid JSON array of intents: [{"intent":"start_quiz"|"play_podcast"|"help"|"ask_ai","parameter":"..."}].';
      const prompt = `Classify this learning prompt: "${messageText}". Match it to study intents: start_quiz, play_podcast, help, ask_ai.`;

      const response = await this.llm.generateResponse(
        [{ role: 'user', content: prompt, timestamp: Date.now() }],
        systemPrompt,
        { operation: 'intent_classification' }
      );

      let raw = (response.reply || '').trim().replace(/```json/gi, '').replace(/```/g, '').trim();
      const start = raw.indexOf('[');
      const end = raw.lastIndexOf(']');
      if (start >= 0 && end > start) raw = raw.slice(start, end + 1);

      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return {
          steps: parsed.map(p => ({
            intent: p.intent as UserIntent,
            parameter: p.parameter
          }))
        };
      }
    } catch (e: any) {
      logger.warn('[IntentPlanner] GenAI intent classification failed, falling back to ask_ai.', e);
    }

    // Safe fallback: route to GraphRAG chatbot
    return { steps: [{ intent: 'ask_ai' }] };
  }
}

export const intentPlanner = new IntentPlanner();
