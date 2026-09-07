/**
 * PYQDeduplicationEngine — Multi-Factor Question Deduplication and Provenance Merging
 *
 * Ensures that if the same historical PYQ is extracted from:
 *   - Official Exam Site
 *   - Careers360
 *   - Testbook
 *   - Adda247
 *
 * it is NEVER duplicated in the database or vector store.
 * Instead, multiple provenance records are merged into ONE Canonical Question.
 */

import {
  CanonicalPYQQuestion,
  PYQProvenanceRecord,
} from '../../types/pyq.types';
import { logger } from '../../utils/logger';

export class PYQDeduplicationEngine {
  /**
   * Computes word-level Jaccard similarity between two question texts.
   */
  public computeTextSimilarity(textA: string, textB: string): number {
    const tokenize = (t: string) =>
      new Set(
        t
          .toLowerCase()
          .replace(/[^\w\s]/g, '')
          .split(/\s+/)
          .filter((w) => w.length > 2)
      );

    const setA = tokenize(textA);
    const setB = tokenize(textB);

    if (setA.size === 0 && setB.size === 0) return 1.0;
    if (setA.size === 0 || setB.size === 0) return 0.0;

    let intersectionSize = 0;
    for (const word of setA) {
      if (setB.has(word)) intersectionSize++;
    }

    const unionSize = setA.size + setB.size - intersectionSize;
    return intersectionSize / unionSize;
  }

  /**
   * Merges multiple candidate questions into a deduplicated canonical question set with combined provenance.
   * Uses cross-year content identity so duplicate templates do not artificially inflate the corpus,
   * while preserving legitimate historical paper occurrences in provenance records.
   */
  public deduplicateQuestions(incomingQuestions: CanonicalPYQQuestion[]): CanonicalPYQQuestion[] {
    const canonicalMap = new Map<string, CanonicalPYQQuestion>();
    let duplicateCount = 0;

    for (const q of incomingQuestions) {
      // Cross-year content identity: examId + contentHash (ignoring paper/year/shift in hash)
      const contentKey = `${q.examId}:${q.contentHash}`;

      // 1. Primary check: Exact Content Hash Match within same exam
      if (canonicalMap.has(contentKey)) {
        this.mergeProvenance(canonicalMap.get(contentKey)!, q);
        duplicateCount++;
        continue;
      }

      // 2. Secondary check: Text similarity >= 90% within same exam
      let matchedKey: string | null = null;
      for (const [hashKey, existing] of canonicalMap.entries()) {
        if (existing.examId === q.examId) {
          const similarity = this.computeTextSimilarity(existing.questionText, q.questionText);
          if (similarity >= 0.90) {
            matchedKey = hashKey;
            break;
          }
        }
      }

      if (matchedKey) {
        this.mergeProvenance(canonicalMap.get(matchedKey)!, q);
        duplicateCount++;
      } else {
        canonicalMap.set(contentKey, q);
      }
    }

    logger.info(
      `[PYQDeduplicationEngine] Processed ${incomingQuestions.length} questions -> ${canonicalMap.size} canonical (${duplicateCount} duplicates merged)`
    );

    return Array.from(canonicalMap.values());
  }

  /**
   * Merges provenance records, solutions, and diagrams from duplicate candidate into existing canonical question.
   */
  private mergeProvenance(target: CanonicalPYQQuestion, incoming: CanonicalPYQQuestion): void {
    // 1. Merge Provenance Records (avoid duplicate URLs)
    const existingUrls = new Set(target.provenanceRecords.map((p) => p.sourceUrl));
    for (const p of incoming.provenanceRecords) {
      if (!existingUrls.has(p.sourceUrl)) {
        target.provenanceRecords.push(p);
        existingUrls.add(p.sourceUrl);
      }
    }

    // 2. Promote Official Tier A source if incoming has it
    if (incoming.sourceType === 'TIER_A_OFFICIAL' && target.sourceType !== 'TIER_A_OFFICIAL') {
      target.sourceType = 'TIER_A_OFFICIAL';
      target.sourceId = incoming.sourceId;
      target.sourceUrl = incoming.sourceUrl;
      target.correctAnswerSource = incoming.correctAnswerSource;
      target.correctAnswer = incoming.correctAnswer;
      target.verificationStatus = 'OFFICIAL_CONFIRMED';
    }

    // 3. Adopt richer solution or explanation if target lacks it
    if (!target.solution && incoming.solution) {
      target.solution = incoming.solution;
      target.solutionSource = incoming.solutionSource;
    }
    if (!target.explanation && incoming.explanation) {
      target.explanation = incoming.explanation;
    }

    // 4. Adopt diagrams if missing in target
    if ((!target.diagrams || target.diagrams.length === 0) && incoming.diagrams && incoming.diagrams.length > 0) {
      target.diagrams = incoming.diagrams;
    }

    // 5. Higher extraction quality score wins
    if (incoming.extractionQualityScore > target.extractionQualityScore) {
      target.extractionQualityScore = incoming.extractionQualityScore;
    }

    target.updatedAt = Date.now();
  }
}

export const pyqDeduplicationEngine = new PYQDeduplicationEngine();
