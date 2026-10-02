import { FieldValue } from 'firebase-admin/firestore';
import { db } from '../config/firebase';
import { QuizAttempt, PedagogicalDiagnostic, RemediationDrillRef } from '../types/quizAttempt.types';

/** A generation claim older than this is treated as abandoned. Generation takes ~10–30 s. */
export const REMEDIATION_CLAIM_TTL_MS = 2 * 60 * 1000;

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

  /**
   * Claim the right to generate a remediation drill for one diagnostic.
   *
   * Generation costs two Gemini calls, so two clicks (or two tabs) must not both pay for it. The
   * claim is a timestamp under `remediationClaims.<diagnosticId>` written in a transaction; a
   * claim older than REMEDIATION_CLAIM_TTL_MS is treated as abandoned (a crashed request) and can
   * be taken over. An already-attached drill wins over everything.
   */
  async claimRemediation(
    userId: string,
    attemptId: string,
    diagnosticId: string,
  ): Promise<
    | { status: 'CLAIMED'; attempt: QuizAttempt; diagnostic: PedagogicalDiagnostic }
    | { status: 'EXISTS'; drill: RemediationDrillRef }
    | { status: 'IN_PROGRESS' }
    | { status: 'NOT_FOUND' }
    | { status: 'NO_DIAGNOSTIC' }
  > {
    const ref = this.col.doc(attemptId);
    return db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists) return { status: 'NOT_FOUND' as const };
      const attempt = { id: snap.id, ...snap.data() } as QuizAttempt;
      if (attempt.userId !== userId) return { status: 'NOT_FOUND' as const };

      const diagnostic = (attempt.pedagogicalDiagnostics || []).find((d) => d.id === diagnosticId);
      if (!diagnostic) return { status: 'NO_DIAGNOSTIC' as const };
      if (diagnostic.remediationDrill) return { status: 'EXISTS' as const, drill: diagnostic.remediationDrill };

      const claimedAt = attempt.remediationClaims?.[diagnosticId];
      if (claimedAt && Date.now() - Date.parse(claimedAt) < REMEDIATION_CLAIM_TTL_MS) {
        return { status: 'IN_PROGRESS' as const };
      }
      tx.set(ref, { remediationClaims: { [diagnosticId]: new Date().toISOString() } }, { merge: true });
      return { status: 'CLAIMED' as const, attempt, diagnostic };
    });
  }

  /** Drop a claim after a failed generation so the student can retry immediately. */
  async releaseRemediationClaim(attemptId: string, diagnosticId: string): Promise<void> {
    await this.col.doc(attemptId).update({ [`remediationClaims.${diagnosticId}`]: FieldValue.delete() });
  }

  /**
   * Write the drill onto its diagnostic and release the claim. First writer wins: if a drill is
   * already attached, that one is returned and `drill` is discarded by the caller.
   */
  async attachRemediationDrill(
    userId: string,
    attemptId: string,
    diagnosticId: string,
    drill: RemediationDrillRef,
  ): Promise<RemediationDrillRef> {
    const ref = this.col.doc(attemptId);
    return db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      const attempt = snap.exists ? ({ id: snap.id, ...snap.data() } as QuizAttempt) : null;
      if (!attempt || attempt.userId !== userId) throw new Error(`quiz attempt ${attemptId} not found for user`);
      const diagnostics = attempt.pedagogicalDiagnostics || [];
      const idx = diagnostics.findIndex((d) => d.id === diagnosticId);
      if (idx < 0) throw new Error(`diagnostic ${diagnosticId} not found on attempt ${attemptId}`);
      if (diagnostics[idx].remediationDrill) return diagnostics[idx].remediationDrill!;

      const next = diagnostics.map((d, i) => (i === idx ? { ...d, remediationDrill: drill } : d));
      tx.update(ref, {
        pedagogicalDiagnostics: next,
        [`remediationClaims.${diagnosticId}`]: FieldValue.delete(),
      });
      return drill;
    });
  }

  async listByUser(userId: string): Promise<QuizAttempt[]> {
    const snap = await this.col.where('userId', '==', userId).get();
    const items = snap.docs.map(d => ({ id: d.id, ...d.data() } as QuizAttempt));
    // Newest first.
    return items.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
  }
}

export const quizAttemptsRepository = new QuizAttemptsRepository();
