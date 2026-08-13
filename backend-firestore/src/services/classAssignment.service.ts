import * as admin from 'firebase-admin';
import { db } from '../config/firebase';
import { classRepository } from '../repositories/class.repository';
import { classAssignmentRepository } from '../repositories/classAssignment.repository';
import { quizAttemptsRepository } from '../repositories/quizAttempts.repository';
import { quizGeneratorService } from './tests/quizGenerator.service';
import { quizAttemptsService } from './tests/quizAttempts.service';
import {
  AssignmentAttemptPointer,
  AssignmentResultRow,
  AssignmentResults,
  AssignmentTopicAverage,
  ClassAssignmentRecord,
  CreateAssignmentInput,
  MAX_ASSIGNMENT_TITLE,
  MAX_ASSIGNMENT_TOPIC,
  MAX_DURATION_MIN,
  MAX_QUESTIONS,
  MIN_DURATION_MIN,
  MIN_QUESTIONS,
  assignmentAttemptId,
  canTransitionAssignment,
  isAssignmentStartable,
  isAssignmentVisibleToMembers,
} from '../types/classAssignment';
import { AssignmentStatus } from '../types/classAssignment';
import { logger } from '../utils/logger';

type CodedError = Error & { code: string; [k: string]: any };
const fail = (code: string, message: string, extra: Record<string, any> = {}): never => {
  throw Object.assign(new Error(message), { code, ...extra }) as CodedError;
};

/**
 * ClassAssignmentService — teacher-set tests built on the existing AI quiz engine.
 *
 * See types/classAssignment.ts for the full design rationale. The short version: this service
 * generates a fixed question set ONCE and hands out identical copies via
 * `quizAttemptsService.createFromQuestions()` (unmodified) — it does not generate questions,
 * score answers, or mask answer keys itself. The one place this service does genuinely new
 * work is `getResults()`, which aggregates across students for the owning teacher — the single
 * highest-privacy-risk operation in this entire codebase, because it is the one place a
 * teacher's request legitimately reads OTHER PEOPLE's data. See its own comment for the two
 * checks that make that safe.
 */
export class ClassAssignmentService {
  /**
   * Generates the fixed question set and stores it as a draft. Nothing is visible to students
   * yet — publishing is a separate, explicit act (see `setStatus`).
   */
  async create(classId: string, teacherUid: string, input: CreateAssignmentInput): Promise<ClassAssignmentRecord> {
    const classSnap = await classRepository.getById(classId);
    if (!classSnap) return fail('NOT_FOUND', 'Class not found');
    if (classSnap.ownerUid !== teacherUid) return fail('FORBIDDEN', 'Not your class');

    const topic = typeof input.topic === 'string' ? input.topic.trim().slice(0, MAX_ASSIGNMENT_TOPIC) : '';
    if (!topic) return fail('INVALID_INPUT', 'A topic is required to generate the assignment.');

    const count = clampInt(input.count, MIN_QUESTIONS, MAX_QUESTIONS, 10);
    const durationMinutes = clampInt(input.durationMinutes, MIN_DURATION_MIN, MAX_DURATION_MIN, 30);
    const mode = input.mode === 'study' ? 'study' : 'exam';
    const notebookId = typeof input.notebookId === 'string' && input.notebookId.trim() ? input.notebookId.trim() : null;

    // Generated ONCE, as the teacher, with an explicit topic — `generateWeakAreaQuiz` only
    // falls back to the CALLER's own weak-topics when no topic is supplied, and one is always
    // supplied here, so this never pulls the teacher's personal weak areas into a class test.
    // (It still reads the teacher's stats for an "exam context" hint in the prompt, a cosmetic
    // detail — never the actual question content.)
    const { questions } = await quizGeneratorService.generateWeakAreaQuiz(teacherUid, {
      topic, count, notebookId: notebookId ?? undefined,
    });
    if (questions.length === 0) fail('GENERATION_FAILED', 'Could not generate questions. Please try again.');

    const title = (typeof input.title === 'string' && input.title.trim() ? input.title.trim() : topic)
      .slice(0, MAX_ASSIGNMENT_TITLE);

    const now = admin.firestore.FieldValue.serverTimestamp();
    const record: ClassAssignmentRecord = {
      id: classAssignmentRepository.newId(),
      classId,
      ownerUid: teacherUid,
      title,
      topic,
      notebookId,
      mode,
      questions: questions.map((q) => ({
        id: q.id, text: q.text, topic: q.topic, options: q.options,
        correctAnswerIndex: q.correctAnswerIndex, explanation: q.explanation,
      })),
      totalQuestions: questions.length,
      durationMinutes,
      status: 'draft',
      createdAt: now,
      updatedAt: now,
      publishedAt: null,
    };
    await classAssignmentRepository.create(record);
    logger.info('[ClassAssignment] Created', { classId, assignmentId: record.id, teacherUid, questionCount: questions.length });
    return record;
  }

