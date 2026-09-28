import {
  difficultyScore, difficultyLabel, questionFingerprint, normaliseTaxonomy, normaliseClassification, phraseInNode, ChapterTaxonomy,
} from '../../src/services/books/bookClassification.utils';

const profile = { conceptualComplexity: 0.6, calculationComplexity: 0.5, reasoningDepth: 0.7, linguisticComplexity: 0.3, distractorDifficulty: 0.6, ambiguityRisk: 0.1 };

describe('difficulty', () => {
  it('weights the five dimensions and ignores ambiguity risk', () => {
    expect(difficultyScore(profile)).toBe(0.58); // .15+.10+.175+.03+.12
    expect(difficultyScore({ ...profile, ambiguityRisk: 0.9 })).toBe(0.58);
  });
  it('labels by threshold', () => {
    expect([0.2, 0.34, 0.35, 0.59, 0.6, 0.79, 0.8].map(difficultyLabel)).toEqual(['EASY', 'EASY', 'MEDIUM', 'MEDIUM', 'HARD', 'HARD', 'VERY_HARD']);
  });
});

describe('questionFingerprint', () => {
  const base = { bookId: 'b', chapterName: 'Percentage', archetype: 'SUCCESSIVE_CHANGE', solutionStrategy: ['Convert to multipliers', 'Multiply'], difficulty: 'MEDIUM' as const, answerType: 'NUMERIC', optionCount: 4 };
  it('is deterministic and insensitive to punctuation/case in the strategy', () => {
    expect(questionFingerprint(base)).toBe(questionFingerprint({ ...base, solutionStrategy: ['convert to MULTIPLIERS.', 'multiply'] }));
  });
  it('separates different archetypes and difficulties', () => {
    expect(questionFingerprint(base)).not.toBe(questionFingerprint({ ...base, archetype: 'BASIC_CONVERSION' }));
    expect(questionFingerprint(base)).not.toBe(questionFingerprint({ ...base, difficulty: 'HARD' }));
  });
});

const raw = {
  subtopics: [{ id: 'successive change', name: 'Successive change' }, { id: 'BASICS', name: 'Basics' }],
  archetypes: [
    { id: 'successive-percentage-change', name: 'Successive % change', subtopicId: 'SUCCESSIVE_CHANGE', solutionStrategy: ['multipliers'], answerType: 'NUMERIC' },
    { id: 'FRACTION_TO_PERCENT', name: 'Fraction to %', subtopicId: 'BASICS', answerType: 'NUMERIC' },
    { id: 'ORPHAN', name: 'No subtopic', subtopicId: 'MISSING' },
  ],
};

describe('normaliseTaxonomy', () => {
  it('normalises ids, drops archetypes with unknown subtopics, adds an OTHER catch-all', () => {
    const t = normaliseTaxonomy(raw) as ChapterTaxonomy;
    expect(t.subtopics.map((s) => s.id)).toEqual(['SUCCESSIVE_CHANGE', 'BASICS']);
    expect(t.archetypes.map((a) => a.id)).toEqual(['SUCCESSIVE_PERCENTAGE_CHANGE', 'FRACTION_TO_PERCENT', 'OTHER']);
  });
  it('rejects a taxonomy with no usable archetype, but accepts a single-format chapter', () => {
    expect(normaliseTaxonomy({ subtopics: [{ id: 'A', name: 'A' }], archetypes: [] })).toHaveProperty('error');
    expect(normaliseTaxonomy({ subtopics: [{ id: 'A', name: 'A' }], archetypes: [{ id: 'X', subtopicId: 'MISSING' }] })).toHaveProperty('error');
    const one = normaliseTaxonomy({ subtopics: [{ id: 'A', name: 'A' }], archetypes: [{ id: 'ASSERTION_REASON', subtopicId: 'A' }] }) as ChapterTaxonomy;
    expect(one.archetypes.map((a) => a.id)).toEqual(['ASSERTION_REASON', 'OTHER']);
  });
});

