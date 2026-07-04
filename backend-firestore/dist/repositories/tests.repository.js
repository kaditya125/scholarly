"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TestsRepository = void 0;
const firebase_1 = require("../config/firebase");
class TestsRepository {
    collection = firebase_1.db.collection('tests');
    async findAll(subject, difficulty, maxMins, limit = 20) {
        let query = this.collection;
        if (subject) {
            query = query.where('subject', '==', subject);
        }
        if (difficulty) {
            query = query.where('difficulty', '==', difficulty);
        }
        if (maxMins) {
            // Note: Inequality filters require composite indexes if combined with equality filters
            query = query.where('mins', '<=', maxMins);
        }
        const snapshot = await query.limit(limit).get();
        return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    }
}
exports.TestsRepository = TestsRepository;
