/**
 * AgenticRetrievalOrchestrator — experimental sibling of RetrievalOrchestrator. Instead of a
 * fixed retrieval sequence, the model itself decides which of the shared retrieval tools
 * (src/core/tools/retrievalTools.ts) to call, in a bounded loop (GeminiProvider.generateWithTools).
 * Only reached from WorkflowEngine's AGENTIC branch, itself gated by BOTH
 * featureFlags.agenticRetrieval AND a per-request opt-in — the deterministic RetrievalOrchestrator
 * pipeline remains the default and is completely untouched by this file's existence.
 *
 * Exposes the same self-contained shape the existing PODCAST branch uses: an async generator
 * yielding WorkflowEvents directly (progress/chunk/citation/done), rather than a RetrievalOutcome
 * that would need to flow through the general teacher/formatter/verification stages built for the
 * deterministic path.
 *
 * ── Two-layer safety design ──────────────────────────────────────────────────────────────────
 *
 * The deterministic pipeline exists because a real bug once had chat fabricate PYQ content
 * instead of retrieving it. Letting a model decide its own retrieval steps reopens exactly that
 * risk, so two layers guard against it:
 *
 *  1. Exact-paper requests ("SSC CGL 2022 Shift 1") never enter the tool-calling loop at all.
 *     `parsePyqQuery` — the same parser the deterministic pipeline runs first — is checked before
 *     anything else; an EXACT_PYQ intent is answered via the existing, unmodified
 *     `retrievalOrchestrator.stream()` (same retrieval, same grounding notice, same citations),
 *     with only the final drafting step simplified to one direct call instead of the
 *     TeacherAgent/ResponseFormatter two-pass — the retrieval and grounding guarantees that
 *     matter for correctness are identical either way.
 *  2. For everything else, `lookup_canonical_pyq` stays available as a tool in case the model
 *     reaches for it mid-turn. After the loop ends, the call log is scanned: if that tool was
 *     called and reported `NOT_AVAILABLE_IN_VERIFIED_CORPUS`, the SAME deterministic notice the
 *     main pipeline emits (WorkflowEngine.ts's CANONICAL_NOT_FOUND handling) is force-emitted
 *     before the model's own text — the backend states absence, not the model, for the documented
 *     reason that phrasing of absence drifted across runs when left to prompt-following alone.
 */
import { AgentContext } from '../../agents/IAgent';
import { WorkflowEvent, WorkflowRequest, WorkflowStage } from '../types';
import { retrievalOrchestrator } from './RetrievalOrchestrator';
import { queryPlanningService } from './QueryPlanningService';
import { parsePyqQuery } from '../../../services/pyq/pyqQueryParser';
import { buildSadhyaSystemPrompt } from '../../../config/prompts';
import { GeminiProvider } from '../../../services/ai/gemini.provider';
import { GEMINI_RETRIEVAL_TOOL_DECLARATIONS, executeRetrievalTool } from '../../tools/retrievalTools';
import { ChatMessage } from '../../../types';

const MAX_TOOL_ITERATIONS = 5;

interface ToolCallLogEntry {
  name: string;
  args: Record<string, unknown>;
  result: { ok: boolean; data?: any; error?: string };
}

function toCitations(entry: ToolCallLogEntry): any[] {
  const { name, result } = entry;
  if (!result.ok || !result.data) return [];

  if (name === 'lookup_canonical_pyq') {
    const status = result.data.status;
    if (status !== 'CANONICAL_RETRIEVED' && status !== 'PARTIAL_CANONICAL_PAPER') return [];
    const paper = result.data.papers?.[0];
    const header = paper
      ? [paper.examId, paper.year, paper.session, paper.shift, paper.paper].filter(Boolean).join(' · ')
      : (result.data.examId || 'Verified corpus');
    return (result.data.questions || []).slice(0, 5).map((q: any) => ({
      source: header,
      text: String(q.questionText ?? '').slice(0, 300),
      score: 1,
      authorityScore: 1.5,
      selectionReasoning: 'Canonical record retrieved from Sadhya\'s verified corpus.',
      questionId: q.questionId,
      contentOrigin: 'CANONICAL_PYQ',
    }));
  }

  if (Array.isArray(result.data.results)) {
    return result.data.results.map((r: any) => ({
      source: r.source,
      text: r.text,
      score: r.score,
      authorityScore: 1.1,
      selectionReasoning: `Retrieved via ${name} during agentic retrieval.`,
      sourceId: r.sourceId,
    }));
  }

  return [];
}

