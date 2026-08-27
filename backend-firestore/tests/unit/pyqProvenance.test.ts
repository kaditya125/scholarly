/**
 * Stage 8 — independent provenance verification.
 *
 * The verdict logic is pure, so every case here runs without a network. The distinction under
 * test throughout is the one the whole stage exists to preserve: "we could not look" is not the
 * same finding as "we looked and it was not there". Collapsing them would either condemn genuine
 * questions or leave fabricated ones in permanent limbo.
 */

import {
  decideVerdict, computeContentHash, classifyTier, type SourceProbe,
} from '../../src/services/pyq/pyqProvenanceVerification.service';

const probe = (over: Partial<SourceProbe> = {}): SourceProbe => ({
  url: 'https://jeemain.nta.ac.in/archive/p.pdf',
  domain: 'jeemain.nta.ac.in',
  httpStatus: 200,
  retrievedAt: 1787000000000,
  tier: 'TIER_A_OFFICIAL',
  ...over,
});

const base = {
  probes: [probe()],
  questionFound: true,
  answerVerified: true,
  independentSearchPerformed: false,
  independentSearchFoundQuestion: false,
  duplicateStatus: 'UNIQUE' as const,
  sourceStructurallyPublic: true,
};

describe('verdicts — evidence, not assumption', () => {
  it('a retrieved source with confirmed question and answer is fully corroborated', () => {
    expect(decideVerdict(base).verdict).toBe('FULLY_CORROBORATED');
  });

  it('a retrieved source with an unconfirmed answer stops at QUESTION_CONFIRMED', () => {
    expect(decideVerdict({ ...base, answerVerified: false }).verdict).toBe('QUESTION_CONFIRMED');
  });

  it('a retrieved source that does not contain the question stops at SOURCE_FOUND', () => {
    expect(decideVerdict({ ...base, questionFound: false, answerVerified: false }).verdict)
      .toBe('SOURCE_FOUND');
  });

  it('a 404 alone is SOURCE_UNAVAILABLE, never NOT_FOUND', () => {
    // The core rule: failing to retrieve says nothing about whether the question is genuine.
    const r = decideVerdict({ ...base, probes: [probe({ httpStatus: 404 })], questionFound: false, answerVerified: false });
    expect(r.verdict).toBe('SOURCE_UNAVAILABLE');
    expect(r.notes.join(' ')).toMatch(/says nothing about whether the question is genuine/);
  });

  it('a 502 is also SOURCE_UNAVAILABLE — a server fault proves even less than a 404', () => {
    expect(decideVerdict({ ...base, probes: [probe({ httpStatus: 502 })], questionFound: false, answerVerified: false }).verdict)
      .toBe('SOURCE_UNAVAILABLE');
  });

  it('only an unretrievable source PLUS a failed independent search yields NOT_FOUND', () => {
    const r = decideVerdict({
      ...base, probes: [probe({ httpStatus: 404 })], questionFound: false, answerVerified: false,
      independentSearchPerformed: true, independentSearchFoundQuestion: false,
    });
    expect(r.verdict).toBe('NOT_FOUND');
  });

  it('a source that cannot exist publicly is distinguished from one that is merely down', () => {
    // NTA publishes papers behind a per-candidate login; an open archive URL describes something
    // that never existed, which is a different fact from a server being unavailable today.
    const r = decideVerdict({
      ...base, questionFound: false, answerVerified: false, sourceStructurallyPublic: false,
    });
    expect(r.verdict).toBe('SOURCE_STRUCTURALLY_UNAVAILABLE');
    expect(r.notes.join(' ')).toMatch(/not published openly/);
  });

  it('an identity conflict outranks everything else', () => {
    const r = decideVerdict({ ...base, duplicateStatus: 'DUPLICATE_IDENTITY_CONFLICT' });
    expect(r.verdict).toBe('DUPLICATE_UNRESOLVED');
    // Never resolved by picking one — two records claim different papers for the same text.
    expect(r.notes.join(' ')).toMatch(/different paper identities/);
  });

  it('a same-paper duplicate is not treated as a conflict', () => {
    expect(decideVerdict({ ...base, duplicateStatus: 'DUPLICATE_SAME_PAPER' }).verdict)
      .toBe('FULLY_CORROBORATED');
  });
});

describe('source tiering', () => {
  it('recognises official domains', () => {
    for (const u of ['https://jeemain.nta.nic.in/x.pdf', 'https://ssc.gov.in/y.pdf', 'https://nta.ac.in/z.pdf']) {
      expect(classifyTier(u)).toBe('TIER_A_OFFICIAL');
    }
  });

  it('does not promote a coaching site to official', () => {
    for (const u of ['https://www.vedantu.com/a', 'https://testbook.com/b', 'https://byjus.com/c']) {
      expect(classifyTier(u)).toBe('TIER_B_REPUTABLE');
    }
  });

  it('a malformed url is UNKNOWN rather than assumed', () => {
    expect(classifyTier('not a url')).toBe('UNKNOWN');
  });
});

describe('content hashing', () => {
  it('is deterministic for identical content', () => {
    const q = { questionText: 'What is 2 + 2?', options: ['3', '4'], correctAnswer: 'B' };
    expect(computeContentHash(q)).toBe(computeContentHash({ ...q }));
  });

  it('ignores whitespace and case, which OCR varies', () => {
    expect(computeContentHash({ questionText: 'What  is\n2 + 2?', options: null, correctAnswer: 'B' }))
      .toBe(computeContentHash({ questionText: 'what is 2 + 2?', options: null, correctAnswer: 'B' }));
  });

  it('changes when the answer changes', () => {
    const a = computeContentHash({ questionText: 'q', options: ['x'], correctAnswer: 'A' });
    const b = computeContentHash({ questionText: 'q', options: ['x'], correctAnswer: 'B' });
    expect(a).not.toBe(b);
  });

  it('produces a real sha256, so a placeholder is visibly different', () => {
    const h = computeContentHash({ questionText: 'q' });
    expect(h).toMatch(/^[0-9a-f]{64}$/);
    expect(h).not.toMatch(/^hash_/);
  });
});

describe('the stage cannot make anything eligible', () => {
  it('no verdict in this module issues a provenance stamp', () => {
    // Stamps are issued only by a proven pipeline (§26). The pilot writes findings, never stamps.
    const verdicts = [
      decideVerdict(base).verdict,
      decideVerdict({ ...base, probes: [probe({ httpStatus: 404 })] }).verdict,
    ];
    expect(verdicts).not.toContain('provenanceStamp');
  });
});
