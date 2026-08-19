import { GeminiProvider } from '../ai/gemini.provider';
import { UserStatsService } from '../userStats.service';
import { knowledgeService } from '../../core/knowledge';
import { syllabusGraphService } from '../exam/syllabusGraph.service';
import { logger } from '../../utils/logger';

/**
 * Whether a question carries an application-validated canonical syllabus identity.
 *
 * Explicit rather than inferred from a missing field: downstream systems (coverage, mastery,
 * migration reporting) must be able to tell "this question is deliberately not anchored" from
 * "someone forgot to set this", without guessing.
 *
 * UNANCHORED is a MIGRATION STATE, not an acceptable end state. It exists so existing callers
 * keep working while the transition is measurable — see the counters in generateWeakAreaQuiz.
 */
export type QuestionIdentityStatus = 'CANONICAL' | 'UNANCHORED';

/** A generated MCQ in the exact shape the frontend test engine consumes. */
export interface QuizQuestion {
  id: string;
  text: string;
  /**
   * Human-readable label for display and backwards compatibility. NON-AUTHORITATIVE: it is
   * whatever the model wrote. Never derive syllabus identity from it.
   */
  topic: string;
  options: string[];
  correctAnswerIndex: number;
  explanation: string;
  /** The authoritative canonical syllabus identity. Present only when CANONICAL. */
  syllabusNodeId?: string;
  /** Version context, so a historical attempt stays interpretable if the syllabus later changes. */
  syllabusId?: string;
  cycleId?: string;
  identityStatus: QuestionIdentityStatus;
}

/** Map a model's "correctAnswer" (index, letter "A", or the option text) to an index. */
function resolveCorrectIndex(correctAnswer: any, options: string[]): number {
  if (typeof correctAnswer === 'number' && correctAnswer >= 0 && correctAnswer < options.length) {
    return correctAnswer;
  }
  if (typeof correctAnswer === 'string') {
    const s = correctAnswer.trim();
    const letter = s.toUpperCase();
    if (['A', 'B', 'C', 'D', 'E', 'F'].includes(letter)) return letter.charCodeAt(0) - 65;
    const idx = options.findIndex((o) => String(o).trim().toLowerCase() === s.toLowerCase());
    if (idx >= 0) return idx;
  }
  return 0; // safe default (first option) rather than dropping the question
}

/**
 * Generates a real, adaptive multiple-choice quiz with Gemini, targeting the student's
 * weak topics (or an explicitly requested topic). Returns questions in the frontend
 * Question shape so the existing /test engine can render + score them directly.
 */
export class QuizGeneratorService {
  private llm = new GeminiProvider();
  private statsService = new UserStatsService();

