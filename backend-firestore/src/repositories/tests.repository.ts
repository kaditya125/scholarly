import { db } from '../config/firebase';
import { TestSeries, MockTest, TestAttempt, Question } from '../types/tests.types';

export class TestsRepository {
  private readonly seriesCollection = db.collection('test_series');
  private readonly testsCollection = db.collection('mock_tests');
  private readonly attemptsCollection = db.collection('test_attempts');
  private readonly questionsCollection = db.collection('question_bank');

  async getFeaturedTestSeries(): Promise<TestSeries[]> {
    const snapshot = await this.seriesCollection
      .where('featured', '==', true)
      .orderBy('enrollmentCount', 'desc')
      .limit(5)
      .get();
      
    if (snapshot.empty) return [];
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as TestSeries));
  }

  async getTestSeriesByCategory(category: string): Promise<TestSeries[]> {
    const snapshot = await this.seriesCollection
      .where('category', '==', category)
      .orderBy('enrollmentCount', 'desc')
      .limit(10)
      .get();
      
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as TestSeries));
  }

  async getTestsByType(type: string, limit = 10): Promise<MockTest[]> {
    const snapshot = await this.testsCollection
      .where('type', '==', type)
      .orderBy('participantsCount', 'desc')
      .limit(limit)
      .get();
      
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as MockTest));
  }

  async getTestById(testId: string): Promise<MockTest | null> {
    const doc = await this.testsCollection.doc(testId).get();
    if (!doc.exists) return null;
    return { id: doc.id, ...doc.data() } as MockTest;
  }

  async getQuestions(questionIds: string[]): Promise<Question[]> {
    if (!questionIds || questionIds.length === 0) return [];
    // Firestore `in` query is limited to 30 items. We batch if needed.
    const questions: Question[] = [];
    
    // Batch into chunks of 30
    const chunks = [];
    for (let i = 0; i < questionIds.length; i += 30) {
        chunks.push(questionIds.slice(i, i + 30));
    }

    for (const chunk of chunks) {
        const snapshot = await this.questionsCollection.where('__name__', 'in', chunk).get();
        questions.push(...snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Question)));
    }
    return questions;
  }
  
  async getQuestionsBySubjectAndTopic(subject: string, topic?: string, limit = 20): Promise<Question[]> {
    let query: FirebaseFirestore.Query = this.questionsCollection.where('subject', '==', subject);
    if (topic) {
        query = query.where('topic', '==', topic);
    }
    const snapshot = await query.limit(limit).get();
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Question));
  }

  async saveTestAttempt(attempt: TestAttempt): Promise<void> {
    await this.attemptsCollection.doc(attempt.id).set(attempt, { merge: true });
  }

  async getTestAttempt(attemptId: string): Promise<TestAttempt | null> {
    const doc = await this.attemptsCollection.doc(attemptId).get();
    if (!doc.exists) return null;
    return { id: doc.id, ...doc.data() } as TestAttempt;
  }
  
  async getIncompleteAttempts(userId: string): Promise<TestAttempt[]> {
    const snapshot = await this.attemptsCollection
      .where('userId', '==', userId)
      .where('status', '==', 'in-progress')
      .orderBy('startedAt', 'desc')
      .limit(3)
      .get();
      
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as TestAttempt));
  }
  
  async getRecentAttempts(userId: string): Promise<TestAttempt[]> {
      const snapshot = await this.attemptsCollection
      .where('userId', '==', userId)
      .where('status', '==', 'completed')
      .orderBy('completedAt', 'desc')
      .limit(5)
      .get();
      
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as TestAttempt));
  }
}

export const testsRepository = new TestsRepository();
