import { KGRelationshipType } from '../types';

/**
 * Pure helpers for the 2-layer knowledge-graph linker (Phase B, Part 9). No I/O — unit-testable.
 */

/** Cosine similarity of two equal-length vectors. Returns 0 for empty/mismatched inputs. */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (!a || !b || a.length === 0 || a.length !== b.length) return 0;
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  if (na === 0 || nb === 0) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

export interface CandidateEdge {
  sourceNodeId: string;
  targetNodeId: string;
  relationshipType: KGRelationshipType;
  confidence: number;
  layer: 'similarity' | 'llm';
}

// Similarity-only relationship types (undirected in meaning); LLM types are directional/typed.
const SIMILARITY_TYPES = new Set<KGRelationshipType>(['RELATED_TO', 'SIMILAR_TO']);

/**
 * Deduplicate candidate edges to at most one edge per unordered node pair.
 *   - a typed (LLM) edge always wins over a similarity edge for the same pair,
 *   - among edges of equal precedence, the highest-confidence one wins,
 *   - self-loops are dropped.
 * The chosen edge keeps its original direction and type.
 */
export function dedupeEdges(edges: CandidateEdge[]): CandidateEdge[] {
  const best = new Map<string, CandidateEdge>();
  const rank = (e: CandidateEdge) => (SIMILARITY_TYPES.has(e.relationshipType) ? 0 : 1); // typed outranks similarity

  for (const e of edges) {
    if (!e.sourceNodeId || !e.targetNodeId || e.sourceNodeId === e.targetNodeId) continue;
    const key = [e.sourceNodeId, e.targetNodeId].sort().join('\u0000'); // unordered pair
    const prev = best.get(key);
    if (!prev) { best.set(key, e); continue; }
    const better =
      rank(e) > rank(prev) ||
      (rank(e) === rank(prev) && e.confidence > prev.confidence);
    if (better) best.set(key, e);
  }
  return Array.from(best.values());
}
