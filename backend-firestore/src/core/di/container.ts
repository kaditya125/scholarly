export type Token<T> = string | symbol | (new (...args: any[]) => T);

class DIContainer {
  private registry = new Map<Token<any>, any>();

  /**
   * Registers a singleton instance or value.
   */
  register<T>(token: Token<T>, instance: T): void {
    this.registry.set(token, instance);
  }

  /**
   * Resolves a dependency by its token.
   * Throws an error if the dependency is not registered.
   */
  resolve<T>(token: Token<T>): T {
    const instance = this.registry.get(token);
    if (!instance) {
      const tokenName = typeof token === 'string' ? token : token.toString();
      throw new Error(`Dependency not found for token: ${tokenName}`);
    }
    return instance as T;
  }

  /**
   * Clears all registered dependencies. Useful for testing.
   */
  clear(): void {
    this.registry.clear();
  }
}

export const container = new DIContainer();

// Define standard tokens for core interfaces
export const TOKENS = {
  AIProvider: Symbol.for('IAIProvider'),
  EmbeddingProvider: Symbol.for('IEmbeddingProvider'),
  RerankerProvider: Symbol.for('IRerankerProvider'),
  CacheProvider: Symbol.for('ICacheProvider'),
  VectorStore: Symbol.for('IVectorStore'),
  SearchProvider: Symbol.for('ISearchProvider'),
  VerificationProvider: Symbol.for('IVerificationProvider'),
  GraphProvider: Symbol.for('IGraphProvider'),
  MemoryProvider: Symbol.for('IMemoryProvider'),
  AnalyticsProvider: Symbol.for('IAnalyticsProvider'),
};
