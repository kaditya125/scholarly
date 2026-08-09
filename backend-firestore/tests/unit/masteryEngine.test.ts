import { MasteryEngine, MasteryStore, ConceptMastery, slugifyConcept } from '../../src/core/intelligence/MasteryEngine';

class FakeStore implements MasteryStore {
  data = new Map<string, ConceptMastery>();
  async get(_u: string, id: string) { return this.data.get(id) || null; }
  async set(_u: string, m: ConceptMastery) { this.data.set(m.conceptId, m); }
  async list(_u: string) { return Array.from(this.data.values()); }
}

describe('slugifyConcept', () => {
  it('normalizes labels to safe slugs', () => {
    expect(slugifyConcept('Newton\'s Second Law!')).toBe('newton-s-second-law');
    expect(slugifyConcept('   ')).toBe('unknown');
  });
});

describe('MasteryEngine.applyEvent (pure)', () => {
  const e = new MasteryEngine(new FakeStore());

  it('raises mastery on a correct quiz and records a graded attempt', () => {
    const m = e.applyEvent(null, 'photosynthesis', 'quiz_correct', 'Photosynthesis');
    expect(m.masteryScore).toBeGreaterThan(0.5);
    expect(m.attempts).toBe(1);
    expect(m.successCount).toBe(1);
    expect(m.successRate).toBe(1);
    expect(m.title).toBe('Photosynthesis');
  });

  it('lowers mastery on an incorrect quiz', () => {
    const m = e.applyEvent(null, 'osmosis', 'quiz_incorrect');
    expect(m.masteryScore).toBeLessThan(0.5);
    expect(m.successRate).toBe(0);
  });

  it('does not overreact to a single chat exposure', () => {
    const m = e.applyEvent(null, 'entropy', 'chat');
    // small pull toward 0.7 from 0.5 → still near neutral
    expect(m.masteryScore).toBeGreaterThan(0.5);
    expect(m.masteryScore).toBeLessThan(0.56);
    expect(m.attempts).toBe(0); // chat is not a graded attempt
  });

  it('tracks trend + velocity across repeated successes', () => {
    let m = e.applyEvent(null, 'algebra', 'quiz_correct', 'Algebra');
    m = e.applyEvent(m, 'algebra', 'quiz_correct', 'Algebra');
    expect(m.masteryTrend).toBe('improving');
    expect(m.learningVelocity).toBeGreaterThan(0);
    expect(m.attempts).toBe(2);
  });

  it('appends revision timestamps (bounded)', () => {
    let m = e.applyEvent(null, 'trig', 'revision', 'Trigonometry', 1000);
    m = e.applyEvent(m, 'trig', 'revision', 'Trigonometry', 2000);
    expect(m.revisionHistory).toEqual([1000, 2000]);
  });
});

describe('MasteryEngine store ops', () => {
  it('recordEvent read-modify-writes and getWeakConcepts returns weakest titles with evidence', async () => {
    const store = new FakeStore();
    const e = new MasteryEngine(store);
    await e.recordEvent('u1', { id: 'osmosis', title: 'Osmosis' }, 'quiz_incorrect');
    await e.recordEvent('u1', { id: 'algebra', title: 'Algebra' }, 'quiz_correct');
    await e.recordEvent('u1', { id: 'algebra', title: 'Algebra' }, 'quiz_correct');
    const weak = await e.getWeakConcepts('u1', 0.5, 5);
    expect(weak).toContain('Osmosis');
    expect(weak).not.toContain('Algebra'); // mastered
  });

  it('recordConcepts records the same event for several concepts', async () => {
    const store = new FakeStore();
    const e = new MasteryEngine(store);
    await e.recordConcepts('u1', [{ id: 'a', title: 'A' }, { id: 'b', title: 'B' }], 'chat');
    expect(store.data.size).toBe(2);
  });

  it('snapshot aggregates mastery', async () => {
    const store = new FakeStore();
    const e = new MasteryEngine(store);
    await e.recordEvent('u1', { id: 'x', title: 'X' }, 'quiz_incorrect');
    await e.recordEvent('u1', { id: 'y', title: 'Y' }, 'quiz_correct');
    const snap = await e.snapshot('u1');
    expect(snap.concepts).toBe(2);
    expect(snap.weak).toBeGreaterThanOrEqual(1);
  });

  it('getWeakConcepts ignores concepts with no evidence', async () => {
    const store = new FakeStore();
    const e = new MasteryEngine(store);
    // Manually seed a neutral concept with zero attempts.
    await store.set('u1', e.applyEvent(null, 'neutral', 'chat', 'Neutral'));
    const weak = await e.getWeakConcepts('u1', 0.9);
    expect(weak).not.toContain('Neutral'); // chat gave no graded evidence + mastery>0.5
  });
});
