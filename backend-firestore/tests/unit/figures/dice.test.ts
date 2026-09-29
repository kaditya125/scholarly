import { consistentDice, determinedOpposite, generateDiceQuestion, View } from '../../../src/services/books/figures/dice';

describe('dice solver', () => {
  it('a single view fits 6 distinct dice (hidden faces in 3! ways), each in all 24 orientations', () => {
    // Labelings are over physical faces, so every distinct die appears once per orientation.
    // Fixing top/front/right leaves the three hidden labels in 3! arrangements: 6 dice × 24.
    expect(consistentDice([[1, 2, 3]])).toHaveLength(6 * 24);
  });

  it('knows when two views do NOT determine an opposite face', () => {
    // 1 is seen next to 2, 3, 4 and 5, so only 6 can be opposite it; from one view it could be 4, 5 or 6.
    const views: View[] = [[1, 2, 3], [1, 4, 5]];
    expect(determinedOpposite(views, 1)).toBe(6);        // 1 is adjacent to 2,3,4,5 → opposite is 6
    expect(determinedOpposite([[1, 2, 3]], 1)).toBeNull(); // one view can't fix 1's opposite
  });
});

describe('CUBES_AND_DICE generator', () => {
  const seeds = Array.from({ length: 200 }, (_, i) => 3000 + i * 6007);

  it('every question has a unique answer forced by the two views, and it is among the options', () => {
    for (const seed of seeds) {
      const q = generateDiceQuestion(seed);
      const forced = determinedOpposite(q.views, q.asked);
      expect(forced).not.toBeNull();
      expect(q.options[q.answerIndex]).toBe(forced);
      expect(new Set(q.options).size).toBe(4);
      expect(q.options).not.toContain(q.asked);
    }
  });

  it('shows two different positions and is deterministic', () => {
    for (const seed of seeds.slice(0, 50)) {
      const q = generateDiceQuestion(seed);
      expect(q.views[0].join()).not.toBe(q.views[1].join());
    }
    expect(JSON.stringify(generateDiceQuestion(99))).toBe(JSON.stringify(generateDiceQuestion(99)));
  });

  it('spreads the answer across positions', () => {
    const counts = [0, 0, 0, 0];
    for (const seed of seeds) counts[generateDiceQuestion(seed).answerIndex]++;
    for (const c of counts) expect(c).toBeGreaterThan(25);
  });
});
