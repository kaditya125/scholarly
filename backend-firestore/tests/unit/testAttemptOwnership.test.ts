/**
 * `POST /tests/attempts/:attemptId/submit` — attempt ownership.
 *
 * ── THE DEFECT THESE PIN ──────────────────────────────────────────────────────────────────
 * The route carries `requireAuth` but could not carry `enforceSelf`, because its path parameter
 * is an ATTEMPT id and not a user id — there was nothing for that middleware to compare. So
 * authentication proved the caller was *someone*, and nothing proved the attempt was theirs.
 * `processSubmission(attemptId)` loaded the attempt, graded it, and published
 * `learning.test_completed` stamped with `attempt.userId`. Any authenticated user holding another
 * student's attempt id could therefore grade that student's attempt — and once mastery is enabled,
 * the resulting write lands on the victim's mastery record, since mastery is derived from that
 * event's userId.
 *
 * It was recorded twice and fixed neither time: SECURITY_FIX_REPORT.md lists it under residual
 * items ("authenticated but not attempt-ownership-checked"), and docs/TEACHER_ECOSYSTEM_PLAN.md
 * carries it as defect 4, required closed before class tests ship. The route is documented public
 * API and has a planned consumer, so it is guarded rather than deleted.
 *
 * ── WHAT IS ASSERTED, AND WHY IT IS ASSERTED THIS WAY ─────────────────────────────────────
 * The guard runs before anything else, so the observable consequences of rejection are that
 * grading never starts (`getTestById` is never reached) and no completion event is published.
 * Those two are the load-bearing assertions: mastery is written ONLY from that event, so an
 * unpublished event is an unwritten mastery record. Cross-user isolation at the mastery layer
 * itself is proven separately in masteryLivePath.test.ts.
 */

// uuid ships ESM-only and is not transformed by ts-jest; stubbed as elsewhere in this suite.
jest.mock('uuid', () => ({ v4: () => '00000000-0000-4000-8000-000000000000' }));

const mockAttempts = new Map<string, any>();
const mockGetTestById = jest.fn(async () => null);
const mockPublish = jest.fn(async () => {});

jest.mock('../../src/repositories/tests.repository', () => ({
  testsRepository: {
    getTestAttempt: async (id: string) => mockAttempts.get(id) ?? null,
    getTestById: mockGetTestById,
    getQuestions: async () => [],
    updateTestAttempt: async () => {},
  },
}));

// processSubmission reaches the bus through a dynamic `await import(...)`, so mocking the module
// intercepts it the same way a static import would.
jest.mock('../../src/core/events/EventBus', () => ({
  eventBus: { publish: mockPublish, subscribe: () => {} },
}));

jest.mock('../../src/services/planner.service', () => ({
  PlannerService: class { async createTask() { /* not under test */ } },
}));
jest.mock('../../src/services/userStats.service', () => ({
  UserStatsService: class {
    async awardXP() { /* not under test */ }
    async getUserStats() { return {}; }
  },
}));

import { ResultAnalysisService, TestAttemptError } from '../../src/services/tests/resultAnalysis.service';

const OWNER = 'student-owner-uid';
const ATTACKER = 'student-attacker-uid';
const ATTEMPT_ID = 'attempt-abc123';

let service: ResultAnalysisService;

beforeEach(() => {
  jest.clearAllMocks();
  mockAttempts.clear();
  mockAttempts.set(ATTEMPT_ID, {
    id: ATTEMPT_ID,
    userId: OWNER,
    testId: 'test-1',
    status: 'in_progress',
    answers: { q1: 0 },
  });
  service = new ResultAnalysisService();
});

describe('the owner may submit their own attempt', () => {
  it('passes the ownership guard and proceeds to grading', async () => {
    /*
     * Asserted via getTestById rather than a full graded result: grading itself is pre-existing
     * behaviour that this change did not touch, and the property under test is that the guard
     * ADMITS the owner. Reaching the test lookup is proof it did — the guard sits strictly before
     * it. The call then fails on the deliberately-null test fixture, which is irrelevant here.
     */
    await service.processSubmission(ATTEMPT_ID, OWNER).catch(() => {});
    expect(mockGetTestById).toHaveBeenCalledWith('test-1');
  });

  it('returns an already-completed attempt unchanged, without regrading', async () => {
    mockAttempts.set(ATTEMPT_ID, { ...mockAttempts.get(ATTEMPT_ID), status: 'completed' });
    const result = await service.processSubmission(ATTEMPT_ID, OWNER);

    expect(result.status).toBe('completed');
    expect(mockGetTestById).not.toHaveBeenCalled();
    // No republish => no second mastery application for one submission.
    expect(mockPublish).not.toHaveBeenCalled();
  });
});

