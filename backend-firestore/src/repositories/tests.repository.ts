import { db } from '../config/firebase';
import { MockTest, Subject, Difficulty } from '../types';

export class TestsRepository {
  private collection = db.collection('tests');

  async findAll(subject?: Subject, difficulty?: Difficulty, maxMins?: number, limit: number = 20): Promise<MockTest[]> {
    let query: FirebaseFirestore.Query = this.collection;

    if (subject) {
      query = query.where('subject', '==', subject);
    }
    if (difficulty) {
      query = query.where('difficulty', '==', difficulty);
    }
    if (maxMins) {
      // Note: Inequality filters require composite indexes if combined with equality filters
      query = query.where('mins', '<=', maxMins);
    }

    const snapshot = await query.limit(limit).get();
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as MockTest));
  }
}
