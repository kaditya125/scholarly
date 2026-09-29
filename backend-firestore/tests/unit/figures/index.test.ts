import { FIGURE_ARCHETYPES, generateFigureQuestion } from '../../../src/services/books/figures';

describe.each(FIGURE_ARCHETYPES)('generateFigureQuestion(%s)', (archetype) => {
  const seeds = Array.from({ length: 40 }, (_, i) => 20000 + i * 911);

  it('returns a well-formed question with exactly one option set and a valid answer index', () => {
    for (const seed of seeds) {
      const q = generateFigureQuestion(archetype, seed);
      expect(q.archetype).toBe(archetype);
      expect(q.answerSource).toBe('computed');
      expect(q.prompt.length).toBeGreaterThan(20);
      expect(q.questionSvgs.length).toBeGreaterThan(0);
      q.questionSvgs.forEach((s) => expect(s.startsWith('<svg')).toBe(true));
      const opts = q.optionSvgs ?? q.optionTexts!;
      expect(Boolean(q.optionSvgs) !== Boolean(q.optionTexts)).toBe(true);
      expect(opts).toHaveLength(4);
      expect(new Set(opts).size).toBe(4);
      expect(q.answerIndex).toBeGreaterThanOrEqual(0);
      expect(q.answerIndex).toBeLessThan(4);
      expect(q.explanation.length).toBeGreaterThan(20);
    }
  });

  it('renders no scripts or external references in its SVG', () => {
    const q = generateFigureQuestion(archetype, 12345);
    for (const s of [...q.questionSvgs, ...(q.optionSvgs ?? [])]) {
      expect(s).not.toMatch(/<script|href=|onload=|javascript:/i);
    }
  });
});
