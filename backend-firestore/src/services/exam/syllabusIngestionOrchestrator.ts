import { logger } from '../../utils/logger';
import { officialSourceVerificationService } from './officialSourceVerification.service';
import { examDocumentStorageService, DocumentRetrievalError } from './examDocumentStorage.service';
import { syllabusIngestionService } from './syllabusIngestion.service';
import { syllabusGraphService } from './syllabusGraph.service';
import { buildCanonicalGraph, validateCanonicalGraph } from './syllabusCanonicalGraph';
import { canTransition, validateProvenance, failureStatusFor } from './syllabusLifecycle';
import { examRepository } from '../../repositories/exam.repository';
import { PdfExtractor } from '../../core/pipeline/extractors/PdfExtractor';
import type {
  ExamMaster, ExamSyllabus, SyllabusStatus, OfficialSourceType,
} from '../../types/exam.types';

/**
 * The single production entry point for turning an official document into a canonical syllabus.
 *
 * Everything it calls was built and verified separately in J.1–J.4; this composes them and owns
 * the workflow so no caller can assemble the steps by hand and skip one. Before this existed the
 * only way through the pipeline was to drive each stage manually — which is exactly how production
 * ended up with a CURRENT syllabus whose document had never been fetched.
 *
 *   DISCOVERED → verify source → FETCHED → validate+store document → record provenance
 *              → VALIDATING → extract → canonical ids → validate graph → VERIFIED → CURRENT
 *
 * ── THE PART THAT CANNOT BE ATOMIC ───────────────────────────────────────────────────────────
 *
 * Firebase Storage and Firestore are separate systems with no shared transaction, so this is NOT
 * pretended to be atomic. It is instead ordered so that every possible crash point leaves the
 * version in a state that is safely NON-CURRENT and safely re-runnable:
 *
 *   crash after Storage, before Firestore   → nothing claims the document exists. The re-run
 *                                             re-uploads to the SAME content-addressed path
 *                                             (`{docType}_{hash12}.pdf`), so no orphan accumulates.
 *   crash after Firestore, before graph     → version sits at FETCHED/VALIDATING. Not publishable:
 *                                             the publish gate requires a validated graph manifest.
 *   crash after graph, before publication   → version sits at VERIFIED with a valid graph. Still
 *                                             not CURRENT; the previous CURRENT is untouched.
 *   crash during publication                → publishSyllabusVersion is a single Firestore
 *                                             transaction, so it either fully applies or not at all.
 *
 * The invariant across all of them: a partially processed version can never be mistaken for the
 * authoritative one, and re-running the same request converges rather than duplicating.
 */

/** Distinguishable outcomes. Deliberately not collapsed into one exception type. */
export type IngestOutcome =
  /** A new version was ingested, validated and (if requested) published. */
  | 'SUCCESS'
  /** This exact document is already the CURRENT version. Nothing to do. */
  | 'ALREADY_CURRENT'
  /** This exact document already exists as a version; not re-ingested. */
  | 'ALREADY_EXISTS'
  /** The source could not be verified or the document could not be retrieved. Retry later. */
  | 'UNAVAILABLE'
  /** The document was retrieved but extraction produced something unusable. Retrying the fetch will not help. */
  | 'INVALID'
  /** The document extracted, but the resulting graph or provenance failed validation. */
  | 'VALIDATION_FAILED'
  /** Transient infrastructure failure. Explicitly NOT INVALID — nothing is wrong with the document. */
  | 'RETRYABLE_FAILURE';

export interface IngestSyllabusResult {
  outcome: IngestOutcome;
  examId: string;
  cycleId: string;
  syllabusId: string;
  /** Persisted status when a record exists, else null. */
  status: SyllabusStatus | null;
  documentHash?: string;
  storagePath?: string;
  nodeCount?: number;
  /** Machine-readable explanation. Never prose-only. */
  reason?: string;
  errors?: string[];
}

