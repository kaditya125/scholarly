import { v4 as uuidv4 } from 'uuid';
import { notebookRepository } from '../repositories/notebook.repository';
import { publishedAssetsRepository, PublishedAsset } from '../repositories/publishedAssets.repository';

export class PublishedAssetsService {
  async publishAsset(
    userId: string,
    userName: string,
    assetId: string,
    notebookId: string,
    subject?: string,
    exam?: string
  ): Promise<PublishedAsset> {
    // Fetch the original asset from the notebook's assets subcollection
    const assets = await notebookRepository.getLearningAssets(notebookId);
    const originalAsset = assets.find(a => a.id === assetId);

    if (!originalAsset) {
      throw new Error('Asset not found in notebook');
    }

    if (originalAsset.userId !== userId) {
      throw new Error('Unauthorized: You can only publish your own assets');
    }

    // Clone as a published asset with community fields
    const publishedAsset: PublishedAsset = {
      ...originalAsset,
      id: uuidv4(), // New ID for the published copy
      isPublic: true,
      authorId: userId,
      authorName: userName,
      subject,
      exam,
      aiModel: originalAsset.aiModel || 'gemini-1.5-pro',
      rating: 0,
      ratingCount: 0,
      downloads: 0,
      bookmarks: 0,
      reports: 0,
      publishedAt: Date.now(),
    };

    await publishedAssetsRepository.publishAsset(publishedAsset);
    return publishedAsset;
  }

  async getPublishedAssets(filters?: { type?: string; subject?: string; exam?: string; minRating?: number }): Promise<PublishedAsset[]> {
    return publishedAssetsRepository.getPublishedAssets(filters);
  }

  async rateAsset(assetId: string, rating: number): Promise<void> {
    if (rating < 1 || rating > 5) {
      throw new Error('Rating must be between 1 and 5');
    }
    await publishedAssetsRepository.rateAsset(assetId, rating);
  }

  async downloadAsset(assetId: string): Promise<PublishedAsset> {
    const asset = await publishedAssetsRepository.getPublishedAsset(assetId);
    if (!asset) {
      throw new Error('Asset not found');
    }
    await publishedAssetsRepository.incrementDownloads(assetId);
    return asset;
  }

  async getAssetsByAuthor(authorId: string): Promise<PublishedAsset[]> {
    return publishedAssetsRepository.getAssetsByAuthor(authorId);
  }
}

export const publishedAssetsService = new PublishedAssetsService();
