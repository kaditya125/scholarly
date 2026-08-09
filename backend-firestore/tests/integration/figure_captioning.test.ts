/**
 * Part 10 integration test — figure captioning + indexing (hermetic).
 *
 * Mocks the vision model, embeddings, Pinecone, and Firestore so the real
 * FigureCaptioningService orchestration is exercised end-to-end: vision JSON -> parse/validate
 * -> store FIGURES asset -> embed + upsert caption vectors, plus the graceful-degradation paths.
 */

const mockDescribeFigures = jest.fn();
jest.mock('../../src/services/ai/gemini.provider', () => ({
  GeminiProvider: jest.fn(() => ({ describeFigures: mockDescribeFigures })),
}));

const mockGenerateEmbeddings = jest.fn();
jest.mock('../../src/services/ai/providers/google-embedding.provider', () => ({
  GoogleEmbeddingProvider: jest.fn(() => ({ generateEmbeddings: mockGenerateEmbeddings })),
}));

const mockUpsert = jest.fn();
jest.mock('../../src/services/rag/pinecone.service', () => ({
  pineconeService: { upsertVectors: mockUpsert },
}));

const mockAdd = jest.fn();
jest.mock('../../src/config/firebase', () => ({
  firebaseApp: { firestore: () => ({ collection: () => ({ doc: () => ({ collection: () => ({ add: mockAdd }) }) }) }) },
  db: {},
}));

import { figureCaptioningService } from '../../src/services/figureCaptioning.service';

const source: any = { id: 's1', userId: 'u1', notebookId: 'ncert-c9-science', title: 'Chapter 1', createdAt: 123456 };

beforeEach(() => {
  jest.clearAllMocks();
  mockGenerateEmbeddings.mockResolvedValue([[0.1, 0.2, 0.3]]);
  mockUpsert.mockResolvedValue(undefined);
  mockAdd.mockResolvedValue({ id: 'asset1' });
});

describe('FigureCaptioningService.captionFigures', () => {
  it('stores a FIGURES asset and indexes caption vectors for valid figures', async () => {
    mockDescribeFigures.mockResolvedValue({
      text: JSON.stringify([{ page: 3, caption: 'Diagram of the human heart', labels: ['aorta', 'ventricle'], diagramType: 'diagram' }]),
      usage: { promptTokens: 100, completionTokens: 40 },
    });

    const count = await figureCaptioningService.captionFigures(source, 'BASE64', 'application/pdf');

    expect(count).toBe(1);
    // FIGURES asset stored.
    expect(mockAdd).toHaveBeenCalledTimes(1);
    expect(mockAdd.mock.calls[0][0]).toMatchObject({ type: 'FIGURES', notebookId: 'ncert-c9-science' });
    // Caption embedded + upserted with the deterministic figure vector id + normalized metadata.
    expect(mockUpsert).toHaveBeenCalledTimes(1);
    const vectors = mockUpsert.mock.calls[0][0];
    expect(vectors).toHaveLength(1);
    expect(vectors[0].id).toBe('s1_figure_0');
    expect(vectors[0].metadata.contentType).toBe('figure');
    expect(vectors[0].metadata.sourceId).toBe('s1');
    expect(vectors[0].metadata.text).toContain('human heart');
  });

  it('returns 0 and stores nothing when there are no figures', async () => {
    mockDescribeFigures.mockResolvedValue({ text: '[]', usage: { promptTokens: 50, completionTokens: 2 } });
    const count = await figureCaptioningService.captionFigures(source, 'BASE64', 'application/pdf');
    expect(count).toBe(0);
    expect(mockAdd).not.toHaveBeenCalled();
    expect(mockUpsert).not.toHaveBeenCalled();
  });

  it('degrades to 0 on unparseable vision output', async () => {
    mockDescribeFigures.mockResolvedValue({ text: 'the model rambled instead of JSON', usage: { promptTokens: 50, completionTokens: 20 } });
    const count = await figureCaptioningService.captionFigures(source, 'BASE64', 'application/pdf');
    expect(count).toBe(0);
    expect(mockAdd).not.toHaveBeenCalled();
  });

  it('degrades to 0 when the vision call throws', async () => {
    mockDescribeFigures.mockRejectedValue(new Error('vision unavailable'));
    const count = await figureCaptioningService.captionFigures(source, 'BASE64', 'application/pdf');
    expect(count).toBe(0);
    expect(mockAdd).not.toHaveBeenCalled();
    expect(mockUpsert).not.toHaveBeenCalled();
  });

  it('still stores the asset even if caption embedding/indexing fails', async () => {
    mockDescribeFigures.mockResolvedValue({
      text: JSON.stringify([{ caption: 'A labelled cell', diagramType: 'diagram' }]),
      usage: { promptTokens: 80, completionTokens: 30 },
    });
    mockGenerateEmbeddings.mockRejectedValue(new Error('embedding rate-limited'));

    const count = await figureCaptioningService.captionFigures(source, 'BASE64', 'application/pdf');

    expect(count).toBe(1);            // figures were captioned
    expect(mockAdd).toHaveBeenCalledTimes(1); // asset persisted
    expect(mockUpsert).not.toHaveBeenCalled(); // indexing failed, but non-fatal
  });
});
