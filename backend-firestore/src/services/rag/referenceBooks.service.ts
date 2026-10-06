/**
 * ReferenceBooksService — retrieval over the isolated reference-books corpus.
 * ========================================================================
 *
 * Every reference book (Lucent, S. Chand, H.C. Verma, Irodov, …) lives in ONE namespace,
 * REFERENCE_BOOK_NAMESPACE, which lives in Qdrant regardless of VECTOR_STORE (pinecone.service
 * routes it). This service is the only read path into it, and it always names that namespace, so
 * it cannot surface a PYQ / practice / curriculum / notebook vector, and no other path can surface
 * a reference-book vector. `corpusBucket: REFERENCE_BOOK` plus `is_pyq/is_generated/is_mock: false`
 * are a second guard on top.
 *
 * Pipeline: [HyDE when the query needs it] → hybrid search (dense + BM25) → cosine floor →
 * dedupe → Cohere rerank → weight by the REFERENCE_BOOK tier → parent-context hydration.
 *
 * Authority: weightedScore = rerank relevance × KNOWLEDGE_AUTHORITY_WEIGHTS.REFERENCE_BOOK (0.9),
 * the same scale the orchestrator ranks every tier on (core/knowledge/knowledgeAuthority.ts).
 */
import { pineconeService } from './pinecone.service';
import { GoogleEmbeddingProvider } from '../ai/providers/google-embedding.provider';
import { CohereRerankerProvider } from '../ai/providers/cohere-reranker.provider';
import { MIN_RERANK_RELEVANCE } from '../ai/reranker.provider.interface';
import { cacheService } from '../cache.service';
import { RetrievalResult } from './retrieval.service';
import { Telemetry } from '../../lib/telemetry';
import { logger } from '../../utils/logger';
import { parentDocumentService } from './parentDocument.service';
import { hydeService, classifyHydeNeed, toHydeDomain, HydeDecision } from './hyde.service';
import { REFERENCE_BOOK_NAMESPACE, REFERENCE_BOOK_CORPUS_BUCKET } from './namespaces';
import { KNOWLEDGE_AUTHORITY_WEIGHTS } from '../../core/knowledge/knowledgeAuthority';
import type { VectorMatch } from './vectorStore.types';
import { referenceScopeFor, resolveBookFilter, RETRIEVAL_EXCLUDED_BOOKS, ReferenceScope } from './referenceBookRegistry';

export type ReferenceRetrievalStatus = 'OK' | 'NO_RESULTS' | 'NO_SUPPORTED_REFERENCE_BOOKS';
export interface ReferenceRetrievalOutcome {
  status: ReferenceRetrievalStatus;
  results: RetrievalResult[];
  /** Set for NO_SUPPORTED_REFERENCE_BOOKS: why nothing was searched. */
  reason?: string;
  scope: ReferenceScope['kind'];
}

/** Minimum cosine for a hit to reach the reranker — unless BM25 ranked it near the top. */
export const REFERENCE_MIN_COSINE = 0.42;
/** Below this best-hit cosine, a plain search counts as weak and (in 'auto' mode) is retried with HyDE. */
export const HYDE_WEAK_RESULT_COSINE = 0.5;

/** Below MIN_RERANK_RELEVANCE, a passage survives only on a chapter-title match — and not below this. */
const REFERENCE_TITLE_MATCH_FLOOR = 0.02;
/** Words too common in student questions to count as a chapter-title match. */
const TITLE_STOPWORDS = new Set([
  'the', 'and', 'for', 'with', 'how', 'what', 'why', 'which', 'when', 'are', 'was', 'were', 'does',
  'can', 'you', 'give', 'explain', 'tell', 'about', 'questions', 'question', 'asked', 'exam', 'exams',
  'latest', 'new', 'from', 'this', 'that', 'into', 'ssc', 'cgl', 'upsc', 'jee', 'neet', 'tier',
]);
const titleWords = (s: unknown) =>
  String(s || '').toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 2 && !TITLE_STOPWORDS.has(w));
/** "TIME AND WORK" matches "How are time and work questions asked…"; "Indian Economy" does not match "latest notification". */
function chapterMatchesQuery(chapter: unknown, query: string): boolean {
  const q = new Set(titleWords(query));
  return titleWords(chapter).some((w) => q.has(w));
}

