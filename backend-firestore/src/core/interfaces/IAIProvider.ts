/**
 * IAIProvider.ts
 * Core interface for generative AI models.
 */
export interface AIResponse {
  reply: string;
  context?: any;
  telemetry?: {
    tokensUsed: number;
    latencyMs: number;
    provider: string;
    model: string;
    estimatedCost: number;
    traceId?: string;
  };
}

export interface IAIProvider {
  /**
   * Generates a response from a sequence of chat messages.
   * @param messages The conversation history and current prompt.
   * @param options Additional generation options (temperature, maxTokens, traceId, etc.)
   */
  generateResponse(
    messages: { role: 'system' | 'user' | 'ai'; content: string }[],
    systemPrompt?: string,
    options?: { userId?: string, [key: string]: any }
  ): Promise<AIResponse>;
}
