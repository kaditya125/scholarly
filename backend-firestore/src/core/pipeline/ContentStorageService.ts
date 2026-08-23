/**
 * ContentStorageService
 * Core Storage Service for Content Pipeline Phase 2A: Content Upload & Storage
 * 
 * Reuses existing Firebase Storage / GCS infrastructure (firebaseApp.storage().bucket()).
 * Enforces strict user/tenant isolation under `users/${userId}/pipeline/${collectionId}/...`
 */

import * as crypto from 'crypto';
import { firebaseApp } from '../../config/firebase';
import { env } from '../../config/env';
import { withRetry } from '../../utils/retry';
import { sanitizeFilename } from './validation';

export class StorageServiceError extends Error {
  public readonly code: string;
  public readonly statusCode: number;

  constructor(code: string, message: string, statusCode = 500) {
    super(message);
    this.name = 'StorageServiceError';
    this.code = code;
    this.statusCode = statusCode;
  }
}

export interface StoredFileResult {
  storagePath: string;
  gcsPath: string;
  downloadUrl?: string;
  sizeBytes: number;
  hash: string;
  contentType: string;
  uploadedAt: number;
}

export class ContentStorageService {
  /**
   * Retrieves the initialized Firebase Storage bucket instance.
   */
  private getBucket() {
    try {
      if (env.FIREBASE_STORAGE_BUCKET) {
        return firebaseApp.storage().bucket(env.FIREBASE_STORAGE_BUCKET);
      }
      return firebaseApp.storage().bucket();
    } catch (err: any) {
      throw new StorageServiceError('STORAGE_UNAVAILABLE', `Failed to access Firebase Storage bucket: ${err.message}`, 500);
    }
  }

  /**
   * Computes a SHA-256 hex checksum from a file buffer.
   */
  computeHash(buffer: Buffer): string {
    if (!buffer || !Buffer.isBuffer(buffer)) {
      throw new StorageServiceError('INVALID_BUFFER', 'Buffer must be provided to compute hash', 400);
    }
    return crypto.createHash('sha256').update(buffer).digest('hex');
  }

  /**
   * Generates a tenant-isolated storage path strictly scoped to the user and collection.
   */
  generateStoragePath(userId: string, collectionId: string, sourceId: string, originalFilename: string): string {
    if (!userId || !userId.trim()) {
      throw new StorageServiceError('UNAUTHORIZED', 'User ID is required for isolated storage path', 401);
    }
    if (!collectionId || !collectionId.trim()) {
      throw new StorageServiceError('INVALID_COLLECTION', 'Collection ID is required for storage path', 400);
    }
    if (!sourceId || !sourceId.trim()) {
      throw new StorageServiceError('INVALID_SOURCE', 'Source ID is required for storage path', 400);
    }

    const safeName = sanitizeFilename(originalFilename);
    return `users/${userId}/pipeline/${collectionId}/original/${sourceId}_${safeName}`;
  }

  /**
   * Uploads an original document to Firebase Storage with retry and metadata attachment.
   */
  async uploadOriginal(
    userId: string,
    collectionId: string,
    sourceId: string,
    originalFilename: string,
    buffer: Buffer,
    contentType: string
  ): Promise<StoredFileResult> {
    if (!buffer || buffer.length === 0) {
      throw new StorageServiceError('EMPTY_BUFFER', 'Cannot upload an empty file buffer', 400);
    }

    const hash = this.computeHash(buffer);
    const storagePath = this.generateStoragePath(userId, collectionId, sourceId, originalFilename);
    const bucket = this.getBucket();
    const fileRef = bucket.file(storagePath);

    const safeContentType = contentType || 'application/octet-stream';
    const uploadedAt = Date.now();

    const downloadToken = uuidv4();

    try {
      await withRetry(
        async () => {
          await fileRef.save(buffer, {
            contentType: safeContentType,
            metadata: {
              metadata: {
                firebaseStorageDownloadTokens: downloadToken,
                uploadedBy: userId,
                collectionId,
                sourceId,
                originalFilename,
                sha256Hash: hash,
                uploadedAt: String(uploadedAt),
              },
            },
            resumable: false,
          });
        },
        {
          retries: 3,
          baseDelayMs: 500,
          label: 'firebase.storage.upload',
        }
      );
    } catch (error: any) {
      console.error(`[ContentStorageService] Upload failed for ${storagePath}:`, error);
      throw new StorageServiceError(
        'UPLOAD_FAILED',
        `Failed to store file in cloud storage: ${error.message || 'Unknown storage error'}`,
        502
      );
    }

    const bucketName = bucket.name || env.FIREBASE_STORAGE_BUCKET || 'default-bucket';
    const gcsPath = `gs://${bucketName}/${storagePath}`;
    const downloadUrl = `https://firebasestorage.googleapis.com/v0/b/${bucketName}/o/${encodeURIComponent(storagePath)}?alt=media&token=${downloadToken}`;

    return {
      storagePath,
      gcsPath,
      downloadUrl,
      sizeBytes: buffer.length,
      hash,
      contentType: safeContentType,
      uploadedAt,
    };
  }

  /**
   * Deletes a file from Firebase Storage.
   */
  async deleteFile(storagePath: string): Promise<void> {
    if (!storagePath) return;
    try {
      const bucket = this.getBucket();
      const fileRef = bucket.file(storagePath);
      const [exists] = await fileRef.exists();
      if (exists) {
        await fileRef.delete();
      }
    } catch (err: any) {
      console.warn(`[ContentStorageService] Error deleting file ${storagePath}:`, err.message);
    }
  }

  /**
   * Downloads a file buffer from Firebase Storage.
   */
  async downloadFileBuffer(storagePath: string): Promise<Buffer> {
    if (!storagePath) {
      throw new StorageServiceError('INVALID_PATH', 'Storage path must be provided', 400);
    }

    try {
      const bucket = this.getBucket();
      const fileRef = bucket.file(storagePath);
      const [buffer] = await fileRef.download();
      return buffer;
    } catch (err: any) {
      throw new StorageServiceError('DOWNLOAD_FAILED', `Failed to download file from storage: ${err.message}`, 404);
    }
  }
}

export const contentStorageService = new ContentStorageService();
