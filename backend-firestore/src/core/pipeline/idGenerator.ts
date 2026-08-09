/**
 * Content Pipeline Deterministic and Unique ID Generators
 * Phase 1A: Data Foundation
 */

import { v4 as uuidv4 } from 'uuid';
import crypto from 'crypto';

/**
 * Generates a unique ContentSource ID
 */
export function generateSourceId(prefix = 'src'): string {
  const cleanPrefix = prefix.replace(/[^a-zA-Z0-9_-]/g, '');
  return `${cleanPrefix}_${uuidv4().replace(/-/g, '')}`;
}

/**
 * Generates a deterministic ContentSource ID from collection ID and SHA-256 hash
 */
export function generateDeterministicSourceId(collectionId: string, hash: string): string {
  const normalizedCollection = collectionId.trim().toLowerCase();
  const normalizedHash = hash.trim().toLowerCase();
  const composite = `${normalizedCollection}:${normalizedHash}`;
  const deterministicSuffix = crypto.createHash('sha256').update(composite).digest('hex').slice(0, 16);
  return `src_det_${deterministicSuffix}`;
}

/**
 * Generates a DocumentVersion ID
 */
export function generateVersionId(sourceId: string, version: number): string {
  return `${sourceId}_v${version}`;
}

/**
 * Generates a ProcessingJob ID
 */
export function generateJobId(prefix = 'pjob'): string {
  const cleanPrefix = prefix.replace(/[^a-zA-Z0-9_-]/g, '');
  return `${cleanPrefix}_${uuidv4().replace(/-/g, '')}`;
}

/**
 * Generates a PipelineRun ID
 */
export function generateRunId(): string {
  return `prun_${uuidv4().replace(/-/g, '')}`;
}

/**
 * Generates a deterministic Chunk ID
 */
export function generateChunkId(sourceId: string, chunkIndex: number): string {
  return `${sourceId}_chunk_${chunkIndex}`;
}

/**
 * Generates a SHA-256 hash string from a buffer or string
 */
export function generateSha256Hash(data: Buffer | string): string {
  return crypto.createHash('sha256').update(data).digest('hex');
}

export interface VectorIdParams {
  userId?: string;
  tenantId?: string;
  collectionId: string;
  documentId: string;
  documentVersionId: string;
  chunkSequence: number;
}

/**
 * Generates a deterministic Pinecone vector ID incorporating tenant, collection,
 * document, version, and chunk sequence to prevent collisions across scopes.
 */
export function generateDeterministicVectorId(params: VectorIdParams): string {
  const sanitize = (s?: string) => (s ? s.replace(/[^a-zA-Z0-9_-]/g, '_') : 'global');
  const user = sanitize(params.userId || params.tenantId || 'user');
  const col = sanitize(params.collectionId);
  const doc = sanitize(params.documentId);
  const ver = sanitize(params.documentVersionId);
  const seq = params.chunkSequence;

  return `vec_${user}_${col}_${doc}_${ver}_chunk_${seq}`;
}
