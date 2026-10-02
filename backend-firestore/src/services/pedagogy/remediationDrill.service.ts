/**
 * RemediationDrillService — "Fix this gap": a 3-question drill on a diagnosed prerequisite gap.
 * ===========================================================================================
 *
 * On demand only. Quiz submission stores a diagnosis (conceptGraph.service) and the student
 * decides whether to drill it; generating on every submission would spend two Gemini calls on
 * drills nobody opens.
 *
 *   POST /api/quiz/attempts/:attemptId/remediation-drill { diagnosticId }
 *     → claim (transaction: ownership, diagnostic exists, no drill yet, no generation in flight)
 *     → quota check
 *     → generate 3 MCQs targeting the ROOT-CAUSE concept (not the failed topic) via Gemini Flash
 *       with responseJson, structural validation, and an INDEPENDENT answer-verification pass
 *     → fewer than 3 verified questions → fail closed (REMEDIATION_GENERATION_FAILED), nothing saved
 *     → createFromQuestions() → quiz_attempts, tagged with remediationSource
 *     → drill reference written onto the diagnostic (first writer wins) → quota consumed
 *
 * PREREQUISITES_UNASSESSED diagnoses get a PREREQUISITE_CHECK drill instead: one question per
 * unassessed prerequisite. Its questions are topic-labelled with the concept name and carry the
 * exam id, so when the student submits it the graph has the evidence it lacked.
 */

import { GeminiProvider } from '../ai/gemini.provider';
import { quizAttemptsService } from '../tests/quizAttempts.service';
import { quizAttemptsRepository } from '../../repositories/quizAttempts.repository';
import { conceptGraphService } from './conceptGraph.service';
import { usageService } from '../usage.service';
import type { MeteredFeature } from '../entitlement.service';
import {
  PedagogicalDiagnostic, StoredQuizQuestion, RemediationDrillRef, RemediationDrillKind,
} from '../../types/quizAttempt.types';
import { logger } from '../../utils/logger';

export const REMEDIATION_QUESTION_COUNT = 3;
export const REMEDIATION_MODEL = 'gemini-2.5-flash';
/** Drills are AI-generated quizzes: metered with the same allowance agent-generated quizzes use. */
export const REMEDIATION_METERED_FEATURE: MeteredFeature = 'artifactGenerations';
const MAX_GENERATION_ATTEMPTS = 3;

export type RemediationErrorCode =
  | 'NOT_FOUND'
  | 'DIAGNOSTIC_NOT_FOUND'
  | 'DIAGNOSTIC_UNSUPPORTED'
  | 'REMEDIATION_IN_PROGRESS'
  | 'QUOTA_EXCEEDED'
  | 'REMEDIATION_GENERATION_FAILED';

const STATUS_BY_CODE: Record<RemediationErrorCode, number> = {
  NOT_FOUND: 404,
  DIAGNOSTIC_NOT_FOUND: 404,
  DIAGNOSTIC_UNSUPPORTED: 422,
  REMEDIATION_IN_PROGRESS: 409,
  QUOTA_EXCEEDED: 403,
  REMEDIATION_GENERATION_FAILED: 502,
};

export class RemediationError extends Error {
  readonly status: number;
  constructor(readonly code: RemediationErrorCode, message: string, readonly details?: Record<string, unknown>) {
    super(message);
    this.name = 'RemediationError';
    this.status = STATUS_BY_CODE[code];
  }
}

export interface RemediationOutcome {
  /** CREATED: generated now. EXISTS: a drill was already generated for this diagnostic. */
  status: 'CREATED' | 'EXISTS';
  drill: RemediationDrillRef;
}

type Difficulty = 'easy' | 'medium' | 'hard';

export interface VerifiedQuestion {
  text: string;
  options: string[];
  correctAnswerIndex: number;
  explanation: string;
  difficulty: Difficulty;
}

interface RawDrillQuestion {
  text?: unknown;
  options?: unknown;
  correctAnswerIndex?: unknown;
  explanation?: unknown;
  difficulty?: unknown;
}

interface DrillTarget { conceptId: string; name: string; chapter: string; count: number }

export interface LlmClient {
  generateResponse(messages: any[], tools?: any, opts?: any): Promise<{ reply?: string } | any>;
}

