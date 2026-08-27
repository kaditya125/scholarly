/**
 * PYQVerificationEngine — Cross-Source Answer Key and Question Verification
 *
 * Enforces:
 * 1. Official answer confirmation when Tier A is available.
 * 2. Cross-platform consensus between secondary sources when official key is absent.
 * 3. Conflict detection and flagging (`CONFLICTING`) when reputable sources disagree.
 * 4. Preservation of complete verification evidence trail.
 */

import {
  CanonicalPYQQuestion,
  PYQVerificationStatus,
  PYQProvenanceRecord,
} from '../../types/pyq.types';
import { logger } from '../../utils/logger';

export interface VerificationEvaluation {
  status: PYQVerificationStatus;
  canonicalAnswer: string;
  hasConflict: boolean;
  conflictDetails?: string;
  evidence: {
    officialAnswer?: string;
    secondaryAnswers: Record<string, string>;
    conflictDetails?: string;
    resolvedAt?: number;
  };
}

export class PYQVerificationEngine {
  /**
   * Evaluates and reconciles question data across multiple provenance sources.
   */
  public verifyQuestion(
    question: CanonicalPYQQuestion,
    additionalSources: {
      sourceName: string;
      sourceTier: 'TIER_A_OFFICIAL' | 'TIER_B_REPUTABLE_PLATFORM' | 'TIER_C_SECONDARY';
      answer?: string;
      solution?: string;
    }[] = []
  ): VerificationEvaluation {
    const answersBySource: Record<string, { tier: string; answer: string }> = {};

    // 1. Record primary provenance answer
    if (question.correctAnswer && question.correctAnswer !== 'UNVERIFIED') {
      answersBySource[question.correctAnswerSource || question.sourceType] = {
        tier: question.sourceType,
        answer: question.correctAnswer.trim().toUpperCase(),
      };
    }

    // 2. Record additional provenance answers
    for (const src of additionalSources) {
      if (src.answer && src.answer.trim().length > 0) {
        answersBySource[src.sourceName] = {
          tier: src.sourceTier,
          answer: src.answer.trim().toUpperCase(),
        };
      }
    }

    const secondaryAnswers: Record<string, string> = {};
    let officialAnswer: string | undefined;

    for (const [sourceName, entry] of Object.entries(answersBySource)) {
      if (entry.tier === 'TIER_A_OFFICIAL') {
        officialAnswer = entry.answer;
      } else {
        secondaryAnswers[sourceName] = entry.answer;
      }
    }

    // 3. Official Source Confirmation (Highest Authority)
    if (officialAnswer) {
      // Check if any secondary source disagrees with official answer
      const conflictingSecondary = Object.entries(secondaryAnswers).filter(
        ([_, ans]) => ans !== officialAnswer
      );

      if (conflictingSecondary.length > 0) {
        const details = `Secondary source(s) [${conflictingSecondary
          .map(([s, a]) => `${s}: ${a}`)
          .join(', ')}] disagree with Official Key (${officialAnswer}). Official key accepted as canonical.`;
        
        logger.warn(`[PYQVerificationEngine] ${question.questionId}: ${details}`);

        return {
          status: 'OFFICIAL_CONFIRMED',
          canonicalAnswer: officialAnswer,
          hasConflict: true,
          conflictDetails: details,
          evidence: {
            officialAnswer,
            secondaryAnswers,
            conflictDetails: details,
            resolvedAt: Date.now(),
          },
        };
      }

      return {
        status: 'OFFICIAL_CONFIRMED',
        canonicalAnswer: officialAnswer,
        hasConflict: false,
        evidence: {
          officialAnswer,
          secondaryAnswers,
          resolvedAt: Date.now(),
        },
      };
    }

    // 4. Secondary Sources Only (Cross-Check Consensus)
    const distinctAnswers = new Set(Object.values(secondaryAnswers));

    if (distinctAnswers.size === 0) {
      return {
        status: 'UNVERIFIED',
        canonicalAnswer: question.correctAnswer || 'UNVERIFIED',
        hasConflict: false,
        evidence: {
          secondaryAnswers: {},
        },
      };
    }

    if (distinctAnswers.size === 1) {
      const consensusAnswer = Array.from(distinctAnswers)[0];
      const sourceCount = Object.keys(secondaryAnswers).length;
      const status: PYQVerificationStatus =
        sourceCount >= 2 ? 'MULTI_SOURCE_CONFIRMED' : 'SECONDARY_CONFIRMED';

      return {
        status,
        canonicalAnswer: consensusAnswer,
        hasConflict: false,
        evidence: {
          secondaryAnswers,
          resolvedAt: Date.now(),
        },
      };
    }

    // 5. Conflict Detected Between Secondary Platforms
    const conflictSummary = Object.entries(secondaryAnswers)
      .map(([s, a]) => `${s}=>${a}`)
      .join(' vs ');
    const details = `Disagreement among secondary sources: ${conflictSummary}. Flagged for manual/official review.`;

    logger.warn(`[PYQVerificationEngine] CONFLICT on ${question.questionId}: ${details}`);

    return {
      status: 'CONFLICTING',
      canonicalAnswer: question.correctAnswer, // Retain primary but flag conflict
      hasConflict: true,
      conflictDetails: details,
      evidence: {
        secondaryAnswers,
        conflictDetails: details,
        resolvedAt: Date.now(),
      },
    };
  }

  /**
   * Applies verification to a Canonical Question and updates its state and evidence trail.
   */
  public applyVerification(
    question: CanonicalPYQQuestion,
    additionalSources: {
      sourceName: string;
      sourceTier: 'TIER_A_OFFICIAL' | 'TIER_B_REPUTABLE_PLATFORM' | 'TIER_C_SECONDARY';
      answer?: string;
      solution?: string;
    }[] = []
  ): CanonicalPYQQuestion {
    const evalResult = this.verifyQuestion(question, additionalSources);

    question.verificationStatus = evalResult.status;
    question.correctAnswer = evalResult.canonicalAnswer;
    question.verificationEvidence = evalResult.evidence;

    if (evalResult.status === 'CONFLICTING') {
      question.ingestionState = 'QUARANTINED';
    } else if (question.ingestionState === 'EXTRACTED') {
      question.ingestionState = 'VERIFIED';
    }

    question.updatedAt = Date.now();
    return question;
  }
}

export const pyqVerificationEngine = new PYQVerificationEngine();