  /**
   * List assignments for a class. The owner sees every state, including drafts they are still
   * curating; anyone else sees only `published`/`closed`, and only if they are an ACTIVE member
   * — mirroring `classResourceService.listForClass` exactly, including why the active-member
   * check is duplicated here rather than imported from `enrollmentService` (would be circular).
   *
   * The returned records have `questions` stripped for everyone except the owner — a student
   * has no business receiving the answer key through this endpoint; they interact with their
   * own attempt via the separately-authorized `/api/quiz/attempts/:id`.
   */
  async listForClass(classId: string, viewerUid: string): Promise<Omit<ClassAssignmentRecord, 'questions'>[]> {
    const classSnap = await classRepository.getById(classId);
    if (!classSnap) return fail('NOT_FOUND', 'Class not found');

    const isOwner = classSnap.ownerUid === viewerUid;
    if (!isOwner) {
      const active = await this.isActiveMember(classId, viewerUid);
      if (!active) return fail('NOT_FOUND', 'Class not found');
    }

    const all = await classAssignmentRepository.listByClass(classId);
    const visible = isOwner ? all : all.filter((a) => isAssignmentVisibleToMembers(a.status));
    return visible.map(stripQuestions);
  }

  /** Moves an assignment through draft → published → closed. Owner only. */
  async setStatus(classId: string, assignmentId: string, teacherUid: string, to: AssignmentStatus): Promise<ClassAssignmentRecord> {
    const record = await classAssignmentRepository.getById(assignmentId);
    if (!record || record.classId !== classId) return fail('NOT_FOUND', 'Assignment not found');
    if (record.ownerUid !== teacherUid) return fail('FORBIDDEN', 'Not your class');
    if (!canTransitionAssignment(record.status, to)) {
      fail('INVALID_TRANSITION', `Cannot move an assignment from ${record.status} to ${to}`, { from: record.status, to });
    }

    const now = admin.firestore.FieldValue.serverTimestamp();
    const patch: Record<string, any> = { status: to, updatedAt: now };
    if (to === 'published') patch.publishedAt = now;
    await classAssignmentRepository.update(assignmentId, patch);
    logger.info('[ClassAssignment] Transition', { assignmentId, from: record.status, to, teacherUid });
    return { ...record, ...patch, status: to };
  }

  /**
   * A student starts (or resumes) their attempt. Idempotent: calling this twice for the same
   * student never creates a second attempt — the composite pointer id makes that structurally
   * true, not just behaviourally true.
   *
   * Returns only `quizAttemptId`; the caller fetches/takes/submits the actual attempt through
   * the existing, separately-authorized `/api/quiz/attempts/:id` routes. This function's only
   * job is "does this student have a fair, fixed copy of the test to take" — not taking it.
   */
  async startAttempt(classId: string, assignmentId: string, studentUid: string): Promise<{ quizAttemptId: string }> {
    const record = await classAssignmentRepository.getById(assignmentId);
    if (!record || record.classId !== classId) return fail('NOT_FOUND', 'Assignment not found');
    if (!isAssignmentStartable(record.status)) fail('NOT_OPEN', 'This assignment is not open right now.');

    const active = await this.isActiveMember(classId, studentUid);
    if (!active) return fail('NOT_FOUND', 'Assignment not found');

    const pointerId = assignmentAttemptId(assignmentId, studentUid);
    const existing = await classAssignmentRepository.getPointer(pointerId);
    if (existing) return { quizAttemptId: existing.quizAttemptId };

    const attempt = await quizAttemptsService.createFromQuestions(studentUid, record.questions, {
      title: record.title,
      source: record.notebookId ? 'notebook' : 'topic',
      topic: record.topic,
      notebookId: record.notebookId ?? undefined,
      mode: record.mode,
      durationMinutes: record.durationMinutes,
    });

    const pointer: AssignmentAttemptPointer = {
      id: pointerId,
      assignmentId,
      classId,
      teacherUid: record.ownerUid,
      studentUid,
      quizAttemptId: attempt.id,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    };
    await classAssignmentRepository.createPointer(pointer);

    logger.info('[ClassAssignment] Attempt started', { classId, assignmentId, studentUid, quizAttemptId: attempt.id });
    return { quizAttemptId: attempt.id };
  }

