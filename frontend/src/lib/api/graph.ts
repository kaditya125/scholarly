import { api } from './client';
import { KGNode, KGEdge } from '../../types';

export interface GraphData {
  nodes: KGNode[];
  edges: KGEdge[];
}

export const graphApi = {
  async getGraph(notebookId: string): Promise<GraphData> {
    const response = await api.get(`/notebooks/${notebookId}/graph`);
    return response.data;
  },
  
  async searchNodes(notebookId: string, query: string): Promise<KGNode[]> {
    const response = await api.get(`/notebooks/${notebookId}/graph/search?q=${encodeURIComponent(query)}`);
    return response.data;
  },
  
  async getGraphStats(notebookId: string) {
    const response = await api.get(`/notebooks/${notebookId}/graph/stats`);
    return response.data;
  },
  
  async getLearningPath(notebookId: string, targetNodeId: string): Promise<KGNode[]> {
    const response = await api.get(`/notebooks/${notebookId}/graph/path/${targetNodeId}`);
    return response.data;
  }
};
