import { officialSourceVerificationService } from './officialSourceVerification.service';
import { examDocumentStorageService, DocumentRetrievalError } from './examDocumentStorage.service';
import type { ExamMaster, OfficialSourceType } from '../../types/exam.types';

/**
 * J.6 — official source DISCOVERY.
 *
 * Finds candidate syllabus documents on an exam's own official infrastructure and says how
 * confident it is. It deliberately does NOT ingest, hash, store or publish anything: that is J.5's
 * job, and merging the two would let a discovery heuristic put a document on the canonical path.
 *
 *     official source → candidates → verified candidate → (explicit selection) → J.5
 *
 * Nothing here decides authority or identity. Domain authority stays with
 * officialSourceVerificationService; document validity stays with examDocumentStorageService's
 * J.4 checks. This layer only locates things and ranks them on evidence.
 */

export type CandidateStatus =
  /** Found on an official domain; not yet proven to be a real document. */
  | 'DISCOVERED'
  /** Domain verified AND the payload proved to be a genuine document AND it looks exam-relevant. */
  | 'VERIFIED_CANDIDATE'
  /** Ruled out — untrusted domain, not a document, or not relevant to this exam. */
  | 'REJECTED'
  /** Could not be reached. Distinct from rejected: nothing was judged. */
  | 'UNAVAILABLE'
  /** Plausible, but not distinguishable from another equally plausible candidate. */
  | 'AMBIGUOUS';

export type DiscoveryMethod =
  | 'OFFICIAL_API' | 'OFFICIAL_LISTING' | 'OFFICIAL_SITEMAP' | 'OFFICIAL_FEED'
  | 'OFFICIAL_PAGE' | 'OPERATOR_SUPPLIED';

export interface DocumentCandidate {
  examId: string;
  cycleId?: string;
  sourceId?: string;
  discoveredUrl: string;
  title?: string;
  documentType?: OfficialSourceType;
  publishedAt?: number;
  discoveredAt: number;
  discoveryMethod: DiscoveryMethod;
  officialDomainVerified: boolean;
  status: CandidateStatus;
  /** Machine-readable justification for the status. Never prose-only. */
  reasonCodes: string[];
  /** Deterministic relevance evidence; NOT a confidence percentage. */
  relevance?: RelevanceAssessment;
}

export interface RelevanceAssessment {
  verdict: 'RELEVANT' | 'NOT_RELEVANT' | 'AMBIGUOUS';
  /** Which concrete signals matched. The verdict must be explainable from these alone. */
  signals: string[];
}

export interface DiscoveryResult {
  examId: string;
  cycleId?: string;
  candidates: DocumentCandidate[];
  /** Single best candidate, only when one is deterministically better than the rest. */
  selected: DocumentCandidate | null;
  outcome: 'CANDIDATE_SELECTED' | 'AMBIGUOUS' | 'NO_OFFICIAL_DOCUMENT_FOUND';
  /** Why `selected` won, or why nothing was selected. */
  rationale: string[];
}

/** Raw listing entry from an official API/feed, before any judgement. */
export interface RawDiscoveryEntry {
  url: string;
  title?: string;
  publishedAt?: number;
  category?: string;
  documentType?: OfficialSourceType;
}

