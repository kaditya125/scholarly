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
}
exports.UserStatsRepository = UserStatsRepository;
