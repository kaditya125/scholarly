import { db } from '../config/firebase';
import { QuizAttempt } from '../types/quizAttempt.types';

/**
 * Firestore persistence for AI-generated quiz attempts (collection `quiz_attempts`).
 * Self-contained: each doc stores its own questions, so no question_bank lookups are needed.
 *
 * Listing uses a single equality filter (userId) and sorts in memory to avoid requiring a
 * composite index (equality + orderBy on a different field would). A student's attempt count
 * is small, so this is comfortably within budget.
 */
export class QuizAttemptsRepository {
  private readonly col = db.collection('quiz_attempts');

  async create(attempt: QuizAttempt): Promise<void> {
    await this.col.doc(attempt.id).set(attempt);
  }

  async getById(id: string): Promise<QuizAttempt | null> {
    const doc = await this.col.doc(id).get();
    if (!doc.exists) return null;
    return { id: doc.id, ...doc.data() } as QuizAttempt;
  }

  async update(id: string, patch: Partial<QuizAttempt>): Promise<void> {
    await this.col.doc(id).set(patch, { merge: true });
  }

  async listByUser(userId: string): Promise<QuizAttempt[]> {
    const snap = await this.col.where('userId', '==', userId).get();
    const items = snap.docs.map(d => ({ id: d.id, ...d.data() } as QuizAttempt));
    // Newest first.
    return items.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
  }
}

export const quizAttemptsRepository = new QuizAttemptsRepository();
