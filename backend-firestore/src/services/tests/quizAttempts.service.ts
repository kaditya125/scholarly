import { v4 as uuidv4 } from 'uuid';
import { quizAttemptsRepository } from '../../repositories/quizAttempts.repository';
import {
  QuizAttempt,
  QuizAttemptSummary,
  QuizSource,
  QuizMode,
  TopicBreakdown,
  ProgressReport,
  ProgressTopicMastery,
  ProgressTrendPoint,
  WeakTopic,
  PedagogicalDiagnostic,
} from '../../types/quizAttempt.types';
import { logger } from '../../utils/logger';
import { QuizQuestion } from './quizGenerator.service';
import type { StoredQuizQuestion } from '../../types/quizAttempt.types';
import { UserStatsService } from '../userStats.service';
import { UserStatsRepository } from '../../repositories/userStats.repository';
import { PlannerService } from '../planner.service';
import { eventBus } from '../../core/events/EventBus';
import { conceptGraphService } from '../pedagogy/conceptGraph.service';

const POSITIVE_MARK = 1;
const NEGATIVE_MARK = 0.25;
const DEFAULT_DURATION_MIN = 30;
const WEAK_THRESHOLD = 60;   // section accuracy below this => "work on this"
const STRONG_THRESHOLD = 80; // at/above this => strength
/**
 * Below this many attempted questions, "weak" is a guess, not a finding — a single wrong answer
 * out of 2 is 0% accuracy but tells you almost nothing. Rows below this floor are still reported
 * (never silently hidden — the student did answer them) but their `confidence` is scaled down
 * rather than presented with the same certainty as an 18/20 row.
 */
const CONFIDENT_SAMPLE_SIZE = 8;

/** 0-1, monotonic in sample size, saturating at CONFIDENT_SAMPLE_SIZE. Not a statistical interval
 *  — a deliberately simple, explainable scalar the mixer/UI can use to temper "weak"/"strong". */
function sampleConfidence(total: number): number {
  return Math.max(0, Math.min(1, total / CONFIDENT_SAMPLE_SIZE));
}

/** Compound key so mastery never merges across exams or across two different syllabus nodes that
 *  happen to share a display label ("Algebra" in SSC CGL vs JEE Main). Falls back to a namespaced
 *  label only when neither examId nor syllabusNodeId is available — legacy/unanchored rows. */
function masteryKey(examId: string | undefined, syllabusNodeId: string | undefined, topic: string): string {
  const exam = examId || 'unknown-exam';
  return syllabusNodeId ? `${exam}::node:${syllabusNodeId}` : `${exam}::label:${topic}`;
}

export class QuizAttemptError extends Error {
  constructor(public status: number, message: string) {
    super(message);
    this.name = 'QuizAttemptError';
  }
}

export interface CreateAttemptMeta {
  title?: string;
  source: QuizSource;
  topic?: string;
  notebookId?: string;
  notebookTitle?: string;
  mode?: QuizMode;
  durationMinutes?: number;
  remediationSource?: QuizAttempt['remediationSource'];
}

/**
 * Owns the lifecycle of AI-generated quiz attempts: persist the generated quiz, score it
 * server-side on submit, roll the result into the student's global stats (which feed the
 * dashboard + AI context), and aggregate everything into a progress report with weak-section
 * feedback.
 */
export class QuizAttemptsService {
  private statsService = new UserStatsService();
  private statsRepo = new UserStatsRepository();
  private planner = new PlannerService();

