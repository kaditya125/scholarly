import { db } from '../../../config/firebase';
import { IMemoryProvider, ConversationMemory, SessionMemory, LearningMetrics } from '../../interfaces/IMemoryProvider';

export class FirestoreMemoryProvider implements IMemoryProvider {
  /**
   * Conversation Memory: Ephemeral chat context.
   */
  async getConversationMemory(userId: string, notebookId: string): Promise<ConversationMemory> {
    // In practice, this would query recent messages from a subcollection
    return { messages: [] };
  }
  
  /**
   * Session Memory: Working memory for current study session.
   */
  async getSessionMemory(userId: string, sessionId: string): Promise<SessionMemory> {
    const doc = await db.collection('users').doc(userId).collection('sessions').doc(sessionId).get();
    if (doc.exists) {
      return doc.data() as SessionMemory;
    }
    return { sessionId, activeTopic: 'General', contextWindow: [], startTime: new Date().toISOString() };
  }
  
  /**
   * Notebook Memory: Medium-term memory tied to a document corpus.
   */
  async getNotebookMemory(userId: string, notebookId: string): Promise<any> {
    const doc = await db.collection('users').doc(userId).collection('notebooks').doc(notebookId).get();
    return doc.exists ? doc.data() : {};
  }
  
  /**
   * Long-Term Student Memory: Global profile.
   */
  async getLongTermMemory(userId: string): Promise<any> {
    const doc = await db.collection('users').doc(userId).get();
    return doc.exists ? doc.data() : {};
  }

  /**
   * Learning Analytics Memory: Quantitative metrics for adaptation.
   */
  async getLearningAnalytics(userId: string): Promise<LearningMetrics> {
    const doc = await db.collection('users').doc(userId).collection('analytics').doc('learning_metrics').get();
    if (doc.exists) {
      return doc.data() as LearningMetrics;
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
  async updateSessionMemory(userId: string, sessionId: string, data: Partial<SessionMemory>): Promise<void> {
    await db.collection('users').doc(userId).collection('sessions').doc(sessionId).set(data, { merge: true });
  }

  async updateLearningAnalytics(userId: string, data: Partial<LearningMetrics>): Promise<void> {
    await db.collection('users').doc(userId).collection('analytics').doc('learning_metrics').set(data, { merge: true });
  }
}
