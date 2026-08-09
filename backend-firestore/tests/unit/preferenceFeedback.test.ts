import { StudentPreferenceService, PreferenceStore, StudentPreferences } from '../../src/core/intelligence/PreferenceService';
import { FeedbackService, FeedbackStore, FeedbackEvent } from '../../src/core/intelligence/FeedbackService';

class FakePrefStore implements PreferenceStore {
  data = new Map<string, StudentPreferences>();
  async get(u: string) { return this.data.get(u) || null; }
  async set(u: string, p: StudentPreferences) { this.data.set(u, { ...(this.data.get(u) || {}), ...p }); }
}

class FakeFeedbackStore implements FeedbackStore {
  events: FeedbackEvent[] = [];
  async append(e: FeedbackEvent) { this.events.push(e); }
  async recent(_u: string, limit: number) { return this.events.slice(-limit).reverse(); }
}

describe('StudentPreferenceService', () => {
  it('detects explicit preference cues from a message (and only clear ones)', () => {
    const svc = new StudentPreferenceService(new FakePrefStore());
    expect(svc.detectFromMessage('explain this in hindi please')).toMatchObject({ language: 'Hindi' });
    expect(svc.detectFromMessage('keep it short, tldr')).toMatchObject({ depth: 'brief', preferShortAnswers: true });
    expect(svc.detectFromMessage('explain in detail with examples')).toMatchObject({ depth: 'deep', preferExamples: true });
    expect(svc.detectFromMessage('show me a diagram')).toMatchObject({ preferDiagrams: true, visualLearner: true });
    expect(svc.detectFromMessage('put it in a table')).toMatchObject({ preferTables: true });
    expect(svc.detectFromMessage('what is gravity')).toEqual({}); // no cue → no guess
  });

  it('learnFromMessage persists detected preferences (merge) and get returns them', async () => {
    const store = new FakePrefStore();
    const svc = new StudentPreferenceService(store);
    await svc.learnFromMessage('u1', 'answer in hindi, briefly');
    const prefs = await svc.get('u1');
    expect(prefs.language).toBe('Hindi');
    expect(prefs.depth).toBe('brief');
    expect(prefs.updatedAt).toBeGreaterThan(0);
  });

  it('learnFromMessage is a no-op when no cue is present', async () => {
    const store = new FakePrefStore();
    const svc = new StudentPreferenceService(store);
    await svc.learnFromMessage('u1', 'what is osmosis');
    expect(await svc.get('u1')).toEqual({});
  });

  it('toPersonalizationPlan maps preferences', () => {
    const svc = new StudentPreferenceService(new FakePrefStore());
    const plan = svc.toPersonalizationPlan({ language: 'Hinglish', depth: 'deep', preferExamples: true });
    expect(plan).toMatchObject({ language: 'Hinglish', depth: 'deep', preferExamples: true });
  });
});

describe('FeedbackService', () => {
  it('records valid signals and rejects invalid ones', async () => {
    const store = new FakeFeedbackStore();
    const svc = new FeedbackService(store);
    await svc.record({ userId: 'u1', signal: 'thumbs_up', category: 'definition' });
    await svc.record({ userId: 'u1', signal: 'dwell', value: 4200 });
    await svc.record({ userId: 'u1', signal: 'not_a_signal' as any });   // invalid → ignored
    await svc.record({ signal: 'thumbs_up' } as any);                     // no userId → ignored
    expect(store.events).toHaveLength(2);
    expect(store.events[0].ts).toBeGreaterThan(0);
  });

  it('summarizes signals into a compact quality summary', () => {
    const svc = new FeedbackService(new FakeFeedbackStore());
    const events: FeedbackEvent[] = [
      { userId: 'u', signal: 'thumbs_up' }, { userId: 'u', signal: 'thumbs_up' }, { userId: 'u', signal: 'thumbs_down' },
      { userId: 'u', signal: 'regenerated' }, { userId: 'u', signal: 'copied' },
      { userId: 'u', signal: 'dwell', value: 1000 }, { userId: 'u', signal: 'dwell', value: 3000 },
      { userId: 'u', signal: 'citation_opened' }, { userId: 'u', signal: 'quiz_requested' }, { userId: 'u', signal: 'followup' },
    ];
    const s = svc.summarize(events);
    expect(s.total).toBe(10);
    expect(s.thumbsUp).toBe(2);
    expect(s.thumbsDown).toBe(1);
    expect(s.satisfaction).toBeCloseTo(2 / 3);
    expect(s.avgDwellMs).toBe(2000);
    expect(s.citationsOpened).toBe(1);
    expect(s.quizzesRequested).toBe(1);
  });

  it('satisfaction defaults to 0.5 with no explicit votes', () => {
    const svc = new FeedbackService(new FakeFeedbackStore());
    expect(svc.summarize([{ userId: 'u', signal: 'copied' }]).satisfaction).toBe(0.5);
  });
});