function buildAgenticSystemPrompt(agentContext: AgentContext, req: WorkflowRequest): string {
  // Reuse the full persona/identity/exam-knowledge machinery — no groundingState/retrievedContext
  // is passed (neither is known before the tool loop runs), so it falls back to the generic
  // "answer confidently" instructions, which this appends tool-calling-specific rules on top of.
  const base = buildSadhyaSystemPrompt({
    mode: String(req.mode || 'TEACHER'),
    viewerRole: req.productRole === 'teacher' ? 'teacher' : 'student',
    studentContext: agentContext.studentContext,
    teacherContext: agentContext.teacherContext,
    hasNotebookContext: false,
  });

  return `${base}

## Agentic Retrieval Mode (experimental)
You have retrieval tools available (resolve_exam_id, lookup_canonical_pyq, search_pyq,
search_curriculum, search_reference_books, search_official_syllabus, get_exam_syllabus,
get_exam_pattern_analytics). Call whichever are relevant before answering — do not guess an
examId, call resolve_exam_id first when the exam isn't already known.

**Non-negotiable rule**: if you call lookup_canonical_pyq and its status comes back
NOT_AVAILABLE_IN_VERIFIED_CORPUS, you MUST state plainly that Sadhya's verified corpus does not
have that material. You MUST NOT reproduce, reconstruct, or approximate the paper from your own
training knowledge, and MUST NOT present anything you write as a previous-year question. This
overrides any instinct to always give a complete-sounding answer — declining to invent is correct.
If status is PARTIAL_CANONICAL_PAPER, say plainly how many records were found and do not invent
the rest. Any question you generate yourself must be labeled as practice, never as a real PYQ.`;
}

class AgenticRetrievalOrchestrator {
  /**
   * Layer 1: reproduces the deterministic pipeline's retrieval + grounding notice for exact-paper
   * requests, without the tool-calling loop. Generation is a single direct call rather than the
   * TeacherAgent/ResponseFormatter two-pass — a deliberate simplification that does not touch the
   * retrieval or grounding guarantees, only the prose-polishing step.
   */
  private async *streamDeterministic(
    req: WorkflowRequest,
    agentContext: AgentContext,
  ): AsyncGenerator<WorkflowEvent, void, unknown> {
    const plan = queryPlanningService.plan(req.query, String(req.mode || 'TEACHER'));
    const outcome = yield* retrievalOrchestrator.stream(req, agentContext, plan);

    if (outcome.groundingState === 'CANONICAL_NOT_FOUND') {
      const detail = outcome.groundingDetail?.trim();
      const notice = detail
        ? `**${detail.replace(/\.?$/, '.')}**\n\n`
        : `**I don't have that material in Sadhya's verified question bank.**\n\n`;
      yield { type: 'chunk', chunk: notice };
    }

    yield { type: 'progress', stage: WorkflowStage.AGENT_EXECUTION, message: 'Composing the answer...' };

    const systemPrompt = buildSadhyaSystemPrompt({
      mode: String(req.mode || 'TEACHER'),
      viewerRole: req.productRole === 'teacher' ? 'teacher' : 'student',
      studentContext: agentContext.studentContext,
      teacherContext: agentContext.teacherContext,
      retrievedContext: agentContext.retrievedContext,
      hasNotebookContext: Boolean(req.notebookId),
      groundingState: outcome.groundingState,
      groundingDetail: outcome.groundingDetail,
    });

    const provider = new GeminiProvider();
    const history: ChatMessage[] = [...req.history, { role: 'user', content: req.query, timestamp: Date.now() } as ChatMessage];
    const anyProvider = provider as any;
    if (typeof anyProvider.generateStreamResponse === 'function') {
      for await (const chunk of anyProvider.generateStreamResponse(history, systemPrompt, {
        traceId: req.traceId, model: req.model, userId: req.userId,
      })) {
        yield { type: 'chunk', chunk };
      }
    } else {
      const res = await provider.generateResponse(history, systemPrompt, {
        traceId: req.traceId, model: req.model, userId: req.userId,
      });
      yield { type: 'chunk', chunk: res.reply };
    }

    yield {
      type: 'done',
      data: {
        citations: outcome.citationsList,
        assets: [],
        confidenceScore: outcome.citationsList.length > 0 ? 0.9 : 0.7,
      },
    };
  }

