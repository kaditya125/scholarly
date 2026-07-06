import { db } from '../config/firebase';
import { KGNode, KGEdge } from '../types';

export class GraphRepository {
  async getNodes(notebookId: string, limit: number = 1000): Promise<KGNode[]> {
    const snapshot = await db.collection('notebooks')
      .doc(notebookId)
      .collection('graph_nodes')
      .limit(limit)
      .get();
      
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as KGNode));
  }

  async getEdges(notebookId: string, limit: number = 1000): Promise<KGEdge[]> {
    const snapshot = await db.collection('notebooks')
      .doc(notebookId)
      .collection('graph_edges')
      .limit(limit)
      .get();
      
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as KGEdge));
  }

  async searchNodes(notebookId: string, query: string): Promise<KGNode[]> {
    // In production, use Algolia/Pinecone. For now, simple text match mock
    const nodes = await this.getNodes(notebookId);
    const q = query.toLowerCase();
    return nodes.filter(n => 
      n.label.toLowerCase().includes(q) || 
      n.definition.toLowerCase().includes(q)
    );
  }

  async updateNode(notebookId: string, nodeId: string, updates: Partial<KGNode>): Promise<void> {
    await db.collection('notebooks')
      .doc(notebookId)
      .collection('graph_nodes')
      .doc(nodeId)
      .update(updates);
  }

  /**
   * Global aggregate stats across ALL notebooks' knowledge graphs (admin view).
   * KG nodes/edges are written to the `kg_nodes`/`kg_edges` subcollections during ingestion,
   * so a collectionGroup query aggregates them platform-wide.
   */
  async getGlobalStats(): Promise<{ totalNodes: number; totalEdges: number }> {
    const [nodesAgg, edgesAgg] = await Promise.all([
      db.collectionGroup('kg_nodes').count().get(),
      db.collectionGroup('kg_edges').count().get(),
    ]);
    return {
      totalNodes: nodesAgg.data().count,
      totalEdges: edgesAgg.data().count,
    };
  }

  /** A bounded sample of KG nodes across all notebooks for the admin table. */
  async getRecentNodesGlobal(limit: number = 100): Promise<KGNode[]> {
    const snapshot = await db.collectionGroup('kg_nodes').limit(limit).get();
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as KGNode));
  }

  /** A bounded sample of KG edges across all notebooks for the admin visualizer. */
  async getGlobalEdges(limit: number = 200): Promise<KGEdge[]> {
    const snapshot = await db.collectionGroup('kg_edges').limit(limit).get();
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as KGEdge));
  }
}
