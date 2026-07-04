import { db } from '../config/firebase';
import { Question, Subject, Level } from '../types';

export class QuestionsRepository {
  private collection = db.collection('questions');

  async findAll(subject?: Subject, level?: Level, limit: number = 20): Promise<Question[]> {
    let query: FirebaseFirestore.Query = this.collection;

    if (subject) {
      query = query.where('subject', '==', subject);
    }
    if (level) {
      query = query.where('level', '==', level);
    }

    const snapshot = await query.limit(limit).get();
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Question));
  }

  async findById(id: string): Promise<Question | null> {
    const doc = await this.collection.doc(id).get();
    if (!doc.exists) return null;
    return { id: doc.id, ...doc.data() } as Question;
  }
}
