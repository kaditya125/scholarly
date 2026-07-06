import Groq from 'groq-sdk';
import { env, assertAIEnabled } from '../../config/env';
import { AIProvider, AIProviderResponse } from './ai.provider.interface';
import { ChatMessage } from '../../types';
import { GeminiProvider } from './gemini.provider';

import { logger } from '../../utils/logger';
import { Telemetry } from '../../lib/telemetry';
import { withRetry, withTimeout } from '../../utils/retry';

export class GroqProvider implements AIProvider {
  private groq: Groq;
  private modelName: string;

  constructor(modelName: string = env.GROQ_MODEL || 'openai/gpt-oss-20b') {
    this.modelName = modelName;
    if (!env.GROQ_API_KEY) {
      throw new Error('GROQ_API_KEY is not defined in environment.');
    }
    this.groq = new Groq({ apiKey: env.GROQ_API_KEY });
  }

  /**
   * Supports two calling conventions that exist in the codebase:
   *   - AIProvider:  generateResponse(history, systemPromptString, traceId)
   *   - IAIProvider: generateResponse(messages, { traceId })  — the system message is
   *                  already included inside `history`, and the 2nd arg is an options object.
   * Only a STRING 2nd arg is treated as a system prompt; an object is treated as options.
   */
  private normalizeArgs(
    systemPromptArg?: string | { traceId?: string; [k: string]: any },
    traceIdArg?: string
  ): { systemPromptStr?: string; traceId?: string } {
    if (typeof systemPromptArg === 'string') {
      return { systemPromptStr: systemPromptArg, traceId: traceIdArg };
    }
    if (systemPromptArg && typeof systemPromptArg === 'object') {
      return { systemPromptStr: undefined, traceId: traceIdArg ?? systemPromptArg.traceId };
    }
    return { systemPromptStr: undefined, traceId: traceIdArg };
  }

  private buildMessages(history: ChatMessage[], systemPromptStr?: string): any[] {
    const messages: any[] = [];
    if (systemPromptStr) {
      messages.push({ role: 'system', content: systemPromptStr });
    }
    history.forEach(msg => {
      // Preserve system role when present; map internal 'ai' -> 'assistant'.
      const role = msg.role === 'ai' ? 'assistant' : (msg.role as string) === 'system' ? 'system' : 'user';
      messages.push({ role, content: msg.content });
    });
    return messages;
  }

  async generateResponse(
    history: ChatMessage[],
    systemPrompt?: string,
    opts?: { traceId?: string; model?: string }
  ): Promise<AIProviderResponse> {
    assertAIEnabled('Groq generateResponse');
    const start = Date.now();
    const { systemPromptStr, traceId: tid } = this.normalizeArgs(systemPrompt, opts?.traceId);

    logger.info(`Generating response via Groq`, { traceId: tid, modelName: this.modelName });

    const messages = this.buildMessages(history, systemPromptStr);

    try {
      // Resilience: 30s timeout + retry with backoff on transient errors (429/5xx/network).
      const response: any = await withRetry(
        () => withTimeout(
          this.groq.chat.completions.create({
            model: this.modelName,
            messages: messages,
            temperature: 0.7,
          }) as Promise<any>,
          30000,
          'groq.generateResponse'
        ),
        { label: 'groq.generateResponse' }
      );

      const end = Date.now();

      // Cost telemetry from real token usage (used for per-request cost attribution).
      Telemetry.logCost('groq', response.usage?.prompt_tokens || 0, 'input', { model: this.modelName, traceId: tid });
      Telemetry.logCost('groq', response.usage?.completion_tokens || 0, 'output', { model: this.modelName, traceId: tid });

      return {
        reply: response.choices[0]?.message?.content || 'No response generated.',
        usage: {
          promptTokens: response.usage?.prompt_tokens || 0,
          completionTokens: response.usage?.completion_tokens || 0,
          totalTokens: response.usage?.total_tokens || 0,
        },
        timestamps: { start, end }
      };
    } catch (error: any) {
      logger.warn(`GroqProvider generateResponse failed. Falling back to GeminiProvider...`, {
        error: error.message,
        status: error.status,
        code: error.code,
        traceId: tid
      });
      try {
        const gemini = new GeminiProvider();
        return await gemini.generateResponse(history, systemPromptStr);
      } catch (geminiError: any) {
        logger.error(`Fallback GeminiProvider also failed:`, { error: geminiError.message, traceId: tid });
        throw error;
      }
    }
  }

  async *generateStreamResponse(
    history: ChatMessage[],
    systemPrompt?: string,
    opts?: { traceId?: string; model?: string }
  ): AsyncGenerator<string, void, unknown> {
    assertAIEnabled('Groq generateStreamResponse');
    const { systemPromptStr, traceId: tid } = this.normalizeArgs(systemPrompt, opts?.traceId);
    const messages = this.buildMessages(history, systemPromptStr);

    let stream;
    try {
      stream = await this.groq.chat.completions.create({
        model: this.modelName,
        messages: messages,
        temperature: 0.7,
        stream: true,
      });
    } catch (error: any) {
      logger.warn(`GroqProvider generateStreamResponse initialization failed. Falling back to GeminiProvider...`, {
        error: error.message,
        status: error.status,
        traceId: tid
      });
      const gemini = new GeminiProvider();
      yield* gemini.generateStreamResponse(history, systemPromptStr);
      return;
    }

    try {
      for await (const chunk of stream) {
        const content = chunk.choices[0]?.delta?.content;
        if (content) {
          yield content;
        }
      }
    } catch (error: any) {
      logger.error(`GroqProvider streaming interrupted:`, { error: error.message, traceId: tid });
      throw error;
    }
  }
}
