/**
 * Topic → syllabus-node matching for PYQ ingestion.
 *
 * ── WHAT THIS REPLACED ────────────────────────────────────────────────────────────────────
 * A three-branch substring test that anchored 80 of 415 SSC CGL questions (19%) onto 12 of
 * 149 nodes. These tests pin the three things that were wrong with it, and — just as
 * important — the matches it must keep REFUSING.
 *
 * The refusals matter more than the hits here. A permissive matcher scored 213/415 in
 * measurement, but bought the extra 103 by collapsing twenty distinct English topics onto one
 * syllabus paragraph and by putting a reasoning topic under English. Mastery keys on the node
 * when present and on the topic label otherwise, so a wrong or over-broad node is strictly
 * worse than none: it silently merges records that should stay separate.
 */

import { matchTopicToNode } from '../../src/services/pyq/pyqTaxonomyNormalizer.service';

/** Real SSC CGL node labels, taken verbatim from production. */
const NODES = [
  { id: 'n_coding', label: 'Coding & de-coding' },
  { id: 'n_history', label: 'History' },
  { id: 'n_culture', label: 'Culture' },
  { id: 'n_geometry', label: 'Geometry' },
  { id: 'n_semclass', label: 'Semantic Classification' },
  { id: 'n_wordbuild', label: 'Word Building' },
  { id: 'n_infer', label: 'Drawing inferences' },
  { id: 'n_arith', label: 'Fundamental arithmetical operations' },
  { id: 'n_dest', label: 'DEST' },
  { id: 'n_cag', label: 'Comptroller & Auditor General of India- Constitutional provisions' },
  // The 700-character English paragraph that swallowed everything.
  {
    id: 'n_english_para',
    label: 'Vocabulary, grammar, sentence structure, synonyms, antonyms and their correct usage; '
      + 'Spot the Error, Fill in the Blanks, Synonyms/ Homonyms, Antonyms, Spellings/ Detecting '
      + 'mis-spelt words, Idioms & Phrases, One word substitution, Improvement of Sentences, '
      + 'Active/ Passive Voice of Verbs, Conversion into Direct/ Indirect narration, Shuffling of '
      + 'Sentence parts, Shuffling of Sentences in a passage, Cloze Passage, Comprehension Passage.',
  },
];

const nodeFor = (topic: string) => matchTopicToNode(topic, NODES)?.node.id ?? null;

describe('punctuation differences must not defeat a match', () => {
  it('THE REGRESSION: "Coding & Decoding" matches the node "Coding & de-coding"', () => {
    // The old matcher failed here: neither string contains the other, because of the hyphen.
    expect(nodeFor('Coding & Decoding')).toBe('n_coding');
  });

  it('treats "and" and "&" as the same word', () => {
    expect(nodeFor('Coding and Decoding')).toBe('n_coding');
  });

  it('matches regardless of case and stray punctuation', () => {
    expect(nodeFor('  geometry.  ')).toBe('n_geometry');
  });
});

describe('aliases bridge topics the syllabus never names', () => {
  it.each([
    ['Number Coding', 'n_coding'],
    ['Direct Letter Substitution', 'n_coding'],
    ['Coded Blood Relations', 'n_coding'],
    ['Odd One Out', 'n_semclass'],
    ['Dictionary Order', 'n_wordbuild'],
    ['Deductive Logic', 'n_infer'],
    ['Simplification', 'n_arith'],
    ['Revolt of 1857', 'n_history'],
    ['Classical Dances of India', 'n_culture'],
    ['Distance & Midpoint Formula', 'n_geometry'],
  ])('%s → %s', (topic, expected) => {
    expect(nodeFor(topic)).toBe(expected);
  });
});

describe('a topic containing a node label still matches it', () => {
  it('"Indian History" resolves to History', () => {
    expect(nodeFor('Indian History')).toBe('n_history');
  });
});

describe('THE REFUSALS — over-broad matches are worse than none', () => {
  it('does NOT put English sub-topics under the syllabus paragraph', () => {
    /*
     * The permissive version matched every one of these to n_english_para, collapsing them into
     * a single mastery record. Unanchored keeps them distinguishable via the label fallback.
     */
    for (const topic of [
      'Cloze Test Passage', 'Idioms and Phrases', 'Spelling Correction',
      'Spotting the Error', 'Sentence Improvement', 'Prepositions',
    ]) {
      expect(nodeFor(topic)).not.toBe('n_english_para');
    }
  });

  it('does NOT file a REASONING topic under the English paragraph', () => {
    // Measured cross-subject error in the permissive version.
    expect(nodeFor('Direct Letter Substitution')).not.toBe('n_english_para');
  });

  it('does NOT match "Attorney General of India" to the Comptroller & Auditor General', () => {
    // Different constitutional office; they share only the trailing tokens. This is the case
    // that set the token-coverage floor at 0.75.
    expect(nodeFor('Attorney General of India')).not.toBe('n_cag');
  });

  it('a SHORT node label cannot swallow an unrelated topic', () => {
    /*
     * The old `topic.includes(label)` branch is why this mattered: any topic whose text happened
     * to contain a tiny label matched it. Single-word labels must now earn the match.
     */
    expect(nodeFor('Data Entry Speed Test Practice')).not.toBe('n_dest');
  });

  it('returns null rather than guessing when nothing fits', () => {
    expect(matchTopicToNode('Quantum Chromodynamics', NODES)).toBeNull();
    expect(matchTopicToNode('', NODES)).toBeNull();
    expect(matchTopicToNode('the of and', NODES)).toBeNull();
  });
});

describe('an exact paragraph title still matches its own node', () => {
  it('the specificity gate does not block exact equality', () => {
    // The gate only applies to NON-exact matches; a question already carrying the paragraph
    // label as its topic must still resolve, or re-ingestion would silently unanchor it.
    const exact = NODES.find((n) => n.id === 'n_english_para')!.label;
    expect(nodeFor(exact)).toBe('n_english_para');
  });
});

describe('scoring is ordered, so the most specific node wins', () => {
  it('prefers the atomic node over a paragraph mentioning the same words', () => {
    const withBoth = [...NODES, { id: 'n_para2', label: 'A long syllabus paragraph covering History, Culture, Geography, Economics, Polity, General Science and Current Affairs of India and the world at large.' }];
    expect(matchTopicToNode('History', withBoth)?.node.id).toBe('n_history');
  });

  it('reports a score so a caller can threshold further if it needs to', () => {
    const hit = matchTopicToNode('Coding & Decoding', NODES);
    expect(hit!.score).toBeGreaterThanOrEqual(50);
    expect(hit!.score).toBeLessThanOrEqual(100);
  });
});
