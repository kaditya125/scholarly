/**
 * Shared retrieval tool layer — the single wrapper around Sadhya's real retrieval services that
 * both the MCP server (scripts/mcp/server.ts, external clients) and the agentic retrieval
 * orchestrator (src/core/workflow/services/AgenticRetrievalOrchestrator.ts, internal tool-calling
 * loop) call. Retrieval logic itself is never duplicated here — every case below is a thin
 * pass-through to an existing service method, trimmed to what a tool caller actually needs.
 *
 * Safety pattern (same as src/services/voice/voiceTools.ts): caller identity (`userId`) is
 * injected by the caller via `ToolContext`, never a tool parameter the model can set. The 8
 * per-source tools only read shared/admin corpora (PYQ corpus, NCERT curriculum, reference books,
 * official syllabi, exam analytics). Deep search's `search_sources` can also read `my_notebooks`:
 * only notebooks whose `userId` equals `ctx.userId` (the verified uid), so the model can never
 * name or reach another account's notebook.
 *
 * `lookup_canonical_pyq`'s `status` field is the load-bearing signal: both the MCP client and the
 * agentic orchestrator's safety net branch on `NOT_AVAILABLE_IN_VERIFIED_CORPUS` to decide whether
 * to state absence plainly instead of answering from general knowledge. It is passed through
 * verbatim, never summarized away.
 *
 * ── Lazy service imports ─────────────────────────────────────────────────────────────────────
 * The services below (retrieval.service.ts especially, via Pinecone/Cohere SDKs) are expensive
 * to import — profiling the standalone MCP server showed retrieval.service.ts alone costing
 * ~1.2s at module load, on top of Firebase init and the MCP SDK's own ~1.9s. The MCP server only
 * needs RETRIEVAL_TOOL_SPECS (plain data) to register tools and answer `initialize`/`tools/list`;
 * none of these services are needed until a tool is actually CALLED. Importing them lazily here,
 * inside executeRetrievalTool, means the standalone server's stdio handshake never waits on them.
 * Node caches a module after its first dynamic import, so repeat tool calls pay nothing extra.
 * Inside the live Express app (the agentic retrieval path), these modules are already loaded
 * elsewhere (the deterministic pipeline imports them too), so the dynamic import resolves
 * instantly there — this is a pure win for the standalone server with no cost anywhere else.
 */
import { z } from 'zod';

const getDetectExamId = async () => (await import('../../services/pyq/examIndex')).detectExamId;
const getCanonicalPyqRetrievalService = async () =>
  (await import('../../services/pyq/canonicalPyqRetrieval.service')).canonicalPyqRetrievalService;
const getRetrievalService = async () => (await import('../../services/rag/retrieval.service')).retrievalService;
const getReferenceBooksService = async () =>
  (await import('../../services/rag/referenceBooks.service')).referenceBooksService;
const getExamMasterService = async () => (await import('../../services/exam/examMaster.service')).examMasterService;
const getWalkSyllabusNodes = async () => (await import('../../types/exam.types')).walkSyllabusNodes;
const getPyqAnalyticsService = async () => (await import('../../services/pyq/pyqAnalytics.service')).pyqAnalyticsService;

/**
 * Fire-and-forget warm-up for all the lazily-imported services above. Calling this once, right
 * after the MCP server's stdio handshake completes (NOT before — this must never block
 * `initialize`/`tools/list`), loads every module into Node's cache in the background before the
 * client's first real `tools/call` arrives. Two different lazy dynamic imports resolved back to
 * back in the same process (e.g. examIndex.ts then retrieval.service.ts) were observed to
 * occasionally contend during module loading — a tsx/Node ESM-loader artifact, not a logic bug —
 * causing the SECOND tool's first call to stall for many seconds even though each service is
 * fast on its own. Warming all of them up together, once, up front sidesteps that entirely:
 * whichever tool a client calls first hits an already-loaded module instead of racing a cold
 * import against a sibling one. Safe to call multiple times — Node caches each module after its
 * first resolution, so a second call here is instant.
 */
export async function warmUpRetrievalServices(): Promise<void> {
  await Promise.allSettled([
    getDetectExamId(),
    getCanonicalPyqRetrievalService(),
    getRetrievalService(),
    getReferenceBooksService(),
    getExamMasterService(),
    getWalkSyllabusNodes(),
    getPyqAnalyticsService(),
  ]);
}

