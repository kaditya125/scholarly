import { GraphRepository } from '../repositories/graph.repository';
import { KGNode, KGEdge } from '../types';

export class GraphService {
  private repository = new GraphRepository();

  async getGraph(notebookId: string, limit?: number) {
    const [nodes, edges] = await Promise.all([
      this.repository.getNodes(notebookId, limit),
      this.repository.getEdges(notebookId, limit)
    ]);
    return { nodes, edges };
  }

  async searchNodes(notebookId: string, query: string) {
    return this.repository.searchNodes(notebookId, query);
  }

  async getGraphStats(notebookId: string) {
    const nodes = await this.repository.getNodes(notebookId, 5000);
    const totalConcepts = nodes.length;
    const mastered = nodes.filter(n => n.masteryPercentage >= 80).length;
    const weak = nodes.filter(n => n.masteryPercentage < 40).length;
    const revisionPending = nodes.filter(n => n.revisionStatus === 'DUE' || n.revisionStatus === 'OVERDUE').length;

    const avgMastery = nodes.length > 0 ? nodes.reduce((acc, n) => acc + n.masteryPercentage, 0) / nodes.length : 0;

    return {
      totalConcepts,
      masteredConcepts: mastered,
      weakConcepts: weak,
      revisionPending,
      averageMastery: Math.round(avgMastery)
    };
  }

  async generateLearningPath(notebookId: string, targetNodeId: string): Promise<KGNode[]> {
    // Mock BFS traversal to generate a path of prerequisites
    const allNodes = await this.repository.getNodes(notebookId);
    const path: KGNode[] = [];
    let current = allNodes.find(n => n.id === targetNodeId);
    
    // Safety break
    let count = 0;
    while (current && count < 10) {
      path.unshift(current); // prepend
      if (current.prerequisites && current.prerequisites.length > 0) {
        current = allNodes.find(n => n.id === current!.prerequisites![0]);
      } else {
        current = undefined;
      }
      count++;
    }
    
    return path;
  }
}
