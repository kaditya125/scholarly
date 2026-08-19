import { db } from '../config/firebase';
import { adaptiveCatService, AdaptiveQuestion } from './adaptiveCat.service';
import { gradeBaselineSubmission } from './baselineGrading';
import { logger } from '../utils/logger';
import { studentDigitalTwinService } from './studentDigitalTwin.service';
import { StudentDigitalTwin } from '../types/studentDigitalTwin.types';

export class BaselineAssessmentService {
  /**
   * Starts or resumes a baseline assessment for a student.
   */
  async startOrResumeAssessment(userId: string): Promise<{
    sessionState: any;
    currentBatch: AdaptiveQuestion[];
    isComplete: boolean;
  }> {
    const docRef = db.collection('users').doc(userId).collection('assessments').doc('baselineSession');
    const docSnap = await docRef.get();

    if (docSnap.exists) {
      const data = docSnap.data();
      if (data && !data.isSubmitted && data.questions && data.questions.length > 0) {
        return {
          sessionState: data,
          currentBatch: data.currentBatch || data.questions,
          isComplete: !!data.isComplete,
        };
      }
    }

    // Generate initial batch (Batch #0)
    const { questions, isComplete } = await adaptiveCatService.generateAdaptiveBatch(userId, 0, []);

    const sessionState = {
      userId,
      batchIndex: 0,
      startedAt: Date.now(),
      responses: [],
      questions,
      currentBatch: questions,
      isComplete: false,
      isSubmitted: false,
    };

    await docRef.set(sessionState);
    return { sessionState, currentBatch: questions, isComplete };
  }

  /**
   * Evaluates responses from current batch and fetches next dynamic CAT batch.
   */
  async getNextBatch(
    userId: string,
    batchIndex: number,
    responses: any[]
  ): Promise<{ questions: AdaptiveQuestion[]; isComplete: boolean }> {
    const docRef = db.collection('users').doc(userId).collection('assessments').doc('baselineSession');
    
    // Save current responses
    await docRef.set({ responses, batchIndex }, { merge: true });

    // Fetch next adaptive question batch
    const { questions, isComplete } = await adaptiveCatService.generateAdaptiveBatch(
      userId,
      batchIndex + 1,
      responses
    );

    const docSnap = await docRef.get();
    const existing = docSnap.exists ? docSnap.data()?.questions || [] : [];
    const updatedQuestions = [...existing, ...questions];

    await docRef.set(
      {
        batchIndex: batchIndex + 1,
        questions: updatedQuestions,
        currentBatch: questions,
        isComplete,
        updatedAt: Date.now(),
      },
      { merge: true }
    );

    return { questions, isComplete };
  }


  /**
   * ── Baseline submission state machine ──────────────────────────────────────────────────────
   *
   *   NOT_SUBMITTED → PROCESSING → COMPLETED
   *                        └──────→ FAILED → (retryable)
   *
   * Enforces the invariant: ONE logical baseline submission produces at most one attempt and one
   * durable graded result, even when requests race or a process dies mid-flight.
   *
   * The claim is a Firestore transaction, deliberately NOT get()-then-set(): that pattern is what
   * silently dropped mastery evidence earlier in this project, and two simultaneous submissions
   * would both read NOT_SUBMITTED and both proceed to grade.
   *
   * RECOVERY RULE (the subtle part): a stale PROCESSING claim is never reclaimed merely because a
   * timer expired. A crashed worker may already have written a durable graded result, so we check
   * for that output FIRST and reconcile to COMPLETED if it exists. Only a stale claim with NO
   * durable result may be reclaimed — otherwise recovery would produce the duplicate the state
   * machine exists to prevent.
   */
  private async claimSubmission(userId: string): Promise<{
    outcome: 'CLAIMED' | 'ALREADY_PROCESSING' | 'ALREADY_COMPLETED';
    attemptId: string | null;
    existingResult?: any;
  }> {
    const docRef = db.collection('users').doc(userId).collection('assessments').doc('baselineSession');
    const STALE_MS = 5 * 60 * 1000;

    return db.runTransaction(async (tx) => {
      const snap = await tx.get(docRef);
      const data: any = snap.exists ? snap.data() : null;
      const now = Date.now();

      // Durable output is the authority, ahead of any state flag: if a graded result exists the
      // submission is done regardless of what the flag says (e.g. a crash before COMPLETED).
      if (data?.gradedResult) {
        if (data.submissionState !== 'COMPLETED') {
          tx.set(docRef, { submissionState: 'COMPLETED', completedAt: data.completedAt || now }, { merge: true });
        }
        return { outcome: 'ALREADY_COMPLETED' as const, attemptId: data.attemptId || null, existingResult: data.gradedResult };
      }

      if (data?.submissionState === 'PROCESSING') {
        const startedAt = data.processingStartedAt || 0;
        const stale = now - startedAt > STALE_MS;
        if (!stale) {
          return { outcome: 'ALREADY_PROCESSING' as const, attemptId: data.attemptId || null };
        }
        // Stale AND no durable result (checked above) — safe to reclaim, keeping the SAME
        // attemptId so a retry cannot mint a second identity for one logical submission.
        tx.set(docRef, { submissionState: 'PROCESSING', processingStartedAt: now }, { merge: true });
        return { outcome: 'CLAIMED' as const, attemptId: data.attemptId || this.attemptIdFor(userId, data) };
      }

      // NOT_SUBMITTED / FAILED / absent → claim it.
      const attemptId = data?.attemptId || this.attemptIdFor(userId, data);
      tx.set(docRef, {
        submissionState: 'PROCESSING',
        processingStartedAt: now,
        attemptId,
      }, { merge: true });
      return { outcome: 'CLAIMED' as const, attemptId };
    });
  }