/**
 * Exam codes as the resolver emits them vs. the tag vocabulary books were ingested with.
 *
 * Ingestion scripts tagged chunks inconsistently: H.C. Verma says NEET where the resolver says
 * NEET_UG, Lucent says UPSC/BPSC where it says UPSC_CSE/BPSC_CCE, and some books use category
 * tags (BANKING, RAILWAY) instead of exam ids. Each entry maps a resolver id to the tags that
 * MEAN that exam. Never "GENERAL": nearly every book carries it, so matching it would undo the
 * exam boundary entirely (it is exactly how Lucent leaked into JEE answers).
 */
const EXAM_TAG_ALIASES: Record<string, string[]> = {
  NEET_UG: ['NEET'],
  NEET: ['NEET_UG'],
  UPSC_CSE: ['UPSC'],
  UPSC: ['UPSC_CSE'],
  BPSC_CCE: ['BPSC'],
  BPSC: ['BPSC_CCE'],
  BIHAR_STET: ['STET'],
  STET: ['BIHAR_STET'],
  IBPS_PO: ['BANKING'],
  IBPS_CLERK: ['BANKING'],
  SBI_PO: ['BANKING'],
  SBI_CLERK: ['BANKING'],
  RRB_NTPC: ['RAILWAY'],
  RRB_GROUP_D: ['RAILWAY'],
};
export function examRelevanceCodes(examCode: string): string[] {
  return [examCode, ...(EXAM_TAG_ALIASES[examCode] ?? [])];
}

export interface ReferenceRetrievalOptions {
  topK?: number;
  /** Restrict to one book, e.g. 'lucent_gk' | 'schand_quant' | 'hc_verma_physics_vol1'. */
  book?: string | string[];
  /** Restrict to one publisher, e.g. 'Lucent Publication' | 'S. Chand'. */
  publisher?: string;
  /** 'General Knowledge' | 'physics' | 'quantitative_aptitude' | … — also picks the HyDE domain. */
  subject?: string;
  /** Book category, e.g. 'Indian Polity', 'Number System'. */
  category?: string;
  /**
   * Exam isolation boundary: only chunks tagged relevant to this exam. NOT dropped by the
   * no-hits fallback — a wrong-exam passage presented as grounding is worse than none.
   */
  examCode?: string;
  /** 'definition' | 'formula' | 'worked_example' | 'rule' | 'shortcut' | 'table' | … */
  knowledgeType?: string;
  skipRerank?: boolean;
  /**
   * Hypothetical Document Embeddings:
   *   'auto'  — classifyHydeNeed() decides, and a weak plain search is retried with HyDE.
   *   true    — always (tests, explicit callers).
   *   false / undefined — never.
   */
  useHyde?: boolean | 'auto';
  /** HyDE domain override; defaults to `subject`. */
  domain?: string;
}

/**
 * The exact vector-store filter a reference query uses — pure, so tests and the live data check
 * (scripts/reference/books/check-reference-scope-live.ts) exercise the same code as production.
 * `filter` is null when the caller's books fall entirely outside the exam's book scope.
 */
export function buildReferenceFilter(opts: ReferenceRetrievalOptions): { scope: ReferenceScope; filter: Record<string, any> | null } {
  const scope = referenceScopeFor(opts.examCode, opts.domain ?? opts.subject, examRelevanceCodes);
  if (scope.kind === 'NO_SUPPORTED_REFERENCE_BOOKS') return { scope, filter: null };
  const filter: Record<string, any> = {
    corpusBucket: REFERENCE_BOOK_CORPUS_BUCKET,
    is_pyq: false,
    is_generated: false,
    is_mock: false,
  };
  // Book scope: the caller's books (aliases → canonical), narrowed to the exam's book list when
  // the exam is scoped by books; otherwise every book except superseded/broken ingestions.
  const requested = resolveBookFilter(opts.book);
  const books = scope.kind === 'BOOKS'
    ? (requested ? requested.filter((b) => scope.books.includes(b)) : scope.books)
    : requested;
  if (books && books.length === 0) return { scope, filter: null };
  filter.book = books ? { $in: books } : { $nin: RETRIEVAL_EXCLUDED_BOOKS };
  // Older duplicate ingestions inside a book (H.C. Verma vol 1/2 hold a page-level copy beside the
  // parent-linked one) are flagged `superseded: true` by backfill-parent-contexts --mark-superseded.
  // must_not semantics: points without the flag (everything else) are unaffected.
  filter.superseded = { $ne: true };
  if (opts.publisher) filter.publisher = opts.publisher;
  if (opts.subject) filter.subject = opts.subject;
  if (opts.category) filter.category = opts.category;
  if (opts.knowledgeType) filter.knowledge_type = opts.knowledgeType;
  if (scope.kind === 'TAGS') filter.exam_relevance = { $in: scope.examCodes };
  return { scope, filter };
}