  async generateWeakAreaQuiz(
    userId: string,
    opts: {
      topic?: string; count?: number; difficulty?: string; notebookId?: string;
      /**
       * Canonical syllabus node this quiz is authored against. OPTIONAL by design, giving two
       * explicit modes and no third ambiguous one:
       *   supplied + valid   → CANONICAL
       *   supplied + invalid → REJECT (never silently downgraded to unanchored)
       *   absent             → UNANCHORED
       * It is never INFERRED from opts.topic or weakTopics: those are free-text labels, and
       * "Algebra" maps equally well to ssc_cgl / jee_math / banking algebra nodes. Guessing is
       * precisely the fuzzy matching this pipeline exists to eliminate.
       */
      syllabusNodeId?: string;
      examId?: string;
      cycleId?: string;
      syllabusId?: string;
    } = {}
  ): Promise<{ focus: string; questions: QuizQuestion[] }> {
    const count = Math.min(Math.max(opts.count || 10, 3), 20);

    // Pull the student's real weak topics + exam context to target the quiz.
    let weak: string[] = [];
    let exam = 'a general competitive exam';
    try {
      const stats: any = await this.statsService.getUserStats(userId);
      weak = Array.isArray(stats?.weakTopics) ? stats.weakTopics : [];
      exam = stats?.activeExam || exam;
    } catch { /* fall back to defaults */ }

    // ── Canonical identity resolution (application-owned, before any generation) ────────────
    let canonicalNode: Awaited<ReturnType<typeof syllabusGraphService.getSyllabusNode>> = null;
    let canonicalPath: string[] = [];
    if (opts.syllabusNodeId) {
      const examIdForNode = opts.examId || exam;
      const check = await syllabusGraphService.validateNodeForQuestion({
        examId: examIdForNode,
        nodeId: opts.syllabusNodeId,
        cycleId: opts.cycleId,
        syllabusId: opts.syllabusId,
      });
      if (!check.valid) {
        // Hard failure, deliberately. An invalid canonical request must NOT degrade into an
        // unanchored question: the caller asked for a specific syllabus location, and silently
        // producing evidence attributed elsewhere (or nowhere) is worse than refusing. Missing
        // id => unanchored; INVALID id => error. Two different situations, two different results.
        logger.error('[QuizGenerator] canonical node rejected; refusing to generate', {
          userId, examId: examIdForNode, syllabusNodeId: opts.syllabusNodeId, reason: check.reason,
        });
        throw new Error(`Invalid syllabus node for question generation: ${check.reason}`);
      }
      canonicalNode = check.node;
      canonicalPath = await syllabusGraphService.getNodeParentPath(examIdForNode, canonicalNode!.id)
        .catch(() => [] as string[]);
    }

    // Focus drives generation CONTENT only. When a canonical node is selected its label leads,
    // so the model writes for that syllabus location; weakTopics still contribute wording context
    // but can never determine identity (they are themselves LLM-invented labels).
    const focus = canonicalNode
      ? [...canonicalPath, canonicalNode.label].join(' → ')
      : opts.topic
        ? opts.topic
        : weak.length > 0
          ? weak.slice(0, 3).join(', ')
          : `core concepts for ${exam}`;
    const difficulty = opts.difficulty || 'medium';

    // When launched from a specific book/chapter ("take a test from my resources"), ground the
    // questions in the ACTUAL retrieved chunks for that notebook instead of asking the model to
    // invent questions purely from its own knowledge of the topic string.
    let groundingBlock = '';
    if (opts.notebookId) {
      try {
        const contextBundle = await knowledgeService.getSourceContext(focus, opts.notebookId, {
          topK: 8,
          includeKnowledgeGraph: false,
          artifactType: 'QUIZ',
          consumerContext: 'Adaptive Quiz Generation',
        });
        if (contextBundle.passages.length > 0) {
          groundingBlock = `\n\nBase every question STRICTLY on the following source material (do not invent facts outside it):\n${contextBundle.passages.map((p, i) => `[${i + 1}] ${p.text}`).join('\n\n')}`;
        }
      } catch (e) {
        console.warn('[QuizGenerator] Notebook-grounded retrieval failed, falling back to ungrounded quiz:', e);
      }
    }

    const system = 'You are an expert exam question writer. You output STRICTLY valid JSON only — no markdown fences, no commentary, no trailing text.';
    const prompt = `Create exactly ${count} multiple-choice questions that help a student improve on their WEAK areas.
Focus topics: ${focus}
Exam context: ${exam}. Difficulty: ${difficulty}.

Rules:
- Each question has EXACTLY 4 options.
- Exactly one option is correct.
- "correctAnswerIndex" is the 0-based index of the correct option.
- Keep each explanation to 1-2 sentences.
- Vary the questions across the focus topics; make them exam-realistic.${groundingBlock}

Output ONLY a JSON array in EXACTLY this shape (no other keys):
[{"text":"the question","topic":"specific sub-topic","options":["opt A","opt B","opt C","opt D"],"correctAnswerIndex":0,"explanation":"why the correct option is right"}]`;

    const resp = await this.llm.generateResponse(
      [{ role: 'user', content: prompt, timestamp: Date.now() }],
      system,
      { userId, operation: 'quiz_generation' }
    );

    // Strip any stray fences/prose and isolate the JSON array.
    let raw = (resp.reply || '').trim().replace(/```json/gi, '').replace(/```/g, '').trim();
    const start = raw.indexOf('[');
    const end = raw.lastIndexOf(']');
    if (start >= 0 && end > start) raw = raw.slice(start, end + 1);

    let parsed: any[] = [];
    try { parsed = JSON.parse(raw); } catch { parsed = []; }

    const questions: QuizQuestion[] = (Array.isArray(parsed) ? parsed : [])
      .filter((q) => q && Array.isArray(q.options) && q.options.length >= 2)
      .slice(0, count)
      .map((q, i) => {
        const options = q.options.map((o: any) => String(o));
        return {
          id: `q_${Date.now()}_${i}`,
          text: String(q.text || q.question || '').trim(),
          // Display label only. The model's `topic` is recorded for readability and NEVER
          // consulted for identity — if it writes "Quadratic Equations" while the selected node
          // is topic:ssc_cgl_quant_algebra, the node still wins below.
          topic: String(q.topic || focus).trim(),
          options,
          correctAnswerIndex: resolveCorrectIndex(
            q.correctAnswerIndex !== undefined ? q.correctAnswerIndex : q.correctAnswer,
            options
          ),
          explanation: String(q.explanation || '').trim(),
          // Identity comes from the APPLICATION's validated selection, not from model output.
          ...(canonicalNode
            ? {
                syllabusNodeId: canonicalNode.id,
                syllabusId: canonicalNode.syllabusId,
                cycleId: canonicalNode.cycleId,
                identityStatus: 'CANONICAL' as const,
              }
            : { identityStatus: 'UNANCHORED' as const }),
        };
      })
      .filter((q) => q.text && q.options.length >= 2);

    // Observability for the migration: we need to be able to answer "how many generated
    // questions still lack canonical identity?" without trawling documents. Logged once per
    // generation rather than per question to avoid noise.
    logger.info('[QuizGenerator] questions generated', {
      userId,
      examId: opts.examId || exam,
      identityStatus: canonicalNode ? 'CANONICAL' : 'UNANCHORED',
      syllabusNodeId: canonicalNode?.id,
      canonicalQuestionsGenerated: canonicalNode ? questions.length : 0,
      unanchoredQuestionsGenerated: canonicalNode ? 0 : questions.length,
    });

    return { focus, questions };
  }
}

export const quizGeneratorService = new QuizGeneratorService();