  /**
   * The teacher's results view — aggregated over CURRENTLY ACTIVE roster members only.
   *
   * ── Why this is the highest-risk function in the whole codebase ─────────────────────
   * Every other read in this system either fetches the caller's own data or is checked against
   * a specific relationship (owner, active member) before a single record is touched. This
   * function is different in kind: it deliberately reads OTHER PEOPLE's quiz attempts, because
   * that is the entire point of a results view. Two things make that safe rather than a leak:
   *
   *   1. The attempt ids this function fetches never come from client input. They come from
   *      `classAssignmentAttempts` pointer docs that THIS SERVICE created, filtered to this one
   *      assignment. A caller cannot point this function at an arbitrary attempt id.
   *   2. Every pointer is re-checked against the roster's CURRENT state before its attempt is
   *      included. A student who completed the assignment and then left the class must not
   *      appear here — "access ends immediately" applies to teachers reading about a student
   *      exactly as much as it applies to a student reading a class.
   *
   * `quizAttemptsRepository.getById` (not `quizAttemptsService.getAttempt`) is used deliberately
   * — the service method enforces `attempt.userId === callerUid`, which would reject every one
   * of these reads outright, because the teacher is never the attempt's owner. Bypassing that
   * check is only safe because of guarantee (1) above; this is the one place in the codebase
   * that bypass is correct rather than a bug.
   */
  async getResults(classId: string, assignmentId: string, teacherUid: string): Promise<AssignmentResults> {
    const record = await classAssignmentRepository.getById(assignmentId);
    if (!record || record.classId !== classId) return fail('NOT_FOUND', 'Assignment not found');
    if (record.ownerUid !== teacherUid) return fail('FORBIDDEN', 'Not your class');

    const pointers = await classAssignmentRepository.listPointersByAssignment(assignmentId);

    // Guarantee (2): drop any pointer whose student is no longer an ACTIVE member.
    const activeChecks = await Promise.all(pointers.map((p) => this.isActiveMember(classId, p.studentUid)));
    const activePointers = pointers.filter((_, i) => activeChecks[i]);

    const attempts = await Promise.all(
      activePointers.map((p) => quizAttemptsRepository.getById(p.quizAttemptId)),
    );

    const students: AssignmentResultRow[] = activePointers.map((p, i) => {
      const a = attempts[i];
      return {
        studentUid: p.studentUid,
        status: a?.status === 'completed' ? 'completed' : 'in-progress',
        score: a?.score,
        maxMarks: a?.maxMarks,
        accuracy: a?.accuracy,
        correctCount: a?.correctCount,
        totalQuestions: record.totalQuestions,
        timeSpentSeconds: a?.timeSpentSeconds,
      };
    });

    const completedRows = students.filter((s) => s.status === 'completed');
    const averageAccuracy = average(completedRows.map((s) => s.accuracy).filter(isNumber));
    const averageScore = average(completedRows.map((s) => s.score).filter(isNumber));

    // Per-topic average, computed from each completed attempt's own topicBreakdown — the exact
    // same breakdown the existing single-student report already computes, just averaged here
    // rather than re-derived.
    const topicAcc = new Map<string, { sum: number; count: number }>();
    for (const a of attempts) {
      if (!a || a.status !== 'completed') continue;
      for (const tb of a.topicBreakdown ?? []) {
        const bucket = topicAcc.get(tb.topic) ?? { sum: 0, count: 0 };
        bucket.sum += tb.accuracy;
        bucket.count += 1;
        topicAcc.set(tb.topic, bucket);
      }
    }
    const topicAverages: AssignmentTopicAverage[] = Array.from(topicAcc.entries())
      .map(([topic, b]) => ({ topic, averageAccuracy: Math.round(b.sum / b.count), studentsAttempted: b.count }))
      .sort((a, b) => a.averageAccuracy - b.averageAccuracy);

    return {
      assignmentId,
      totalQuestions: record.totalQuestions,
      started: students.length,
      completed: completedRows.length,
      averageAccuracy,
      averageScore,
      topicAverages,
      students,
    };
  }

  /**
   * Duplicates the two-line "is this uid an ACTIVE member" check `enrollmentService` already
   * performs, rather than importing it — importing would be circular in the same way
   * `classResourceService` documents (enrollment.service already imports classResourceService;
   * if this file imported enrollmentService too, and enrollment.service ever needed assignment
   * data, the cycle would be immediate). Same trade as Phase 3F, same reasoning.
   */
  private async isActiveMember(classId: string, uid: string): Promise<boolean> {
    const snap = await db.collection('classEnrollments').doc(`${classId}_${uid}`).get();
    return snap.exists && (snap.data() as { state: string }).state === 'ACTIVE';
  }
}

function stripQuestions(record: ClassAssignmentRecord): Omit<ClassAssignmentRecord, 'questions'> {
  const { questions, ...rest } = record;
  return rest;
}

function clampInt(value: unknown, min: number, max: number, fallback: number): number {
  const n = typeof value === 'number' && Number.isFinite(value) ? Math.round(value) : fallback;
  return Math.max(min, Math.min(max, n));
}

function isNumber(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

function average(values: number[]): number | null {
  if (values.length === 0) return null;
  return Math.round(values.reduce((s, v) => s + v, 0) / values.length);
}

export const classAssignmentService = new ClassAssignmentService();
