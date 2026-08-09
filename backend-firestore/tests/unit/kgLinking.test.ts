import { cosineSimilarity, dedupeEdges, CandidateEdge } from '../../src/utils/kgSimilarity';

describe('cosineSimilarity', () => {
  it('is 1 for identical vectors', () => {
    expect(cosineSimilarity([1, 2, 3], [1, 2, 3])).toBeCloseTo(1, 6);
  });
  it('is 0 for orthogonal vectors', () => {
    expect(cosineSimilarity([1, 0], [0, 1])).toBeCloseTo(0, 6);
  });
  it('is ~ -1 for opposite vectors', () => {
    expect(cosineSimilarity([1, 1], [-1, -1])).toBeCloseTo(-1, 6);
  });
  it('returns 0 for empty or mismatched-length inputs', () => {
    expect(cosineSimilarity([], [])).toBe(0);
    expect(cosineSimilarity([1, 2, 3], [1, 2])).toBe(0);
    expect(cosineSimilarity([0, 0], [1, 1])).toBe(0);
  });
});

describe('dedupeEdges', () => {
  it('lets a typed (LLM) edge win over a similarity edge on the same pair', () => {
    const edges: CandidateEdge[] = [
      { sourceNodeId: 'a', targetNodeId: 'b', relationshipType: 'RELATED_TO', confidence: 0.95, layer: 'similarity' },
      { sourceNodeId: 'a', targetNodeId: 'b', relationshipType: 'PREREQUISITE_OF', confidence: 0.7, layer: 'llm' },
    ];
    const out = dedupeEdges(edges);
    expect(out).toHaveLength(1);
    expect(out[0].relationshipType).toBe('PREREQUISITE_OF');
  });

  it('treats reversed pairs as the same undirected pair (one edge kept)', () => {
    const edges: CandidateEdge[] = [
      { sourceNodeId: 'a', targetNodeId: 'b', relationshipType: 'RELATED_TO', confidence: 0.9, layer: 'similarity' },
      { sourceNodeId: 'b', targetNodeId: 'a', relationshipType: 'RELATED_TO', confidence: 0.8, layer: 'similarity' },
    ];
    const out = dedupeEdges(edges);
    expect(out).toHaveLength(1);
    expect(out[0].confidence).toBe(0.9); // higher-confidence one wins
  });

  it('keeps the higher-confidence typed edge among competing typed edges', () => {
    const edges: CandidateEdge[] = [
      { sourceNodeId: 'x', targetNodeId: 'y', relationshipType: 'CAUSES', confidence: 0.65, layer: 'llm' },
      { sourceNodeId: 'x', targetNodeId: 'y', relationshipType: 'USES', confidence: 0.9, layer: 'llm' },
    ];
    const out = dedupeEdges(edges);
    expect(out).toHaveLength(1);
    expect(out[0].relationshipType).toBe('USES');
  });

  it('drops self-loops', () => {
    const edges: CandidateEdge[] = [
      { sourceNodeId: 'a', targetNodeId: 'a', relationshipType: 'RELATED_TO', confidence: 1, layer: 'similarity' },
    ];
    expect(dedupeEdges(edges)).toHaveLength(0);
  });

  it('keeps distinct pairs', () => {
    const edges: CandidateEdge[] = [
      { sourceNodeId: 'a', targetNodeId: 'b', relationshipType: 'RELATED_TO', confidence: 0.9, layer: 'similarity' },
      { sourceNodeId: 'c', targetNodeId: 'd', relationshipType: 'PART_OF', confidence: 0.8, layer: 'llm' },
    ];
    expect(dedupeEdges(edges)).toHaveLength(2);
  });
});