export class ReferenceBooksService {
  private embeddingProvider = new GoogleEmbeddingProvider();
  private reranker = new CohereRerankerProvider();

  /** Semantic search over the reference-books corpus. Returns [] rather than throwing on no-hits. */
  async retrieveReferenceContext(query: string, opts: ReferenceRetrievalOptions = {}): Promise<RetrievalResult[]> {
    return (await this.retrieveReferenceContextWithStatus(query, opts)).results;
  }

  /**
   * Same search, plus WHY it came back empty. NO_SUPPORTED_REFERENCE_BOOKS means no book is in
   * scope for the exam (see referenceBookRegistry) — the vector store is not queried at all,
   * rather than falling back to books written for other exams.
   */
  async retrieveReferenceContextWithStatus(query: string, opts: ReferenceRetrievalOptions = {}): Promise<ReferenceRetrievalOutcome> {
    const topK = opts.topK ?? 5;
    const t0 = performance.now();
    const { scope, filter } = buildReferenceFilter(opts);
    if (scope.kind === 'NO_SUPPORTED_REFERENCE_BOOKS') {
      this.log(query, opts, { status: scope.kind, reason: scope.reason, hits: 0, kept: 0, ms: performance.now() - t0 });
      return { status: scope.kind, results: [], reason: scope.reason, scope: scope.kind };
    }
    if (!filter) {
      this.log(query, opts, { status: 'NO_RESULTS', reason: 'requested books are outside the exam scope', hits: 0, kept: 0, ms: performance.now() - t0 });
      return { status: 'NO_RESULTS', results: [], scope: scope.kind };
    }

    const cacheKey = `reference_retrieval:v2:${JSON.stringify({ query, topK, filter, useHyde: opts.useHyde ?? false, domain: opts.domain })}`;
    const cached = await cacheService.get<RetrievalResult[]>(cacheKey);
    if (cached) {
      Telemetry.logLatency('retrieval_cache_hit', performance.now() - t0, { kind: 'reference' });
      return { status: cached.length ? 'OK' : 'NO_RESULTS', results: cached, scope: scope.kind };
    }

    const domain = toHydeDomain(opts.domain ?? opts.subject);
    const decision: HydeDecision | { use: boolean; reason: 'forced' | 'disabled' } =
      opts.useHyde === true ? { use: true, reason: 'forced' }
      : opts.useHyde === 'auto' ? classifyHydeNeed(query)
      : { use: false, reason: 'disabled' };

    let hydeUsed: string | null = null;
    let matches: VectorMatch[];
    if (decision.use) {
      const hyde = await hydeService.generateAndEmbed(query, domain);
      hydeUsed = hyde.fallback ? null : decision.reason;
      matches = await this.search(query, hyde.embedding, filter, opts, topK);
    } else {
      matches = await this.search(query, await this.embeddingProvider.generateEmbedding(query), filter, opts, topK);
      const best = Math.max(0, ...matches.map((m) => m.score ?? 0));
      if (opts.useHyde === 'auto' && decision.reason === 'formal' && best < HYDE_WEAK_RESULT_COSINE) {
        // A textbook-sounding question that still found nothing close: try the book's phrasing.
        const hyde = await hydeService.generateAndEmbed(query, domain);
        if (!hyde.fallback) {
          hydeUsed = 'weak_results';
          const retry = await this.search(query, hyde.embedding, filter, opts, topK);
          matches = mergeById(matches, retry);
        }
      }
    }

    // Real cosine floor; a top-ranked BM25 hit (exact term match) still gets a reranker hearing.
    const valid = matches.filter((m) =>
      (m.score ?? 0) >= REFERENCE_MIN_COSINE || ((m.hybrid?.keywordRank ?? Infinity) <= topK));
    if (!valid.length) {
      this.log(query, opts, { status: 'NO_RESULTS', hits: matches.length, kept: 0, hyde: hydeUsed, hydeDecision: decision.reason, ms: performance.now() - t0 });
      return { status: 'NO_RESULTS', results: [], scope: scope.kind };
    }

    const uniq = new Map<string, VectorMatch>();
    for (const m of valid) {
      const text = m.metadata?.text as string | undefined;
      if (text && !uniq.has(text)) uniq.set(text, m);
    }
    const deduped = [...uniq.values()];

    let ordered: Array<{ match: VectorMatch; relevanceScore: number }>;
    if (opts.skipRerank) {
      ordered = deduped.slice(0, topK).map((match) => ({ match, relevanceScore: match.score || 0 }));
    } else {
      const reranked = await this.reranker.rerank(query, deduped.map((m) => String(m.metadata?.text || '')), topK);
      // Reference chunks score lower than NCERT prose, and a score alone cannot separate them:
      // for "How are time and work questions asked in SSC CGL?" the right TIME AND WORK pages
      // scored 0.064–0.077, while Lucent's Indian Economy page scored 0.064 for "latest SSC CGL
      // notification". The chapter title does separate them, so a passage below the floor is
      // kept only when its chapter shares a word with the question.
      ordered = reranked
        .filter((r) => {
          if (r.degraded || r.relevanceScore >= MIN_RERANK_RELEVANCE) return true;
          const md: any = deduped[r.index]?.metadata || {};
          return r.relevanceScore >= REFERENCE_TITLE_MATCH_FLOOR && chapterMatchesQuery(md.chapter || md.section || md.subject, query);
        })
        .map((r) => ({ match: deduped[r.index], relevanceScore: r.relevanceScore }))
        .filter((x) => x.match);
    }

    const signUrl = await this.figureSigner(ordered.map((o) => o.match));
    const results: RetrievalResult[] = [];
    for (const { match, relevanceScore } of ordered) {
      const md: any = match.metadata || {};
      const hierarchy = [md.book_title, md.chapter, md.section, md.topic].filter(Boolean).join(' › ');
      const figureAsset = typeof md.figure_asset === 'string' && md.figure_asset ? md.figure_asset : null;
      const figureAssetUrl = figureAsset && signUrl ? await signUrl(figureAsset) : null;
      const pageCitation = md.page_start && md.page_end
        ? ` (pp. ${md.page_start}–${md.page_end})`
        : md.page_number ? ` (p. ${md.page_number})` : '';
      const chapterOrSubject = md.chapter || md.section || (md.subject ? `[${md.subject}]` : 'reference');
      results.push({
        text: String(md.text || ''),
        source: `${md.book_title || 'Reference'} — ${chapterOrSubject}${pageCitation}`,
        score: relevanceScore,
        weightedScore: relevanceScore * KNOWLEDGE_AUTHORITY_WEIGHTS.REFERENCE_BOOK,
        metadata: {
          ...md,
          pageNumber: md.page_number || md.page_start,
          authority: 'REFERENCE_BOOK',
          authorityTier: 'REFERENCE_BOOK',
          hierarchyPath: hierarchy,
          figureAsset, // storage path
          figureAssetUrl, // signed read URL (6h) or null
          retrieval: { cosine: match.score, ...(match.hybrid ?? {}), hyde: hydeUsed },
        },
        selectionReasoning: `Reference book (${md.publisher || ''}, ${md.domain || md.knowledge_type || 'reference'})${figureAsset ? ' + page image' : ''} — ${hierarchy || md.book_title || 'Reference'}.`,
      } as RetrievalResult);
    }
    results.sort((a, b) => (b.weightedScore || 0) - (a.weightedScore || 0));

    const hydrated = await parentDocumentService.hydrateParentContext(results);

    await cacheService.set(cacheKey, hydrated, 600);
    const ms = performance.now() - t0;
    Telemetry.logLatency('retrieval_total', ms, { resultsCount: hydrated.length, kind: 'reference' });
    this.log(query, opts, {
      hits: matches.length, kept: hydrated.length, hyde: hydeUsed, hydeDecision: decision.reason,
      status: hydrated.length ? 'OK' : 'NO_RESULTS',
      parentExpanded: hydrated.filter((r) => r.metadata?.isParentExpanded).length, ms,
    });
    return { status: hydrated.length ? 'OK' : 'NO_RESULTS', results: hydrated, scope: scope.kind };
  }

