/**
 * PYQTaxonomyNormalizer — Exam-Aware Subject and Topic Taxonomy Reconciliation
 *
 * Normalizes free-form raw labels into canonical subjects and maps questions onto authoritative
 * syllabus nodes in `exam_syllabi_graphs` when available.
 */

import { syllabusGraphService } from '../exam/syllabusGraph.service';
import { CanonicalPYQQuestion } from '../../types/pyq.types';
import { logger } from '../../utils/logger';

export class PYQTaxonomyNormalizer {
  // Standard subject aliases per exam category
  private static SUBJECT_ALIASES: Record<string, Record<string, string>> = {
    JEE_MAIN: {
      'phys': 'Physics',
      'phy': 'Physics',
      'physics': 'Physics',
      'chem': 'Chemistry',
      'chemistry': 'Chemistry',
      'math': 'Mathematics',
      'maths': 'Mathematics',
      'mathematics': 'Mathematics',
    },
    JEE_ADVANCED: {
      'physics': 'Physics',
      'chemistry': 'Chemistry',
      'mathematics': 'Mathematics',
      'maths': 'Mathematics',
    },
    NEET_UG: {
      'physics': 'Physics',
      'chemistry': 'Chemistry',
      'biology': 'Biology',
      'botany': 'Biology',
      'zoology': 'Biology',
    },
    SSC_CGL: {
      'quantitative aptitude': 'Quantitative Aptitude',
      'quant': 'Quantitative Aptitude',
      'math': 'Quantitative Aptitude',
      'general intelligence & reasoning': 'General Intelligence & Reasoning',
      'reasoning': 'General Intelligence & Reasoning',
      'general awareness': 'General Awareness',
      'gk': 'General Awareness',
      'gs': 'General Awareness',
      'english comprehension': 'English Comprehension',
      'english': 'English Comprehension',
    },
    UPSC_CSE: {
      'gs paper 1': 'General Studies I',
      'general studies': 'General Studies I',
      'csat': 'General Studies II (CSAT)',
      'general studies 2': 'General Studies II (CSAT)',
    },
    IBPS_PO: {
      'quantitative aptitude': 'Quantitative Aptitude',
      'reasoning ability': 'Reasoning Ability',
      'english language': 'English Language',
      'general awareness': 'General Awareness',
    },
    RRB_NTPC: {
      'mathematics': 'Mathematics',
      'general intelligence and reasoning': 'General Intelligence & Reasoning',
      'general awareness': 'General Awareness',
    },
  };

  /**
   * Normalizes subject name using canonical exam dictionaries.
   */
  public normalizeSubject(examId: string, rawSubject?: string): string {
    if (!rawSubject || !rawSubject.trim()) return 'General';

    const clean = rawSubject.trim().toLowerCase();
    const examMap = PYQTaxonomyNormalizer.SUBJECT_ALIASES[examId] || {};

    if (examMap[clean]) return examMap[clean];

    // Case-insensitive lookup
    for (const [alias, canonical] of Object.entries(examMap)) {
      if (clean.includes(alias) || alias.includes(clean)) {
        return canonical;
      }
    }

    // Capitalize first letter of each word if unknown
    return rawSubject
      .trim()
      .split(/\s+/)
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
      .join(' ');
  }

  /**
   * Reconciles a question's topic to canonical syllabus graph nodes where possible.
   */
  public async linkToSyllabusNode(
    question: CanonicalPYQQuestion,
    cycleId: string = '2026'
  ): Promise<{ syllabusNodeId?: string; normalizedTopic?: string }> {
    try {
      const canonicalSubject = this.normalizeSubject(question.examId, question.subject);
      question.subject = canonicalSubject;

      if (!question.topic) {
        return { normalizedTopic: question.subject };
      }

      // Check if canonical syllabus graph exists for this exam
      const nodes = await syllabusGraphService.getSyllabusNodes({
        examId: question.examId,
        cycleId,
      }).catch(() => []);
      if (!nodes || nodes.length === 0) {
        return { normalizedTopic: question.topic };
      }

      const rawTopicNorm = question.topic.trim().toLowerCase();

      // Find matching topic node in the syllabus graph
      const matchedNode = nodes.find((n) => {
        const labelNorm = n.label.toLowerCase();
        return (
          labelNorm === rawTopicNorm ||
          labelNorm.includes(rawTopicNorm) ||
          rawTopicNorm.includes(labelNorm)
        );
      });

      if (matchedNode) {
        logger.debug(
          `[PYQTaxonomyNormalizer] Linked ${question.questionId} to canonical node ${matchedNode.id} (${matchedNode.label})`
        );
        return {
          syllabusNodeId: matchedNode.id,
          normalizedTopic: matchedNode.label,
        };
      }

      return { normalizedTopic: question.topic };
    } catch (e: any) {
      logger.warn(`[PYQTaxonomyNormalizer] Node linking skipped: ${e?.message}`);
      return { normalizedTopic: question.topic };
    }
  }

  /**
   * Normalizes a batch of canonical questions with exam-aware taxonomies.
   */
  public async normalizeQuestionsBatch(
    questions: CanonicalPYQQuestion[],
    cycleId: string = '2026'
  ): Promise<CanonicalPYQQuestion[]> {
    const examNodesCache = new Map<string, any[]>();

    for (const q of questions) {
      q.subject = this.normalizeSubject(q.examId, q.subject);
      
      const cacheKey = `${q.examId}:${cycleId}`;
      if (!examNodesCache.has(cacheKey)) {
        const nodes = await syllabusGraphService.getSyllabusNodes({
          examId: q.examId,
          cycleId,
        }).catch(() => []);
        examNodesCache.set(cacheKey, nodes || []);
      }

      const nodes = examNodesCache.get(cacheKey) || [];
      if (nodes.length > 0 && q.topic) {
        const rawTopicNorm = q.topic.trim().toLowerCase();
        const matchedNode = nodes.find((n) => {
          const labelNorm = n.label.toLowerCase();
          return (
            labelNorm === rawTopicNorm ||
            labelNorm.includes(rawTopicNorm) ||
            rawTopicNorm.includes(labelNorm)
          );
        });
        if (matchedNode) {
          q.syllabusNodeId = matchedNode.id;
          q.topic = matchedNode.label;
        }
      }
    }
    return questions;
  }
}

export const pyqTaxonomyNormalizer = new PYQTaxonomyNormalizer();
