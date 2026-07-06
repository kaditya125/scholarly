import { api } from './client';

export const publishedAssetsApi = {
  async getAssets(filters?: { type?: string; subject?: string; exam?: string }): Promise<any[]> {
    const response = await api.get('/explore', { params: filters });
    return response.data;
  },
  
  async publishAsset(data: { assetId: string; notebookId: string; subject?: string; exam?: string }): Promise<any> {
    const response = await api.post('/explore/publish', data);
    return response.data;
  },

  async rateAsset(assetId: string, rating: number): Promise<void> {
    await api.post(`/explore/${assetId}/rate`, { rating });
  },

  async downloadAsset(assetId: string): Promise<any> {
    const response = await api.post(`/explore/${assetId}/download`);
    return response.data;
  }
};