  /** Strict query first; if empty, drop the optional facets — but never book or examCode. */
  private async search(
    query: string,
    queryVector: number[],
    filter: Record<string, any>,
    opts: ReferenceRetrievalOptions,
    topK: number,
  ): Promise<VectorMatch[]> {
    let matches: VectorMatch[] = (await pineconeService.hybridQuery({
      queryText: query, queryVector, topK: topK * 4, filter, namespace: REFERENCE_BOOK_NAMESPACE,
    })) || [];
    if (!matches.length) {
      /*
       * Degrade gracefully: drop the optional facets (subject/category/knowledgeType — narrowing
       * that can legitimately be too tight), but NOT examCode. examCode is a cross-exam isolation
       * boundary, not a relevance hint: dropping it here let a JEE Main "Thermodynamics" query
       * surface Lucent General Science content (exam_relevance ["SSC_CGL", ...]) purely on
       * semantic similarity. A JEE student must get JEE-relevant material or none.
       */
      const bare: Record<string, any> = { corpusBucket: REFERENCE_BOOK_CORPUS_BUCKET, is_pyq: false };
      // Book scope and exam tags are boundaries, not relevance hints: both survive the fallback.
      if (filter.book) bare.book = filter.book;
      if (filter.exam_relevance) bare.exam_relevance = filter.exam_relevance;
      matches = (await pineconeService.hybridQuery({
        queryText: query, queryVector, topK: topK * 4, filter: bare, namespace: REFERENCE_BOOK_NAMESPACE,
      })) || [];
    }
    return matches;
  }

