/**
 * RemediationDrillService — 1-Click Prerequisite Remediation Engine
 * =================================================================
 *
 * Closes the pedagogical feedback loop:
 * When a student struggles on an advanced topic (e.g. 40% in Rotational Dynamics),
 * the Concept Prerequisite Knowledge Graph pinpoints the root gap in an upstream
 * foundational concept (e.g. Torque & Static Equilibrium).
 *
 * Rather than just showing passive advice, this service automatically synthesizes a
 * focused 3-question diagnostic micro-drill targeting that exact prerequisite, creating
 * an instant 1-click remediation path for the student.
 */

import { GeminiProvider } from '../ai/gemini.provider';
import { quizAttemptsService } from '../tests/quizAttempts.service';
import { PedagogicalDiagnostic, StoredQuizQuestion, QuizAttempt } from '../../types/quizAttempt.types';
import { logger } from '../../utils/logger';

export interface RemediationDrillResult {
  drillAttemptId: string;
  drillTitle: string;
  rootCauseConcept: string;
  totalQuestions: number;
  diagnosticMessage: string;
}

/** One question as returned raw by the generation prompt, before validation. */
interface RawDrillQuestion {
  text?: unknown;
  options?: unknown;
  correctAnswerIndex?: unknown;
  explanation?: unknown;
}

/** Result of running a batch of raw questions through {@link validateStructure} + LLM verification. */
interface VerifiedQuestion {
  text: string;
  options: string[];
  correctAnswerIndex: number;
  explanation: string;
}

const MAX_GENERATION_ATTEMPTS = 2;

export class RemediationDrillService {
  private gemini = new GeminiProvider();

  /**
   * Generates a 3-question targeted remediation micro-drill for a diagnosed concept gap.
   *
   * Two validation passes sit between "the LLM wrote something" and "a student sees an
   * authoritative answer key": a cheap structural check (Module 4 audit finding — the old
   * version wrote `correctAnswerIndex` straight from the LLM with no bounds/uniqueness check
   * at all), then an independent LLM verification pass that re-derives the correct answer from
   * the question text alone and rejects anything ambiguous or where the derived answer disagrees
   * with what the generator claimed. Questions that fail either pass are dropped, and generation
   * retries (once) to try to backfill up to 3 — better to ship 1-2 verified questions than 3
   * where one silently teaches the wrong physics.
   */
  async generateDrillForDiagnostic(
    userId: string,
    diagnostic: PedagogicalDiagnostic
  ): Promise<RemediationDrillResult | null> {
    const concept = diagnostic.rootCauseTitle;
    const chapter = diagnostic.rootCauseChapter;

    logger.info(`[RemediationDrill] Generating 3-question micro-drill for concept: ${concept}`);

    const verified: VerifiedQuestion[] = [];
    const seenTexts = new Set<string>();

    for (let attempt = 1; attempt <= MAX_GENERATION_ATTEMPTS && verified.length < 3; attempt++) {
      const needed = 3 - verified.length;
      let raw: RawDrillQuestion[];
      try {
        raw = await this.generateRaw(concept, chapter, needed, [...seenTexts]);
      } catch (err: any) {
        logger.warn(`[RemediationDrill] Generation attempt ${attempt} failed:`, err?.message || err);
        continue;
      }

      const structurallyValid = raw
        .map(q => this.validateStructure(q))
        .filter((q): q is VerifiedQuestion => q !== null)
        .filter(q => !seenTexts.has(q.text.trim().toLowerCase()));

      if (structurallyValid.length === 0) continue;

      const answerVerified = await this.verifyAnswers(structurallyValid, concept);
      for (const q of answerVerified) {
        if (verified.length >= 3) break;
        verified.push(q);
        seenTexts.add(q.text.trim().toLowerCase());
      }
    }

    if (verified.length === 0) {
      logger.warn(`[RemediationDrill] No question survived structural + answer validation for concept: ${concept}`);
      return null;
    }
    if (verified.length < 3) {
      logger.warn(`[RemediationDrill] Only ${verified.length}/3 questions survived validation for concept: ${concept}; shipping a shorter drill rather than an unverified one.`);
    }

    try {
      const formattedQuestions: StoredQuizQuestion[] = verified.map((q, idx) => ({
        id: `drill_${Date.now()}_${idx + 1}`,
        text: q.text,
        topic: concept,
        options: q.options,
        correctAnswerIndex: q.correctAnswerIndex,
        explanation: q.explanation,
      }));

      // Create QuizAttempt in database
      const attempt = await quizAttemptsService.createFromQuestions(userId, formattedQuestions, {
        title: `Remediation Drill: ${concept}`,
        source: 'weak-areas',
        topic: concept,
        mode: 'study',
        durationMinutes: 10,
      });

      logger.info(`[RemediationDrill] Created remediation attempt: ${attempt.id} for user ${userId}`);

      return {
        drillAttemptId: attempt.id,
        drillTitle: attempt.title,
        rootCauseConcept: concept,
        totalQuestions: formattedQuestions.length,
        diagnosticMessage: diagnostic.diagnosticMessage,
      };
    } catch (err: any) {
      console.error('[RemediationDrill] Detailed error:', err);
      return null;
    }
  }

