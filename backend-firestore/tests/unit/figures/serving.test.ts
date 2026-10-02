import { figureArchetypesForTopic, figureCandidates, FIGURE_ARCHETYPES } from '../../../src/services/books/figures';

describe('figureArchetypesForTopic', () => {
  it.each([
    ['Mirror Images', ['MIRROR_IMAGE']],
    ['Water Images', ['WATER_IMAGE']],
    ['Paper Folding', ['PAPER_CUTTING']],
    ['Paper Cutting', ['PAPER_CUTTING']],
    ['Cubes and Dice', ['CUBES_AND_DICE']],
    ['Counting of Figures', ['FIGURE_COUNTING']],
    ['Figure Series', ['FIGURE_SERIES']],
    ['Non-Verbal Series', ['FIGURE_SERIES']],
  ])('%s → %j', (topic, want) => {
    expect(figureArchetypesForTopic(topic)).toEqual(want);
  });

  it('a generic non-verbal topic mixes every archetype', () => {
    expect(figureArchetypesForTopic('Non-Verbal Reasoning')).toEqual(FIGURE_ARCHETYPES);
  });

  it.each([
    'Square Roots And Cube Roots',   // Quant — "cube" must not mean dice
    'Analytical Reasoning',          // a verbal-puzzle topic in SSC usage
    'Number Series', 'Letter Series', 'Series Completion', 'Coding-Decoding', 'Blood Relations',
    'Volume And Surface Areas', 'Algebra', '',
  ])('%s is not a figure topic', (topic) => {
    expect(figureArchetypesForTopic(topic)).toBeNull();
  });
});

describe('figureCandidates', () => {
  it('builds valid mixer candidates with provenance and the computed answer', () => {
    let s = 100;
    const cands = figureCandidates(FIGURE_ARCHETYPES, 12, 'SSC_CGL', 'Reasoning', 'Non-Verbal Reasoning', () => s++);
    expect(cands).toHaveLength(12);
    expect(new Set(cands.map((c) => c.figure.archetype)).size).toBe(FIGURE_ARCHETYPES.length);
    for (const c of cands) {
      expect(c.sourceType).toBe('REFERENCE_BOOK');
      expect(c.referenceBookId).toBe('schand_reasoning');
      expect(c.referenceChunkId).toBe(`figure:${c.figure.archetype}:${c.figure.seed}`);
      expect(c.figure.answerSource).toBe('computed');
      expect(c.options).toHaveLength(4);
      expect(c.correctAnswerIndex).toBeGreaterThanOrEqual(0);
      expect(c.correctAnswerIndex).toBeLessThan(4);
      // Figure options carry their pictures; numeric ones (dice, counting) are plain text options.
      if (c.figure.optionSvgs) expect(c.figure.optionSvgs).toHaveLength(4);
      else expect(c.options.every((o) => /^\d+$/.test(o))).toBe(true);
    }
  });
});
