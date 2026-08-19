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

/**
 * Phase A2: proves that a REAL student action moves mastery, and that the subject/topic
 * hierarchy survives — this is the guarantee that mastery is measured from evidence rather
 * than asserted by a model.
 */
describe('MasteryEngine hierarchy + evidence loop', () => {
  it('carries subject/topic onto the stored record', async () => {
    const store = new FakeStore();
    const e = new MasteryEngine(store);
    await e.recordEvent(
      'u1',
      { id: 'probability', title: 'Probability', subject: 'Mathematics', topic: 'Probability' },
      'quiz_incorrect',
    );
    const rec = await store.get('u1', 'probability');
    expect(rec?.subject).toBe('Mathematics');
    expect(rec?.topic).toBe('Probability');
  });

  it('backfills hierarchy onto a record created before it was known', async () => {
    const store = new FakeStore();
    const e = new MasteryEngine(store);
    await e.recordEvent('u1', { id: 'probability', title: 'Probability' }, 'quiz_incorrect');
    expect((await store.get('u1', 'probability'))?.subject).toBeUndefined();

    await e.recordEvent(
      'u1',
      { id: 'probability', title: 'Probability', subject: 'Mathematics', topic: 'Probability' },
      'quiz_correct',
    );
    expect((await store.get('u1', 'probability'))?.subject).toBe('Mathematics');
  });

  it('a run of wrong answers drives the concept weak, and recovery pulls it back up', async () => {
    const store = new FakeStore();
    const e = new MasteryEngine(store);
    const concept = { id: 'probability', title: 'Probability', subject: 'Mathematics', topic: 'Probability' };

    for (let i = 0; i < 4; i++) await e.recordEvent('u1', concept, 'quiz_incorrect');
    const weakened = await store.get('u1', 'probability');
    expect(weakened!.masteryScore).toBeLessThan(0.5);
    expect(weakened!.attempts).toBe(4);
    expect(weakened!.successRate).toBe(0);
    expect(await e.getWeakConcepts('u1', 0.5)).toContain('Probability');

    // Sustained correct answers should recover it and flip the trend to improving.
    for (let i = 0; i < 6; i++) await e.recordEvent('u1', concept, 'quiz_correct');
    const recovered = await store.get('u1', 'probability');
    expect(recovered!.masteryScore).toBeGreaterThan(weakened!.masteryScore);
    expect(recovered!.masteryTrend).toBe('improving');
    // Evidence accumulates, so confidence in the estimate rises with attempts.
    expect(recovered!.confidence).toBeGreaterThan(weakened!.confidence);
    expect(await e.getWeakConcepts('u1', 0.5)).not.toContain('Probability');
  });

  it('one answer cannot swing a well-evidenced concept (EMA smoothing)', async () => {
    const store = new FakeStore();
    const e = new MasteryEngine(store);
    const concept = { id: 'kinematics', title: 'Kinematics', subject: 'Physics', topic: 'Kinematics' };
    for (let i = 0; i < 8; i++) await e.recordEvent('u1', concept, 'quiz_correct');
    const strong = (await store.get('u1', 'kinematics'))!.masteryScore;

    await e.recordEvent('u1', concept, 'quiz_incorrect');
    const afterOneSlip = (await store.get('u1', 'kinematics'))!.masteryScore;
    // It dips, but a single wrong answer must not erase established evidence.
    expect(afterOneSlip).toBeLessThan(strong);
    expect(afterOneSlip).toBeGreaterThan(0.4);
  });
});

/**
 * THE regression this phase exists for. Verified against the real database that per-question
 * writes lost evidence: 4 graded answers persisted first as attempts=1/successRate=1.0 (a 25%
 * result recorded as 100%), then as attempts=2 after adding transactions. recordBatch folds a
 * submission's outcomes into one atomic write, which is what makes this deterministic.
 */
describe('recordBatch: 3 wrong + 1 correct must persist exactly', () => {
  it('produces attempts=4, successCount=1, successRate=0.25', async () => {
    const store = new FakeStore();
    const e = new MasteryEngine(store);
    await e.recordBatch(
      'u1',
      { id: 'probability', title: 'Probability', subject: 'Mathematics', topic: 'Probability' },
      ['quiz_incorrect', 'quiz_incorrect', 'quiz_incorrect', 'quiz_correct'],
    );
    const rec = await store.get('u1', 'probability');
    expect(rec!.attempts).toBe(4);
    expect(rec!.successCount).toBe(1);
    expect(rec!.successRate).toBeCloseTo(0.25, 5);
    // Never the failure modes we actually observed in production:
    expect(rec!.attempts).not.toBe(1);
    expect(rec!.successRate).not.toBe(1);
  });

  it('is order-independent in totals (same counts => same attempts/successRate)', async () => {
    const s1 = new FakeStore(); const s2 = new FakeStore();
    const c = { id: 'p', title: 'P', subject: 'Maths', topic: 'P' };
    await new MasteryEngine(s1).recordBatch('u', c, ['quiz_incorrect', 'quiz_incorrect', 'quiz_incorrect', 'quiz_correct']);
    await new MasteryEngine(s2).recordBatch('u', c, ['quiz_correct', 'quiz_incorrect', 'quiz_incorrect', 'quiz_incorrect']);
    const a = await s1.get('u', 'p'); const b = await s2.get('u', 'p');
    expect(a!.attempts).toBe(b!.attempts);
    expect(a!.successRate).toBeCloseTo(b!.successRate, 5);
  });

  it('accumulates across successive submissions rather than replacing', async () => {
    const store = new FakeStore();
    const e = new MasteryEngine(store);
    const c = { id: 'p', title: 'P', subject: 'Maths', topic: 'P' };
    await e.recordBatch('u', c, ['quiz_incorrect', 'quiz_incorrect']);
    await e.recordBatch('u', c, ['quiz_correct', 'quiz_correct']);
    const rec = await store.get('u', 'p');
    expect(rec!.attempts).toBe(4);
    expect(rec!.successCount).toBe(2);
    expect(rec!.successRate).toBeCloseTo(0.5, 5);
  });

  it('concurrent batches on the same concept all land (atomic store)', async () => {
    // FakeStore has no transact(), so this exercises the get/set fallback serially via await.
    // The Firestore path uses runTransaction; this asserts the engine-level arithmetic holds.
    const store = new FakeStore();
    const e = new MasteryEngine(store);
    const c = { id: 'p', title: 'P', subject: 'Maths', topic: 'P' };
    for (let i = 0; i < 3; i++) await e.recordBatch('u', c, ['quiz_correct', 'quiz_incorrect']);
    const rec = await store.get('u', 'p');
    expect(rec!.attempts).toBe(6);
    expect(rec!.successCount).toBe(3);
  });
});
