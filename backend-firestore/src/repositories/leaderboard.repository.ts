import { db } from '../config/firebase';
import { LeaderboardEntry } from '../types';

export class LeaderboardRepository {
  private userStatsCollection = db.collection('user_stats');

  async getTopUsers(limit: number = 100, targetExam?: string): Promise<LeaderboardEntry[]> {
    try {
      const snapshot = await this.userStatsCollection
        .orderBy('gamification.xp', 'desc')
        .limit(limit)
        .get();

      if (snapshot.empty) {
        return [];
      }

      const entries = await Promise.all(
        snapshot.docs.map(async (doc, index) => {
          const data = doc.data();
          const userId = doc.id;
          const gamification = data.gamification || { xp: 0, level: 1, rank: 'Bronze', studyStreakDays: 0 };

          let displayName = '';
          let handle = '';
          let photoURL = '';
          let exam = '';

          try {
            const [userDocSnap, onboardingDocSnap] = await Promise.all([
              db.collection('users').doc(userId).get(),
              db.collection('users').doc(userId).collection('profile').doc('onboarding').get(),
            ]);

            const userData = userDocSnap.exists ? userDocSnap.data() : null;
            const onboardingData = onboardingDocSnap.exists ? onboardingDocSnap.data() : null;

            displayName =
              onboardingData?.name ||
              userData?.displayName ||
              userData?.name ||
              (userData?.email ? userData.email.split('@')[0] : '') ||
              `Scholar ${userId.substring(0, 4)}`;

            handle = '@' + (userData?.handle || displayName.toLowerCase().replace(/[^a-z0-9_]/g, '_').slice(0, 16));
            photoURL = userData?.photoURL || userData?.photoUrl || onboardingData?.avatar || '';
            exam = onboardingData?.targetExam || onboardingData?.goal || '';
          } catch (e) {
            displayName = `Scholar ${userId.substring(0, 4)}`;
            handle = `@scholar_${userId.substring(0, 4)}`;
          }

          const fallbackAvatar = `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(displayName)}&backgroundColor=c8e558,38bdf8,818cf8&textColor=0f172a`;

          return {
            userId,
            name: displayName,
            handle,
            avatar: photoURL || fallbackAvatar,
            followers: (data.followersCount || 0).toString(),
            points: (gamification.xp || 0).toString(),
            reward: Math.floor((gamification.xp || 0) * 0.1),
            rank: index + 1,
            rankTrend: index === 0 ? 'up' : 'same',
            scoreTrend: 'up',
            targetExam: exam || 'Competitive Prep',
            streakDays: gamification.studyStreakDays || data.studyStreakDays || 0,
            level: gamification.level || 1,
            tier: gamification.rank || 'Bronze',
            accuracy: data.averageAccuracy || 0,
          } as LeaderboardEntry;
        })
      );

      if (targetExam && targetExam !== 'ALL') {
        const filtered = entries.filter(
          (e) => e.targetExam && e.targetExam.toLowerCase().includes(targetExam.toLowerCase())
        );
        return filtered.map((e, idx) => ({ ...e, rank: idx + 1 }));
      }

      return entries;
    } catch (err) {
      console.error('[LeaderboardRepository] Failed to fetch top users:', err);
      return [];
    }
  }
}
