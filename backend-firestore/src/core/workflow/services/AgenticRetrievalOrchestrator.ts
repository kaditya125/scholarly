/**
 * AgenticRetrievalOrchestrator — powers the chat's "Deep search" option. Instead of the fixed
 * retrieval sequence of RetrievalOrchestrator, the model decides what to search — NCERT, PYQs,
 * reference books, the official syllabus, the student's own notebooks and the live web (tools in
 * src/core/tools/retrievalTools.ts) — in a bounded, streaming loop (GeminiProvider.streamWithTools).
 * Only reached from WorkflowEngine's AGENTIC branch, gated by BOTH featureFlags.agenticRetrieval
 * (server kill switch) AND the per-request opt-in the client sends when Deep search is selected.
 *
 * What the student sees: each search as it starts ("Searching NCERT and the web for …"), its
 * result count as it finishes, citations as they arrive, then the streamed answer — the same
 * event shapes the deterministic pipeline emits, so the chat UI needs nothing special.
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
 *     reaches for it mid-turn. Before the model's first word of answer, the call log is scanned:
 *     if that tool reported `NOT_AVAILABLE_IN_VERIFIED_CORPUS`, the SAME deterministic notice the
 *     main pipeline emits (WorkflowEngine.ts's CANONICAL_NOT_FOUND handling) is emitted first —
 *     the backend states absence, not the model, because phrasing of absence drifted across runs
 *     when left to prompt-following alone.
 */
import { AgentContext } from '../../agents/IAgent';
import { WorkflowEvent, WorkflowRequest, WorkflowStage } from '../types';
import { retrievalOrchestrator, plainDiagnostics } from './RetrievalOrchestrator';
import { queryPlanningService } from './QueryPlanningService';
import { parsePyqQuery } from '../../../services/pyq/pyqQueryParser';
import { buildSadhyaSystemPrompt } from '../../../config/prompts';
import { GeminiProvider } from '../../../services/ai/gemini.provider';
import { GEMINI_DEEP_SEARCH_TOOL_DECLARATIONS, executeRetrievalTool } from '../../tools/retrievalTools';
import { ChatMessage } from '../../../types';

/** Tool-calling turns before the answer is forced; parallel calls allowed per turn. */
const MAX_TOOL_TURNS = 3;
const MAX_CALLS_PER_TURN = 3;

interface ToolCallLogEntry {
  name: string;
  args: Record<string, unknown>;
  result: { ok: boolean; data?: any; error?: string };
}

const SOURCE_LABELS: Record<string, string> = {
  ncert: 'NCERT',
  pyq: 'PYQs',
  reference_books: 'reference books',
  syllabus: 'the syllabus',
  my_notebooks: 'your notebooks',
  web: 'the web',
};

const RESULT_NOUNS: Record<string, [string, string]> = {
  ncert: ['NCERT passage', 'NCERT passages'],
  pyq: ['PYQ', 'PYQs'],
  reference_books: ['reference-book passage', 'reference-book passages'],
  syllabus: ['syllabus entry', 'syllabus entries'],
  my_notebooks: ['passage from your notebooks', 'passages from your notebooks'],
  web: ['web result', 'web results'],
};

const prettyExam = (examId: unknown) => String(examId || '').replace(/_/g, ' ').trim();

function listPhrase(items: string[]): string {
  if (items.length <= 1) return items.join('');
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
}

/** The live activity line while a tool runs — what the student reads in the "Read files" row. */
function describeCall(name: string, args: Record<string, unknown>): string {
  switch (name) {
    case 'search_sources': {
      const sources = (Array.isArray(args.sources) ? args.sources : []).map((s) => SOURCE_LABELS[String(s)] || String(s));
      const query = String(args.query || '').slice(0, 70);
      return `Searching ${listPhrase(sources) || 'sources'} for “${query}”`;
    }
    case 'resolve_exam_id': return 'Identifying the exam…';
    case 'lookup_canonical_pyq':
      return `Looking up the ${prettyExam(args.examId)}${args.year ? ` ${args.year}` : ''} paper…`;
    case 'get_exam_pattern_analytics': return `Analysing ${prettyExam(args.examId)} question patterns…`;
    case 'get_exam_syllabus': return `Reading the ${prettyExam(args.examId)} official syllabus…`;
    default: return `Running ${name}…`;
  }
}

