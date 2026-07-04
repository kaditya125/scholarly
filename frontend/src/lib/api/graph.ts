import { api } from './client';

export interface GraphNode {
  id: string;
  label: string;
  type: string;
  description?: string;
}

export interface GraphEdge {
  source: string;
  target: string;
  label: string;
}

export interface GraphData {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

export const graphApi = {
  async getGraph(): Promise<GraphData> {
    const response = await api.get('/graph/nodes');
    return response.data;
  }
};
