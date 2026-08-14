/**
 * Phase 3G: class assignments built on the existing quiz engine.
 *
 * `quizGeneratorService` calls a real Gemini provider and `quizAttemptsService` is a mature,
 * independently-owned system — both are mocked at the module boundary rather than exercised for
 * real (unlike Phase 3F's notebook tests, there is no safe way to let an LLM call run in a unit
 * test). What IS exercised for real is every ownership, visibility and — most importantly —
 * privacy-scoping decision this file's own service makes, using the same in-memory Firestore
 * stand-in pattern as the other class-scoped test suites.
 */

jest.mock('firebase-admin', () => ({
  firestore: { FieldValue: { serverTimestamp: () => '__ts__' } },
}));

const store: Record<string, Record<string, any>> = {
  classes: {}, classAssignments: {}, classAssignmentAttempts: {}, classEnrollments: {},
};

function makeDoc(col: string, id: string) {
  return {
    id,
    get: async () => ({ exists: !!store[col][id], data: () => store[col][id] }),
    set: async (v: any) => { store[col][id] = v; },
    update: async (v: any) => { store[col][id] = { ...(store[col][id] || {}), ...v }; },
  };
}
let autoId = 0;
function makeCollection(col: string) {
  const filters: [string, any][] = [];
  const q: any = {
    doc: (id?: string) => makeDoc(col, id ?? `auto_${++autoId}`),
    where(field: string, _op: string, value: any) { filters.push([field, value]); return q; },
    orderBy() { return q; },
    get: async () => ({
      docs: Object.values(store[col])
        .filter((d: any) => filters.every(([f, v]) => d[f] === v))
        .map((d: any) => ({ data: () => d })),
    }),
  };
  return q;
}

jest.mock('../../src/config/firebase', () => ({
  auth: { getUser: jest.fn() },
  db: { collection: (c: string) => makeCollection(c) },
}));

jest.mock('../../src/services/tests/quizGenerator.service', () => ({
  quizGeneratorService: { generateWeakAreaQuiz: jest.fn() },
}));

jest.mock('../../src/services/tests/quizAttempts.service', () => ({
  quizAttemptsService: { createFromQuestions: jest.fn() },
}));

jest.mock('../../src/repositories/quizAttempts.repository', () => ({
  quizAttemptsRepository: { getById: jest.fn() },
}));

import {
  ASSIGNMENT_STATUSES,
  ASSIGNMENT_TRANSITIONS,
  canTransitionAssignment,
  isAssignmentVisibleToMembers,
  isAssignmentStartable,
  AssignmentStatus,
} from '../../src/types/classAssignment';
import { classAssignmentService } from '../../src/services/classAssignment.service';
import { quizGeneratorService } from '../../src/services/tests/quizGenerator.service';
import { quizAttemptsService } from '../../src/services/tests/quizAttempts.service';
import { quizAttemptsRepository } from '../../src/repositories/quizAttempts.repository';

const TEACHER = 'teacher-1';
const STUDENT = 'student-1';
const STUDENT_2 = 'student-2';
const CLASS = 'class-1';

function seedClass(over: Record<string, any> = {}) {
  store.classes[CLASS] = { id: CLASS, ownerUid: TEACHER, title: 'Maths', status: 'published', ...over };
}
function seedActive(uid: string, over: Record<string, any> = {}) {
  store.classEnrollments[`${CLASS}_${uid}`] = { classId: CLASS, studentUid: uid, teacherUid: TEACHER, state: 'ACTIVE', ...over };
}
const GENERATED = [
  { id: 'q1', text: 'Q1', topic: 'Optics', options: ['a', 'b', 'c', 'd'], correctAnswerIndex: 0, explanation: 'e1' },
  { id: 'q2', text: 'Q2', topic: 'Optics', options: ['a', 'b', 'c', 'd'], correctAnswerIndex: 1, explanation: 'e2' },
];

beforeEach(() => {
  store.classes = {}; store.classAssignments = {}; store.classAssignmentAttempts = {}; store.classEnrollments = {};
  autoId = 0;
  jest.clearAllMocks();
  (quizGeneratorService.generateWeakAreaQuiz as jest.Mock).mockResolvedValue({ focus: 'Optics', questions: GENERATED });
});

/* ── The machine ───────────────────────────────────────────────────────────────────── */

