import { RetrievalService } from '../../src/services/rag/retrieval.service';
import { pineconeService } from '../../src/services/rag/pinecone.service';

// Mock the dependencies
jest.mock('../../src/services/rag/pinecone.service', () => ({
  pineconeService: {
    searchQuery: jest.fn()
  }
}));

describe('Resilience and Fallback', () => {
  it('should gracefully degrade if Pinecone throws an error', async () => {
    // Force pinecone to throw a timeout or connection error
    (pineconeService.searchQuery as jest.Mock).mockRejectedValue(new Error('Pinecone Connection Timeout'));

    const service = new RetrievalService();
    // We expect the retrieval to not crash the entire node process.
    // It should throw an error that the API route can catch and map to 503 Service Unavailable,
    // or return a degraded state (empty results).
    
    // In our current implementation, we are using Telemetry.measure which throws the error upwards.
    // We verify the error bubbles up correctly.
    await expect(service.retrieveContext('Test query', 'nb_123', undefined, 5)).rejects.toThrow('Pinecone Connection Timeout');
  });
});
