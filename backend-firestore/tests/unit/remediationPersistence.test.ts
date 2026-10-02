/**
 * Checkpoint 5/6 persistence — the repository's claim/attach transactions (ownership, idempotency,
 * stale claims), quiz submission storing the diagnosis, and the HTTP endpoint's contract.
 */
const store = new Map<string, any>();
const mockTx = {
  get: jest.fn(async (ref: any) => ({ exists: store.has(ref.id), id: ref.id, data: () => store.get(ref.id) })),
  set: jest.fn((ref: any, data: any) => store.set(ref.id, deepMerge(store.get(ref.id) ?? {}, data))),
  update: jest.fn((ref: any, data: any) => store.set(ref.id, applyUpdate(store.get(ref.id), data))),
};
jest.mock('firebase-admin/firestore', () => ({ FieldValue: { delete: () => '__DELETE__' } }));
jest.mock('../../src/config/firebase', () => ({
  db: {
    collection: () => ({
      doc: (id: string) => ({
        id,
        get: async () => ({ exists: store.has(id), id, data: () => store.get(id) }),
        set: async (data: any) => store.set(id, deepMerge(store.get(id) ?? {}, data)),
        update: async (data: any) => store.set(id, applyUpdate(store.get(id), data)),
      }),
      where: () => ({ get: async () => ({ docs: [] }) }),
    }),
    runTransaction: async (fn: any) => fn(mockTx),
  },
}));

function deepMerge(a: any, b: any): any {
  const out = { ...a };
  for (const [k, v] of Object.entries(b)) out[k] = v && typeof v === 'object' && !Array.isArray(v) ? deepMerge(a?.[k] ?? {}, v) : v;
  return out;
}
function applyUpdate(doc: any, patch: any) {
  const out = JSON.parse(JSON.stringify(doc));
  for (const [path, v] of Object.entries(patch)) {
    const keys = path.split('.');
    let cur = out;
    for (const k of keys.slice(0, -1)) cur = cur[k] ??= {};
    if (v === '__DELETE__') delete cur[keys[keys.length - 1]];
    else cur[keys[keys.length - 1]] = v;
  }
  return out;
}

import { QuizAttemptsRepository, REMEDIATION_CLAIM_TTL_MS } from '../../src/repositories/quizAttempts.repository';

const diag = { id: 'diag_JEE_MAIN_rotational_dynamics', remediationEligible: true };
const drill = { drillAttemptId: 'qa_drill', title: 't', kind: 'ROOT_CAUSE', targetConceptIds: ['vectors'], targetConcept: 'Vectors', questionCount: 3, createdAt: 'x' } as any;

beforeEach(() => {
  store.clear();
  store.set('qa_1', { userId: 'owner', pedagogicalDiagnostics: [diag] });
});

describe('quizAttemptsRepository remediation transactions', () => {
  const repo = new QuizAttemptsRepository();

  it('rejects another user’s attempt exactly like a missing one', async () => {
    expect(await repo.claimRemediation('intruder', 'qa_1', diag.id)).toEqual({ status: 'NOT_FOUND' });
    expect(await repo.claimRemediation('owner', 'qa_missing', diag.id)).toEqual({ status: 'NOT_FOUND' });
    expect(store.get('qa_1').remediationClaims).toBeUndefined();
  });

  it('claims once; a concurrent second claim is IN_PROGRESS', async () => {
    expect((await repo.claimRemediation('owner', 'qa_1', diag.id)).status).toBe('CLAIMED');
    expect(await repo.claimRemediation('owner', 'qa_1', diag.id)).toEqual({ status: 'IN_PROGRESS' });
  });

  it('a stale claim (crashed request) can be taken over', async () => {
    store.get('qa_1').remediationClaims = { [diag.id]: new Date(Date.now() - REMEDIATION_CLAIM_TTL_MS - 1000).toISOString() };
    expect((await repo.claimRemediation('owner', 'qa_1', diag.id)).status).toBe('CLAIMED');
  });

  it('unknown diagnostic id → NO_DIAGNOSTIC', async () => {
    expect(await repo.claimRemediation('owner', 'qa_1', 'diag_nope')).toEqual({ status: 'NO_DIAGNOSTIC' });
  });

  it('attach persists the drill on the diagnostic, clears the claim, and makes the next claim EXISTS', async () => {
    await repo.claimRemediation('owner', 'qa_1', diag.id);
    const stored = await repo.attachRemediationDrill('owner', 'qa_1', diag.id, drill);
    expect(stored).toEqual(drill);
    const doc = store.get('qa_1');
    expect(doc.pedagogicalDiagnostics[0].remediationDrill).toEqual(drill);
    expect(doc.remediationClaims?.[diag.id]).toBeUndefined();
    expect(await repo.claimRemediation('owner', 'qa_1', diag.id)).toEqual({ status: 'EXISTS', drill });
  });

  it('first writer wins: a second attach returns the drill already stored', async () => {
    await repo.attachRemediationDrill('owner', 'qa_1', diag.id, drill);
    const second = await repo.attachRemediationDrill('owner', 'qa_1', diag.id, { ...drill, drillAttemptId: 'qa_other' });
    expect(second.drillAttemptId).toBe('qa_drill');
  });

  it('release drops the claim so the student can retry', async () => {
    await repo.claimRemediation('owner', 'qa_1', diag.id);
    await repo.releaseRemediationClaim('qa_1', diag.id);
    expect((await repo.claimRemediation('owner', 'qa_1', diag.id)).status).toBe('CLAIMED');
  });
});

