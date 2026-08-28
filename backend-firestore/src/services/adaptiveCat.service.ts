import { UserProfileService } from './userProfile.service';
import { GeminiProvider } from './ai/gemini.provider';
import { logger } from '../utils/logger';

export interface AdaptiveQuestion {
  id: string;
  batchIndex: number;
  questionNumber: number;
  subject: string;
  topic: string;
  subtopic: string;
  difficulty: 'Easy' | 'Medium' | 'Hard' | 'Challenge';
  type: 'MCQ' | 'Assertion-Reason' | 'Match' | 'Numerical' | 'Short Answer' | 'Case-Based';
  question: string;
  options?: string[];
  correctAnswer: string | number;
  explanation: string;
  estimatedTimeSeconds: number;
  knowledgeGraphTag: string;
  identityStatus: 'UNANCHORED';
  isLegacyDemo: boolean;
  /**
   * Provenance. Recorded on the question itself so that what produced it is answerable later from
   * the stored session, not inferred from the code that happened to be deployed at the time.
   *
   * `isLegacyDemo` was supposed to serve this purpose and did not: it was set on every static
   * fallback question and NOTHING in the codebase ever read it, so it labelled the problem without
   * preventing it. These two fields are written by the only path that can now create a question.
   */
  generatedBy?: 'gemini';
  generatedAt?: number;
}

/**
 * Attempts before the batch is declared unproducible.
 *
 * Three because the failures actually observed here are transient — a 429 from Vertex, a timeout,
 * or the model wrapping its JSON in prose — and a retry clears them. It is deliberately a retry
 * budget and not a fallback: running out means the student is told to try again, never that a
 * different source of questions is used.
 */
const MAX_GENERATION_ATTEMPTS = 3;

/*
 * ── THE HARDCODED QUESTION BANK IS GONE, DELIBERATELY ─────────────────────────────────────
 *
 * INSTANT_QUESTION_BANK lived here: 347 lines, 36 static MCQs across Physics, Chemistry,
 * Mathematics, Biology, Reasoning, Quantitative Aptitude, General Awareness and English. It was
 * served whenever the LLM threw OR returned fewer than four usable questions.
 *
 * It was not a safety net, it was a disguise:
 *
 *   · Its first four Physics/Chemistry/Maths entries are the SAME questions removed from the
 *     frontend in e13154ab — vectors, F = ma, exothermic reactions, quadratic discriminants.
 *     Deleting the frontend copy moved the problem one layer down rather than fixing it.
 *   · Served to whichever exam the student is actually preparing for. A UPSC, SSC or banking
 *     aspirant was calibrated on JEE mechanics.
 *   · Identical for every student, so it measured nothing.
 *   · Answers were graded and became the evidence behind that student's Digital Twin.
 *   · The top-up branch (`questions.length < questionCount`) mixed bank questions INTO an
 *     otherwise real batch, so a student could sit three generated questions and one canned one
 *     with nothing to tell them apart.
 *   · It marked its output `isLegacyDemo: true` — and NOTHING in the codebase ever read that
 *     flag, so the label bought no protection at all.
 *
 * No replacement bank was introduced. If generation cannot produce a full batch, this service now
 * throws and the student is told to retry — see AdaptiveGenerationError below.
 */

/**
 * Thrown when the question pipeline cannot produce a usable batch.
 *
 * status 503 so the global error handler surfaces it as "try again shortly" rather than a bug;
 * the onboarding UI already renders a retry screen for exactly this.
 */
export class AdaptiveGenerationError extends Error {
  public readonly status = 503;
  public readonly code = 'QUESTION_GENERATION_FAILED';
  constructor(message: string, public readonly detail?: Record<string, unknown>) {
    super(message);
    this.name = 'AdaptiveGenerationError';
  }
}

export class AdaptiveCatService {
  private profileService: UserProfileService;
  private llm: GeminiProvider;

  constructor() {
    this.profileService = new UserProfileService();
    this.llm = new GeminiProvider();
  }

