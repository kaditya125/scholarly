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

export class PYQAnalyticsService {
  /**
   * Computes comprehensive PYQ analytics for an examination.
   */
  async computeExamAnalytics(examId: string): Promise<PYQExamAnalytics> {
    const questions = await pyqRepository.listQuestions({ examId, limit: 10000 });

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

    // Save cache to repository
    await pyqRepository.saveExamAnalytics(analytics);
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
}

export const pyqAnalyticsService = new PYQAnalyticsService();
