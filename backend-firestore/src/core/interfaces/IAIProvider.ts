/**
 * IAIProvider.ts
 * Core interface for generative AI models.
 */
export interface AIResponse {
  reply: string;
  context?: any;
}

export interface IAIProvider {
  /**
   * Generates a response from a sequence of chat messages.
   * @param messages The conversation history and current prompt.
   * @param options Additional generation options (temperature, maxTokens, etc.)
   */
  generateResponse(
    messages: { role: 'system' | 'user' | 'ai'; content: string }[],
    options?: any
  ): Promise<AIResponse>;
}
