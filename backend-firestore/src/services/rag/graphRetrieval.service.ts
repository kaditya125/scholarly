import { cacheService } from '../cache.service';
import { notebookRepository } from '../../repositories/notebook.repository';
import { KGNode, KGEdge } from '../../types';

/**
 * GraphRetrievalService — Phase 1 of Hybrid GraphRAG
 *
 * Wires the notebook-scoped Knowledge Graph (kg_nodes / kg_edges) into the
 * retrieval pipeline. This service is deliberately:
 *   - Notebook-scoped: it only ever reads a single notebook's subcollections,
 *     so graph traversal can never cross into another user's data.
 *   - Zero-Gemini: concept matching + neighborhood expansion are pure
 *     Firestore reads + string ops. No LLM calls are ever made here.
 *   - Cached: the whole notebook graph is loaded once and cached (10 min),
 *     so repeated queries against the same notebook are effectively free.
 *
 * It returns a compact, fused context string (concepts + relationships +
 * real definitions) that is injected into the RAG context, plus a set of
 * `expansionTerms` that Phase 2 will use for graph-assisted query expansion.
 */

const GRAPH_CACHE_TTL_SECONDS = 600; // 10 minutes

// Common English + physics stop words that add no matching signal.
const STOP_WORDS = new Set([
  'what', 'which', 'when', 'where', 'whom', 'whose', 'that', 'this', 'these',
  'those', 'there', 'here', 'about', 'between', 'into', 'from', 'with', 'without',
  'they', 'them', 'their', 'then', 'than', 'have', 'does', 'doing', 'done',
  'will', 'would', 'should', 'could', 'shall', 'must', 'been', 'being', 'were',
  'your', 'yours', 'mine', 'ours', 'explain', 'describe', 'define', 'definition',
  'tell', 'give', 'show', 'find', 'want', 'need', 'know', 'understand', 'please',
  'difference', 'differences', 'compare', 'comparison', 'versus', 'relationship',
  'related', 'concept', 'concepts', 'topic', 'topics', 'question', 'answer',
]);

// Priority ordering for relationship types when we can only keep a few neighbors
// per concept. Prerequisite / structural links are more useful than generic
// RELATED_TO for teaching, so they surface first.
const REL_PRIORITY: Record<string, number> = {
  PREREQUISITE_OF: 0,
  PART_OF: 1,
  OPPOSITE_OF: 2,
  RELATED_TO: 3,
};

// Human-readable phrasing for each relationship type (source -> target).
const REL_PHRASE: Record<string, string> = {
  PREREQUISITE_OF: 'is a prerequisite for',
  PART_OF: 'is part of',
  OPPOSITE_OF: 'is the opposite of',
  RELATED_TO: 'is related to',
};

interface AdjacencyEntry {
  edge: KGEdge;
  otherId: string;
}

interface LoadedGraph {
  nodes: KGNode[];
  byId: Map<string, KGNode>;
  adjacency: Map<string, AdjacencyEntry[]>;
  degree: Map<string, number>;
}

export interface GraphContextResult {
  /** Concepts whose labels matched the query. */
  matched: { id: string; label: string }[];
  /** Concept labels (matched + neighbors) usable for query expansion (Phase 2). */
  expansionTerms: string[];
  /** Fused, human-readable graph context ready to inject into the prompt. */
  contextString: string;
  nodeCount: number;
  edgeCount: number;
  traversalMs: number;
}

export interface GraphContextOptions {
  /** Max query-matched concepts to anchor on. Default 4. */
  maxConcepts?: number;
  /** Max neighbors to include per matched concept. Default 6. */
  maxNeighborsPerConcept?: number;
}

const EMPTY_RESULT: GraphContextResult = {
  matched: [],
  expansionTerms: [],
  contextString: '',
  nodeCount: 0,
  edgeCount: 0,
  traversalMs: 0,
};

/**
 * Definitions that are placeholders rather than real explanations. We only
 * surface a node's definition in context when it carries actual meaning, to
 * avoid polluting the prompt with boilerplate.
 */