  /**
   * Generates a dynamic batch of 4 questions tailored to the student's exam and subjects.
   */
  async generateAdaptiveBatch(
    userId: string,
    batchIndex: number,
    previousResponses: any[]
  ): Promise<{
    questions: AdaptiveQuestion[];
    isComplete: boolean;
    unsupportedSubjects: string[];
    offProfile: boolean;
  }> {
    const profile = await this.profileService.getProfile(userId);
    const targetExam = profile?.targetExam || profile?.goal || 'General Exam';

    // Infer or select real subjects for this student's exam
    const requested = Array.isArray(profile?.subjects) && profile.subjects.length > 0 ? profile.subjects : [];
    let subjects = requested;

    if (subjects.length === 0) {
      const examLower = targetExam.toLowerCase();
      if (examLower.includes('ssc') || examLower.includes('cgl') || examLower.includes('bank') || examLower.includes('govt')) {
        subjects = ['Reasoning', 'Quantitative Aptitude', 'General Awareness', 'English'];
      } else if (examLower.includes('neet') || examLower.includes('medical')) {
        subjects = ['Biology', 'Physics', 'Chemistry'];
      } else if (examLower.includes('jee') || examLower.includes('engineering')) {
        subjects = ['Mathematics', 'Physics', 'Chemistry'];
      } else if (examLower.includes('upsc') || examLower.includes('civil')) {
        subjects = ['General Awareness', 'Reasoning', 'Quantitative Aptitude', 'English'];
      } else if (examLower.includes('class 10') || examLower.includes('cbse') || examLower.includes('icse')) {
        subjects = ['Mathematics', 'Physics', 'Chemistry', 'Biology'];
      } else {
        subjects = ['Quantitative Aptitude', 'Reasoning', 'General Awareness', 'English'];
      }
    }

    const currentSubject = subjects[batchIndex % subjects.length];
    const totalPrevious = previousResponses.length;

    // Determine dynamic difficulty calibration
    let currentDifficulty: 'Easy' | 'Medium' | 'Hard' | 'Challenge' = 'Medium';
    if (totalPrevious > 0) {
      const correct = previousResponses.filter((r: any) => r.isCorrect).length;
      const recentAccuracy = correct / totalPrevious;
      if (recentAccuracy >= 0.8) {
        currentDifficulty = batchIndex > 2 ? 'Challenge' : 'Hard';
      } else if (recentAccuracy >= 0.5) {
        currentDifficulty = 'Medium';
      } else {
        currentDifficulty = 'Easy';
      }
    }

    const questionCount = 4;
    const startQNum = totalPrevious + 1;

    const prompt = `Generate exactly ${questionCount} multiple-choice diagnostic test questions for a student.
Target Exam: ${targetExam}
Subject: ${currentSubject}
Difficulty: ${currentDifficulty}
Question numbering starts at #${startQNum}.

Rules:
- Questions must be syllabus-accurate and realistic for ${targetExam}.
- Each question must have EXACTLY 4 options.
- "correctAnswer" must match one of the 4 options verbatim.
- "explanation" must be 1-2 clear, informative sentences.
- "topic" and "subtopic" should be real curriculum topics.

Output ONLY a raw JSON array of ${questionCount} objects (no markdown, no formatting fences):
[
  {
    "topic": "Topic Name",
    "subtopic": "Subtopic Name",
    "question": "Question text",
    "options": ["Option A", "Option B", "Option C", "Option D"],
    "correctAnswer": "Option A",
    "explanation": "Why Option A is correct",
    "knowledgeGraphTag": "${currentSubject} > Topic > Subtopic"
  }
]`;

    /*
     * ── GENERATION, WITH NO SILENT SUBSTITUTE ────────────────────────────────────────────
     * Retries are the recovery mechanism, not a static bank. Most failures here are transient —
     * a 429, a timeout, or a model returning prose around its JSON — and a second attempt fixes
     * them. What must never happen is a student receiving questions that did not come from this
     * pipeline while believing they did.
     */
    let questions: AdaptiveQuestion[] = [];
    let lastFailure = '';

    for (let attempt = 1; attempt <= MAX_GENERATION_ATTEMPTS && questions.length < questionCount; attempt++) {
      try {
        const aiResp = await this.llm.generateResponse(
          [{ role: 'user', content: prompt, timestamp: Date.now() }],
          'You are an expert exam question author. Output strictly valid JSON arrays without markdown ticks.',
          { userId, operation: 'baseline_adaptive_cat', temperature: 0.6 },
        );

        let raw = (aiResp.reply || '').trim().replace(/```json/gi, '').replace(/```/g, '').trim();
        const start = raw.indexOf('[');
        const end = raw.lastIndexOf(']');
        if (start >= 0 && end > start) raw = raw.slice(start, end + 1);

        const parsed = JSON.parse(raw);
        if (!Array.isArray(parsed)) throw new Error('model did not return a JSON array');

        questions = parsed
          .slice(0, questionCount)
          .map((q: any, idx: number): AdaptiveQuestion | null => {
            /*
             * STRICT. The previous version repaired malformed output instead of rejecting it: a
             * bad options array became the literal ['Option A'..'Option D'], and an answer that
             * matched none of the options silently became options[0]. Both shipped a real-looking
             * question — the second graded students against an invented key. A question that
             * cannot be trusted is dropped, and a short batch is retried rather than patched.
             */
            const opts = Array.isArray(q.options) ? q.options.map((o: any) => String(o).trim()) : [];
            const text = String(q.question || q.text || '').trim();
            const correct = String(q.correctAnswer ?? '').trim();
            if (opts.length !== 4 || opts.some((o: string) => !o)) return null;
            if (!text) return null;
            if (!opts.includes(correct)) return null;
            /*
             * Reject the prompt's own example echoed back. The schema shown to the model uses
             * "Option A".."Option D" as placeholders, and a model that copies the template instead
             * of filling it in produces a question that passes every structural check above while
             * being unanswerable. Distinguishable only here, by content.
             */
            if (opts.every((o: string, i: number) => o === `Option ${String.fromCharCode(65 + i)}`)) return null;

            return {
              id: `cat_ai_${batchIndex}_${startQNum + idx}_${Date.now()}`,
              batchIndex,
              questionNumber: startQNum + idx,
              subject: currentSubject,
              topic: String(q.topic || `${currentSubject} Core`).trim(),
              subtopic: String(q.subtopic || 'Fundamentals').trim(),
              difficulty: currentDifficulty,
              type: 'MCQ' as const,
              question: text,
              options: opts,
              correctAnswer: correct,
              explanation: String(q.explanation || 'Refer to core concepts.').trim(),
              estimatedTimeSeconds: 60,
              knowledgeGraphTag: String(q.knowledgeGraphTag || `${currentSubject} > ${q.topic || 'General'}`).trim(),
              identityStatus: 'UNANCHORED' as const,
              /* Always false now. Nothing in this service can produce a demo question any more. */
              isLegacyDemo: false,
              generatedBy: 'gemini' as const,
              generatedAt: Date.now(),
            };
          })
          .filter((q): q is AdaptiveQuestion => q !== null);

        if (questions.length < questionCount) {
          lastFailure = `attempt ${attempt} yielded ${questions.length}/${questionCount} valid questions`;
          logger.warn('[AdaptiveCat] short batch, retrying', { userId, targetExam, currentSubject, attempt, got: questions.length });
        }
      } catch (err: any) {
        lastFailure = String(err?.message || err);
        logger.warn('[AdaptiveCat] generation attempt failed', { userId, targetExam, currentSubject, attempt, error: lastFailure });
      }
    }

    /*
     * Controlled failure. The caller propagates this to the student as "we could not prepare your
     * paper — try again", which is recoverable. The alternative this replaces was a plausible
     * assessment built from questions nobody chose for this student, which is not.
     */
    if (questions.length < questionCount) {
      logger.error('[AdaptiveCat] generation failed after retries — refusing to substitute static questions', {
        userId, targetExam, currentSubject, batchIndex, attempts: MAX_GENERATION_ATTEMPTS, lastFailure,
      });
      throw new AdaptiveGenerationError(
        'We could not prepare your questions just now. Please try again in a moment.',
        { subject: currentSubject, targetExam, batchIndex, attempts: MAX_GENERATION_ATTEMPTS, lastFailure },
      );
    }

    const isComplete = startQNum + questionCount - 1 >= 20;
    return {
      questions,
      isComplete,
      unsupportedSubjects: [],
      offProfile: false,
    };
  }
}

export const adaptiveCatService = new AdaptiveCatService();