describe('StudentPreferenceService — intelligent inference (Phase 3)', () => {
  const svc = new StudentPreferenceService(new FakePrefStore());

  it('maps messages to implicit behavioral observations', () => {
    expect(svc.observationsFromMessage('can you draw a diagram for this?')).toEqual(expect.arrayContaining(['diagrams', 'visual']));
    expect(svc.observationsFromMessage('give me some practice questions to solve')).toContain('practice');
    expect(svc.observationsFromMessage('this is too long, keep it concise')).toContain('concise');
    expect(svc.observationsFromMessage('please elaborate in more detail')).toContain('detailed');
    expect(svc.observationsFromMessage('hello')).toEqual([]);
  });

  it('maps feedback signals to observations', () => {
    expect(svc.observationsFromFeedback('regenerated')).toEqual(['concise']);
    expect(svc.observationsFromFeedback('followup')).toEqual(['detailed']);
    expect(svc.observationsFromFeedback('copied')).toEqual([]);
  });

  it('does NOT flip a preference on a single observation (weighted EMA)', () => {
    const after1 = svc.applyInference({}, ['diagrams', 'visual']);
    expect(after1.preferDiagrams).toBeFalsy();
    expect(after1.signalConfidence!.diagrams).toBeCloseTo(0.15);
  });

  it('flips a preference only after repeated consistent observations', () => {
    let prefs = {};
    for (let i = 0; i < 8; i++) prefs = svc.applyInference(prefs, ['diagrams', 'visual']);
    expect((prefs as any).preferDiagrams).toBe(true);
    expect((prefs as any).visualLearner).toBe(true);
    expect((prefs as any).signalConfidence.diagrams).toBeGreaterThan(0.65);
  });

  it('competing signals erode each other (concise vs detailed)', () => {
    let prefs: any = {};
    for (let i = 0; i < 10; i++) prefs = svc.applyInference(prefs, ['concise']);
    expect(prefs.depth).toBe('brief');
    const concise = prefs.signalConfidence.concise;
    // Now the student switches to wanting detail — concise must decay as detailed rises.
    for (let i = 0; i < 3; i++) prefs = svc.applyInference(prefs, ['detailed']);
    expect(prefs.signalConfidence.concise).toBeLessThan(concise);
    expect(prefs.signalConfidence.detailed).toBeGreaterThan(0);
  });

  it('learnImplicit persists accumulated confidence', async () => {
    const store = new FakePrefStore();
    const s = new StudentPreferenceService(store);
    await s.learnImplicit('u1', ['examples']);
    await s.learnImplicit('u1', ['examples']);
    const prefs = await s.get('u1');
    expect(prefs.signalConfidence!.examples).toBeGreaterThan(0.15);
  });

  it('learnImplicit is a no-op with no observations', async () => {
    const store = new FakePrefStore();
    const s = new StudentPreferenceService(store);
    await s.learnImplicit('u1', []);
    expect(await s.get('u1')).toEqual({});
  });
});