export class RemediationDrillService {
  constructor(private readonly gemini: LlmClient = new GeminiProvider()) {}

  async generateForDiagnostic(userId: string, attemptId: string, diagnosticId: string): Promise<RemediationOutcome> {
    const claim = await quizAttemptsRepository.claimRemediation(userId, attemptId, diagnosticId);
    switch (claim.status) {
      case 'NOT_FOUND': throw new RemediationError('NOT_FOUND', 'Test not found');
      case 'NO_DIAGNOSTIC': throw new RemediationError('DIAGNOSTIC_NOT_FOUND', 'No such diagnosis on this test');
      case 'EXISTS': return { status: 'EXISTS', drill: claim.drill };
      case 'IN_PROGRESS': throw new RemediationError('REMEDIATION_IN_PROGRESS', 'This drill is already being generated');
    }
    const { diagnostic } = claim;

    try {
      if (!diagnostic.remediationEligible) {
        throw new RemediationError('DIAGNOSTIC_UNSUPPORTED', 'This diagnosis does not support a remediation drill');
      }
      const quota = await usageService.checkQuota(userId, REMEDIATION_METERED_FEATURE, 1);
      if (!quota.allowed) {
        throw new RemediationError('QUOTA_EXCEEDED', 'Your monthly allowance of AI-generated practice is used up.', {
          limit: quota.limit, used: quota.used, resetsAt: quota.resetsAt,
        });
      }

      const { kind, targets } = this.planTargets(diagnostic);
      const questions: StoredQuizQuestion[] = [];
      for (const t of targets) {
        const verified = await this.generateVerified(t, questions.map((q) => q.text));
        if (verified.length < t.count) {
          throw new RemediationError('REMEDIATION_GENERATION_FAILED',
            `Could not produce ${t.count} independently verified question(s) on ${t.name}`,
            { concept: t.conceptId, verified: verified.length });
        }
        verified.slice(0, t.count).forEach((q) => questions.push({
          id: `drill_${Date.now()}_${questions.length + 1}`,
          text: q.text,
          topic: t.name,
          options: q.options,
          correctAnswerIndex: q.correctAnswerIndex,
          explanation: q.explanation,
          difficulty: q.difficulty,
          examId: diagnostic.examId,
          identityStatus: 'UNANCHORED',
          questionOrigin: 'GENERAL_KNOWLEDGE',
        }));
      }

      const targetConcept = targets.map((t) => t.name).join(', ');
      const title = kind === 'ROOT_CAUSE' ? `Fix the gap: ${targetConcept}` : `Prerequisite check: ${targetConcept}`;
      const attempt = await quizAttemptsService.createFromQuestions(userId, questions, {
        title,
        source: 'weak-areas',
        topic: targetConcept,
        mode: 'study',
        durationMinutes: 10,
        remediationSource: { attemptId, diagnosticId, kind },
      });

      const drill: RemediationDrillRef = {
        drillAttemptId: attempt.id,
        title,
        kind,
        targetConceptIds: targets.map((t) => t.conceptId),
        targetConcept,
        questionCount: questions.length,
        createdAt: attempt.createdAt,
      };
      const stored = await quizAttemptsRepository.attachRemediationDrill(userId, attemptId, diagnosticId, drill);
      if (stored.drillAttemptId !== drill.drillAttemptId) {
        // Only possible if a stale claim was taken over mid-generation; the earlier drill stands.
        logger.warn('[RemediationDrill] another drill was attached first; this one is unused', {
          attemptId, diagnosticId, kept: stored.drillAttemptId, unused: drill.drillAttemptId,
        });
      }
      await usageService.consumeQuota(userId, REMEDIATION_METERED_FEATURE, 1).catch((err: any) => {
        // Already checked above; a race to the limit is not worth failing a drill the student has.
        logger.warn('[RemediationDrill] quota consume failed after generation', { userId, error: err?.message });
      });

      logger.info('[RemediationDrill] drill created', {
        attemptId, diagnosticId, drillAttemptId: stored.drillAttemptId, kind, concepts: drill.targetConceptIds,
      });
      return { status: 'CREATED', drill: stored };
    } catch (err) {
      await quizAttemptsRepository.releaseRemediationClaim(attemptId, diagnosticId).catch((e: any) =>
        logger.error('[RemediationDrill] could not release claim', { attemptId, diagnosticId, error: e?.message }));
      if (err instanceof RemediationError) {
        logger.warn('[RemediationDrill] not generated', { attemptId, diagnosticId, code: err.code, details: err.details });
        throw err;
      }
      logger.error('[RemediationDrill] generation error', { attemptId, diagnosticId, error: (err as any)?.message });
      throw new RemediationError('REMEDIATION_GENERATION_FAILED', 'Could not generate the drill. Please try again.');
    }
  }

