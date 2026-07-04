"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DiscussionsRepository = void 0;
const firebase_1 = require("../config/firebase");
class DiscussionsRepository {
    collection = firebase_1.db.collection('discussions');
    async findByRoom(roomId, limit = 20) {
        let query = this.collection;
        if (roomId) {
            query = query.where('roomId', '==', roomId);
        }
        // Requires composite index: roomId ASC, createdAt DESC
        query = query.orderBy('createdAt', 'desc').limit(limit);
        const snapshot = await query.get();
        return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    }
}
exports.DiscussionsRepository = DiscussionsRepository;
