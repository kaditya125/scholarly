import { api } from './client';
import { LearningAsset } from '../../types';

export const assetsApi = {
  async updateAsset(notebookId: string, assetId: string, updates: Partial<LearningAsset>): Promise<void> {
    await api.put(`/notebooks/${notebookId}/assets/${assetId}`, updates);
  },

  async deleteAsset(notebookId: string, assetId: string): Promise<void> {
    await api.delete(`/notebooks/${notebookId}/assets/${assetId}`);
  },

  async duplicateAsset(notebookId: string, assetId: string): Promise<LearningAsset> {
    const response = await api.post(`/notebooks/${notebookId}/assets/${assetId}/duplicate`);
    return response.data;
  },

  async regenerateAsset(notebookId: string, assetId: string, instruction: string): Promise<LearningAsset> {
    const response = await api.post(`/notebooks/${notebookId}/assets/${assetId}/regenerate`, { instruction });
    return response.data;
  }
};
