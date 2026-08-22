/**
 * J.11 — the refresh engine.
 *
 * One entry point for "is this exam's official syllabus still what we think it is?":
 *
 *     discover → compare document hash → unchanged? stop : ingest as a NEW version
 *
 * WHY HASH COMPARISON RATHER THAN RE-INGESTION. Authorities republish constantly — a corrigendum,
 * a reformatted PDF, a new cycle. Re-ingesting unconditionally would mint a new syllabus version
 * every run, and every version change re-keys canonical node ids, which would orphan the evidence
 * attached to the old ones. So a run that finds the same bytes must be a no-op, and only genuinely
 * different bytes become a new version.
 *
 * WHAT IT WILL NOT DO. It never mutates an existing version — the old syllabus and its graph stay
 * byte-identical forever, because historical student evidence points at them. It never publishes an
 * ambiguous discovery. And it never reinterprets past evidence against a new syllabus: a diff is
 * reported for a human, not applied to anyone's record.
 */
import { logger } from '../../utils/logger';
import type { ExamMaster } from '../../types/exam.types';
import { examRepository } from '../../repositories/exam.repository';
import { syllabusDiscoveryEngine, DiscoveryEngineResult } from './discovery/syllabusDiscoveryEngine';
import { syllabusIngestionOrchestrator } from './syllabusIngestionOrchestrator';
import { syllabusDiffService } from './syllabusDiff.service';
import { fetchOfficialDocument, withDomainRateLimit, withRetry } from './officialFetch';
import { examDocumentStorageService } from './examDocumentStorage.service';
import crypto from 'crypto';

export type RefreshOutcome =
  /** Discovery found the same document we already hold. Nothing was written. */
  | 'NO_CHANGE'
  /** A different document was found and ingested as a new version. */
  | 'UPDATED'
  /** First syllabus for this exam+cycle. */
  | 'CREATED'
  /** Discovery could not settle on one document. A human must choose. */
  | 'AMBIGUOUS'
  /** No official document exists for this exam+cycle. */
  | 'NO_OFFICIAL_DOCUMENT_FOUND'
  /** The authority could not be reached, or ingestion hit a transient failure. Retry later. */
  | 'UNAVAILABLE'
  /** A document was found but could not become a valid syllabus. */
  | 'INVALID'
  /** Discovery itself failed. */
  | 'DISCOVERY_FAILED';

export interface RefreshResult {
  examId: string;
  cycleId: string;
  outcome: RefreshOutcome;
  /** The version now CURRENT, when one is. */
  syllabusId?: string;
  previousSyllabusId?: string;
  documentHash?: string;
  previousDocumentHash?: string;
  /** Structural change summary when a version was replaced. Advisory — never auto-applied. */
  diff?: unknown;
  discovery?: Pick<DiscoveryEngineResult, 'outcome' | 'rationale' | 'providerId' | 'attempts'>;
  requiresReview: boolean;
  reason?: string;
}