  /** Persist a freshly generated quiz as an in-progress attempt. */
  /**
   * Accepts the STORED shape rather than only freshly-generated questions, so a class assignment
   * can replay its fixed question set (already StoredQuizQuestion[]) through the same path.
   * QuizQuestion is a strict superset, so generator output still satisfies this.
   */
  async createFromQuestions(userId: string, questions: StoredQuizQuestion[], meta: CreateAttemptMeta): Promise<QuizAttempt> {
    const now = new Date().toISOString();
    const attempt: QuizAttempt = {
      id: `qa_${uuidv4()}`,
      userId,
      title: meta.title || (meta.topic ? `${meta.topic} Practice` : 'Weak Areas Practice'),
      source: meta.source,
      topic: meta.topic,
      notebookId: meta.notebookId,
      notebookTitle: meta.notebookTitle,
      mode: meta.mode || 'exam',
      questions: questions.map(q => ({
        id: q.id,
        text: q.text,
        topic: q.topic,
        options: q.options,
        correctAnswerIndex: q.correctAnswerIndex,
        explanation: q.explanation,
        difficulty: q.difficulty,
        // Canonical identity must survive denormalisation — dropping it here would strip the
        // evidence of its syllabus location at the exact moment it becomes student history.
        syllabusNodeId: q.syllabusNodeId,
        syllabusId: q.syllabusId,
        cycleId: q.cycleId,
        examId: q.examId,
        identityStatus: q.identityStatus,
        // Provenance (questionOrigin etc.) was previously computed by the generator and then
        // silently dropped here — an attempt's history could not answer "was this a real PYQ?"
        // after the fact. Carried through for the same reason syllabusNodeId is.
        questionOrigin: q.questionOrigin,
        sourcePyqId: q.sourcePyqId,
        sourceYear: q.sourceYear,
        sourceShift: q.sourceShift,
        sourcePaper: q.sourcePaper,
        canonicalPaperId: q.canonicalPaperId,
      })),
      totalQuestions: questions.length,
      durationMinutes: meta.durationMinutes || DEFAULT_DURATION_MIN,
      positiveMark: POSITIVE_MARK,
      negativeMark: NEGATIVE_MARK,
      status: 'in-progress',
      createdAt: now,
      remediationSource: meta.remediationSource,
    };
    await quizAttemptsRepository.create(attempt);
    return attempt;
  }

  /** Ownership-checked fetch (throws QuizAttemptError 404 if missing or not the caller's). */
  async getAttempt(userId: string, id: string): Promise<QuizAttempt> {
    const a = await quizAttemptsRepository.getById(id);
    if (!a || a.userId !== userId) throw new QuizAttemptError(404, 'Test not found');
    return a;
  }

  async listAttempts(userId: string): Promise<QuizAttemptSummary[]> {
    const all = await quizAttemptsRepository.listByUser(userId);
    return all.map(toSummary);
  }

