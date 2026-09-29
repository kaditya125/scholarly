import { Pt, signature } from '../../../src/services/books/figures/figureModel';
import { generatePunchQuestion, Fold, Hole } from '../../../src/services/books/figures/punchedHoles';

// Independent of the generator: every hole appears at all 2^k images obtained by reflecting it
// across any subset of the folds.
function expectedHoles(folds: Fold[], punched: Hole[]): string[] {
  const refl = (f: Fold, [x, y]: Pt): Pt => (f === 'V' ? [100 - x, y] : f === 'H' ? [x, 100 - y] : [y, x]);
  const out = new Set<string>();
  for (const h of punched) {
    for (let mask = 0; mask < 1 << folds.length; mask++) {
      let p = h.c;
      // Unfolding undoes the LAST fold first, so the chosen reflections apply last-to-first.
      // (Order matters: a vertical and a diagonal reflection do not commute.)
      for (let i = folds.length - 1; i >= 0; i--) if (mask & (1 << i)) p = refl(folds[i], p);
      out.add(`${h.shape}@${Math.round(p[0])},${Math.round(p[1])}`);
    }
  }
  return [...out].sort();
}

function holesOf(fig: ReturnType<typeof generatePunchQuestion>['options'][number]): string[] {
  return fig.map((p) => (p.kind === 'circle'
    ? `circle@${Math.round(p.c[0])},${Math.round(p.c[1])}`
    : p.kind === 'poly' ? `square@${Math.round((p.pts[0][0] + p.pts[2][0]) / 2)},${Math.round((p.pts[0][1] + p.pts[2][1]) / 2)}` : '?')).sort();
}

const seeds = Array.from({ length: 300 }, (_, i) => 9000 + i * 7727);

describe('PAPER_CUTTING (punched holes) generator', () => {
  it('the answer is exactly the set of reflected images of the punched holes', () => {
    for (const seed of seeds) {
      const q = generatePunchQuestion(seed);
      expect(holesOf(q.options[q.answerIndex])).toEqual(expectedHoles(q.folds, q.punched));
    }
  });

  it('has four distinct options with exactly one correct', () => {
    for (const seed of seeds) {
      const q = generatePunchQuestion(seed);
      expect(new Set(q.options.map(signature)).size).toBe(4);
      expect(q.optionKinds.filter((k) => k === 'correct')).toHaveLength(1);
      expect(q.optionKinds[q.answerIndex]).toBe('correct');
    }
  });

  it('shows one step per fold plus the punched sheet', () => {
    for (const seed of seeds.slice(0, 50)) {
      const q = generatePunchQuestion(seed);
      expect(q.stepSvgs).toHaveLength(q.folds.length + 1);
      expect(q.folds.length).toBeGreaterThanOrEqual(1);
    }
  });

  it('is deterministic and spreads the answer', () => {
    expect(JSON.stringify(generatePunchQuestion(31337))).toBe(JSON.stringify(generatePunchQuestion(31337)));
    const counts = [0, 0, 0, 0];
    for (const seed of seeds) counts[generatePunchQuestion(seed).answerIndex]++;
    for (const c of counts) expect(c).toBeGreaterThan(40);
  });
});
