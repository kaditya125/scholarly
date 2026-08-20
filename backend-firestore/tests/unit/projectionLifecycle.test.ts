/**
 * projectionStatus lifecycle across the mastery flag.
 *
 * THE TRAP THIS CLOSES: with ENABLE_MASTERY off, publish() still succeeds (Redis accepts the
 * message) while the mastery subscriber returns on its first line. The old code read that as
 * success and wrote PROJECTED — recording work that provably never happened, AND making it
 * permanently unrecoverable, because reconciliation skips PROJECTED records as already done.
 * Every baseline graded before the flag was switched on would have been silently orphaned.
 *
 * The distinction these lock in: "nothing to project" (a legitimately empty submission) is
 * settled forever; "cannot project yet" (consumer disabled) stays eligible.
 */
jest.mock('uuid', () => ({ v4: () => '00000000-0000-4000-8000-000000000000' }));

const mockGet = jest.fn();
const mockSet = jest.fn();
jest.mock('../../src/config/firebase', () => ({
  db: { collection: () => ({ doc: () => ({ collection: () => ({ doc: () => ({ get: mockGet, set: mockSet }) }) }) }) },
}));

const mockPublish = jest.fn();
jest.mock('../../src/core/events/EventBus', () => ({ eventBus: { publish: mockPublish } }));

import { BaselineReconciliationService } from '../../src/services/baselineReconciliation.service';

const ATT = 'baseline_u1_1700000000000';
const GRADED = [
  { questionId: 'q1', correct: true,  skipped: false, graded: true, subject: 'Maths', topic: 'Algebra' },
  { questionId: 'q2', correct: false, skipped: false, graded: true, subject: 'Maths', topic: 'Algebra' },
  { questionId: 'q3', correct: false, skipped: false, graded: true, subject: 'Maths', topic: 'Algebra' },
  { questionId: 'q4', correct: false, skipped: false, graded: true, subject: 'Maths', topic: 'Algebra' },
];

const session = (over: any = {}) => ({
  exists: true,
  data: () => ({
    userId: 'u1', attemptId: ATT, submissionState: 'COMPLETED', projectionStatus: 'PENDING',
    gradedQuestions: GRADED,
    gradedResult: { attemptId: ATT, totalQuestions: 4, attempted: 4, skipped: 0, correctCount: 1, accuracyPct: 25 },
    ...over,
  }),
});

const svc = new BaselineReconciliationService();
const originalFlag = process.env.ENABLE_MASTERY;

beforeEach(() => {
  jest.clearAllMocks();
  mockPublish.mockResolvedValue(true);
  mockSet.mockResolvedValue(undefined);
});
afterEach(() => {
  if (originalFlag === undefined) delete process.env.ENABLE_MASTERY;
  else process.env.ENABLE_MASTERY = originalFlag;
});

describe('mastery DISABLED — evidence stays eligible', () => {
  beforeEach(() => { delete process.env.ENABLE_MASTERY; });

  it('THE REGRESSION: does not mark PROJECTED when nothing can consume the event', async () => {
    mockGet.mockResolvedValue(session());
    const r = await svc.reconcileUser('u1');

    expect(r.projected).toBe(false);
    expect(r.reason).toBe('MASTERY_DISABLED');
  });

  it('writes nothing at all, so PENDING is preserved with no document churn', async () => {
    mockGet.mockResolvedValue(session());
    await svc.reconcileUser('u1');
    expect(mockSet).not.toHaveBeenCalled();
  });

  it('publishes nothing — with no consumer it would be pure Redis traffic', async () => {
    mockGet.mockResolvedValue(session());
    await svc.reconcileUser('u1');
    expect(mockPublish).not.toHaveBeenCalled();
  });

  it('durable grading is untouched — COMPLETED does not depend on mastery', async () => {
    mockGet.mockResolvedValue(session());
    await svc.reconcileUser('u1');
    // No write occurred, so gradedResult/gradedQuestions/submissionState are all as graded.
    expect(mockSet).not.toHaveBeenCalled();
  });
});

