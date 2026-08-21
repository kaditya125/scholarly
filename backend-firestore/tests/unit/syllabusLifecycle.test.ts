/**
 * Syllabus lifecycle + provenance (J.2).
 *
 * THE FAILURE THESE PREVENT: production carried a syllabus marked CURRENT whose
 * sourceDocumentHash was the SHA-256 of the empty string, hardcoded in a seed file. Nothing was
 * ever fetched, hashed or validated — yet the record presented itself as the authoritative
 * syllabus for a live exam. The publish transaction could not have caught it: it moved ANY record
 * to CURRENT with no precondition, and stamped verifiedAt at publish time so "verified" and
 * "published" became indistinguishable.
 */
import {
  canTransition, validateProvenance, assertPublishable, failureStatusFor,
  ALLOWED_TRANSITIONS, EMPTY_SHA256,
} from '../../src/services/exam/syllabusLifecycle';
import type { ExamSyllabus, SyllabusStatus } from '../../src/types/exam.types';

const REAL_HASH = 'a'.repeat(64);
const T = 1_700_000_000_000;

const verified = (over: Partial<ExamSyllabus> = {}): Partial<ExamSyllabus> => ({
  syllabusId: 'syl_zz_2026_v1', examId: 'ZZ', cycleId: '2026', version: '2026-v1',
  authority: 'ZZ Commission', status: 'VERIFIED',
  sourceDocumentUrl: 'https://zz.gov.invalid/syllabus.pdf',
  sourceDocumentHash: REAL_HASH,
  retrievedAt: T, extractedAt: T + 10, verifiedAt: T + 20,
  ...over,
});

const okGraph = { graphValidated: true, nodeCount: 12 };

describe('lifecycle transitions', () => {
  it('follows the real-world path forward', () => {
    const path: SyllabusStatus[] = ['DISCOVERED', 'FETCHED', 'VALIDATING', 'VERIFIED', 'CURRENT', 'SUPERSEDED'];
    for (let i = 0; i < path.length - 1; i++) {
      expect(canTransition(path[i], path[i + 1])).toEqual({ allowed: true });
    }
  });

  it('THE REGRESSION: DRAFT cannot jump straight to CURRENT', () => {
    const r = canTransition('DRAFT', 'CURRENT');
    expect(r.allowed).toBe(false);
    expect(r.reason).toBe('ILLEGAL_TRANSITION:DRAFT->CURRENT');
  });

  it('CURRENT requires passing through VERIFIED, from every earlier state', () => {
    for (const from of ['DISCOVERED', 'FETCHED', 'VALIDATING', 'UNAVAILABLE', 'INVALID'] as SyllabusStatus[]) {
      expect(canTransition(from, 'CURRENT').allowed).toBe(false);
    }
    expect(canTransition('VERIFIED', 'CURRENT').allowed).toBe(true);
  });

  it('SUPERSEDED is terminal — a returning syllabus is a NEW version', () => {
    // Reactivating would silently change what evidence attached to that version means.
    expect(ALLOWED_TRANSITIONS.SUPERSEDED).toEqual([]);
    expect(canTransition('SUPERSEDED', 'CURRENT').allowed).toBe(false);
    expect(canTransition('SUPERSEDED', 'VERIFIED').allowed).toBe(false);
  });

  it('a same-status move is a no-op and allowed', () => {
    expect(canTransition('CURRENT', 'CURRENT')).toEqual({ allowed: true });
  });

  it('UNAVAILABLE is recoverable by re-fetching; INVALID by re-extracting', () => {
    expect(canTransition('UNAVAILABLE', 'FETCHED').allowed).toBe(true);
    expect(canTransition('INVALID', 'VALIDATING').allowed).toBe(true);
    // But neither shortcuts to authoritative.
    expect(canTransition('UNAVAILABLE', 'VERIFIED').allowed).toBe(false);
    expect(canTransition('INVALID', 'CURRENT').allowed).toBe(false);
  });

  it('a VERIFIED version can return to VALIDATING when its source changes upstream', () => {
    expect(canTransition('VERIFIED', 'VALIDATING').allowed).toBe(true);
  });

  it('an unknown source status is rejected rather than defaulting to permitted', () => {
    expect(canTransition('NONSENSE' as SyllabusStatus, 'CURRENT').allowed).toBe(false);
  });

  it('separates unreachable-source from failed-extraction', () => {
    expect(failureStatusFor('SOURCE_UNREACHABLE')).toBe('UNAVAILABLE');
    expect(failureStatusFor('EXTRACTION_FAILED')).toBe('INVALID');
    expect(failureStatusFor('VALIDATION_FAILED')).toBe('INVALID');
  });
});

