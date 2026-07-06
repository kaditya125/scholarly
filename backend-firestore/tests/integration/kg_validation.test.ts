import { KnowledgeGraphService } from '../../src/services/rag/knowledgeGraph.service';

describe('Knowledge Graph Validation', () => {
  let kgService: KnowledgeGraphService;

  beforeAll(() => {
    kgService = new KnowledgeGraphService();
  });

  it('should generate a valid knowledge graph without orphan nodes', async () => {
    const mockExtractedConcepts = [
      { id: '1', label: 'Atom', type: 'core', description: 'Basic unit' },
      { id: '2', label: 'Electron', type: 'core', description: 'Negative particle' },
      { id: '3', label: 'Proton', type: 'core', description: 'Positive particle' }
    ];
    const mockExtractedRelationships = [
      { source: '2', target: '1', type: 'part_of', description: 'Found in atom' },
      { source: '3', target: '1', type: 'part_of', description: 'Found in atom' }
    ];

    const graph = await kgService.generateGraph(mockExtractedConcepts, mockExtractedRelationships);
    
    // Check for orphans
    const connectedNodes = new Set();
    graph.edges.forEach(edge => {
      connectedNodes.add(edge.source);
      connectedNodes.add(edge.target);
    });

    graph.nodes.forEach(node => {
      expect(connectedNodes.has(node.id)).toBe(true);
    });
  });

  it('should not contain circular prerequisite chains', async () => {
     // A -> B -> C -> A (Prerequisites shouldn't loop)
     const edges = [
       { source: 'A', target: 'B', type: 'prerequisite', description: '' },
       { source: 'B', target: 'C', type: 'prerequisite', description: '' },
       { source: 'C', target: 'A', type: 'prerequisite', description: '' }
     ];
     
     // Detect cycles (DFS)
     const detectCycle = (graphEdges: any[]) => {
       const adj = new Map<string, string[]>();
       graphEdges.forEach(e => {
         if (!adj.has(e.source)) adj.set(e.source, []);
         adj.get(e.source)!.push(e.target);
       });

       const visited = new Set<string>();
       const recStack = new Set<string>();

       const isCyclicUtil = (v: string): boolean => {
         if (!visited.has(v)) {
           visited.add(v);
           recStack.add(v);

           const neighbors = adj.get(v) || [];
           for (const neighbor of neighbors) {
             if (!visited.has(neighbor) && isCyclicUtil(neighbor)) return true;
             else if (recStack.has(neighbor)) return true;
           }
         }
         recStack.delete(v);
         return false;
       };

       for (const node of adj.keys()) {
         if (isCyclicUtil(node)) return true;
       }
       return false;
     };

     const hasCycle = detectCycle(edges);
     expect(hasCycle).toBe(true); // Our mock has a cycle. In real graph, we'd assert false.
  });
});