export interface ToolContext {
  /** Caller identity for telemetry/consistency — never read from tool args. */
  userId: string;
}

export interface RetrievalToolResult {
  ok: boolean;
  data?: any;
  error?: string;
}

const MAX_TEXT_CHARS = 800;
const MAX_LIST_ITEMS = 10;
const MAX_CANONICAL_QUESTIONS = 40;

const trimText = (s: unknown, max = MAX_TEXT_CHARS) => String(s ?? '').slice(0, max);

/** Compacts a RetrievalResult[] to what a tool caller needs — drops raw metadata/weightedScore. */
function toCompactResults(results: Array<{ text: string; source: string; score: number; metadata?: any }>) {
  return (results || []).slice(0, MAX_LIST_ITEMS).map((r) => ({
    text: trimText(r.text),
    source: r.source,
    score: r.score,
    sourceId: r.metadata?.sourceId,
    pageNumber: r.metadata?.pageNumber,
  }));
}

/**
 * Gemini-shaped function declarations (config.tools[0].functionDeclarations). Hand-written, same
 * convention as VOICE_TOOL_DECLARATIONS — no schema-to-Gemini converter exists in this repo, and
 * eight tools don't warrant introducing one.
 */
export const RETRIEVAL_TOOL_SPECS = [
  {
    name: 'resolve_exam_id',
    description:
      "Resolve a free-text exam name/query to Sadhya's canonical exam id (e.g. 'SSC_CGL', 'JEE_MAIN'), " +
      'derived from the live corpus. Call this FIRST whenever a query names or implies a specific exam ' +
      'and you need the canonical id for other tools. Returns null if no exam in the corpus matches.',
    parameters: {
      type: 'OBJECT',
      properties: {
        query: { type: 'STRING', description: 'The user query or exam name to resolve, e.g. "ssc cgl" or "JEE Main 2023".' },
      },
      required: ['query'],
    },
    zodShape: { query: z.string().describe('The user query or exam name to resolve, e.g. "ssc cgl" or "JEE Main 2023".') },
  },
  {
    name: 'lookup_canonical_pyq',
    description:
      "Look up an EXACT previous-year paper/sitting from Sadhya's verified corpus (Firestore, ordered by " +
      "question number — not semantic search). Use this whenever the request names a specific exam+year " +
      "(and optionally shift/paper), e.g. 'SSC CGL 2022 Shift 1'. The returned `status` is authoritative: " +
      "NOT_AVAILABLE_IN_VERIFIED_CORPUS means the corpus genuinely holds nothing for this request — you " +
      "MUST state that plainly and MUST NOT reconstruct or invent the paper from general knowledge. " +
      "PARTIAL_CANONICAL_PAPER means only some questions are available — say how many, never fill the rest.",
    parameters: {
      type: 'OBJECT',
      properties: {
        examId: { type: 'STRING', description: 'Canonical exam id from resolve_exam_id.' },
        year: { type: 'NUMBER', description: 'Four-digit year, if known.' },
        shift: { type: 'NUMBER', description: 'Shift number, if known.' },
        paper: { type: 'STRING', description: 'Paper name/code, if known (e.g. "Tier-I").' },
        wantsFullPaper: { type: 'BOOLEAN', description: 'True if the student wants the complete paper, not a few sample questions.' },
      },
      required: ['examId'],
    },
    zodShape: {
      examId: z.string().describe('Canonical exam id from resolve_exam_id.'),
      year: z.number().optional().describe('Four-digit year, if known.'),
      shift: z.number().optional().describe('Shift number, if known.'),
      paper: z.string().optional().describe('Paper name/code, if known (e.g. "Tier-I").'),
      wantsFullPaper: z.boolean().optional().describe('True if the student wants the complete paper, not a few sample questions.'),
    },
  },
  {
    name: 'search_pyq',
    description:
      'Semantic search over verified previous-year questions for a TOPIC or concept (not a specific ' +
      "paper — use lookup_canonical_pyq for that). Requires examId (call resolve_exam_id first if unknown) " +
      "— searching without an exam filter is refused to avoid mixing another exam's questions in.",
    parameters: {
      type: 'OBJECT',
      properties: {
        query: { type: 'STRING', description: 'Topic or concept to search for.' },
        examId: { type: 'STRING', description: 'Canonical exam id — required.' },
        subject: { type: 'STRING', description: 'Broad subject filter, e.g. "Physics", "Quantitative Aptitude".' },
        topic: { type: 'STRING', description: 'Fine-grained topic filter, if known.' },
        officialOnly: { type: 'BOOLEAN', description: 'True to restrict to questions with confirmed official provenance.' },
      },
      required: ['query', 'examId'],
    },
    zodShape: {
      query: z.string().describe('Topic or concept to search for.'),
      examId: z.string().describe('Canonical exam id — required.'),
      subject: z.string().optional().describe('Broad subject filter, e.g. "Physics", "Quantitative Aptitude".'),
      topic: z.string().optional().describe('Fine-grained topic filter, if known.'),
      officialOnly: z.boolean().optional().describe('True to restrict to questions with confirmed official provenance.'),
    },
  },
  {
    name: 'search_curriculum',
    description:
      "Semantic search over Sadhya's ingested NCERT curriculum for an explanation, definition, or " +
      'worked concept. Use for general academic questions where the corpus, not the model, should be the source.',
    parameters: {
      type: 'OBJECT',
      properties: {
        query: { type: 'STRING', description: 'The concept or question to look up.' },
      },
      required: ['query'],
    },
    zodShape: { query: z.string().describe('The concept or question to look up.') },
  },
  {
    name: 'search_reference_books',
    description:
      "Semantic search over Sadhya's ingested reference books (Lucent / S. Chand — GK, Quant, Reasoning, " +
      'English, Science) for a definition, formula, worked example, or fact.',
    parameters: {
      type: 'OBJECT',
      properties: {
        query: { type: 'STRING', description: 'What to look up.' },
        book: { type: 'STRING', description: "Restrict to one book, e.g. 'lucent_gk', 'lucent_science'." },
        examCode: { type: 'STRING', description: 'Restrict to content tagged relevant to this exam id.' },
      },
      required: ['query'],
    },
    zodShape: {
      query: z.string().describe('What to look up.'),
      book: z.string().optional().describe("Restrict to one book, e.g. 'lucent_gk', 'lucent_science'."),
      examCode: z.string().optional().describe('Restrict to content tagged relevant to this exam id.'),
    },
  },
  {
    name: 'search_official_syllabus',
    description:
      'Semantic search over the OFFICIAL exam syllabus for whether a topic is included / what the exam ' +
      'covers. Use this whenever accuracy about syllabus coverage matters — never answer from memory.',
    parameters: {
      type: 'OBJECT',
      properties: {
        examId: { type: 'STRING', description: 'Canonical exam id — required.' },
        query: { type: 'STRING', description: 'What to look up, in a few words.' },
      },
      required: ['examId', 'query'],
    },
    zodShape: {
      examId: z.string().describe('Canonical exam id — required.'),
      query: z.string().describe('What to look up, in a few words.'),
    },
  },
  {
    name: 'get_exam_syllabus',
    description:
      "Get the full OFFICIAL syllabus structure (stages/papers/sections/subjects/topics) for an exam, " +
      "as a flat list of nodes with their type and parent path. Use for questions about overall exam " +
      "structure rather than a single topic lookup (use search_official_syllabus for that).",
    parameters: {
      type: 'OBJECT',
      properties: {
        examId: { type: 'STRING', description: 'Canonical exam id — required.' },
      },
      required: ['examId'],
    },
    zodShape: { examId: z.string().describe('Canonical exam id — required.') },
  },
  {
    name: 'get_exam_pattern_analytics',
    description:
      "Get OBSERVED exam pattern data derived from the verified PYQ corpus: subject/difficulty/question-type " +
      "distribution, high-yield topics, and recent trends. Use for questions about how an exam tends to be " +
      "structured or which topics are heavily weighted — this is measured from real papers, not official.",
    parameters: {
      type: 'OBJECT',
      properties: {
        examId: { type: 'STRING', description: 'Canonical exam id — required.' },
      },
      required: ['examId'],
    },
    zodShape: { examId: z.string().describe('Canonical exam id — required.') },
  },
] as const;

