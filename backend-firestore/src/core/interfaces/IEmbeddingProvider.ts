/**
 * IEmbeddingProvider.ts
 * Core interface for generating vector embeddings.
 */
export interface IEmbeddingProvider {
  /**
   * Generates embeddings for an array of strings.
   * @param texts The texts to embed.
   * @returns A promise resolving to an array of numeric arrays (embeddings).
   */
  generateEmbeddings(texts: string[]): Promise<number[][]>;

  /**
   * Generates a single embedding.
   */
  generateEmbedding(text: string): Promise<number[]>;
}
