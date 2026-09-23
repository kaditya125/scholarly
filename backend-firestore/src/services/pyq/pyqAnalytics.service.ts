/**
 * PYQAnalyticsService — PYQ Historical Analytics and Topic Pattern Intelligence
 *
 * Computes:
 * - Question frequency by topic, chapter, and subject across historical years
 * - Topic weightage trends and recurring concept analysis
 * - Difficulty and question-type distribution
 * - Preparation priority insights for student personalization
 */

import { pyqRepository } from '../../repositories/pyq.repository';
import {
  CanonicalPYQQuestion,
  PYQExamAnalytics,
  PYQTopicWeightage,
  PYQDifficulty,
  PYQQuestionType,
} from '../../types/pyq.types';
import { logger } from '../../utils/logger';
import { cacheService } from '../cache.service';

/**
 * How long a Firestore-persisted analytics document is trusted before a fresh full-corpus scan is
 * forced. Matches the in-memory cache's own TTL (3600s) below, so both tiers agree on staleness.
 */
const ANALYTICS_TTL_MS = 3600 * 1000;

export class PYQAnalyticsService {
  /**
   * Computes comprehensive PYQ analytics for an examination.
   *
   * Two cache tiers, cheapest first:
   *  1. `cacheService` (in-memory per-process, or Redis when configured) — near-instant, but does
   *     NOT survive a process restart. Every fresh process (a new MCP server invocation, a
   *     redeploy, a dev-server restart) starts with this empty.
   *  2. The `pyq_analytics` Firestore doc `saveExamAnalytics` already writes at the end of every
   *     full computation below — durable, survives restarts, one Firestore read. This tier used
   *     to be write-only: the doc was saved every time but never read back, so a full 14,000+
   *     question corpus scan (SSC CGL: ~45s) ran on literally every cold process, discarding a
   *     perfectly good result that was already sitting in Firestore from the last computation.
   *
   * A persisted doc older than ANALYTICS_TTL_MS is still returned immediately, with a rescan
   * started in the background. Only when no doc exists at all (first time ever for this exam)
   * does a caller wait on the full scan.
   */
  async computeExamAnalytics(examId: string): Promise<PYQExamAnalytics> {
    const cacheKey = `pyq_analytics_${examId.toUpperCase()}`;
    const cached = await cacheService.get<PYQExamAnalytics>(cacheKey).catch(() => null);
    if (cached) {
      return cached;
    }

    const persisted = await pyqRepository.getExamAnalytics(examId).catch(() => null);
    if (persisted && Date.now() - persisted.updatedAt < ANALYTICS_TTL_MS) {
      await cacheService.set(cacheKey, persisted, 3600).catch(() => {});
      return persisted;
    }

    // Stale but present: serve it now and refresh in the background. The corpus changes on the
    // scale of days, while a full rescan costs 30–45 s and ~14,000 Firestore reads — a student
    // waiting on a chat answer (Deep search calls this) must never sit through that.
    if (persisted) {
      this.refreshInBackground(examId, cacheKey);
      return persisted;
    }
    return this.recomputeExamAnalytics(examId, cacheKey);
  }

  /** One background rescan per exam at a time; concurrent stale reads share it. */
  private refreshing = new Map<string, Promise<PYQExamAnalytics>>();

  private refreshInBackground(examId: string, cacheKey: string): void {
    const key = examId.toUpperCase();
    if (this.refreshing.has(key)) return;
    const run = this.recomputeExamAnalytics(examId, cacheKey)
      .catch((e) => {
        logger.warn('[PYQAnalytics] background refresh failed; stale analytics stay in use', { examId, error: String(e?.message || e) });
        return null as any;
      })
      .finally(() => this.refreshing.delete(key));
    this.refreshing.set(key, run);
  }

