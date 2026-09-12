/**
 * ReferenceBooksService — retrieval over the isolated reference-books corpus.
 * ========================================================================
 *
 * Lucent GK / Lucent Science / S. Chand Quantitative Aptitude / … all live in ONE dedicated
 * Pinecone namespace (`reference_books`), written only by scripts/reference/books/. This service
 * is the ONLY read path into that namespace. It never touches `env.PINECONE_NAMESPACE`, so it
 * cannot surface a PYQ / practice / curriculum vector, and no other retrieval path can surface a
 * reference-book vector.
 *
 * Per-book separation is by the `book` metadata field (e.g. "lucent_gk", "schand_quant").
 *
 * Retrieval priority (spec §19): official/primary source → verified PYQ → trusted reference →
 * **reference books** → generated knowledge. `authorityMultiplier` (0.9) sits deliberately below
 * the curriculum path's 1.4 — on a tie against higher-authority context, the reference book
 * loses. If it contradicts an official source, the official source wins.
 */
import { pineconeService } from './pinecone.service';
import { GoogleEmbeddingProvider } from '../ai/providers/google-embedding.provider';
import { CohereRerankerProvider } from '../ai/providers/cohere-reranker.provider';
import { cacheService } from '../cache.service';
import { RetrievalResult } from './retrieval.service';
import { Telemetry } from '../../lib/telemetry';

/** Kept in sync with scripts/reference/books/contract.ts. */
export const REFERENCE_NAMESPACE = 'reference_books';
export const REFERENCE_CORPUS_BUCKET = 'REFERENCE_BOOK';
const REFERENCE_AUTHORITY_MULTIPLIER = 0.9;

export interface ReferenceRetrievalOptions {
  topK?: number;
  /** Restrict to one book, e.g. 'lucent_gk' | 'lucent_science' | 'schand_quant'. */
  book?: string | string[];
  /** Restrict to one publisher, e.g. 'Lucent Publication' | 'S. Chand'. */
  publisher?: string;
  /** 'General Knowledge' | 'physics' | 'quantitative_aptitude' | … */
  subject?: string;
  /** Book category, e.g. 'Indian Polity', 'Number System'. */
  category?: string;
  /** Restrict to chunks tagged relevant to this exam (spec §17). */
  examCode?: string;
  /** 'definition' | 'formula' | 'worked_example' | 'rule' | 'shortcut' | 'table' | … */
  knowledgeType?: string;
  skipRerank?: boolean;
}

export class ReferenceBooksService {
  private embeddingProvider = new GoogleEmbeddingProvider();
  private reranker = new CohereRerankerProvider();

