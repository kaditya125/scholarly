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
} from '../../types/quizAttempt.types';
import { QuizQuestion } from './quizGenerator.service';
import type { StoredQuizQuestion } from '../../types/quizAttempt.types';
import { UserStatsService } from '../userStats.service';
import { UserStatsRepository } from '../../repositories/userStats.repository';
import { PlannerService } from '../planner.service';

const POSITIVE_MARK = 1;
const NEGATIVE_MARK = 0.25;
const DEFAULT_DURATION_MIN = 30;
const WEAK_THRESHOLD = 60;   // section accuracy below this => "work on this"
const STRONG_THRESHOLD = 80; // at/above this => strength

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
        // Canonical identity must survive denormalisation — dropping it here would strip the
        // evidence of its syllabus location at the exact moment it becomes student history.
        syllabusNodeId: q.syllabusNodeId,
        syllabusId: q.syllabusId,
        cycleId: q.cycleId,
        identityStatus: q.identityStatus,
      })),
      totalQuestions: questions.length,
      durationMinutes: meta.durationMinutes || DEFAULT_DURATION_MIN,
      positiveMark: POSITIVE_MARK,
      negativeMark: NEGATIVE_MARK,
      status: 'in-progress',
      createdAt: now,
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
    const byTopic = new Map<string, { correct: number; incorrect: number; unattempted: number; total: number }>();

    for (const q of attempt.questions) {
      const topic = q.topic || 'General';
      const bucket = byTopic.get(topic) || { correct: 0, incorrect: 0, unattempted: 0, total: 0 };
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
      byTopic.set(topic, bucket);
    }

    const total = attempt.totalQuestions;
    const unattempted = Math.max(0, total - correct - incorrect);
    const score = round2(correct * attempt.positiveMark - incorrect * attempt.negativeMark);
    const maxMarks = round2(total * attempt.positiveMark);
    const accuracy = total > 0 ? Math.round((correct / total) * 100) : 0;

    const topicBreakdown: TopicBreakdown[] = Array.from(byTopic.entries())
      .map(([topic, b]) => ({
        topic,
        correct: b.correct,
        incorrect: b.incorrect,
        unattempted: b.unattempted,
        total: b.total,
        accuracy: b.total > 0 ? Math.round((b.correct / b.total) * 100) : 0,
      }))
      .sort((a, b) => a.accuracy - b.accuracy);

    const weakTopics = topicBreakdown.filter(t => t.accuracy < WEAK_THRESHOLD).map(t => t.topic);
    const strongTopics = topicBreakdown.filter(t => t.accuracy >= STRONG_THRESHOLD).map(t => t.topic);
    const feedback = buildAttemptFeedback({ accuracy, score, maxMarks, correct, incorrect, unattempted, total, weakTopics, strongTopics });

    const patch: Partial<QuizAttempt> = {
      status: 'completed',
      completedAt: new Date().toISOString(),
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
      feedback,
    };

    // Scoring + persistence is the source of truth and must always succeed.
    await quizAttemptsRepository.update(id, patch);

    // Everything below is best-effort enrichment — never let it fail the submission.
    await this.rollIntoGlobalStats(userId, { accuracy, weakTopics, strongTopics, title: attempt.title })
      .catch(e => console.error('[QuizAttempts] stats roll-up failed', e));

    this.statsService.awardXP(userId, 'QUIZ_COMPLETE').catch(() => {});
    if (accuracy >= STRONG_THRESHOLD) this.statsService.awardXP(userId, 'QUIZ_HIGH_SCORE').catch(() => {});

    if (weakTopics.length > 0) {
      this.addRevisionTask(userId, attempt, weakTopics).catch(e => console.error('[QuizAttempts] planner task failed', e));
    }

    return { ...attempt, ...patch };
  }

  async getProgressReport(userId: string): Promise<ProgressReport> {
    const all = await quizAttemptsRepository.listByUser(userId); // newest first
    const completed = all.filter(a => a.status === 'completed');

    const masteryMap = new Map<string, { correct: number; total: number; attempts: number }>();
    let totalQuestionsAnswered = 0;
    let totalTimeSpentSeconds = 0;

    for (const a of completed) {
      totalTimeSpentSeconds += a.timeSpentSeconds || 0;
      for (const tb of a.topicBreakdown || []) {
        const m = masteryMap.get(tb.topic) || { correct: 0, total: 0, attempts: 0 };
        m.correct += tb.correct;
        m.total += tb.total;
        m.attempts++;
        masteryMap.set(tb.topic, m);
        totalQuestionsAnswered += tb.correct + tb.incorrect;
      }
    }

    const topicMastery: ProgressTopicMastery[] = Array.from(masteryMap.entries())
      .map(([topic, m]) => ({
        topic,
        attempts: m.attempts,
        correct: m.correct,
        total: m.total,
        accuracy: m.total > 0 ? Math.round((m.correct / m.total) * 100) : 0,
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

  private async rollIntoGlobalStats(
    userId: string,
    r: { accuracy: number; weakTopics: string[]; strongTopics: string[]; title: string }
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