export class SyllabusSourceDiscoveryService {
  /**
   * URL safety beyond domain matching.
   *
   * The domain allowlist answers "is this host registered for this exam", which is necessary but
   * not sufficient — several ways exist to make a hostile URL *look* like it targets an official
   * host. Each is rejected on structure, never on appearance:
   *
   *   userinfo:      https://ssc.gov.in@evil.example/x.pdf   — the real host is evil.example
   *   suffix:        https://ssc.gov.in.evil.example/x.pdf   — a subdomain OF the attacker
   *   prefix:        https://evil-ssc.gov.in/x.pdf           — a different registrable domain
   *   open redirect: https://evil.example/r?to=ssc.gov.in    — host is evil.example regardless
   *
   * The last two are already handled correctly by isDomainAuthorized (it requires an exact match
   * or a dot-delimited suffix). userinfo is handled here because `new URL()` parses it away into
   * `username`/`password`, so a naive `href.includes('ssc.gov.in')` check would pass it.
   */
  private assertUrlShapeSafe(rawUrl: string): { safe: boolean; reason?: string } {
    let parsed: URL;
    try { parsed = new URL(rawUrl); } catch { return { safe: false, reason: 'URL_UNPARSEABLE' }; }

    if (parsed.username || parsed.password) {
      return { safe: false, reason: 'URL_CONTAINS_USERINFO' };
    }
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
      return { safe: false, reason: 'UNSUPPORTED_PROTOCOL' };
    }
    // Punycode/IDN hosts can render as a lookalike of an ASCII domain. Not rejected outright —
    // an authority could legitimately use one — but it must match the allowlist in its encoded
    // form, which isDomainAuthorized compares. Flagged so the decision stays visible.
    if (parsed.hostname.startsWith('xn--') || parsed.hostname.includes('.xn--')) {
      return { safe: true, reason: 'IDN_HOST_MATCHED_EXACTLY' };
    }
    return { safe: true };
  }

  /**
   * Deterministic relevance from metadata alone.
   *
   * An official domain publishes far more than syllabi — results, admit cards, answer keys, press
   * releases. Letting any official PDF become "the syllabus" would be the same category of error
   * as letting a homepage become one, just harder to spot.
   *
   * No LLM is consulted. Every verdict is reconstructible from `signals`, and anything that does
   * not clearly match becomes AMBIGUOUS rather than a guess in either direction.
   */
  assessRelevance(entry: RawDiscoveryEntry, exam: ExamMaster, cycleId?: string): RelevanceAssessment {
    const signals: string[] = [];
    const haystack = `${entry.title ?? ''} ${entry.category ?? ''} ${entry.url}`.toLowerCase();

    // Disqualifying document classes, checked first — a "CGL 2026 Answer Key" mentions both the
    // exam and the cycle and would otherwise score well.
    const excluded = ['answer key', 'result', 'admit card', 'press release', 'corrigendum',
                      'vacancy', 'cut off', 'cut-off', 'marks', 'tentative', 'calendar'];
    const hitExcluded = excluded.filter((k) => haystack.includes(k));
    if (hitExcluded.length > 0) {
      return { verdict: 'NOT_RELEVANT', signals: [`EXCLUDED_DOCUMENT_TYPE:${hitExcluded.join(',')}`] };
    }

    if (entry.documentType === 'SYLLABUS') signals.push('DECLARED_TYPE_SYLLABUS');
    if (haystack.includes('syllabus')) signals.push('TITLE_MENTIONS_SYLLABUS');

    const names = [exam.shortName, exam.name, ...(exam.aliases ?? [])]
      .filter(Boolean).map((n) => String(n).toLowerCase());
    const matchedName = names.find((n) => n.length >= 3 && haystack.includes(n));
    if (matchedName) signals.push(`EXAM_NAME_MATCH:${matchedName}`);

    if (cycleId && haystack.includes(cycleId.toLowerCase())) signals.push(`CYCLE_MATCH:${cycleId}`);

    // A syllabus signal plus an exam signal is the minimum for RELEVANT. Either alone is a
    // document that is about the right exam OR about a syllabus — not demonstrably both.
    const hasSyllabusSignal = signals.some((s) => s.startsWith('DECLARED_TYPE') || s.startsWith('TITLE_MENTIONS'));
    const hasExamSignal = signals.some((s) => s.startsWith('EXAM_NAME_MATCH'));

    if (hasSyllabusSignal && hasExamSignal) return { verdict: 'RELEVANT', signals };
    if (hasSyllabusSignal || hasExamSignal) return { verdict: 'AMBIGUOUS', signals };
    return { verdict: 'NOT_RELEVANT', signals: signals.length ? signals : ['NO_MATCHING_SIGNAL'] };
  }

  /**
   * Turns one raw listing entry into a judged candidate.
   *
   * `probeDocument` actually fetches the bytes to prove the URL serves a document, reusing the J.4
   * validation rather than reimplementing it — which is what stops an official-domain soft-404
   * becoming a candidate. Nothing is hashed or stored here; the bytes are discarded.
   */
  async evaluateCandidate(params: {
    entry: RawDiscoveryEntry;
    exam: ExamMaster;
    cycleId?: string;
    sourceId?: string;
    discoveryMethod: DiscoveryMethod;
    probeDocument: boolean;
    fetchBytes?: (url: string) => Promise<{ buffer: Buffer; contentType: string }>;
  }): Promise<DocumentCandidate> {
    const { entry, exam, cycleId, sourceId, discoveryMethod } = params;
    const now = Date.now();
    const base: DocumentCandidate = {
      examId: exam.examId, cycleId, sourceId,
      discoveredUrl: entry.url, title: entry.title, documentType: entry.documentType,
      publishedAt: entry.publishedAt, discoveredAt: now, discoveryMethod,
      officialDomainVerified: false, status: 'DISCOVERED', reasonCodes: [],
    };

    const shape = this.assertUrlShapeSafe(entry.url);
    if (!shape.safe) {
      return { ...base, status: 'REJECTED', reasonCodes: [shape.reason ?? 'URL_UNSAFE'] };
    }

    const verification = officialSourceVerificationService.verifyOfficialSource(exam, entry.url);
    if (!verification.isOfficial) {
      return { ...base, status: 'REJECTED', reasonCodes: ['DOMAIN_NOT_OFFICIAL'] };
    }
    base.officialDomainVerified = true;
    base.discoveredUrl = verification.normalizedUrl;

    const relevance = this.assessRelevance(entry, exam, cycleId);
    if (relevance.verdict === 'NOT_RELEVANT') {
      return { ...base, status: 'REJECTED', relevance, reasonCodes: ['NOT_EXAM_RELEVANT'] };
    }

    if (!params.probeDocument || !params.fetchBytes) {
      return { ...base, status: relevance.verdict === 'AMBIGUOUS' ? 'AMBIGUOUS' : 'DISCOVERED',
               relevance, reasonCodes: ['NOT_PROBED'] };
    }

    try {
      const { buffer, contentType } = await params.fetchBytes(base.discoveredUrl);
      // J.4 validation, reused verbatim. Bytes are discarded afterwards — discovery never stores.
      examDocumentStorageService.assertRetrievedDocument({
        buffer, contentType, sourceUrl: base.discoveredUrl,
      });
      return {
        ...base,
        status: relevance.verdict === 'AMBIGUOUS' ? 'AMBIGUOUS' : 'VERIFIED_CANDIDATE',
        relevance,
        reasonCodes: ['DOCUMENT_VALIDATED', ...relevance.signals],
      };
    } catch (err: any) {
      const isRejection = err instanceof DocumentRetrievalError;
      return {
        ...base,
        status: isRejection ? 'REJECTED' : 'UNAVAILABLE',
        relevance,
        reasonCodes: [isRejection ? err.code : 'FETCH_FAILED'],
      };
    }
  }

  /**
   * Ranks verified candidates and selects one ONLY when it is deterministically better.
   *
   * Ordering is by evidence, not by position in the listing: taking the first result would make
   * the outcome depend on an official site's arbitrary sort order. When the best two are
   * indistinguishable on every signal the result is AMBIGUOUS and a human chooses — guessing here
   * would silently pick a syllabus for an entire exam.
   */
  select(candidates: DocumentCandidate[], cycleId?: string): DiscoveryResult {
    const examId = candidates[0]?.examId ?? '';
    const usable = candidates.filter((c) => c.status === 'VERIFIED_CANDIDATE');

    if (usable.length === 0) {
      const ambiguous = candidates.filter((c) => c.status === 'AMBIGUOUS');
      if (ambiguous.length > 0) {
        return { examId, cycleId, candidates, selected: null, outcome: 'AMBIGUOUS',
                 rationale: [`${ambiguous.length} candidate(s) could not be confirmed exam-relevant`] };
      }
      return { examId, cycleId, candidates, selected: null, outcome: 'NO_OFFICIAL_DOCUMENT_FOUND',
               rationale: ['no candidate passed domain, document and relevance checks'] };
    }

    /** Deterministic score from named signals only — no weights invented for plausibility. */
    const score = (c: DocumentCandidate): number =>
      (c.documentType === 'SYLLABUS' ? 8 : 0) +
      (c.relevance?.signals.some((s) => s.startsWith('CYCLE_MATCH')) ? 4 : 0) +
      (c.relevance?.signals.some((s) => s.startsWith('EXAM_NAME_MATCH')) ? 2 : 0) +
      (c.relevance?.signals.includes('TITLE_MENTIONS_SYLLABUS') ? 1 : 0);

    const ranked = [...usable].sort((a, b) => {
      const d = score(b) - score(a);
      if (d !== 0) return d;
      // Newer official publication wins only as a tie-break between equal evidence.
      return (b.publishedAt ?? 0) - (a.publishedAt ?? 0);
    });

    const [best, runnerUp] = ranked;
    if (runnerUp && score(best) === score(runnerUp) && (best.publishedAt ?? 0) === (runnerUp.publishedAt ?? 0)) {
      return { examId, cycleId, candidates, selected: null, outcome: 'AMBIGUOUS',
               rationale: ['two candidates are indistinguishable on every deterministic signal',
                           `tied: ${best.discoveredUrl} vs ${runnerUp.discoveredUrl}`] };
    }

    return {
      examId, cycleId, candidates, selected: best, outcome: 'CANDIDATE_SELECTED',
      rationale: [`selected on signals: ${best.relevance?.signals.join(', ') ?? 'none'}`,
                  runnerUp ? `outranked ${runnerUp.discoveredUrl}` : 'only verified candidate'],
    };
  }

  /**
   * Deduplicates by normalized URL.
   *
   * Normalization is the verifier's, which strips tracking params and fragments but keeps every
   * other query parameter — official document endpoints routinely identify the file through a
   * query string, and collapsing those would merge genuinely different documents into one.
   */
  dedupe(candidates: DocumentCandidate[]): DocumentCandidate[] {
    const seen = new Map<string, DocumentCandidate>();
    for (const c of candidates) {
      const key = c.discoveredUrl;
      const existing = seen.get(key);
      // Keep the more-resolved judgement if the same URL arrives twice.
      if (!existing || (existing.status === 'DISCOVERED' && c.status !== 'DISCOVERED')) {
        seen.set(key, c);
      }
    }
    return Array.from(seen.values());
  }
}

export const syllabusSourceDiscoveryService = new SyllabusSourceDiscoveryService();
