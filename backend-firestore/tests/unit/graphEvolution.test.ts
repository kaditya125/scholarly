import { GraphEvolutionService } from '../../src/core/intelligence/GraphEvolutionService';
import { ConceptNode } from '../../src/core/interfaces/IGraphProvider';

function node(over: Partial<ConceptNode> & { conceptId: string; title: string }): ConceptNode {
  return {
    description: '', prerequisites: [], childTopics: [], relatedConcepts: [], crossReferences: [], ...over,
  } as ConceptNode;
}

describe('GraphEvolutionService (read-only, pure)', () => {
  const svc = new GraphEvolutionService();

  it('flags isolated concepts (no edges)', () => {
    const r = svc.analyze([node({ conceptId: 'a', title: 'Photosynthesis' })]);
    expect(r.recommendations.find((x) => x.kind === 'isolated_concept')).toBeDefined();
    expect(r.summary.isolated_concept).toBe(1);
  });

  it('flags weak regions (very few edges)', () => {
    const r = svc.analyze([
      node({ conceptId: 'a', title: 'A', relatedConcepts: ['b'] }),
      node({ conceptId: 'b', title: 'B', relatedConcepts: ['a'] }),
    ]);
    expect(r.recommendations.some((x) => x.kind === 'weak_region')).toBe(true);
  });

  it('flags dangling edges pointing to missing concepts', () => {
    const r = svc.analyze([node({ conceptId: 'a', title: 'A', prerequisites: ['ghost1', 'ghost2'] })]);
    const dangling = r.recommendations.find((x) => x.kind === 'dangling_edge');
    expect(dangling).toBeDefined();
    expect(dangling!.related).toEqual(expect.arrayContaining(['ghost1', 'ghost2']));
  });

  it('flags missing reciprocal relationships', () => {
    const r = svc.analyze([
      node({ conceptId: 'a', title: 'A', relatedConcepts: ['b'] }),
      node({ conceptId: 'b', title: 'B', relatedConcepts: [] }),
    ]);
    const rec = r.recommendations.find((x) => x.kind === 'missing_reciprocal' && x.conceptId === 'a');
    expect(rec).toBeDefined();
    expect(rec!.related).toEqual(['b']);
  });

  it('does NOT flag a reciprocal pair', () => {
    const r = svc.analyze([
      node({ conceptId: 'a', title: 'A', relatedConcepts: ['b'] }),
      node({ conceptId: 'b', title: 'B', relatedConcepts: ['a'] }),
    ]);
    expect(r.recommendations.some((x) => x.kind === 'missing_reciprocal')).toBe(false);
  });

  it('flags duplicate concepts by title similarity', () => {
    const r = svc.analyze([
      node({ conceptId: 'a', title: 'Newton Second Law of Motion', relatedConcepts: ['b'] }),
      node({ conceptId: 'b', title: 'Second Law of Motion Newton', relatedConcepts: ['a'] }),
    ]);
    const dup = r.recommendations.find((x) => x.kind === 'duplicate_concept');
    expect(dup).toBeDefined();
    expect(dup!.related).toContain('b');
  });

  it('does not flag distinct titles as duplicates', () => {
    const r = svc.analyze([
      node({ conceptId: 'a', title: 'Photosynthesis', relatedConcepts: ['b'] }),
      node({ conceptId: 'b', title: 'Cellular Respiration', relatedConcepts: ['a'] }),
    ]);
    expect(r.recommendations.some((x) => x.kind === 'duplicate_concept')).toBe(false);
  });

  it('scan() is guarded and returns an empty report when the loader throws', async () => {
    const r = await svc.scan(async () => { throw new Error('db down'); });
    expect(r.scanned).toBe(0);
    expect(r.recommendations).toEqual([]);
  });

  it('scan() analyzes loaded nodes', async () => {
    const r = await svc.scan(async () => [node({ conceptId: 'x', title: 'X' })]);
    expect(r.scanned).toBe(1);
    expect(r.summary.isolated_concept).toBe(1);
  });
});
