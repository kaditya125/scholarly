/**
 * J.7.1 — canonical pre-test generation.
 *
 * The whole flow, and the only order it is allowed to happen in:
 *
 *     exam + cycle → CURRENT verified syllabus → canonical graph → node selection
 *                  → CanonicalPreTestRequest → generation → canonical validation → persist
 *
 * If the first step yields nothing, the flow stops and returns NO_CANONICAL_SYLLABUS. There is
 * deliberately no branch that produces questions without a resolved syllabus — not a "general"
 * test, not a sample, not the legacy bank. A pre-test that cannot be traced to an official
 * syllabus version is worse than no pre-test, because the student cannot tell the difference.
 *
 * WHAT THE APPLICATION OWNS vs WHAT THE MODEL OWNS. The model writes question text, options, the
 * answer and an explanation. The application owns examId, cycleId, syllabusId and syllabusNodeId
 * absolutely: they are chosen BEFORE generation, re-validated against the graph AFTER it, and
 * stamped onto the stored question from the validated node — never read back from model output.
 * Anything the model returns that looks like identity is discarded.
 */
import crypto from 'crypto';
import { logger } from '../../utils/logger';
import { canonicalSyllabusResolver } from '../exam/canonicalSyllabusResolver';
import { syllabusGraphService, SyllabusGraphNode } from '../exam/syllabusGraph.service';
import { quizGeneratorService } from '../tests/quizGenerator.service';
import { quizAttemptsService } from '../tests/quizAttempts.service';
import { masteryEngine } from '../../core/intelligence/MasteryEngine';
import { StoredQuizQuestion } from '../../types/quizAttempt.types';
import {
  CanonicalPreTestRequest, PreTestResult, DifficultyDistribution, DifficultyBand,
  AssessmentPurpose, NO_CANONICAL_SYLLABUS_MESSAGE,
} from '../../types/canonicalAssessment.types';

/** Content a generator returns. Note the absence of ANY identity field — that is the point. */
export interface GeneratedQuestionContent {
  text: string;
  options: string[];
  correctAnswerIndex: number;
  explanation: string;
  /** The model's own label. Kept for display only; never consulted for identity. */
  topic?: string;
}

/**
 * Pluggable so tests and the persisted E2E can exercise the full identity and validation path
 * without an LLM call. Production binds the existing quizGeneratorService.
 */
export interface CanonicalQuestionGenerator {
  generate(params: {
    node: SyllabusGraphNode;
    parentPath: string[];
    examId: string; cycleId: string; syllabusId: string;
    count: number; difficulty: DifficultyBand; language: string;
  }): Promise<GeneratedQuestionContent[]>;
}

/** Production generator: delegates content to the existing LLM path, discards its identity. */
const defaultGenerator: CanonicalQuestionGenerator = {
  async generate({ node, examId, cycleId, syllabusId, count, difficulty }) {
    const { questions } = await quizGeneratorService.generateWeakAreaQuiz('system', {
      count: Math.max(count, 3), difficulty: difficulty.toLowerCase(),
      syllabusNodeId: node.id, examId, cycleId, syllabusId,
    });
    return questions.slice(0, count).map((q) => ({
      text: q.text, options: q.options, correctAnswerIndex: q.correctAnswerIndex,
      explanation: q.explanation, topic: q.topic,
    }));
  },
};

const DEFAULT_DISTRIBUTION: DifficultyDistribution = { EASY: 0, MEDIUM: 0, HARD: 0 };

export class CanonicalPreTestService {
  constructor(private generator: CanonicalQuestionGenerator = defaultGenerator) {}