  /** Calls Gemini to draft `count` candidate questions, excluding any text already accepted. */
  private async generateRaw(
    concept: string,
    chapter: string,
    count: number,
    excludeTexts: string[]
  ): Promise<RawDrillQuestion[]> {
    const exclusion = excludeTexts.length
      ? `\nDo NOT repeat or closely rephrase any of these already-used questions:\n${excludeTexts.map(t => `- "${t}"`).join('\n')}`
      : '';

    const prompt = `You are a master physics/STEM educator preparing a diagnostic remediation quiz for a student who is struggling with advanced topics because of a fundamental conceptual gap.

Target Prerequisite Concept: "${concept}"
Relevant Chapter / Context: "${chapter}"

Generate exactly ${count} focused, high-yield multiple-choice questions specifically testing this foundational concept.
Each question must test conceptual understanding, common student misconceptions, or core formulas.
Each question must have exactly 4 distinct, unambiguous options with exactly one correct answer.${exclusion}

Return STRICTLY a JSON array of ${count} objects with this exact structure:
[
  {
    "text": "Question text here...",
    "options": ["Option A", "Option B", "Option C", "Option D"],
    "correctAnswerIndex": 0,
    "explanation": "Clear, concise conceptual explanation of why this answer is correct."
  }
]
No markdown wrapping, no introductory commentary. Only the raw JSON array.`;

    const aiResponse = await this.gemini.generateResponse(
      [{ role: 'user', content: prompt, timestamp: Date.now() }],
      undefined,
      {
        temperature: 0.3,
        responseJson: true,
        model: 'gemini-2.5-flash',
      }
    );

    const rawText = aiResponse?.reply || '';
    const cleanJson = rawText.replace(/^```json\s*/i, '').replace(/```\s*$/i, '').trim();
    let parsed: any;
    try {
      parsed = JSON.parse(cleanJson);
    } catch (jsonErr: any) {
      logger.warn('[RemediationDrill] JSON parse error on generation output:', cleanJson);
      throw jsonErr;
    }

    if (!Array.isArray(parsed) || parsed.length === 0) {
      throw new Error('LLM generated invalid question array structure');
    }
    return parsed;
  }

