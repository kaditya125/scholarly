"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.FirestoreMemoryProvider = void 0;
const firebase_1 = require("../../../config/firebase");
class FirestoreMemoryProvider {
    /**
     * Conversation Memory: Ephemeral chat context.
     */
    async getConversationMemory(userId, notebookId) {
        // In practice, this would query recent messages from a subcollection
        return { messages: [] };
    }
    /**
     * Session Memory: Working memory for current study session.
     */
    async getSessionMemory(userId, sessionId) {
        const doc = await firebase_1.db.collection('users').doc(userId).collection('sessions').doc(sessionId).get();
        if (doc.exists) {
            return doc.data();
        }
        return { sessionId, activeTopic: 'General', contextWindow: [], startTime: new Date().toISOString() };
    }
    /**
     * Notebook Memory: Medium-term memory tied to a document corpus.
     */
    async getNotebookMemory(userId, notebookId) {
        const doc = await firebase_1.db.collection('users').doc(userId).collection('notebooks').doc(notebookId).get();
        return doc.exists ? doc.data() : {};
    }
    /**
     * Long-Term Student Memory: Global profile.
     */
    async getLongTermMemory(userId) {
        const doc = await firebase_1.db.collection('users').doc(userId).get();
        return doc.exists ? doc.data() : {};
    }
    /**
     * Learning Analytics Memory: Quantitative metrics for adaptation.
     */
    async getLearningAnalytics(userId) {
        const doc = await firebase_1.db.collection('users').doc(userId).collection('analytics').doc('learning_metrics').get();
        if (doc.exists) {
            return doc.data();
        }
        // Default zero-state metrics
        return {
            masteryPercentage: 0,
            revisionFrequency: 0,
            averageConfidence: 0.5,
            questionAccuracy: 0,
            timeSpentLearningMinutes: 0,
            preferredLearningStyle: 'visual',
            preferredAIAgent: 'TeacherAgent',
            preferredLearningMode: 'TEACHER',
            studyConsistencyScore: 0,
            learningVelocity: 0,
            retentionScore: 0,
            difficultyAdaptation: 'beginner'
        };
    }
    // Updaters
    async updateSessionMemory(userId, sessionId, data) {
        await firebase_1.db.collection('users').doc(userId).collection('sessions').doc(sessionId).set(data, { merge: true });
    }
    async updateLearningAnalytics(userId, data) {
        await firebase_1.db.collection('users').doc(userId).collection('analytics').doc('learning_metrics').set(data, { merge: true });
    }
}
exports.FirestoreMemoryProvider = FirestoreMemoryProvider;