describe('assignment lifecycle', () => {
  it('permits exactly draft→published→closed', () => {
    expect(canTransitionAssignment('draft', 'published')).toBe(true);
    expect(canTransitionAssignment('published', 'closed')).toBe(true);
  });

  it('refuses skipping straight from draft to closed', () => {
    expect(canTransitionAssignment('draft', 'closed')).toBe(false);
  });

  it('treats closed as terminal', () => {
    expect(ASSIGNMENT_TRANSITIONS.closed).toEqual([]);
  });

  it('never permits a self-transition', () => {
    for (const s of ASSIGNMENT_STATUSES) expect(canTransitionAssignment(s, s)).toBe(false);
  });

  it('refuses undeclared transitions, exhaustively', () => {
    for (const from of ASSIGNMENT_STATUSES) {
      for (const to of ASSIGNMENT_STATUSES) {
        expect(canTransitionAssignment(from, to)).toBe(ASSIGNMENT_TRANSITIONS[from].includes(to));
      }
    }
  });

  it('hides drafts from members; shows published and closed', () => {
    for (const s of ASSIGNMENT_STATUSES) {
      expect(isAssignmentVisibleToMembers(s)).toBe(s === 'published' || s === 'closed');
    }
  });

  it('is startable only while published — not draft, not closed', () => {
    for (const s of ASSIGNMENT_STATUSES) expect(isAssignmentStartable(s)).toBe(s === 'published');
  });
});

/* ── Create ────────────────────────────────────────────────────────────────────────── */