  /**
   * Generates a canonical pre-test, or explains why it cannot.
   *
   * Infrastructure failures propagate (SyllabusUnavailableError) rather than being reported as an
   * absent syllabus — see the resolver.
   */
  async generatePreTest(params: {
    studentId: string;
    examId: string;
    cycleId: string;
    questionCount?: number;
    assessmentPurpose?: AssessmentPurpose;
    language?: string;
    /** Test seam only. Production leaves this unset so selection stays evidence-driven. */
    evidenceOverride?: Array<{ syllabusNodeId?: string; masteryScore: number }>;
  }): Promise<PreTestResult> {
    const {
      studentId, examId, cycleId,
      questionCount = 10, assessmentPurpose = 'DIAGNOSTIC_PRETEST', language = 'English',
    } = params;

    // ── 1. RESOLVE ───────────────────────────────────────────────────────────────────────────
    const resolution = await canonicalSyllabusResolver.resolve(examId, cycleId);
    if (resolution.outcome === 'NO_CANONICAL_SYLLABUS') {
      // The honest stop. No questions are generated and nothing is written.
      return {
        outcome: 'NO_CANONICAL_SYLLABUS',
        examId: resolution.examId, cycleId: resolution.cycleId,
        reason: resolution.reason, detail: resolution.detail,
        studentMessage: NO_CANONICAL_SYLLABUS_MESSAGE,
      };
    }

    // ── 2. SELECT NODES ──────────────────────────────────────────────────────────────────────
    const evidence = params.evidenceOverride ?? await this.readEvidence(studentId);
    const selected = this.selectNodes({
      candidates: resolution.questionBearingNodes,
      count: questionCount, studentId, syllabusId: resolution.syllabusId, evidence,
    });

    // ── 3. BUILD THE REQUEST ─────────────────────────────────────────────────────────────────
    const request: CanonicalPreTestRequest = {
      studentId,
      examId: resolution.examId,
      cycleId: resolution.cycleId,
      syllabusId: resolution.syllabusId,
      syllabusVersion: resolution.version,
      requestedNodeIds: selected.map((n) => n.id),
      questionCount: selected.length,
      difficultyDistribution: this.distributionFor(selected.length),
      assessmentPurpose, language,
      requestId: this.requestIdFor({
        studentId, syllabusId: resolution.syllabusId, assessmentPurpose,
        nodeIds: selected.map((n) => n.id),
      }),
    };

    // ── 4. GENERATE + 5. VALIDATE ────────────────────────────────────────────────────────────
    const questions: StoredQuizQuestion[] = [];
    const nodeIdsUsed: string[] = [];

    for (const node of selected) {
      /*
       * CANONICAL VALIDATION, before a single token is generated.
       *
       * Re-checked even though `selectNodes` drew from the resolved graph, because this is the
       * boundary a question crosses to become durable evidence. It proves the node exists, belongs
       * to this exact exam AND cycle AND syllabus version, and is a type a question may be authored
       * against (TOPIC/SUBTOPIC — never STAGE or PAPER).
       *
       * Deliberately BEFORE generation rather than just before the write. Validating afterwards
       * still guarded persistence, but the production generator performs its own node check and
       * THROWS on failure — so an identity problem surfaced as the generator throwing, and got
       * reported as GENERATION_PRODUCED_NO_QUESTIONS. That is the wrong fact: it blames the model
       * for a syllabus-integrity failure, and in an auditable system the reason code is the
       * finding. Checking first also avoids paying for a model call on a node we would reject.
       *
       * A failure here is FATAL for the whole request. It is never downgraded to UNANCHORED: the
       * caller asked for a syllabus-backed assessment, and quietly returning one that is not
       * syllabus-backed would be the substitution this entire gate exists to prevent.
       */
      const check = await syllabusGraphService.validateNodeForQuestion({
        examId: resolution.examId, nodeId: node.id,
        cycleId: resolution.cycleId, syllabusId: resolution.syllabusId,
      });
      if (!check.valid || !check.node) {
        logger.error('[CanonicalPreTest] canonical validation failed; refusing to generate', {
          studentId, examId: resolution.examId, cycleId: resolution.cycleId,
          syllabusId: resolution.syllabusId, nodeId: node.id, reason: check.reason,
        });
        return this.failed(resolution, 'CANONICAL_VALIDATION_FAILED',
          `node ${node.id} failed validation: ${check.reason}`);
      }

      const parentPath = await syllabusGraphService
        .getNodeParentPath(resolution.examId, node.id,
                           { cycleId: resolution.cycleId, syllabusId: resolution.syllabusId })
        .catch(() => [] as string[]);

      let produced: GeneratedQuestionContent[];
      try {
        produced = await this.generator.generate({
          node, parentPath,
          examId: resolution.examId, cycleId: resolution.cycleId, syllabusId: resolution.syllabusId,
          count: 1, difficulty: this.difficultyFor(node, questions.length),
          language,
        });
      } catch (err: any) {
        return this.failed(resolution, 'GENERATION_PRODUCED_NO_QUESTIONS',
          `generation threw for node ${node.id}: ${err?.message ?? err}`);
      }

      const usable = (produced ?? []).filter(
        (q) => q?.text?.trim() && Array.isArray(q.options) && q.options.length >= 2);
      if (usable.length === 0) {
        return this.failed(resolution, 'GENERATION_PRODUCED_NO_QUESTIONS',
          `generator returned nothing usable for node ${node.id}`);
      }

      for (const q of usable.slice(0, 1)) {
        questions.push({
          id: `cq_${request.requestId.slice(0, 12)}_${questions.length}`,
          text: q.text.trim(),
          // Display label only. If the model wrote "Quadratic Equations" while the selected node is
          // Algebra, the NODE still wins on every line below.
          topic: (q.topic ?? check.node.label).trim(),
          options: q.options.map(String),
          correctAnswerIndex: q.correctAnswerIndex,
          explanation: (q.explanation ?? '').trim(),
          // Identity stamped from the VALIDATED NODE, not from the request and not from the model.
          examId: check.node.examId,
          syllabusNodeId: check.node.id,
          syllabusId: check.node.syllabusId,
          cycleId: check.node.cycleId,
          identityStatus: 'CANONICAL',
        });
        nodeIdsUsed.push(check.node.id);
      }
    }

    if (questions.length === 0) {
      return this.failed(resolution, 'GENERATION_PRODUCED_NO_QUESTIONS',
        'no questions survived generation and validation');
    }

    // ── 6. PERSIST ───────────────────────────────────────────────────────────────────────────
    const attempt = await quizAttemptsService.createFromQuestions(studentId, questions, {
      title: `${resolution.examId} ${resolution.cycleId} — Diagnostic`,
      source: 'topic', mode: 'exam',
    });

    logger.info('[CanonicalPreTest] generated', {
      studentId, examId: resolution.examId, cycleId: resolution.cycleId,
      syllabusId: resolution.syllabusId, requestId: request.requestId,
      attemptId: attempt.id, questionCount: questions.length,
    });

    return {
      outcome: 'GENERATED', request, attemptId: attempt.id,
      questionCount: questions.length, nodeIdsUsed,
    };
  }

