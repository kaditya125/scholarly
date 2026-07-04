"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TOKENS = exports.container = void 0;
class DIContainer {
    registry = new Map();
    /**
     * Registers a singleton instance or value.
     */
    register(token, instance) {
        this.registry.set(token, instance);
    }
    /**
     * Resolves a dependency by its token.
     * Throws an error if the dependency is not registered.
     */
    resolve(token) {
        const instance = this.registry.get(token);
        if (!instance) {
            const tokenName = typeof token === 'string' ? token : token.toString();
            throw new Error(`Dependency not found for token: ${tokenName}`);
        }
        return instance;
    }
    /**
     * Clears all registered dependencies. Useful for testing.
     */
    clear() {
        this.registry.clear();
    }
}
exports.container = new DIContainer();
// Define standard tokens for core interfaces
exports.TOKENS = {
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
