/**
 * Lexical (keyword) relevance for hybrid search — BM25 plus reciprocal-rank fusion.
 *
 * Pure functions, no I/O, so the scoring is testable without a running Qdrant.
 *
 * BM25 (Robertson/Spärck Jones, Lucene's non-negative IDF variant):
 *
 *     idf(t)      = ln(1 + (N − df(t) + 0.5) / (df(t) + 0.5))
 *     score(d, q) = Σ_{t ∈ q}  idf(t) · tf(t,d)·(k1 + 1) / (tf(t,d) + k1·(1 − b + b·|d|/avgdl))
 *
 *   N, df(t)  exact counts from the collection, restricted to the same namespace + filter as the
 *             query (Qdrant `count` against the full-text index on `text`).
 *   tf, |d|   computed from the chunk text with tokenize() below.
 *   avgdl     mean length of the candidate pool. The collection-wide mean is not available from
 *             Qdrant without a full scan; reference chunks are length-capped (~250 words), so the
 *             pool mean is a close and stable proxy.
 *   k1 = 1.2, b = 0.75 — the standard defaults.
 *
 * Fusion (Cormack et al., 2009):
 *
 *     rrf(d) = w_dense / (k + rank_dense(d)) + (1 − w_dense) / (k + rank_keyword(d)),   k = 60
 *
 * A list a document is absent from contributes nothing. Ranks are 1-based.
 */

export const BM25_K1 = 1.2;
export const BM25_B = 0.75;
export const RRF_K = 60;

/** Function words that carry no retrieval signal in student questions. */
const STOPWORDS = new Set([
  'what', 'is', 'the', 'and', 'in', 'of', 'for', 'to', 'a', 'an', 'explain', 'state', 'how', 'does',
  'which', 'by', 'on', 'with', 'from', 'at', 'into', 'under', 'about', 'when', 'where', 'why', 'are',
  'was', 'were', 'will', 'can', 'could', 'this', 'that', 'its', 'it', 'be', 'or', 'as', 'do', 'me',
  'please', 'tell', 'give', 'define', 'describe', 'between', 'difference',
]);

/** Lowercase word tokens, Unicode-aware (Devanagari stays intact). Mirrors Qdrant's `word` tokenizer. */
export function tokenize(text: string): string[] {
  return String(text || '').toLowerCase().split(/[^\p{L}\p{N}]+/u).filter(Boolean);
}

/** Distinct query terms worth searching for: no stopwords, no 1–2 letter fragments (numbers kept). */
export function queryTerms(query: string): string[] {
  const out: string[] = [];
  for (const t of tokenize(query)) {
    if (STOPWORDS.has(t)) continue;
    if (t.length <= 2 && !/^\p{N}+$/u.test(t)) continue;
    if (!out.includes(t)) out.push(t);
  }
  return out;
}

export function bm25Idf(totalDocs: number, docFreq: number): number {
  return Math.log(1 + (totalDocs - docFreq + 0.5) / (docFreq + 0.5));
}

export function bm25Score(
  docTokens: string[],
  idfByTerm: Map<string, number>,
  avgDocLength: number,
  k1 = BM25_K1,
  b = BM25_B,
): number {
  if (!docTokens.length || !idfByTerm.size) return 0;
  const tf = new Map<string, number>();
  for (const t of docTokens) if (idfByTerm.has(t)) tf.set(t, (tf.get(t) ?? 0) + 1);
  const lengthNorm = 1 - b + b * (docTokens.length / Math.max(1, avgDocLength));
  let score = 0;
  for (const [term, f] of tf) score += idfByTerm.get(term)! * ((f * (k1 + 1)) / (f + k1 * lengthNorm));
  return score;
}

/** Fuse two rankings (arrays of ids, best first). Returns id → fused score. */
export function reciprocalRankFusion(dense: string[], keyword: string[], denseWeight = 0.6, k = RRF_K): Map<string, number> {
  const fused = new Map<string, number>();
  dense.forEach((id, i) => fused.set(id, (fused.get(id) ?? 0) + denseWeight / (k + i + 1)));
  keyword.forEach((id, i) => fused.set(id, (fused.get(id) ?? 0) + (1 - denseWeight) / (k + i + 1)));
  return fused;
}

/** Cosine similarity — used to give keyword-only hits their TRUE semantic score instead of an invented one. */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (!a?.length || a.length !== b?.length) return 0;
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) { dot += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i]; }
  return na && nb ? dot / Math.sqrt(na * nb) : 0;
}
