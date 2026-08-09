/**
 * ContentExplorationService Automated Tests
 * Phase 7: Content Exploration
 *
 * Tests:
 * 1. Keyword search accuracy & ranking
 * 2. Semantic vector search & cosine similarity
 * 3. Hybrid fusion ranking
 * 4. Deep metadata filtering (subject, grade, exam, language, chapter, collection)
 * 5. Exact page & source location resolution
 * 6. Deterministic 4-stage Source Lineage (Search Result -> Chunk -> Page -> Document)
 * 7. Document AST Structure & Knowledge Graph inspection
 * 8. User authorization & multi-tenant isolation
 */

import { ContentExplorationService } from '../../../src/core/pipeline/exploration/ContentExplorationService';
import { EmbeddingProvider } from '../../../src/services/ai/embedding.provider.interface';
import { SemanticChunk } from '../../../src/core/pipeline/types';

// Mock in-memory Embedding Provider
class MockEmbeddingProvider implements EmbeddingProvider {
  async generateEmbedding(text: string): Promise<number[]> {
    const [emb] = await this.generateEmbeddings([text]);
    return emb;
  }

  async generateEmbeddings(texts: string[]): Promise<number[][]> {
    return texts.map((text) => {
      // Deterministic pseudo-embedding based on character counts and terms
      const vec = new Array(768).fill(0);
      const lower = text.toLowerCase();

      if (lower.includes('photoelectric') || lower.includes('photon') || lower.includes('light')) {
        vec[0] = 0.9;
        vec[1] = 0.8;
        vec[2] = 0.7;
      }
      if (lower.includes('calculus') || lower.includes('derivative') || lower.includes('integral')) {
        vec[10] = 0.95;
        vec[11] = 0.85;
      }
      if (lower.includes('newton') || lower.includes('gravity') || lower.includes('force')) {
        vec[20] = 0.92;
        vec[21] = 0.88;
      }

      // Base non-zero norm
      vec[100] = 0.1;
      return vec;
    });
  }
}

// In-Memory mock for Firestore
const mockFirestoreData: Record<string, any> = {};

jest.mock('../../../src/config/firebase', () => {
  return {
    db: {
      collection: (colName: string) => ({
        doc: (docId: string) => ({
          get: async () => {
            const key = `${colName}/${docId}`;
            const data = mockFirestoreData[key];
            return {
              exists: !!data,
              id: docId,
              data: () => data,
            };
          },
          collection: (subColName: string) => ({
            get: async () => {
              const prefix = `${colName}/${docId}/${subColName}/`;
              const docs = Object.keys(mockFirestoreData)
                .filter((k) => k.startsWith(prefix))
                .map((k) => {
                  const subId = k.replace(prefix, '');
                  return {
                    id: subId,
                    data: () => mockFirestoreData[k],
                  };
                });
              return { empty: docs.length === 0, docs };
            },
            doc: (subDocId: string) => ({
              get: async () => {
                const key = `${colName}/${docId}/${subColName}/${subDocId}`;
                const data = mockFirestoreData[key];
                return {
                  exists: !!data,
                  id: subDocId,
                  data: () => data,
                };
              },
              collection: (deepSubCol: string) => ({
                orderBy: () => ({
                  get: async () => {
                    const prefix = `${colName}/${docId}/${subColName}/${subDocId}/${deepSubCol}/`;
                    const docs = Object.keys(mockFirestoreData)
                      .filter((k) => k.startsWith(prefix))
                      .map((k) => {
                        const dId = k.replace(prefix, '');
                        return {
                          id: dId,
                          data: () => mockFirestoreData[k],
                        };
                      });
                    return { empty: docs.length === 0, docs };
                  },
                }),
                get: async () => {
                  const prefix = `${colName}/${docId}/${subColName}/${subDocId}/${deepSubCol}/`;
                  const docs = Object.keys(mockFirestoreData)
                    .filter((k) => k.startsWith(prefix))
                    .map((k) => {
                      const dId = k.replace(prefix, '');
                      return {
                        id: dId,
                        data: () => mockFirestoreData[k],
                      };
                    });
                  return { empty: docs.length === 0, docs };
                },
              }),
            }),
            where: () => ({
              get: async () => {
                const prefix = `${colName}/${docId}/${subColName}/`;
                const docs = Object.keys(mockFirestoreData)
                  .filter((k) => k.startsWith(prefix))
                  .map((k) => ({
                    id: k.replace(prefix, ''),
                    data: () => mockFirestoreData[k],
                  }));
                return { empty: docs.length === 0, docs };
              },
            }),
          }),
        }),
        where: (field: string, op: string, val: any) => ({
          get: async () => {
            const prefix = `${colName}/`;
            const docs = Object.keys(mockFirestoreData)
              .filter((k) => k.startsWith(prefix) && k.split('/').length === 2)
              .map((k) => ({
                id: k.replace(prefix, ''),
                data: () => mockFirestoreData[k],
              }))
              .filter((d) => {
                const valInDoc = d.data()?.[field];
                if (op === '==') return valInDoc === val;
                if (op === 'array-contains') return Array.isArray(valInDoc) && valInDoc.includes(val);
                return true;
              });
            return { empty: docs.length === 0, docs };
          },
        }),
      }),
    },
  };
});