  // ── Node selection ─────────────────────────────────────────────────────────────────────────

  /**
   * Deterministic, application-owned selection across the canonical syllabus.
   *
   * Three properties it must have, in priority order:
   *
   *  1. CONTAINMENT. Every selected node comes from `candidates`, which is the resolved version's
   *     question-bearing set. Personalization can reorder and reweight; it can never introduce a
   *     node from outside the syllabus. That is why evidence is used as a SORT KEY over candidates
   *     rather than as a source of node ids.
   *  2. COVERAGE. A diagnostic that samples eight questions from one subject measures very little.
   *     Selection round-robins across parent subjects so breadth comes first and depth second.
   *  3. DETERMINISM. Ties break on a hash of (studentId, syllabusId, nodeId) — stable across runs
   *     and processes, but different per student, so two students get different tests from the
   *     same syllabus without anything random being involved.
   */
  private selectNodes(params: {
    candidates: SyllabusGraphNode[];
    count: number;
    studentId: string;
    syllabusId: string;
    evidence: Array<{ syllabusNodeId?: string; masteryScore: number }>;
  }): SyllabusGraphNode[] {
    const { candidates, count, studentId, syllabusId, evidence } = params;
    if (candidates.length === 0 || count <= 0) return [];

    // Evidence keyed by canonical node id ONLY. Free-text concept keys are ignored outright: an
    // unanchored "Algebra" record could belong to any exam, and using it here would reintroduce
    // exactly the cross-exam collision the canonical ids exist to prevent.
    const scoreByNode = new Map<string, number>();
    for (const e of evidence) {
      if (e.syllabusNodeId) scoreByNode.set(e.syllabusNodeId, e.masteryScore);
    }

    const ranked = [...candidates].sort((a, b) => {
      // Unmeasured nodes first (a diagnostic learns most where it knows least), then weakest.
      const sa = scoreByNode.has(a.id) ? scoreByNode.get(a.id)! : -1;
      const sb = scoreByNode.has(b.id) ? scoreByNode.get(b.id)! : -1;
      if (sa !== sb) return sa - sb;
      return this.tieBreak(studentId, syllabusId, a.id) - this.tieBreak(studentId, syllabusId, b.id);
    });

    // Round-robin over parent subjects for breadth.
    const buckets = new Map<string, SyllabusGraphNode[]>();
    for (const n of ranked) {
      const key = n.parentEntityId ?? '__root__';
      if (!buckets.has(key)) buckets.set(key, []);
      buckets.get(key)!.push(n);
    }
    const order = [...buckets.keys()].sort(
      (a, b) => this.tieBreak(studentId, syllabusId, a) - this.tieBreak(studentId, syllabusId, b));

    const picked: SyllabusGraphNode[] = [];
    let exhausted = false;
    while (picked.length < count && !exhausted) {
      exhausted = true;
      for (const key of order) {
        const bucket = buckets.get(key)!;
        if (bucket.length === 0) continue;
        picked.push(bucket.shift()!);
        exhausted = false;
        if (picked.length >= count) break;
      }
    }
    return picked;
  }