function isGenericDefinition(def: string | undefined): boolean {
  if (!def) return true;
  const d = def.trim();
  if (d.length < 12) return true;
  const lower = d.toLowerCase();
  return (
    lower.startsWith('key term from') ||
    lower.startsWith('formula:') ||
    lower.startsWith('notable person') ||
    lower.startsWith('important place') ||
    lower.startsWith('significant event') ||
    lower === 'no definition available.' ||
    lower === 'no definition available'
  );
}

export class GraphRetrievalService {
  private tokenize(text: string): string[] {
    return (text || '')
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((w) => w.length >= 4 && !STOP_WORDS.has(w));
  }

  /**
   * Loads a single notebook's graph (nodes + edges) and builds in-memory
   * lookup structures. Cached for GRAPH_CACHE_TTL_SECONDS. Only the raw arrays
   * are cached (Maps do not serialize); the lookup maps are rebuilt per call,
   * which is cheap relative to the Firestore reads.
   */
  private async loadGraph(notebookId: string): Promise<LoadedGraph> {
    const cacheKey = `kg:graph:${notebookId}`;
    let raw = await cacheService.get<{ nodes: KGNode[]; edges: KGEdge[] }>(cacheKey);

    if (!raw) {
      const [nodes, edges] = await Promise.all([
        notebookRepository.getKGNodes(notebookId),
        notebookRepository.getKGEdges(notebookId),
      ]);
      raw = { nodes: nodes || [], edges: edges || [] };
      await cacheService.set(cacheKey, raw, GRAPH_CACHE_TTL_SECONDS);
    }

    const byId = new Map<string, KGNode>();
    for (const n of raw.nodes) byId.set(n.id, n);

    const adjacency = new Map<string, AdjacencyEntry[]>();
    const degree = new Map<string, number>();

    for (const e of raw.edges) {
      // Skip self-loops and edges that reference missing nodes.
      if (e.sourceNodeId === e.targetNodeId) continue;
      if (!byId.has(e.sourceNodeId) || !byId.has(e.targetNodeId)) continue;

      if (!adjacency.has(e.sourceNodeId)) adjacency.set(e.sourceNodeId, []);
      if (!adjacency.has(e.targetNodeId)) adjacency.set(e.targetNodeId, []);
      adjacency.get(e.sourceNodeId)!.push({ edge: e, otherId: e.targetNodeId });
      adjacency.get(e.targetNodeId)!.push({ edge: e, otherId: e.sourceNodeId });

      degree.set(e.sourceNodeId, (degree.get(e.sourceNodeId) || 0) + 1);
      degree.set(e.targetNodeId, (degree.get(e.targetNodeId) || 0) + 1);
    }

    return { nodes: raw.nodes, byId, adjacency, degree };
  }

