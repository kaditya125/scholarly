/**
 * ContentSourceService
 * Core Domain Service for Content Pipeline Phase 1A & Phase 2A: Content Upload & Storage
 * 
 * Reuses existing Firebase Firestore infrastructure (db, sourceRepository, notebookRepository).
 * Enforces validation, authorization, user isolation, idempotency, storage integration, and state transitions.
 */

import { db } from '../../config/firebase';
import {
  ContentSource,
  CreateSourceInput,
  UpdateSourceInput,
  ProcessingState,
  ProcessingStageName,
  ProcessingError,
  DocumentVersion,
  ProcessingJob,
} from './types';
import {
  validateCreateSourceInput,
  validateUpdateSourceInput,
  validateUploadedFile,
  sanitizeFilename,
} from './validation';
import { assertValidTransition } from './stateMachine';
import { generateSourceId, generateVersionId, generateJobId } from './idGenerator';
import { notebookRepository } from '../../repositories/notebook.repository';
import { sourceRepository } from '../../repositories/source.repository';
import { contentStorageService, StoredFileResult } from './ContentStorageService';
import { notebookService } from '../../services/notebook.service';

export class ContentSourceServiceError extends Error {
  public readonly code: string;
  public readonly statusCode: number;

  constructor(code: string, message: string, statusCode = 400) {
    super(message);
    this.name = 'ContentSourceServiceError';
    this.code = code;
    this.statusCode = statusCode;
  }
}

export interface UploadSourceOptions {
  customTitle?: string;
  metadata?: Record<string, any>;
  skipDuplicateCheck?: boolean;
}

export interface ProcessUploadResult {
  source: ContentSource;
  job?: ProcessingJob;
  isDuplicate?: boolean;
}

export class ContentSourceService {
  /**
   * Helper to verify that the user has permission to access or modify a collection (notebook).
   */
  async ensureCollectionAccess(userId: string, collectionId: string, requireWrite = false): Promise<void> {
    if (!userId || !userId.trim()) {
      throw new ContentSourceServiceError('UNAUTHORIZED', 'Authentication is required', 401);
    }
    if (!collectionId || !collectionId.trim()) {
      throw new ContentSourceServiceError('INVALID_COLLECTION', 'Collection ID is required', 400);
    }

    const doc = await db.collection('notebooks').doc(collectionId).get();
    if (!doc.exists) {
      throw new ContentSourceServiceError('COLLECTION_NOT_FOUND', `Collection ${collectionId} was not found`, 404);
    }

    const notebook = doc.data() as any;
    const isOwner = notebook.userId === userId || notebook.owner === userId;
    const isEditor = Array.isArray(notebook.editors) && notebook.editors.includes(userId);
    const isViewer = Array.isArray(notebook.viewers) && notebook.viewers.includes(userId);

    if (requireWrite) {
      if (!isOwner && !isEditor) {
        throw new ContentSourceServiceError('FORBIDDEN', `User ${userId} does not have write access to collection ${collectionId}`, 403);
      }
    } else {
      if (!isOwner && !isEditor && !isViewer) {
        throw new ContentSourceServiceError('FORBIDDEN', `User ${userId} does not have read access to collection ${collectionId}`, 403);
      }
    }
  }

  /**
   * Detects if an active (non-archived) source with the same SHA-256 hash already exists in the collection.
   */
  async detectDuplicate(userId: string, collectionId: string, hash: string): Promise<ContentSource | null> {
    await this.ensureCollectionAccess(userId, collectionId, false);
    if (!hash) return null;

    const snap = await db
      .collection('notebooks')
      .doc(collectionId)
      .collection('sources')
      .where('hash', '==', hash)
      .get();

    if (snap.empty) {
      // Also check legacy checksum field for compatibility
      const legacySnap = await db
        .collection('notebooks')
        .doc(collectionId)
        .collection('sources')
        .where('checksum', '==', hash)
        .get();
      if (legacySnap.empty) return null;
      const legacySources = legacySnap.docs.map(doc => doc.data() as ContentSource);
      return legacySources.find(s => s.status !== 'ARCHIVED') || null;
    }

    const sources = snap.docs.map(doc => doc.data() as ContentSource);
    const active = sources.find(s => s.status !== 'ARCHIVED');
    return active || null;
  }

