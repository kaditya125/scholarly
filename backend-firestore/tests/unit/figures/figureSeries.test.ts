import { signature } from '../../../src/services/books/figures/figureModel';
import { generateFigureSeriesQuestion, _internal } from '../../../src/services/books/figures/figureSeries';

const seeds = Array.from({ length: 300 }, (_, i) => 5000 + i * 104729);

describe('FIGURE_SERIES generator', () => {
  it('shows five distinct problem figures and four distinct options', () => {
    for (const seed of seeds) {
      const q = generateFigureSeriesQuestion(seed);
      expect(q.problem).toHaveLength(5);
      expect(new Set(q.problem.map(signature)).size).toBe(5);
      expect(q.options).toHaveLength(4);
      expect(new Set(q.options.map(signature)).size).toBe(4);
    }
  });

  it('has exactly one correct option, and it is not a problem figure repeated', () => {
    for (const seed of seeds) {
      const q = generateFigureSeriesQuestion(seed);
      expect(q.optionKinds.filter((k) => k === 'correct')).toHaveLength(1);
      expect(q.optionKinds[q.answerIndex]).toBe('correct');
      const shown = new Set(q.problem.map(signature));
      expect(shown.has(signature(q.options[q.answerIndex]))).toBe(false);
    }
  });

  it('the answer is the rule applied once more — recomputed independently from the element rules', () => {
    for (const seed of seeds) {
      const q = generateFigureSeriesQuestion(seed);
      for (let s = 0; s < 5; s++) expect(signature(_internal.figureAt(q.elements, s))).toBe(signature(q.problem[s]));
      expect(signature(_internal.figureAt(q.elements, 5))).toBe(signature(q.options[q.answerIndex]));
    }
  });

  it('is deterministic for a seed and spreads the answer across positions', () => {
    expect(JSON.stringify(generateFigureSeriesQuestion(77))).toBe(JSON.stringify(generateFigureSeriesQuestion(77)));
    const counts = [0, 0, 0, 0];
    for (const seed of seeds) counts[generateFigureSeriesQuestion(seed).answerIndex]++;
    for (const c of counts) expect(c).toBeGreaterThan(40);
  });
});
