/**
 * J.11 — the discovery engine.
 *
 * Joins the two halves that never met: providers ACQUIRE candidate URLs from an authority's own
 * infrastructure, and J.6's SyllabusSourceDiscoveryService JUDGES them. The engine owns the
 * sequencing, the politeness and the audit trail, and nothing else — every decision it reports was
 * made by a service that already owned that decision before J.11 existed.
 *
 *     provider (acquire) → J.6 evaluateCandidate (verify domain + payload + relevance)
 *                        → J.6 select (deterministic ranking, ties refuse)
 *                        → typed outcome
 *
 * It stops at "here is the document to ingest". Handing that to J.5 is a separate, explicit step,
 * because a discovery heuristic must never be able to put a document on the canonical path by
 * itself — that separation is why J.6 was built as a distinct service and it is preserved here.
 */
import { logger } from '../../../utils/logger';
import type { ExamMaster } from '../../../types/exam.types';
import {
  syllabusSourceDiscoveryService, DocumentCandidate, DiscoveryResult,
} from '../syllabusSourceDiscovery.service';
import {
  DiscoveryProviderRegistry, DiscoveryContext, STRATEGY_TO_METHOD, ProviderOutcome,
} from './officialDiscoveryProvider';
import { genericOfficialDiscoveryProvider } from './genericOfficialDiscoveryProvider';
import {
  fetchOfficialDocument, withDomainRateLimit, withRetry, OfficialFetchError,
} from '../officialFetch';

export type DiscoveryOutcome =
  | 'FOUND'
  | 'AMBIGUOUS'
  | 'NO_OFFICIAL_DOCUMENT_FOUND'
  | 'SOURCE_UNAVAILABLE'
  | 'NO_PROVIDER'
  | 'DISCOVERY_FAILED';

export interface DiscoveryEngineResult {
  examId: string;
  cycleId: string;
  outcome: DiscoveryOutcome;
  /** Present only for FOUND. The document J.5 should ingest. */
  selected: DocumentCandidate | null;
  candidates: DocumentCandidate[];
  rationale: string[];
  providerId: string | null;
  /** Per-strategy record: what ran, against what, and what it yielded. */
  attempts: ProviderOutcome['attempts'];
  /** Whether a human must choose before anything is ingested. */
  requiresReview: boolean;
  durationMs: number;
}

export class SyllabusDiscoveryEngine {
  constructor(private registry: DiscoveryProviderRegistry = defaultRegistry()) {}

