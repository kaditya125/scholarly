export interface EmbeddingProvider {
  /**
   * Generates a vector embedding for a given text.
   * @param text The string to embed.
   * @returns An array of numbers representing the vector embedding.
   */
  generateEmbedding(text: string): Promise<number[]>;

  /**
   * Generates vector embeddings for a batch of strings.
   * @param texts An array of strings to embed.
   * @returns An array of vector embeddings.
   */
  generateEmbeddings(texts: string[]): Promise<number[][]>;
}
