export type AIModelClass = "fast" | "deep" | "reasoning" | "long_docs";

export interface AIProviderResponse {
  text: string;
  confidence: number;
  tokensUsed: number;
  latencyMs: number;
  activeModel: string;
}

export class AIProviderFactory {
  // Mock API calls for dependency injection of actual clients
  private async callGroq(prompt: string): Promise<AIProviderResponse> {
    const start = Date.now();
    await new Promise((r) => setTimeout(r, 200));
    return {
      text: `Groq (Fast) Response for: ${prompt}`,
      confidence: 0.85,
      tokensUsed: 150,
      latencyMs: Date.now() - start,
      activeModel: "groq-llama3",
    };
  }

  private async callGemini(prompt: string): Promise<AIProviderResponse> {
    const start = Date.now();
    await new Promise((r) => setTimeout(r, 500));
    return {
      text: `Gemini (Deep) Response for: ${prompt}`,
      confidence: 0.9,
      tokensUsed: 250,
      latencyMs: Date.now() - start,
      activeModel: "gemini-1.5-pro",
    };
  }

  private async callOpenAI(prompt: string): Promise<AIProviderResponse> {
    const start = Date.now();
    await new Promise((r) => setTimeout(r, 800));
    return {
      text: `OpenAI (Reasoning) Response for: ${prompt}`,
      confidence: 0.95,
      tokensUsed: 300,
      latencyMs: Date.now() - start,
      activeModel: "gpt-4o",
    };
  }

  private async callClaude(prompt: string): Promise<AIProviderResponse> {
    const start = Date.now();
    await new Promise((r) => setTimeout(r, 700));
    return {
      text: `Claude (Long Docs) Response for: ${prompt}`,
      confidence: 0.92,
      tokensUsed: 500,
      latencyMs: Date.now() - start,
      activeModel: "claude-3-opus",
    };
  }

  /**
   * Unified execution method with cost-aware and capability-aware routing.
   * Tries models in the prioritized order based on requiredModelClass.
   * Falls back to the next model in the list if one fails.
   */
  public async executeWithFallback(
    prompt: string,
    requiredModelClass: AIModelClass
  ): Promise<AIProviderResponse> {
    let order: ((prompt: string) => Promise<AIProviderResponse>)[] = [];

    // Prioritize models based on the required class, followed by fallbacks
    switch (requiredModelClass) {
      case "fast":
        order = [
          this.callGroq.bind(this),
          this.callGemini.bind(this),
          this.callOpenAI.bind(this),
          this.callClaude.bind(this),
        ];
        break;
      case "deep":
        order = [
          this.callGemini.bind(this),
          this.callOpenAI.bind(this),
          this.callClaude.bind(this),
          this.callGroq.bind(this),
        ];
        break;
      case "reasoning":
        order = [
          this.callOpenAI.bind(this),
          this.callClaude.bind(this),
          this.callGemini.bind(this),
          this.callGroq.bind(this),
        ];
        break;
      case "long_docs":
        order = [
          this.callClaude.bind(this),
          this.callGemini.bind(this),
          this.callOpenAI.bind(this),
          this.callGroq.bind(this),
        ];
        break;
      default:
        order = [
          this.callGroq.bind(this),
          this.callGemini.bind(this),
          this.callOpenAI.bind(this),
          this.callClaude.bind(this),
        ];
    }

    let lastError: any;

    for (const provider of order) {
      try {
        const response = await provider(prompt);
        return response;
      } catch (error) {
        lastError = error;
        console.warn(`[AIProviderFactory] Provider failed, falling back...`, error);
      }
    }

    throw new Error(
      `All AI providers failed. Last error: ${
        lastError?.message || lastError
      }`
    );
  }
}

export const aiProviderFactory = new AIProviderFactory();
