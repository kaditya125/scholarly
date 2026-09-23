import { WorkflowEvent, WorkflowStage, WorkflowRequest } from '../types';
import { AgentContext } from '../../agents/IAgent';
import { KnowledgeGraphAgent } from '../../agents/KnowledgeGraphAgent';
import { RetrievalService } from '../../../services/rag/retrieval.service';
import { referenceBooksService } from '../../../services/rag/referenceBooks.service';
import { knowledgeService, KnowledgeService, knowledgeRouter } from '../../knowledge';
import { Telemetry } from '../../../lib/telemetry';
import { QueryPlan } from './QueryPlanningService';
import { RetrievalError } from '../../errors/providerErrors';
import { featureFlags } from '../../../config/featureFlags';
import { ExecutionPlan } from '../../intelligence/types';
import { parsePyqQuery } from '../../../services/pyq/pyqQueryParser';
import { canonicalPyqRetrievalService } from '../../../services/pyq/canonicalPyqRetrieval.service';
import { GroundingState } from '../../../config/prompts';
import { logger } from '../../../utils/logger';
import { contentExplorationService } from '../../pipeline/exploration/ContentExplorationService';

export interface RetrievalOutcome {
  citationsList: any[];
  retrievalLatencyMs: number;
  /** What kind of evidence backs this turn; drives the grounding instructions in the prompt. */
  groundingState: GroundingState;
  /** One line of specifics for the grounding instruction (counts, what was missing). */
  groundingDetail?: string;
  /** Developer-facing record of what was planned, called and found. Never shown to a student. */
  trace: RetrievalTrace;
}

/**
 * Why an answer came out the way it did, in one object.
 *
 * The original failure was invisible from the outside: retrieval silently did not run, and the
 * only observable symptom was a confident wrong answer. This is the evidence trail that makes
 * that diagnosable — intent, what was called, what came back, and which grounding state the
 * prompt was given. Carries ids and counts only; no question text, no student profile fields.
 */
export interface RetrievalTrace {
  intent: string;
  examId: string | null;
  year: number | null;
  shift: number | null;
  paper: string | null;
  topic: string | null;
  strategy: string;
  canonicalLookupRan: boolean;
  canonicalStatus: string | null;
  canonicalPaperId: string | null;
  canonicalRecords: number;
  expectedRecords: number | null;
  vectorSearchRan: boolean;
  vectorHits: number;
  notebookSearchRan: boolean;
  webSearchRan: boolean;
  contextChars: number;
  groundingState: GroundingState;
  fallbackReason?: string;
  /**
   * Per-stage milliseconds.
   *
   * The Phase 1 report could only say a full-paper turn took 54-152s, which is not actionable:
   * it does not distinguish a slow Firestore scan from a slow model. Each stage is timed
   * separately so the next optimisation is aimed at evidence rather than at a guess.
   */
  timings: {
    intentParse: number;
    canonicalLookup: number;
    vectorSearch: number;
    contextBuild: number;
    totalRetrieval: number;
  };
}

/**
 * RetrievalOrchestrator — owns Stage 4 (knowledge-graph retrieval) + Stage 5 (vector/web/
 * curriculum retrieval) and the Hybrid-GraphRAG context fusion. Implemented as an async
 * generator so the exact SSE event sequence (graph detail → RAG progress → citation events →
 * RAG detail) is preserved; it `return`s the citations + retrieval latency to the caller.
 *
 * Coordinates through KnowledgeService abstraction for shared retrieval logic.
 */
export class RetrievalOrchestrator {
  constructor(
    private readonly retrievalService: RetrievalService = new RetrievalService(),
    private readonly knowledge: KnowledgeService = knowledgeService
  ) {}

  /**
   * Stage 4: knowledge-graph retrieval. Extracted from stream() so it can run CONCURRENTLY
   * with context + memory loading (Increment 4 parallelization). Populates agentContext.sharedState
   * (graphContext / graphExpansionTerms / graphMeta) exactly as before. Non-fatal internally
   * (the KnowledgeGraphAgent swallows its own errors).
   */
  async runGraphRetrieval(agentContext: AgentContext): Promise<void> {
    const graphAgent = new KnowledgeGraphAgent();
    await graphAgent.execute(agentContext);
  }

