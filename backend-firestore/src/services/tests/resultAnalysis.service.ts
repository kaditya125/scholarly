import { testsRepository } from '../../repositories/tests.repository';
import { TestAttempt, MockTest, Question } from '../../types/tests.types';
import { PlannerService } from '../planner.service';
import { UserStatsService } from '../userStats.service';
import { v4 as uuidv4 } from 'uuid';

/**
 * Carries an HTTP status the error middleware already understands (`err.status || err.statusCode
 * || 500`). Same shape as QuizAttemptError on the quiz path, so both attempt families reject
 * identically rather than one 500-ing where the other 404s.
 */
export class TestAttemptError extends Error {
  constructor(public status: number, message: string) {
    super(message);
    this.name = 'TestAttemptError';
  }
}

export class ResultAnalysisService {
  private plannerService = new PlannerService();
  private statsService = new UserStatsService();
  /**
   * Grade and finalise one test attempt.
   *
   * ── WHY userId IS REQUIRED AND POSITIONAL ─────────────────────────────────────────────────
   * This used to take the attemptId alone. Its route (`POST /tests/attempts/:attemptId/submit`)
   * carries `requireAuth` but cannot carry `enforceSelf`, because the path parameter is an
   * attempt id and not a user id — so authentication proved the caller was *someone*, never that
   * they owned this attempt. Any authenticated user holding another student's attemptId could
   * grade that student's attempt, and the completion event it publishes is stamped with
   * `attempt.userId` — so once mastery is enabled, the write would land on the victim's record.
   *
   * The check lives HERE rather than in the controller or a middleware because this is the last
   * point every caller must pass through: making the parameter required and positional means a
   * future caller that forgets it fails to compile, instead of silently reopening the hole. The
   * defect was recorded but unfixed in two places — SECURITY_FIX_REPORT.md ("authenticated but
   * not attempt-ownership-checked") and docs/TEACHER_ECOSYSTEM_PLAN.md defect 4, which requires
   * it closed before class tests ship.
   */
  async processSubmission(attemptId: string, userId: string): Promise<TestAttempt> {
    if (!userId) throw new TestAttemptError(401, 'Unauthorized');

    const attempt = await testsRepository.getTestAttempt(attemptId);
    /*
     * ONE branch for "no such attempt" and "not your attempt", deliberately.
     *
     * Splitting them — 404 for missing, 403 for someone else's — would turn this endpoint into an
     * existence oracle: an attacker probing ids learns which ones are real attempts belonging to
     * other students, which is exactly the information the guard exists to withhold. 404 for both
     * matches quizAttempts.getAttempt, which already rejects a non-owner with
     * `QuizAttemptError(404, 'Test not found')` rather than a 403.
     */
    if (!attempt || attempt.userId !== userId) {
      throw new TestAttemptError(404, 'Attempt not found');
    }
    if (attempt.status === 'completed') return attempt; // Already processed

    const test = await testsRepository.getTestById(attempt.testId);
    if (!test) throw new Error('Test not found');

    const questions = await testsRepository.getQuestions(test.questionIds);
    const questionMap = new Map<string, Question>();
    questions.forEach(q => questionMap.set(q.id, q));

    let score = 0;
    let correctCount = 0;
    const totalAttempted = Object.keys(attempt.answers || {}).length;

    // Calculate score
    for (const [qId, selectedIdx] of Object.entries(attempt.answers || {})) {
      const q = questionMap.get(qId);
      if (q && q.correctAnswerIndex === selectedIdx) {
        score += test.positiveMarks;
        correctCount++;
      } else if (q) {
        score -= test.negativeMarks;
      }
    }

    const accuracy = totalAttempted > 0 ? (correctCount / totalAttempted) * 100 : 0;
    
    // Calculate total time
    let totalTimeSpent = 0;
    if (attempt.timeSpentPerQuestion) {
        totalTimeSpent = Object.values(attempt.timeSpentPerQuestion).reduce((a, b) => a + b, 0);
    }

    // Prepare updated attempt
    attempt.status = 'completed';
    attempt.completedAt = new Date().toISOString();
    attempt.score = score;
    attempt.accuracy = accuracy;
    attempt.totalTimeSpent = totalTimeSpent;
    // Percentile requires a cohort of other attempts at this test to compute against; we do not
    // have that here. It was previously hardcoded to 85, which showed every student the same
    // invented rank. Left undefined until a real cohort comparison exists — the UI must render
    // "not available" rather than a fabricated number.
    attempt.percentile = undefined;

    // Per-topic breakdown from the ACTUAL questions and answers, replacing what used to be two
    // constant strings ('Good overall comprehension' / 'Needs revision on fundamental concepts')
    // emitted purely off a 70% threshold — identical for every student and every subject, and
    // naming no topic the student could act on.
    const byTopic = new Map<string, {
      correct: number; attempted: number; skipped: number;
      syllabusNodeId?: string; syllabusId?: string; cycleId?: string;
      identityStatus?: 'CANONICAL' | 'UNANCHORED';
    }>();
    for (const q of questions) {
      const anyQ = q as any;
      const key = q.topic || q.subject || 'General';
      const entry = byTopic.get(key) || { correct: 0, attempted: 0, skipped: 0 };
      // Identity is CARRIED from the question, never looked up from the topic string.
      if (anyQ.syllabusNodeId && !entry.syllabusNodeId) {
        entry.syllabusNodeId = anyQ.syllabusNodeId;
        entry.syllabusId = anyQ.syllabusId;
        entry.cycleId = anyQ.cycleId;
      }
      entry.identityStatus = entry.identityStatus === 'UNANCHORED'
        ? 'UNANCHORED'
        : (anyQ.identityStatus || 'UNANCHORED');
      const selected = (attempt.answers || {})[q.id];
      if (selected === undefined) {
        entry.skipped++;
      } else {
        entry.attempted++;
        if (q.correctAnswerIndex === selected) entry.correct++;
      }
      byTopic.set(key, entry);
    }

    // A topic needs a minimum number of graded attempts before this claims anything about it.
    // Without this, one lucky or unlucky question would label a topic a strength or a weakness.
    const MIN_EVIDENCE = 3;
    const WEAK_BELOW = 0.6;
    const STRONG_AT_OR_ABOVE = 0.8;

    const strengths: string[] = [];
    const weaknesses: string[] = [];
    const conceptGaps: string[] = [];

    for (const [topic, s] of byTopic) {
      if (s.attempted < MIN_EVIDENCE) continue; // not enough evidence to make a claim
      const topicAccuracy = s.correct / s.attempted;
      if (topicAccuracy < WEAK_BELOW) {
        weaknesses.push(`${topic} — ${s.correct}/${s.attempted} correct (${Math.round(topicAccuracy * 100)}%)`);
        conceptGaps.push(topic);
      } else if (topicAccuracy >= STRONG_AT_OR_ABOVE) {
        strengths.push(`${topic} — ${s.correct}/${s.attempted} correct (${Math.round(topicAccuracy * 100)}%)`);
      }
    }

    // Skipping is a distinct signal from answering wrongly (avoidance / time pressure rather
    // than a knowledge gap), so it is reported separately instead of being folded into accuracy.
    const heavilySkipped = Array.from(byTopic.entries())
      .filter(([, s]) => s.skipped >= MIN_EVIDENCE && s.skipped > s.attempted)
      .map(([topic]) => topic);
    for (const topic of heavilySkipped) {
      weaknesses.push(`${topic} — mostly left unattempted (${byTopic.get(topic)!.skipped} skipped)`);
      if (!conceptGaps.includes(topic)) conceptGaps.push(topic);
    }

    const needsRevision = accuracy < 70 || weaknesses.length > 0;

    attempt.aiAnalysis = {
      strengths,
      weaknesses,
      conceptGaps,
      // Recovery tasks now name the specific weak topics rather than the whole subject.
      recoveryPlanTasks: conceptGaps.length > 0
        ? conceptGaps.slice(0, 3).map((t) => `Revise ${t} and redo the questions you missed`)
        : [],
    };

    await testsRepository.saveTestAttempt(attempt);

    // ── Emit learning evidence ────────────────────────────────────────────────────────────
    // Fire-and-forget and fully guarded: a failure to record evidence must never fail the
    // submission the student just made. One event per graded question (the atom mastery is
    // computed from) plus one aggregate for the attempt.
    try {
      const { eventBus } = await import('../../core/events/EventBus');
      const occurredAt = Date.now();

      for (const q of questions) {
        const selected = (attempt.answers || {})[q.id];
        const skipped = selected === undefined;
        void eventBus.publish('learning.question_answered', {
          userId: attempt.userId,
          questionId: q.id,
          subject: q.subject,
          topic: q.topic,
          difficulty: q.difficulty,
          correct: !skipped && q.correctAnswerIndex === selected,
          skipped,
          timeSpentSeconds: attempt.timeSpentPerQuestion?.[q.id],
          source: 'test',
          sourceId: attempt.id,
          // Carried from the question. Absent => genuinely unanchored, not "unknown yet".
          syllabusNodeId: (q as any).syllabusNodeId,
          syllabusId: (q as any).syllabusId,
          cycleId: (q as any).cycleId,
          identityStatus: (q as any).identityStatus || 'UNANCHORED',
          occurredAt,
        });
      }

      void eventBus.publish('learning.test_completed', {
        userId: attempt.userId,
        attemptId: attempt.id,
        testId: attempt.testId,
        subject: test.subject,
        totalQuestions: questions.length,
        correctCount,
        skippedCount: questions.length - totalAttempted,
        accuracy,
        score,
        totalTimeSeconds: totalTimeSpent,
        topicBreakdown: Array.from(byTopic.entries()).map(([topic, s]) => ({
          topic,
          attempted: s.attempted,
          correct: s.correct,
          skipped: s.skipped,
          syllabusNodeId: s.syllabusNodeId,
          syllabusId: s.syllabusId,
          cycleId: s.cycleId,
          identityStatus: s.identityStatus,
        })),
        occurredAt,
      }, {
        // DETERMINISTIC identity, derived from the domain rather than random: an attempt can be
        // completed exactly once (processSubmission returns early for a completed attempt), so
        // the attempt id uniquely names this logical event. Deriving it this way means a
        // republish after a retry or restart carries the SAME id and is deduplicated, which a
        // randomly-generated id could never achieve.
        eventId: `learning.test_completed:${attempt.id}`,
      });
    } catch (err) {
      console.error('[ResultAnalysis] Failed to emit learning events (non-fatal)', err);
    }

    // Award XP for completing test
    try {
      await this.statsService.awardXP(attempt.userId, 'QUIZ_COMPLETE');
      if (accuracy >= 75) {
        await this.statsService.awardXP(attempt.userId, 'QUIZ_HIGH_SCORE');
      }
    } catch (e) {
      console.error('[ResultAnalysis] Failed to award test completion XP', e);
    }

    // If needs revision, add a task to the planner
    if (needsRevision) {
      try {
        const today = new Date().toISOString().split('T')[0];
        await this.plannerService.addTask(attempt.userId, today, {
          id: `rec_${uuidv4()}`,
          title: `Revision: ${test.title}`,
          type: 'revision',
          chapter: test.topic || test.subject || 'General',
          topic: test.topic || 'General',
          estimatedMinutes: 30,
          completed: false,
          priority: 'high'
        });
      } catch (e) {
        console.error("Failed to add AI recovery task to planner", e);
      }
    }

    return attempt;
  }
}

export const resultAnalysisService = new ResultAnalysisService();
