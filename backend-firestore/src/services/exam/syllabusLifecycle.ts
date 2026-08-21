import { ExamSyllabus, SyllabusStatus } from '../../types/exam.types';

/**
 * Syllabus lifecycle and provenance rules — pure, no I/O, no clock beyond a supplied `now`.
 *
 * WHY THIS EXISTS. The Phase 0 audit found production carrying a syllabus marked CURRENT whose
 * `sourceDocumentHash` was `e3b0c442…b855` — the SHA-256 of the empty string, hardcoded in the
 * seed file. Nothing had ever been fetched, hashed or validated, yet the record presented itself
 * as the authoritative current syllabus for a live exam. The publish transaction could not have
 * caught it: it set CURRENT with no precondition on the record's existing status, so a DRAFT could
 * jump straight to CURRENT, and it stamped `verifiedAt` at publish time — conflating "someone
 * verified this" with "someone published this".
 *
 * The rule these encode: CURRENT is a claim that a real official document was located, retrieved,
 * hashed, extracted, and structurally validated. A record cannot arrive at that claim by existing,
 * by an extraction returning without error, or by an administrator asking nicely.
 *
 * Deliberately separate from Firestore so every transition and every provenance rule is decidable
 * from values alone, and therefore exhaustively testable.
 */

// ─── Lifecycle ───────────────────────────────────────────────────────────────────────────────

/**
 * Allowed transitions. Anything not listed is rejected — an allowlist, not a denylist, so a new
 * status added later cannot silently become reachable from everywhere.
 *
 * The forward path mirrors what actually has to happen in the world:
 *
 *   DISCOVERED  an authoritative source URL is known
 *   FETCHED     the document was retrieved and hashed
 *   VALIDATING  extraction ran; structure is being checked
 *   VERIFIED    extraction AND structural validation passed — publishable, not yet published
 *   CURRENT     this is the authoritative version for its exam+cycle
 *   SUPERSEDED  a newer version took over; retained forever for historical evidence
 *
 * Two terminal-ish failure states, deliberately distinct because they need different responses:
 *   UNAVAILABLE the authoritative source could not be obtained (network, withdrawal, 404).
 *               Retry later; nothing is wrong with our processing.
 *   INVALID     we HAVE the document but extraction or structural validation failed.
 *               Retrying the fetch will not help; the extraction or the document needs attention.
 */
export const ALLOWED_TRANSITIONS: Record<SyllabusStatus, SyllabusStatus[]> = {
  DRAFT: ['DISCOVERED', 'FETCHED', 'UNAVAILABLE', 'INVALID'],
  DISCOVERED: ['FETCHED', 'UNAVAILABLE', 'INVALID'],
  // A fetch can be re-attempted (hash changed upstream) or fail structurally once extracted.
  FETCHED: ['VALIDATING', 'FETCHED', 'UNAVAILABLE', 'INVALID'],
  VALIDATING: ['VERIFIED', 'INVALID', 'UNAVAILABLE'],
  // VERIFIED may go back to VALIDATING when the source document changes underneath it.
  VERIFIED: ['CURRENT', 'VALIDATING', 'INVALID', 'SUPERSEDED'],
  CURRENT: ['SUPERSEDED', 'INVALID'],
  // Historical versions are never reactivated. A returning syllabus is a NEW version with its own
  // identity, so evidence attached to the old one keeps meaning exactly what it meant.
  SUPERSEDED: [],
  // Recoverable: the source may become reachable again, and re-fetching is the way back in.
  UNAVAILABLE: ['DISCOVERED', 'FETCHED'],
  // Recoverable only by re-extracting from a fetched document.
  INVALID: ['FETCHED', 'VALIDATING'],
  ARCHIVED: [],
};

export interface TransitionResult { allowed: boolean; reason?: string; }

/** Whether `from → to` is a legal lifecycle move. Same status is a no-op and always allowed. */
export function canTransition(from: SyllabusStatus, to: SyllabusStatus): TransitionResult {
  if (from === to) return { allowed: true };
  const permitted = ALLOWED_TRANSITIONS[from];
  if (!permitted) return { allowed: false, reason: `UNKNOWN_SOURCE_STATUS:${from}` };
  if (!permitted.includes(to)) {
    return { allowed: false, reason: `ILLEGAL_TRANSITION:${from}->${to}` };
  }
  return { allowed: true };
}

// ─── Provenance ──────────────────────────────────────────────────────────────────────────────

export interface ProvenanceError { field: string; code: string; detail: string }

/** SHA-256 of the empty string. A document that hashes to this had no bytes in it. */
export const EMPTY_SHA256 = 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';

const HEX64 = /^[0-9a-f]{64}$/i;

/**
 * Official-source URL check.
 *
 * Deliberately structural only — scheme and a parseable host. Whether the HOST is authoritative
 * for a given exam is a different question, already owned by officialSourceVerificationService,
 * and duplicating a domain allowlist here would create a second source of truth that drifts.
 */
function isUsableSourceUrl(url?: string): boolean {
  if (!url) return false;
  try {
    const u = new URL(url);
    return (u.protocol === 'https:' || u.protocol === 'http:') && !!u.hostname;
  } catch { return false; }
}

/**
 * Validates that a syllabus record's provenance can actually support the claims made about it.
 *
 * `requireDocument` is false for early states (DISCOVERED knows a URL but has fetched nothing) and
 * true from FETCHED onward, where a hash and retrieval timestamp must exist.
 */
