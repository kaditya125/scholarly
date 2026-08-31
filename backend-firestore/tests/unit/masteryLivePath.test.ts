/**
 * THE COMPLETE LIVE MASTERY PATH — real student quiz submission through to a persisted record.
 *
 * ── THE DEFECT THESE PIN ──────────────────────────────────────────────────────────────────
 * Mastery subscribed to `learning.test_completed` only. That event is published by the tests
 * subsystem (resultAnalysis) and by baseline reconciliation — neither of which is on the path a
 * student actually walks. The live path is the quiz one: the frontend posts to
 * /quiz/attempts/:id/submit, which reaches quizAttempts.submitAttempt and publishes
 * `learning.quiz_completed`. Nothing consumed that event for mastery.
 *
 * The failure mode was silent and total. Enabling ENABLE_MASTERY would have deployed cleanly,
 * passed every health check, and written mastery for nobody — because the event carrying real
 * student evidence had no mastery subscriber. Worse, that event did not even carry the per-topic
 * breakdown: it was computed, persisted to the attempt, and then dropped from the payload.
 *
 * ── WHY THESE DRIVE THE REAL SERVICE ──────────────────────────────────────────────────────
 * Publishing a synthetic `learning.quiz_completed` and asserting the subscriber reacts would
 * prove only that a subscriber exists. It would NOT prove that the real submission publishes an
 * event of that shape — which is exactly the half that was broken. So these call the actual
 * quizAttempts.submitAttempt, over the actual EventBus (in-process under NODE_ENV=test), into the
 * actual registered subscriber, into a real MasteryEngine. Only Firestore and the unrelated
 * side-effect services are faked.
 */

// uuid ships ESM-only and is not transformed by ts-jest; stubbed as elsewhere in this suite.
jest.mock('uuid', () => ({ v4: () => '00000000-0000-4000-8000-000000000000' }));

// ── the mastery store: real engine, in-memory backing ────────────────────────────────────
// `mock`-prefixed so jest permits the reference inside the hoisted factory below.
const mockRecords = new Map<string, any>();
const mockRecordKey = (userId: string, conceptId: string) => `${userId}::${conceptId}`;

jest.mock('../../src/core/intelligence/MasteryEngine', () => {
  const actual = jest.requireActual('../../src/core/intelligence/MasteryEngine');
  /*
   * No `transact`, deliberately — MasteryEngine falls back to get()+set() and its dedup check
   * still runs inside the same mutate closure, so idempotency is exercised for real. What this
   * cannot cover is genuine write contention, which is Firestore's concern and is covered by
   * masteryEngine's own suite.
   */
  const store = {
    async get(userId: string, conceptId: string) {
      return mockRecords.get(mockRecordKey(userId, conceptId)) || null;
    },
    async set(userId: string, m: any) {
      mockRecords.set(mockRecordKey(userId, m.conceptId), m);
    },
    async list(userId: string) {
      return [...mockRecords.entries()]
        .filter(([k]) => k.startsWith(`${userId}::`))
        .map(([, v]) => v);
    },
  };
  return { ...actual, masteryEngine: new actual.MasteryEngine(store) };
});

// ── the gate, controllable per test ──────────────────────────────────────────────────────
let mockGateAnswer: (userId?: string) => boolean = () => true;
jest.mock('../../src/services/masteryGate', () => ({
  MASTERY_FLAG: 'mastery',
  isMasteryEnabledFor: async (userId?: string) => mockGateAnswer(userId),
}));

// ── Firestore stand-ins ──────────────────────────────────────────────────────────────────
const mockQuizAttempts = new Map<string, any>();
jest.mock('../../src/repositories/quizAttempts.repository', () => ({
  quizAttemptsRepository: {
    async getById(id: string) { return mockQuizAttempts.get(id) || null; },
    async update(id: string, patch: any) {
      mockQuizAttempts.set(id, { ...mockQuizAttempts.get(id), ...patch });
    },
    async create(a: any) { mockQuizAttempts.set(a.id, a); },
    async listByUser() { return []; },
  },
}));

