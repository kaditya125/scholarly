import { RetrievalService, ExamContext } from '../../src/services/rag/retrieval.service';
import { pineconeService } from '../../src/services/rag/pinecone.service';
import { GoogleEmbeddingProvider } from '../../src/services/ai/providers/google-embedding.provider';
import { CohereRerankerProvider } from '../../src/services/ai/providers/cohere-reranker.provider';

jest.mock('../../src/services/rag/pinecone.service', () => ({
  pineconeService: {
    queryVectors: jest.fn(),
  },
}));

jest.mock('../../src/services/ai/providers/google-embedding.provider', () => ({
  GoogleEmbeddingProvider: jest.fn().mockImplementation(() => ({
    generateEmbedding: jest.fn().mockResolvedValue(new Array(768).fill(0.1)),
  })),
}));

jest.mock('../../src/services/ai/providers/cohere-reranker.provider', () => ({
  CohereRerankerProvider: jest.fn().mockImplementation(() => ({
    rerank: jest.fn().mockImplementation(async (query: string, docs: string[], topK: number) => {
      return docs.slice(0, topK).map((_, index) => ({ index, relevanceScore: 0.90 - index * 0.05 }));
    }),
  })),
}));

describe('RetrievalService — Exam Intelligence Integration', () => {
  let retrievalService: RetrievalService;

  beforeEach(() => {
    jest.clearAllMocks();
    retrievalService = new RetrievalService();
  });

  it('passes examId and documentType filter to Pinecone when examContext is provided', async () => {
    (pineconeService.queryVectors as jest.Mock).mockResolvedValue([
      {
        id: 'syl_1',
        score: 0.85,
        metadata: {
          text: 'SSC CGL Algebra syllabus details',
          examId: 'SSC_CGL',
          documentType: 'OFFICIAL_SYLLABUS',
          authority: 'OFFICIAL_SYLLABUS',
          sourceTitle: 'SSC CGL 2026 Official Syllabus',
        },
      },
    ]);

    const examCtx: ExamContext = {
      exam: 'SSC CGL',
      examId: 'SSC_CGL',
      scopeOfficialSyllabusOnly: true,
    };

    const results = await retrievalService.retrieveContext('What is in the algebra syllabus?', '', examCtx, 5);

    expect(pineconeService.queryVectors).toHaveBeenCalledWith(
      expect.any(Array),
      20, // topK * 4
      expect.objectContaining({
        examId: 'SSC_CGL',
        documentType: 'OFFICIAL_SYLLABUS',
      }),
      expect.any(String)
    );

    expect(results).toHaveLength(1);
    expect(results[0].text).toContain('SSC CGL Algebra');
  });

  it('boosts OFFICIAL_SYLLABUS chunks using knowledge authority layer (1.4x-1.5x)', async () => {
    (pineconeService.queryVectors as jest.Mock).mockResolvedValue([
      {
        id: 'syl_1',
        score: 0.80,
        metadata: {
          text: 'Official SSC CGL Algebra content',
          examId: 'SSC_CGL',
          documentType: 'OFFICIAL_SYLLABUS',
          authority: 'OFFICIAL_SYLLABUS',
          sourceTitle: 'Official Notice',
        },
      },
      {
        id: 'web_1',
        score: 0.80,
        metadata: {
          text: 'Random blog post about algebra',
          examId: 'SSC_CGL',
          documentType: 'GENERAL',
          authority: 'WEB_SEARCH',
          sourceTitle: 'Blog Post',
        },
      },
    ]);

    const results = await retrievalService.retrieveContext(
      'Algebra',
      '',
      { exam: 'SSC CGL', examId: 'SSC_CGL' },
      5
    );

    expect(results.length).toBe(2);
    // First result should be the official syllabus chunk
    expect(results[0].metadata.authority).toBe('OFFICIAL_SYLLABUS');
  });

  it('retrieveOfficialSyllabusContext calls retrieveContext with strict official syllabus scoping', async () => {
    (pineconeService.queryVectors as jest.Mock).mockResolvedValue([]);

    await retrievalService.retrieveOfficialSyllabusContext('UPSC_CSE', 'Prelims GS Paper 1 syllabus', 3);

    expect(pineconeService.queryVectors).toHaveBeenCalledWith(
      expect.any(Array),
      12, // 3 * 4
      expect.objectContaining({
        examId: 'UPSC_CSE',
        documentType: 'OFFICIAL_SYLLABUS',
      }),
      expect.any(String)
    );
  });
});
