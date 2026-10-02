import { z } from 'zod';
import { featureFlags } from '../../../config/featureFlags';
import { Provenance } from '../../runtime/agent.types';
import { ToolDefinition, ToolRegistry } from '../ToolRegistry';
import { ToolError } from '../toolErrors';
import { ChapterLike, RankedChapters, parseClassNumber, parseSubject, rankChapters, scoreBook, titleCase } from './curriculumMatch';

/**
 * Curriculum tools (Phase 2): resolve a chapter a student names in words, then read what Sadhya
 * already holds about it — passages, knowledge-graph neighbours and generated study assets.
 *
 * Everything here goes through services that already exist:
 *   - `bookLibraryService` for the catalog. Its `isCurriculumNotebook` check (id prefixed `ncert-`
 *     AND owned by `ncert-curriculum`) is the hard boundary that makes these tools safe to run
 *     without a per-user ownership check: they can only ever read the shared, admin-ingested
 *     corpus, never a student's private notebook, whatever notebookId the plan supplies.
 *   - `notebookRepository` for assets and the chapter's graph slice.
 *   - `retrievalService` / `searchService` for passages and the web.
 *
 * Nothing is re-implemented, and no service is modified.
 */

const CURRICULUM: Provenance = 'VERIFIED_CORPUS';

// Lazily required so importing the registry never pulls Firestore/Qdrant/embedding SDKs into a
// process that does not run agents — the same rule the retrieval adapter follows.
const bookLibrary = () => require('../../../services/bookLibrary.service').bookLibraryService;
const notebooks = () => require('../../../repositories/notebook.repository').notebookRepository;
const retrieval = () => require('../../../services/rag/retrieval.service').retrievalService;

const MAX_HEADINGS = 20;
const MAX_ASSET_CHARS = 20_000;

const chapterMatchSchema = z.object({
  sourceId: z.string(),
  chapterName: z.string(),
  chapterTitle: z.string(),
  score: z.number(),
  matchedOn: z.array(z.string()),
});

/** Words a running header can be that are not a chapter title (the book's own name on even pages). */
const NOT_A_TITLE = /^(biology|physics|chemistry|mathematics|science|unit\s+\d+|chapter\s+\d+|part\s+[ivx\d]+)$/i;

/**
 * A chapter's name and section headings read from its own text, for chapters ingestion left
 * unnamed (NCERT Class 11 Biology Ch. 4, 6, 8 and 12 have neither). NCERT prints the chapter title
 * as the running header of its odd pages ("RESPIRATION IN PLANTS 153"), so the most frequent such
 * header is the title; section headings are the lines numbered with the chapter's own number
 * ("8.2 CELL THEORY"). Nothing is guessed: no header, no name.
 */
