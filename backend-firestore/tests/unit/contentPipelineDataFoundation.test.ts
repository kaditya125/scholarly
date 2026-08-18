/**
 * Unit & Integration Tests for Content Pipeline Phase 1A: Data Foundation
 */

import {
  ContentSourceService,
  ContentSourceServiceError,
} from '../../src/core/pipeline/ContentSourceService';
import {
  canTransition,
  assertValidTransition,
  InvalidStateTransitionError,
  getAllowedNextStates,
} from '../../src/core/pipeline/stateMachine';
import {
  validateCreateSourceInput,
  validateUpdateSourceInput,
  isValidSha256,
  isAllowedContentType,
} from '../../src/core/pipeline/validation';
import {
  generateSourceId,
  generateDeterministicSourceId,
  generateVersionId,
  generateJobId,
  generateRunId,
  generateChunkId,
  generateSha256Hash,
} from '../../src/core/pipeline/idGenerator';
import { db } from '../../src/config/firebase';
import { notebookRepository } from '../../src/repositories/notebook.repository';
import { sourceRepository } from '../../src/repositories/source.repository';

describe('Content Pipeline Phase 1A: Data Foundation', () => {
  let service: ContentSourceService;

  const mockOwnerId = 'user_alice_123';
  const mockEditorId = 'user_bob_editor';
  const mockViewerId = 'user_carol_viewer';
  const mockUnauthorizedId = 'user_mallory_intruder';
  const mockCollectionId = 'notebook_math_101';

  const mockNotebook = {
    id: mockCollectionId,
    userId: mockOwnerId,
    owner: mockOwnerId,
    title: 'Class 10 Mathematics',
    editors: [mockEditorId],
    viewers: [mockViewerId],
    stats: { documentCount: 0 },
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };

  const sampleSha256 = 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';

  beforeEach(() => {
    jest.clearAllMocks();
    service = new ContentSourceService();

    jest.spyOn(db, 'collection').mockImplementation((colName: string): any => {
      if (colName === 'notebooks') {
        return {
          doc: (docId: string) => {
            const exists = docId === mockCollectionId;
            return {
              get: jest.fn().mockResolvedValue({
                exists,
                id: docId,
                data: () => (exists ? mockNotebook : undefined),
              }),
              collection: (subCol: string) => ({
                doc: (subDocId: string) => ({
                  set: jest.fn().mockResolvedValue(undefined),
                  get: jest.fn().mockResolvedValue({ exists: false, data: () => ({}) }),
                  update: jest.fn().mockResolvedValue(undefined),
                  delete: jest.fn().mockResolvedValue(undefined),
                  collection: (nestedCol: string) => ({
                    doc: (nestedDocId: string) => ({
                      set: jest.fn().mockResolvedValue(undefined),
                      get: jest.fn().mockResolvedValue({ exists: false, data: () => ({}) }),
                    }),
                    orderBy: jest.fn().mockReturnThis(),
                    get: jest.fn().mockResolvedValue({ docs: [], empty: true }),
                  }),
                }),
                where: jest.fn().mockReturnThis(),
                get: jest.fn().mockResolvedValue({ docs: [], empty: true }),
              }),
            };
          },
        };
      }
      return {
        doc: () => ({ get: jest.fn().mockResolvedValue({ exists: false }) }),
      };
    });
  });

  describe('1. ID Generator & Utilities', () => {
    it('generates unique IDs with proper prefixes', () => {
      const sourceId = generateSourceId();
      expect(sourceId).toMatch(/^src_[a-zA-Z0-9_-]+/);

      const customSourceId = generateSourceId('custom_prefix');
      expect(customSourceId).toMatch(/^custom_prefix_[a-zA-Z0-9_-]+/);

      const jobId = generateJobId();
      expect(jobId).toMatch(/^pjob_[a-zA-Z0-9_-]+/);

      const runId = generateRunId();
      expect(runId).toMatch(/^prun_[a-zA-Z0-9_-]+/);

      const versionId = generateVersionId('src_123', 2);
      expect(versionId).toBe('src_123_v2');

      const chunkId = generateChunkId('src_123', 5);
      expect(chunkId).toBe('src_123_chunk_5');
    });

    it('generates deterministic source IDs from collection and hash', () => {
      const id1 = generateDeterministicSourceId(mockCollectionId, sampleSha256);
      const id2 = generateDeterministicSourceId(mockCollectionId, sampleSha256);
      expect(id1).toBe(id2);
      expect(id1).toMatch(/^src_det_[a-f0-9]{16}$/);
    });

    it('computes SHA-256 hashes accurately', () => {
      const hash = generateSha256Hash('Sadhya AI Education');
      expect(hash).toHaveLength(64);
      expect(isValidSha256(hash)).toBe(true);
    });
  });

  describe('2. Validation & Schema Enforcement', () => {
    it('validates a valid create source input', () => {
      const input = {
        collectionId: mockCollectionId,
        title: 'Chapter 1 Real Numbers',
        originalName: 'chapter1_real_numbers.pdf',
        contentType: 'application/pdf',
        sizeBytes: 1048576,
        storagePath: `notebooks/${mockCollectionId}/sources/src_123/file.pdf`,
        hash: sampleSha256,
        metadata: { subject: 'Mathematics' },
      };

      const validated = validateCreateSourceInput(input);
      expect(validated.title).toBe('Chapter 1 Real Numbers');
      expect(validated.sizeBytes).toBe(1048576);
      expect(isAllowedContentType(validated.contentType)).toBe(true);
    });

    it('throws validation error when required fields are missing', () => {
      expect(() => {
        validateCreateSourceInput({
          collectionId: '',
          title: 'Missing fields',
        });
      }).toThrow();
    });

    it('rejects negative sizeBytes or oversized files', () => {
      expect(() => {
        validateCreateSourceInput({
          collectionId: mockCollectionId,
          title: 'Bad Size',
          originalName: 'test.pdf',
          contentType: 'application/pdf',
          sizeBytes: -10,
          storagePath: 'path/to/file',
        });
      }).toThrow();

      expect(() => {
        validateCreateSourceInput({
          collectionId: mockCollectionId,
          title: 'Huge File',
          originalName: 'huge.pdf',
          contentType: 'application/pdf',
          sizeBytes: 300 * 1024 * 1024, // 300MB exceeds 250MB limit
          storagePath: 'path/to/file',
        });
      }).toThrow();
    });

    it('validates SHA-256 format strictly', () => {
      expect(isValidSha256(sampleSha256)).toBe(true);
      expect(isValidSha256('invalid-hash-string')).toBe(false);
      expect(isValidSha256('')).toBe(false);
      expect(isValidSha256(undefined)).toBe(false);
    });
  });

  describe('3. State Machine & Transition Rules', () => {
    it('allows valid progressive lifecycle transitions', () => {
      expect(canTransition('DRAFT', 'UPLOADING')).toBe(true);
      expect(canTransition('UPLOADING', 'QUEUED')).toBe(true);
      expect(canTransition('QUEUED', 'PROCESSING')).toBe(true);
      expect(canTransition('PROCESSING', 'READY')).toBe(true);
      expect(canTransition('PROCESSING', 'FAILED')).toBe(true);
      expect(canTransition('FAILED', 'QUEUED')).toBe(true); // Retry
      expect(canTransition('READY', 'ARCHIVED')).toBe(true);
      expect(canTransition('ARCHIVED', 'QUEUED')).toBe(true); // Restore
    });

    it('allows idempotent self-transitions', () => {
      expect(canTransition('PROCESSING', 'PROCESSING')).toBe(true);
      expect(canTransition('READY', 'READY')).toBe(true);
    });

    it('rejects invalid state transitions', () => {
      expect(canTransition('ARCHIVED', 'PROCESSING')).toBe(false);
      expect(canTransition('DRAFT', 'READY')).toBe(false);
      expect(canTransition('UPLOADING', 'READY')).toBe(false);

      expect(() => {
        assertValidTransition('ARCHIVED', 'PROCESSING');
      }).toThrow(InvalidStateTransitionError);
    });

    it('returns allowed next states correctly', () => {
      const allowed = getAllowedNextStates('QUEUED');
      expect(allowed).toContain('PROCESSING');
      expect(allowed).toContain('CANCELLED');
      expect(allowed).toContain('FAILED');
    });
  });

  describe('4. ContentSource Lifecycle Operations (CRUD)', () => {
    it('creates a new ContentSource successfully', async () => {
      const createSpy = jest.spyOn(sourceRepository, 'createSource').mockResolvedValue(undefined);

      const source = await service.createSource(mockOwnerId, {
        collectionId: mockCollectionId,
        title: 'NCERT Physics Chapter 1',
        originalName: 'ncert_physics_1.pdf',
        contentType: 'application/pdf',
        sizeBytes: 2048500,
        storagePath: `notebooks/${mockCollectionId}/sources/src_1/ncert.pdf`,
        hash: sampleSha256,
        metadata: { grade: 10, subject: 'Physics' },
      });

      expect(source.id).toMatch(/^src_/);
      expect(source.userId).toBe(mockOwnerId);
      expect(source.collectionId).toBe(mockCollectionId);
      expect(source.status).toBe('QUEUED');
      expect(source.version).toBe(1);
      expect(source.hash).toBe(sampleSha256);
      expect(createSpy).toHaveBeenCalledTimes(1);
    });

    it('fetches a source with authorization check', async () => {
      const mockDoc = {
        id: 'src_doc_1',
        userId: mockOwnerId,
        collectionId: mockCollectionId,
        title: 'Test Doc',
        status: 'READY',
        sizeBytes: 1000,
      };
      jest.spyOn(sourceRepository, 'getSource').mockResolvedValue(mockDoc as any);

      const source = await service.getSource(mockOwnerId, mockCollectionId, 'src_doc_1');
      expect(source.id).toBe('src_doc_1');
      expect(source.status).toBe('READY');
    });

    it('updates a source and enforces transition validation', async () => {
      const mockDoc = {
        id: 'src_doc_1',
        userId: mockOwnerId,
        collectionId: mockCollectionId,
        title: 'Test Doc',
        status: 'QUEUED',
        sizeBytes: 1000,
      };
      jest.spyOn(sourceRepository, 'getSource').mockResolvedValue(mockDoc as any);
      const updateSpy = jest.spyOn(sourceRepository, 'updateSource').mockResolvedValue(undefined);

      const updated = await service.updateSource(mockOwnerId, mockCollectionId, 'src_doc_1', {
        title: 'Updated Chapter Title',
      });

      expect(updated.title).toBe('Updated Chapter Title');
      expect(updateSpy).toHaveBeenCalledTimes(1);
    });

    it('transitions processing state and sets failure diagnostics on FAILED', async () => {
      const mockDoc = {
        id: 'src_doc_1',
        userId: mockOwnerId,
        collectionId: mockCollectionId,
        title: 'Test Doc',
        status: 'PROCESSING',
        sizeBytes: 1000,
      };
      jest.spyOn(sourceRepository, 'getSource').mockResolvedValue(mockDoc as any);
      const updateSpy = jest.spyOn(sourceRepository, 'updateSource').mockResolvedValue(undefined);

      const failed = await service.transitionState(mockOwnerId, mockCollectionId, 'src_doc_1', 'FAILED', {
        error: {
          code: 'EXTRACTION_TIMEOUT',
          message: 'PDF parser timed out after 60s',
          recoverable: true,
          timestamp: Date.now(),
        },
        currentStage: 'EXTRACT',
      });

      expect(failed.status).toBe('FAILED');
      expect(failed.failureReason).toBe('EXTRACTION_TIMEOUT');
      expect(failed.errorDetails).toBe('PDF parser timed out after 60s');
      expect(updateSpy).toHaveBeenCalledTimes(1);
    });

    it('archives and restores a source', async () => {
      const mockDoc = {
        id: 'src_doc_1',
        userId: mockOwnerId,
        collectionId: mockCollectionId,
        title: 'Test Doc',
        status: 'READY',
        sizeBytes: 1000,
      };
      jest.spyOn(sourceRepository, 'getSource').mockResolvedValue(mockDoc as any);
      jest.spyOn(sourceRepository, 'updateSource').mockResolvedValue(undefined);

      const archived = await service.archiveSource(mockOwnerId, mockCollectionId, 'src_doc_1');
      expect(archived.status).toBe('ARCHIVED');
      expect(archived.archivedAt).toBeDefined();

      // Mock getSource returning archived doc
      jest.spyOn(sourceRepository, 'getSource').mockResolvedValue(archived as any);

      const restored = await service.restoreSource(mockOwnerId, mockCollectionId, 'src_doc_1');
      expect(restored.status).toBe('QUEUED');
      expect(restored.archivedAt).toBeUndefined();
    });
  });

  describe('5. Duplicate Source Detection', () => {
    it('detects duplicate hash and throws 409 DUPLICATE_SOURCE on creation', async () => {
      // Mock detectDuplicate returning existing active source
      jest.spyOn(service, 'detectDuplicate').mockResolvedValue({
        id: 'src_existing_123',
        status: 'READY',
        hash: sampleSha256,
      } as any);

      await expect(
        service.createSource(mockOwnerId, {
          collectionId: mockCollectionId,
          title: 'Duplicate Book',
          originalName: 'book.pdf',
          contentType: 'application/pdf',
          sizeBytes: 5000,
          storagePath: 'path/to/book.pdf',
          hash: sampleSha256,
        })
      ).rejects.toThrow(ContentSourceServiceError);
    });
  });

  describe('6. Authorization & User Isolation', () => {
    it('allows owner to perform all operations', async () => {
      jest.spyOn(sourceRepository, 'getSource').mockResolvedValue({
        id: 'src_1',
        userId: mockOwnerId,
        collectionId: mockCollectionId,
        status: 'QUEUED',
      } as any);

      await expect(service.getSource(mockOwnerId, mockCollectionId, 'src_1')).resolves.toBeDefined();
    });

    it('allows authorized editor to update and transition state', async () => {
      jest.spyOn(sourceRepository, 'getSource').mockResolvedValue({
        id: 'src_1',
        userId: mockOwnerId,
        collectionId: mockCollectionId,
        status: 'QUEUED',
      } as any);
      jest.spyOn(sourceRepository, 'updateSource').mockResolvedValue(undefined);

      await expect(service.updateSource(mockEditorId, mockCollectionId, 'src_1', { title: 'Editor Edit' })).resolves.toBeDefined();
    });

    it('allows viewer to read but prevents write operations', async () => {
      jest.spyOn(sourceRepository, 'getSource').mockResolvedValue({
        id: 'src_1',
        userId: mockOwnerId,
        collectionId: mockCollectionId,
        status: 'READY',
      } as any);

      // Viewer read: OK
      await expect(service.getSource(mockViewerId, mockCollectionId, 'src_1')).resolves.toBeDefined();

      // Viewer write: FORBIDDEN
      await expect(
        service.updateSource(mockViewerId, mockCollectionId, 'src_1', { title: 'Hacked Title' })
      ).rejects.toThrow(ContentSourceServiceError);
    });

    it('strictly denies unauthorized users from accessing collection', async () => {
      await expect(service.getSource(mockUnauthorizedId, mockCollectionId, 'src_1')).rejects.toThrow(
        ContentSourceServiceError
      );

      await expect(
        service.createSource(mockUnauthorizedId, {
          collectionId: mockCollectionId,
          title: 'Unauthorized Source',
          originalName: 'test.pdf',
          contentType: 'application/pdf',
          sizeBytes: 1000,
          storagePath: 'storage/test.pdf',
        })
      ).rejects.toThrow(ContentSourceServiceError);
    });

    it('throws 404 when collection does not exist', async () => {
      await expect(service.getSource(mockOwnerId, 'non_existent_collection', 'src_1')).rejects.toThrow(
        ContentSourceServiceError
      );
    });
  });

  describe('7. Document Versioning & Lineage', () => {
    it('creates a new DocumentVersion snapshot and increments parent version', async () => {
      const mockDoc = {
        id: 'src_doc_1',
        userId: mockOwnerId,
        collectionId: mockCollectionId,
        title: 'Original Chapter',
        status: 'READY',
        version: 1,
        sizeBytes: 5000,
        storagePath: 'path/v1.pdf',
        hash: sampleSha256,
        metadata: { original: true },
      };
      jest.spyOn(sourceRepository, 'getSource').mockResolvedValue(mockDoc as any);
      const updateSpy = jest.spyOn(sourceRepository, 'updateSource').mockResolvedValue(undefined);

      const version = await service.createDocumentVersion(
        mockOwnerId,
        mockCollectionId,
        'src_doc_1',
        'Updated diagrams in Section 2'
      );

      expect(version.id).toBe('src_doc_1_v2');
      expect(version.version).toBe(2);
      expect(version.changeSummary).toBe('Updated diagrams in Section 2');
      expect(version.hash).toBe(sampleSha256);
      expect(updateSpy).toHaveBeenCalledWith(mockCollectionId, 'src_doc_1', expect.objectContaining({ version: 2 }));
    });
  });
});
