/**
 * The Gate 8 learning-state endpoint.
 *
 * LearningStateService was built and then never mounted — nothing outside the process could read
 * it. These tests cover the two things that mounting a private measurement surface can get wrong:
 * leaking another student's data, and reporting an unmeasured metric as a measured zero.
 */

let mockState: any = null;
let mockThrows: string | null = null;
let capturedUserId: string | undefined;

jest.mock('../../src/services/learningState.service', () => ({
  learningStateService: {
    getLearningState: jest.fn(async (userId: string) => {
      capturedUserId = userId;
      if (mockThrows) throw new Error(mockThrows);
      return mockState;
    }),
  },
  MIN_TOPIC_EVIDENCE: 3,
  WEAK_ACCURACY: 60,
  STRONG_ACCURACY: 80,
}));
jest.mock('../../src/utils/logger', () => ({
  logger: { info: () => {}, warn: () => {}, error: () => {}, debug: () => {} },
}));
jest.mock('../../src/middlewares/auth', () => ({
  requireAuth: (_req: any, _res: any, next: any) => next(),
  enforceSelf: () => (_req: any, _res: any, next: any) => next(),
}));

import router from '../../src/routes/learningState.routes';

/** Invoke the GET '/' handler the router registered, without booting Express. */
const handler = () => {
  const layer = (router as any).stack.find((l: any) => l.route?.path === '/' && l.route?.methods?.get);
  expect(layer).toBeDefined();
  const stack = layer.route.stack;
  return stack[stack.length - 1].handle;
};

const makeRes = () => {
  const r: any = { statusCode: 200, body: null, headers: {} };
  r.status = (c: number) => { r.statusCode = c; return r; };
  r.json = (b: any) => { r.body = b; return r; };
  r.set = (k: string, v: string) => { r.headers[k] = v; return r; };
  return r;
};
const run = async (req: any = { user: { uid: 'student-1' } }) => {
  const res = makeRes();
  await handler()(req, res);
  return res;
};

beforeEach(() => {
  mockThrows = null;
  capturedUserId = undefined;
  mockState = {
    studentId: 'student-1',
    examContext: { examId: 'UPSC_CSE' },
    goal: null,
    observations: {
      topics: [{
        topic: 'Polity',
        mastery: { status: 'INSUFFICIENT', value: null, confidence: null,
                   reason: 'no mastery record (ENABLE_MASTERY may be off, or topic not yet assessed)' },
      }],
    },
    analysis: { weaknesses: [] },
    decisions: { goalGap: {}, currentPriority: {} },
  };
});

describe('identity comes from the token, never the request', () => {
  it('uses req.user.uid', async () => {
    await run({ user: { uid: 'student-1' } });
    expect(capturedUserId).toBe('student-1');
  });

  it('ignores a client-supplied userId entirely', async () => {
    // The Phase 0 vulnerability this pattern exists to prevent: both sides of an ownership
    // check being client-supplied, so passing the victim's id satisfied it.
    await run({
      user: { uid: 'student-1' },
      query: { userId: 'victim' }, body: { userId: 'victim' }, params: { userId: 'victim' },
    });
    expect(capturedUserId).toBe('student-1');
    expect(capturedUserId).not.toBe('victim');
  });

  it('401s when no verified identity is present', async () => {
    const res = await run({ user: undefined });
    expect(res.statusCode).toBe(401);
    expect(capturedUserId).toBeUndefined();   // the service is never reached
  });
});

describe('unmeasured is reported as unmeasured, not as zero', () => {
  it('passes INSUFFICIENT through with its reason intact', async () => {
    const res = await run();
    const m = res.body.observations.topics[0].mastery;
    expect(m.status).toBe('INSUFFICIENT');
    expect(m.value).toBeNull();                       // NOT 0
    expect(m.reason).toMatch(/ENABLE_MASTERY may be off/);
  });

  it('returns the thresholds it measured against, so a client cannot drift from them', async () => {
    const res = await run();
    expect(res.body.thresholds).toEqual({
      MIN_TOPIC_EVIDENCE: 3, WEAK_ACCURACY: 60, STRONG_ACCURACY: 80,
    });
  });
});

describe('caching and failure', () => {
  it('is never cached — it is per-student and changes on every graded attempt', async () => {
    const res = await run();
    expect(res.headers['Cache-Control']).toBe('private, no-store');
  });

  it('500s without leaking internals', async () => {
    mockThrows = 'firestore exploded with a stack trace';
    const res = await run();
    expect(res.statusCode).toBe(500);
    expect(res.body).toEqual({ error: 'learning_state_unavailable' });
    expect(JSON.stringify(res.body)).not.toMatch(/firestore exploded/);
  });
});

describe('the surface stays read-only', () => {
  const fs = require('fs');
  const path = require('path');
  const src = fs.readFileSync(
    path.join(__dirname, '../../src/routes/learningState.routes.ts'), 'utf8');

  it('registers no mutating verb', () => {
    // A measurement surface that can also write is one refactor from becoming a second source
    // of truth for the numbers it exists to report.
    for (const verb of ['post', 'put', 'patch', 'delete']) {
      expect(src).not.toMatch(new RegExp(`router\\.${verb}\\(`));
    }
  });

  it('is mounted, and behind requireAuth', () => {
    const index = fs.readFileSync(path.join(__dirname, '../../src/routes/index.ts'), 'utf8');
    expect(index).toMatch(/router\.use\('\/learning-state', learningStateRoutes\)/);
    expect(src).toMatch(/router\.get\('\/',\s*requireAuth/);
  });
});