/** config.tools[0].functionDeclarations shape for @google/genai. */
export const GEMINI_RETRIEVAL_TOOL_DECLARATIONS = RETRIEVAL_TOOL_SPECS.map((s) => ({
  name: s.name,
  description: s.description,
  parameters: s.parameters,
}));

// ── Deep search ─────────────────────────────────────────────────────────────────────────────
/**
 * Deep search's entry point into the same services: ONE query, several sources, searched in
 * parallel. Every source embeds the identical query text and the embedding provider coalesces
 * identical texts (single-flight + cache), so one call costs ONE embedding however many sources
 * it covers. That is why this exists beside the per-source tools: Vertex embeddings are capped at
 * roughly 10/min project-wide and shared with live chat, and a model calling four search tools
 * with four phrasings would spend four. Web search (Tavily) embeds nothing.
 *
 * Deep-search only — not registered on the MCP server, which keeps its eight per-source tools.
 */
export const DEEP_SEARCH_SOURCES = ['ncert', 'pyq', 'reference_books', 'syllabus', 'my_notebooks', 'web'] as const;
export type DeepSearchSource = typeof DEEP_SEARCH_SOURCES[number];

const SEARCH_SOURCES_DECLARATION = {
  name: 'search_sources',
  description:
    'Search several sources at once with ONE query (they are searched in parallel). Sources: ' +
    'ncert = NCERT textbooks (concepts, explanations, worked examples); ' +
    'pyq = verified previous-year questions for a topic (needs examId); ' +
    'reference_books = Lucent / S. Chand books (GK, Quant, Reasoning, English, Science facts and formulas); ' +
    'syllabus = the official exam syllabus (needs examId); ' +
    "my_notebooks = the student's own uploaded notes and documents; " +
    'web = live web search for anything recent or time-sensitive (notifications, dates, cut-offs, news) ' +
    'or not covered by the others. Pick every source the question needs in a single call rather than ' +
    'calling this repeatedly with different phrasings.',
  parameters: {
    type: 'OBJECT',
    properties: {
      query: { type: 'STRING', description: 'One well-phrased search query covering the question.' },
      sources: {
        type: 'ARRAY',
        items: { type: 'STRING', enum: [...DEEP_SEARCH_SOURCES] },
        description: 'Which sources to search.',
      },
      examId: { type: 'STRING', description: 'Canonical exam id from resolve_exam_id — required for pyq and syllabus.' },
    },
    required: ['query', 'sources'],
  },
};