describe('normaliseClassification', () => {
  const taxonomy = normaliseTaxonomy(raw) as ChapterTaxonomy;
  const ctx = { bookId: 'b', chapterName: 'Percentage', optionCount: 4, taxonomy };
  it('accepts a known archetype and derives score, label, subtopic and fingerprint', () => {
    const c = normaliseClassification({ archetype: 'successive percentage change', concepts: ['successive change'], difficultyProfile: profile }, ctx) as any;
    expect(c.archetype).toBe('SUCCESSIVE_PERCENTAGE_CHANGE');
    expect(c.subtopicId).toBe('SUCCESSIVE_CHANGE');
    expect(c.estimatedDifficultyScore).toBe(0.58);
    expect(c.difficulty).toBe('MEDIUM');
    expect(c.solutionStrategy).toEqual(['multipliers']); // falls back to the archetype's strategy
    expect(c.fingerprint).toHaveLength(20);
  });
  it('rejects unknown archetypes, missing difficulty dimensions and empty concepts', () => {
    expect(normaliseClassification({ archetype: 'MADE_UP', concepts: ['x'], difficultyProfile: profile }, ctx)).toHaveProperty('error');
    expect(normaliseClassification({ archetype: 'OTHER', concepts: ['x'], difficultyProfile: { ...profile, reasoningDepth: undefined } }, ctx)).toHaveProperty('error');
    expect(normaliseClassification({ archetype: 'OTHER', concepts: [], difficultyProfile: profile }, ctx)).toHaveProperty('error');
  });
  it('clamps out-of-range dimensions into [0,1]', () => {
    const c = normaliseClassification({ archetype: 'OTHER', concepts: ['x'], difficultyProfile: { ...profile, reasoningDepth: 3 } }, ctx) as any;
    expect(c.difficultyProfile.reasoningDepth).toBe(1);
  });
});

describe('phraseInNode', () => {
  const blob = 'The scope of the test will be computation of whole numbers, Percentage. Ratio & Proportion, Square roots, Time & Work';
  it('accepts a phrase the node text really contains (case, &, plurals)', () => {
    expect(phraseInNode('percentages', blob)).toBe(true);
    expect(phraseInNode('Ratio and Proportion', blob)).toBe(true);
    expect(phraseInNode('time and work', blob)).toBe(true);
  });
  it('rejects a phrase the node does not state', () => {
    expect(phraseInNode('Logarithms', blob)).toBe(false);
    expect(phraseInNode('ab', blob)).toBe(false);
  });
});

import { mergeTaxonomy } from '../../src/services/books/bookClassification.utils';
describe('mergeTaxonomy', () => {
  const base = normaliseTaxonomy(raw) as ChapterTaxonomy;
  it('keeps existing archetypes, adds only new ids, keeps OTHER last', () => {
    const m = mergeTaxonomy(base, {
      subtopics: [{ id: 'APPROX', name: 'Approximation' }],
      archetypes: [
        { id: 'APPROXIMATE_PERCENT_EQUATION', subtopicId: 'APPROX', name: 'Approximate % equation', answerType: 'NUMERIC' },
        { id: 'FRACTION_TO_PERCENT', subtopicId: 'BASICS', name: 'duplicate — must not replace' },
      ],
    });
    expect(m.archetypes.map((a) => a.id)).toEqual(['SUCCESSIVE_PERCENTAGE_CHANGE', 'FRACTION_TO_PERCENT', 'APPROXIMATE_PERCENT_EQUATION', 'OTHER']);
    expect(m.archetypes.find((a) => a.id === 'FRACTION_TO_PERCENT')!.name).toBe('Fraction to %');
    expect(m.subtopics.map((s) => s.id)).toContain('APPROX');
  });
  it('returns the base unchanged when the extension is unusable', () => {
    expect(mergeTaxonomy(base, { archetypes: 'nonsense' }).archetypes.map((a) => a.id)).toEqual(base.archetypes.map((a) => a.id));
  });
});