describe('create', () => {
  it('generates once, as the teacher, with the explicit topic — never the personalized weak-area path', async () => {
    seedClass();
    await classAssignmentService.create(CLASS, TEACHER, { topic: 'Optics', count: 5 });
    expect(quizGeneratorService.generateWeakAreaQuiz).toHaveBeenCalledTimes(1);
    expect(quizGeneratorService.generateWeakAreaQuiz).toHaveBeenCalledWith(TEACHER, expect.objectContaining({ topic: 'Optics' }));
  });

  it('stores the generated set as a draft with a matching question count', async () => {
    seedClass();
    const record = await classAssignmentService.create(CLASS, TEACHER, { topic: 'Optics' });
    expect(record.status).toBe('draft');
    expect(record.totalQuestions).toBe(GENERATED.length);
    expect(record.questions).toHaveLength(GENERATED.length);
  });

  it('rejects a missing topic without ever calling the generator', async () => {
    seedClass();
    await expect(classAssignmentService.create(CLASS, TEACHER, {})).rejects.toMatchObject({ code: 'INVALID_INPUT' });
    expect(quizGeneratorService.generateWeakAreaQuiz).not.toHaveBeenCalled();
  });

  it("refuses a class the caller doesn't own", async () => {
    seedClass({ ownerUid: 'someone-else' });
    await expect(classAssignmentService.create(CLASS, TEACHER, { topic: 'Optics' }))
      .rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('fails cleanly when generation returns nothing', async () => {
    (quizGeneratorService.generateWeakAreaQuiz as jest.Mock).mockResolvedValueOnce({ focus: 'x', questions: [] });
    seedClass();
    await expect(classAssignmentService.create(CLASS, TEACHER, { topic: 'Optics' }))
      .rejects.toMatchObject({ code: 'GENERATION_FAILED' });
  });

  it('clamps an out-of-range question count and duration into bounds', async () => {
    seedClass();
    const record = await classAssignmentService.create(CLASS, TEACHER, { topic: 'Optics', count: 999, durationMinutes: 1 });
    // The generator mock itself always returns GENERATED regardless of requested count, but the
    // clamped `count` is what must have been PASSED to it.
    expect((quizGeneratorService.generateWeakAreaQuiz as jest.Mock).mock.calls[0][1].count).toBeLessThanOrEqual(20);
    expect(record.durationMinutes).toBeGreaterThanOrEqual(5);
  });
});

/* ── List / visibility ─────────────────────────────────────────────────────────────── */

describe('listForClass', () => {
  it('shows the owner every state, including drafts', async () => {
    seedClass();
    await classAssignmentService.create(CLASS, TEACHER, { topic: 'Optics' });
    const list = await classAssignmentService.listForClass(CLASS, TEACHER);
    expect(list).toHaveLength(1);
    expect(list[0].status).toBe('draft');
  });

  it('hides a draft from an active member', async () => {
    seedClass(); seedActive(STUDENT);
    await classAssignmentService.create(CLASS, TEACHER, { topic: 'Optics' });
    await expect(classAssignmentService.listForClass(CLASS, STUDENT)).resolves.toHaveLength(0);
  });

  it('shows a published assignment to an active member', async () => {
    seedClass(); seedActive(STUDENT);
    const created = await classAssignmentService.create(CLASS, TEACHER, { topic: 'Optics' });
    await classAssignmentService.setStatus(CLASS, created.id, TEACHER, 'published');
    await expect(classAssignmentService.listForClass(CLASS, STUDENT)).resolves.toHaveLength(1);
  });

  it('never leaks the answer key to anyone, owner included', async () => {
    seedClass();
    await classAssignmentService.create(CLASS, TEACHER, { topic: 'Optics' });
    const list = await classAssignmentService.listForClass(CLASS, TEACHER);
    expect((list[0] as any).questions).toBeUndefined();
  });

  it('refuses a stranger even though the class exists', async () => {
    seedClass();
    await expect(classAssignmentService.listForClass(CLASS, 'stranger')).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });
});

/* ── setStatus ─────────────────────────────────────────────────────────────────────── */

describe('setStatus', () => {
  it('publishes and stamps publishedAt', async () => {
    seedClass();
    const created = await classAssignmentService.create(CLASS, TEACHER, { topic: 'Optics' });
    const published = await classAssignmentService.setStatus(CLASS, created.id, TEACHER, 'published');
    expect(published.status).toBe('published');
    expect(published.publishedAt).toBe('__ts__');
  });

  it('refuses a non-owner', async () => {
    seedClass();
    const created = await classAssignmentService.create(CLASS, TEACHER, { topic: 'Optics' });
    await expect(classAssignmentService.setStatus(CLASS, created.id, 'someone-else', 'published'))
      .rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('refuses an undeclared jump', async () => {
    seedClass();
    const created = await classAssignmentService.create(CLASS, TEACHER, { topic: 'Optics' });
    await expect(classAssignmentService.setStatus(CLASS, created.id, TEACHER, 'closed'))
      .rejects.toMatchObject({ code: 'INVALID_TRANSITION' });
  });
});

/* ── startAttempt ──────────────────────────────────────────────────────────────────── */

describe('startAttempt', () => {
  async function publishedAssignment() {
    seedClass();
    const created = await classAssignmentService.create(CLASS, TEACHER, { topic: 'Optics' });
    await classAssignmentService.setStatus(CLASS, created.id, TEACHER, 'published');
    return created;
  }

  it('refuses to start a draft assignment', async () => {
    seedClass(); seedActive(STUDENT);
    const created = await classAssignmentService.create(CLASS, TEACHER, { topic: 'Optics' });
    await expect(classAssignmentService.startAttempt(CLASS, created.id, STUDENT)).rejects.toMatchObject({ code: 'NOT_OPEN' });
    expect(quizAttemptsService.createFromQuestions).not.toHaveBeenCalled();
  });

  it('refuses a non-member, even for a published assignment', async () => {
    const created = await publishedAssignment();
    await expect(classAssignmentService.startAttempt(CLASS, created.id, 'stranger')).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it("creates the student's attempt from the FIXED question set, not a fresh generation", async () => {
    seedActive(STUDENT);
    const created = await publishedAssignment();
    (quizAttemptsService.createFromQuestions as jest.Mock).mockResolvedValue({ id: 'qa_1' });

    const result = await classAssignmentService.startAttempt(CLASS, created.id, STUDENT);

    expect(result.quizAttemptId).toBe('qa_1');
    expect(quizAttemptsService.createFromQuestions).toHaveBeenCalledWith(
      STUDENT, created.questions, expect.objectContaining({ topic: 'Optics' }),
    );
  });

  it('is idempotent — a second start returns the same attempt without creating another', async () => {
    seedActive(STUDENT);
    const created = await publishedAssignment();
    (quizAttemptsService.createFromQuestions as jest.Mock).mockResolvedValue({ id: 'qa_1' });

    const first = await classAssignmentService.startAttempt(CLASS, created.id, STUDENT);
    const second = await classAssignmentService.startAttempt(CLASS, created.id, STUDENT);

    expect(second.quizAttemptId).toBe(first.quizAttemptId);
    expect(quizAttemptsService.createFromQuestions).toHaveBeenCalledTimes(1);
  });

  it('gives two different students two different attempts from the same fixed set', async () => {
    seedActive(STUDENT); seedActive(STUDENT_2);
    const created = await publishedAssignment();
    (quizAttemptsService.createFromQuestions as jest.Mock)
      .mockResolvedValueOnce({ id: 'qa_student1' })
      .mockResolvedValueOnce({ id: 'qa_student2' });

    const a = await classAssignmentService.startAttempt(CLASS, created.id, STUDENT);
    const b = await classAssignmentService.startAttempt(CLASS, created.id, STUDENT_2);

    expect(a.quizAttemptId).not.toBe(b.quizAttemptId);
  });
});

/* ── getResults — the highest-privacy-risk aggregation in this codebase ─────────────── */

describe('getResults', () => {
  async function publishedWithAttempts(students: string[]) {
    seedClass();
    for (const s of students) seedActive(s);
    const created = await classAssignmentService.create(CLASS, TEACHER, { topic: 'Optics' });
    await classAssignmentService.setStatus(CLASS, created.id, TEACHER, 'published');

    let n = 0;
    (quizAttemptsService.createFromQuestions as jest.Mock).mockImplementation(async () => ({ id: `qa_${++n}` }));
    for (const s of students) await classAssignmentService.startAttempt(CLASS, created.id, s);

    return created;
  }

  it('refuses a non-owner outright', async () => {
    const created = await publishedWithAttempts([STUDENT]);
    await expect(classAssignmentService.getResults(CLASS, created.id, 'someone-else'))
      .rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  // The single most important test in this phase.
  it('excludes a student who completed the assignment and then left the class', async () => {
    const created = await publishedWithAttempts([STUDENT, STUDENT_2]);

    (quizAttemptsRepository.getById as jest.Mock).mockImplementation(async (id: string) => ({
      id, status: 'completed', score: 8, maxMarks: 10, accuracy: 80, correctCount: 8,
      topicBreakdown: [{ topic: 'Optics', correct: 8, incorrect: 2, unattempted: 0, total: 10, accuracy: 80 }],
    }));

    // STUDENT_2 leaves after completing the test.
    store.classEnrollments[`${CLASS}_${STUDENT_2}`].state = 'LEFT';

    const results = await classAssignmentService.getResults(CLASS, created.id, TEACHER);

    expect(results.students.map((s) => s.studentUid)).toEqual([STUDENT]);
    expect(results.started).toBe(1);
    expect(results.completed).toBe(1);
  });

  it('never queries an attempt id that was not resolved through this class’s own pointers', async () => {
    const created = await publishedWithAttempts([STUDENT]);
    (quizAttemptsRepository.getById as jest.Mock).mockResolvedValue({ status: 'in-progress' });

    await classAssignmentService.getResults(CLASS, created.id, TEACHER);

    const queriedIds = (quizAttemptsRepository.getById as jest.Mock).mock.calls.map((c) => c[0]);
    expect(queriedIds).toEqual(['qa_1']); // exactly the id startAttempt produced — nothing else
  });

  it('computes class average only from completed attempts, ignoring in-progress ones', async () => {
    const created = await publishedWithAttempts([STUDENT, STUDENT_2]);
    (quizAttemptsRepository.getById as jest.Mock)
      .mockResolvedValueOnce({ status: 'completed', accuracy: 80, score: 8 })
      .mockResolvedValueOnce({ status: 'in-progress' });

    const results = await classAssignmentService.getResults(CLASS, created.id, TEACHER);

    expect(results.averageAccuracy).toBe(80); // not diluted by the in-progress student
    expect(results.completed).toBe(1);
    expect(results.started).toBe(2);
  });

  it('returns null averages rather than NaN when nobody has completed it yet', async () => {
    const created = await publishedWithAttempts([STUDENT]);
    (quizAttemptsRepository.getById as jest.Mock).mockResolvedValue({ status: 'in-progress' });

    const results = await classAssignmentService.getResults(CLASS, created.id, TEACHER);

    expect(results.averageAccuracy).toBeNull();
    expect(results.averageScore).toBeNull();
  });

  it('averages topic accuracy across completed attempts', async () => {
    const created = await publishedWithAttempts([STUDENT, STUDENT_2]);
    (quizAttemptsRepository.getById as jest.Mock)
      .mockResolvedValueOnce({
        status: 'completed', accuracy: 80, score: 8,
        topicBreakdown: [{ topic: 'Optics', correct: 8, incorrect: 2, unattempted: 0, total: 10, accuracy: 80 }],
      })
      .mockResolvedValueOnce({
        status: 'completed', accuracy: 60, score: 6,
        topicBreakdown: [{ topic: 'Optics', correct: 6, incorrect: 4, unattempted: 0, total: 10, accuracy: 60 }],
      });

    const results = await classAssignmentService.getResults(CLASS, created.id, TEACHER);

    expect(results.topicAverages).toEqual([{ topic: 'Optics', averageAccuracy: 70, studentsAttempted: 2 }]);
  });
});
