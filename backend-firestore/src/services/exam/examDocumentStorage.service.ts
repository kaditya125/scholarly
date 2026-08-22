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
import { fetchOfficialDocument } from './officialFetch';

export interface ArchivedDocumentResult {
  storagePath: string;
  downloadUrl: string;
  hash: string;
  fileSizeBytes: number;
  contentType: string;
}

/** Why a retrieved payload was refused as an official document. */
export type DocumentRejectionCode =
  | 'EMPTY_RESPONSE'
  | 'HTML_INSTEAD_OF_DOCUMENT'
  | 'NOT_A_PDF'
  | 'SUSPICIOUSLY_SMALL';

export class DocumentRetrievalError extends Error {
  constructor(public readonly code: DocumentRejectionCode, message: string) {
    super(message);
    this.name = 'DocumentRetrievalError';
  }
}

/**
 * Minimum plausible size for an official syllabus/notification PDF. Not a content judgement —
 * purely a floor below which the payload cannot be a real multi-page notice, and is far more
 * likely an error stub.
 *
 * MEASURED CAVEAT, worth knowing before anyone trusts this bound: PDF text streams compress hard,
 * so this floor sits uncomfortably close to real documents. During J.4-S/J.5/J.6-P verification it
 * rejected three legitimate generated notices — one at 2010 bytes, just 38 under the limit, for a
 * ~40-line single-page document. A genuinely short, text-only official notice could therefore be
 * refused as SUSPICIOUSLY_SMALL. The threshold is deliberately left as-is rather than lowered to
 * suit test fixtures: every case so far has been a fixture that was unrealistically small, not a
 * real document. If a real one is ever rejected, raise it as a defect rather than quietly
 * loosening this — the value should move on evidence about real notices, not convenience.
 */
const MIN_DOCUMENT_BYTES = 2048;

export class ExamDocumentStorageService {
  /**
   * Computes SHA-256 cryptographic hash of a binary buffer.
   */
  public computeHash(buffer: Buffer): string {
    return crypto.createHash('sha256').update(buffer).digest('hex');
  }

  /**
   * Proves a retrieved payload is actually a document before it is allowed to become provenance.
   *
   * WHY THIS IS NOT OPTIONAL. ssc.gov.in returns HTTP 200 for EVERY path — a request for
   * `/files/portal/latest/CGL_2026_Notice.pdf` and one for a deliberately invented filename both
   * return the site's Angular homepage, byte-identical, 80,649 bytes of `text/html`. Measured, not
   * theorised: both produced SHA-256 16ec671c…
   *
   * Without this check the archiver would have downloaded that homepage, hashed it into a real
   * non-empty digest, stored it under a storagePath, and satisfied every provenance rule J.2
   * added — because those rules verify a hash EXISTS and is not the empty digest, not that the
   * bytes are the document anyone asked for. The extractor would then have been handed a homepage
   * and asked for a syllabus, and whatever it returned would have carried full provenance.
   *
   * HTTP status is therefore unusable as an existence signal on this host. Content is the only
   * evidence, so the magic bytes are checked directly rather than trusting the Content-Type
   * header, which a soft-404 sets just as confidently.
   */
  public assertRetrievedDocument(params: {
    buffer: Buffer;
    contentType: string;
    sourceUrl: string;
    expectPdf?: boolean;
  }): void {
    const { buffer, contentType, sourceUrl } = params;
    const expectPdf = params.expectPdf ?? true;

    if (!buffer || buffer.length === 0) {
      throw new DocumentRetrievalError('EMPTY_RESPONSE', `Empty response body from ${sourceUrl}`);
    }

    const head = buffer.subarray(0, 1024).toString('utf8').trimStart().toLowerCase();
    const looksHtml = head.startsWith('<!doctype html') || head.startsWith('<html') || head.includes('<head>');
    if (looksHtml) {
      throw new DocumentRetrievalError(
        'HTML_INSTEAD_OF_DOCUMENT',
        `${sourceUrl} returned an HTML page, not a document (content-type "${contentType}", ` +
        `${buffer.length} bytes). This host answers 200 for unknown paths, so the document is absent.`,
      );
    }

    if (expectPdf) {
      // %PDF- magic bytes. Checked on the payload itself, since a soft-404 will happily claim
      // application/pdf in its header.
      if (buffer.subarray(0, 5).toString('latin1') !== '%PDF-') {
        throw new DocumentRetrievalError(
          'NOT_A_PDF',
          `${sourceUrl} did not return a PDF (content-type "${contentType}", ${buffer.length} bytes)`,
        );
      }
    }

    if (buffer.length < MIN_DOCUMENT_BYTES) {
      throw new DocumentRetrievalError(
        'SUSPICIOUSLY_SMALL',
        `${sourceUrl} returned only ${buffer.length} bytes — too small to be an official notice`,
      );
    }
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
    /**
     * The exam whose official domains authorise this fetch.
     *
     * Required for redirect re-validation (J.11): without the exam we cannot re-check authority at
     * each hop, and a redirect off the official domain is exactly the case this guards.
     */
    exam?: import('../../types/exam.types').ExamMaster;
  }): Promise<ArchivedDocumentResult> {
    const { examId, cycleId, docType, sourceUrl, exam } = params;

    logger.info(`[ExamDocumentStorage] Fetching official document from verified source: ${sourceUrl}`);

    /*
     * REDIRECT AND SSRF DEFENCE (J.11).
     *
     * This was a plain `axios.get` with no `maxRedirects`, so axios followed up to five hops while
     * domain authority had been checked on the ORIGINAL url only. An official URL answering 302 to
     * a hostile host would have had that host's bytes hashed and archived as official provenance —
     * the URL that served the bytes is the only one that matters, and it was never checked.
     *
     * `fetchOfficialDocument` re-verifies authority AND resolves DNS to reject private, loopback,
     * link-local and cloud-metadata addresses at every hop. When no exam is supplied the old
     * single-hop behaviour is used with redirects disabled, so a caller that cannot provide the
     * exam still cannot be redirected off-domain.
     */
    let buffer: Buffer;
    let contentType: string;

    if (exam) {
      const fetched = await fetchOfficialDocument({ url: sourceUrl, exam });
      buffer = fetched.buffer;
      contentType = fetched.contentType;
      if (fetched.redirectChain.length > 0) {
        logger.info('[ExamDocumentStorage] followed official redirects', {
          from: sourceUrl, to: fetched.finalUrl, hops: fetched.redirectChain.length,
        });
      }
    } else {
      const response = await axios.get(sourceUrl, {
        responseType: 'arraybuffer',
        timeout: 30000,
        maxRedirects: 0, // never follow a redirect we cannot re-authorise
        headers: {
          'User-Agent': 'Sadhya-Exam-Intelligence-Archiver/1.0',
        },
      });
      buffer = Buffer.from(response.data);
      contentType = String(response.headers['content-type'] || 'application/pdf');
    }

    // Nothing is hashed or stored until the payload is proven to be a document. A soft-404 that
    // returns the site homepage with HTTP 200 must never become the provenance of a syllabus.
    this.assertRetrievedDocument({ buffer, contentType, sourceUrl });

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