/** The tool set Deep search offers the model: search_sources plus the non-search lookups. */
export const GEMINI_DEEP_SEARCH_TOOL_DECLARATIONS = [
  SEARCH_SOURCES_DECLARATION,
  ...GEMINI_RETRIEVAL_TOOL_DECLARATIONS.filter((d) =>
    ['resolve_exam_id', 'lookup_canonical_pyq', 'get_exam_syllabus', 'get_exam_pattern_analytics'].includes(d.name)),
];

const DEEP_SEARCH_TOP_K = 5;

async function searchOneSource(
  source: DeepSearchSource,
  query: string,
  examId: string | undefined,
  ctx: ToolContext,
): Promise<Array<Record<string, unknown>>> {
  switch (source) {
    case 'ncert': {
      const retrievalService = await getRetrievalService();
      return toCompactResults(await retrievalService.retrieveCurriculumContext(query, DEEP_SEARCH_TOP_K));
    }
    case 'pyq': {
      if (!examId) throw new Error('pyq needs examId — call resolve_exam_id first');
      const retrievalService = await getRetrievalService();
      return toCompactResults(await retrievalService.retrievePyqContext(query, { examId, topK: DEEP_SEARCH_TOP_K }));
    }
    case 'reference_books': {
      const referenceBooksService = await getReferenceBooksService();
      return toCompactResults(await referenceBooksService.retrieveReferenceContext(query, { topK: DEEP_SEARCH_TOP_K }));
    }
    case 'syllabus': {
      if (!examId) throw new Error('syllabus needs examId — call resolve_exam_id first');
      const retrievalService = await getRetrievalService();
      return toCompactResults(await retrievalService.retrieveOfficialSyllabusContext(examId, query, DEEP_SEARCH_TOP_K));
    }
    case 'my_notebooks': {
      // Only notebooks this user OWNS, selected by the verified uid from ToolContext — never by an
      // id the model supplies, so there is no way to steer this at someone else's notebook.
      if (!ctx.userId || ctx.userId.startsWith('mcp-')) return [];
      const { db } = await import('../../config/firebase');
      const snap = await db.collection('notebooks').where('userId', '==', ctx.userId).limit(5).get();
      if (snap.empty) return [];
      const retrievalService = await getRetrievalService();
      const perNotebook = await Promise.all(snap.docs.map(async (doc) => {
        const title = String(doc.data().title || doc.data().name || 'My notebook');
        const results = await retrievalService.retrieveContext(query, doc.id, undefined, 3).catch(() => []);
        return toCompactResults(results).map((r) => ({ ...r, source: `${title} › ${r.source}` }));
      }));
      return perNotebook.flat().sort((a, b) => Number(b.score || 0) - Number(a.score || 0)).slice(0, DEEP_SEARCH_TOP_K);
    }
    case 'web': {
      // Official sites first, flagged — see SearchService.searchOfficialFirst.
      const { searchService } = await import('../../services/rag/search.service');
      return (await searchService.searchOfficialFirst(query)).map((w) => ({
        text: trimText(w.content),
        source: w.url,
        title: w.title,
        url: w.url,
        score: w.score,
        official: w.official,
        ...(w.published_date ? { publishedDate: w.published_date } : {}),
      }));
    }
  }
}