export function metadataFromText(pages: Array<{ text: string }>, chapterNumber?: number): { chapterName?: string; headings: string[] } {
  const counts = new Map<string, number>();
  const headings: string[] = [];
  const seen = new Set<string>();
  for (const page of pages) {
    const lines = String(page.text ?? '').split(/\n/).map((l) => l.replace(/\t/g, ' ').trim()).filter(Boolean);
    const header = lines[0]?.match(/^([A-Z][A-Z0-9 ,:’'&()\-–]{3,80}?)\s+\d{1,3}(?:\s+\d{1,3})?$/);
    if (header && !NOT_A_TITLE.test(header[1].trim())) counts.set(header[1].trim(), (counts.get(header[1].trim()) ?? 0) + 1);
    for (const line of lines) {
      const h = line.match(/^(\d{1,2})\.(\d{1,2})(\.\d{1,2})?\s+([A-Z][^\n]{2,80})$/);
      if (!h || (chapterNumber && Number(h[1]) !== chapterNumber)) continue;
      const heading = `${h[1]}.${h[2]}${h[3] ?? ''} ${h[4].trim()}`;
      const key = heading.toLowerCase();
      if (!seen.has(key)) {
        seen.add(key);
        headings.push(heading);
      }
    }
  }
  const [best] = [...counts.entries()].sort((a, b) => b[1] - a[1]);
  return { ...(best && (best[1] >= 2 || counts.size === 1) ? { chapterName: best[0] } : {}), headings: headings.slice(0, 40) };
}

/** Reads the unnamed chapters of a book (a few at a time, cached per chapter) and fills in what they say. */
async function recoverUnnamed(notebookId: string, chapters: ChapterLike[]): Promise<{ chapters: ChapterLike[]; recovered: number }> {
  const { loadChapterPages } = require('./chapterText');
  const unnamed = chapters.filter((c) => !c.chapterName && !(c.headings ?? []).length).slice(0, 8);
  if (unnamed.length === 0) return { chapters, recovered: 0 };
  const byId = new Map<string, ChapterLike>();
  let next = 0;
  const worker = async () => {
    while (next < unnamed.length) {
      const c = unnamed[next++];
      const pages = await loadChapterPages(notebookId, c.sourceId).then((r: any) => r.pages).catch(() => null);
      if (!pages) continue;
      const number = Number(String(c.title).match(/chapter\s+(\d{1,2})/i)?.[1]) || undefined;
      const meta = metadataFromText(pages, number);
      if (meta.chapterName || meta.headings.length) byId.set(c.sourceId, { ...c, ...(meta.chapterName ? { chapterName: titleCase(meta.chapterName) } : {}), headings: meta.headings });
    }
  };
  await Promise.all(Array.from({ length: Math.min(4, unnamed.length) }, worker));
  return { chapters: chapters.map((c) => byId.get(c.sourceId) ?? c), recovered: byId.size };
}

/** Loads the catalog chapters for a book, in the shape the matcher expects. */
async function chaptersOf(notebookId: string): Promise<{ book: any; chapters: ChapterLike[] } | null> {
  const book = await bookLibrary().getBookDetail(notebookId);
  if (!book) return null;
  return { book, chapters: book.chapters as ChapterLike[] };
}

export function registerCurriculumTools(registry: ToolRegistry): ToolRegistry {
  const resolveChapter: ToolDefinition<any, any> = {
    name: 'resolve_curriculum_chapter',
    description:
      'Finds which NCERT chapter a student means from a phrase like "Laws of Motion, Class 11 Physics". ' +
      'Returns the book, the chapter and a confidence, or asks for clarification when the match is ambiguous. ' +
      'Call this before any tool that needs a notebookId or sourceId.',
    category: 'knowledge',
    inputSchema: z.object({
      query: z.string().min(2).describe('What the student called the chapter, e.g. "Laws of Motion Class 11 Physics".'),
      grade: z.number().int().min(1).max(12).optional().describe('Class number, if known separately from the query.'),
      subject: z.string().optional().describe('Subject, if known separately from the query.'),
    }),
    outputSchema: z
      .object({
        resolved: z.boolean(),
        needsClarification: z.boolean(),
        reason: z.string().optional(),
        notebookId: z.string().optional(),
        bookTitle: z.string().optional(),
        subject: z.string().optional(),
        className: z.string().optional(),
        sourceId: z.string().optional(),
        chapterName: z.string().optional(),
        chapterTitle: z.string().optional(),
        confidence: z.number().optional(),
        headings: z.array(z.string()).optional(),
        /** Terms and definitions ingestion extracted from the chapter (to be verified, not trusted). */
        definitions: z.array(z.object({ term: z.string(), definition: z.string() })).optional(),
        alternatives: z.array(chapterMatchSchema),
        candidateBooks: z.array(z.object({ notebookId: z.string(), title: z.string() })).optional(),
      })
      .passthrough(),
    permissions: ['read:shared-corpus'],
    costClass: 'free',
    // Usually well under a second; reading unnamed chapters' text (first time, uncached) takes longer.
    timeoutMs: 75_000,
    retry: { maxAttempts: 2, baseBackoffMs: 400 },
    idempotent: true,
    requiresApproval: false,
    provenance: CURRICULUM,
    async execute(input) {
      const grade = input.grade ?? parseClassNumber(input.query);
      const subject = input.subject ? parseSubject(input.subject) ?? input.subject.toLowerCase() : parseSubject(input.query);

      const books = await bookLibrary().listBooks();
      const scored = books
        .map((b: any) => ({ book: b, score: scoreBook(b, grade, subject) }))
        .filter((x: any) => x.score > 0)
        .sort((a: any, b: any) => b.score - a.score);

      if (scored.length === 0) {
        return {
          data: {
            resolved: false,
            needsClarification: true,
            reason: grade || subject ? 'no_such_book' : 'need_class_and_subject',
            alternatives: [],
            candidateBooks: books.slice(0, 5).map((b: any) => ({ notebookId: b.notebookId, title: b.title })),
          },
          provenance: CURRICULUM,
        };
      }

      // Several books can share a class+subject (e.g. multi-part sets); rank chapters across the
      // best-scoring ones rather than assuming the first is right.
      const topScore = scored[0].score;
      const contenders = scored.filter((x: any) => x.score === topScore).slice(0, 3);
      const attempts: Array<{ book: any; ranked: RankedChapters }> = [];
      for (const { book } of contenders) {
        const loaded = await chaptersOf(book.notebookId);
        if (!loaded) continue;
        attempts.push({ book: { ...book, ...loaded.book }, ranked: rankChapters(input.query, loaded.chapters) });
      }
      attempts.sort((a, b) => (b.ranked.best?.score ?? 0) - (a.ranked.best?.score ?? 0));

      // No confident match, and the leading book has chapters ingestion left unnamed: read those
      // chapters' own text for their names and headings, and rank again.
      if (attempts[0] && !attempts[0].ranked.confident) {
        const lead = attempts[0];
        const { chapters, recovered } = await recoverUnnamed(lead.book.notebookId, lead.book.chapters as ChapterLike[]);
        if (recovered > 0) {
          const reranked = rankChapters(input.query, chapters);
          if (reranked.confident || (reranked.best?.score ?? 0) > (lead.ranked.best?.score ?? 0)) {
            attempts[0] = { book: { ...lead.book, chapters }, ranked: reranked };
          }
        }
      }

      const winner = attempts[0];
      const best = winner?.ranked.best;
      if (!winner || !best) {
        return {
          data: {
            resolved: false,
            needsClarification: true,
            reason: winner ? winner.ranked.reason ?? 'no_match' : 'no_match',
            notebookId: winner ? winner.book.notebookId : undefined,
            bookTitle: winner ? winner.book.title : undefined,
            alternatives: winner ? winner.ranked.alternatives : [],
          },
          provenance: CURRICULUM,
        };
      }
      const winnerBook = winner.book;
      const winnerRanked = winner.ranked;

      const chapter = (winnerBook.chapters as ChapterLike[]).find((c) => c.sourceId === best.sourceId);
      return {
        data: {
          resolved: winnerRanked.confident,
          needsClarification: !winnerRanked.confident,
          reason: winnerRanked.reason,
          notebookId: winnerBook.notebookId,
          bookTitle: winnerBook.title,
          subject: winnerBook.subject,
          className: winnerBook.className,
          sourceId: best.sourceId,
          chapterName: best.chapterName,
          chapterTitle: best.chapterTitle,
          confidence: best.score,
          headings: (chapter?.headings ?? []).slice(0, MAX_HEADINGS),
          definitions: (chapter?.keyConcepts ?? [])
            .filter((c) => c?.term && c?.definition)
            .slice(0, 40)
            .map((c) => ({ term: String(c.term), definition: String(c.definition).slice(0, 600) })),
          alternatives: winnerRanked.alternatives,
        },
        provenance: CURRICULUM,
      };
    },
    summarize: (out: any) =>
      out?.resolved
        ? { chapter: out.chapterName, book: out.bookTitle, confidence: out.confidence }
        : { resolved: false, reason: out?.reason, options: (out?.alternatives ?? []).length },
  };

  const chapterAssets: ToolDefinition<any, any> = {
    name: 'get_chapter_assets',
    description:
      'Lists the study assets Sadhya has already generated for one chapter (key formulae, summaries, ' +
      'flashcards, quizzes and so on), optionally with their content. Use before generating anything new.',
    category: 'knowledge',
    inputSchema: z.object({
      notebookId: z.string().describe('Curriculum notebook id from resolve_curriculum_chapter.'),
      chapterTitle: z.string().describe('The chapter title from resolve_curriculum_chapter.'),
      types: z.array(z.string()).max(12).optional().describe('Asset types to keep, e.g. ["KEY_FORMULAE"].'),
      includeContent: z.boolean().optional().describe('Include the asset bodies, not just the list.'),
    }),
    outputSchema: z
      .object({
        notebookId: z.string(),
        chapterTitle: z.string(),
        assetCount: z.number(),
        types: z.array(z.string()),
        assets: z.array(z.object({ type: z.string(), title: z.string(), content: z.any().optional() })),
        truncated: z.boolean(),
      })
      .passthrough(),
    permissions: ['read:shared-corpus'],
    costClass: 'free',
    timeoutMs: 25_000,
    retry: { maxAttempts: 2, baseBackoffMs: 400 },
    idempotent: true,
    requiresApproval: false,
    provenance: CURRICULUM,
    async execute(input) {
      // Boundary check: refuse anything that is not a shared curriculum notebook.
      const book = await bookLibrary().getBookDetail(input.notebookId);
      if (!book) throw new ToolError('permission', 'That notebook is not part of the shared curriculum corpus.');

      const all = await notebooks().getLearningAssets(input.notebookId);
      // Assets carry no source id — ingestion names them "<chapter file title> - <Asset Name>",
      // so the chapter file title is the only reliable join back to a chapter.
      const prefix = String(input.chapterTitle).replace(/\.pdf$/i, '');
      const wanted = new Set((input.types ?? []).map((t: string) => t.toUpperCase()));
      const mine = all.filter((a: any) => {
        const title = String(a?.title ?? '');
        const matchesChapter = title.startsWith(prefix) || title.startsWith(`${prefix}.pdf`);
        return matchesChapter && (wanted.size === 0 || wanted.has(String(a?.type ?? '').toUpperCase()));
      });

      let truncated = false;
      const assets = mine.map((a: any) => {
        const base = { type: String(a.type), title: String(a.title ?? '') };
        if (!input.includeContent) return base;
        const json = JSON.stringify(a.content ?? null);
        if (json.length > MAX_ASSET_CHARS) {
          truncated = true;
          return { ...base, content: { truncated: true, preview: json.slice(0, 2000) } };
        }
        return { ...base, content: a.content ?? null };
      });

      return {
        data: {
          notebookId: input.notebookId,
          chapterTitle: input.chapterTitle,
          assetCount: assets.length,
          types: [...new Set(assets.map((a: any) => a.type))],
          assets,
          truncated,
        },
        provenance: CURRICULUM,
      };
    },
    summarize: (out: any) => ({ assetCount: out?.assetCount ?? 0, types: out?.types ?? [] }),
  };

  const chapterGraph: ToolDefinition<any, any> = {
    name: 'get_chapter_knowledge_graph',
    description:
      "Returns the concepts, formulae and relationships Sadhya extracted from one chapter — the chapter's " +
      'slice of the knowledge graph, with the most important nodes first.',
    category: 'knowledge',
    inputSchema: z.object({
      notebookId: z.string().describe('Curriculum notebook id from resolve_curriculum_chapter.'),
      sourceId: z.string().describe('Chapter source id from resolve_curriculum_chapter.'),
      limit: z.number().int().min(1).max(60).optional().describe('Maximum nodes to return (default 25).'),
      types: z
        .array(z.enum(['CONCEPT', 'FORMULA', 'PERSON', 'DEFINITION', 'THEOREM']))
        .max(5)
        .optional()
        .describe('Only these node types, e.g. ["FORMULA"] for a formula chart.'),
    }),
    outputSchema: z
      .object({
        nodeCount: z.number(),
        edgeCount: z.number(),
        nodes: z.array(z.object({ id: z.string(), label: z.string(), type: z.string(), importance: z.number().optional() })),
        relationships: z.array(z.object({ from: z.string(), to: z.string(), type: z.string() })),
      })
      .passthrough(),
    permissions: ['read:shared-corpus'],
    costClass: 'free',
    timeoutMs: 25_000,
    retry: { maxAttempts: 2, baseBackoffMs: 400 },
    idempotent: true,
    requiresApproval: false,
    provenance: CURRICULUM,
    async execute(input) {
      const book = await bookLibrary().getBookDetail(input.notebookId);
      if (!book) throw new ToolError('permission', 'That notebook is not part of the shared curriculum corpus.');

      const limit = input.limit ?? 25;
      const wanted = new Set<string>(input.types ?? []);
      // A type filter is applied after the read, so read the chapter's whole slice for it: formula
      // nodes rank low on importance and would otherwise fall outside the first page.
      const rawNodes = await notebooks().getKGNodesForSource(input.notebookId, input.sourceId, wanted.size ? 400 : Math.max(limit * 2, 40));
      const nodes = rawNodes
        .filter((n: any) => !wanted.size || wanted.has(String(n.type ?? 'CONCEPT')))
        .map((n: any) => ({ id: String(n.id), label: String(n.label ?? ''), type: String(n.type ?? 'CONCEPT'), importance: n.importance }))
        .sort((a: any, b: any) => (b.importance ?? 0) - (a.importance ?? 0) || a.label.localeCompare(b.label))
        .slice(0, limit);

      const byId = new Map(nodes.map((n: any) => [n.id, n.label]));
      const edges = nodes.length ? await notebooks().getKGEdgesForNodes(input.notebookId, nodes.map((n: any) => n.id)) : [];
      const relationships = edges
        .filter((e: any) => byId.has(e.sourceNodeId) && byId.has(e.targetNodeId))
        .map((e: any) => ({
          from: byId.get(e.sourceNodeId)!,
          to: byId.get(e.targetNodeId)!,
          type: String(e.relationshipType ?? 'RELATED_TO'),
        }))
        .slice(0, 60);

      return { data: { nodeCount: nodes.length, edgeCount: relationships.length, nodes, relationships }, provenance: CURRICULUM };
    },
    summarize: (out: any) => ({ nodeCount: out?.nodeCount ?? 0, edgeCount: out?.edgeCount ?? 0 }),
  };

  const curriculumContext: ToolDefinition<any, any> = {
    name: 'retrieve_curriculum_context',
    description:
      'Retrieves passages from the NCERT curriculum corpus for a question or topic. Use when the ' +
      "chapter's own metadata is not enough and the actual textbook wording is needed.",
    category: 'knowledge',
    inputSchema: z.object({
      query: z.string().min(2).describe('What to look for, in the student’s words.'),
      topK: z.number().int().min(1).max(10).optional().describe('How many passages to return (default 5).'),
    }),
    outputSchema: z
      .object({ results: z.array(z.object({ text: z.string(), source: z.string(), score: z.number() }).passthrough()) })
      .passthrough(),
    permissions: ['read:shared-corpus'],
    // Embeds the query: the Vertex embedding quota is ~5/min and shared with live student
    // retrieval, so this is deliberately not 'free' and workflows should call it sparingly.
    costClass: 'low',
    timeoutMs: 45_000,
    retry: { maxAttempts: 2, baseBackoffMs: 1_500 },
    idempotent: true,
    requiresApproval: false,
    provenance: CURRICULUM,
    async execute(input) {
      const results = await retrieval().retrieveCurriculumContext(input.query, input.topK ?? 5);
      return {
        data: {
          results: (results ?? []).map((r: any) => ({
            text: String(r.text ?? '').slice(0, 800),
            source: String(r.source ?? ''),
            score: Number(r.score ?? 0),
          })),
        },
        provenance: CURRICULUM,
      };
    },
    summarize: (out: any) => ({ resultCount: out?.results?.length ?? 0 }),
  };

  const webResearch: ToolDefinition<any, any> = {
    name: 'web_research',
    description:
      'Searches the public web. Results are WEB provenance — never presentable as Sadhya’s verified ' +
      'corpus, and every claim taken from them must be attributed to its URL.',
    category: 'web',
    inputSchema: z.object({ query: z.string().min(2).describe('What to search for.') }),
    outputSchema: z
      .object({ results: z.array(z.object({ text: z.string(), url: z.string(), title: z.string().optional() }).passthrough()) })
      .passthrough(),
    permissions: ['network:web'],
    costClass: 'low',
    timeoutMs: 30_000,
    retry: { maxAttempts: 2, baseBackoffMs: 1_000 },
    idempotent: true,
    requiresApproval: false,
    provenance: 'WEB',
    // Off unless AGENT_WEB_SEARCH_ENABLED is on; the registry hides a disabled tool from plans.
    isEnabled: () => featureFlags.agentWebSearch,
    async execute(input) {
      const results = await retrieval().retrieveWebContext(input.query);
      return {
        data: {
          results: (results ?? []).map((r: any) => ({
            text: String(r.text ?? '').slice(0, 800),
            url: String(r.source ?? r.metadata?.url ?? ''),
            title: r.metadata?.title ? String(r.metadata.title) : undefined,
          })),
        },
        provenance: 'WEB',
      };
    },
    summarize: (out: any) => ({
      resultCount: out?.results?.length ?? 0,
      sources: (out?.results ?? []).map((r: any) => r.url).filter(Boolean).slice(0, 5),
    }),
  };

  for (const tool of [resolveChapter, chapterAssets, chapterGraph, curriculumContext, webResearch]) {
    registry.register(tool);
  }
  return registry;
}