  /** Score an attempt server-side, persist the result, and roll it into global stats. Idempotent. */
  async submitAttempt(
    userId: string,
    id: string,
    payload: { answers: Record<string, number>; timeSpentSeconds?: number }
  ): Promise<QuizAttempt> {
    const attempt = await this.getAttempt(userId, id);
    if (attempt.status === 'completed') return attempt; // already scored — return as-is

    const answers = payload.answers || {};

    let correct = 0;
    let incorrect = 0;
    /*
     * Grouped by CANONICAL NODE where the question has one, falling back to the label otherwise.
     *
     * This used to group on `q.topic` alone, which silently discarded the syllabusNodeId the
     * question already carried — measured at 0 of 20 breakdown rows retaining it while 19 of 129
     * questions had one. Everything downstream then keyed mastery on a label slug, which collides
     * across exams ("Algebra" is one key for JEE, SSC and banking) and which the coverage map and
     * planner cannot see at all, because both filter on the presence of a canonical node.
     *
     * The loop was open here: a student could answer correctly and their coverage would not move.
     */
    const byTopic = new Map<string, {
      topic: string; syllabusNodeId?: string; identityStatus?: 'CANONICAL' | 'UNANCHORED'; examId?: string;
      correct: number; incorrect: number; unattempted: number; total: number;
    }>();

    for (const q of attempt.questions) {
      const topic = q.topic || 'General';
      // examId is now part of the bucket key too: two questions on "Algebra" from different exams
      // (should never happen within one attempt post-Phase-1, but a pre-Phase-1 attempt or a mixed
      // notebook-sourced quiz could still have it) must not be averaged together.
      const key = `${q.examId || 'x'}::${q.syllabusNodeId || `label:${topic}`}`;
      const bucket = byTopic.get(key) || {
        topic, syllabusNodeId: q.syllabusNodeId, identityStatus: q.identityStatus, examId: q.examId,
        correct: 0, incorrect: 0, unattempted: 0, total: 0,
      };
      bucket.total++;
      const sel = answers[q.id];
      if (sel === undefined || sel === null) {
        bucket.unattempted++;
      } else if (sel === q.correctAnswerIndex) {
        correct++;
        bucket.correct++;
      } else {
        incorrect++;
        bucket.incorrect++;
      }
      byTopic.set(key, bucket);
    }

    const total = attempt.totalQuestions;
    const unattempted = Math.max(0, total - correct - incorrect);
    const score = round2(correct * attempt.positiveMark - incorrect * attempt.negativeMark);
    const maxMarks = round2(total * attempt.positiveMark);
    const accuracy = total > 0 ? Math.round((correct / total) * 100) : 0;

    const topicBreakdown: TopicBreakdown[] = Array.from(byTopic.values())
      .map((b) => ({
        topic: b.topic,
        correct: b.correct,
        incorrect: b.incorrect,
        unattempted: b.unattempted,
        total: b.total,
        accuracy: b.total > 0 ? Math.round((b.correct / b.total) * 100) : 0,
        // Carried through to the mastery event. Absent is honest for unanchored questions.
        syllabusNodeId: b.syllabusNodeId,
        identityStatus: b.identityStatus,
        examId: b.examId,
      }))
      .sort((a, b) => a.accuracy - b.accuracy);

    const weakTopics = topicBreakdown.filter(t => t.accuracy < WEAK_THRESHOLD).map(t => t.topic);
    const strongTopics = topicBreakdown.filter(t => t.accuracy >= STRONG_THRESHOLD).map(t => t.topic);
    // Structured counterpart — same threshold, but keeps examId/syllabusNodeId so a recommendation
    // built from this can retrieve by syllabus location instead of matching a display string.
    const now = new Date().toISOString();
    const weakTopicDetails: WeakTopic[] = topicBreakdown
      .filter(t => t.accuracy < WEAK_THRESHOLD)
      .map(t => ({
        examId: t.examId,
        syllabusNodeId: t.syllabusNodeId,
        topicName: t.topic,
        attempts: 1,
        correct: t.correct,
        incorrect: t.incorrect,
        total: t.total,
        accuracy: t.accuracy,
        confidence: sampleConfidence(t.total),
        lastAttemptAt: now,
      }));
    const feedback = buildAttemptFeedback({ accuracy, score, maxMarks, correct, incorrect, unattempted, total, weakTopics, strongTopics });

    const pedagogicalDiagnostics = await this.diagnose(userId, id, topicBreakdown);
    let enrichedFeedback = feedback;
    if (pedagogicalDiagnostics && pedagogicalDiagnostics.length > 0) {
      enrichedFeedback += '\n\n**Prerequisite check:**\n' +
        pedagogicalDiagnostics.map(d => `• ${d.diagnosticMessage}`).join('\n');
    }

    const patch: Partial<QuizAttempt> = {
      status: 'completed',
      completedAt: now,
      answers,
      score,
      maxMarks,
      correctCount: correct,
      incorrectCount: incorrect,
      unattemptedCount: unattempted,
      accuracy,
      timeSpentSeconds: Math.max(0, Math.round(payload.timeSpentSeconds || 0)),
      topicBreakdown,
      weakTopics,
      strongTopics,
      feedback: enrichedFeedback,
      pedagogicalDiagnostics,
    };

    // Scoring + persistence is the source of truth and must always succeed.
    await quizAttemptsRepository.update(id, patch);

    // Everything below is best-effort enrichment — never let it fail the submission.
    await this.rollIntoGlobalStats(userId, { accuracy, weakTopics, strongTopics, weakTopicDetails, title: attempt.title })
      .catch(e => console.error('[QuizAttempts] stats roll-up failed', e));

    this.statsService.awardXP(userId, 'QUIZ_COMPLETE').catch(() => {});
    if (accuracy >= STRONG_THRESHOLD) this.statsService.awardXP(userId, 'QUIZ_HIGH_SCORE').catch(() => {});

    if (weakTopics.length > 0) {
      this.addRevisionTask(userId, attempt, weakTopics).catch(e => console.error('[QuizAttempts] planner task failed', e));
    }

    /*
     * Publish domain event for the Closed-Loop Automation Engine AND for mastery.
     *
     * ── WHY topicBreakdown IS HERE ────────────────────────────────────────────────────────────
     * This is the live student quiz path — the one the frontend actually calls. It previously
     * published only aggregates plus a single free-form `topic` string, while the per-topic
     * breakdown (which already carries the validated syllabusNodeId from the Stage 5 fix) was
     * computed right above, persisted to the attempt, and then dropped from the event. Mastery
     * cannot be derived from an aggregate: it needs to know WHICH syllabus node each correct and
     * incorrect answer belongs to. Sending the same rows that are persisted keeps the event and
     * the durable record in agreement, which is what makes mastery rebuildable from Firestore.
     */
    void eventBus.publish('learning.quiz_completed', {
      userId,
      attemptId: id,
      subject: attempt.notebookTitle || 'General',
      topic: attempt.topic || 'General Practice',
      totalQuestions: total,
      correctCount: correct,
      skippedCount: unattempted,
      accuracy,
      totalTimeSeconds: patch.timeSpentSeconds,
      topicBreakdown,
      occurredAt: Date.now(),
    }, {
      /*
       * DETERMINISTIC identity, derived from the domain rather than random — the same convention
       * resultAnalysis uses for test_completed.
       *
       * An attempt can be completed exactly once (submitAttempt returns early above when the
       * status is already 'completed'), so the attempt id uniquely names this logical event. That
       * matters for mastery: the subscriber dedupes on eventId inside the write transaction, so a
       * republish after a retry, a restart, or a duplicate delivery carries the SAME id and is
       * discarded. With the randomly-generated fallback id this used to get, every redelivery
       * would have looked like fresh evidence and double-counted the student's answers.
       *
       * The `learning.quiz_completed:` prefix also keeps this id space disjoint from
       * `learning.test_completed:{attemptId}`, so a quiz attempt and a test attempt that happen
       * to share an id can never dedupe against each other.
       */
      eventId: `learning.quiz_completed:${id}`,
    });

    return { ...attempt, ...patch };
  }

