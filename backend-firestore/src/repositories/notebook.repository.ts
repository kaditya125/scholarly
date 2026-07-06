import { db } from '../config/firebase';
import { Notebook, DocumentSource, TimelineEvent, LearningAsset } from '../types';
import { FieldValue, Filter } from 'firebase-admin/firestore';

export class NotebookRepository {
  private collection = db.collection('notebooks');

  async createNotebook(notebook: Notebook): Promise<void> {
    await this.collection.doc(notebook.id).set(notebook);
  }

  async getNotebooksByUser(userId: string): Promise<Notebook[]> {
    // Fetch notebooks where the user is an owner, editor, or viewer
    const snapshot = await this.collection
      .where(
        Filter.or(
          Filter.where('owner', '==', userId),
          Filter.where('userId', '==', userId), // legacy compat
          Filter.where('editors', 'array-contains', userId),
          Filter.where('viewers', 'array-contains', userId)
        )
      )
      .orderBy('updatedAt', 'desc')
      .get();
      
    return snapshot.docs.map(doc => doc.data() as Notebook);
  }

  async getNotebook(userId: string, id: string): Promise<Notebook | null> {
    const doc = await this.collection.doc(id).get();
    if (!doc.exists) return null;
    const notebook = doc.data() as Notebook;
    
    if (
      notebook.owner !== userId && 
      notebook.userId !== userId &&
      !notebook.editors?.includes(userId) && 
      !notebook.viewers?.includes(userId)
    ) {
      return null; // or throw an Unauthorized error
    }
    
    return notebook;
  }

  async updateNotebook(userId: string, id: string, updates: Partial<Notebook>): Promise<void> {
    const notebook = await this.getNotebook(userId, id);
    if (!notebook) throw new Error('Notebook not found or unauthorized');
    
    // Only owner or editor can update
    if (notebook.owner !== userId && notebook.userId !== userId && !notebook.editors?.includes(userId)) {
      throw new Error('Unauthorized to edit');
    }

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

  // --- Admin: platform-wide aggregates ---

  /** Global notebook counts for the admin dashboard (total + active in the last 7 days). */
  async getGlobalStats(): Promise<{ totalNotebooks: number; activeThisWeek: number }> {
    const weekAgo = Date.now() - 7 * 86400000;
    const [totalAgg, activeAgg] = await Promise.all([
      this.collection.count().get(),
      this.collection.where('updatedAt', '>=', weekAgo).count().get(),
    ]);
    return {
      totalNotebooks: totalAgg.data().count,
      activeThisWeek: activeAgg.data().count,
    };
  }

  /** Most recently updated notebooks across all users (admin moderation view). */
  async listRecent(limit: number = 50): Promise<Notebook[]> {
    const snapshot = await this.collection.orderBy('updatedAt', 'desc').limit(limit).get();
    return snapshot.docs.map(doc => doc.data() as Notebook);
  }

  /** Admin: fetch any notebook regardless of ownership. */
  async getByIdAdmin(id: string): Promise<Notebook | null> {
    const doc = await this.collection.doc(id).get();
    return doc.exists ? (doc.data() as Notebook) : null;
  }

  /** Admin: update any notebook regardless of ownership. */
  async updateAdmin(id: string, updates: Partial<Notebook>): Promise<void> {
    await this.collection.doc(id).update({ ...updates, updatedAt: Date.now() });
  }

  /** Admin: delete a notebook and cascade-delete its known subcollections. */
  async deleteWithSubcollections(id: string): Promise<void> {
    const subcollections = ['sources', 'timeline', 'assets', 'kg_nodes', 'kg_edges'];
    for (const sub of subcollections) {
      const snap = await this.collection.doc(id).collection(sub).get();
      if (snap.empty) continue;
      const docs = snap.docs;
      for (let i = 0; i < docs.length; i += 400) {
        const batch = db.batch();
        docs.slice(i, i + 400).forEach((d) => batch.delete(d.ref));
        await batch.commit();
      }
    }
    await this.collection.doc(id).delete();
  }

  // --- Knowledge Graph ---

  async addKGNodes(notebookId: string, nodes: import('../types').KGNode[]): Promise<void> {
    const batch = db.batch();
    const kgRef = this.collection.doc(notebookId).collection('kg_nodes');
    for (const node of nodes) {
      batch.set(kgRef.doc(node.id), node);
    }
    await batch.commit();
    await this.incrementStat(notebookId, 'knowledgeGraphNodes', nodes.length);
  }

  async getKGNodes(notebookId: string): Promise<import('../types').KGNode[]> {
    const snapshot = await this.collection.doc(notebookId).collection('kg_nodes').get();
    return snapshot.docs.map(doc => doc.data() as import('../types').KGNode);
  }

  async addKGEdges(notebookId: string, edges: import('../types').KGEdge[]): Promise<void> {
    const batch = db.batch();
    const kgRef = this.collection.doc(notebookId).collection('kg_edges');
    for (const edge of edges) {
      batch.set(kgRef.doc(edge.id), edge);
    }
    await batch.commit();
  }

  async getKGEdges(notebookId: string): Promise<import('../types').KGEdge[]> {
    const snapshot = await this.collection.doc(notebookId).collection('kg_edges').get();
    return snapshot.docs.map(doc => doc.data() as import('../types').KGEdge);
  }
}

export const notebookRepository = new NotebookRepository();