describe('mastery ENABLED — the same evidence is discovered and projected', () => {
  beforeEach(() => { process.env.ENABLE_MASTERY = 'true'; });

  it('projects the previously-ineligible submission', async () => {
    mockGet.mockResolvedValue(session());
    const r = await svc.reconcileUser('u1');

    expect(r.projected).toBe(true);
    expect(mockSet).toHaveBeenCalledWith(
      expect.objectContaining({ projectionStatus: 'PROJECTED' }), { merge: true },
    );
  });

  it('reuses the SAME deterministic eventId — identity is unchanged by the flag', async () => {
    mockGet.mockResolvedValue(session());
    await svc.reconcileUser('u1');

    const completion = mockPublish.mock.calls.find((c) => c[0] === 'learning.test_completed');
    expect(completion).toBeDefined();
    expect(completion![2]).toEqual({ eventId: `learning.test_completed:${ATT}` });
  });

  it('replays from durable verdicts and never re-grades', async () => {
    mockGet.mockResolvedValue(session());
    await svc.reconcileUser('u1');

    const payload = mockPublish.mock.calls.find((c) => c[0] === 'learning.test_completed')![1];
    // Straight from the persisted gradedQuestions: 4 attempted, 1 correct.
    expect(payload.correctCount).toBe(1);
    expect(payload.topicBreakdown).toEqual([
      expect.objectContaining({ topic: 'Algebra', attempted: 4, correct: 1, skipped: 0 }),
    ]);
  });

  it('publishes the completion exactly once, so mastery is written once', async () => {
    mockGet.mockResolvedValue(session());
    await svc.reconcileUser('u1');
    expect(mockPublish.mock.calls.filter((c) => c[0] === 'learning.test_completed')).toHaveLength(1);
  });

  it('an already-PROJECTED submission is not projected twice', async () => {
    mockGet.mockResolvedValue(session({ projectionStatus: 'PROJECTED' }));
    const r = await svc.reconcileUser('u1');

    expect(r.projected).toBe(false);
    expect(r.reason).toBe('ALREADY_PROJECTED');
    expect(mockPublish).not.toHaveBeenCalled();
  });
});

describe('a legitimately EMPTY submission is settled, not left eligible', () => {
  const empty = () => session({
    gradedQuestions: [],
    gradedResult: { attemptId: ATT, totalQuestions: 24, attempted: 0, skipped: 24, correctCount: 0, accuracyPct: null },
  });

  it('is PROJECTED with zero evidence even while mastery is disabled', async () => {
    // Not conflated with "cannot project yet": there is genuinely nothing to project, so the
    // obligation is discharged and it never re-enters the reconciliation backlog.
    delete process.env.ENABLE_MASTERY;
    mockGet.mockResolvedValue(empty());
    const r = await svc.reconcileUser('u1');

    expect(r.projected).toBe(true);
    expect(r.reason).toBe('EMPTY_SUBMISSION');
    expect(mockSet).toHaveBeenCalledWith(
      expect.objectContaining({ projectionStatus: 'PROJECTED', projectedEvidenceCount: 0 }), { merge: true },
    );
  });

  it('emits no event, so no mastery document can result', async () => {
    process.env.ENABLE_MASTERY = 'true';
    mockGet.mockResolvedValue(empty());
    await svc.reconcileUser('u1');
    expect(mockPublish).not.toHaveBeenCalled();
  });

  it('does not fabricate an accuracy of 0 for a student who attempted nothing', async () => {
    delete process.env.ENABLE_MASTERY;
    mockGet.mockResolvedValue(empty());
    await svc.reconcileUser('u1');
    const written = mockSet.mock.calls[0][0];
    expect(written).not.toHaveProperty('gradedResult');   // durable grading untouched
    expect(written.projectedEvidenceCount).toBe(0);
  });
});

describe('missing evidence is still an anomaly, not an empty submission', () => {
  it('attempts claimed but no per-question rows stays PENDING and loud', async () => {
    process.env.ENABLE_MASTERY = 'true';
    mockGet.mockResolvedValue(session({
      gradedQuestions: [],
      gradedResult: { attemptId: ATT, totalQuestions: 4, attempted: 4, correctCount: 1 },
    }));
    const r = await svc.reconcileUser('u1');

    expect(r.projected).toBe(false);
    expect(r.reason).toBe('NO_EVIDENCE');
    expect(mockSet).not.toHaveBeenCalled();
  });
});