/** One finished-step line for the expandable steps list. */
function describeResult(entry: ToolCallLogEntry, ms: number): string {
  const secs = `(${(ms / 1000).toFixed(1)} s)`;
  const { name, args, result } = entry;
  if (!result.ok) return `${describeCall(name, args).replace(/…$/, '')} failed: ${result.error || 'unknown error'} ${secs}`;
  const d = result.data || {};
  switch (name) {
    case 'search_sources': {
      const counts = new Map<string, number>();
      for (const r of d.results || []) counts.set(r.from, (counts.get(r.from) || 0) + 1);
      const officialWeb = (d.results || []).filter((r: any) => r.from === 'web' && r.official).length;
      const found = [...counts.entries()].map(([s, n]) => {
        const phrase = `${n} ${RESULT_NOUNS[s]?.[n === 1 ? 0 : 1] || s}`;
        return s === 'web' && officialWeb > 0 ? `${phrase} (${officialWeb} from official sites)` : phrase;
      });
      const empty = (Array.isArray(args.sources) ? args.sources : [])
        .map(String).filter((s) => !counts.has(s) && !d.errors?.[s]).map((s) => SOURCE_LABELS[s] || s);
      const failed = Object.keys(d.errors || {}).map((s) => `${SOURCE_LABELS[s] || s} unavailable`);
      const parts = [
        found.length ? `Found ${listPhrase(found)}` : '',
        empty.length ? `nothing in ${listPhrase(empty)}` : '',
        ...failed,
      ].filter(Boolean);
      return `${parts.join('; ') || 'No results'} ${secs}`;
    }
    case 'resolve_exam_id':
      return `${d.examId ? `Exam: ${prettyExam(d.examId)}` : 'No specific exam named'} ${secs}`;
    case 'lookup_canonical_pyq':
      return `${d.status === 'NOT_AVAILABLE_IN_VERIFIED_CORPUS'
        ? 'Not in the verified question bank'
        : `${d.retrievedCount ?? (d.questions || []).length} verified questions retrieved`} ${secs}`;
    case 'get_exam_pattern_analytics':
      return `Analysed ${Number(d.totalQuestionsAnalyzed || 0).toLocaleString('en-IN')} ${prettyExam(d.examId || args.examId)} PYQs ${secs}`;
    case 'get_exam_syllabus':
      return `${d.available ? `Official syllabus: ${d.nodeCount} entries` : 'No official syllabus on file'} ${secs}`;
    default:
      return `${name} done ${secs}`;
  }
}

