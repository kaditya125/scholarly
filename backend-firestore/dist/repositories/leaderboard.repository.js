"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.LeaderboardRepository = void 0;
const firebase_1 = require("../config/firebase");
class LeaderboardRepository {
    collection = firebase_1.db.collection('leaderboard');
    async getTopUsers(limit = 100) {
        // Requires index on 'points' DESC
        // Note: If 'points' is a string, it sorts alphabetically. Assume it's stored properly padded or as a number for production,
        // or sort happens correctly if padded. For this schema, we map from string safely or assume string points are formatted well.
        const snapshot = await this.collection.orderBy('points', 'desc').limit(limit).get();
        return snapshot.docs.map(doc => {
            const data = doc.data();
            return {
                userId: doc.id,
                ...data
            };
        });
    }
}
exports.LeaderboardRepository = LeaderboardRepository;