describe('provenance validation', () => {
  it('accepts a fully-evidenced record', () => {
    expect(validateProvenance(verified(), { requireDocument: true })).toEqual({ valid: true, errors: [] });
  });

  it('THE REGRESSION: rejects the SHA-256 of an empty document', () => {
    // The exact value shipped in the seeds as the provenance of a CURRENT syllabus.
    const r = validateProvenance(verified({ sourceDocumentHash: EMPTY_SHA256 }), { requireDocument: true });
    expect(r.valid).toBe(false);
    expect(r.errors[0].code).toBe('EMPTY_DOCUMENT_HASH');
  });

  it('rejects a missing hash', () => {
    const r = validateProvenance(verified({ sourceDocumentHash: '' }), { requireDocument: true });
    expect(r.errors.some((e) => e.field === 'sourceDocumentHash' && e.code === 'MISSING')).toBe(true);
  });

  it('rejects a hand-fabricated hash that is not a SHA-256 digest', () => {
    const r = validateProvenance(verified({ sourceDocumentHash: 'not-a-real-hash' }), { requireDocument: true });
    expect(r.errors.some((e) => e.code === 'MALFORMED')).toBe(true);
  });

  it('rejects a missing authority — an unattributed syllabus has no provenance', () => {
    const r = validateProvenance(verified({ authority: '' }), { requireDocument: true });
    expect(r.errors.some((e) => e.field === 'authority')).toBe(true);
  });

  it('rejects a missing or unusable source URL', () => {
    expect(validateProvenance(verified({ sourceDocumentUrl: '' }), { requireDocument: true })
      .errors.some((e) => e.field === 'sourceDocumentUrl')).toBe(true);
    expect(validateProvenance(verified({ sourceDocumentUrl: 'not a url' }), { requireDocument: true })
      .errors.some((e) => e.code === 'INVALID_URL')).toBe(true);
  });

  it('rejects a retrieved document with no retrieval timestamp', () => {
    const r = validateProvenance(verified({ retrievedAt: undefined }), { requireDocument: true });
    expect(r.errors.some((e) => e.field === 'retrievedAt')).toBe(true);
  });

  it('does not demand a document before one has been fetched', () => {
    // A DISCOVERED record legitimately knows a URL and nothing else.
    const discovered = { examId: 'ZZ', cycleId: '2026', syllabusId: 's', authority: 'ZZ',
                         sourceDocumentUrl: 'https://zz.gov.invalid/s.pdf' };
    expect(validateProvenance(discovered, { requireDocument: false }).valid).toBe(true);
  });

  it('requires an archived copy when storage is required', () => {
    const r = validateProvenance(verified(), { requireDocument: true, requireStorage: true });
    expect(r.errors.some((e) => e.field === 'storagePath')).toBe(true);
  });

  it('rejects timestamps that describe an impossible history', () => {
    // Assembled rather than observed — extraction cannot precede retrieval.
    const r = validateProvenance(verified({ retrievedAt: T + 100, extractedAt: T }), { requireDocument: true });
    expect(r.errors.some((e) => e.code === 'TIMESTAMP_OUT_OF_ORDER')).toBe(true);
  });

  it('rejects incomplete version identity', () => {
    const r = validateProvenance(verified({ examId: '', cycleId: '', syllabusId: '' }), { requireDocument: true });
    for (const f of ['examId', 'cycleId', 'syllabusId']) {
      expect(r.errors.some((e) => e.field === f)).toBe(true);
    }
  });
});

describe('publication gate', () => {
  it('publishes a verified, evidenced version with a validated graph', () => {
    expect(assertPublishable(verified(), okGraph)).toEqual({ publishable: true, errors: [] });
  });

  it('THE REGRESSION: refuses to publish a DRAFT', () => {
    const r = assertPublishable(verified({ status: 'DRAFT' }), okGraph);
    expect(r.publishable).toBe(false);
    expect(r.errors.some((e) => e.code === 'NOT_VERIFIED')).toBe(true);
  });

  it('refuses to publish an INVALID or UNAVAILABLE version', () => {
    for (const s of ['INVALID', 'UNAVAILABLE', 'VALIDATING', 'FETCHED'] as SyllabusStatus[]) {
      expect(assertPublishable(verified({ status: s }), okGraph).publishable).toBe(false);
    }
  });

  it('refuses to publish without a validated canonical graph', () => {
    const r = assertPublishable(verified(), { graphValidated: false, nodeCount: 12 });
    expect(r.errors.some((e) => e.code === 'GRAPH_NOT_VALIDATED')).toBe(true);
  });

  it('refuses to publish an empty graph — that is a failed extraction, not a small syllabus', () => {
    const r = assertPublishable(verified(), { graphValidated: true, nodeCount: 0 });
    expect(r.errors.some((e) => e.code === 'EMPTY_GRAPH')).toBe(true);
  });

  it('refuses to publish with no recorded extraction', () => {
    const r = assertPublishable(verified({ extractedAt: undefined }), okGraph);
    expect(r.errors.some((e) => e.field === 'extractedAt')).toBe(true);
  });

  it('THE PRODUCTION CASE: verified status cannot rescue empty-document provenance', () => {
    // Status alone must never be sufficient — this is precisely the shape that shipped.
    const r = assertPublishable(verified({ sourceDocumentHash: EMPTY_SHA256 }), okGraph);
    expect(r.publishable).toBe(false);
    expect(r.errors.some((e) => e.code === 'EMPTY_DOCUMENT_HASH')).toBe(true);
  });

  it('reports every unmet precondition at once', () => {
    const r = assertPublishable(
      { status: 'DRAFT', examId: 'ZZ' } as Partial<ExamSyllabus>,
      { graphValidated: false, nodeCount: 0 },
    );
    expect(r.errors.length).toBeGreaterThanOrEqual(5);
  });
});