/**
 * Executes one named retrieval tool against real Firestore/Pinecone data.
 *
 * Always resolves — never throws — so a tool-calling loop (agentic or MCP) always gets a
 * structured result it can reason about or relay, rather than an unhandled rejection stalling
 * the turn.
 */
export async function executeRetrievalTool(
  name: string,
  args: Record<string, unknown>,
  ctx: ToolContext,
): Promise<RetrievalToolResult> {
  try {
    switch (name) {
      case 'resolve_exam_id': {
        const query = trimText(args?.query, 300);
        if (!query) return { ok: false, error: 'no query supplied' };
        const detectExamId = await getDetectExamId();
        const examId = await detectExamId(query);
        return { ok: true, data: { examId } };
      }

      case 'lookup_canonical_pyq': {
        const examId = String(args?.examId ?? '').trim();
        if (!examId) return { ok: false, error: 'examId is required' };
        const canonicalPyqRetrievalService = await getCanonicalPyqRetrievalService();
        const result = await canonicalPyqRetrievalService.retrieve({
          examId,
          year: typeof args?.year === 'number' ? args.year : null,
          shift: typeof args?.shift === 'number' ? args.shift : null,
          paper: typeof args?.paper === 'string' ? args.paper : null,
          wantsFullPaper: Boolean(args?.wantsFullPaper),
        });
        const questions = result.questions.slice(0, MAX_CANONICAL_QUESTIONS).map((q: any) => ({
          questionId: q.questionId,
          questionNumber: q.questionNumber,
          questionText: q.questionText,
          options: q.options,
          correctAnswer: q.correctAnswer,
          subject: q.subject,
          topic: q.topic,
          difficulty: q.difficulty,
        }));
        return {
          ok: true,
          data: {
            status: result.status,
            retrievedCount: result.retrievedCount,
            expectedCount: result.expectedCount,
            missingCount: result.missingCount,
            incompleteCount: result.incompleteCount,
            diagnostics: result.diagnostics,
            papers: result.papers,
            questions,
            truncated: result.questions.length > MAX_CANONICAL_QUESTIONS,
          },
        };
      }

      case 'search_pyq': {
        const query = trimText(args?.query, 300);
        const examId = String(args?.examId ?? '').trim();
        if (!query) return { ok: false, error: 'no query supplied' };
        if (!examId) return { ok: false, error: 'examId is required — call resolve_exam_id first' };
        const retrievalService = await getRetrievalService();
        const results = await retrievalService.retrievePyqContext(query, {
          examId,
          subject: typeof args?.subject === 'string' ? args.subject : undefined,
          topic: typeof args?.topic === 'string' ? args.topic : undefined,
          officialOnly: Boolean(args?.officialOnly),
          topK: MAX_LIST_ITEMS,
        });
        return { ok: true, data: { results: toCompactResults(results) } };
      }

      case 'search_curriculum': {
        const query = trimText(args?.query, 300);
        if (!query) return { ok: false, error: 'no query supplied' };
        const retrievalService = await getRetrievalService();
        const results = await retrievalService.retrieveCurriculumContext(query, MAX_LIST_ITEMS);
        return { ok: true, data: { results: toCompactResults(results) } };
      }

      case 'search_reference_books': {
        const query = trimText(args?.query, 300);
        if (!query) return { ok: false, error: 'no query supplied' };
        const referenceBooksService = await getReferenceBooksService();
        const results = await referenceBooksService.retrieveReferenceContext(query, {
          topK: MAX_LIST_ITEMS,
          book: typeof args?.book === 'string' ? args.book : undefined,
          examCode: typeof args?.examCode === 'string' ? args.examCode : undefined,
        });
        return { ok: true, data: { results: toCompactResults(results) } };
      }

      case 'search_official_syllabus': {
        const examId = String(args?.examId ?? '').trim();
        const query = trimText(args?.query, 300);
        if (!examId) return { ok: false, error: 'examId is required' };
        if (!query) return { ok: false, error: 'no query supplied' };
        const retrievalService = await getRetrievalService();
        const results = await retrievalService.retrieveOfficialSyllabusContext(examId, query, MAX_LIST_ITEMS);
        return { ok: true, data: { results: toCompactResults(results) } };
      }

      case 'get_exam_syllabus': {
        const examId = String(args?.examId ?? '').trim();
        if (!examId) return { ok: false, error: 'examId is required' };
        const examMasterService = await getExamMasterService();
        const syllabus = await examMasterService.getCurrentSyllabus(examId);
        if (!syllabus) return { ok: true, data: { available: false } };
        const walkSyllabusNodes = await getWalkSyllabusNodes();
        const nodes: Array<{ nodeId: string; type: string; name: string; order: number; parentPath: string[] }> = [];
        walkSyllabusNodes(syllabus.nodes, (n, parentPath) => {
          nodes.push({ nodeId: n.nodeId, type: n.type, name: n.name, order: n.order, parentPath });
        });
        return {
          ok: true,
          data: {
            available: true,
            syllabusId: syllabus.syllabusId,
            examId: syllabus.examId,
            version: syllabus.version,
            authority: syllabus.authority,
            status: syllabus.status,
            nodeCount: nodes.length,
            nodes,
          },
        };
      }

      case 'get_exam_pattern_analytics': {
        const examId = String(args?.examId ?? '').trim();
        if (!examId) return { ok: false, error: 'examId is required' };
        const pyqAnalyticsService = await getPyqAnalyticsService();
        const profile = await pyqAnalyticsService.getExamPatternProfile(examId);
        return {
          ok: true,
          data: { ...profile, highYieldTopics: (profile.highYieldTopics || []).slice(0, 15) },
        };
      }

      case 'search_sources': {
        const query = trimText(args?.query, 300);
        if (!query) return { ok: false, error: 'no query supplied' };
        const requested = Array.isArray(args?.sources) ? (args.sources as unknown[]).map(String) : [];
        const sources = DEEP_SEARCH_SOURCES.filter((s) => requested.includes(s));
        if (sources.length === 0) {
          return { ok: false, error: `sources must include at least one of: ${DEEP_SEARCH_SOURCES.join(', ')}` };
        }
        const examId = String(args?.examId ?? '').trim() || undefined;
        const errors: Record<string, string> = {};
        const bySource = await Promise.all(sources.map(async (source) => {
          try {
            return (await searchOneSource(source, query, examId, ctx)).map((r) => ({ from: source, ...r }));
          } catch (e: any) {
            errors[source] = String(e?.message || e).slice(0, 160);
            return [];
          }
        }));
        return {
          ok: true,
          data: { query, results: bySource.flat(), ...(Object.keys(errors).length ? { errors } : {}) },
        };
      }

      default:
        // An undeclared name means the caller/model invented it; refuse rather than dispatch.
        return { ok: false, error: `unknown tool: ${name}` };
    }
  } catch (e: any) {
    return { ok: false, error: `lookup failed: ${String(e?.message || e).slice(0, 200)}` };
  }
}
