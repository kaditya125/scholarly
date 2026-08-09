/**
 * Content Pipeline Validation & Schema Verification
 * Phase 1A & Phase 2A: Content Upload, Storage & Data Foundation
 */

import { z } from 'zod';
import { CreateSourceInput, UpdateSourceInput, ProcessingState, ProcessingStageName } from './types';

export const ALLOWED_CONTENT_TYPES = [
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-excel',
  'text/plain',
  'text/markdown',
  'text/x-markdown',
  'text/html',
  'application/xhtml+xml',
  'image/png',
  'image/jpeg',
  'image/webp',
  'application/epub+zip',
  'audio/mpeg',
  'audio/wav',
  'video/mp4',
  'application/json',
] as const;

export const ALLOWED_EXTENSIONS = [
  'pdf',
  'docx',
  'pptx',
  'ppt',
  'xlsx',
  'xls',
  'txt',
  'md',
  'markdown',
  'html',
  'htm',
  'png',
  'jpg',
  'jpeg',
  'webp',
] as const;

export const MAX_UPLOAD_SIZE_BYTES = 50 * 1024 * 1024; // 50MB per upload
export const MAX_SOURCE_SIZE_BYTES = 250 * 1024 * 1024; // 250MB absolute upper limit

export const EXTENSION_MIME_MAP: Record<string, string> = {
  pdf: 'application/pdf',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  ppt: 'application/vnd.ms-powerpoint',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  xls: 'application/vnd.ms-excel',
  txt: 'text/plain',
  md: 'text/markdown',
  markdown: 'text/markdown',
  html: 'text/html',
  htm: 'text/html',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
};

export const ProcessingStateEnum = z.enum([
  'DRAFT',
  'UPLOADING',
  'QUEUED',
  'PROCESSING',
  'READY',
  'FAILED',
  'CANCELLED',
  'ARCHIVED',
]);

export const ProcessingStageNameEnum = z.enum([
  'UPLOAD',
  'EXTRACT',
  'OCR',
  'STRUCTURE',
  'METADATA',
  'CHUNK',
  'EMBED',
  'INDEX',
  'KNOWLEDGE_GRAPH',
  'VALIDATE',
  'COMPLETE',
]);

export const CreateSourceSchema = z.object({
  collectionId: z.string().min(1, 'collectionId cannot be empty').max(200),
  title: z.string().min(1, 'title cannot be empty').max(500),
  originalName: z.string().min(1, 'originalName cannot be empty').max(500),
  contentType: z.string().min(1, 'contentType cannot be empty'),
  sizeBytes: z.number().int().min(0, 'sizeBytes must be non-negative').max(MAX_SOURCE_SIZE_BYTES, `sizeBytes exceeds maximum limit of ${MAX_SOURCE_SIZE_BYTES} bytes`),
  storagePath: z.string().min(1, 'storagePath cannot be empty').max(1000),
  hash: z.string().regex(/^[a-f0-9]{64}$/i, 'hash must be a valid 64-character SHA-256 hex string').optional(),
  metadata: z.record(z.any()).optional().default({}),
  customId: z.string().max(200).optional(),
});

export const UpdateSourceSchema = z.object({
  title: z.string().min(1).max(500).optional(),
  originalName: z.string().min(1).max(500).optional(),
  contentType: z.string().min(1).optional(),
  sizeBytes: z.number().int().min(0).max(MAX_SOURCE_SIZE_BYTES).optional(),
  storagePath: z.string().min(1).max(1000).optional(),
  hash: z.string().regex(/^[a-f0-9]{64}$/i).optional(),
  metadata: z.record(z.any()).optional(),
  status: ProcessingStateEnum.optional(),
  currentStage: ProcessingStageNameEnum.optional(),
  chunksExtracted: z.number().int().min(0).optional(),
  conceptsExtracted: z.number().int().min(0).optional(),
  processingDurationMs: z.number().min(0).optional(),
  activeJobId: z.string().optional(),
});

/**
 * Validates raw create source input against schema
 */
