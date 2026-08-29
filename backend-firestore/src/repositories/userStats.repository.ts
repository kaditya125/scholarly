import { db } from '../config/firebase';
import { UserStats } from '../types';

export class UserStatsRepository {
  private collection = db.collection('user_stats');

  async findByUserId(userId: string): Promise<UserStats | null> {
    const doc = await this.collection.doc(userId).get();
    if (!doc.exists) return null;
    return { userId: doc.id, ...doc.data() } as UserStats;
  }

  async upsertUserStats(userId: string, data: Partial<UserStats>): Promise<void> {
    await this.collection.doc(userId).set(data, { merge: true });
  }

  async addXP(userId: string, amount: number): Promise<void> {
    const doc = await this.findByUserId(userId);
    
    let gamification = doc?.gamification;
    if (!gamification) {
      gamification = {
        xp: 0,
        level: 1,
        rank: 'Bronze',
        studyStreakDays: 1,
        longestStreak: 1,
        badges: []
      };
    }
    
    gamification.xp = (gamification.xp || 0) + amount;
    
    // Level calculation (100 XP per level)
    gamification.level = Math.floor(gamification.xp / 100) + 1;
    
    // Tier / Rank calculation
    if (gamification.level >= 50) gamification.rank = 'Diamond';
    else if (gamification.level >= 25) gamification.rank = 'Platinum';
    else if (gamification.level >= 10) gamification.rank = 'Gold';
    else if (gamification.level >= 5) gamification.rank = 'Silver';
    else gamification.rank = 'Bronze';

    await this.upsertUserStats(userId, { gamification });
  }
}
