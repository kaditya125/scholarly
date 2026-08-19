import { testsRepository } from '../../repositories/tests.repository';
import { TestAttempt, MockTest, Question } from '../../types/tests.types';
import { PlannerService } from '../planner.service';
import { v4 as uuidv4 } from 'uuid';

export class ResultAnalysisService {
  private plannerService = new PlannerService();
  async processSubmission(attemptId: string): Promise<TestAttempt> {
    const attempt = await testsRepository.getTestAttempt(attemptId);
    if (!attempt) throw new Error('Attempt not found');
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
    const byTopic = new Map<string, { correct: number; attempted: number; skipped: number }>();
    for (const q of questions) {
      const key = q.topic || q.subject || 'General';
      const entry = byTopic.get(key) || { correct: 0, attempted: 0, skipped: 0 };
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
        })),
        occurredAt,
      });
    } catch (err) {
      console.error('[ResultAnalysis] Failed to emit learning events (non-fatal)', err);
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
