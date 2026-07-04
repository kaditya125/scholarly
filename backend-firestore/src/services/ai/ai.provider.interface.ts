import { ChatMessage } from '../../types';

export interface AIProviderResponse {
  reply: string;
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  timestamps: {
    start: number;
    end: number;
  };
}

export interface AIProvider {
  /**
   * Generates a response from the underlying LLM.
   * @param history The conversation history including the new user message.
   * @param systemPrompt Optional system instructions for the LLM.
   */
  generateResponse(history: ChatMessage[], systemPrompt?: string): Promise<AIProviderResponse>;
  
  /**
   * Generates a streaming response from the underlying LLM.
   * Yields chunks of text as they arrive.
   */
  generateStreamResponse?(history: ChatMessage[], systemPrompt?: string): AsyncGenerator<string, void, unknown>;
}