export function validateCreateSourceInput(input: unknown): CreateSourceInput {
  return CreateSourceSchema.parse(input) as CreateSourceInput;
}

/**
 * Validates raw update source input against schema
 */
export function validateUpdateSourceInput(input: unknown): UpdateSourceInput {
  return UpdateSourceSchema.parse(input) as UpdateSourceInput;
}

/**
 * Checks if a given string is a valid SHA-256 hash
 */
export function isValidSha256(hash?: string): boolean {
  if (!hash) return false;
  return /^[a-f0-9]{64}$/i.test(hash);
}

/**
 * Checks if a MIME content type is in the allowed list
 */
export function isAllowedContentType(mime: string): boolean {
  if (!mime) return false;
  const normalized = mime.toLowerCase().split(';')[0].trim();
  return (ALLOWED_CONTENT_TYPES as readonly string[]).includes(normalized);
}

/**
 * Checks if a file extension is in the allowed list
 */
export function isAllowedExtension(ext: string): boolean {
  if (!ext) return false;
  const cleanExt = ext.toLowerCase().replace(/^\./, '').trim();
  return (ALLOWED_EXTENSIONS as readonly string[]).includes(cleanExt as any);
}

/**
 * Strips path traversal, dangerous characters, and bounds filename length
 */
export function sanitizeFilename(filename: string): string {
  if (!filename || typeof filename !== 'string') return 'document';
  // Remove directory paths
  const base = filename.split(/[\\/]/).pop() || 'document';
  // Remove non-printable or unsafe characters, preserve standard alphanumeric, spaces, dots, hyphens, underscores
  const clean = base.replace(/[^\w\s.\-()]/g, '_').trim();
  // Bound length to max 255 chars
  return clean.slice(0, 255) || 'document';
}

export interface FileValidationResult {
  isValid: boolean;
  safeFilename: string;
  contentType: string;
  extension: string;
  sizeBytes: number;
  error?: string;
}

/**
 * Validates an uploaded Multer file for type, size, and filename
 */
export function validateUploadedFile(file: Express.Multer.File | undefined | null): FileValidationResult {
  if (!file || !file.buffer) {
    return {
      isValid: false,
      safeFilename: 'unknown',
      contentType: 'application/octet-stream',
      extension: '',
      sizeBytes: 0,
      error: 'No file buffer provided for upload',
    };
  }

  if (file.size === 0 || file.buffer.length === 0) {
    return {
      isValid: false,
      safeFilename: sanitizeFilename(file.originalname),
      contentType: file.mimetype || 'application/octet-stream',
      extension: '',
      sizeBytes: 0,
      error: 'Cannot upload an empty file (0 bytes)',
    };
  }

  if (file.size > MAX_UPLOAD_SIZE_BYTES) {
    return {
      isValid: false,
      safeFilename: sanitizeFilename(file.originalname),
      contentType: file.mimetype || 'application/octet-stream',
      extension: '',
      sizeBytes: file.size,
      error: `File size (${(file.size / (1024 * 1024)).toFixed(2)}MB) exceeds maximum limit of 50MB`,
    };
  }

  const safeFilename = sanitizeFilename(file.originalname);
  const ext = safeFilename.split('.').pop()?.toLowerCase() || '';

  if (!ext || !isAllowedExtension(ext)) {
    return {
      isValid: false,
      safeFilename,
      contentType: file.mimetype || 'application/octet-stream',
      extension: ext,
      sizeBytes: file.size,
      error: `Unsupported file format '.${ext}'. Supported formats: PDF, DOCX, PPTX, XLSX, TXT, MD, HTML, PNG, JPG, JPEG.`,
    };
  }

  let contentType = file.mimetype || EXTENSION_MIME_MAP[ext] || 'application/octet-stream';
  if (contentType === 'application/octet-stream' && EXTENSION_MIME_MAP[ext]) {
    contentType = EXTENSION_MIME_MAP[ext];
  }

  return {
    isValid: true,
    safeFilename,
    contentType,
    extension: ext,
    sizeBytes: file.size,
  };
}