export interface IngestSyllabusParams {
  exam: ExamMaster;
  cycleId: string;
  /** Version label, e.g. "2026-v1". Combined with exam+cycle to form the syllabusId. */
  version: string;
  /** The official page the document was discovered on, when distinct from the document. */
  sourceUrl?: string;
  /** The document itself — this is what gets retrieved and hashed. */
  sourceDocumentUrl: string;
  sourceDocumentTitle?: string;
  sourceDocumentType?: OfficialSourceType;
  performedBy: string;
  /** Promote to CURRENT once VERIFIED. Default false so ingestion and publication stay separable. */
  publish?: boolean;
}

export class SyllabusIngestionOrchestrator {
  /** Stable version identity. Same exam+cycle+version always addresses the same document. */
  private syllabusIdFor(examId: string, cycleId: string, version: string): string {
    return `syl_${examId.toLowerCase()}_${cycleId}_${version}`.replace(/[^a-z0-9_]/gi, '_');
  }

  private async audit(params: {
    examId: string; cycleId: string; syllabusId: string; operation: string;
    previousStatus: SyllabusStatus | null; newStatus: SyllabusStatus | null;
    reason?: string; sourceDocumentUrl?: string; documentHash?: string; performedBy: string;
  }): Promise<void> {
    // Never records document CONTENT — identity, hash and lifecycle only.
    await examRepository.logAudit({
      id: `audit_${Date.now()}_${params.operation}_${params.syllabusId}`,
      eventType: 'SYLLABUS_CREATED',
      examId: params.examId,
      cycleId: params.cycleId,
      entityId: params.syllabusId,
      performedBy: params.performedBy,
      details: {
        operation: params.operation,
        previousStatus: params.previousStatus,
        newStatus: params.newStatus,
        reason: params.reason ?? null,
        sourceDocumentUrl: params.sourceDocumentUrl ?? null,
        documentHash: params.documentHash ?? null,
      },
      timestamp: Date.now(),
    }).catch((e: any) => {
      // Audit failure must not roll back a correct ingestion, but it must be loud.
      logger.error('[SyllabusOrchestrator] audit write failed', { error: e?.message, ...params });
    });
  }

