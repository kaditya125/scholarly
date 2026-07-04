"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ChatRepository = void 0;
const firebase_1 = require("../config/firebase");
class ChatRepository {
    collection = firebase_1.db.collection('chat_sessions');
    /**
     * Fetch an existing session or create a new one.
     */
    async getOrCreateSession(sessionId, userId, topicType, selectedModel) {
        const docRef = this.collection.doc(sessionId);
        const doc = await docRef.get();
        if (doc.exists) {
            return { sessionId: doc.id, ...doc.data() };
        }
        const newSession = {
            sessionId,
            userId,
            topicType: topicType,
            selectedModel,
            createdAt: Date.now()
        };
        await docRef.set(newSession);
        return newSession;
    }
    /**
     * Load history of messages from the subcollection, sorted by timestamp.
     */
    async getMessages(sessionId) {
        const snapshot = await this.collection.doc(sessionId).collection('messages').orderBy('timestamp', 'asc').get();
        return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    }
    /**
     * Save a single message to the subcollection.
     */
    async saveMessage(sessionId, message) {
        // Generate a new doc ref to auto-generate an ID if one isn't provided
        const msgRef = message.id
            ? this.collection.doc(sessionId).collection('messages').doc(message.id)
            : this.collection.doc(sessionId).collection('messages').doc();
        await msgRef.set({ ...message, id: msgRef.id });
    }
    /**
     * Save multiple messages in a batch.
     */
    async saveMessagesBatch(sessionId, messages) {
        const batch = firebase_1.db.batch();
        const messagesRef = this.collection.doc(sessionId).collection('messages');
        messages.forEach(msg => {
            const msgRef = msg.id ? messagesRef.doc(msg.id) : messagesRef.doc();
            batch.set(msgRef, { ...msg, id: msgRef.id });
        });
        await batch.commit();
    }
    /**
     * Fetch all sessions for a specific user, ordered by creation date.
     */
    async getSessionsByUser(userId) {
        const snapshot = await this.collection
            .where('userId', '==', userId)
            .get();
        const sessions = snapshot.docs.map(doc => ({ sessionId: doc.id, ...doc.data() }));
        // Sort in memory to avoid requiring a Firestore composite index
        return sessions.sort((a, b) => b.createdAt - a.createdAt);
    }
    /**
     * Delete a session and all its messages
     */
    async deleteSession(sessionId, userId) {
        const docRef = this.collection.doc(sessionId);
        const doc = await docRef.get();
        if (!doc.exists)
            return false;
        // Ensure the user owns the session
        const data = doc.data();
        if (data?.userId !== userId)
            return false;
        // Delete all messages in the subcollection first (batch)
        const messagesRef = docRef.collection('messages');
        const messagesSnapshot = await messagesRef.get();
        if (!messagesSnapshot.empty) {
            const batch = firebase_1.db.batch();
            messagesSnapshot.docs.forEach(msgDoc => {
                batch.delete(msgDoc.ref);
            });
            await batch.commit();
        }
        // Delete the session document itself
        await docRef.delete();
        return true;
    }
}
exports.ChatRepository = ChatRepository;
