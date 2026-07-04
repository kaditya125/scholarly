import { container, TOKENS } from './container';

// Import concrete implementations
import { GroqProvider } from '../../services/ai/groq.provider';
import { GoogleEmbeddingProvider } from '../../services/ai/providers/google-embedding.provider';
import { CohereRerankerProvider } from '../../services/ai/providers/cohere-reranker.provider';
import { cacheService } from '../../services/cache.service';
import { FirestoreGraphProvider } from '../providers/graph/FirestoreGraphProvider';
import { FirestoreMemoryProvider } from '../providers/memory/FirestoreMemoryProvider';
import { FirestoreAnalyticsProvider } from '../providers/analytics/FirestoreAnalyticsProvider';
// ... other providers can be added as they are implemented

export function bootstrapDI() {
  // Register AI Provider (Defaulting to Groq for now)
  container.register(TOKENS.AIProvider, new GroqProvider());
  
  // Register Embedding Provider
  container.register(TOKENS.EmbeddingProvider, new GoogleEmbeddingProvider());
  
  // Register Reranker Provider
  container.register(TOKENS.RerankerProvider, new CohereRerankerProvider());
  
  // Register Cache Provider
  container.register(TOKENS.CacheProvider, cacheService);
  
  // Register Graph Provider
  container.register(TOKENS.GraphProvider, new FirestoreGraphProvider());
  
  // Register Memory Provider
  container.register(TOKENS.MemoryProvider, new FirestoreMemoryProvider());
  
  // Register Analytics Provider (Adding a token for it too)
  container.register(Symbol.for('IAnalyticsProvider'), new FirestoreAnalyticsProvider());
  
  // VectorStore and Verification will be registered as implemented
  
  console.log('✅ Dependency Injection Container Bootstrapped.');
}