  /**
   * Rule-based concept matching: score each node by how many query tokens
   * overlap its label, with small boosts for importance and connectivity so
   * that, among ties, the more central/authoritative concept wins.
   */
  private matchConcepts(query: string, g: LoadedGraph, limit: number): KGNode[] {
    const queryTokens = new Set(this.tokenize(query));
    if (queryTokens.size === 0) return [];

    const scored: { node: KGNode; score: number }[] = [];
    for (const node of g.nodes) {
      const labelTokens = this.tokenize(node.label);
      if (labelTokens.length === 0) continue;

      let overlap = 0;
      for (const t of labelTokens) {
        if (queryTokens.has(t)) overlap++;
      }
      if (overlap === 0) continue;

      const importance = node.importance || 0;
      const degree = g.degree.get(node.id) || 0;
      // Overlap dominates; importance and degree are gentle tie-breakers.
      const score = overlap * 10 + importance + Math.min(degree, 20) * 0.1;
      scored.push({ node, score });
    }

    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, limit).map((s) => s.node);
  }

  /**
   * Retrieves graph context for a query within a single notebook.
   * Anchors on the best-matching concepts, expands one hop to their most
   * useful neighbors, and formats a compact context block. Never throws:
   * on any failure or empty graph it returns an empty (harmless) result so
   * the caller can fall back to vector-only retrieval.
   */
  async getGraphContext(
    notebookId: string,
    query: string,
    opts?: GraphContextOptions
  ): Promise<GraphContextResult> {
    const t0 = Date.now();
    if (!notebookId || !query || !query.trim()) return { ...EMPTY_RESULT };

    let g: LoadedGraph;
    try {
      g = await this.loadGraph(notebookId);
    } catch (err) {
      console.warn(`[GraphRetrieval] load failed for ${notebookId}:`, err);
      return { ...EMPTY_RESULT, traversalMs: Date.now() - t0 };
    }

    if (g.nodes.length === 0) {
      return { ...EMPTY_RESULT, traversalMs: Date.now() - t0 };
    }

    const maxConcepts = opts?.maxConcepts ?? 4;
    const maxNeighbors = opts?.maxNeighborsPerConcept ?? 6;

    const matched = this.matchConcepts(query, g, maxConcepts);
    if (matched.length === 0) {
      return {
        ...EMPTY_RESULT,
        nodeCount: g.nodes.length,
        traversalMs: Date.now() - t0,
      };
    }

    const expansionSet = new Set<string>();
    const lines: string[] = [];
    let edgeCount = 0;

    for (const concept of matched) {
      expansionSet.add(concept.label);

      const neighbors = (g.adjacency.get(concept.id) || [])
        .slice()
        .sort((a, b) => {
          const pa = REL_PRIORITY[a.edge.relationshipType] ?? 9;
          const pb = REL_PRIORITY[b.edge.relationshipType] ?? 9;
          if (pa !== pb) return pa - pb;
          return (b.edge.confidence || 0) - (a.edge.confidence || 0);
        })
        .slice(0, maxNeighbors);

      const relDescriptions: string[] = [];
      for (const nb of neighbors) {
        const other = g.byId.get(nb.otherId);
        if (!other) continue;
        expansionSet.add(other.label);

        // Orient the phrase so it reads correctly relative to the anchor concept.
        const phrase = REL_PHRASE[nb.edge.relationshipType] || 'is related to';
        const forward = nb.edge.sourceNodeId === concept.id;
        if (forward) {
          relDescriptions.push(`${phrase} ${other.label}`);
        } else {
          // Reverse direction: e.g. anchor is the target of "A PREREQUISITE_OF anchor"
          if (nb.edge.relationshipType === 'PREREQUISITE_OF') {
            relDescriptions.push(`has prerequisite ${other.label}`);
          } else if (nb.edge.relationshipType === 'PART_OF') {
            relDescriptions.push(`contains ${other.label}`);
          } else {
            relDescriptions.push(`${phrase} ${other.label}`);
          }
        }
      }
      edgeCount += relDescriptions.length;

      const definition =
        concept.definition && !isGenericDefinition(concept.definition)
          ? ` — ${concept.definition.trim()}`
          : '';
      const relPart = relDescriptions.length
        ? `\n    relationships: ${relDescriptions.join('; ')}`
        : '';
      lines.push(`• ${concept.label} [${concept.type}]${definition}${relPart}`);
    }

    const contextString = `Concepts and relationships from this notebook's knowledge graph relevant to the question:\n${lines.join('\n')}`;
    const expansionTerms = Array.from(expansionSet).slice(0, 15);

    return {
      matched: matched.map((m) => ({ id: m.id, label: m.label })),
      expansionTerms,
      contextString,
      nodeCount: g.nodes.length,
      edgeCount,
      traversalMs: Date.now() - t0,
    };
  }

  /**
   * Invalidates the cached graph for a notebook. Call this after ingestion
   * rewrites kg_nodes / kg_edges so the next query reloads fresh data.
   */
  async invalidate(notebookId: string): Promise<void> {
    await cacheService.del(`kg:graph:${notebookId}`);
  }
}

export const graphRetrievalService = new GraphRetrievalService();
