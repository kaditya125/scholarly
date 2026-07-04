import { GoogleGenAI } from '@google/genai';
import { env } from '../../../config/env';
import { EmbeddingProvider } from '../embedding.provider.interface';

export class GoogleEmbeddingProvider implements EmbeddingProvider {
  private ai: GoogleGenAI;
  private modelName: string;

  constructor(modelName: string = 'text-embedding-004') {
    this.modelName = modelName;
    if (!env.GEMINI_API_KEY) {
      throw new Error('GEMINI_API_KEY is not defined in environment.');
    }
    this.ai = new GoogleGenAI({ apiKey: env.GEMINI_API_KEY });
  }

  async generateEmbedding(text: string): Promise<number[]> {
    const response = await this.ai.models.embedContent({
      model: this.modelName,
      contents: text
    });
    return response.embeddings?.[0]?.values || [];
  }

  async generateEmbeddings(texts: string[]): Promise<number[][]> {
    const response = await this.ai.models.embedContent({
      model: this.modelName,
      contents: texts
    });
    const embeddings = response.embeddings?.map(e => e.values) || [];
    return embeddings.filter((e): e is number[] => e !== undefined);
  }
}
