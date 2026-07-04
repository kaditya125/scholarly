"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.QuestionsRepository = void 0;
const firebase_1 = require("../config/firebase");
class QuestionsRepository {
    collection = firebase_1.db.collection('questions');
    async findAll(subject, level, limit = 20) {
        let query = this.collection;
        if (subject) {
            query = query.where('subject', '==', subject);
        }
        if (level) {
            query = query.where('level', '==', level);
        }
        const snapshot = await query.limit(limit).get();
        return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    }
    async findById(id) {
        const doc = await this.collection.doc(id).get();
        if (!doc.exists)
            return null;
        return { id: doc.id, ...doc.data() };
    }
}
exports.QuestionsRepository = QuestionsRepository;
