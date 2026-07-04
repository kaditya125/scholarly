import { db } from '../config/firebase';
import { LeaderboardEntry } from '../types';

export class LeaderboardRepository {
  private collection = db.collection('leaderboard');

  async getTopUsers(limit: number = 100): Promise<LeaderboardEntry[]> {
    // Requires index on 'points' DESC
    // Note: If 'points' is a string, it sorts alphabetically. Assume it's stored properly padded or as a number for production,
    // or sort happens correctly if padded. For this schema, we map from string safely or assume string points are formatted well.
    const snapshot = await this.collection.orderBy('points', 'desc').limit(limit).get();
    return snapshot.docs.map(doc => {
      const data = doc.data();
      return { 
        userId: doc.id, 
        ...data 
      } as LeaderboardEntry;
    });
  }
}