// Best-effort enrichment on the submission path; not under test, but must not throw synchronously.
jest.mock('../../src/services/userStats.service', () => ({
  UserStatsService: class {
    async awardXP() { /* no-op */ }
    async getUserStats() { return {}; }
  },
}));
jest.mock('../../src/repositories/userStats.repository', () => ({
  UserStatsRepository: class {
    async getUserStats() { return null; }
    async upsertUserStats() { /* no-op */ }
  },
}));
jest.mock('../../src/services/planner.service', () => ({
  PlannerService: class { async addTask() { /* no-op */ } },
}));
jest.mock('../../src/utils/logger', () => ({
  logger: { info: () => {}, warn: () => {}, error: () => {}, debug: () => {} },
}));

import { eventBus } from '../../src/core/events/EventBus';
import { registerEventSubscribers } from '../../src/core/events/subscribers';
import { quizAttemptsService } from '../../src/services/tests/quizAttempts.service';
import { masteryKeyForNode } from '../../src/services/learning/nodeMastery.service';
import { slugifyConcept } from '../../src/core/intelligence/MasteryEngine';

/*
 * The first submission pays a one-off module-load cost (firebase-admin, the syllabus graph chain
 * pulled in by nodeMastery.service) that exceeds jest's 5s default. Every later test in the file
 * runs in milliseconds; this raises the ceiling rather than masking a slow code path.
 */
jest.setTimeout(30000);

const STUDENT_A = 'student-a-uid';
const STUDENT_B = 'student-b-uid';

/** Canonical node id: type:examId:cycleId:syllabusId:slug:fingerprint */
const NODE_KINEMATICS = 'TOPIC:jee-main:2026:v1:kinematics:a1b2c3';
const KEY_KINEMATICS = masteryKeyForNode(NODE_KINEMATICS);
const KEY_UNANCHORED = slugifyConcept('Mixed Revision');

/**
 * A submission with BOTH kinds of evidence:
 *   - an anchored topic: 3 answered (2 right, 1 wrong)
 *   - an unanchored topic: 2 questions, 1 answered correctly, 1 left blank
 */
const buildAttempt = (id: string, userId: string) => ({
  id,
  userId,
  status: 'in_progress',
  title: 'Practice Set',
  notebookTitle: 'Physics',
  topic: 'Mechanics',
  totalQuestions: 5,
  positiveMark: 1,
  negativeMark: 0.25,
  questions: [
    { id: 'q1', topic: 'Kinematics', syllabusNodeId: NODE_KINEMATICS, identityStatus: 'CANONICAL', correctAnswerIndex: 0 },
    { id: 'q2', topic: 'Kinematics', syllabusNodeId: NODE_KINEMATICS, identityStatus: 'CANONICAL', correctAnswerIndex: 1 },
    { id: 'q3', topic: 'Kinematics', syllabusNodeId: NODE_KINEMATICS, identityStatus: 'CANONICAL', correctAnswerIndex: 2 },
    { id: 'q4', topic: 'Mixed Revision', correctAnswerIndex: 0 },
    { id: 'q5', topic: 'Mixed Revision', correctAnswerIndex: 3 },
  ],
});

/** q1,q2 right; q3 wrong; q4 right; q5 not answered. */
const ANSWERS = { q1: 0, q2: 1, q3: 0, q4: 0 };

/**
 * `submitAttempt` fires the publish with `void` — it deliberately does not await delivery, so the
 * student's response is never blocked on mastery. Draining the queue here is what lets the
 * assertions observe the completed write.
 */
const flush = async () => {
  for (let i = 0; i < 12; i++) await new Promise((r) => setImmediate(r));
};

const record = (userId: string, key: string) => mockRecords.get(mockRecordKey(userId, key));

beforeAll(() => {
  // The real bootstrap registration — the same call server.ts makes.
  registerEventSubscribers();
});

beforeEach(() => {
  mockRecords.clear();
  mockQuizAttempts.clear();
  mockGateAnswer = () => true;
  mockQuizAttempts.set('attempt-1', buildAttempt('attempt-1', STUDENT_A));
});

