import { db } from '../config/firebase';
import { LearningAsset } from '../types';

export interface PublishedAsset extends LearningAsset {
  isPublic: boolean;
  authorId: string;
  authorName: string;
  subject?: string;
  exam?: string;
  aiModel?: string;
  rating: number;
  ratingCount: number;
  downloads: number;
  bookmarks: number;
  reports: number;
  publishedAt: number;
}

export class PublishedAssetsRepository {
  private collection = db.collection('published_assets');

  async publishAsset(asset: PublishedAsset): Promise<void> {
    await this.collection.doc(asset.id).set(asset);
  }

  async getPublishedAsset(assetId: string): Promise<PublishedAsset | null> {
    const doc = await this.collection.doc(assetId).get();
    if (!doc.exists) return null;
    return doc.data() as PublishedAsset;
  }

  async getPublishedAssets(filters?: { type?: string; subject?: string; exam?: string; minRating?: number }): Promise<PublishedAsset[]> {
    let query: any = this.collection.where('isPublic', '==', true);
    if (filters?.type) query = query.where('type', '==', filters.type);
    if (filters?.subject) query = query.where('subject', '==', filters.subject);
    if (filters?.exam) query = query.where('exam', '==', filters.exam);
    const snapshot = await query.orderBy('publishedAt', 'desc').limit(50).get();
    return snapshot.docs.map((doc: any) => doc.data() as PublishedAsset);
  }

  async rateAsset(assetId: string, rating: number): Promise<void> {
    const doc = await this.collection.doc(assetId).get();
    if (!doc.exists) throw new Error('Asset not found');
    const asset = doc.data() as PublishedAsset;
    const newCount = asset.ratingCount + 1;
    const newRating = ((asset.rating * asset.ratingCount) + rating) / newCount;
    await this.collection.doc(assetId).update({ rating: newRating, ratingCount: newCount });
  }

  async incrementDownloads(assetId: string): Promise<void> {
    const { FieldValue } = require('firebase-admin/firestore');
    await this.collection.doc(assetId).update({ downloads: FieldValue.increment(1) });
  }

  async getAssetsByAuthor(authorId: string): Promise<PublishedAsset[]> {
    const snapshot = await this.collection.where('authorId', '==', authorId).orderBy('publishedAt', 'desc').get();
    return snapshot.docs.map((doc: any) => doc.data() as PublishedAsset);
  }
}

export const publishedAssetsRepository = new PublishedAssetsRepository();