describe('Phase 7: ContentExplorationService Test Suite', () => {
  let service: ContentExplorationService;
  const mockEmbeddingProvider = new MockEmbeddingProvider();

  const userId = 'user_student_123';
  const collectionId = 'col_physics_101';
  const documentId = 'doc_photoelectric_exp';

  beforeEach(() => {
    // Reset in-memory store
    for (const key of Object.keys(mockFirestoreData)) {
      delete mockFirestoreData[key];
    }

    // Seed Collection
    mockFirestoreData[`notebooks/${collectionId}`] = {
      userId,
      name: 'Class 12 Physics Master Collection',
      owner: userId,
      editors: [],
      viewers: [],
    };

    // Seed Document Source
    mockFirestoreData[`notebooks/${collectionId}/sources/${documentId}`] = {
      id: documentId,
      notebookId: collectionId,
      userId,
      title: 'NCERT Physics Chapter 11: Dual Nature of Radiation',
      status: 'READY',
      version: 1,
      sizeBytes: 1024 * 750,
      checksum: 'a8b3c4d5e6f7890123456789abcdef0123456789abcdef0123456789abcdef01',
      storagePath: 'gs://scholarly-sources/physics/dual_nature.pdf',
      chunksExtracted: 3,
      conceptsExtracted: 2,
      metadata: {
        subject: 'Physics',
        classGrade: 'Class 12',
        exam: 'CBSE',
        language: 'English',
        author: 'NCERT Board',
      },
      createdAt: 1700000000000,
      updatedAt: 1700000050000,
    };

    // Seed Semantic Chunks
    const chunk1: SemanticChunk = {
      chunkId: 'chunk_pe_1',
      documentId,
      documentVersionId: 'v1_doc_photoelectric_exp',
      collectionId,
      text: 'The photoelectric effect is the emission of electrons when electromagnetic radiation such as light hits a material surface.',
      sequence: 1,
      pageNumber: 3,
      pageEnd: 3,
      chapter: 'Chapter 11: Dual Nature of Radiation and Matter',
      section: '11.2 Photoelectric Phenomenon & Experimental Observations',
      tokenCount: 45,
      charCount: 135,
      contentType: 'text',
      boundaryStrategy: 'paragraph_boundary',
      sourceLocation: {
        blockIds: ['b1'],
        pageStart: 3,
        pageEnd: 3,
        charStart: 100,
        charEnd: 235,
      },
    };

    const chunk2: SemanticChunk = {
      chunkId: 'chunk_pe_2',
      documentId,
      documentVersionId: 'v1_doc_photoelectric_exp',
      collectionId,
      text: 'Einstein explained photoelectric effect using Planck quantum hypothesis: Energy of photon E = h * nu. Kinetic energy K_max = h*nu - Phi.',
      sequence: 2,
      pageNumber: 4,
      pageEnd: 4,
      chapter: 'Chapter 11: Dual Nature of Radiation and Matter',
      section: '11.3 Einstein Photoelectric Equation & Energy Conservation',
      tokenCount: 52,
      charCount: 154,
      contentType: 'text',
      boundaryStrategy: 'paragraph_boundary',
      sourceLocation: {
        blockIds: ['b2'],
        pageStart: 4,
        pageEnd: 4,
        charStart: 500,
        charEnd: 654,
      },
    };

    const chunk3: SemanticChunk = {
      chunkId: 'chunk_pe_3',
      documentId,
      documentVersionId: 'v1_doc_photoelectric_exp',
      collectionId,
      text: 'Calculus derivatives can be applied to rate of change in classical kinematics equations.',
      sequence: 3,
      pageNumber: 8,
      pageEnd: 8,
      chapter: 'Chapter 11: Dual Nature of Radiation and Matter',
      section: '11.8 Mathematical Notes',
      tokenCount: 30,
      charCount: 95,
      contentType: 'text',
      boundaryStrategy: 'paragraph_boundary',
      sourceLocation: {
        blockIds: ['b3'],
        pageStart: 8,
        pageEnd: 8,
        charStart: 1200,
        charEnd: 1295,
      },
    };

    mockFirestoreData[`notebooks/${collectionId}/sources/${documentId}/chunks/chunk_pe_1`] = chunk1;
    mockFirestoreData[`notebooks/${collectionId}/sources/${documentId}/chunks/chunk_pe_2`] = chunk2;
    mockFirestoreData[`notebooks/${collectionId}/sources/${documentId}/chunks/chunk_pe_3`] = chunk3;

    service = new ContentExplorationService(mockEmbeddingProvider);
  });

  describe('1. Keyword Search Engine', () => {
    it('should find matching chunks with exact keyword and rank higher on section matches', async () => {
      const results = await service.search(userId, 'photoelectric effect Einstein', {}, { mode: 'keyword' });

      expect(results.length).toBeGreaterThanOrEqual(1);
      expect(results[0].chunkId).toBe('chunk_pe_2');
      expect(results[0].title).toContain('Einstein Photoelectric Equation');
      expect(results[0].snippet).toContain('Einstein');
      expect(results[0].relevanceScore).toBeGreaterThanOrEqual(40);
    });

    it('should extract rich contextual snippets with matching highlight tokens', async () => {
      const results = await service.search(userId, 'Planck quantum hypothesis', {}, { mode: 'keyword' });

      expect(results.length).toBe(1);
      expect(results[0].snippet).toContain('Planck quantum hypothesis');
      expect(results[0].pageNumber).toBe(4);
    });
  });

  describe('2. Semantic Vector Search', () => {
    it('should match conceptually related passages via embedding similarity', async () => {
      const results = await service.search(userId, 'light photon emission energy', {}, { mode: 'semantic' });

      expect(results.length).toBeGreaterThanOrEqual(1);
      expect(results[0].score).toBeGreaterThan(0.5);
      expect(results[0].relevanceScore).toBeGreaterThanOrEqual(50);
    });
  });

  describe('3. Hybrid Fusion Search', () => {
    it('should combine semantic and keyword scores with proper weighting', async () => {
      const results = await service.search(
        userId,
        'photoelectric emission of electrons',
        {},
        { mode: 'hybrid', semanticWeight: 0.6, keywordWeight: 0.4 }
      );

      expect(results.length).toBeGreaterThanOrEqual(1);
      expect(results[0].chunkId).toBe('chunk_pe_1');
      expect(results[0].searchMode).toBe('hybrid');
      expect(results[0].relevanceScore).toBeGreaterThan(50);
    });
  });

  describe('4. Metadata Filtering', () => {
    it('should filter results by subject', async () => {
      const physicsResults = await service.search(
        userId,
        'energy',
        { subject: 'Physics' },
        { mode: 'keyword' }
      );
      expect(physicsResults.length).toBeGreaterThan(0);

      const bioResults = await service.search(
        userId,
        'energy',
        { subject: 'Biology' },
        { mode: 'keyword' }
      );
      expect(bioResults.length).toBe(0);
    });

    it('should filter results by classGrade and exam', async () => {
      const cbseResults = await service.search(
        userId,
        'photoelectric',
        { classGrade: 'Class 12', exam: 'CBSE' },
        { mode: 'keyword' }
      );
      expect(cbseResults.length).toBeGreaterThan(0);

      const icseResults = await service.search(
        userId,
        'photoelectric',
        { exam: 'ICSE' },
        { mode: 'keyword' }
      );
      expect(icseResults.length).toBe(0);
    });
  });

  describe('5. Deterministic Source Lineage', () => {
    it('should return complete 4-level lineage path: Search Result -> Chunk -> Page -> Document', async () => {
      const results = await service.search(userId, 'photoelectric effect', {}, { mode: 'keyword' });
      expect(results.length).toBeGreaterThan(0);

      const topResult = results[0];
      const lineage = topResult.lineage;

      expect(lineage.documentId).toBe(documentId);
      expect(lineage.documentTitle).toContain('NCERT Physics');
      expect(lineage.collectionId).toBe(collectionId);
      expect(lineage.chunkId).toBe(topResult.chunkId);
      expect(lineage.pageNumber).toBe(topResult.pageNumber);
      expect(lineage.chapter).toContain('Dual Nature');

      // Test deep lineage resolver
      const resolved = await service.getDocumentLineage(userId, collectionId, documentId, topResult.chunkId);
      expect(resolved.chunk).not.toBeNull();
      expect(resolved.chunk?.chunkId).toBe(topResult.chunkId);
      expect(resolved.pageNumber).toBe(topResult.pageNumber);
      expect(resolved.document).not.toBeNull();
      expect(resolved.document?.checksum).toBe('a8b3c4d5e6f7890123456789abcdef0123456789abcdef0123456789abcdef01');
    });
  });

  describe('6. Document Workspace Inspections (AST Structure & Graph)', () => {
    it('should return hierarchical AST structure with chapters and sections', async () => {
      const structure = await service.getDocumentStructure(userId, collectionId, documentId);

      expect(structure.length).toBeGreaterThanOrEqual(1);
      const chapter = structure[0];
      expect(chapter.type).toBe('chapter');
      expect(chapter.children.length).toBeGreaterThan(0);
      expect(chapter.children[0].type).toBe('section');
      expect(chapter.pageNumber).toBeDefined();
    });

    it('should return document-scoped Knowledge Graph concept nodes', async () => {
      const graph = await service.getDocumentGraph(userId, collectionId, documentId);

      expect(graph.nodes).toBeDefined();
      expect(graph.nodes.length).toBeGreaterThan(0);
      expect(graph.nodes[0].label).toContain('NCERT Physics');
      expect(graph.nodes[0].definition).toBeDefined();
    });

    it('should return document immutable versions with hashes', async () => {
      const versions = await service.getDocumentVersions(userId, collectionId, documentId);

      expect(versions.length).toBeGreaterThanOrEqual(1);
      expect(versions[0].version).toBe(1);
      expect(versions[0].hash).toBe('a8b3c4d5e6f7890123456789abcdef0123456789abcdef0123456789abcdef01');
    });

    it('should return processing checkpoints and execution history', async () => {
      const history = await service.getDocumentHistory(userId, collectionId, documentId);

      expect(history.documentId).toBe(documentId);
      expect(history.status).toBe('READY');
      expect(history.progress).toBe(1.0);
    });
  });

  describe('7. Authorization & Multi-tenant Security', () => {
    it('should throw an error when unauthorized user attempts to access collection', async () => {
      await expect(
        service.getDocumentChunks('attacker_user_999', collectionId, documentId)
      ).rejects.toThrow('Access denied');
    });

    it('should throw an error when non-existent collection is queried', async () => {
      await expect(
        service.getDocumentChunks(userId, 'non_existent_collection', documentId)
      ).rejects.toThrow('not found');
    });
  });
});
