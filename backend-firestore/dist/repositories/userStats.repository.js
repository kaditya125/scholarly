"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.UserStatsRepository = void 0;
const firebase_1 = require("../config/firebase");
class UserStatsRepository {
    collection = firebase_1.db.collection('user_stats');
    async findByUserId(userId) {
        const doc = await this.collection.doc(userId).get();
        if (!doc.exists)
            return null;
        return { userId: doc.id, ...doc.data() };
    }
    async upsertUserStats(userId, data) {
        await this.collection.doc(userId).set(data, { merge: true });
    }
    async addXP(userId, amount) {
        const doc = await this.findByUserId(userId);
        if (!doc)
            return;
        let { gamification } = doc;
        if (!gamification) {
            gamification = {
                xp: 0,
                level: 1,
                rank: 'Bronze',
                studyStreakDays: 0,
                longestStreak: 0,
                badges: []
            };
        }
        gamification.xp += amount;
        // Level calculation (e.g. 100 XP per level)
        gamification.level = Math.floor(gamification.xp / 100) + 1;
        // Rank calculation
        if (gamification.level >= 50)
            gamification.rank = 'Diamond';
        else if (gamification.level >= 25)
            gamification.rank = 'Platinum';
        else if (gamification.level >= 10)
            gamification.rank = 'Gold';
        else if (gamification.level >= 5)
            gamification.rank = 'Silver';
        else
            gamification.rank = 'Bronze';
        await this.upsertUserStats(userId, { gamification });
    }
}
exports.UserStatsRepository = UserStatsRepository;