  /**
   * Ingests one syllabus version end to end.
   *
   * Returns a structured outcome rather than throwing for expected failures — an unreachable
   * source and a malformed document are ordinary operational states, not exceptions, and the
   * caller has to be able to tell them apart to decide whether retrying is worth anything.
   */
  async ingestSyllabusVersion(params: IngestSyllabusParams): Promise<IngestSyllabusResult> {
    const { exam, cycleId, version, sourceDocumentUrl, performedBy } = params;
    const examId = exam.examId;
    const syllabusId = this.syllabusIdFor(examId, cycleId, version);
    const base = { examId, cycleId, syllabusId };

    // ── Idempotency: a version that already exists is never silently re-ingested ──────────────
    const existing = await examRepository.getSyllabusById(syllabusId);
    if (existing) {
      if (existing.status === 'CURRENT') {
        return { ...base, outcome: 'ALREADY_CURRENT', status: existing.status,
                 documentHash: existing.sourceDocumentHash, storagePath: existing.storagePath,
                 reason: 'VERSION_ALREADY_CURRENT' };
      }
      return { ...base, outcome: 'ALREADY_EXISTS', status: existing.status,
               documentHash: existing.sourceDocumentHash, storagePath: existing.storagePath,
               reason: `VERSION_EXISTS_AT_${existing.status}` };
    }

    // ── 1. SOURCE VERIFICATION ───────────────────────────────────────────────────────────────
    // Delegated entirely; the domain allowlist lives on the exam record and is never duplicated.
    const verification = officialSourceVerificationService.verifyOfficialSource(exam, sourceDocumentUrl);
    if (!verification.isOfficial) {
      await this.audit({ ...base, operation: 'SOURCE_REJECTED', previousStatus: null,
                         newStatus: 'UNAVAILABLE', reason: verification.rejectionReason,
                         sourceDocumentUrl, performedBy });
      return { ...base, outcome: 'UNAVAILABLE', status: null,
               reason: 'SOURCE_NOT_OFFICIAL', errors: [verification.rejectionReason ?? 'unverified source'] };
    }

    // ── 2. RETRIEVAL + DOCUMENT VALIDATION + STORAGE ─────────────────────────────────────────
    // archiveFromUrl proves the payload is a document BEFORE hashing or storing it, so a soft-404
    // can never become provenance. The storage path is content-addressed, which is what makes a
    // crashed-and-retried ingestion converge instead of accumulating orphans.
    let archived;
    try {
      archived = await examDocumentStorageService.archiveFromUrl({
        examId, cycleId, docType: 'syllabus', sourceUrl: verification.normalizedUrl,
        // Passing the exam enables redirect re-validation (J.11): authority is re-established at
        // every hop, so a 302 off the official domain cannot smuggle bytes into provenance.
        exam,
      });
    } catch (err: any) {
      const retrievalRejection = err instanceof DocumentRetrievalError;
      // A rejected payload and an unreachable host are both UNAVAILABLE: in neither case do we
      // hold a document to find fault with. INVALID is reserved for documents we actually have.
      const status = failureStatusFor('SOURCE_UNREACHABLE');
      await this.audit({ ...base, operation: 'RETRIEVAL_FAILED', previousStatus: null,
                         newStatus: status, reason: retrievalRejection ? err.code : 'FETCH_ERROR',
                         sourceDocumentUrl, performedBy });
      logger.warn('[SyllabusOrchestrator] retrieval failed', { examId, syllabusId, error: err?.message });
      return { ...base, outcome: 'UNAVAILABLE', status: null,
               reason: retrievalRejection ? err.code : 'DOCUMENT_UNREACHABLE',
               errors: [String(err?.message ?? err)] };
    }

    const retrievedAt = Date.now();

    // ── 3. EXTRACT TEXT, THEN STRUCTURE ──────────────────────────────────────────────────────
    // From here on we HOLD the document, so failures become INVALID rather than UNAVAILABLE.
    let rawText = '';
    let extractedBlocks: import('../../core/pipeline/types').ExtractedBlock[] = [];
    try {
      // Read back from Storage rather than reusing the in-memory buffer: this proves the archived
      // copy is the one being extracted, so the text, the hash and the stored document all
      // describe the same bytes.
      const bytes = await examDocumentStorageService.downloadDocumentBuffer(archived.storagePath);
      // Full ExtractionContext — the shared extractor derives block ids from documentId, so a
      // partial context fails deep inside rather than at the call. Reusing this extractor rather
      // than calling pdf-parse directly keeps one PDF-text implementation in the codebase.
      const extracted = await new PdfExtractor().extract(bytes, {
        documentId: syllabusId,
        documentVersionId: `${syllabusId}_${archived.hash.slice(0, 12)}`,
        filename: `${syllabusId}.pdf`,
        contentType: 'application/pdf',
      });
      rawText = extracted.rawText ?? '';
      // Page-aware blocks are what makes deterministic chunking possible: they carry pageNumber and
      // sequence, so a 100-page notice splits on page boundaries rather than arbitrary characters.
      // Previously only rawText was kept and all of that structure was discarded.
      extractedBlocks = extracted.blocks ?? [];
    } catch (err: any) {
      await this.audit({ ...base, operation: 'TEXT_EXTRACTION_FAILED', previousStatus: null,
                         newStatus: 'INVALID', reason: 'PDF_TEXT_EXTRACTION_FAILED',
                         documentHash: archived.hash, performedBy });
      return { ...base, outcome: 'INVALID', status: null, documentHash: archived.hash,
               storagePath: archived.storagePath, reason: 'PDF_TEXT_EXTRACTION_FAILED',
               errors: [String(err?.message ?? err)] };
    }

    if (!rawText.trim()) {
      // A PDF that yields no text is almost always a scanned image. That is a real, nameable
      // condition — not "a syllabus with zero topics".
      return { ...base, outcome: 'INVALID', status: null, documentHash: archived.hash,
               storagePath: archived.storagePath, reason: 'DOCUMENT_CONTAINS_NO_EXTRACTABLE_TEXT' };
    }

    let stages;
    try {
      /*
       * DETERMINISTIC CHUNKED EXTRACTION (J.9).
       *
       * Documents of any size are now page-chunked, extracted per chunk, and merged deterministically
       * in document order. The model supplies official names, types and nesting only — it is never
       * asked for identifiers, and the merge refuses to choose between chunks that contradict each
       * other rather than letting ordering decide.
       *
       * This fails WHOLE. A single failed chunk, a merge contradiction, or a structure that does not
       * fit the canonical hierarchy aborts the ingestion, because "publish the chunks that worked"
       * yields a syllabus indistinguishable from a complete one and silently missing pages.
       */
      ({ stages } = await syllabusIngestionService.normalizeSyllabusDocument({
        exam, blocks: extractedBlocks, documentHash: archived.hash,
        scope: { examId, cycleId, syllabusId },
      }));
    } catch (err: any) {
      const message = String(err?.message ?? err);
      const reason = /contradiction/i.test(message) ? 'CHUNK_MERGE_CONFLICT'
        : /no syllabus content/i.test(message) ? 'NO_SYLLABUS_CONTENT_IN_DOCUMENT'
        : /does not fit the canonical hierarchy/i.test(message) ? 'STRUCTURE_NOT_CANONICAL'
        : /failed extraction/i.test(message) ? 'CHUNK_EXTRACTION_FAILED'
        : 'EXTRACTION_FAILED';
      await this.audit({ ...base, operation: 'EXTRACTION_FAILED', previousStatus: null,
                         newStatus: 'INVALID', reason,
                         documentHash: archived.hash, performedBy });
      return { ...base, outcome: 'INVALID', status: null, documentHash: archived.hash,
               storagePath: archived.storagePath, reason, errors: [message] };
    }

    // ── 4. PROVENANCE ────────────────────────────────────────────────────────────────────────
    // Every field describes something that actually happened. The hash is the digest of the
    // retrieved bytes, computed by the storage service — never of the extracted structure.
    const syllabus: ExamSyllabus = {
      syllabusId, examId, cycleId, version,
      authority: exam.conductingAuthority,
      status: 'FETCHED',
      sourceUrl: params.sourceUrl,
      sourceDocumentUrl: verification.normalizedUrl,
      sourceDocumentTitle: params.sourceDocumentTitle,
      sourceDocumentType: params.sourceDocumentType ?? ('SYLLABUS' as OfficialSourceType),
      sourceDocumentHash: archived.hash,
      storagePath: archived.storagePath,
      storageDownloadUrl: archived.downloadUrl,
      retrievedAt,
      extractedAt: Date.now(),
      stages,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    } as ExamSyllabus;

    const provenance = validateProvenance(syllabus, { requireDocument: true, requireStorage: true });
    if (!provenance.valid) {
      return { ...base, outcome: 'VALIDATION_FAILED', status: null, documentHash: archived.hash,
               storagePath: archived.storagePath, reason: 'PROVENANCE_INVALID',
               errors: provenance.errors.map((e) => `${e.field}:${e.code}`) };
    }

    // ── 5. CANONICAL IDS + GRAPH VALIDATION (before anything is persisted as usable) ─────────
    // Identity is minted from the version's authoritative coordinates; any *Id the model returned
    // is ignored by buildCanonicalGraph. Validated here first so a malformed extraction never
    // reaches Firestore as a syllabus record at all.
    const graph = buildCanonicalGraph(syllabus);
    const graphCheck = validateCanonicalGraph(graph, { examId, cycleId, syllabusId });
    if (!graphCheck.valid) {
      await this.audit({ ...base, operation: 'GRAPH_VALIDATION_FAILED', previousStatus: null,
                         newStatus: 'INVALID', reason: 'GRAPH_INVALID',
                         documentHash: archived.hash, performedBy });
      // Persisted as INVALID rather than dropped: the document was real and the failure is
      // diagnostic information, but it is never publishable.
      await examRepository.createSyllabus({ ...syllabus, status: 'INVALID',
        invalidationReason: 'GRAPH_VALIDATION_FAILED',
        invalidationDetail: graphCheck.errors.slice(0, 5).map((e) => `${e.code}:${e.detail}`).join('; '),
        invalidatedAt: Date.now() } as ExamSyllabus);
      return { ...base, outcome: 'VALIDATION_FAILED', status: 'INVALID',
               documentHash: archived.hash, storagePath: archived.storagePath,
               reason: 'GRAPH_VALIDATION_FAILED',
               errors: graphCheck.errors.map((e) => `${e.code}${e.nodeId ? `(${e.nodeId})` : ''}`) };
    }

    // ── 6. PERSIST + BUILD GRAPH + VERIFY ────────────────────────────────────────────────────
    try {
      await examRepository.createSyllabus(syllabus);
      await this.audit({ ...base, operation: 'INGESTED', previousStatus: null, newStatus: 'FETCHED',
                         sourceDocumentUrl, documentHash: archived.hash, performedBy });

      // Transition through the real lifecycle rather than jumping. Each hop is checked so an
      // illegal shortcut fails here rather than at the publish gate.
      for (const next of ['VALIDATING', 'VERIFIED'] as SyllabusStatus[]) {
        const from = (await examRepository.getSyllabusById(syllabusId))!.status;
        const t = canTransition(from, next);
        if (!t.allowed) {
          return { ...base, outcome: 'VALIDATION_FAILED', status: from, documentHash: archived.hash,
                   reason: t.reason };
        }
        if (next === 'VALIDATING') {
          await examRepository.updateSyllabusStatus(syllabusId, 'VALIDATING');
          // Graph is published into its own version-isolated subtree before VERIFIED, so the
          // publish gate has a validated manifest to read.
          await syllabusGraphService.buildSyllabusGraph(syllabus);
        } else {
          await examRepository.updateSyllabusStatus(syllabusId, 'VERIFIED', { verifiedAt: Date.now() });
        }
      }
    } catch (err: any) {
      // Infrastructure, not the document. Explicitly NOT INVALID: the version stays wherever it
      // got to, always short of CURRENT, and the same request can be re-run.
      logger.error('[SyllabusOrchestrator] persistence failed', { examId, syllabusId, error: err?.message });
      const current = await examRepository.getSyllabusById(syllabusId).catch(() => null);
      return { ...base, outcome: 'RETRYABLE_FAILURE', status: current?.status ?? null,
               documentHash: archived.hash, storagePath: archived.storagePath,
               reason: 'PERSISTENCE_FAILED', errors: [String(err?.message ?? err)] };
    }

    if (!params.publish) {
      return { ...base, outcome: 'SUCCESS', status: 'VERIFIED', documentHash: archived.hash,
               storagePath: archived.storagePath, nodeCount: graph.nodes.length,
               reason: 'VERIFIED_NOT_PUBLISHED' };
    }

    // ── 7. PUBLICATION ───────────────────────────────────────────────────────────────────────
    // A single Firestore transaction that re-checks every precondition and supersedes the
    // previous CURRENT. Nothing here can half-apply.
    try {
      await examRepository.publishSyllabusVersion(examId, cycleId, syllabusId, performedBy);
    } catch (err: any) {
      return { ...base, outcome: 'VALIDATION_FAILED', status: 'VERIFIED',
               documentHash: archived.hash, storagePath: archived.storagePath,
               nodeCount: graph.nodes.length, reason: 'PUBLICATION_REJECTED',
               errors: [String(err?.message ?? err)] };
    }

    await this.audit({ ...base, operation: 'PUBLISHED', previousStatus: 'VERIFIED',
                       newStatus: 'CURRENT', documentHash: archived.hash, performedBy });

    return { ...base, outcome: 'SUCCESS', status: 'CURRENT', documentHash: archived.hash,
             storagePath: archived.storagePath, nodeCount: graph.nodes.length };
  }
}

export const syllabusIngestionOrchestrator = new SyllabusIngestionOrchestrator();
