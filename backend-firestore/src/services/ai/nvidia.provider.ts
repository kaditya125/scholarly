import OpenAI from 'openai';
import { env } from '../../config/env';
import { AIProvider, AIProviderResponse } from './ai.provider.interface';
import { ChatMessage } from '../../types';

export class NvidiaProvider implements AIProvider {
  private openai: OpenAI;
  private modelName: string;

  constructor(modelName: string = 'meta/llama-3.1-405b-instruct') {
    this.modelName = modelName;
    if (!env.NVIDIA_API_KEY) {
      throw new Error('NVIDIA_API_KEY is not defined in environment.');
    }
    this.openai = new OpenAI({
      apiKey: env.NVIDIA_API_KEY,
      baseURL: 'https://integrate.api.nvidia.com/v1',
    });
  }

  async generateResponse(history: ChatMessage[], systemPrompt?: string): Promise<AIProviderResponse> {
    const start = Date.now();

    const messages = history.map(msg => ({
      role: msg.role === 'ai' ? 'assistant' : 'user',
      content: msg.content
    }));

    if (systemPrompt) {
      messages.unshift({ role: 'system', content: systemPrompt });
    }

    const response = await this.openai.chat.completions.create({
      model: this.modelName,
      messages: messages as any,
      temperature: 0.7,
      max_tokens: 1024,
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
    const messages = history.map(msg => ({
      role: msg.role === 'ai' ? 'assistant' : 'user',
      content: msg.content
    }));

    if (systemPrompt) {
      messages.unshift({ role: 'system', content: systemPrompt });
    }

    const stream = await this.openai.chat.completions.create({
      model: this.modelName,
      messages: messages as any,
      temperature: 0.7,
      max_tokens: 1024,
      stream: true,
    });

    for await (const chunk of stream) {
      const content = chunk.choices[0]?.delta?.content || '';
      if (content) {
        yield content;
      }
    }
  }
}