function toCitations(entry: ToolCallLogEntry): any[] {
  const { name, args, result } = entry;
  if (!result.ok || !result.data) return [];
  const d = result.data;

  if (name === 'lookup_canonical_pyq') {
    const status = d.status;
    if (status !== 'CANONICAL_RETRIEVED' && status !== 'PARTIAL_CANONICAL_PAPER') return [];
    const paper = d.papers?.[0];
    const header = paper
      ? [paper.examId, paper.year, paper.session, paper.shift, paper.paper].filter(Boolean).join(' · ')
      : (d.examId || 'Verified corpus');
    return (d.questions || []).slice(0, 5).map((q: any) => ({
      source: header,
      text: String(q.questionText ?? '').slice(0, 300),
      score: 1,
      authorityScore: 1.5,
      selectionReasoning: 'Canonical record retrieved from Sadhya\'s verified corpus.',
      questionId: q.questionId,
      contentOrigin: 'CANONICAL_PYQ',
    }));
  }

  if (name === 'search_sources' && Array.isArray(d.results)) {
    return d.results.map((r: any) => ({
      source: r.url || r.source,
      text: r.text,
      score: r.score,
      pageNumber: r.pageNumber,
      authorityScore: r.from === 'web' ? (r.official ? 1.3 : 0.9) : 1.1,
      selectionReasoning: `Deep search · ${r.official ? 'official site' : SOURCE_LABELS[r.from] || r.from}${r.title ? ` · ${r.title}` : ''}`,
      sourceId: r.sourceId,
    }));
  }

  if (name === 'get_exam_pattern_analytics') {
    const topics = (d.highYieldTopics || []).slice(0, 5)
      .map((t: any) => `${t.topic} (${t.percentageWeight}%)`).join(', ');
    return [{
      source: `${prettyExam(d.examId || args.examId)} pattern analysis — ${Number(d.totalQuestionsAnalyzed || 0).toLocaleString('en-IN')} PYQs`,
      text: topics ? `High-yield topics: ${topics}` : 'Exam pattern analysis',
      score: 1,
      authorityScore: 1.2,
      selectionReasoning: 'Measured from Sadhya\'s verified previous-year question corpus.',
    }];
  }

  if (name === 'get_exam_syllabus' && d.available) {
    return [{
      source: `${prettyExam(d.examId || args.examId)} official syllabus${d.version ? ` (${d.version})` : ''}`,
      text: `${d.nodeCount} syllabus entries${d.authority ? ` · ${d.authority}` : ''}`,
      score: 1,
      authorityScore: 1.4,
      selectionReasoning: 'Official syllabus on file.',
    }];
  }

  return [];
}

function buildDeepSearchSystemPrompt(agentContext: AgentContext, req: WorkflowRequest): string {
  // The full persona/identity/exam-knowledge prompt, without groundingState/retrievedContext
  // (neither is known before the loop runs), plus Deep search's own rules on top.
  const base = buildSadhyaSystemPrompt({
    mode: String(req.mode || 'TEACHER'),
    viewerRole: req.productRole === 'teacher' ? 'teacher' : 'student',
    studentContext: agentContext.studentContext,
    teacherContext: agentContext.teacherContext,
    hasNotebookContext: false,
  });
  const today = new Date().toISOString().slice(0, 10);

  return `${base}

## Deep search mode
Today's date is ${today}. You answer by searching first. Tools: search_sources, resolve_exam_id,
lookup_canonical_pyq, get_exam_pattern_analytics, get_exam_syllabus.

How to search:
- Search before answering — except greetings, thanks and questions about Sadhya itself, which you
  answer directly. Start with ONE search_sources call that covers every source the
  question needs, with one well-phrased query. Search again (differently phrased, or other
  sources) only if the first results are thin. At most three searches in total.
- Choose sources by need: ncert for concepts and explanations; pyq for how a topic is asked
  (needs examId); syllabus for what an exam officially covers (needs examId); reference_books for
  GK, quant, reasoning and English facts and formulas; my_notebooks when the student refers to
  their own notes or uploads; web for anything recent or time-sensitive (notifications, dates,
  vacancies, cut-offs, news, current affairs) or not covered elsewhere.
- If the question names or implies an exam and you need its id, call resolve_exam_id in the same
  step as your first search. Independent tools can run together in one step.
- For which topics matter most in an exam, use get_exam_pattern_analytics. For how a topic is asked
  in an exam, pair it with a search_sources call on pyq (and reference_books) in the same step, so
  the answer shows real questions, not just weightage.

How to answer:
- Start directly with the answer. No greeting, no self-introduction, and no remark about the
  question itself ("That's a great / very relevant question").
- Never show internal codes (NOT_AVAILABLE_IN_VERIFIED_CORPUS, SSC_CGL); write them in plain words.
- Ground every factual claim in what the tools returned and name the source in plain words where
  you use it (e.g. "the NCERT Class 11 Physics chapter on Laws of Motion", "SSC's notice on
  ssc.gov.in"). Web results marked official: true come from government sites (ssc.gov.in,
  upsc.gov.in, …) — they are authoritative: lead with them, and say when a detail comes only from a
  coaching or news site. Give dates exactly as the source states them — never guess a date.
- If the results don't answer the question, say so plainly, then give your best general
  explanation clearly marked as not coming from Sadhya's sources.
- End with one short line offering the most useful next step.

**Non-negotiable rule**: if you call lookup_canonical_pyq and its status comes back
NOT_AVAILABLE_IN_VERIFIED_CORPUS, you MUST state plainly that Sadhya's verified corpus does not
have that material. You MUST NOT reproduce, reconstruct, or approximate the paper from your own
training knowledge, and MUST NOT present anything you write as a previous-year question. If status
is PARTIAL_CANONICAL_PAPER, say plainly how many records were found and do not invent the rest.
Any question you generate yourself must be labeled as practice, never as a real PYQ.`;
}