  /**
   * `examId` is optional and defaults to mixing every exam the student has ever attempted a test
   * in — that stays the existing behavior for current callers (WeakSectionsPanel/AIRecommendedTests
   * are UI, deliberately not touched in this pass). Pass it explicitly to get the exam-scoped view
   * the mixer/recommendation engine needs: a student who switched from NEET prep to SSC CGL must
   * never have NEET-era weak topics surface in an SSC CGL drill.
   */
  async getProgressReport(userId: string, examId?: string | null): Promise<ProgressReport> {
    const all = await quizAttemptsRepository.listByUser(userId); // newest first
    const completed = all.filter(a => a.status === 'completed');

    const masteryMap = new Map<string, { topic: string; examId?: string; syllabusNodeId?: string; correct: number; total: number; attempts: number; lastAttemptAt?: string }>();
    let totalQuestionsAnswered = 0;
    let totalTimeSpentSeconds = 0;

    for (const a of completed) {
      totalTimeSpentSeconds += a.timeSpentSeconds || 0;
      for (const tb of a.topicBreakdown || []) {
        if (examId && tb.examId !== examId) continue; // exam-scoped view: skip rows from other exams
        const key = masteryKey(tb.examId, tb.syllabusNodeId, tb.topic);
        const m = masteryMap.get(key) || { topic: tb.topic, examId: tb.examId, syllabusNodeId: tb.syllabusNodeId, correct: 0, total: 0, attempts: 0 };
        m.correct += tb.correct;
        m.total += tb.total;
        m.attempts++;
        m.lastAttemptAt = a.completedAt || a.createdAt;
        masteryMap.set(key, m);
        totalQuestionsAnswered += tb.correct + tb.incorrect;
      }
    }

    const topicMastery: ProgressTopicMastery[] = Array.from(masteryMap.values())
      .map((m) => ({
        topic: m.topic,
        attempts: m.attempts,
        correct: m.correct,
        total: m.total,
        accuracy: m.total > 0 ? Math.round((m.correct / m.total) * 100) : 0,
        examId: m.examId,
        syllabusNodeId: m.syllabusNodeId,
        lastAttemptAt: m.lastAttemptAt,
      }))
      .sort((a, b) => a.accuracy - b.accuracy);

    const weakSections = topicMastery.filter(t => t.accuracy < WEAK_THRESHOLD);
    const strongSections = topicMastery
      .filter(t => t.accuracy >= STRONG_THRESHOLD)
      .sort((a, b) => b.accuracy - a.accuracy);

    const averageAccuracy = completed.length
      ? Math.round(completed.reduce((s, a) => s + (a.accuracy || 0), 0) / completed.length)
      : 0;
    const bestAccuracy = completed.reduce((mx, a) => Math.max(mx, a.accuracy || 0), 0);

    const trend: ProgressTrendPoint[] = completed
      .slice()
      .sort((a, b) => (a.completedAt || a.createdAt || '').localeCompare(b.completedAt || b.createdAt || ''))
      .slice(-12)
      .map(a => ({
        attemptId: a.id,
        title: a.title,
        date: a.completedAt || a.createdAt,
        accuracy: a.accuracy || 0,
        score: a.score || 0,
        maxMarks: a.maxMarks || a.totalQuestions,
      }));

    const recentAttempts = all.slice(0, 8).map(toSummary);

    const narrative = buildProgressNarrative({
      completedCount: completed.length,
      averageAccuracy,
      weakSections,
      strongSections,
    });

    return {
      totalTests: completed.length,
      totalGenerated: all.length,
      inProgress: all.filter(a => a.status === 'in-progress').length,
      averageAccuracy,
      bestAccuracy,
      totalQuestionsAnswered,
      totalTimeSpentSeconds,
      trend,
      topicMastery,
      weakSections,
      strongSections,
      recentAttempts,
      narrative,
    };
  }