  /**
   * Comprehensive Phase 2A Upload Flow:
   * 1. Validate file (type, size, filename)
   * 2. Verify user permissions
   * 3. Compute hash and check duplicate
   * 4. Upload to tenant-isolated cloud storage
   * 5. Create ContentSource with status = QUEUED
   * 6. Create initial ProcessingJob
   * 7. Record timeline event
   */
  async processUpload(
    userId: string,
    collectionId: string,
    file: Express.Multer.File,
    options: UploadSourceOptions = {}
  ): Promise<ProcessUploadResult> {
    // 1. Validate file
    const validation = validateUploadedFile(file);
    if (!validation.isValid) {
      throw new ContentSourceServiceError('INVALID_FILE', validation.error || 'File validation failed', 400);
    }

    // 2. Ensure write access
    await this.ensureCollectionAccess(userId, collectionId, true);

    // 3. Compute hash and check duplicate
    const hash = contentStorageService.computeHash(file.buffer);
    if (!options.skipDuplicateCheck) {
      const duplicate = await this.detectDuplicate(userId, collectionId, hash);
      if (duplicate && duplicate.status === 'READY') {
        return {
          source: duplicate,
          isDuplicate: true,
        };
      }
    }

    const sourceId = generateSourceId();
    const now = Date.now();
    const safeTitle = options.customTitle?.trim() || validation.safeFilename;

    // 4. Upload to isolated storage path
    let storageResult: StoredFileResult;
    try {
      storageResult = await contentStorageService.uploadOriginal(
        userId,
        collectionId,
        sourceId,
        validation.safeFilename,
        file.buffer,
        validation.contentType
      );
    } catch (err: any) {
      throw new ContentSourceServiceError('STORAGE_ERROR', `Cloud storage upload failed: ${err.message}`, 502);
    }

    // 5. Create ContentSource entity
    const source: ContentSource = {
      id: sourceId,
      userId,
      collectionId,
      notebookId: collectionId,
      title: safeTitle,
      originalName: validation.safeFilename,
      contentType: validation.contentType,
      mimeType: validation.contentType,
      sizeBytes: file.size,
      storagePath: storageResult.storagePath,
      gcsPath: storageResult.gcsPath,
      downloadUrl: storageResult.downloadUrl,
      status: 'QUEUED',
      currentStage: 'UPLOAD',
      metadata: {
        extension: validation.extension,
        uploadedAt: now,
        sha256: hash,
        ...(options.metadata || {}),
      },
      createdAt: now,
      updatedAt: now,
      version: 1,
      hash,
      checksum: hash,
      chunksExtracted: 0,
      conceptsExtracted: 0,
      lastHeartbeatAt: now,
    };

    // 6. Create initial ProcessingJob
    const jobId = generateJobId('job');
    source.activeJobId = jobId;

    const initialJob: ProcessingJob = {
      id: jobId,
      sourceId,
      collectionId,
      userId,
      status: 'PENDING',
      currentStage: 'UPLOAD',
      stages: {
        UPLOAD: {
          name: 'UPLOAD',
          status: 'COMPLETED',
          startedAt: now,
          completedAt: now,
          durationMs: 0,
        },
        QUEUE: { name: 'QUEUE', status: 'PENDING' },
        EXTRACT: { name: 'EXTRACT', status: 'PENDING' },
        OCR: { name: 'OCR', status: 'PENDING' },
        STRUCTURE: { name: 'STRUCTURE', status: 'PENDING' },
        METADATA: { name: 'METADATA', status: 'PENDING' },
        CHUNK: { name: 'CHUNK', status: 'PENDING' },
        EMBED: { name: 'EMBED', status: 'PENDING' },
        INDEX: { name: 'INDEX', status: 'PENDING' },
        KNOWLEDGE_GRAPH: { name: 'KNOWLEDGE_GRAPH', status: 'PENDING' },
        VALIDATE: { name: 'VALIDATE', status: 'PENDING' },
        READY: { name: 'READY', status: 'PENDING' },
        COMPLETE: { name: 'COMPLETE', status: 'PENDING' },
      },
      attempts: 0,
      maxAttempts: 3,
      createdAt: now,
    };

    // Save to Firestore
    await sourceRepository.createSource(source as any);
    await db
      .collection('notebooks')
      .doc(collectionId)
      .collection('sources')
      .doc(sourceId)
      .collection('jobs')
      .doc(jobId)
      .set(initialJob);

    // Initial Document Version snapshot
    const versionId = generateVersionId(sourceId, 1);
    const initialVersion: DocumentVersion = {
      id: versionId,
      sourceId,
      collectionId,
      userId,
      version: 1,
      hash,
      sizeBytes: file.size,
      storagePath: storageResult.storagePath,
      metadata: source.metadata,
      changeSummary: 'Initial document upload',
      createdAt: now,
    };

    await db
      .collection('notebooks')
      .doc(collectionId)
      .collection('sources')
      .doc(sourceId)
      .collection('versions')
      .doc(versionId)
      .set(initialVersion);

    // 7. Timeline event
    try {
      await notebookService.addTimelineEvent(collectionId, 'DOCUMENT_UPLOADED', `Uploaded ${source.title}`);
    } catch {
      // Timeline logging is non-blocking
    }

    return {
      source,
      job: initialJob,
      isDuplicate: false,
    };
  }

