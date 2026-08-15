/**
 * Exam Document Storage Service
 * Manages permanent archiving, hashing, and retrieval of official exam notices,
 * gazettes, and syllabus PDFs in Firebase Cloud Storage.
 *
 * PATH PATTERN IN FIREBASE STORAGE:
 * `exam_documents/{examId}/{cycleId}/{docType}_{hashPrefix}.pdf`
 */

import { getStorage } from 'firebase-admin/storage';
import crypto from 'crypto';
import axios from 'axios';
import { logger } from '../../utils/logger';
import { examRepository } from '../../repositories/exam.repository';

export interface ArchivedDocumentResult {
  storagePath: string;
  downloadUrl: string;
  hash: string;
  fileSizeBytes: number;
  contentType: string;
}

export class ExamDocumentStorageService {
  /**
   * Computes SHA-256 cryptographic hash of a binary buffer.
   */
  public computeHash(buffer: Buffer): string {
    return crypto.createHash('sha256').update(buffer).digest('hex');
  }

  /**
   * Uploads a raw document buffer directly to Firebase Storage.
   */
  public async uploadDocumentBuffer(params: {
    examId: string;
    cycleId: string;
    docType: 'syllabus' | 'notification' | 'corrigendum' | 'admit_card_notice';
    buffer: Buffer;
    fileName?: string;
    contentType?: string;
  }): Promise<ArchivedDocumentResult> {
    const { examId, cycleId, docType, buffer, fileName } = params;
    const contentType = params.contentType || 'application/pdf';
    const hash = this.computeHash(buffer);
    const hashShort = hash.slice(0, 12);

    const safeFileName = fileName
      ? `${docType}_${hashShort}_${fileName.replace(/[^a-zA-Z0-9._-]/g, '_')}`
      : `${docType}_${hashShort}.pdf`;

    const storagePath = `exam_documents/${examId}/${cycleId}/${safeFileName}`;

    try {
      const bucket = getStorage().bucket();
      const file = bucket.file(storagePath);

      await file.save(buffer, {
        contentType,
        metadata: {
          examId,
          cycleId,
          docType,
          sha256Hash: hash,
          archivedAt: new Date().toISOString(),
        },
        resumable: false,
      });

      // Generate a signed URL or public URL
      let downloadUrl = '';
      try {
        const [signedUrl] = await file.getSignedUrl({
          action: 'read',
          expires: '03-01-2035', // Long-lived public read URL for official documents
        });
        downloadUrl = signedUrl;
      } catch {
        // Fallback standard cloud storage path
        downloadUrl = `https://storage.googleapis.com/${bucket.name}/${storagePath}`;
      }

      logger.info(`[ExamDocumentStorage] Archived official document to Firebase Storage: ${storagePath} (Hash: ${hashShort})`);

      return {
        storagePath,
        downloadUrl,
        hash,
        fileSizeBytes: buffer.length,
        contentType,
      };
    } catch (err: any) {
      logger.error(`[ExamDocumentStorage] Failed to upload document buffer: ${err.message}`, { storagePath, error: err });
      throw new Error(`Failed to archive document in Firebase Storage: ${err.message}`);
    }
  }

  /**
   * Downloads an official PDF from a verified source URL and archives a permanent copy in Firebase Storage.
   */
  public async archiveFromUrl(params: {
    examId: string;
    cycleId: string;
    docType: 'syllabus' | 'notification';
    sourceUrl: string;
  }): Promise<ArchivedDocumentResult> {
    const { examId, cycleId, docType, sourceUrl } = params;

    logger.info(`[ExamDocumentStorage] Fetching official document from verified source: ${sourceUrl}`);

    const response = await axios.get(sourceUrl, {
      responseType: 'arraybuffer',
      timeout: 30000,
      headers: {
        'User-Agent': 'Scholarly-Exam-Intelligence-Archiver/1.0',
      },
    });

    const buffer = Buffer.from(response.data);
    const contentType = String(response.headers['content-type'] || 'application/pdf');

    const result = await this.uploadDocumentBuffer({
      examId,
      cycleId,
      docType,
      buffer,
      contentType,
    });

    return result;
  }

  /**
   * Downloads an archived document buffer from Firebase Storage for parsing/processing.
   */
  public async downloadDocumentBuffer(storagePath: string): Promise<Buffer> {
    try {
      const bucket = getStorage().bucket();
      const file = bucket.file(storagePath);
      const [buffer] = await file.download();
      return buffer;
    } catch (err: any) {
      logger.error(`[ExamDocumentStorage] Failed to download document from ${storagePath}: ${err.message}`);
      throw new Error(`Failed to download document from Firebase Storage: ${err.message}`);
    }
  }
}

export const examDocumentStorageService = new ExamDocumentStorageService();
