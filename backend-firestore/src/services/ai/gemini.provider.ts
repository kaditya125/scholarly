import { GoogleGenAI } from '@google/genai';
import { env } from '../../config/env';
import { AIProvider, AIProviderResponse } from './ai.provider.interface';
import { ChatMessage } from '../../types';

export class GeminiProvider implements AIProvider {
  private ai: GoogleGenAI;
  private modelName: string;

  constructor(modelName: string = 'gemini-2.5-flash') {
    this.modelName = modelName;
    if (!env.GEMINI_API_KEY) {
      throw new Error('GEMINI_API_KEY is not defined in environment.');
    }
    this.ai = new GoogleGenAI({ apiKey: env.GEMINI_API_KEY });
  }

  async generateResponse(history: ChatMessage[], systemPrompt?: string): Promise<AIProviderResponse> {
    const start = Date.now();

    // Map internal ChatMessage format to Gemini Content format
    const contents = history.map(msg => ({
      role: msg.role === 'ai' ? 'model' : 'user', // System messages handled differently or mapped to user
      parts: [{ text: msg.content }]
    }));

    const response = await this.ai.models.generateContent({
      model: this.modelName,
      contents: contents,
      config: {
        systemInstruction: systemPrompt,
        temperature: 0.7,
      }
    });

    const end = Date.now();

    return {
      reply: response.text || 'No response generated.',
      usage: {
        promptTokens: response.usageMetadata?.promptTokenCount || 0,
        completionTokens: response.usageMetadata?.candidatesTokenCount || 0,
        totalTokens: response.usageMetadata?.totalTokenCount || 0,
      },
      timestamps: { start, end }
    };
  }

  async *generateStreamResponse(history: ChatMessage[], systemPrompt?: string): AsyncGenerator<string, void, unknown> {
    const contents = history.map(msg => ({
      role: msg.role === 'ai' ? 'model' : 'user',
      parts: [{ text: msg.content }]
    }));

    const responseStream = await this.ai.models.generateContentStream({
      model: this.modelName,
      contents: contents,
      config: {
        systemInstruction: systemPrompt,
        temperature: 0.7,
      }
    });

    for await (const chunk of responseStream) {
      if (chunk.text) {
        yield chunk.text;
      }
    }
  }
}
