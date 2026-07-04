import { adminDb } from '../config/firebase';
import { Notebook, DocumentSource, TimelineEvent, LearningAsset } from '../types';
import { FieldValue } from 'firebase-admin/firestore';

export class NotebookRepository {
  private collection = adminDb.collection('notebooks');

  async createNotebook(notebook: Notebook): Promise<void> {
    await this.collection.doc(notebook.id).set(notebook);
  }

  async getNotebooksByUser(userId: string): Promise<Notebook[]> {
    const snapshot = await this.collection.where('userId', '==', userId).orderBy('updatedAt', 'desc').get();
    return snapshot.docs.map(doc => doc.data() as Notebook);
  }

  async getNotebook(id: string): Promise<Notebook | null> {
    const doc = await this.collection.doc(id).get();
    return doc.exists ? (doc.data() as Notebook) : null;
  }

  async updateNotebook(id: string, updates: Partial<Notebook>): Promise<void> {
    await this.collection.doc(id).update({
      ...updates,
      updatedAt: Date.now()
    });
  }

  async deleteNotebook(id: string): Promise<void> {
    await this.collection.doc(id).delete();
    // In production, we'd also delete subcollections (sources, assets, timeline) here or via Cloud Functions
  }

  // --- Document Sources ---
  
  async addSource(source: DocumentSource): Promise<void> {
    await this.collection.doc(source.notebookId).collection('sources').doc(source.id).set(source);
    await this.incrementStat(source.notebookId, 'documentCount');
  }

  async getSources(notebookId: string): Promise<DocumentSource[]> {
    const snapshot = await this.collection.doc(notebookId).collection('sources').orderBy('createdAt', 'desc').get();
    return snapshot.docs.map(doc => doc.data() as DocumentSource);
  }

  async updateSource(notebookId: string, sourceId: string, updates: Partial<DocumentSource>): Promise<void> {
    await this.collection.doc(notebookId).collection('sources').doc(sourceId).update(updates);
  }

  // --- Timeline ---

  async addTimelineEvent(event: TimelineEvent): Promise<void> {
    await this.collection.doc(event.notebookId).collection('timeline').doc(event.id).set(event);
  }

  async getTimeline(notebookId: string): Promise<TimelineEvent[]> {
    const snapshot = await this.collection.doc(notebookId).collection('timeline').orderBy('timestamp', 'desc').get();
    return snapshot.docs.map(doc => doc.data() as TimelineEvent);
  }

  // --- Learning Assets ---

  async addLearningAsset(asset: LearningAsset): Promise<void> {
    await this.collection.doc(asset.notebookId).collection('assets').doc(asset.id).set(asset);
    
    // Update appropriate stat based on asset type
    if (asset.type === 'FLASHCARDS') {
      await this.incrementStat(asset.notebookId, 'flashcardsCount');
    } else if (asset.type === 'QUIZ') {
      await this.incrementStat(asset.notebookId, 'quizCount');
    }
  }

  async getLearningAssets(notebookId: string, type?: string): Promise<LearningAsset[]> {
    let query: any = this.collection.doc(notebookId).collection('assets');
    if (type) {
      query = query.where('type', '==', type);
    }
    const snapshot = await query.orderBy('createdAt', 'desc').get();
    return snapshot.docs.map((doc: any) => doc.data() as LearningAsset);
  }

  private async incrementStat(notebookId: string, statKey: string, amount: number = 1) {
    await this.collection.doc(notebookId).update({
      [`stats.${statKey}`]: FieldValue.increment(amount),
      updatedAt: Date.now()
    });
  }
}

export const notebookRepository = new NotebookRepository();