describe('THE REGRESSION: another user may not submit an attempt they do not own', () => {
  it('rejects with 404', async () => {
    await expect(service.processSubmission(ATTEMPT_ID, ATTACKER))
      .rejects.toMatchObject({ status: 404, message: 'Attempt not found' });
  });

  it('does not grade — the attempt is never even loaded for scoring', async () => {
    await service.processSubmission(ATTEMPT_ID, ATTACKER).catch(() => {});
    expect(mockGetTestById).not.toHaveBeenCalled();
  });

  it('does not publish learning.test_completed, so no mastery can be written', async () => {
    await service.processSubmission(ATTEMPT_ID, ATTACKER).catch(() => {});
    expect(mockPublish).not.toHaveBeenCalled();
  });

  it('leaves the victim\'s attempt untouched', async () => {
    await service.processSubmission(ATTEMPT_ID, ATTACKER).catch(() => {});
    expect(mockAttempts.get(ATTEMPT_ID).status).toBe('in_progress');
  });
});

describe('it does not leak whether another user\'s attempt exists', () => {
  it('an unknown id and someone else\'s id are indistinguishable', async () => {
    /*
     * The whole point of 404-not-403. A distinguishable response would turn this endpoint into an
     * existence oracle: an attacker enumerating ids would learn which ones name real attempts
     * belonging to other students — precisely the fact the guard exists to withhold. Same status,
     * same message, both ways.
     */
    const forOther = await service.processSubmission(ATTEMPT_ID, ATTACKER).catch((e) => e);
    const forUnknown = await service.processSubmission('no-such-attempt', ATTACKER).catch((e) => e);

    expect(forOther.status).toBe(forUnknown.status);
    expect(forOther.message).toBe(forUnknown.message);
    expect(forOther).toBeInstanceOf(TestAttemptError);
  });

  it('an unknown attempt id is rejected safely rather than throwing a bare Error', async () => {
    // A bare `throw new Error(...)` reaches the error middleware with no `status` and becomes a
    // 500, which is both wrong and noisy in monitoring. It must be a typed 404.
    await expect(service.processSubmission('no-such-attempt', OWNER))
      .rejects.toMatchObject({ status: 404 });
  });
});

describe('an unauthenticated caller is rejected', () => {
  it.each([['empty string', ''], ['undefined', undefined as any]])(
    'rejects a missing uid (%s) with 401 and never loads the attempt',
    async (_label, uid) => {
      await expect(service.processSubmission(ATTEMPT_ID, uid))
        .rejects.toMatchObject({ status: 401 });
      expect(mockGetTestById).not.toHaveBeenCalled();
      expect(mockPublish).not.toHaveBeenCalled();
    },
  );
});

describe('the guard cannot be reopened by a forgetful caller', () => {
  const fs = require('fs');
  const path = require('path');
  const read = (p: string) => fs.readFileSync(path.join(__dirname, '../../src', p), 'utf8');

  it('userId is a REQUIRED positional parameter, not optional', () => {
    /*
     * Structural, deliberately. If the parameter were optional (`userId?: string`), a future
     * caller could omit it and TypeScript would say nothing — reopening the hole silently. Being
     * required is what makes the compiler the enforcement mechanism rather than review.
     */
    const src = read('services/tests/resultAnalysis.service.ts');
    expect(src).toMatch(/async processSubmission\(\s*attemptId: string,\s*userId: string\s*\)/);
    expect(src).not.toMatch(/async processSubmission\(\s*attemptId: string,\s*userId\?/);
  });

  it('the controller takes the uid from the verified token, never from input', () => {
    const src = read('controllers/tests.controller.ts');
    // req.user is populated by requireAuth from the verified Firebase token.
    expect(src).toMatch(/const userId = \(req as any\)\.user\?\.uid/);
    expect(src).toMatch(/processSubmission\(attemptId, userId\)/);
    // A uid accepted from the body or the query string would defeat the entire guard.
    expect(src).not.toMatch(/processSubmission\([^)]*req\.(body|query|params)\.userId/);
  });
});