  /**
   * Stable attempt identity for one logical submission. Derived from the session's own startedAt
   * so a retry reuses it, while a genuinely new session yields a new id. Persisted at claim time,
   * so every later read returns the same value.
   */
  private attemptIdFor(userId: string, sessionData: any): string {
    return `baseline_${userId}_${sessionData?.startedAt || 'nosession'}`;
  }

  /**
   * Finalizes assessment submission, generates Student Digital Twin, and returns diagnostic report.
   */
  async submitAssessment(
    userId: string,
    payload: {
      responses: any[];
      behavioralSignals?: any;
      confidenceSummary?: any;
    }
  ): Promise<{ digitalTwin: StudentDigitalTwin }> {
    const responses = payload.responses || [];
    const docRef = db.collection('users').doc(userId).collection('assessments').doc('baselineSession');

    // Atomically establish ownership BEFORE any grading or LLM work. A loser must not grade,
    // must not write, and must never overwrite the winner's measured result — otherwise a client
    // could race a second submission and replace the student's real outcome.
    const claim = await this.claimSubmission(userId);
    if (claim.outcome === 'ALREADY_PROCESSING') {
      throw new Error('Baseline submission already in progress');
    }
    if (claim.outcome === 'ALREADY_COMPLETED') {
      const existingTwin = await studentDigitalTwinService.getDigitalTwin(userId);
      if (existingTwin) return { digitalTwin: existingTwin };
      throw new Error('Baseline already submitted');
    }

    // ── SERVER-AUTHORITATIVE GRADING ────────────────────────────────────────────────────────
    // Correctness was previously taken from the client: the browser computed `isCorrect` and the
    // server counted `responses.filter(r => r.isCorrect)`. That is an assertion, not a
    // measurement, and it must never reach the evidence pipeline. The authoritative answer key is
    // the question set THIS user's session already persisted when the batch was served, scoped to
    // that session so a client cannot submit an arbitrary questionId whose answer it knows.
    const sessionSnap = await docRef.get();
    const sessionQuestions: any[] = (sessionSnap.data() as any)?.questions || [];

    const summary = gradeBaselineSubmission(responses as any[], sessionQuestions);

    // Denominator is the assessment that actually existed. The previous `responses.length || 20`
    // invented 20 questions for an empty submission, producing a real-looking score for a student
    // who answered nothing.
    const totalQuestions = summary.totalQuestions;
    const correctCount = summary.correctCount;
    const accuracyPct = summary.accuracyPct; // null when nothing was gradeable — never faked

    const totalTimeSec = responses.reduce((sum: number, r: any) => sum + (r.timeTakenSeconds || 0), 0);
    const avgTimePerQSec = summary.attempted > 0 ? Math.round(totalTimeSec / summary.attempted) : null;

    logger.info('[Baseline] submission graded server-side', {
      userId,
      totalQuestions,
      attempted: summary.attempted,
      skipped: summary.skipped,
      ungradable: summary.ungradable,
      correctCount,
      accuracyPct,
    });

    // Grading result is persisted BEFORE the twin is generated. The twin is an LLM artifact and
    // must never gate measured evidence: if that call fails, the student's demonstrated result
    // still has to survive.
    await docRef.set(
      {
        isSubmitted: true,
        submittedAt: Date.now(),
        // COMPLETED is set together with the durable result: the state must never claim
        // completion while the graded result is absent.
        submissionState: 'COMPLETED',
        completedAt: Date.now(),
        attemptId: claim.attemptId,
        gradedResult: {
          attemptId: claim.attemptId,
          totalQuestions,
          attempted: summary.attempted,
          skipped: summary.skipped,
          ungradable: summary.ungradable,
          correctCount,
          accuracyPct,
          gradedAt: Date.now(),
          gradedBy: 'SERVER',
        },
      },
      { merge: true }
    );

    const submissionSummary = {
      totalQuestions,
      correctCount,
      accuracyPct,
      totalTimeSec,
      avgTimePerQSec,
      attempted: summary.attempted,
      skipped: summary.skipped,
      behavioralSignals: payload.behavioralSignals || {},
      confidenceSummary: payload.confidenceSummary || {},
      // Server-graded verdicts, not the client's claims.
      responses: summary.graded,
    };

    // Personalization artifact, downstream of the measured result and non-blocking.
    let digitalTwin: StudentDigitalTwin;
    try {
      digitalTwin = await studentDigitalTwinService.generateInitialDigitalTwin(userId, submissionSummary);
    } catch (err: any) {
      logger.error('[Baseline] digital twin generation failed; graded evidence retained', {
        userId, error: err?.message,
      });
      throw err;
    }

    await docRef.set({ readinessScore: digitalTwin.overallReadinessScore }, { merge: true });

    return { digitalTwin };
  }
}

export const baselineAssessmentService = new BaselineAssessmentService();