describe('the live quiz path reaches mastery at all', () => {
  it('THE REGRESSION: a real submission writes a mastery record', async () => {
    await quizAttemptsService.submitAttempt(STUDENT_A, 'attempt-1', { answers: ANSWERS });
    await flush();

    // Before the fix this was empty: quiz_completed had no mastery subscriber, and carried no
    // topicBreakdown for one to read even if it had.
    expect(mockRecords.size).toBeGreaterThan(0);
    expect(record(STUDENT_A, KEY_KINEMATICS)).toBeDefined();
  });

  it('a quiz_completed subscriber is actually registered', () => {
    const handlers = (eventBus as any).handlers.get('learning.quiz_completed') as Set<unknown>;
    expect(handlers?.size ?? 0).toBeGreaterThan(0);
  });

  it('the submission publishes the breakdown and a deterministic event id', async () => {
    let seen: any = null;
    let seenMeta: any = null;
    eventBus.subscribe('learning.quiz_completed', async (p, meta) => { seen = p; seenMeta = meta; });

    await quizAttemptsService.submitAttempt(STUDENT_A, 'attempt-1', { answers: ANSWERS });
    await flush();

    // The breakdown is what mastery needs; aggregates alone cannot name a syllabus node.
    expect(Array.isArray(seen.topicBreakdown)).toBe(true);
    expect(seen.topicBreakdown).toHaveLength(2);
    expect(seen.topicBreakdown.find((r: any) => r.syllabusNodeId === NODE_KINEMATICS)).toBeDefined();
    // Derived from the attempt, not random — a redelivery must carry the SAME id to be deduped.
    expect(seenMeta.eventId).toBe('learning.quiz_completed:attempt-1');
  });
});

describe('the evidence is counted correctly for the quiz row shape', () => {
  it('records 3 attempts and 2 successes on the anchored topic', async () => {
    /*
     * This is the assertion that catches a shape mix-up. quiz_completed rows carry
     * correct/incorrect/unattempted; test_completed rows carry attempted/correct/skipped. Reading
     * `attempted` off a quiz row yields undefined, and `Array(undefined - correct)` is
     * `Array(NaN)` — a RangeError swallowed by the subscriber's catch, losing the evidence
     * silently. Exact counts prove the normalisation ran.
     */
    await quizAttemptsService.submitAttempt(STUDENT_A, 'attempt-1', { answers: ANSWERS });
    await flush();

    const m = record(STUDENT_A, KEY_KINEMATICS);
    expect(m.attempts).toBe(3);
    expect(m.successCount).toBe(2);
  });

  it('excludes unanswered questions rather than scoring them as wrong', async () => {
    // The unanchored topic had 2 questions: one answered correctly, one left blank. Counting the
    // blank as incorrect would understate a student who simply ran out of time.
    await quizAttemptsService.submitAttempt(STUDENT_A, 'attempt-1', { answers: ANSWERS });
    await flush();

    const m = record(STUDENT_A, KEY_UNANCHORED);
    expect(m.attempts).toBe(1);
    expect(m.successCount).toBe(1);
  });

  it('a correct answer raises mastery above the 0.5 neutral start', async () => {
    await quizAttemptsService.submitAttempt(STUDENT_A, 'attempt-1', { answers: ANSWERS });
    await flush();
    expect(record(STUDENT_A, KEY_UNANCHORED).masteryScore).toBeGreaterThan(0.5);
  });
});