  /** Which concept(s) the drill targets, and how the 3 questions are split between them. */
  planTargets(d: PedagogicalDiagnostic): { kind: RemediationDrillKind; targets: DrillTarget[] } {
    const toTarget = (conceptId: string, count: number): DrillTarget => {
      const n = conceptGraphService.getNode(conceptId);
      if (!n) throw new RemediationError('DIAGNOSTIC_UNSUPPORTED', `Unknown concept ${conceptId}`);
      return { conceptId, name: n.name, chapter: n.chapter, count };
    };
    if (d.status !== 'PREREQUISITES_UNASSESSED') {
      if (!d.rootCauseConceptId) throw new RemediationError('DIAGNOSTIC_UNSUPPORTED', 'Diagnosis has no root-cause concept');
      return { kind: 'ROOT_CAUSE', targets: [toTarget(d.rootCauseConceptId, REMEDIATION_QUESTION_COUNT)] };
    }
    const unassessed = d.prerequisiteChain
      .filter((c) => c.evidence === 'unassessed' && c.conceptId !== d.targetConceptId)
      .map((c) => c.conceptId)
      .slice(0, REMEDIATION_QUESTION_COUNT);
    if (!unassessed.length) throw new RemediationError('DIAGNOSTIC_UNSUPPORTED', 'No unassessed prerequisites to check');
    // Spread 3 questions across up to 3 concepts: [3] / [2,1] / [1,1,1].
    const counts = unassessed.map((_, i) => Math.floor(REMEDIATION_QUESTION_COUNT / unassessed.length) + (i < REMEDIATION_QUESTION_COUNT % unassessed.length ? 1 : 0));
    return { kind: 'PREREQUISITE_CHECK', targets: unassessed.map((id, i) => toTarget(id, counts[i])) };
  }

  /** Generate → validate → independently verify, retrying until `t.count` survive or attempts run out. */
  async generateVerified(t: DrillTarget, alreadyUsed: string[]): Promise<VerifiedQuestion[]> {
    const verified: VerifiedQuestion[] = [];
    const seen = new Set(alreadyUsed.map((x) => x.trim().toLowerCase()));
    for (let attempt = 1; attempt <= MAX_GENERATION_ATTEMPTS && verified.length < t.count; attempt++) {
      let raw: RawDrillQuestion[];
      try {
        raw = await this.generateRaw(t.name, t.chapter, t.count - verified.length, [...seen]);
      } catch (err: any) {
        logger.warn('[RemediationDrill] generation attempt failed', { concept: t.conceptId, attempt, error: err?.message });
        continue;
      }
      const candidates = raw
        .map((q) => this.validateStructure(q))
        .filter((q): q is VerifiedQuestion => q !== null && !seen.has(q.text.trim().toLowerCase()));
      if (!candidates.length) continue;
      for (const q of await this.verifyAnswers(candidates, t.name)) {
        if (verified.length >= t.count) break;
        verified.push(q);
        seen.add(q.text.trim().toLowerCase());
      }
    }
    return verified;
  }