export class SyllabusRefreshService {
  /**
   * Refreshes one exam + cycle.
   *
   * `publish` defaults to FALSE. Discovering a document is not consent to make it authoritative for
   * every student sitting that exam; promotion to CURRENT stays an explicit decision. Callers that
   * genuinely want unattended refresh must opt in.
   */
  async refreshExamSyllabus(params: {
    exam: ExamMaster;
    cycleId: string;
    performedBy: string;
    publish?: boolean;
    fetchText?: any;
    fetchBytes?: any;
  }): Promise<RefreshResult> {
    const { exam, cycleId, performedBy } = params;
    const examId = exam.examId;
    const base = { examId, cycleId, requiresReview: false };

    // ── What we currently hold ───────────────────────────────────────────────────────────────
    // Read first so "no change" can be decided without touching the authority twice.
    const existing = await examRepository.getCurrentSyllabus(examId, cycleId);
    const previousHash = existing?.sourceDocumentHash;

    // ── Discover ─────────────────────────────────────────────────────────────────────────────
    const discovery = await syllabusDiscoveryEngine.discover({
      exam, cycleId, fetchText: params.fetchText, fetchBytes: params.fetchBytes,
    });
    const discoverySummary = {
      outcome: discovery.outcome, rationale: discovery.rationale,
      providerId: discovery.providerId, attempts: discovery.attempts,
    };

    if (discovery.outcome !== 'FOUND' || !discovery.selected) {
      const outcome: RefreshOutcome =
        discovery.outcome === 'AMBIGUOUS' ? 'AMBIGUOUS'
          : discovery.outcome === 'SOURCE_UNAVAILABLE' ? 'UNAVAILABLE'
            : discovery.outcome === 'NO_OFFICIAL_DOCUMENT_FOUND' ? 'NO_OFFICIAL_DOCUMENT_FOUND'
              : 'DISCOVERY_FAILED';
      return {
        ...base, outcome, discovery: discoverySummary,
        previousSyllabusId: existing?.syllabusId, previousDocumentHash: previousHash,
        requiresReview: discovery.requiresReview,
        reason: discovery.rationale[0],
      };
    }

    const url = discovery.selected.discoveredUrl;

    // ── Change detection, BEFORE ingesting ───────────────────────────────────────────────────
    // Hash the bytes we would ingest and compare. Cheaper than a full ingestion, and it means an
    // unchanged document never mints a version that would re-key every canonical node id.
    let candidateHash: string;
    try {
      const host = new URL(url).hostname;
      const fetched = params.fetchBytes
        ? await params.fetchBytes(url)
        : await withDomainRateLimit(host, () => withRetry(
            () => fetchOfficialDocument({ url, exam }), { label: `refresh:${host}` }));
      // Validate before hashing — a soft-404's bytes must never become a comparison baseline.
      examDocumentStorageService.assertRetrievedDocument({
        buffer: fetched.buffer, contentType: fetched.contentType, sourceUrl: url,
      });
      candidateHash = crypto.createHash('sha256').update(fetched.buffer).digest('hex');
    } catch (err: any) {
      return { ...base, outcome: 'UNAVAILABLE', discovery: discoverySummary,
               previousSyllabusId: existing?.syllabusId, previousDocumentHash: previousHash,
               reason: `could not retrieve ${url}: ${err?.message}` };
    }

    if (previousHash && previousHash === candidateHash) {
      logger.info('[SyllabusRefresh] no change', { examId, cycleId, hash: candidateHash.slice(0, 12) });
      return { ...base, outcome: 'NO_CHANGE', syllabusId: existing!.syllabusId,
               previousSyllabusId: existing!.syllabusId,
               documentHash: candidateHash, previousDocumentHash: previousHash,
               discovery: discoverySummary };
    }

    // ── Ingest as a NEW version ──────────────────────────────────────────────────────────────
    // Version label is derived from the document hash, so the same document always addresses the
    // same version and a different one always gets its own. Nothing existing is mutated.
    const version = `${cycleId}-${candidateHash.slice(0, 8)}`;
    const ingest = await syllabusIngestionOrchestrator.ingestSyllabusVersion({
      exam, cycleId, version, sourceDocumentUrl: url,
      sourceDocumentTitle: discovery.selected.title,
      sourceDocumentType: discovery.selected.documentType,
      performedBy,
      publish: params.publish === true,
    });

    if (ingest.outcome === 'ALREADY_CURRENT' || ingest.outcome === 'ALREADY_EXISTS') {
      return { ...base, outcome: 'NO_CHANGE', syllabusId: ingest.syllabusId,
               previousSyllabusId: existing?.syllabusId, documentHash: ingest.documentHash,
               previousDocumentHash: previousHash, discovery: discoverySummary,
               reason: ingest.reason };
    }
    if (ingest.outcome !== 'SUCCESS') {
      const outcome: RefreshOutcome =
        ingest.outcome === 'UNAVAILABLE' || ingest.outcome === 'RETRYABLE_FAILURE'
          ? 'UNAVAILABLE' : 'INVALID';
      return { ...base, outcome, syllabusId: ingest.syllabusId, documentHash: ingest.documentHash,
               previousSyllabusId: existing?.syllabusId, previousDocumentHash: previousHash,
               discovery: discoverySummary, reason: ingest.reason,
               // A document that reached us but could not become a syllabus wants a human.
               requiresReview: outcome === 'INVALID' };
    }

    // ── Diff, for humans ─────────────────────────────────────────────────────────────────────
    // Reported, never applied. Reinterpreting historical evidence against a new syllabus would
    // silently rewrite what past students were measured on.
    let diff: unknown;
    if (existing) {
      try {
        const updated = await examRepository.getSyllabusById(ingest.syllabusId);
        if (updated) diff = syllabusDiffService.compare(existing, updated);
      } catch (err: any) {
        logger.warn('[SyllabusRefresh] diff unavailable', { examId, error: err?.message });
      }
    }

    return {
      ...base,
      outcome: existing ? 'UPDATED' : 'CREATED',
      syllabusId: ingest.syllabusId,
      previousSyllabusId: existing?.syllabusId,
      documentHash: ingest.documentHash,
      previousDocumentHash: previousHash,
      diff,
      discovery: discoverySummary,
      // A structural change to a live exam's syllabus is exactly when a person should look.
      requiresReview: !!existing,
    };
  }
}

export const syllabusRefreshService = new SyllabusRefreshService();