  /**
   * Figure chunks (non-verbal reasoning, DI charts, geometry) carry a Firebase Storage path in
   * `figure_asset`. Returns a signer that mints a short-lived read URL, or null when not needed.
   */
  private async figureSigner(matches: VectorMatch[]): Promise<((p: string) => Promise<string | null>) | null> {
    if (!matches.some((m) => m.metadata?.figure_asset)) return null;
    try {
      const { getStorage } = await import('firebase-admin/storage');
      return async (p: string) => {
        try {
          const [url] = await getStorage().bucket().file(p)
            .getSignedUrl({ action: 'read', expires: Date.now() + 6 * 60 * 60 * 1000 });
          return url;
        } catch (err: any) {
          logger.warn('[ReferenceBooks] could not sign figure URL', { path: p, error: err?.message });
          return null;
        }
      };
    } catch (err: any) {
      logger.warn('[ReferenceBooks] storage unavailable; figures returned without URLs', { error: err?.message });
      return null;
    }
  }

  private log(query: string, opts: ReferenceRetrievalOptions, f: Record<string, unknown>) {
    logger.info('[ReferenceBooks] retrieval', {
      tier: 'REFERENCE_BOOK',
      queryChars: query.length,
      examCode: opts.examCode ?? null,
      subject: opts.subject ?? null,
      book: opts.book ?? null,
      ...f,
      ms: typeof f.ms === 'number' ? Math.round(f.ms) : f.ms,
    });
  }

  /** Convenience wrapper — Lucent only. */
  retrieveLucentContext(query: string, opts: Omit<ReferenceRetrievalOptions, 'book' | 'publisher'> & { book?: 'lucent_gk' | 'lucent_science' } = {}) {
    return this.retrieveReferenceContext(query, { ...opts, book: opts.book || ['lucent_gk', 'lucent_science'] });
  }

  /**
   * Isolation self-check, run at server start (server.ts) and by the knowledge-integrity audit. Confirms the reference
   * namespace holds only REFERENCE_BOOK vectors, and that the shared namespace holds none.
   */
  async verifyIsolation(): Promise<{ ok: boolean; details: string[] }> {
    const probe = new Array(768).fill(0.02);
    const details: string[] = [];

    const ref = (await pineconeService.queryVectors(probe, 50, undefined, REFERENCE_BOOK_NAMESPACE)) || [];
    const stray = ref.filter((m: any) => m.metadata?.corpusBucket !== REFERENCE_BOOK_CORPUS_BUCKET);
    if (stray.length) details.push(`${stray.length} non-reference vector(s) inside ${REFERENCE_BOOK_NAMESPACE}`);

    const { env } = require('../../config/env');
    const leaked = (await pineconeService.queryVectors(probe, 50, { corpusBucket: REFERENCE_BOOK_CORPUS_BUCKET }, env.PINECONE_NAMESPACE)) || [];
    if (leaked.length) details.push(`${leaked.length} ${REFERENCE_BOOK_CORPUS_BUCKET} vector(s) leaked into ${env.PINECONE_NAMESPACE}`);

    return { ok: details.length === 0, details };
  }
}

/** Union of two match lists by id, keeping the higher cosine. */
function mergeById(a: VectorMatch[], b: VectorMatch[]): VectorMatch[] {
  const out = new Map<string, VectorMatch>();
  for (const m of [...a, ...b]) {
    const prev = out.get(m.id);
    if (!prev || (m.score ?? 0) > (prev.score ?? 0)) out.set(m.id, m);
  }
  return [...out.values()].sort((x, y) => (y.score ?? 0) - (x.score ?? 0));
}

export const referenceBooksService = new ReferenceBooksService();