export function validateProvenance(
  syllabus: Partial<ExamSyllabus>,
  opts: { requireDocument: boolean; requireStorage?: boolean } = { requireDocument: true },
): { valid: boolean; errors: ProvenanceError[] } {
  const errors: ProvenanceError[] = [];
  const push = (field: string, code: string, detail: string) => errors.push({ field, code, detail });

  if (!syllabus.examId?.trim()) push('examId', 'MISSING', 'exam identity is required');
  if (!syllabus.cycleId?.trim()) push('cycleId', 'MISSING', 'cycle identity is required');
  if (!syllabus.syllabusId?.trim()) push('syllabusId', 'MISSING', 'syllabus version identity is required');
  if (!syllabus.authority?.trim()) {
    push('authority', 'MISSING', 'the conducting authority must be named — an unattributed syllabus has no provenance');
  }

  if (!isUsableSourceUrl(syllabus.sourceDocumentUrl)) {
    push('sourceDocumentUrl', 'INVALID_URL', `not a usable http(s) URL: ${syllabus.sourceDocumentUrl ?? 'absent'}`);
  }
  if (syllabus.sourceUrl && !isUsableSourceUrl(syllabus.sourceUrl)) {
    push('sourceUrl', 'INVALID_URL', `not a usable http(s) URL: ${syllabus.sourceUrl}`);
  }

  if (opts.requireDocument) {
    const hash = syllabus.sourceDocumentHash;
    if (!hash?.trim()) {
      push('sourceDocumentHash', 'MISSING', 'a retrieved document must be hashed');
    } else if (!HEX64.test(hash)) {
      push('sourceDocumentHash', 'MALFORMED', `not a SHA-256 hex digest: "${hash.slice(0, 20)}…"`);
    } else if (hash.toLowerCase() === EMPTY_SHA256) {
      // The exact failure found in production: a seed shipped this as the provenance of a CURRENT
      // syllabus. It is a syntactically perfect hash of nothing at all.
      push('sourceDocumentHash', 'EMPTY_DOCUMENT_HASH',
           'hash is SHA-256 of an empty document — no source was actually retrieved');
    }
    if (!syllabus.retrievedAt) {
      push('retrievedAt', 'MISSING', 'a retrieved document must record when it was retrieved');
    }
    if (opts.requireStorage && !syllabus.storagePath?.trim()) {
      push('storagePath', 'MISSING', 'the retrieved document must be archived so the claim stays auditable');
    }
  }

  // Timestamps must describe a possible history. Out-of-order stamps mean the record was
  // assembled rather than observed, which is exactly what the empty-hash seed was.
  const { retrievedAt, extractedAt, verifiedAt, publishedAt } = syllabus;
  const ordered: Array<[string, number | undefined]> = [
    ['retrievedAt', retrievedAt], ['extractedAt', extractedAt],
    ['verifiedAt', verifiedAt], ['publishedAt', publishedAt],
  ];
  for (let i = 0; i < ordered.length; i++) {
    for (let j = i + 1; j < ordered.length; j++) {
      const [aName, a] = ordered[i];
      const [bName, b] = ordered[j];
      if (a && b && b < a) {
        push(bName, 'TIMESTAMP_OUT_OF_ORDER', `${bName} (${b}) precedes ${aName} (${a})`);
      }
    }
  }

  return { valid: errors.length === 0, errors };
}

// ─── Publication gate ────────────────────────────────────────────────────────────────────────

export interface PublishCheck {
  publishable: boolean;
  errors: ProvenanceError[];
}

/**
 * Everything that must hold before a version may become CURRENT.
 *
 * `graphValidated` is supplied by the caller rather than recomputed here: the canonical graph is
 * validated and persisted by syllabusGraphService, and re-deriving that verdict in a second place
 * would let the two disagree. A caller that cannot prove the graph is valid must pass false.
 */
export function assertPublishable(
  syllabus: Partial<ExamSyllabus>,
  context: { graphValidated: boolean; nodeCount: number },
): PublishCheck {
  const errors: ProvenanceError[] = [];

  // CURRENT is only reachable from VERIFIED. Publishing a DRAFT — which the old transaction
  // allowed — asserts an authoritative syllabus that nothing ever checked.
  const status = syllabus.status;
  if (status !== 'VERIFIED' && status !== 'CURRENT') {
    errors.push({ field: 'status', code: 'NOT_VERIFIED',
                  detail: `only a VERIFIED version may be published; found ${status ?? 'undefined'}` });
  }

  const provenance = validateProvenance(syllabus, { requireDocument: true });
  errors.push(...provenance.errors);

  if (!syllabus.extractedAt) {
    errors.push({ field: 'extractedAt', code: 'MISSING', detail: 'no successful extraction recorded' });
  }
  if (!context.graphValidated) {
    errors.push({ field: 'graph', code: 'GRAPH_NOT_VALIDATED',
                  detail: 'canonical graph has not passed structural validation' });
  }
  if (!context.nodeCount || context.nodeCount <= 0) {
    // An empty graph is not a syllabus with no topics — it is an extraction that produced nothing.
    errors.push({ field: 'graph', code: 'EMPTY_GRAPH', detail: 'canonical graph has no nodes' });
  }

  return { publishable: errors.length === 0, errors };
}

/**
 * Which failure state a fetch/extraction problem belongs in.
 *
 * The distinction is operational, not cosmetic: UNAVAILABLE means retry the fetch, INVALID means
 * the fetch succeeded and something about the document or our extraction needs a human. Collapsing
 * them would send every failure down the same useless retry loop.
 */
export function failureStatusFor(kind: 'SOURCE_UNREACHABLE' | 'EXTRACTION_FAILED' | 'VALIDATION_FAILED'): SyllabusStatus {
  return kind === 'SOURCE_UNREACHABLE' ? 'UNAVAILABLE' : 'INVALID';
}
