import { GeminiProvider } from './ai/gemini.provider';
import { GroqProvider } from './ai/groq.provider';
import { SRIJYA_SYSTEM_PROMPT } from './knowledge/srijyaKnowledge';
import { Telemetry } from '../lib/telemetry';

/**
 * Ask Srijya — the assistant behind the Srijya corporate site.
 *
 * WHY THIS IS NOT HelpService
 *
 * HelpService answers for Sadhya, and it is Sadhya all the way down: its intent
 * classifier knows about teachers and classes, its CTAs point at product routes,
 * its follow-up questions are about live video and assignments. Pointing it at a
 * different corpus would produce answers shaped like a learning platform for
 * visitors asking about a consultancy.
 *
 * This is deliberately much smaller: one corpus, one prompt, one answer. There
 * is no session state, because a corporate site assistant answering five dozen
 * published facts does not need memory to be useful, and not storing anything is
 * a better default for an endpoint anyone on the internet can call.
 *
 * THE REFUSAL IS THE FEATURE
 *
 * The failure mode worth engineering against is not invention. It is answering a
 * question the visitor did not ask with a true sentence from nearby in the
 * corpus — which reads exactly like an answer. The prompt forbids it explicitly,
 * and the client falls back to its own grounded match if this service is
 * unreachable, so a visitor never sees an error where an answer should be.
 */
export class SrijyaAssistantService {
  private geminiProvider: GeminiProvider;
  private groqProvider: GroqProvider;

  constructor() {
    this.geminiProvider = new GeminiProvider();
    this.groqProvider = new GroqProvider();
  }

  /**
   * Answers one question. No history, no session, nothing persisted.
   *
   * Gemini first, Groq as the fallback — the same order and rationale as
   * HelpService, so an outage in one provider degrades both surfaces the same
   * way rather than each having its own surprising behaviour.
   */
  public async ask(query: string): Promise<{ answer: string }> {
    const started = Date.now();

    try {
      const answer = await this.execute(query);
      Telemetry.logLatency('srijya_assistant_ask', Date.now() - started, {
        provider: 'primary',
      });
      return { answer: answer.trim() };
    } catch (error) {
      console.error('[SrijyaAssistant] both providers failed:', error);
      /* Surfacing the model's absence to a visitor helps nobody, and the site
         already showed them a grounded answer from its published help centre
         before this request was made. Returning the refusal keeps the two
         surfaces saying the same thing. */
      return {
        answer:
          "I don't have enough verified information to answer that accurately. A person on the Srijya team can help — the contact page is the fastest route.",
      };
    }
  }

  private async execute(query: string): Promise<string> {
    const message = [{ role: 'user' as const, content: query, timestamp: Date.now() }];

    try {
      const res = await this.geminiProvider.generateResponse(message, SRIJYA_SYSTEM_PROMPT);
      return res.reply;
    } catch (e) {
      console.warn('[SrijyaAssistant] Gemini failed, falling back to Groq...', e);
      const res = await this.groqProvider.generateResponse(message, SRIJYA_SYSTEM_PROMPT);
      return res.reply;
    }
  }
}