  /** The graph-retrieval "detail" progress line (verbatim), emitted by the orchestrator caller. */
  buildGraphDetailMessage(req: WorkflowRequest, agentContext: AgentContext): string {
    const gm = (agentContext.sharedState['graphMeta'] as any) || {};
    if ((gm.nodeCount || 0) > 0) {
      const labels: string[] = (gm.matchedLabels || []).slice(0, 3);
      const labelStr = labels.length ? ` (${labels.join(', ')})` : '';
      const expanded: string[] = (gm.expansionTerms || []).slice(0, 4);
      const expStr = expanded.length ? ` Expanded to related concepts: ${expanded.join(', ')}.` : '';
      return `Matched ${gm.matched} concept(s)${labelStr} in the knowledge graph, then traversed ${gm.nodeCount} node(s) / ${gm.edgeCount} relationship(s) in ${gm.traversalMs}ms to gather prerequisites.${expStr}`;
    }
    return req.notebookId
      ? `No concept nodes matched this query in the notebook graph — falling back to vector search alone.`
      : `No notebook attached, so no concept graph to traverse — using general subject knowledge.`;
  }

  /**
   * Stage 5: vector/web/curriculum retrieval + Hybrid-GraphRAG fusion. Assumes the graph stage
   * (runGraphRetrieval) has already populated agentContext.sharedState. Yields the RAG progress +
   * citation events verbatim and returns the citations + retrieval latency.
   */
  async *stream(
    req: WorkflowRequest,
    agentContext: AgentContext,
    plan: QueryPlan,
    execPlan?: ExecutionPlan,
  ): AsyncGenerator<WorkflowEvent, RetrievalOutcome, unknown> {
    // ── Stage 5: Vector Retrieval (RAG) ────────────────────────────────
    yield { type: 'progress', stage: WorkflowStage.RAG_RETRIEVAL, message: 'Searching memory and the web...' };
    const retrievalStartTime = Date.now();
    let contextStr = '';
    // Declared here rather than beside the vector branch: the canonical branch below runs first
    // and emits its own citations.
    const citationsList: any[] = [];

    const { needsWebSearch, hasAttachment, isConversational } = plan;

    if (isConversational) {
      logger.info('[RetrievalOrchestrator] Conversational / capability query — skipping textbook & curriculum retrieval', {
        query: req.query,
      });
      return {
        citationsList: [],
        retrievalLatencyMs: 0,
        groundingState: 'GENERAL',
        trace,
      };
    }

    // Adaptive retrieval routing (Increment 2), sub-flag default OFF. When OFF (or no plan) the
    // strategy is 'graphrag' → identical to today's pipeline. When ON, the Intelligence Layer's
    // strategy narrows which sources are used (definition→vector-only, research→+web, etc.).
    const routingOn = featureFlags.intelligenceRetrievalRouting && !!execPlan;
    const strategy = routingOn ? execPlan!.retrievalStrategy : 'graphrag';
    const doWeb = needsWebSearch || strategy === 'graph_web';
    let doVector = strategy !== 'none';
    const doGraphFusion = strategy !== 'none' && strategy !== 'vector' && strategy !== 'notebook';

    /*
     * ── Canonical lookup, before any semantic search ──────────────────────────────────────────
     *
     * A request that names a sitting ("SSC CGL 2022 Shift 1") is a request for specific records,
     * not for whatever is semantically nearest. It is answered from Firestore by canonicalPaperId,
     * in question-number order. Nearest-neighbour search cannot answer it correctly even in
     * principle: it would assemble a set of real questions that never sat together.
     *
     * This runs first and, when it succeeds, suppresses the vector branch entirely — mixing
     * curriculum passages into a paper listing only invites the model to blur the two.
     */
    const tParse = Date.now();
    const parsed = await parsePyqQuery(req.query);
    const parseMs = Date.now() - tParse;
    const trace: RetrievalTrace = {
      intent: parsed.intent, examId: parsed.examId, year: parsed.year, shift: parsed.shift,
      paper: parsed.paper, topic: parsed.topic, strategy,
      canonicalLookupRan: false, canonicalStatus: null, canonicalPaperId: null,
      canonicalRecords: 0, expectedRecords: null,
      vectorSearchRan: false, vectorHits: 0, notebookSearchRan: false, webSearchRan: doWeb,
      contextChars: 0, groundingState: 'GENERAL_KNOWLEDGE',
      timings: { intentParse: 0, canonicalLookup: 0, vectorSearch: 0, contextBuild: 0, totalRetrieval: 0 },
    };
    let groundingState: GroundingState = 'GENERAL_KNOWLEDGE';
    let groundingDetail: string | undefined;

    const tCanonicalStart = Date.now();
    if (parsed.intent === 'EXACT_PYQ' && !parsed.examId) {
      /*
       * A past-paper request naming an exam the corpus does not contain — "GATE CS 2024 paper".
       * There is nothing to look up, but "nothing to look up" must not mean "answer from memory":
       * that is precisely how an invented GATE paper reaches a student. The absence is stated as a
       * fact and the grounding instructions forbid reconstruction.
       */
      trace.canonicalLookupRan = true;
      trace.canonicalStatus = 'NOT_AVAILABLE_IN_VERIFIED_CORPUS';
      const named = parsed.unresolvedExamHint ?? 'that exam';
      groundingState = 'CANONICAL_NOT_FOUND';
      groundingDetail = `Sadhya's verified corpus contains no questions for ${named}.`;
      doVector = false;
      contextStr += `=== CANONICAL LOOKUP RESULT (AUTHORITATIVE) ===\n` +
        `Query: ${named}${parsed.year ? ` ${parsed.year}` : ''}\n` +
        `Records found: 0\n` +
        `Sadhya's verified question bank contains NO questions for ${named}. The corpus was queried\n` +
        `and holds nothing for this exam. This is a checked fact, not an absence of effort.\n\n`;
    } else if (parsed.intent === 'EXACT_PYQ' && parsed.examId) {
      trace.canonicalLookupRan = true;
      yield { type: 'progress', stage: WorkflowStage.RAG_RETRIEVAL, message: 'Checking Sadhya\'s verified question corpus...' };
      try {
        const canonical = await canonicalPyqRetrievalService.retrieve({
          examId: parsed.examId, year: parsed.year, shift: parsed.shift,
          paper: parsed.paper, wantsFullPaper: parsed.wantsFullPaper,
        });
        trace.canonicalStatus = canonical.status;
        trace.canonicalRecords = canonical.retrievedCount;
        trace.expectedRecords = canonical.expectedCount;
        trace.canonicalPaperId = (canonical.questions[0] as any)?.canonicalPaperId ?? null;

        if (canonical.status === 'CANONICAL_RETRIEVED' || canonical.status === 'PARTIAL_CANONICAL_PAPER') {
          const block = canonicalPyqRetrievalService.toContextBlock(canonical);
          if (block) {
            contextStr += block;
            doVector = false; // the paper is the answer; do not dilute it
            groundingState = canonical.status === 'CANONICAL_RETRIEVED' ? 'CANONICAL_RETRIEVED' : 'PARTIAL_CANONICAL';
            groundingDetail = canonical.diagnostics;
            for (const q of canonical.questions.slice(0, 5) as any[]) {
              const citation = {
                source: [q.examName || q.examId, q.year, q.shift].filter(Boolean).join(' · '),
                text: String(q.questionText ?? '').slice(0, 300),
                score: 1, authorityScore: 1.5,
                selectionReasoning: 'Canonical record retrieved from Sadhya\'s verified corpus.',
                sourceId: q.canonicalPaperId, questionId: q.questionId,
                contentOrigin: 'CANONICAL_PYQ',
              };
              citationsList.push(citation);
              yield { type: 'citation', citation };
            }
          }
        } else {
          // AMBIGUOUS_PAPER or NOT_AVAILABLE_IN_VERIFIED_CORPUS. Either way the model must not
          // reconstruct the paper, so the corpus's own answer is what goes into context.
          groundingState = 'CANONICAL_NOT_FOUND';
          groundingDetail = canonical.diagnostics;
          doVector = false;
          contextStr += `=== CANONICAL LOOKUP RESULT ===\nStatus: ${canonical.status}\n${canonical.diagnostics}\n`;
          if (canonical.papers.length > 0) {
            contextStr += `Papers that ARE available for this exam/year:\n`;
            for (const p of canonical.papers.slice(0, 10)) {
              contextStr += `  - ${[p.year, p.session, p.shift, p.paper].filter(Boolean).join(' · ') || p.canonicalPaperId} (${p.questionCount} questions)\n`;
            }
          }
          contextStr += '\n';
        }
      } catch (e: any) {
        // A failed lookup must not degrade into "answer from memory" — that is the original bug.
        trace.fallbackReason = `canonical lookup error: ${String(e?.message ?? e).slice(0, 120)}`;
        groundingState = 'CANONICAL_NOT_FOUND';
        groundingDetail = 'The verified corpus could not be queried for this request.';
        doVector = false;
        contextStr += `=== CANONICAL LOOKUP RESULT ===\nStatus: LOOKUP_FAILED\n`;
        logger.error('[RetrievalOrchestrator] canonical lookup failed', { error: String(e?.message ?? e) });
      }
    } else if (parsed.intent === 'GENERATED_PRACTICE') {
      groundingState = 'GENERATED';
      groundingDetail = parsed.examId
        ? `Generation constrained to ${parsed.examId}${parsed.topic ? ` / ${parsed.topic}` : ''}.`
        : undefined;
    }

    if (doWeb) {
      try {
        const webResults = await this.retrievalService.retrieveWebContext(req.query);
        if (webResults.length > 0) {
          contextStr += "=== LATEST WEB SEARCH RESULTS ===\n";
          webResults.forEach(r => {
            contextStr += `[Source: ${r.source}]\n${r.text}\n\n`;
          });
        }
      } catch (err) {
        console.warn("Web search failed", err);
      }
    }

    // If we have a notebookId, retrieve hierarchical context
    trace.timings.canonicalLookup = Date.now() - tCanonicalStart;

    /*
     * ── Notebook access is checked, not assumed ───────────────────────────────────────────────
     *
     * `notebookId` arrives in the request body and used to be passed straight into the vector
     * filter as `{ notebookId }` with no ownership check anywhere on the path. An isolation test
     * confirmed the consequence: a synthetic user who owned nothing retrieved another account's
     * notebook — "A Modern Approach to Verbal and Non Verbal Reasoning.pdf" — simply by naming
     * its id.
     *
     * The authenticated uid from the Firebase token is the only identity trusted here.
     * `ensureCollectionAccess` throws unless the caller is owner, editor or viewer. A refused
     * notebook is dropped silently rather than erroring: the turn still answers from the shared
     * corpora, and a denial that says nothing also tells a prober nothing about what exists.
     */
    let notebookAllowed = Boolean(req.notebookId);
    if (req.notebookId) {
      try {
        await contentExplorationService.ensureCollectionAccess(req.userId, req.notebookId);
      } catch (e: any) {
        notebookAllowed = false;
        trace.fallbackReason = 'notebook access denied';
        logger.warn('[Retrieval] notebook access denied', {
          userId: req.userId, notebookId: req.notebookId, reason: String(e?.message ?? e).slice(0, 120),
        });
      }
    }

    if (doVector && req.notebookId && notebookAllowed) {
      trace.notebookSearchRan = true;
      trace.vectorSearchRan = true;
      // Phase 2: pass graph-neighbor expansion terms (from KnowledgeGraphAgent,
      // Stage 4) so vector recall is widened via the graph — zero extra API cost.
      const expansionTerms = (agentContext.sharedState['graphExpansionTerms'] as string[]) || [];
      let notebookResults: Awaited<ReturnType<RetrievalService['retrieveContext']>>;
      try {
        // Hard learning scope: when the student selected chapters/topics in the Learn pane,
        // req.scopeSourceIds restricts this vector search to those chapters' sourceIds so the
        // tutor is grounded ONLY in the selected content.
        notebookResults = await this.retrievalService.retrieveContext(req.query, req.notebookId, undefined, 5, expansionTerms, req.scopeSourceIds);
      } catch (e: any) {
        // Surface as a typed RetrievalError (message preserved; still fatal for this turn as
        // before — propagates to the workflow's error event).
        throw new RetrievalError(String(e?.message || e), { cause: e, provider: 'pinecone' });
      }
      if (notebookResults.length > 0) {
        contextStr += "=== NOTEBOOK CONTEXT ===\n";
        for (const r of notebookResults) {
          contextStr += `[Citation: ${r.source} (Page ${r.metadata?.pageNumber || 1})]\n${r.text}\n\n`;
          const citationData = {
            source: r.source,
            text: r.text,
            score: r.score,
            authorityScore: r.metadata?.authority || 0.8,
            selectionReasoning: r.selectionReasoning || 'Highly relevant to your query.',
            pageNumber: r.metadata?.pageNumber,
            paragraphIndex: r.metadata?.paragraphIndex,
            // Identifiers so the UI can deep-link a cited source into the reader (/read).
            sourceId: r.metadata?.sourceId,
            notebookId: r.metadata?.notebookId,
            title: r.metadata?.sourceTitle || r.source,
          };
          citationsList.push(citationData);
          yield { type: 'citation', citation: citationData };
        }
      }
    } else if (doVector && !hasAttachment) {
      trace.vectorSearchRan = true;
      // No notebook attached and no uploaded file — ground the answer in the shared,
      // admin-ingested NCERT curriculum corpus (scoped to the curriculum owner, so no
      // other user's private notebooks are exposed) instead of relying purely on the
      // model's own knowledge. Skipped when a file is attached (that file is the context).
      try {
        const routePlan = knowledgeRouter.route({ query: req.query, notebookId: req.notebookId });
        
        // Parallel multi-corpus retrieval execution.
        //
        // PYQs were missing from this list: the router computed `usePYQs` and nothing ever read
        // it, so 22,000 indexed past-paper vectors could not reach an answer no matter what the
        // router decided. They are retrieved official-only here — a practice question is useful
        // for drilling, but it should not be quoted back to a student as a past paper.
        const tVector = Date.now();
        const [curriculumOutcome, refOutcome, syllabusOutcome, pyqOutcome] = await Promise.allSettled([
          this.retrievalService.retrieveCurriculumContext(req.query, 5),
          routePlan.useReferenceBooks
            ? referenceBooksService.retrieveReferenceContext(req.query, {
                topK: 2,
                book: routePlan.referenceBookFilters?.books,
                publisher: routePlan.referenceBookFilters?.publisher,
              })
            : Promise.resolve([]),
          (routePlan.useOfficialSyllabus && routePlan.targetExamId)
            ? this.retrievalService.retrieveOfficialSyllabusContext(routePlan.targetExamId, req.query, 2)
            : Promise.resolve([]),
          /*
           * Exam identity comes from the parser, not the router.
           *
           * knowledgeRouter detects exams with a hardcoded regex list that has no UGC NET entry,
           * so `targetExamId` was undefined for "UGC NET Computer Science PYQs on DBMS" — and an
           * undefined examId means an UNFILTERED vector search. An isolation test caught the
           * consequence: that query came back with three JEE Main citations. `parsedExamId` is
           * resolved from live corpus data (examIndex), so it knows every exam actually ingested.
           */
          // With no exam named in the query, the student's own target exam is the filter — never
          // when they named an exam we could not resolve (that must not be searched as their exam).
          (routePlan.usePYQs || parsed.intent === 'PYQ_SEARCH')
            ? this.retrievalService.retrievePyqContext(req.query, {
                examId: parsed.examId ?? routePlan.targetExamId
                  ?? (parsed.unresolvedExamHint ? undefined : agentContext.studentContext?.examContext?.examId ?? undefined),
                subject: routePlan.targetSubject,
                topic: parsed.topic ?? undefined,
                officialOnly: true,
                topK: 3,
              })
            : Promise.resolve([]),
        ]);

        trace.timings.vectorSearch = Date.now() - tVector;
        const curriculumResults = curriculumOutcome.status === 'fulfilled' ? curriculumOutcome.value : [];
        const refResults = refOutcome.status === 'fulfilled' ? refOutcome.value : [];
        const syllabusResults = syllabusOutcome.status === 'fulfilled' ? syllabusOutcome.value : [];
        const pyqResults = pyqOutcome.status === 'fulfilled' ? pyqOutcome.value : [];

        // 1. NCERT Curriculum
        if (curriculumResults.length > 0) {
          contextStr += "=== NCERT CURRICULUM CONTEXT ===\n";
          for (const r of curriculumResults) {
            contextStr += `[Citation: ${r.source}]\n${r.text}\n\n`;
            const citationData = {
              source: r.source,
              text: r.text,
              score: r.score,
              authorityScore: r.metadata?.authority || 1.5,
              selectionReasoning: r.selectionReasoning || 'Relevant passage from the NCERT curriculum.',
              pageNumber: r.metadata?.pageNumber,
              paragraphIndex: r.metadata?.paragraphIndex,
              sourceId: r.metadata?.sourceId,
              notebookId: r.metadata?.notebookId,
              title: r.metadata?.sourceTitle || r.source,
            };
            citationsList.push(citationData);
            yield { type: 'citation', citation: citationData };
          }
        }

        // 2. Reference Books (Augmentation)
        if (refResults.length > 0) {
          contextStr += "=== REFERENCE BOOK CONTEXT (LUCENT / S. CHAND) ===\n";
          for (const r of refResults) {
            contextStr += `[Citation: ${r.source}]\n${r.text}\n\n`;
            const citationData = {
              source: r.source,
              text: r.text,
              score: r.score,
              authorityScore: 1.1,
              selectionReasoning: r.selectionReasoning || 'Supplementary reference context.',
              pageNumber: r.metadata?.pageNumber,
              figureAssetUrl: r.metadata?.figureAssetUrl || null,
              sourceId: r.metadata?.book || 'reference_book',
              notebookId: 'reference_books',
              title: r.source,
            };
            citationsList.push(citationData);
            yield { type: 'citation', citation: citationData };
          }
        }

        // 2b. Authentic previous-year questions
        if (pyqResults.length > 0) {
          contextStr += '=== PREVIOUS YEAR QUESTIONS (VERIFIED OFFICIAL) ===\n';
          for (const p of pyqResults) {
            const m = p.metadata || {};
            const sitting = [m.examId, m.year, m.session, m.shift].filter(Boolean).join(' ');
            contextStr += `[Citation: ${sitting || p.source}]\n${p.text}\n\n`;
            const citationData = {
              source: sitting || p.source,
              text: p.text,
              score: p.score,
              authorityScore: 1.4,
              selectionReasoning:
                p.selectionReasoning || `Verified official past-paper question (${sitting}).`,
              sourceId: m.canonicalPaperId || m.sourceId,
              notebookId: m.notebookId,
              title: sitting || p.source,
            };
            citationsList.push(citationData);
            yield { type: 'citation', citation: citationData };
          }
        }

        // 3. Official Syllabus
        if (syllabusResults.length > 0 && routePlan.targetExamId) {
          contextStr += `=== OFFICIAL SYLLABUS CONTEXT (${routePlan.targetExamId}) ===\n`;
          for (const s of syllabusResults) {
            contextStr += `[Citation: ${s.source}]\n${s.text}\n\n`;
            const citationData = {
              source: s.source,
              text: s.text,
              score: s.score,
              authorityScore: 1.5,
              selectionReasoning: `Official Syllabus item for ${routePlan.targetExamId}`,
              sourceId: s.metadata?.sourceId || s.metadata?.syllabusVersionId,
              notebookId: `exam-${routePlan.targetExamId.toLowerCase()}`,
              title: s.source,
            };
            citationsList.push(citationData);
            yield { type: 'citation', citation: citationData };
          }
        }
      } catch (err) {
        console.warn('Multi-corpus retrieval failed (non-fatal):', err);
      }
    }

    // ── Hybrid GraphRAG (Phase 1): fuse Knowledge Graph context ────────
    // The KnowledgeGraphAgent (Stage 4) placed notebook-scoped graph context
    // into shared state. Prepend it so concepts + relationships + definitions
    // reach the TeacherAgent alongside the vector chunks. Graph retrieval is
    // pure Firestore + string ops (zero extra Gemini cost).
    const graphContextStr = (agentContext.sharedState['graphContext'] as string) || '';
    if (doGraphFusion && graphContextStr) {
      const graphMeta = (agentContext.sharedState['graphMeta'] as any) || {};
      Telemetry.logLatency('graph_retrieval', graphMeta.traversalMs || 0, {
        notebookId: req.notebookId,
        nodeCount: graphMeta.nodeCount || 0,
        edgeCount: graphMeta.edgeCount || 0,
        matched: graphMeta.matched || 0,
      });
      contextStr = `=== KNOWLEDGE GRAPH CONTEXT ===\n${graphContextStr}\n\n${contextStr}`;
    }

    agentContext.retrievedContext = contextStr || 'No specific context found.';

    /*
     * Settle the grounding state.
     *
     * A canonical verdict (retrieved / partial / not-found) is authoritative and is never
     * downgraded by what semantic search did or did not find — "the corpus does not hold this
     * paper" stays true regardless of how many curriculum passages matched. Everything else is
     * decided by what actually reached the model.
     */
    const canonicalDecided = groundingState === 'CANONICAL_RETRIEVED'
      || groundingState === 'PARTIAL_CANONICAL'
      || groundingState === 'CANONICAL_NOT_FOUND'
      || groundingState === 'GENERATED';
    if (!canonicalDecided) {
      if (req.notebookId && citationsList.length > 0) groundingState = 'NOTEBOOK';
      else if (citationsList.length > 0) groundingState = 'GENERAL_KNOWLEDGE';
      else {
        groundingState = 'GENERAL_KNOWLEDGE';
        trace.fallbackReason = trace.vectorSearchRan
          ? 'semantic search returned no passages above threshold'
          : 'no retrieval source applied to this query';
      }
    }
    trace.vectorHits = citationsList.length;
    trace.contextChars = contextStr.length;
    trace.groundingState = groundingState;
    trace.timings.intentParse = parseMs;
    trace.timings.totalRetrieval = Date.now() - retrievalStartTime;
    trace.timings.contextBuild = Math.max(
      0,
      trace.timings.totalRetrieval - trace.timings.intentParse - trace.timings.canonicalLookup - trace.timings.vectorSearch,
    );

    // Developer-facing only: ids and counts, no question text and no student profile fields.
    logger.info('[Retrieval] trace', { sessionId: req.sessionId, ...trace });

    {
      if (hasAttachment) {
        yield {
          type: 'progress', stage: WorkflowStage.RAG_RETRIEVAL, detail: true,
          message: `Read the file you attached and used its contents as the primary source — no external retrieval needed.`,
        };
      } else if (citationsList.length > 0) {
        const uniqueSources = Array.from(new Set(citationsList.map((c: any) => c.source).filter(Boolean)));
        const shown = uniqueSources.slice(0, 3).join(', ');
        const more = uniqueSources.length > 3 ? ` +${uniqueSources.length - 3} more` : '';
        const corpus = req.notebookId ? 'your material' : 'the NCERT curriculum';
        yield {
          type: 'progress', stage: WorkflowStage.RAG_RETRIEVAL, detail: true,
          message: `Embedded your query and ran semantic search over ${corpus} — retrieved ${citationsList.length} passage(s) from ${uniqueSources.length} source(s) (${shown}${more}), reranked by relevance.`,
        };
      } else if (doWeb) {
        yield {
          type: 'progress', stage: WorkflowStage.RAG_RETRIEVAL, detail: true,
          message: `Ran a live web search for up-to-date information on this query.`,
        };
      } else {
        yield {
          type: 'progress', stage: WorkflowStage.RAG_RETRIEVAL, detail: true,
          message: req.notebookId
            ? `Semantic search found no strongly-matching passages in your material — answering from general knowledge.`
            : `No strongly-matching passages in the curriculum corpus — answering from general subject knowledge.`,
        };
      }
    }

    const retrievalLatencyMs = Date.now() - retrievalStartTime;
    return { citationsList, retrievalLatencyMs, groundingState, groundingDetail, trace };
  }
}

export const retrievalOrchestrator = new RetrievalOrchestrator();