describe('node identity', () => {
  it('keys on the canonical syllabus node, losslessly — not on the label', async () => {
    await quizAttemptsService.submitAttempt(STUDENT_A, 'attempt-1', { answers: ANSWERS });
    await flush();

    expect(record(STUDENT_A, KEY_KINEMATICS)).toBeDefined();
    // "Algebra"-style label keys collide across exams; the label slug must NOT be used when a
    // node is present.
    expect(record(STUDENT_A, slugifyConcept('Kinematics'))).toBeUndefined();
    // The disambiguating fingerprint is the last segment and must survive the derivation.
    expect(KEY_KINEMATICS).toContain('a1b2c3');
  });

  it('unanchored evidence falls back to the label slug and is never malformed', async () => {
    await quizAttemptsService.submitAttempt(STUDENT_A, 'attempt-1', { answers: ANSWERS });
    await flush();

    const m = record(STUDENT_A, KEY_UNANCHORED);
    expect(m).toBeDefined();
    expect(m.syllabusNodeId).toBeUndefined();
    // No "undefined"/"null" smuggled into a document id, and no invented syllabus location.
    for (const key of mockRecords.keys()) {
      expect(key).not.toMatch(/undefined|null|NaN/);
    }
  });

  it('a row with no topic at all is skipped, not written under a placeholder', async () => {
    mockQuizAttempts.set('attempt-blank', {
      ...buildAttempt('attempt-blank', STUDENT_A),
      questions: [{ id: 'q1', topic: '', correctAnswerIndex: 0 }],
      totalQuestions: 1,
    });
    await quizAttemptsService.submitAttempt(STUDENT_A, 'attempt-blank', { answers: { q1: 0 } });
    await flush();

    // submitAttempt defaults a blank topic to 'General'; what must not happen is a record keyed on
    // an empty or undefined concept id.
    for (const key of mockRecords.keys()) {
      expect(key.split('::')[1]).toBeTruthy();
    }
  });
});

describe('exactly once', () => {
  it('one submission produces one logical mastery update per concept', async () => {
    await quizAttemptsService.submitAttempt(STUDENT_A, 'attempt-1', { answers: ANSWERS });
    await flush();

    const after = record(STUDENT_A, KEY_KINEMATICS);
    expect(after.attempts).toBe(3);
    // Two concepts in this submission, and exactly two documents — not one per question.
    expect(mockRecords.size).toBe(2);
  });

  it('a redelivery of the same completion event is deduplicated', async () => {
    await quizAttemptsService.submitAttempt(STUDENT_A, 'attempt-1', { answers: ANSWERS });
    await flush();
    const before = { ...record(STUDENT_A, KEY_KINEMATICS) };

    /*
     * Replays the exact event the submission published, deterministic id and all — the shape a
     * retry, a restart, or a duplicate bus delivery would take. With the random event id this
     * path used to get, this second delivery would have counted as fresh evidence and doubled the
     * student's attempts.
     */
    await eventBus.publish('learning.quiz_completed', {
      userId: STUDENT_A,
      attemptId: 'attempt-1',
      subject: 'Physics',
      totalQuestions: 5,
      correctCount: 3,
      skippedCount: 1,
      accuracy: 60,
      topicBreakdown: [{
        topic: 'Kinematics', correct: 2, incorrect: 1, unattempted: 0, total: 3, accuracy: 67,
        syllabusNodeId: NODE_KINEMATICS, identityStatus: 'CANONICAL' as const,
      }],
      occurredAt: Date.now(),
    }, { eventId: 'learning.quiz_completed:attempt-1' });
    await flush();

    const after = record(STUDENT_A, KEY_KINEMATICS);
    expect(after.attempts).toBe(before.attempts);
    expect(after.successCount).toBe(before.successCount);
    expect(after.masteryScore).toBe(before.masteryScore);
  });

  it('resubmitting a completed attempt does not republish or recount', async () => {
    await quizAttemptsService.submitAttempt(STUDENT_A, 'attempt-1', { answers: ANSWERS });
    await flush();
    const before = record(STUDENT_A, KEY_KINEMATICS).attempts;

    await quizAttemptsService.submitAttempt(STUDENT_A, 'attempt-1', { answers: ANSWERS });
    await flush();

    expect(record(STUDENT_A, KEY_KINEMATICS).attempts).toBe(before);
  });

  it('a quiz attempt and a test attempt sharing an id cannot dedupe against each other', async () => {
    /*
     * The two id spaces are disjoint by prefix. If they were not, a test attempt that happened to
     * share an id with a quiz attempt would silently suppress the second student's evidence.
     */
    await quizAttemptsService.submitAttempt(STUDENT_A, 'attempt-1', { answers: ANSWERS });
    await flush();
    const afterQuiz = record(STUDENT_A, KEY_KINEMATICS).attempts;

    await eventBus.publish('learning.test_completed', {
      userId: STUDENT_A,
      attemptId: 'attempt-1',
      testId: 'test-1',
      subject: 'Physics',
      totalQuestions: 3,
      correctCount: 3,
      skippedCount: 0,
      accuracy: 100,
      topicBreakdown: [{
        topic: 'Kinematics', attempted: 3, correct: 3, skipped: 0,
        syllabusNodeId: NODE_KINEMATICS, identityStatus: 'CANONICAL' as const,
      }],
      occurredAt: Date.now(),
    }, { eventId: 'learning.test_completed:attempt-1' });
    await flush();

    expect(record(STUDENT_A, KEY_KINEMATICS).attempts).toBe(afterQuiz + 3);
  });
});

