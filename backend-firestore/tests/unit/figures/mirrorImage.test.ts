import { Figure, signature, transform } from '../../../src/services/books/figures/figureModel';
import { generateReflectionQuestion, ReflectionArchetype } from '../../../src/services/books/figures/mirrorImage';

const SAMPLE: Figure = [
  { kind: 'arrow', a: [20, 30], b: [35, 18] },
  { kind: 'poly', closed: false, pts: [[60, 60], [60, 80], [78, 80]] },
  { kind: 'glyph', c: [72, 25], ch: 'F', m: [1, 0, 0, 1] },
  { kind: 'poly', closed: true, pts: [[15, 75], [35, 75], [15, 58]] },
];

describe('figure transforms are exact', () => {
  const sig = (f: Figure) => signature(f);
  it('reflections are involutions', () => {
    expect(sig(transform(transform(SAMPLE, 'mirrorV'), 'mirrorV'))).toBe(sig(SAMPLE));
    expect(sig(transform(transform(SAMPLE, 'mirrorH'), 'mirrorH'))).toBe(sig(SAMPLE));
  });
  it('four quarter turns are the identity; two are a half turn', () => {
    let f = SAMPLE;
    for (let i = 0; i < 4; i++) f = transform(f, 'rot90');
    expect(sig(f)).toBe(sig(SAMPLE));
    expect(sig(transform(transform(SAMPLE, 'rot90'), 'rot90'))).toBe(sig(transform(SAMPLE, 'rot180')));
  });
  it('mirror then water is a half turn (glyph orientation included)', () => {
    expect(sig(transform(transform(SAMPLE, 'mirrorV'), 'mirrorH'))).toBe(sig(transform(SAMPLE, 'rot180')));
  });
  it('a mirrored glyph is not the same glyph', () => {
    const g: Figure = [{ kind: 'glyph', c: [50, 50], ch: 'F', m: [1, 0, 0, 1] }];
    expect(sig(transform(g, 'mirrorV'))).not.toBe(sig(g));
  });
  it('a closed polygon is the same shape from any start vertex', () => {
    const tri: Figure = [{ kind: 'poly', closed: true, pts: [[0, 0], [10, 0], [0, 10]] }];
    const rotated: Figure = [{ kind: 'poly', closed: true, pts: [[10, 0], [0, 10], [0, 0]] }];
    expect(sig(tri)).toBe(sig(rotated));
  });
});

describe.each<[ReflectionArchetype, 'mirrorV' | 'mirrorH']>([
  ['MIRROR_IMAGE', 'mirrorV'],
  ['WATER_IMAGE', 'mirrorH'],
])('%s generator', (archetype, correct) => {
  const seeds = Array.from({ length: 300 }, (_, i) => 1000 + i * 7919);

  it('the stored answer is the computed reflection, and it is the only option that is', () => {
    for (const seed of seeds) {
      const q = generateReflectionQuestion(archetype, seed);
      const truth = signature(transform(q.question, correct));
      const matching = q.options.map((o, i) => (signature(o) === truth ? i : -1)).filter((i) => i >= 0);
      expect(matching).toEqual([q.answerIndex]);
      expect(q.optionTransforms[q.answerIndex]).toBe(correct);
    }
  });

  it('has four visually distinct options and never shows the figure as its own reflection', () => {
    for (const seed of seeds) {
      const q = generateReflectionQuestion(archetype, seed);
      expect(q.options).toHaveLength(4);
      expect(new Set(q.options.map(signature)).size).toBe(4);
      expect(signature(q.question)).not.toBe(signature(q.options[q.answerIndex]));
    }
  });

  it('is deterministic for a seed', () => {
    const a = generateReflectionQuestion(archetype, 424242);
    const b = generateReflectionQuestion(archetype, 424242);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it('spreads the answer across positions', () => {
    const counts = [0, 0, 0, 0];
    for (const seed of seeds) counts[generateReflectionQuestion(archetype, seed).answerIndex]++;
    for (const c of counts) expect(c).toBeGreaterThan(40); // ~75 each expected over 300
  });
});