  async *stream(req: WorkflowRequest, agentContext: AgentContext): AsyncGenerator<WorkflowEvent, void, unknown> {
    const parsed = await parsePyqQuery(req.query).catch(() => null);
    if (parsed?.intent === 'EXACT_PYQ') {
      yield* this.streamDeterministic(req, agentContext);
      return;
    }

    yield { type: 'progress', stage: WorkflowStage.RAG_RETRIEVAL, message: 'Deciding which sources to search...' };

    const systemPrompt = buildAgenticSystemPrompt(agentContext, req);
    const callLog: ToolCallLogEntry[] = [];
    const executeTool = async (name: string, args: Record<string, unknown>) => {
      const result = await executeRetrievalTool(name, args, { userId: req.userId });
      callLog.push({ name, args, result });
      return result;
    };

    const provider = new GeminiProvider();
    const history: ChatMessage[] = [...req.history, { role: 'user', content: req.query, timestamp: Date.now() } as ChatMessage];
    const { text } = await provider.generateWithTools(
      history,
      systemPrompt,
      GEMINI_RETRIEVAL_TOOL_DECLARATIONS as any,
      executeTool,
      { traceId: req.traceId, model: req.model, userId: req.userId, maxIterations: MAX_TOOL_ITERATIONS },
    );

    const citationsList: any[] = [];
    for (const entry of callLog) {
      yield {
        type: 'progress', stage: WorkflowStage.RAG_RETRIEVAL, detail: true,
        message: `Called ${entry.name}(${JSON.stringify(entry.args)})`,
      };
      for (const citation of toCitations(entry)) {
        citationsList.push(citation);
        yield { type: 'citation', citation };
      }
    }

    // ── Layer 2 safety net ──────────────────────────────────────────────────────────────────
    const canonicalMiss = callLog.find(
      (e) => e.name === 'lookup_canonical_pyq' && e.result.ok && e.result.data?.status === 'NOT_AVAILABLE_IN_VERIFIED_CORPUS',
    );
    if (canonicalMiss) {
      const detail = String(canonicalMiss.result.data?.diagnostics || '').trim();
      const notice = detail
        ? `**${detail.replace(/\.?$/, '.')}**\n\n`
        : `**I don't have that material in Sadhya's verified question bank.**\n\n`;
      yield { type: 'chunk', chunk: notice };
    }

    yield { type: 'progress', stage: WorkflowStage.AGENT_EXECUTION, message: 'Composing the answer...' };
    yield { type: 'chunk', chunk: text };

    yield {
      type: 'done',
      data: {
        citations: citationsList,
        assets: [],
        confidenceScore: citationsList.length > 0 ? 0.85 : 0.65,
      },
    };
  }
}

export const agenticRetrievalOrchestrator = new AgenticRetrievalOrchestrator();
