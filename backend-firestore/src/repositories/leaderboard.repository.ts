import { db } from '../config/firebase';
import { LeaderboardEntry } from '../types';

export class LeaderboardRepository {
  private userStatsCollection = db.collection('user_stats');

  async getTopUsers(limit: number = 100): Promise<LeaderboardEntry[]> {
    // Requires composite index: gamification.xp DESC
    const snapshot = await this.userStatsCollection.orderBy('gamification.xp', 'desc').limit(limit).get();
    
    return snapshot.docs.map((doc, index) => {
      const data = doc.data();
      const gamification = data.gamification || { xp: 0, level: 1, rank: 'Bronze' };
      
      return { 
        userId: doc.id, 
        name: `User ${doc.id.substring(0, 5)}`, // Placeholder name mapping
        handle: `@user${doc.id.substring(0, 5)}`,
        avatar: "https://i.pravatar.cc/150?u=" + doc.id,
        followers: "12",
        points: gamification.xp.toString(),
        reward: gamification.xp * 0.1, // Example conversion
        rank: index + 1,
        rankTrend: "same",
        scoreTrend: "up"
      } as LeaderboardEntry;
    });
  }
}
