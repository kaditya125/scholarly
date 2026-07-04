import { db } from '../config/firebase';
import { UserStats } from '../types';

export class UserStatsRepository {
  private collection = db.collection('user_stats');

  async findByUserId(userId: string): Promise<UserStats | null> {
    const doc = await this.collection.doc(userId).get();
    if (!doc.exists) return null;
    return { userId: doc.id, ...doc.data() } as UserStats;
  }
}
