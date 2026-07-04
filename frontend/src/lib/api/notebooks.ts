import { api } from './client';
import { Notebook, DocumentSource, LearningAsset, KGNode, KGEdge } from '../../types';

export const notebooksApi = {
  async getNotebooks(): Promise<Notebook[]> {
    const response = await api.get('/notebooks');
    return response.data;
  },

  async createNotebook(title: string, color: string): Promise<Notebook> {
    const response = await api.post('/notebooks', { title, color });
    return response.data;
  },

  async deleteNotebook(notebookId: string): Promise<void> {
    await api.delete(`/notebooks/${notebookId}`);
  },

  async getSources(notebookId: string): Promise<DocumentSource[]> {
    const response = await api.get(`/notebooks/${notebookId}/sources`);
    return response.data;
  },

  async uploadSource(notebookId: string, file: File): Promise<DocumentSource> {
    const formData = new FormData();
    formData.append('file', file);
    const response = await api.post(`/notebooks/${notebookId}/sources`, formData, {
      headers: {
        'Content-Type': 'multipart/form-data'
      }
    });
    return response.data;
  },

  async getAssets(notebookId: string): Promise<LearningAsset[]> {
    const response = await api.get(`/notebooks/${notebookId}/assets`);
    return response.data;
  },

  async getGraph(notebookId: string): Promise<{ nodes: KGNode[], edges: KGEdge[] }> {
    const response = await api.get(`/notebooks/${notebookId}/graph`);
    return response.data;
  }
};
