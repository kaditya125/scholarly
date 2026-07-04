import Groq from 'groq-sdk';
import { env } from '../../config/env';
import { AIProvider, AIProviderResponse } from './ai.provider.interface';
import { ChatMessage } from '../../types';

export class GroqProvider implements AIProvider {
  private groq: Groq;
  private modelName: string;

  constructor(modelName: string = 'openai/gpt-oss-20b') {
    this.modelName = modelName;
    if (!env.GROQ_API_KEY) {
      throw new Error('GROQ_API_KEY is not defined in environment.');
    }
    this.groq = new Groq({ apiKey: env.GROQ_API_KEY });
  }

  async generateResponse(history: ChatMessage[], systemPrompt?: string): Promise<AIProviderResponse> {
    const start = Date.now();

    const messages: any[] = [];
    if (systemPrompt) {
      messages.push({ role: 'system', content: systemPrompt });
    }

    // Map internal ChatMessage format to Groq format
    history.forEach(msg => {
      messages.push({
        role: msg.role === 'ai' ? 'assistant' : 'user',
        content: msg.content
      });
    });

    const response = await this.groq.chat.completions.create({
      model: this.modelName,
      messages: messages,
      temperature: 0.7,
    });

    const end = Date.now();

    return {
      reply: response.choices[0]?.message?.content || 'No response generated.',
      usage: {
        promptTokens: response.usage?.prompt_tokens || 0,
        completionTokens: response.usage?.completion_tokens || 0,
        totalTokens: response.usage?.total_tokens || 0,
      },
      timestamps: { start, end }
    };
  }

  async *generateStreamResponse(history: ChatMessage[], systemPrompt?: string): AsyncGenerator<string, void, unknown> {
    const messages: any[] = [];
    if (systemPrompt) {
      messages.push({ role: 'system', content: systemPrompt });
    }

    history.forEach(msg => {
      messages.push({
        role: msg.role === 'ai' ? 'assistant' : 'user',
        content: msg.content
      });
    });

    const stream = await this.groq.chat.completions.create({
      model: this.modelName,
      messages: messages,
      temperature: 0.7,
      stream: true,
    });

    for await (const chunk of stream) {
      const content = chunk.choices[0]?.delta?.content;
      if (content) {
        yield content;
      }
    }
  }
}