  /**
   * Discovers the official syllabus document for one exam + cycle.
   *
   * `SOURCE_UNAVAILABLE` and `NO_OFFICIAL_DOCUMENT_FOUND` are kept apart deliberately: "the site
   * was down" and "this authority publishes no syllabus document" are different operational facts,
   * and collapsing them would make a transient outage look like a permanent absence — the same
   * class of error as letting a Firestore failure read as "no syllabus".
   */
  async discover(params: {
    exam: ExamMaster;
    cycleId: string;
    maxEntries?: number;
    /** Injected in tests/E2E. Production uses the redirect- and SSRF-safe fetcher. */
    fetchText?: DiscoveryContext['fetchText'];
    fetchBytes?: (url: string) => Promise<{ buffer: Buffer; contentType: string }>;
  }): Promise<DiscoveryEngineResult> {
    const started = Date.now();
    const { exam, cycleId } = params;
    const base = {
      examId: exam.examId, cycleId, selected: null as DocumentCandidate | null,
      candidates: [] as DocumentCandidate[], providerId: null as string | null,
      attempts: [] as ProviderOutcome['attempts'], requiresReview: false,
    };

    const provider = this.registry.resolve(exam);
    if (!provider) {
      return { ...base, outcome: 'NO_PROVIDER',
               rationale: [`no discovery provider claims authority "${exam.conductingAuthority}"`],
               durationMs: Date.now() - started };
    }

    const fetchText = params.fetchText ?? this.defaultFetchText(exam);
    const fetchBytes = params.fetchBytes ?? this.defaultFetchBytes(exam);

    let produced: ProviderOutcome;
    try {
      produced = await provider.discover({
        exam, cycleId, maxEntries: params.maxEntries ?? 40, fetchText,
      });
    } catch (err: any) {
      logger.error('[Discovery] provider threw', { examId: exam.examId, provider: provider.id, error: err?.message });
      return { ...base, providerId: provider.id, outcome: 'DISCOVERY_FAILED',
               rationale: [`provider ${provider.id} failed: ${err?.message}`],
               durationMs: Date.now() - started };
    }

    /*
     * Unavailability vs absence.
     *
     * Only attempts that ACTUALLY CONTACTED the authority count as evidence of reachability.
     * REGISTERED_SOURCE reads the exam registry and makes no request, so its "NO_ENTRIES" says
     * nothing about the site — counting it masked a total outage, and this returned
     * NO_OFFICIAL_DOCUMENT_FOUND while every real strategy had failed with UNAVAILABLE. That is
     * the same class of error as letting a repository failure read as "no syllabus": it converts
     * "we could not ask" into a settled fact about the exam.
     */
    const networkAttempts = produced.attempts.filter((a) => a.networkAttempted);
    const reached = networkAttempts.some((a) => a.outcome !== 'UNAVAILABLE');
    if (produced.entries.length === 0 && networkAttempts.length > 0 && !reached) {
      return { ...base, providerId: provider.id, attempts: produced.attempts,
               outcome: 'SOURCE_UNAVAILABLE',
               rationale: ['no official endpoint could be reached'],
               durationMs: Date.now() - started };
    }

    // ── Judgement is J.6's, unchanged ────────────────────────────────────────────────────────
    const candidates: DocumentCandidate[] = [];
    for (const entry of produced.entries) {
      const candidate = await syllabusSourceDiscoveryService.evaluateCandidate({
        entry: { url: entry.url, title: entry.title, publishedAt: entry.publishedAt,
                 category: entry.category, documentType: entry.documentType },
        exam, cycleId,
        discoveryMethod: STRATEGY_TO_METHOD[entry.strategy],
        // Bytes are fetched to prove the URL serves a real document (J.4 checks) and then
        // discarded. Discovery never stores.
        probeDocument: true,
        fetchBytes,
      });
      candidates.push(candidate);
    }

    const deduped = syllabusSourceDiscoveryService.dedupe(candidates);
    const selection: DiscoveryResult = syllabusSourceDiscoveryService.select(deduped, cycleId);

    const outcome: DiscoveryOutcome =
      selection.outcome === 'CANDIDATE_SELECTED' ? 'FOUND'
        : selection.outcome === 'AMBIGUOUS' ? 'AMBIGUOUS'
          : 'NO_OFFICIAL_DOCUMENT_FOUND';

    logger.info('[Discovery] completed', {
      examId: exam.examId, cycleId, providerId: provider.id, outcome,
      candidates: deduped.length, durationMs: Date.now() - started,
      selectedUrl: selection.selected?.discoveredUrl,
    });

    return {
      examId: exam.examId, cycleId, outcome,
      selected: selection.selected, candidates: deduped,
      rationale: selection.rationale, providerId: provider.id,
      attempts: produced.attempts,
      // A tie must be resolved by a person, never by the engine and never by a model.
      requiresReview: outcome === 'AMBIGUOUS',
      durationMs: Date.now() - started,
    };
  }

  /** Rate-limited, redirect-revalidating text fetch for provider strategies. */
  private defaultFetchText(exam: ExamMaster): DiscoveryContext['fetchText'] {
    return async (url: string) => {
      const host = new URL(url).hostname;
      return withDomainRateLimit(host, () => withRetry(async () => {
        const res = await fetchOfficialDocument({ url, exam, maxBytes: 8 * 1024 * 1024 });
        return { body: res.buffer.toString('utf8'), contentType: res.contentType, finalUrl: res.finalUrl };
      }, { label: `discovery-text:${host}` }));
    };
  }

  /** Rate-limited, redirect-revalidating byte fetch for document probing. */
  private defaultFetchBytes(exam: ExamMaster) {
    return async (url: string) => {
      const host = new URL(url).hostname;
      return withDomainRateLimit(host, () => withRetry(async () => {
        const res = await fetchOfficialDocument({ url, exam });
        return { buffer: res.buffer, contentType: res.contentType };
      }, { label: `discovery-bytes:${host}` }));
    };
  }
}

/** Generic provider registered last so an authority-specific one can override it. */
export function defaultRegistry(): DiscoveryProviderRegistry {
  return new DiscoveryProviderRegistry().register(genericOfficialDiscoveryProvider);
}

export const syllabusDiscoveryEngine = new SyllabusDiscoveryEngine();
export { OfficialFetchError };