  /** Stable per-(student, version, node) ordering. Deterministic — no clock, no RNG. */
  private tieBreak(studentId: string, syllabusId: string, id: string): number {
    const h = crypto.createHash('sha256').update(`${studentId}${syllabusId}${id}`).digest();
    return h.readUInt32BE(0);
  }

  /** Canonical-node-keyed evidence only. Never fabricates: a read failure yields no evidence. */
  private async readEvidence(studentId: string): Promise<Array<{ syllabusNodeId?: string; masteryScore: number }>> {
    try {
      const concepts = await masteryEngine.listConcepts(studentId);
      return concepts.map((c: any) => ({ syllabusNodeId: c.syllabusNodeId, masteryScore: c.masteryScore }));
    } catch (err: any) {
      // Degrades to an unpersonalized-but-still-canonical selection. The syllabus boundary is
      // unaffected, so this is safe; asserting "no weak areas" would not be.
      logger.warn('[CanonicalPreTest] mastery unavailable; selecting without personalization', {
        studentId, error: err?.message,
      });
      return [];
    }
  }

  /** Deterministic identity for one logical request — see CanonicalPreTestRequest.requestId. */
  private requestIdFor(p: {
    studentId: string; syllabusId: string; assessmentPurpose: string; nodeIds: string[];
  }): string {
    const coordinates = [p.studentId, p.syllabusId, p.assessmentPurpose, ...p.nodeIds].join('');
    return `pretest_${crypto.createHash('sha256').update(coordinates).digest('hex').slice(0, 24)}`;
  }

  private difficultyFor(_node: SyllabusGraphNode, index: number): DifficultyBand {
    // A diagnostic opens easier and ramps, so an early wrong answer is informative rather than
    // merely discouraging. Positional and deterministic — never a claim about the student.
    if (index < 3) return 'EASY';
    if (index < 7) return 'MEDIUM';
    return 'HARD';
  }

  private distributionFor(total: number): DifficultyDistribution {
    const d: DifficultyDistribution = { ...DEFAULT_DISTRIBUTION };
    for (let i = 0; i < total; i++) {
      const band = this.difficultyFor({} as SyllabusGraphNode, i);
      d[band] = (d[band] ?? 0) + 1;
    }
    return d;
  }

  private failed(
    r: { examId: string; cycleId: string; syllabusId: string },
    reason: 'GENERATION_PRODUCED_NO_QUESTIONS' | 'CANONICAL_VALIDATION_FAILED',
    detail: string,
  ): PreTestResult {
    logger.error('[CanonicalPreTest] failing loudly rather than degrading', { ...r, reason, detail });
    return { outcome: 'FAILED', examId: r.examId, cycleId: r.cycleId, syllabusId: r.syllabusId,
             reason, detail };
  }
}

export const canonicalPreTestService = new CanonicalPreTestService();