  /** Mask the answer key for questions still being attempted (never ship answers mid-test). */
  maskForClient(attempt: QuizAttempt): QuizAttempt {
    if (attempt.status === 'completed') return attempt; // report legitimately needs the key
    return {
      ...attempt,
      questions: attempt.questions.map(q => ({ ...q, correctAnswerIndex: -1, explanation: '' })),
    };
  }

  /** The client-facing (answer-free) question list for the generate response. */
  publicQuestions(attempt: QuizAttempt) {
    return attempt.questions.map(q => ({ id: q.id, text: q.text, topic: q.topic, options: q.options }));
  }

  // ─── private helpers ────────────────────────────────────────────────────────

  /**
   * Prerequisite-graph diagnosis. Evidence is this attempt plus the student's stored weak-topic
   * history (which is where a prerequisite measured in an EARLIER test shows up). A failure here
   * must not fail the submission — scoring is the source of truth — so it is logged and the
   * field is left unset, which the type documents as "not diagnosed", distinct from null.
   */
  private async diagnose(userId: string, attemptId: string, topicBreakdown: TopicBreakdown[]): Promise<PedagogicalDiagnostic[] | null | undefined> {
    try {
      const stats: any = await this.statsService.getUserStats(userId);
      const history: WeakTopic[] = Array.isArray(stats?.weakTopicDetails) ? stats.weakTopicDetails : [];
      const diagnostics = conceptGraphService.diagnoseAttempt(topicBreakdown, history);
      logger.info('[QuizAttempts] pedagogical diagnosis', {
        attemptId,
        outcome: diagnostics === null ? 'not_supported' : diagnostics.length ? 'diagnosed' : 'nothing_weak',
        statuses: diagnostics?.map(d => `${d.targetConceptId}:${d.status}`),
      });
      return diagnostics;
    } catch (err: any) {
      logger.error('[QuizAttempts] pedagogical diagnosis failed', { attemptId, error: err?.message || String(err) });
      return undefined;
    }
  }

