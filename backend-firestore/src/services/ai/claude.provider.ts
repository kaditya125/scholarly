import { AIProvider, AIProviderResponse } from './ai.provider.interface';
import { ChatMessage } from '../../types';

export class ClaudeProvider implements AIProvider {
  async generateResponse(history: ChatMessage[], systemPrompt?: string): Promise<AIProviderResponse> {
    const start = Date.now();
    
    // Placeholder for actual Anthropic SDK integration
    // Example: const msg = await anthropic.messages.create({...})
    
    const reply = "This is a placeholder response from the Claude Provider. Anthropic integration requires adding the @anthropic-ai/sdk package and configuring ANTHROPIC_API_KEY.";
    
    const end = Date.now();

    return {
      reply,
      usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
      timestamps: { start, end }
    };
  }
}