function canonicalNotice(callLog: ToolCallLogEntry[]): string | null {
  const miss = callLog.find(
    (e) => e.name === 'lookup_canonical_pyq' && e.result.ok && e.result.data?.status === 'NOT_AVAILABLE_IN_VERIFIED_CORPUS',
  );
  if (!miss) return null;
  const detail = String(plainDiagnostics(miss.result.data?.diagnostics) || '').trim();
  return detail
    ? `**${detail.replace(/\.?$/, '.')}**\n\n`
    : `**I don't have that material in Sadhya's verified question bank.**\n\n`;
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
    for await (const chunk of provider.generateStreamResponse(history, systemPrompt, {
      traceId: req.traceId, model: req.model, userId: req.userId,
    })) {
      yield { type: 'chunk', chunk };
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

    // Greetings and "what can you do" need no search; forcing one cost ~8 s of pointless lookups.
    const conversational = queryPlanningService.plan(req.query, String(req.mode || 'TEACHER')).isConversational;
    yield {
      type: 'progress', stage: WorkflowStage.INTENT_DETECTION,
      message: conversational ? 'Thinking…' : 'Planning the search…',
    };

    const systemPrompt = buildDeepSearchSystemPrompt(agentContext, req);
    const callLog: ToolCallLogEntry[] = [];
    const citationsList: any[] = [];
    const provider = new GeminiProvider();
    const history: ChatMessage[] = [...req.history, { role: 'user', content: req.query, timestamp: Date.now() } as ChatMessage];
    let answering = false;

    for await (const ev of provider.streamWithTools(
      history,
      systemPrompt,
      GEMINI_DEEP_SEARCH_TOOL_DECLARATIONS as any,
      (name, args) => executeRetrievalTool(name, args, { userId: req.userId }),
      {
        traceId: req.traceId, model: req.model, userId: req.userId,
        maxIterations: MAX_TOOL_TURNS, maxCallsPerTurn: MAX_CALLS_PER_TURN, requireFirstCall: !conversational,
      },
    )) {
      if (ev.type === 'tool_call') {
        yield { type: 'progress', stage: WorkflowStage.RAG_RETRIEVAL, message: describeCall(ev.name, ev.args) };
      } else if (ev.type === 'tool_result') {
        const entry: ToolCallLogEntry = { name: ev.name, args: ev.args, result: ev.output };
        callLog.push(entry);
        yield { type: 'progress', stage: WorkflowStage.RAG_RETRIEVAL, detail: true, message: describeResult(entry, ev.ms) };
        for (const citation of toCitations(entry)) {
          citationsList.push(citation);
          yield { type: 'citation', citation };
        }
      } else if (ev.type === 'text') {
        if (!answering) {
          answering = true;
          // Layer 2: every tool result is in by the time the answer turn starts, so the
          // backend-stated absence notice lands before the model's first word.
          const notice = canonicalNotice(callLog);
          if (notice) yield { type: 'chunk', chunk: notice };
          yield { type: 'progress', stage: WorkflowStage.AGENT_EXECUTION, message: 'Writing the answer…' };
        }
        yield { type: 'chunk', chunk: ev.text };
      }
    }

    if (!answering) {
      const notice = canonicalNotice(callLog);
      yield {
        type: 'chunk',
        chunk: notice || "I searched but couldn't put an answer together from the results. Try rephrasing the question.",
      };
    }

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
