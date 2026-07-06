"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.LeaderboardRepository = void 0;
const firebase_1 = require("../config/firebase");
class LeaderboardRepository {
    userStatsCollection = firebase_1.db.collection('user_stats');
    async getTopUsers(limit = 100) {
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
            };
        });
    }
}
exports.LeaderboardRepository = LeaderboardRepository;
