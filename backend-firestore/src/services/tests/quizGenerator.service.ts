import { GeminiProvider } from '../ai/gemini.provider';
import { UserStatsService } from '../userStats.service';
import { knowledgeService } from '../../core/knowledge';
import { syllabusGraphService } from '../exam/syllabusGraph.service';
import { validateSyllabusNodeId } from '../exam/syllabusNodeIdentity';
import { pyqAnalyticsService } from '../pyq/pyqAnalytics.service';
import { examMasterService } from '../exam/examMaster.service';
import { detectExamId } from '../pyq/examIndex';
import { canonicalPyqRetrievalService } from '../pyq/canonicalPyqRetrieval.service';
import { questionMixerService } from './questionMixer.service';
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
  /** Provenance metadata: WHY and HOW this question was generated */
  questionOrigin?: 'AUTHENTIC_PYQ' | 'PYQ_INSPIRED' | 'CURRICULUM_SYNTHESIZED' | 'GENERAL_KNOWLEDGE';
  sourcePyqs?: string[];
  sourceChapters?: string[];
  patternProfileContext?: string;
  syllabusBoundaryVerified?: boolean;
  /** Present only when questionOrigin === 'AUTHENTIC_PYQ' — the real sitting this came from. */
  examId?: string;
  sourcePyqId?: string;
  sourceYear?: number;
  sourceShift?: string;
  sourcePaper?: string;
  canonicalPaperId?: string;
  /** Non-verbal questions: the figures to show. */
  figure?: import('../../types/questionMixer.types').QuestionFigure;
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
      /** The topic's subject ("Quantitative Aptitude" for topic "Percentage"), sent separately so
       *  the mixer can resolve the topic within the right subject of the exam's corpus. */
      subject?: string;
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
      /**
       * True when this request's syllabusNodeId/topic came from a weak-area recommendation
       * rather than a plain "give me questions on X" ask. Keeps WEAK_AREA_DRILL's source mix
       * (heavier real-PYQ/reference weighting than plain PRACTICE) even when the request also
       * pins an exact syllabus node — a node narrows WHERE, this narrows WHERE FROM, and the two
       * are independent.
       */
      isWeakAreaDrill?: boolean;
      mode?: import('../../types/questionMixer.types').TestMode;
    } = {}
  ): Promise<{ focus: string; questions: QuizQuestion[] }> {
    const isMockTopic = Boolean(
      opts.mode === 'FULL_MOCK' ||
      (opts.topic && /mock|full-length|tier\s*1|test\s*series|practice\s*exam/i.test(opts.topic))
    );
    const maxAllowed = isMockTopic ? 100 : 25;
    const count = Math.min(Math.max(opts.count || 10, 3), maxAllowed);

    /*
     * Notebook-grounded requests ("take a test from my resources") stay on their existing,
     * unmodified path — a genuinely different data source (the student's own uploaded material via
     * knowledgeService), not something QuestionMixer's PYQ/reference/generated sourcing applies to.
     * Everything else (explicit topic, an explicit syllabus node, or the weak-areas default)
     * converges on the mixer per Phase 3 Step 6 — one engine, not one implementation per caller.
     */
    if (opts.notebookId) {
      return this.generateNotebookGroundedQuiz(userId, opts, count);
    }
    return this.generateViaMixer(userId, opts, count);
  }

  /** The pre-Phase-3 implementation, kept exactly for notebook-grounded requests. */
  private async generateNotebookGroundedQuiz(
    userId: string,
    opts: { topic?: string; count?: number; difficulty?: string; notebookId?: string; syllabusNodeId?: string; examId?: string; cycleId?: string; syllabusId?: string },
    count: number,
  ): Promise<{ focus: string; questions: QuizQuestion[] }> {
    // Pull the student's real weak topics + exam context to target the quiz.
    let weak: string[] = [];
    let exam = 'a general competitive exam';
    try {
      const stats: any = await this.statsService.getUserStats(userId);
      weak = Array.isArray(stats?.weakTopics) ? stats.weakTopics : [];
      exam = opts.examId || stats?.activeExam || exam;
    } catch { /* fall back to defaults */ }

    /*
     * Resolve to the SAME canonical exam registry retrieval uses (examIndex.ts / detectExamId),
     * rather than passing the raw onboarding label ("SSC CGL", "ssc-cgl", "SSC_CGL" — whatever
     * happened to get saved) straight into PYQ analytics / syllabus / canonical-node lookups.
     * Those services filter by exact examId equality against the corpus, so an unresolved label
     * doesn't error — it just silently matches nothing, and every "advisory" block below quietly
     * degrades to a bare, ungrounded generation with no visible sign anything was skipped. This
     * was true for every quiz generated before this fix; resolving here is the actual bug fix for
     * "recommendations don't visibly derive from PYQs" — the blocks below already existed.
     */
    const resolvedExamId = exam !== 'a general competitive exam' ? await detectExamId(exam).catch(() => null) : null;

    // ── Canonical identity resolution (application-owned, before any generation) ────────────
    let canonicalNode: Awaited<ReturnType<typeof syllabusGraphService.getSyllabusNode>> = null;
    let canonicalPath: string[] = [];
    if (opts.syllabusNodeId) {
      const examIdForNode = resolvedExamId || opts.examId || exam;
      /*
       * Routed through the shared identity contract rather than calling the graph service
       * directly, so there is ONE definition of a valid syllabus identity across quizzes, PYQs,
       * attempts and everything Stage 2 adds. Behaviour is unchanged — the shared validator
       * delegates existence and type checks to the same graph call this used to make — but a
       * wrong exam or a malformed id is now rejected without a read, and the reason arrives as a
       * structured code instead of a message to be parsed.
       */
      const check = await validateSyllabusNodeId({
        examId: examIdForNode,
        syllabusNodeId: opts.syllabusNodeId,
      });
      if (!check.valid) {
        // Hard failure, deliberately. An invalid canonical request must NOT degrade into an
        // unanchored question: the caller asked for a specific syllabus location, and silently
        // producing evidence attributed elsewhere (or nowhere) is worse than refusing. Missing
        // id => unanchored; INVALID id => error. Two different situations, two different results.
        logger.error('[QuizGenerator] canonical node rejected; refusing to generate', {
          userId, examId: examIdForNode, syllabusNodeId: opts.syllabusNodeId,
          code: check.code, reason: check.detail,
        });
        throw new Error(`Invalid syllabus node for question generation: ${check.code}`);
      }
      canonicalNode = check.node ?? null;
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

    // Exam Pattern Intelligence: analyze real PYQs for this exam to guide question styles
    let examPatternBlock = '';
    let examPatternSummary = '';
    const examIdForAnalytics = resolvedExamId || '';
    if (examIdForAnalytics) {
      try {
        const pattern = await pyqAnalyticsService.getExamPatternProfile(examIdForAnalytics);
        if (pattern && pattern.totalQuestionsAnalyzed > 0) {
          const highYieldList = pattern.highYieldTopics.slice(0, 4).map((h: any) => `${h.topic} (${h.percentageWeight}%)`).join(', ');
          examPatternSummary = `Exam: ${pattern.examId} | Analyzed ${pattern.totalQuestionsAnalyzed} PYQs | High-yield: ${highYieldList}`;
          examPatternBlock = `\nExam Pattern Intelligence for ${pattern.examId}:\n- High-Yield Topics: ${highYieldList}\n- Common Question Types in this exam: ${Object.keys(pattern.questionTypeDistribution).join(', ')}\nEnsure questions reflect real examination phrasing and cognitive depth.`;
        }
      } catch (e) {
        // Advisory pattern intelligence
      }
    }

    // Official Syllabus Boundary Enforcement:
    // Extract authoritative topics from official syllabus to serve as a strict generation boundary
    let syllabusBoundaryBlock = '';
    const allowedSyllabusTopics: string[] = [];
    if (examIdForAnalytics) {
      try {
        const currentSyllabus = await examMasterService.getCurrentSyllabus(examIdForAnalytics);
        if (currentSyllabus?.nodes && currentSyllabus.nodes.length > 0) {
          const collectTopicNames = (nodes: any[]) => {
            for (const n of nodes) {
              if (n.name && (n.type === 'TOPIC' || n.type === 'SUBTOPIC' || n.type === 'SUBJECT' || n.type === 'PAPER')) {
                allowedSyllabusTopics.push(n.name);
              }
              if (n.children && Array.isArray(n.children)) collectTopicNames(n.children);
            }
          };
          collectTopicNames(currentSyllabus.nodes);
          if (allowedSyllabusTopics.length > 0) {
            const boundarySample = allowedSyllabusTopics.slice(0, 15).join(', ');
            syllabusBoundaryBlock = `\n\nCRITICAL OFFICIAL SYLLABUS BOUNDARY:\nAll generated questions MUST strictly adhere to the official syllabus for ${examIdForAnalytics}. Allowed syllabus topics include: ${boundarySample}...\nDo NOT invent or include questions on topics excluded from this syllabus.`;
          }
        }
      } catch (e) {
        // Advisory syllabus boundary
      }
    }

    // When launched from a specific book/chapter ("take a test from my resources"), ground the
    // questions in the ACTUAL retrieved chunks for that notebook instead of asking the model to
    // invent questions purely from its own knowledge of the topic string.
    let groundingBlock = '';
    const sourceChapterList: string[] = [];
    if (opts.notebookId) {
      try {
        const contextBundle = await knowledgeService.getSourceContext(focus, opts.notebookId, {
          topK: 8,
          includeKnowledgeGraph: false,
          artifactType: 'QUIZ',
          consumerContext: 'Adaptive Quiz Generation',
        });
        if (contextBundle.passages.length > 0) {
          contextBundle.passages.forEach(p => {
            if (p.sourceTitle && !sourceChapterList.includes(p.sourceTitle)) sourceChapterList.push(p.sourceTitle);
          });
          groundingBlock = `\n\nBase every question STRICTLY on the following source material (do not invent facts outside it):\n${contextBundle.passages.map((p, i) => `[${i + 1}] ${p.text}`).join('\n\n')}`;
        }
      } catch (e) {
        console.warn('[QuizGenerator] Notebook-grounded retrieval failed, falling back to ungrounded quiz:', e);
      }
    }

    const system = 'You are an expert exam question writer. You output STRICTLY valid JSON only — no markdown fences, no commentary, no trailing text.';
    const prompt = `Create exactly ${count} multiple-choice questions that help a student improve on their WEAK areas.
Focus topics: ${focus}
Exam context: ${exam}. Difficulty: ${difficulty}.${examPatternBlock}

Rules:
- Each question has EXACTLY 4 options.
- Exactly one option is correct.
- "correctAnswerIndex" is the 0-based index of the correct option.
- Keep each explanation to 1-2 sentences.
- Vary the questions across the focus topics; make them exam-realistic.${syllabusBoundaryBlock}${groundingBlock}

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
          // Provenance: record why this question was generated and what guided it.
          // Previously this unconditionally claimed PYQ_INSPIRED whenever there was no notebook
          // grounding — including requests where examIdForAnalytics never resolved and
          // examPatternBlock stayed empty, i.e. no real PYQ evidence informed the question at all.
          // Label by what actually happened this call, not by which branch it fell out of.
          questionOrigin: sourceChapterList.length > 0
            ? ('CURRICULUM_SYNTHESIZED' as const)
            : examPatternBlock
              ? ('PYQ_INSPIRED' as const)
              : ('GENERAL_KNOWLEDGE' as const),
          sourceChapters: sourceChapterList.length > 0 ? sourceChapterList : undefined,
          patternProfileContext: examPatternSummary || undefined,
          syllabusBoundaryVerified: allowedSyllabusTopics.length > 0 ? true : undefined,
          examId: resolvedExamId || undefined,
        };
      })
      .filter((q) => q.text && q.options.length >= 2);

    // Observability for the migration: we need to be able to answer "how many generated
    // questions still lack canonical identity?" without trawling documents. Logged once per
    // generation rather than per question to avoid noise.
    logger.info('[QuizGenerator] questions generated', {
      userId,
      examId: resolvedExamId || exam,
      examResolved: Boolean(resolvedExamId),
      identityStatus: canonicalNode ? 'CANONICAL' : 'UNANCHORED',
      syllabusNodeId: canonicalNode?.id,
      canonicalQuestionsGenerated: canonicalNode ? questions.length : 0,
      unanchoredQuestionsGenerated: canonicalNode ? 0 : questions.length,
    });

    return { focus, questions };
  }

  /**
   * Phase 3: the converged path — explicit topic, an explicit syllabus node, or (when neither is
   * given) the real weak-areas default, all built via QuestionMixer instead of one bare LLM
   * prompt. AdaptiveTestGenerator, GenerateTestPanel and the dashboard's weak-area drills all
   * reach this same method through the same generateWeakAreaQuiz entry point — no separate
   * generator per caller.
   */
  private async generateViaMixer(
    userId: string,
    opts: { topic?: string; subject?: string; count?: number; difficulty?: string; syllabusNodeId?: string; examId?: string; cycleId?: string; syllabusId?: string; isWeakAreaDrill?: boolean; mode?: import('../../types/questionMixer.types').TestMode },
    count: number,
  ): Promise<{ focus: string; questions: QuizQuestion[] }> {
    let exam = 'a general competitive exam';
    try {
      const stats: any = await this.statsService.getUserStats(userId);
      exam = opts.examId || stats?.activeExam || exam;
    } catch { /* fall back to defaults */ }
    const resolvedExamId = exam !== 'a general competitive exam' ? await detectExamId(exam).catch(() => null) : null;

    // Explicit syllabus node: validate FIRST with the exact same strict contract as before
    // (supplied+valid -> CANONICAL, supplied+invalid -> REJECT, never silently downgraded) — the
    // mixer only ever gets a node id that has already been confirmed real.
    let canonicalNode: Awaited<ReturnType<typeof syllabusGraphService.getSyllabusNode>> = null;
    let canonicalPath: string[] = [];
    if (opts.syllabusNodeId) {
      const examIdForNode = resolvedExamId || opts.examId || exam;
      let check = await validateSyllabusNodeId({ examId: examIdForNode, syllabusNodeId: opts.syllabusNodeId });
      // The id carries its own cycle and syllabus version. A caller that also names one is making
      // a claim about which version it means, and a contradiction is a rejection — never a silent
      // switch to whichever version the id happens to point at.
      if (check.valid && check.parsed) {
        if (opts.syllabusId && opts.syllabusId !== check.parsed.syllabusId) {
          check = { ...check, valid: false, code: 'NODE_NOT_FOUND', detail: `id is in ${check.parsed.syllabusId}, caller asked for ${opts.syllabusId}` };
        } else if (opts.cycleId && opts.cycleId !== check.parsed.cycleId) {
          check = { ...check, valid: false, code: 'NODE_NOT_FOUND', detail: `id is in cycle ${check.parsed.cycleId}, caller asked for ${opts.cycleId}` };
        }
      }
      if (!check.valid) {
        logger.error('[QuizGenerator] canonical node rejected; refusing to generate', {
          userId, examId: examIdForNode, syllabusNodeId: opts.syllabusNodeId, code: check.code, reason: check.detail,
        });
        throw new Error(`Invalid syllabus node for question generation: ${check.code}`);
      }
      canonicalNode = check.node ?? null;
      canonicalPath = await syllabusGraphService.getNodeParentPath(examIdForNode, canonicalNode!.id).catch(() => [] as string[]);
    }

    // The mixer only narrows its blueprint down to a single focused section when it receives
    // studentWeakAreas — otherwise it builds the FULL multi-subject exam blueprint, which is wrong
    // for any single-topic ask, not just the true weak-areas default. So this covers three cases,
    // not one: an explicit node (pin WHERE precisely), an explicit topic (pin WHERE loosely), or
    // — only when neither was given — the real weak-areas default that used to be
    // `weak.slice(0,3).join(', ')` fed into a prompt as a hint with no actual retrieval constraint.
    const isMockTopic = Boolean(
      opts.mode === 'FULL_MOCK' ||
      (opts.topic && /mock|full-length|tier\s*1|test\s*series|practice\s*exam/i.test(opts.topic))
    );

    let studentWeakAreas: { syllabusNodeId?: string; topic: string; subject?: string }[] | undefined;
    if (canonicalNode) {
      studentWeakAreas = [{ syllabusNodeId: canonicalNode.id, topic: canonicalNode.label }];
    } else if (opts.topic && !isMockTopic) {
      studentWeakAreas = [{ topic: opts.topic, subject: opts.subject }];
    } else if (resolvedExamId && !isMockTopic) {
      const weak = await this.statsService.getWeakTopicsForExam(userId, resolvedExamId).catch(() => []);
      if (weak.length > 0) {
        studentWeakAreas = weak.slice(0, 3).map((w) => ({ syllabusNodeId: w.syllabusNodeId, topic: w.topicName, subject: w.subjectId }));
      }
    }

    const focus = canonicalNode
      ? [...canonicalPath, canonicalNode.label].join(' → ')
      : opts.topic || (studentWeakAreas?.length ? studentWeakAreas.map((w) => w.topic).join(', ') : `core concepts for ${exam}`);

    // isWeakAreaDrill wins regardless of whether a node/topic also narrows the request — a node
    // pins WHERE the questions come from within the syllabus, this pins WHERE FROM (source mix).
    // Without it, a weak-area recommendation carrying a specific syllabusNodeId would silently
    // fall into plain PRACTICE's more generation-heavy default mix instead of WEAK_AREA_DRILL's
    // real-PYQ/reference-weighted one.
    const mode: import('../../types/questionMixer.types').TestMode = opts.isWeakAreaDrill
      ? 'WEAK_AREA_DRILL'
      : isMockTopic
        ? 'FULL_MOCK'
        : opts.mode
          ? opts.mode
          : canonicalNode || opts.topic ? 'PRACTICE' : 'WEAK_AREA_DRILL';

    const { questions: candidates } = await questionMixerService.buildTest({
      examQuery: resolvedExamId || exam,
      mode,
      questionCount: count,
      topicNames: opts.topic && !isMockTopic ? [opts.topic] : undefined,
      syllabusNodeIds: canonicalNode ? [canonicalNode.id] : undefined,
      studentWeakAreas,
      userId,
    });

    const originBySource: Record<string, QuizQuestion['questionOrigin']> = {
      CANONICAL_PYQ: 'AUTHENTIC_PYQ', PYQ_PATTERN: 'PYQ_INSPIRED', REFERENCE_BOOK: 'CURRICULUM_SYNTHESIZED', GENERATED: 'GENERAL_KNOWLEDGE',
    };

    const questions: QuizQuestion[] = candidates.map((c, i) => ({
      id: c.id || `mix_${Date.now()}_${i}`,
      text: c.text,
      topic: c.topic || focus,
      options: c.options,
      correctAnswerIndex: c.correctAnswerIndex,
      explanation: c.explanation,
      // An explicitly requested canonical node is the APPLICATION's validated selection and wins
      // over whatever the mixer's candidates individually carried — same override rule as before.
      ...(canonicalNode
        ? { syllabusNodeId: canonicalNode.id, syllabusId: canonicalNode.syllabusId, cycleId: canonicalNode.cycleId, identityStatus: 'CANONICAL' as const }
        : c.syllabusNodeId
          ? { syllabusNodeId: c.syllabusNodeId, identityStatus: 'CANONICAL' as const }
          : { identityStatus: 'UNANCHORED' as const }),
      questionOrigin: originBySource[c.sourceType],
      sourcePyqs: c.sourcePyqId ? [c.sourcePyqId] : undefined,
      sourceChapters: c.referenceChapter ? [c.referenceChapter] : undefined,
      examId: c.examId || resolvedExamId || undefined,
      sourcePyqId: c.sourcePyqId,
      sourceYear: c.sourceYear,
      sourceShift: c.sourceShift,
      sourcePaper: c.sourcePaper,
      canonicalPaperId: c.canonicalPaperId,
      figure: c.figure,
    }));

    logger.info('[QuizGenerator] questions generated via mixer', {
      userId, examId: resolvedExamId || exam, examResolved: Boolean(resolvedExamId), mode,
      identityStatus: canonicalNode ? 'CANONICAL' : 'MIXED', count: questions.length,
    });

    return { focus, questions };
  }

  /**
   * "Practice a real paper" — a genuinely different code path from generateWeakAreaQuiz, not a
   * flag on it. No LLM call happens here at all: every question is retrieved verbatim from the
   * verified corpus via canonicalPyqRetrievalService (the same retrieval RetrievalOrchestrator
   * uses for chat — one evidence architecture, not a second one built for quizzes), preserving
   * original question order, options and the real correct answer.
   *
   * Returns NOT_AVAILABLE rather than an empty question list on failure, so the controller can
   * tell "no real paper matched" from "matched but had zero MCQ-shaped questions" — both are
   * real outcomes a caller needs to distinguish, not an error to swallow into a 502.
   */
  async getCanonicalPaperQuiz(params: {
    examQuery: string; // free text; resolved the same way generateWeakAreaQuiz resolves it
    year?: number;
    shift?: number;
    paper?: string;
  }): Promise<
    | { status: 'CANONICAL_RETRIEVED' | 'PARTIAL_CANONICAL_PAPER'; focus: string; questions: QuizQuestion[]; diagnostics: string }
    | { status: 'AMBIGUOUS_PAPER'; papers: { year: number | null; shift: string | null; paper: string | null; questionCount: number }[]; diagnostics: string }
    | { status: 'NOT_AVAILABLE'; diagnostics: string }
  > {
    const examId = await detectExamId(params.examQuery);
    if (!examId) {
      return { status: 'NOT_AVAILABLE', diagnostics: `"${params.examQuery}" did not resolve to a known exam.` };
    }

    const result = await canonicalPyqRetrievalService.retrieve({
      examId, year: params.year ?? null, shift: params.shift ?? null, paper: params.paper ?? null,
      wantsFullPaper: true,
    });

    if (result.status === 'NOT_AVAILABLE_IN_VERIFIED_CORPUS') {
      return { status: 'NOT_AVAILABLE', diagnostics: result.diagnostics };
    }
    if (result.status === 'AMBIGUOUS_PAPER') {
      return {
        status: 'AMBIGUOUS_PAPER',
        papers: result.papers.map((p) => ({ year: p.year, shift: p.shift, paper: p.paper, questionCount: p.questionCount })),
        diagnostics: result.diagnostics,
      };
    }

    const questions: QuizQuestion[] = result.questions
      .filter((q) => Array.isArray(q.options) && q.options.length >= 2 && q.questionText)
      .map((q, i) => ({
        id: `pyq_${q.questionId}_${i}`,
        text: q.questionText,
        topic: q.topic || q.subject || 'General',
        options: q.options as string[],
        correctAnswerIndex: resolveCorrectIndex(q.correctAnswer, q.options as string[]),
        explanation: q.explanation || q.solution || '',
        // Real questions from real papers ARE the syllabus identity when the corpus recorded one
        // — never inferred from the topic string, same rule as the generated path.
        syllabusNodeId: q.syllabusNodeId,
        identityStatus: q.syllabusNodeId ? ('CANONICAL' as const) : ('UNANCHORED' as const),
        questionOrigin: 'AUTHENTIC_PYQ' as const,
        sourcePyqs: [q.questionId],
        examId,
        sourcePyqId: q.questionId,
        sourceYear: q.year,
        sourceShift: q.shift,
        sourcePaper: q.paper,
        canonicalPaperId: (q as any).canonicalPaperId,
      }));

    const first = result.questions[0] as any;
    const focus = [first?.examName || examId, first?.year, first?.shift].filter(Boolean).join(' ');

    logger.info('[QuizGenerator] canonical paper quiz', {
      examId, year: params.year, shift: params.shift,
      status: result.status, retrieved: result.retrievedCount, usable: questions.length,
    });

    return {
      status: result.status as 'CANONICAL_RETRIEVED' | 'PARTIAL_CANONICAL_PAPER',
      focus, questions, diagnostics: result.diagnostics,
    };
  }
}

export const quizGeneratorService = new QuizGeneratorService();
