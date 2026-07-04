import { db } from '../config/firebase';
import { DocumentSource } from '../types';
import { FieldValue } from 'firebase-admin/firestore';

export class SourceRepository {
  private getCollection(notebookId: string) {
    return db.collection('notebooks').doc(notebookId).collection('sources');
  }

  async createSource(source: DocumentSource): Promise<void> {
    await this.getCollection(source.notebookId).doc(source.id).set(source);
    await db.collection('notebooks').doc(source.notebookId).update({
      'stats.documentCount': FieldValue.increment(1),
      updatedAt: Date.now()
    });
  }

  async getSource(notebookId: string, sourceId: string): Promise<DocumentSource | null> {
    const doc = await this.getCollection(notebookId).doc(sourceId).get();
    return doc.exists ? (doc.data() as DocumentSource) : null;
  }

  async updateSource(notebookId: string, sourceId: string, updates: Partial<DocumentSource>): Promise<void> {
    await this.getCollection(notebookId).doc(sourceId).update(updates);
  }

  async deleteSource(notebookId: string, sourceId: string): Promise<void> {
    await this.getCollection(notebookId).doc(sourceId).delete();
    await db.collection('notebooks').doc(notebookId).update({
      'stats.documentCount': FieldValue.increment(-1),
      updatedAt: Date.now()
    });
  }
}

export const sourceRepository = new SourceRepository();
