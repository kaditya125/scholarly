import { AIProvider, AIProviderResponse } from './ai.provider.interface';
import { ChatMessage } from '../../types';

export class GPTProvider implements AIProvider {
  async generateResponse(history: ChatMessage[], systemPrompt?: string): Promise<AIProviderResponse> {
    const start = Date.now();
    
    // Placeholder for actual OpenAI SDK integration
    // Example: const completion = await openai.chat.completions.create({...})
    
    const reply = "This is a placeholder response from the GPT Provider. OpenAI integration requires adding the openai package and configuring OPENAI_API_KEY.";
    
    const end = Date.now();

    return {
      reply,
      usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
      timestamps: { start, end }
    };
  }
}
