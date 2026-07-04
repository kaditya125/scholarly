import { db } from '../config/firebase';
import { ChatSession, ChatMessage } from '../types';

export class ChatRepository {
  private collection = db.collection('chat_sessions');

  /**
   * Fetch an existing session or create a new one.
   */
  async getOrCreateSession(sessionId: string, userId: string, topicType: string, selectedModel: string): Promise<ChatSession> {
    const docRef = this.collection.doc(sessionId);
    const doc = await docRef.get();

    if (doc.exists) {
      return { sessionId: doc.id, ...doc.data() } as ChatSession;
    }

    const newSession: ChatSession = {
      sessionId,
      userId,
      topicType: topicType as any,
      selectedModel,
      createdAt: Date.now()
    };

    await docRef.set(newSession);
    return newSession;
  }

  /**
   * Load history of messages from the subcollection, sorted by timestamp.
   */
  async getMessages(sessionId: string): Promise<ChatMessage[]> {
    const snapshot = await this.collection.doc(sessionId).collection('messages').orderBy('timestamp', 'asc').get();
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as ChatMessage));
  }

  /**
   * Save a single message to the subcollection.
   */
  async saveMessage(sessionId: string, message: ChatMessage): Promise<void> {
    // Generate a new doc ref to auto-generate an ID if one isn't provided
    const msgRef = message.id 
      ? this.collection.doc(sessionId).collection('messages').doc(message.id)
      : this.collection.doc(sessionId).collection('messages').doc();
      
    await msgRef.set({ ...message, id: msgRef.id });
  }

  /**
   * Save multiple messages in a batch.
   */
  async saveMessagesBatch(sessionId: string, messages: ChatMessage[]): Promise<void> {
    const batch = db.batch();
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
  async getSessionsByUser(userId: string): Promise<ChatSession[]> {
    const snapshot = await this.collection
      .where('userId', '==', userId)
      .get();
      
    const sessions = snapshot.docs.map(doc => ({ sessionId: doc.id, ...doc.data() } as ChatSession));
    
    // Sort in memory to avoid requiring a Firestore composite index
    return sessions.sort((a, b) => b.createdAt - a.createdAt);
  }

  /**
   * Delete a session and all its messages
   */
  async deleteSession(sessionId: string, userId: string): Promise<boolean> {
    const docRef = this.collection.doc(sessionId);
    const doc = await docRef.get();
    
    if (!doc.exists) return false;
    
    // Ensure the user owns the session
    const data = doc.data();
    if (data?.userId !== userId) return false;
    
    // Delete all messages in the subcollection first (batch)
    const messagesRef = docRef.collection('messages');
    const messagesSnapshot = await messagesRef.get();
    
    if (!messagesSnapshot.empty) {
      const batch = db.batch();
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