  private async generateRaw(concept: string, chapter: string, count: number, excludeTexts: string[]): Promise<RawDrillQuestion[]> {
    const exclusion = excludeTexts.length
      ? `\nDo NOT repeat or closely rephrase any of these already-used questions:\n${excludeTexts.map((t) => `- "${t}"`).join('\n')}`
      : '';
    const prompt = `You are preparing a short remediation drill for a student whose difficulty with a later topic traces back to a foundational concept.

Target concept: "${concept}"
Where it is taught: "${chapter}"

Write exactly ${count} multiple-choice question(s) that test conceptual understanding of THIS concept itself (not the later topic): the core idea, a common misconception, or the key relation/formula.
Each question has exactly 4 distinct options with exactly one unambiguously correct answer.${exclusion}

Return ONLY a JSON array of ${count} object(s):
[{ "text": "…", "options": ["…","…","…","…"], "correctAnswerIndex": 0, "explanation": "why the answer is correct", "difficulty": "easy" | "medium" | "hard" }]`;
    const res = await this.gemini.generateResponse(
      [{ role: 'user', content: prompt, timestamp: Date.now() }],
      undefined,
      { temperature: 0.3, responseJson: true, model: REMEDIATION_MODEL },
    );
    const parsed = parseJsonArray(res?.reply);
    if (!parsed.length) throw new Error('model returned no questions');
    return parsed;
  }

  /** Deterministic checks: 4 distinct non-empty options, integer index 0–3, non-empty text and explanation. */
  validateStructure(q: RawDrillQuestion): VerifiedQuestion | null {
    const text = typeof q.text === 'string' ? q.text.trim() : '';
    if (!text) return null;
    const options = Array.isArray(q.options)
      ? q.options.filter((o): o is string => typeof o === 'string' && o.trim().length > 0).map((o) => o.trim())
      : [];
    if (options.length !== 4 || new Set(options.map((o) => o.toLowerCase())).size !== 4) return null;
    const idx = q.correctAnswerIndex;
    if (typeof idx !== 'number' || !Number.isInteger(idx) || idx < 0 || idx > 3) return null;
    const explanation = typeof q.explanation === 'string' ? q.explanation.trim() : '';
    if (!explanation) return null;
    const difficulty: Difficulty = q.difficulty === 'easy' || q.difficulty === 'hard' ? q.difficulty : 'medium';
    return { text, options, correctAnswerIndex: idx, explanation, difficulty };
  }

  /**
   * Independent pass: a second call re-derives each answer from the question alone, without being
   * told the generator's index. Kept only when it is judged unambiguous AND the indices agree.
   * Any failure of this pass drops the whole batch — an unverified key never reaches a student.
   */
  async verifyAnswers(questions: VerifiedQuestion[], concept: string): Promise<VerifiedQuestion[]> {
    if (!questions.length) return [];
    const prompt = `You are an expert answer-key auditor. For each question, independently determine the single correct option index (0-3) from the question and options alone.

Concept being tested: "${concept}"

Questions:
${JSON.stringify(questions.map((q, i) => ({ index: i, text: q.text, options: q.options })), null, 2)}

For each, judge whether it is unambiguous (exactly one option clearly correct, no flawed premise, no two defensible options) and give your index.
Return ONLY a JSON array, one entry per question, same order: [{ "index": 0, "unambiguous": true, "correctAnswerIndex": 2 }]`;
    try {
      const res = await this.gemini.generateResponse(
        [{ role: 'user', content: prompt, timestamp: Date.now() }],
        undefined,
        { temperature: 0, responseJson: true, model: REMEDIATION_MODEL },
      );
      const verdicts = parseJsonArray(res?.reply) as Array<{ index: number; unambiguous: boolean; correctAnswerIndex: number }>;
      const byIndex = new Map(verdicts.map((v) => [v.index, v]));
      return questions.filter((q, i) => {
        const v = byIndex.get(i);
        const ok = !!v && v.unambiguous === true && v.correctAnswerIndex === q.correctAnswerIndex;
        if (!ok) logger.warn('[RemediationDrill] question dropped by verification', { concept, reason: !v ? 'no_verdict' : !v.unambiguous ? 'ambiguous' : 'key_mismatch' });
        return ok;
      });
    } catch (err: any) {
      logger.warn('[RemediationDrill] verification pass failed; dropping unverified batch', { concept, error: err?.message });
      return [];
    }
  }
}

function parseJsonArray(reply: unknown): any[] {
  const clean = String(reply ?? '').replace(/^```json\s*/i, '').replace(/```\s*$/i, '').trim();
  const parsed = JSON.parse(clean);
  if (!Array.isArray(parsed)) throw new Error('expected a JSON array');
  return parsed;
}

export const remediationDrillService = new RemediationDrillService();
