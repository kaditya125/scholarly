import { ConceptNode } from '../interfaces/IGraphProvider';

/**
 * Knowledge Graph Evolution Foundation (Task 11) — READ-ONLY analysis of the knowledge graph that
 * surfaces where it could be improved. It NEVER mutates the graph; it only emits recommendations
 * (duplicate concepts, missing reciprocal relationships, isolated concepts, weak regions, dangling
 * edges). A human or a future explicitly-flagged tool applies any change.
 *
 * Detection is PURE given a ConceptNode[] (unit-testable). The optional scan() convenience reads
 * the graph via an injected loader (guarded) and returns the same recommendations.
 */
export type GraphIssueKind =
  | 'duplicate_concept'
  | 'missing_reciprocal'
  | 'isolated_concept'
  | 'weak_region'
  | 'dangling_edge';

export interface GraphRecommendation {
  kind: GraphIssueKind;
  conceptId: string;
  detail: string;
  confidence: number;      // 0..1
  related?: string[];      // other concept ids involved
}

export interface GraphEvolutionReport {
  scanned: number;
  recommendations: GraphRecommendation[];
  summary: Record<GraphIssueKind, number>;
}

/** Edge fields that constitute a relationship on a ConceptNode. */
const EDGE_FIELDS: Array<keyof ConceptNode> = ['prerequisites', 'childTopics', 'relatedConcepts', 'crossReferences'];
/** A concept with fewer than this many total edges sits in a "weak region". */
const WEAK_EDGE_THRESHOLD = 2;
/** Token-overlap (Jaccard) above which two titles look like duplicates. */
const DUPLICATE_SIMILARITY = 0.8;

function titleTokens(title: string): Set<string> {
  return new Set((title || '').toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter((t) => t.length > 2));
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let inter = 0;
  for (const t of a) if (b.has(t)) inter++;
  return inter / (a.size + b.size - inter);
}

function edgesOf(node: ConceptNode): string[] {
  const out: string[] = [];
  for (const f of EDGE_FIELDS) {
    const arr = node[f] as unknown as string[] | undefined;
    if (Array.isArray(arr)) out.push(...arr);
  }
  return out;
}

export class GraphEvolutionService {
  /** Analyze a set of concept nodes and emit recommendations (pure, read-only). */
  analyze(nodes: ConceptNode[]): GraphEvolutionReport {
    const recs: GraphRecommendation[] = [];
    const byId = new Map<string, ConceptNode>();
    for (const n of nodes) if (n && n.conceptId) byId.set(n.conceptId, n);

    // Precompute title token sets for duplicate detection.
    const tokens = new Map<string, Set<string>>();
    for (const n of nodes) tokens.set(n.conceptId, titleTokens(n.title));

    for (let i = 0; i < nodes.length; i++) {
      const node = nodes[i];
      if (!node || !node.conceptId) continue;
      const edges = edgesOf(node);

      // 1. Isolated concept — no relationships at all.
      if (edges.length === 0) {
        recs.push({ kind: 'isolated_concept', conceptId: node.conceptId, detail: `"${node.title}" has no relationships to any other concept.`, confidence: 0.8 });
      } else if (edges.length < WEAK_EDGE_THRESHOLD) {
        // 2. Weak region — very few relationships.
        recs.push({ kind: 'weak_region', conceptId: node.conceptId, detail: `"${node.title}" has only ${edges.length} relationship(s); likely under-connected.`, confidence: 0.5 });
      }

      // 3. Dangling edges — point to concept ids that don't exist.
      const dangling = Array.from(new Set(edges)).filter((id) => id && !byId.has(id));
      if (dangling.length > 0) {
        recs.push({ kind: 'dangling_edge', conceptId: node.conceptId, detail: `"${node.title}" references ${dangling.length} missing concept id(s).`, confidence: 0.7, related: dangling.slice(0, 10) });
      }

      // 4. Missing reciprocal relatedConcepts — A→B but not B→A.
      for (const relId of new Set(node.relatedConcepts || [])) {
        const other = byId.get(relId);
        if (other && !(other.relatedConcepts || []).includes(node.conceptId)) {
          recs.push({ kind: 'missing_reciprocal', conceptId: node.conceptId, detail: `"${node.title}" links to "${other.title}" but not vice-versa.`, confidence: 0.6, related: [relId] });
        }
      }

      // 5. Duplicate concepts — highly similar titles (check each pair once).
      for (let j = i + 1; j < nodes.length; j++) {
        const other = nodes[j];
        if (!other || !other.conceptId) continue;
        const sim = jaccard(tokens.get(node.conceptId)!, tokens.get(other.conceptId)!);
        if (sim >= DUPLICATE_SIMILARITY) {
          recs.push({ kind: 'duplicate_concept', conceptId: node.conceptId, detail: `"${node.title}" looks like a duplicate of "${other.title}" (title overlap ${(sim * 100).toFixed(0)}%).`, confidence: Math.min(0.9, sim), related: [other.conceptId] });
        }
      }
    }

    const summary: Record<GraphIssueKind, number> = {
      duplicate_concept: 0, missing_reciprocal: 0, isolated_concept: 0, weak_region: 0, dangling_edge: 0,
    };
    for (const r of recs) summary[r.kind]++;

    return { scanned: nodes.length, recommendations: recs, summary };
  }

  /**
   * Convenience scan that loads nodes via an injected loader then analyzes them (guarded). Never
   * mutates. The loader is supplied by the caller (e.g. a paginated read of the knowledge_graph
   * collection); defaults to an empty set so this is safe to call without wiring.
   */
  async scan(loadNodes: () => Promise<ConceptNode[]> = async () => []): Promise<GraphEvolutionReport> {
    let nodes: ConceptNode[] = [];
    try { nodes = await loadNodes(); } catch { nodes = []; }
    return this.analyze(nodes);
  }
}

export const graphEvolutionService = new GraphEvolutionService();