describe('user isolation', () => {
  it('a student\'s submission writes only to their own record', async () => {
    await quizAttemptsService.submitAttempt(STUDENT_A, 'attempt-1', { answers: ANSWERS });
    await flush();

    expect(record(STUDENT_A, KEY_KINEMATICS)).toBeDefined();
    expect(record(STUDENT_B, KEY_KINEMATICS)).toBeUndefined();
    // Never a shared/global document — every key is namespaced by uid.
    for (const key of mockRecords.keys()) expect(key.startsWith(`${STUDENT_A}::`)).toBe(true);
  });

  it('student B\'s identical quiz does not move student A\'s mastery', async () => {
    await quizAttemptsService.submitAttempt(STUDENT_A, 'attempt-1', { answers: ANSWERS });
    await flush();
    const aBefore = { ...record(STUDENT_A, KEY_KINEMATICS) };

    mockQuizAttempts.set('attempt-2', buildAttempt('attempt-2', STUDENT_B));
    await quizAttemptsService.submitAttempt(STUDENT_B, 'attempt-2', { answers: { q1: 9, q2: 9, q3: 9 } });
    await flush();

    expect(record(STUDENT_B, KEY_KINEMATICS)).toBeDefined();
    expect(record(STUDENT_A, KEY_KINEMATICS).attempts).toBe(aBefore.attempts);
    expect(record(STUDENT_A, KEY_KINEMATICS).masteryScore).toBe(aBefore.masteryScore);
  });

  it('the live route rejects a submission for someone else\'s attempt', async () => {
    // getAttempt(userId, id) is the guard: 404, not 403, so existence is not disclosed.
    await expect(quizAttemptsService.submitAttempt(STUDENT_B, 'attempt-1', { answers: ANSWERS }))
      .rejects.toMatchObject({ status: 404 });
    await flush();

    // The attacker's call produced no evidence for either party.
    expect(mockRecords.size).toBe(0);
  });
});

describe('the gate still governs the live path', () => {
  it('writes nothing when mastery is disabled for the student', async () => {
    mockGateAnswer = () => false;

    await quizAttemptsService.submitAttempt(STUDENT_A, 'attempt-1', { answers: ANSWERS });
    await flush();

    expect(mockRecords.size).toBe(0);
  });

  it('a per-student grant does not leak to other students', async () => {
    mockGateAnswer = (uid) => uid === STUDENT_A;

    await quizAttemptsService.submitAttempt(STUDENT_A, 'attempt-1', { answers: ANSWERS });
    mockQuizAttempts.set('attempt-2', buildAttempt('attempt-2', STUDENT_B));
    await quizAttemptsService.submitAttempt(STUDENT_B, 'attempt-2', { answers: ANSWERS });
    await flush();

    expect(record(STUDENT_A, KEY_KINEMATICS)).toBeDefined();
    expect(record(STUDENT_B, KEY_KINEMATICS)).toBeUndefined();
  });

  it('the submission still succeeds when mastery is off — it is never load-bearing', async () => {
    mockGateAnswer = () => false;
    const result = await quizAttemptsService.submitAttempt(STUDENT_A, 'attempt-1', { answers: ANSWERS });
    expect(result.status).toBe('completed');
    expect(result.correctCount).toBe(3);
  });
});