  /**
   * Processes batch upload for multiple files.
   */
  async processMultiUpload(
    userId: string,
    collectionId: string,
    files: Express.Multer.File[],
    options: UploadSourceOptions = {}
  ): Promise<ProcessUploadResult[]> {
    if (!Array.isArray(files) || files.length === 0) {
      throw new ContentSourceServiceError('NO_FILES', 'No files provided for multi-upload', 400);
    }

    const results: ProcessUploadResult[] = [];
    for (const file of files) {
      const res = await this.processUpload(userId, collectionId, file, options);
      results.push(res);
    }
    return results;
  }

  /**
   * Creates a new ContentSource entity with direct input validation.
   */
  async createSource(userId: string, rawInput: unknown): Promise<ContentSource> {
    const input = validateCreateSourceInput(rawInput);
    await this.ensureCollectionAccess(userId, input.collectionId, true);

    // Duplicate hash check
    if (input.hash) {
      const duplicate = await this.detectDuplicate(userId, input.collectionId, input.hash);
      if (duplicate) {
        throw new ContentSourceServiceError(
          'DUPLICATE_SOURCE',
          `A source with identical content (hash: ${input.hash.slice(0, 12)}...) already exists in this collection with ID ${duplicate.id}`,
          409
        );
      }
    }

    const now = Date.now();
    const sourceId = input.customId ? input.customId.trim() : generateSourceId();

    const source: ContentSource = {
      id: sourceId,
      userId,
      collectionId: input.collectionId,
      notebookId: input.collectionId,
      title: input.title.trim(),
      originalName: input.originalName.trim(),
      contentType: input.contentType.trim().toLowerCase(),
      mimeType: input.contentType.trim().toLowerCase(),
      sizeBytes: input.sizeBytes,
      storagePath: input.storagePath.trim(),
      gcsPath: input.storagePath.trim(),
      status: 'QUEUED',
      metadata: input.metadata || {},
      createdAt: now,
      updatedAt: now,
      version: 1,
      hash: input.hash,
      checksum: input.hash,
      chunksExtracted: 0,
      conceptsExtracted: 0,
      lastHeartbeatAt: now,
    };

    await sourceRepository.createSource(source as any);
    return source;
  }

  /**
   * Fetches a single ContentSource, enforcing authorization and user isolation.
   */
  async getSource(userId: string, collectionId: string, sourceId: string): Promise<ContentSource> {
    await this.ensureCollectionAccess(userId, collectionId, false);

    const doc = await sourceRepository.getSource(collectionId, sourceId);
    if (!doc) {
      throw new ContentSourceServiceError('SOURCE_NOT_FOUND', `Source ${sourceId} was not found in collection ${collectionId}`, 404);
    }

    return doc as unknown as ContentSource;
  }

  /**
   * Updates an existing ContentSource's metadata, title, or properties.
   */
  async updateSource(userId: string, collectionId: string, sourceId: string, rawUpdates: unknown): Promise<ContentSource> {
    await this.ensureCollectionAccess(userId, collectionId, true);
    const updates = validateUpdateSourceInput(rawUpdates);

    const existing = await this.getSource(userId, collectionId, sourceId);

    if (updates.status && updates.status !== existing.status) {
      assertValidTransition(existing.status, updates.status);
    }

    const patch: Partial<ContentSource> = {
      ...updates,
      updatedAt: Date.now(),
    };

    await sourceRepository.updateSource(collectionId, sourceId, patch as any);
    return {
      ...existing,
      ...patch,
    };
  }