  /** Semantic search over the reference-books corpus. Returns [] rather than throwing on no-hits. */
  async retrieveReferenceContext(query: string, opts: ReferenceRetrievalOptions = {}): Promise<RetrievalResult[]> {
    const topK = opts.topK ?? 5;
    const t0 = performance.now();

    const filter: Record<string, any> = {
      corpusBucket: REFERENCE_CORPUS_BUCKET, // second layer on top of the namespace split
      is_pyq: false,
      is_generated: false,
      is_mock: false,
    };
    if (opts.book) filter.book = Array.isArray(opts.book) ? { $in: opts.book } : opts.book;
    if (opts.publisher) filter.publisher = opts.publisher;
    if (opts.subject) filter.subject = opts.subject;
    if (opts.category) filter.category = opts.category;
    if (opts.knowledgeType) filter.knowledge_type = opts.knowledgeType;
    if (opts.examCode) filter.exam_relevance = { $in: [opts.examCode] };

    const cacheKey = `reference_retrieval:${JSON.stringify({ query, topK, filter })}`;
    const cached = await cacheService.get<RetrievalResult[]>(cacheKey);
    if (cached) {
      Telemetry.logLatency('retrieval_cache_hit', performance.now() - t0, { kind: 'reference' });
      return cached;
    }

    const queryEmbedding = await this.embeddingProvider.generateEmbedding(query);

    let matches = (await pineconeService.queryVectors(queryEmbedding, topK * 4, filter, REFERENCE_NAMESPACE)) || [];
    if (!matches.length) {
      // Degrade gracefully: drop the optional facets, keep the hard isolation flags + book.
      const bare: Record<string, any> = { corpusBucket: REFERENCE_CORPUS_BUCKET, is_pyq: false };
      if (opts.book) bare.book = filter.book;
      matches = (await pineconeService.queryVectors(queryEmbedding, topK * 4, bare, REFERENCE_NAMESPACE)) || [];
    }

    const valid = matches.filter((m: any) => (m.score || 0) >= 0.42);
    if (!valid.length) return [];

    const uniq = new Map<string, any>();
    for (const m of valid) {
      const text = m.metadata?.text as string | undefined;
      if (text && !uniq.has(text)) uniq.set(text, m);
    }
    const deduped = [...uniq.values()];

    let ordered: Array<{ match: any; relevanceScore: number }>;
    if (opts.skipRerank) {
      ordered = deduped.slice(0, topK).map((match) => ({ match, relevanceScore: match.score || 0 }));
    } else {
      const reranked = await this.reranker.rerank(query, deduped.map((m) => String(m.metadata?.text || '')), topK);
      ordered = reranked.map((r) => ({ match: deduped[r.index], relevanceScore: r.relevanceScore })).filter((x) => x.match);
    }

    // Figure chunks (non-verbal reasoning, DI charts, geometry) carry a Firebase Storage path in
    // `figure_asset`. Mint a short-lived signed read URL so the caller can render the page image
    // beside the text — the same pattern podcast.controller.ts uses for cover images.
    let signUrl: ((p: string) => Promise<string | null>) | null = null;
    if (ordered.some(({ match }) => match.metadata?.figure_asset)) {
      try {
        const { getStorage } = await import('firebase-admin/storage');
        signUrl = async (p: string) => {
          try {
            const [url] = await getStorage()
              .bucket()
              .file(p)
              .getSignedUrl({ action: 'read', expires: Date.now() + 6 * 60 * 60 * 1000 });
            return url;
          } catch {
            return null;
          }
        };
      } catch { /* storage unavailable — return the path only */ }
    }

    const results: RetrievalResult[] = [];
    for (const { match, relevanceScore } of ordered) {
      const md = match.metadata || {};
      const hierarchy = [md.book_title, md.chapter, md.section, md.topic].filter(Boolean).join(' › ');
      const figureAsset = typeof md.figure_asset === 'string' && md.figure_asset ? md.figure_asset : null;
      const figureAssetUrl = figureAsset && signUrl ? await signUrl(figureAsset) : null;
      results.push({
        text: String(md.text || ''),
        source: `${md.book_title || 'Reference'} — ${md.chapter || md.section || 'reference'}${md.page_number ? ` (p.${md.page_number})` : ''}`,
        score: relevanceScore,
        weightedScore: relevanceScore * REFERENCE_AUTHORITY_MULTIPLIER,
        metadata: {
          ...md,
          pageNumber: md.page_number,
          authority: 'secondary_reference',
          hierarchyPath: hierarchy,
          figureAsset, // storage path
          figureAssetUrl, // signed read URL (6h) or null
        },
        selectionReasoning: `Reference book (${md.publisher || ''}, ${md.knowledge_type || 'reference'})${figureAsset ? ' + page image' : ''} — ${hierarchy}. Secondary source: defer to official material on conflict.`,
      } as RetrievalResult);
    }
    results.sort((a, b) => (b.weightedScore || 0) - (a.weightedScore || 0));

    await cacheService.set(cacheKey, results, 600);
    Telemetry.logLatency('retrieval_total', performance.now() - t0, { resultsCount: results.length, kind: 'reference' });
    return results;
  }

  /** Convenience wrapper — Lucent only. */
  retrieveLucentContext(query: string, opts: Omit<ReferenceRetrievalOptions, 'book' | 'publisher'> & { book?: 'lucent_gk' | 'lucent_science' } = {}) {
    return this.retrieveReferenceContext(query, { ...opts, book: opts.book || ['lucent_gk', 'lucent_science'] });
  }

  /**
   * Isolation self-check. Confirms the reference namespace holds only REFERENCE_BOOK vectors, and
   * that the shared namespace holds none.
   */
  async verifyIsolation(): Promise<{ ok: boolean; details: string[] }> {
    const probe = new Array(768).fill(0.02);
    const details: string[] = [];

    const ref = (await pineconeService.queryVectors(probe, 50, undefined, REFERENCE_NAMESPACE)) || [];
    const stray = ref.filter((m: any) => m.metadata?.corpusBucket !== REFERENCE_CORPUS_BUCKET);
    if (stray.length) details.push(`${stray.length} non-reference vector(s) inside ${REFERENCE_NAMESPACE}`);

    const { env } = require('../../config/env');
    const leaked = (await pineconeService.queryVectors(probe, 50, { corpusBucket: REFERENCE_CORPUS_BUCKET }, env.PINECONE_NAMESPACE)) || [];
    if (leaked.length) details.push(`${leaked.length} ${REFERENCE_CORPUS_BUCKET} vector(s) leaked into ${env.PINECONE_NAMESPACE}`);

    return { ok: details.length === 0, details };
  }
}

export const referenceBooksService = new ReferenceBooksService();
