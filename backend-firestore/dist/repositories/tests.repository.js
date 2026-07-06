"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.testsRepository = exports.TestsRepository = void 0;
const firebase_1 = require("../config/firebase");
class TestsRepository {
    seriesCollection = firebase_1.db.collection('test_series');
    testsCollection = firebase_1.db.collection('mock_tests');
    attemptsCollection = firebase_1.db.collection('test_attempts');
    questionsCollection = firebase_1.db.collection('question_bank');
    async getFeaturedTestSeries() {
        const snapshot = await this.seriesCollection
            .where('featured', '==', true)
            .orderBy('enrollmentCount', 'desc')
            .limit(5)
            .get();
        if (snapshot.empty)
            return [];
        return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    }
    async getTestSeriesByCategory(category) {
        const snapshot = await this.seriesCollection
            .where('category', '==', category)
            .orderBy('enrollmentCount', 'desc')
            .limit(10)
            .get();
        return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    }
    async getTestsByType(type, limit = 10) {
        const snapshot = await this.testsCollection
            .where('type', '==', type)
            .orderBy('participantsCount', 'desc')
            .limit(limit)
            .get();
        return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    }
    async getTestById(testId) {
        const doc = await this.testsCollection.doc(testId).get();
        if (!doc.exists)
            return null;
        return { id: doc.id, ...doc.data() };
    }
    async getQuestions(questionIds) {
        if (!questionIds || questionIds.length === 0)
            return [];
        // Firestore `in` query is limited to 30 items. We batch if needed.
        const questions = [];
        // Batch into chunks of 30
        const chunks = [];
        for (let i = 0; i < questionIds.length; i += 30) {
            chunks.push(questionIds.slice(i, i + 30));
        }
        for (const chunk of chunks) {
            const snapshot = await this.questionsCollection.where('__name__', 'in', chunk).get();
            questions.push(...snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
        }
        return questions;
    }
    async getQuestionsBySubjectAndTopic(subject, topic, limit = 20) {
        let query = this.questionsCollection.where('subject', '==', subject);
        if (topic) {
            query = query.where('topic', '==', topic);
        }
        const snapshot = await query.limit(limit).get();
        return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    }
    async saveTestAttempt(attempt) {
        await this.attemptsCollection.doc(attempt.id).set(attempt, { merge: true });
    }
    async getTestAttempt(attemptId) {
        const doc = await this.attemptsCollection.doc(attemptId).get();
        if (!doc.exists)
            return null;
        return { id: doc.id, ...doc.data() };
    }
    async getIncompleteAttempts(userId) {
        const snapshot = await this.attemptsCollection
            .where('userId', '==', userId)
            .where('status', '==', 'in-progress')
            .orderBy('startedAt', 'desc')
            .limit(3)
            .get();
        return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    }
    async getRecentAttempts(userId) {
        const snapshot = await this.attemptsCollection
            .where('userId', '==', userId)
            .where('status', '==', 'completed')
            .orderBy('completedAt', 'desc')
            .limit(5)
            .get();
        return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    }
}
exports.TestsRepository = TestsRepository;
exports.testsRepository = new TestsRepository();