  private async recomputeExamAnalytics(examId: string, cacheKey: string): Promise<PYQExamAnalytics> {
    // Paged, not capped. The previous `limit: 10000` silently excluded 4,009 of SSC CGL's 14,009
    // questions from its own pattern profile — and a truncated distribution still looks plausible,
    // so nothing downstream could notice.
    const questions = await pyqRepository.listAllQuestions({ examId });
    logger.info('[PYQAnalytics] corpus loaded for pattern analysis', { examId, questionCount: questions.length });

    if (questions.length === 0) {
      return {
        examId,
        totalQuestions: 0,
        yearsCovered: [],
        subjectDistribution: {},
        difficultyDistribution: { EASY: 0, MEDIUM: 0, HARD: 0 },
        questionTypeDistribution: {
          MCQ_SINGLE: 0,
          MCQ_MULTIPLE: 0,
          NUMERICAL: 0,
          ASSERTION_REASON: 0,
          MATCH_FOLLOWING: 0,
          PASSAGE_COMPREHENSION: 0,
        },
        topTopics: [],
        updatedAt: Date.now(),
      };
    }

    const yearsSet = new Set<number>();
    const subjectMap: Record<string, number> = {};
    const difficultyMap: Record<PYQDifficulty, number> = { EASY: 0, MEDIUM: 0, HARD: 0 };
    const questionTypeMap: Record<PYQQuestionType, number> = {
      MCQ_SINGLE: 0,
      MCQ_MULTIPLE: 0,
      NUMERICAL: 0,
      ASSERTION_REASON: 0,
      MATCH_FOLLOWING: 0,
      PASSAGE_COMPREHENSION: 0,
    };

    // Topic aggregator: key = `${subject}::${topic}`
    const topicAggregator = new Map<
      string,
      {
        topic: string;
        subject: string;
        count: number;
        years: Set<number>;
        difficulties: PYQDifficulty[];
        types: Set<PYQQuestionType>;
      }
    >();

    for (const q of questions) {
      yearsSet.add(q.year);

      // Subject
      subjectMap[q.subject] = (subjectMap[q.subject] || 0) + 1;

      // Difficulty
      const diff = q.difficulty || 'MEDIUM';
      difficultyMap[diff] = (difficultyMap[diff] || 0) + 1;

      // Question Type
      const qType = q.questionType || 'MCQ_SINGLE';
      questionTypeMap[qType] = (questionTypeMap[qType] || 0) + 1;

      // Topic Aggregation
      const topicName = q.topic || q.chapter || 'Core Concepts';
      const topicKey = `${q.subject}::${topicName}`;

      if (!topicAggregator.has(topicKey)) {
        topicAggregator.set(topicKey, {
          topic: topicName,
          subject: q.subject,
          count: 0,
          years: new Set<number>(),
          difficulties: [],
          types: new Set<PYQQuestionType>(),
        });
      }

      const item = topicAggregator.get(topicKey)!;
      item.count++;
      item.years.add(q.year);
      item.difficulties.push(diff);
      item.types.add(qType);
    }

    const totalQ = questions.length;
    const topTopics: PYQTopicWeightage[] = Array.from(topicAggregator.values())
      .map((item) => {
        // Compute average difficulty mode
        const hardCount = item.difficulties.filter((d) => d === 'HARD').length;
        const easyCount = item.difficulties.filter((d) => d === 'EASY').length;
        const avgDifficulty: PYQDifficulty =
          hardCount > item.difficulties.length / 2
            ? 'HARD'
            : easyCount > item.difficulties.length / 2
            ? 'EASY'
            : 'MEDIUM';

        return {
          topic: item.topic,
          subject: item.subject,
          questionCount: item.count,
          percentageWeight: Math.round((item.count / totalQ) * 1000) / 10, // e.g. 14.5%
          yearsAppeared: Array.from(item.years).sort((a, b) => a - b),
          averageDifficulty: avgDifficulty,
          commonQuestionTypes: Array.from(item.types),
        };
      })
      .sort((a, b) => b.questionCount - a.questionCount);

    const analytics: PYQExamAnalytics = {
      examId,
      totalQuestions: totalQ,
      yearsCovered: Array.from(yearsSet).sort((a, b) => a - b),
      subjectDistribution: subjectMap,
      difficultyDistribution: difficultyMap,
      questionTypeDistribution: questionTypeMap,
      topTopics: topTopics.slice(0, 25), // Top 25 high-weightage topics
      updatedAt: Date.now(),
    };

    // Save cache to repository and cacheService
    await pyqRepository.saveExamAnalytics(analytics);
    await cacheService.set(cacheKey, analytics, 3600).catch(() => {});
    return analytics;
  }

  /**
   * Generates student-tailored study recommendations by combining PYQ topic weightages with student accuracy.
   */
  public generatePersonalizedPriorities(
    analytics: PYQExamAnalytics,
    studentWeakTopics: string[] = []
  ): {
    highYieldWeakTopics: PYQTopicWeightage[];
    masteryRecommendations: string[];
  } {
    const weakSet = new Set(studentWeakTopics.map((t) => t.toLowerCase().trim()));

    const highYieldWeakTopics = analytics.topTopics.filter((topic) =>
      weakSet.has(topic.topic.toLowerCase().trim())
    );

    const masteryRecommendations: string[] = [];

    for (const hw of highYieldWeakTopics.slice(0, 5)) {
      masteryRecommendations.push(
        `High Priority: "${hw.topic}" in ${hw.subject} accounts for ${hw.percentageWeight}% of historical questions and appeared in ${hw.yearsAppeared.length} exam cycles.`
      );
    }

    return {
      highYieldWeakTopics,
      masteryRecommendations,
    };
  }

  /**
   * Returns a standardized ExamPatternProfile for test generation blueprints and revision prioritization.
   */
  public async getExamPatternProfile(examId: string): Promise<any> {
    const analytics = await this.computeExamAnalytics(examId);
    return {
      examId: analytics.examId,
      totalQuestionsAnalyzed: analytics.totalQuestions,
      yearsCovered: analytics.yearsCovered,
      subjectDistribution: analytics.subjectDistribution,
      difficultyDistribution: analytics.difficultyDistribution,
      questionTypeDistribution: analytics.questionTypeDistribution,
      highYieldTopics: analytics.topTopics.map(t => ({
        topic: t.topic,
        subject: t.subject,
        questionCount: t.questionCount,
        percentageWeight: t.percentageWeight,
        yearsAppeared: t.yearsAppeared,
      })),
      recentTrends: analytics.topTopics.slice(0, 3).map(
        t => `Frequently tested in recent cycles: ${t.topic} (${t.subject}, ~${t.percentageWeight}% weight)`
      ),
    };
  }
}

export const pyqAnalyticsService = new PYQAnalyticsService();