describe('POST /quiz/attempts/:id/remediation-drill controller', () => {
  const mockGenerate = jest.fn();
  jest.doMock('../../src/services/pedagogy/remediationDrill.service', () => {
    const actual = jest.requireActual('../../src/services/pedagogy/remediationDrill.service');
    return { ...actual, remediationDrillService: { generateForDiagnostic: (...a: any[]) => mockGenerate(...a) } };
  });
  const res = () => {
    const r: any = {};
    r.status = jest.fn(() => r);
    r.json = jest.fn(() => r);
    return r;
  };
  let IsolatedRemediationError: any;
  const load = () => {
    let C: any;
    jest.isolateModules(() => {
      jest.doMock('../../src/services/tests/quizGenerator.service', () => ({ quizGeneratorService: {} }));
      jest.doMock('../../src/services/tests/quizAttempts.service', () => ({ quizAttemptsService: {}, QuizAttemptError: class extends Error {} }));
      jest.doMock('../../src/services/userStats.service', () => ({ UserStatsService: class {} }));
      jest.doMock('../../src/services/pyq/examIndex', () => ({ detectExamId: jest.fn() }));
      jest.doMock('../../src/services/tests/drillTopics.service', () => ({ drillTopicsService: {} }));
      C = require('../../src/controllers/quiz.controller').QuizController;
      IsolatedRemediationError = require('../../src/services/pedagogy/remediationDrill.service').RemediationError;
    });
    return new C();
  };

  beforeEach(() => mockGenerate.mockReset());

  it('401 without an authenticated user', async () => {
    const r = res();
    await load().createRemediationDrill({ params: { id: 'qa_1' }, body: { diagnosticId: diag.id } } as any, r, jest.fn());
    expect(r.status).toHaveBeenCalledWith(401);
    expect(mockGenerate).not.toHaveBeenCalled();
  });

  it('400 on a missing or malformed diagnosticId', async () => {
    const r = res();
    await load().createRemediationDrill({ user: { uid: 'owner' }, params: { id: 'qa_1' }, body: { diagnosticId: '../../x' } } as any, r, jest.fn());
    expect(r.status).toHaveBeenCalledWith(400);
  });

  it('201 on creation with the caller’s uid (never a body-supplied user)', async () => {
    mockGenerate.mockResolvedValue({ status: 'CREATED', drill });
    const r = res();
    await load().createRemediationDrill({ user: { uid: 'owner' }, params: { id: 'qa_1' }, body: { diagnosticId: diag.id, userId: 'someone_else' } } as any, r, jest.fn());
    expect(mockGenerate).toHaveBeenCalledWith('owner', 'qa_1', diag.id);
    expect(r.status).toHaveBeenCalledWith(201);
  });

  it('maps typed errors to status + code', async () => {
    const controller = load(); // the controller's own module copy of RemediationError
    mockGenerate.mockRejectedValue(new IsolatedRemediationError('QUOTA_EXCEEDED', 'used up', { limit: 50 }));
    const r = res();
    await controller.createRemediationDrill({ user: { uid: 'owner' }, params: { id: 'qa_1' }, body: { diagnosticId: diag.id } } as any, r, jest.fn());
    expect(r.status).toHaveBeenCalledWith(403);
    expect(r.json).toHaveBeenCalledWith(expect.objectContaining({ code: 'QUOTA_EXCEEDED', limit: 50 }));
  });
});
