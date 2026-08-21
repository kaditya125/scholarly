/**
 * J.3 — quarantine semantics and the provenance-hash rule.
 *
 * Context from the production audit: syl_ssc_cgl_2026_v1 sits at CURRENT with sourceDocumentHash =
 * SHA-256(""), no storagePath, no retrievedAt, and no canonical graph. Its provenance cannot be
 * established, so it cannot be relied upon — but the record itself is history and must survive
 * intact.
 */
import { canTransition, validateProvenance, EMPTY_SHA256 } from '../../src/services/exam/syllabusLifecycle';
import type { SyllabusStatus } from '../../src/types/exam.types';

describe('quarantine is reachable and honest', () => {
  it('CURRENT may be invalidated without deleting anything', () => {
    expect(canTransition('CURRENT', 'INVALID').allowed).toBe(true);
  });

  it('every pre-authoritative state can also be invalidated', () => {
    for (const s of ['DRAFT', 'DISCOVERED', 'FETCHED', 'VALIDATING', 'VERIFIED'] as SyllabusStatus[]) {
      expect(canTransition(s, 'INVALID').allowed).toBe(true);
    }
  });

  it('an INVALID version cannot be published without re-establishing provenance', () => {
    // Recovery runs back through FETCHED/VALIDATING — there is no shortcut to authoritative.
    expect(canTransition('INVALID', 'CURRENT').allowed).toBe(false);
    expect(canTransition('INVALID', 'VERIFIED').allowed).toBe(false);
    expect(canTransition('INVALID', 'FETCHED').allowed).toBe(true);
  });

  it('UNAVAILABLE is NOT the right state for an unverifiable legacy record', () => {
    // UNAVAILABLE asserts a retrieval was attempted and failed. The production record has no
    // retrievedAt at all — nothing was ever attempted — so claiming it would itself be a
    // fabricated statement about what the system did.
    const legacy = {
      examId: 'SSC_CGL', cycleId: '2026', syllabusId: 'syl_ssc_cgl_2026_v1',
      authority: 'Staff Selection Commission',
      sourceDocumentUrl: 'https://ssc.gov.in/files/portal/latest/CGL_2026_Notice.pdf',
      sourceDocumentHash: EMPTY_SHA256,
      extractedAt: 1704067200000,
    };
    const r = validateProvenance(legacy, { requireDocument: true });
    expect(r.valid).toBe(false);
    expect(r.errors.some((e) => e.code === 'EMPTY_DOCUMENT_HASH')).toBe(true);
    expect(r.errors.some((e) => e.field === 'retrievedAt')).toBe(true);
  });
});

/**
 * The hash must describe the SOURCE, never our own extraction output.
 *
 * examMaster.createSyllabusVersion used to synthesise sha256(JSON.stringify(stages) + url) when no
 * hash was supplied — a syntactically perfect digest that proves nothing about any document, and
 * one that passes every format check. More dangerous than the empty-string hash, because nothing
 * about it looks wrong.
 */
describe('a self-derived hash must never satisfy provenance', () => {
  const base = {
    examId: 'ZZ', cycleId: '2026', syllabusId: 'syl_zz_v1', authority: 'ZZ',
    sourceDocumentUrl: 'https://zz.gov.invalid/s.pdf', retrievedAt: 1, extractedAt: 2,
  };

  it('an absent hash blocks publication rather than being manufactured', () => {
    const r = validateProvenance({ ...base, sourceDocumentHash: '' }, { requireDocument: true });
    expect(r.valid).toBe(false);
    expect(r.errors.some((e) => e.field === 'sourceDocumentHash' && e.code === 'MISSING')).toBe(true);
  });

  it('the source builder no longer contains the self-hash fallback', () => {
    // Asserted against source: the defect was a fallback expression, and its absence is the fix.
    const fs = require('fs');
    const path = require('path');
    const src = fs.readFileSync(
      path.join(__dirname, '../../src/services/exam/examMaster.service.ts'), 'utf8',
    ).replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    expect(src).not.toMatch(/createHash\('sha256'\)\.update\(JSON\.stringify\(dto\.stages\)/);
  });

  it('a real document digest is accepted', () => {
    expect(validateProvenance({ ...base, sourceDocumentHash: 'd'.repeat(64) },
      { requireDocument: true }).valid).toBe(true);
  });
});