  /**
   * Cheap, deterministic checks that need no LLM call: exactly 4 options, all non-empty and
   * distinct, and `correctAnswerIndex` an in-range integer. This is the check that was entirely
   * absent before — `correctAnswerIndex` used to be trusted verbatim regardless of value.
   */
  private validateStructure(q: RawDrillQuestion): VerifiedQuestion | null {
    const text = typeof q.text === 'string' ? q.text.trim() : '';
    if (!text) return null;

    const options = Array.isArray(q.options)
      ? q.options.filter((o): o is string => typeof o === 'string' && o.trim().length > 0).map(o => o.trim())
      : [];
    if (options.length !== 4) return null;

    const uniqueOptions = new Set(options.map(o => o.toLowerCase()));
    if (uniqueOptions.size !== 4) return null; // duplicate/near-duplicate options

    const idx = q.correctAnswerIndex;
    if (typeof idx !== 'number' || !Number.isInteger(idx) || idx < 0 || idx > 3) return null;

    const explanation = typeof q.explanation === 'string' && q.explanation.trim()
      ? q.explanation.trim()
      : 'Foundational conceptual problem.';

    return { text, options, correctAnswerIndex: idx, explanation };
  }

  /**
   * Independent LLM pass that re-derives the correct answer from the question text alone
   * (without being told what the generator claimed) and keeps only questions where that
   * derivation agrees with `correctAnswerIndex` and the question is judged unambiguous.
   * This is what actually catches a wrong or ambiguous answer key, rather than just checking
   * that *some* valid-looking index was present.
   */
  private async verifyAnswers(questions: VerifiedQuestion[], concept: string): Promise<VerifiedQuestion[]> {
    if (questions.length === 0) return [];

    const prompt = `You are an expert STEM answer-key auditor. For each question below, independently determine the single correct option index (0-3) from the question and options alone — do not assume any index is already correct.

Concept being tested: "${concept}"

Questions:
${JSON.stringify(questions.map((q, i) => ({ index: i, text: q.text, options: q.options })), null, 2)}

For each question, return whether it is unambiguous (exactly one option is clearly correct, no flawed premise, no two options both defensible) and what you independently determine the correct index to be.

Return STRICTLY a JSON array, one entry per input question in the same order:
[
  { "index": 0, "unambiguous": true, "correctAnswerIndex": 2 }
]
No markdown wrapping, no commentary. Only the raw JSON array.`;

    try {
      const aiResponse = await this.gemini.generateResponse(
        [{ role: 'user', content: prompt, timestamp: Date.now() }],
        undefined,
        {
          temperature: 0,
          responseJson: true,
          model: 'gemini-2.5-flash',
        }
      );

      const rawText = aiResponse?.reply || '';
      const cleanJson = rawText.replace(/^```json\s*/i, '').replace(/```\s*$/i, '').trim();
      const verdicts: Array<{ index: number; unambiguous: boolean; correctAnswerIndex: number }> = JSON.parse(cleanJson);

      const byIndex = new Map(verdicts.map(v => [v.index, v]));
      const kept: VerifiedQuestion[] = [];

      questions.forEach((q, i) => {
        const verdict = byIndex.get(i);
        if (!verdict) {
          logger.warn(`[RemediationDrill] No verification verdict returned for question ${i}; dropping rather than trusting an unverified answer key.`);
          return;
        }
        if (!verdict.unambiguous) {
          logger.warn(`[RemediationDrill] Dropping ambiguous question: "${q.text.slice(0, 80)}..."`);
          return;
        }
        if (verdict.correctAnswerIndex !== q.correctAnswerIndex) {
          logger.warn(`[RemediationDrill] Answer-key mismatch on "${q.text.slice(0, 80)}..." — generator said index ${q.correctAnswerIndex}, verifier independently derived ${verdict.correctAnswerIndex}. Dropping.`);
          return;
        }
        kept.push(q);
      });

      return kept;
    } catch (err: any) {
      // If the verification pass itself fails (parse error, API failure), fail closed: don't
      // ship an answer key that was never independently checked.
      logger.warn('[RemediationDrill] Answer verification pass failed; dropping unverified batch:', err?.message || err);
      return [];
    }
  }
}

export const remediationDrillService = new RemediationDrillService();
