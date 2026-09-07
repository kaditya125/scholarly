import { db } from '../config/firebase';
import { PracticeBankQuestion } from '../types/practiceBank.types';

export class PracticeBankRepository {
  private readonly col = db.collection('practice_bank');

  async saveBatch(questions: PracticeBankQuestion[]): Promise<void> {
    const BATCH_SIZE = 450;
    for (let i = 0; i < questions.length; i += BATCH_SIZE) {
      const batch = db.batch();
      const chunk = questions.slice(i, i + BATCH_SIZE);
      for (const q of chunk) {
        const ref = this.col.doc(q.id);
        batch.set(ref, q);
      }
      await batch.commit();
    }
  }

  async getById(id: string): Promise<PracticeBankQuestion | null> {
    const doc = await this.col.doc(id).get();
    if (!doc.exists) return null;
    return doc.data() as PracticeBankQuestion;
  }

  async count(): Promise<number> {
    const snap = await this.col.count().get();
    return snap.data().count;
  }

  async list(filter?: { category?: string; limit?: number }): Promise<PracticeBankQuestion[]> {
    let q: FirebaseFirestore.Query = this.col;
    if (filter?.category) q = q.where('category', '==', filter.category);
    if (filter?.limit) q = q.limit(filter.limit);
    const snap = await q.get();
    return snap.docs.map(d => d.data() as PracticeBankQuestion);
  }

  async deleteAll(): Promise<number> {
    const snap = await this.col.get();
    const BATCH_SIZE = 450;
    for (let i = 0; i < snap.docs.length; i += BATCH_SIZE) {
      const batch = db.batch();
      const chunk = snap.docs.slice(i, i + BATCH_SIZE);
      for (const d of chunk) {
        batch.delete(d.ref);
      }
      await batch.commit();
    }
    return snap.size;
  }
}

export const practiceBankRepository = new PracticeBankRepository();
