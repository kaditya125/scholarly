import { RetrievalService } from '../../src/services/rag/retrieval.service';
import { pineconeService } from '../../src/services/rag/pinecone.service';

// Mock the dependencies: the vector store, the query embedding (a live Vertex call otherwise) and the
// retrieval cache (a hit would skip the store entirely).
jest.mock('../../src/services/rag/pinecone.service', () => ({
  pineconeService: {
    queryVectors: jest.fn(),
  },
}));
jest.mock('../../src/services/ai/providers/google-embedding.provider', () => ({
  GoogleEmbeddingProvider: jest.fn().mockImplementation(() => ({
    generateEmbedding: jest.fn().mockResolvedValue([0.1, 0.2, 0.3]),
  })),
}));
jest.mock('../../src/services/cache.service', () => ({
  cacheService: { get: jest.fn().mockResolvedValue(null), set: jest.fn().mockResolvedValue(undefined) },
}));

describe('Resilience and Fallback', () => {
  it('surfaces a vector-store failure to the caller instead of crashing the process', async () => {
    // Force the vector store to throw a timeout or connection error
    (pineconeService.queryVectors as jest.Mock).mockRejectedValue(new Error('Pinecone Connection Timeout'));

    const service = new RetrievalService();
    // The error bubbles up, where the API route catches it and maps it to a 503 / degraded answer.
    await expect(service.retrieveContext('Test query', 'nb_123', undefined, 5)).rejects.toThrow('Pinecone Connection Timeout');
  });
});