  private async rollIntoGlobalStats(
    userId: string,
    r: { accuracy: number; weakTopics: string[]; strongTopics: string[]; weakTopicDetails: WeakTopic[]; title: string }
  ): Promise<void> {
    const stats: any = await this.statsService.getUserStats(userId); // seeds if missing
    const prevCount = stats?.totalTestsAttempted || 0;
    const prevAvg = stats?.averageAccuracy || 0;
    const newCount = prevCount + 1;
    const newAvg = Math.round((prevAvg * prevCount + r.accuracy) / newCount);

    // Union weak topics, but let a now-strong topic graduate out of the weak list.
    const weakSet = new Set<string>([...(Array.isArray(stats?.weakTopics) ? stats.weakTopics : []), ...r.weakTopics]);
    r.strongTopics.forEach(t => weakSet.delete(t));
    const strongSet = new Set<string>([...(Array.isArray(stats?.strongTopics) ? stats.strongTopics : []), ...r.strongTopics]);

    /*
     * Structured counterpart, merged by (examId, syllabusNodeId ?? topicName) rather than
     * overwritten — a repeat weak performance on the same node should accumulate evidence
     * (attempts/correct/incorrect/total), not just replace the last attempt's snapshot, so
     * confidence actually grows across sessions the way real evidence should.
     */
    const existingDetails: WeakTopic[] = Array.isArray(stats?.weakTopicDetails) ? stats.weakTopicDetails : [];
    const detailMap = new Map<string, WeakTopic>();
    for (const d of existingDetails) detailMap.set(masteryKey(d.examId, d.syllabusNodeId, d.topicName), d);
    for (const incoming of r.weakTopicDetails) {
      const key = masteryKey(incoming.examId, incoming.syllabusNodeId, incoming.topicName);
      const prior = detailMap.get(key);
      const merged: WeakTopic = prior
        ? {
            ...prior,
            attempts: prior.attempts + 1,
            correct: prior.correct + incoming.correct,
            incorrect: prior.incorrect + incoming.incorrect,
            total: prior.total + incoming.total,
            accuracy: Math.round(((prior.correct + incoming.correct) / Math.max(1, prior.total + incoming.total)) * 100),
            confidence: sampleConfidence(prior.total + incoming.total),
            lastAttemptAt: incoming.lastAttemptAt,
          }
        : incoming;
      detailMap.set(key, merged);
    }
    // A topic that just graduated to strong (by name, within the SAME exam as the row being
    // pruned — never cross-exam, that's the whole point of the compound key) is removed here too.
    for (const [key, d] of detailMap) {
      if (r.strongTopics.includes(d.topicName)) detailMap.delete(key);
    }
    // Bounded and worst-first, same spirit as the existing weakTopics slice(0, 12).
    const weakTopicDetails = Array.from(detailMap.values())
      .sort((a, b) => a.accuracy - b.accuracy)
      .slice(0, 24);

    const performanceHistory = Array.isArray(stats?.performanceHistory) ? stats.performanceHistory.slice(-19) : [];
    performanceHistory.push({ topic: r.title, score: r.accuracy });

    // Update Activity Heatmap for today
    const today = new Date().toISOString().split('T')[0];
    const activityHeatmap = Array.isArray(stats?.activityHeatmap) ? [...stats.activityHeatmap] : [];
    const todayIndex = activityHeatmap.findIndex(h => h.date === today);
    if (todayIndex >= 0) {
      activityHeatmap[todayIndex].count = (activityHeatmap[todayIndex].count || 0) + 1;
      activityHeatmap[todayIndex].intensity = Math.min(3, activityHeatmap[todayIndex].count);
    } else {
      activityHeatmap.push({ date: today, count: 1, intensity: 1 });
    }

    const currentStreak = stats?.gamification?.studyStreakDays || 0;
    const newStreak = currentStreak === 0 ? 1 : currentStreak;

    await this.statsRepo.upsertUserStats(userId, {
      totalTestsAttempted: newCount,
      averageAccuracy: newAvg,
      weakTopics: Array.from(weakSet).slice(0, 12),
      strongTopics: Array.from(strongSet).slice(0, 12),
      weakTopicDetails,
      performanceHistory,
      activityHeatmap,
      gamification: {
        ...(stats?.gamification || {}),
        studyStreakDays: newStreak,
      }
    } as any);
  }