  /**
   * Transitions a ContentSource to a new state.
   */
  async transitionState(
    userId: string,
    collectionId: string,
    sourceId: string,
    nextState: ProcessingState,
    stage?: ProcessingStageName
  ): Promise<ContentSource> {
    await this.ensureCollectionAccess(userId, collectionId, true);
    const source = await this.getSource(userId, collectionId, sourceId);

    assertValidTransition(source.status, nextState);

    const updates: Partial<ContentSource> = {
      status: nextState,
      updatedAt: Date.now(),
      lastHeartbeatAt: Date.now(),
    };

    if (stage) {
      updates.currentStage = stage;
    }

    if (nextState === 'FAILED') {
      updates.failedAt = Date.now();
    }

    await sourceRepository.updateSource(collectionId, sourceId, updates as any);
    return {
      ...source,
      ...updates,
    };
  }

  /**
   * Records a structured processing error on the source and transitions it to FAILED.
   */
  async recordProcessingError(
    userId: string,
    collectionId: string,
    sourceId: string,
    error: ProcessingError
  ): Promise<ContentSource> {
    await this.ensureCollectionAccess(userId, collectionId, true);
    const source = await this.getSource(userId, collectionId, sourceId);

    assertValidTransition(source.status, 'FAILED');

    const updates: Partial<ContentSource> = {
      status: 'FAILED',
      failedAt: error.timestamp || Date.now(),
      failureReason: error.code,
      errorDetails: error.message.slice(0, 500),
      currentStage: error.stage || source.currentStage,
      updatedAt: Date.now(),
    };

    await sourceRepository.updateSource(collectionId, sourceId, updates as any);

    // Also record in processing errors subcollection
    await db
      .collection('notebooks')
      .doc(collectionId)
      .collection('sources')
      .doc(sourceId)
      .collection('errors')
      .add(error);

    return {
      ...source,
      ...updates,
    };
  }

  /**
   * Creates a new document version snapshot.
   */
  async createDocumentVersion(
    userId: string,
    collectionId: string,
    sourceId: string,
    changeSummary: string
  ): Promise<DocumentVersion> {
    await this.ensureCollectionAccess(userId, collectionId, true);
    const source = await this.getSource(userId, collectionId, sourceId);

    const nextVersionNum = (source.version || 1) + 1;
    const versionId = generateVersionId(sourceId, nextVersionNum);
    const now = Date.now();

    const versionDoc: DocumentVersion = {
      id: versionId,
      sourceId,
      collectionId,
      userId,
      version: nextVersionNum,
      hash: source.hash || 'unknown',
      sizeBytes: source.sizeBytes || 0,
      storagePath: source.storagePath || '',
      metadata: source.metadata || {},
      changeSummary,
      createdAt: now,
    };

    await db
      .collection('notebooks')
      .doc(collectionId)
      .collection('sources')
      .doc(sourceId)
      .collection('versions')
      .doc(versionId)
      .set(versionDoc);

    await sourceRepository.updateSource(collectionId, sourceId, {
      version: nextVersionNum,
      updatedAt: now,
    } as any);

    return versionDoc;
  }

  /**
   * Soft-deletes / Archives a ContentSource.
   */
  async archiveSource(userId: string, collectionId: string, sourceId: string): Promise<ContentSource> {
    await this.ensureCollectionAccess(userId, collectionId, true);
    const source = await this.getSource(userId, collectionId, sourceId);

    assertValidTransition(source.status, 'ARCHIVED');

    const now = Date.now();
    const updates: Partial<ContentSource> = {
      status: 'ARCHIVED',
      archivedAt: now,
      updatedAt: now,
    };

    await sourceRepository.updateSource(collectionId, sourceId, updates as any);
    return {
      ...source,
      ...updates,
    };
  }

  /**
   * Permanently deletes a source and cleans up its stored file in Firebase Storage.
   */
  async deleteSource(userId: string, collectionId: string, sourceId: string): Promise<void> {
    await this.ensureCollectionAccess(userId, collectionId, true);
    const source = await this.getSource(userId, collectionId, sourceId);

    if (source.storagePath) {
      await contentStorageService.deleteFile(source.storagePath);
    }

    await sourceRepository.deleteSource(collectionId, sourceId);
  }
}

export const contentSourceService = new ContentSourceService();
