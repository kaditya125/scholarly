import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { PYQSourceEntry, PYQRightsStatus } from '../../types/pyq.types';
import { pyqRepository } from '../../repositories/pyq.repository';

export interface RegisterArtifactParams {
  filePath: string;
  examId: string;
  examName: string;
  year: number;
  session?: string;
  paper?: string;
  shift?: string;
  paperCode?: string;
  subject?: string;
  authority: string;
  sourceUrl?: string;
  sourceDomain?: string;
  mimeType?: string;
  answerKeyFilePath?: string;
  answerKeySource?: string;
  rightsStatus?: PYQRightsStatus;
}

export class PYQSourceArtifactService {
  /**
   * Computes the SHA-256 checksum of raw document bytes on disk.
   */
  computeFileHash(filePath: string): { hash: string; size: number } {
    if (!fs.existsSync(filePath)) {
      throw new Error(`Artifact file not found at path: ${filePath}`);
    }
    const buffer = fs.readFileSync(filePath);
    const hash = crypto.createHash('sha256').update(buffer).digest('hex');
    return { hash, size: buffer.length };
  }

  /**
   * Registers a durable official source artifact with cryptographic SHA-256 hash
   * in pyq_source_registry.
   */
  async registerOfficialArtifact(params: RegisterArtifactParams): Promise<PYQSourceEntry> {
    const { hash: documentHash, size: documentSize } = this.computeFileHash(params.filePath);

    // Compute answer key hash if provided
    let answerKeyHash: string | undefined;
    if (params.answerKeyFilePath && fs.existsSync(params.answerKeyFilePath)) {
      const keyInfo = this.computeFileHash(params.answerKeyFilePath);
      answerKeyHash = keyInfo.hash;
    }

    // Check if artifact with exact SHA-256 already registered
    const existing = await pyqRepository.getSourceByHash(documentHash);
    if (existing) {
      console.log(`[SourceArtifact] Artifact with SHA-256 ${documentHash} already registered: ${existing.sourceId}`);
      return existing;
    }

    const codeSlug = (params.paperCode || params.paper || params.shift || 'main')
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '_');
    const sourceId = `src_${params.examId.toLowerCase()}_${params.year}_${codeSlug}_${documentHash.slice(0, 8)}`;

    const sourceEntry: PYQSourceEntry = {
      sourceId,
      examId: params.examId,
      examName: params.examName,
      year: params.year,
      session: params.session,
      paper: params.paper,
      shift: params.shift,
      paperCode: params.paperCode,
      subject: params.subject,
      language: 'en',
      authority: params.authority,
      sourceTier: 'TIER_A_OFFICIAL',
      sourceName: `${params.authority} Official Archive ${params.year}`,
      sourceUrl: params.sourceUrl || '',
      sourceDomain: params.sourceDomain || 'official.gov.in',
      documentType: 'QUESTION_PAPER',
      availabilityStatus: 'AVAILABLE',
      retrievalStatus: 'RETRIEVED_FULL',
      rightsStatus: params.rightsStatus || 'OFFICIAL_SOURCE_REVIEWED',
      storagePath: params.filePath,
      artifactPath: path.relative(process.cwd(), params.filePath),
      sourceDocumentHash: documentHash,
      documentHash,
      documentSize,
      mimeType: params.mimeType || 'application/pdf',
      documentTitle: `${params.examName} ${params.year} ${params.paper || ''} ${params.paperCode || ''}`.trim(),
      answerKeySource: params.answerKeySource,
      answerKeyHash,
      verifiedBy: 'source-artifact-service-v1',
      verificationMethod: 'OFFICIAL_DOCUMENT_SHA256',
      hasAnswerKey: !!answerKeyHash,
      hasSolutions: false,
      discoveredAt: Date.now(),
      lastCheckedAt: Date.now(),
      retrievedAt: Date.now(),
    };

    await pyqRepository.registerSource(sourceEntry);
    console.log(`[SourceArtifact] Registered official source: ${sourceId} (SHA-256: ${documentHash})`);
    return sourceEntry;
  }
}

export const pyqSourceArtifactService = new PYQSourceArtifactService();