  private async addRevisionTask(userId: string, attempt: QuizAttempt, weakTopics: string[]): Promise<void> {
    const today = new Date().toISOString().split('T')[0];
    await this.planner.addTask(userId, today, {
      id: `rec_${uuidv4()}`,
      title: `Revise: ${weakTopics.slice(0, 2).join(', ')}`,
      type: 'revision',
      chapter: attempt.notebookTitle || attempt.title,
      topic: weakTopics[0],
      estimatedMinutes: 30,
      completed: false,
      priority: 'high',
    });
  }
}

// ─── module-level pure helpers ──────────────────────────────────────────────

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function toSummary(a: QuizAttempt): QuizAttemptSummary {
  return {
    id: a.id,
    title: a.title,
    source: a.source,
    topic: a.topic,
    notebookId: a.notebookId,
    notebookTitle: a.notebookTitle,
    mode: a.mode,
    totalQuestions: a.totalQuestions,
    durationMinutes: a.durationMinutes,
    status: a.status,
    createdAt: a.createdAt,
    completedAt: a.completedAt,
    score: a.score,
    maxMarks: a.maxMarks,
    accuracy: a.accuracy,
    correctCount: a.correctCount,
  };
}

function buildAttemptFeedback(d: {
  accuracy: number;
  score: number;
  maxMarks: number;
  correct: number;
  incorrect: number;
  unattempted: number;
  total: number;
  weakTopics: string[];
  strongTopics: string[];
}): string {
  const parts: string[] = [];
  parts.push(
    `You scored ${d.score}/${d.maxMarks} (${d.accuracy}% accuracy) — ${d.correct} correct, ${d.incorrect} incorrect, ${d.unattempted} unattempted out of ${d.total}.`
  );
  if (d.weakTopics.length) {
    parts.push(`Work on these sections: ${d.weakTopics.slice(0, 4).join(', ')}. Revisit the concepts, then retake a focused practice test.`);
  }
  if (d.strongTopics.length) {
    parts.push(`You're strong in ${d.strongTopics.slice(0, 3).join(', ')}.`);
  }
  if (d.accuracy >= STRONG_THRESHOLD) parts.push("Excellent — you're on top of this material.");
  else if (d.accuracy >= WEAK_THRESHOLD) parts.push('Solid effort — a focused revision pass will push you higher.');
  else parts.push('This needs another study pass before you move on.');
  return parts.join(' ');
}

function buildProgressNarrative(d: {
  completedCount: number;
  averageAccuracy: number;
  weakSections: ProgressTopicMastery[];
  strongSections: ProgressTopicMastery[];
}): string {
  if (d.completedCount === 0) {
    return 'You have not completed any tests yet. Generate your first test to start tracking progress and unlock personalized feedback on your weak areas.';
  }
  const parts: string[] = [];
  parts.push(`You have completed ${d.completedCount} test${d.completedCount > 1 ? 's' : ''} with an average accuracy of ${d.averageAccuracy}%.`);
  if (d.weakSections.length > 0) {
    const w = d.weakSections.slice(0, 3).map(s => `${s.topic} (${s.accuracy}%)`).join(', ');
    parts.push(`Focus your next sessions on: ${w}. Revise the underlying concepts, then take a targeted test to close the gap.`);
  } else {
    parts.push('No weak sections right now — your accuracy is solid across the board. Keep reinforcing with periodic revision.');
  }
  if (d.strongSections.length > 0) {
    const s = d.strongSections.slice(0, 3).map(x => `${x.topic} (${x.accuracy}%)`).join(', ');
    parts.push(`You're strong in ${s} — keep them warm with occasional review.`);
  }
  return parts.join(' ');
}

export const quizAttemptsService = new QuizAttemptsService();
