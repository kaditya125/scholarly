import { api } from './client';

export interface AdaptiveQuestion {
  id: string;
  batchIndex: number;
  questionNumber: number;
  subject: string;
  topic: string;
  subtopic: string;
  difficulty: 'Easy' | 'Medium' | 'Hard' | 'Challenge';
  type: 'MCQ' | 'Assertion-Reason' | 'Match' | 'Numerical' | 'Short Answer' | 'Case-Based';
  question: string;
  options?: string[];
  correctAnswer: string | number;
  explanation: string;
  estimatedTimeSeconds: number;
  knowledgeGraphTag: string;
}

export interface StudentDigitalTwinData {
  userId: string;
  updatedAt: number;
  version: number;
  /**
   * Nullable: these are inferred, not measured, and the backend now returns null rather than a
   * fabricated fallback when inference is unavailable or failed. Render absence honestly.
   */
  overallReadinessScore: number | null;
  subjectMastery: Record<string, number>;
  topicMastery: Record<string, number>;
  knowledgeGraph: Record<string, {
    conceptId: string;
    conceptName: string;
    subject: string;
    topic: string;
    dependencyWeight: number;
    masteryScore: number;
    status: 'mastered' | 'learning' | 'weak' | 'untested';
  }>;
  confidenceProfile: {
    confidenceAccuracyGap: number;
    overconfidenceScore: number;
    underconfidenceScore: number;
    guessAccuracy: number;
    confidenceConsistency: number;
  } | null;
  behavioralProfile: {
    avgReadingTimeSeconds: number;
    avgThinkingTimeSeconds: number;
    optionHoverFrequency: number;
    rapidGuessCount: number;
    answerSwitchCount: number;
    fatigueIndex: number;
    revisitCount: number;
    idleDurationSeconds: number;
  } | null;
  learnerPersona: {
    learningStyle: string;
    problemSolvingStyle: string;
    motivationType: string;
    attentionPattern: string;
    revisionPattern: string;
    conceptualStrength: string;
    preferredExplanationStyle: string;
    preferredDifficulty: string;
  } | null;
  predictions: {
    expectedBoardScore: number;
    expectedExamRank?: string;
    targetProbabilityPercentage: number;
    estimatedCompletionWeeks: number;
    recommendedDailyHours: number;
    riskOfMissingTarget: 'Low' | 'Moderate' | 'High';
    potentialBoostIfHoursIncrease: number;
  } | null;
  firstWeekRoadmap: {
    day: number;
    title: string;
    focusSubject: string;
    activities: {
      type: string;
      title: string;
      durationMins: number;
      targetConcept: string;
    }[];
  }[];
  latestAssessmentSummary?: {
    totalQuestions: number;
    correctAnswers: number;
    accuracyPercentage: number;
    avgTimePerQuestionSec: number;
    completedAt: number;
  };
}

/*
 * ── WHY THERE IS NO FALLBACK QUESTION BATCH HERE ─────────────────────────────────────────
 *
 * There used to be one: four hardcoded MCQs — vectors, F = ma, exothermic reactions, quadratic
 * discriminants — returned whenever these calls failed or came back empty. Both question-fetching
 * methods used it, and it did real damage:
 *
 *   · Every student saw the SAME four questions, so it was not a baseline assessment of anything.
 *   · They were JEE physics, chemistry and maths, served regardless of exam. A UPSC, SSC, BPSC or
 *     banking aspirant was calibrated on subjects they do not sit.
 *   · The answers were submitted and graded like any others, so fabricated questions became the
 *     evidence underpinning that student's Digital Twin and their first-week roadmap.
 *   · It hid the outage that caused it. Every one of these calls was 404ing against a path that
 *     did not exist (see below), and because the catch quietly substituted questions, the product
 *     looked like it worked for ten days.
 *
 * This is the same rule already applied to submitAssessment below, for the same reason: a
 * failure must surface as a failure. An error the student can retry is recoverable; a plausible
 * assessment built from invented questions is not, because nothing downstream can tell it apart
 * from a real one.
 *
 * ── THE OUTAGE IT WAS MASKING ───────────────────────────────────────────────────────────
 * These five calls addressed `/assessment/baseline/*`, but the backend mounts the router at
 * `/baseline-assessment/*` (routes/index.ts). Every request fell through to the canonical
 * `/assessment` router, passed its requireAuth, matched nothing and returned 404 — verified in
 * the production access log. Paths corrected 2026-08-28.
 */

export const baselineAssessmentApi = {
  async startOrResume(userId: string): Promise<{
    sessionState: any;
    currentBatch: AdaptiveQuestion[];
    isComplete: boolean;
  }> {
    const { data } = await api.get(`/baseline-assessment/start/${userId}`);
    if (!data?.currentBatch?.length) {
      throw new Error('Could not start your assessment. Please try again in a moment.');
    }
    return data;
  },

  async getNextBatch(
    userId: string,
    batchIndex: number,
    responses: any[]
  ): Promise<{ questions: AdaptiveQuestion[]; isComplete: boolean }> {
    const { data } = await api.post(`/baseline-assessment/next-batch/${userId}`, { batchIndex, responses });
    /*
     * An empty batch is NOT an error when the run is over — that is how the backend says
     * "finished". It is only a failure if it claims to be incomplete while sending nothing,
     * because the student would then sit on a screen waiting for a question that never comes.
     */
    if (!data?.questions?.length && !data?.isComplete) {
      throw new Error('Could not load the next questions. Please try again in a moment.');
    }
    return { questions: data.questions ?? [], isComplete: !!data.isComplete };
  },

  async submitAssessment(
    userId: string,
    payload: {
      responses: any[];
      behavioralSignals?: any;
      confidenceSummary?: any;
    }
  ): Promise<{ digitalTwin: StudentDigitalTwinData }> {
    // No fabricated fallback here, deliberately. This previously caught a failed submission and
    // returned an invented profile — readiness 78, Physics 75 / Chemistry 82 / Maths 72, "Top 5%",
    // risk "Low", a first-week roadmap about Kinematics — and the student saw that as the result
    // of the assessment they had just sat, for subjects they may not even take. A failed
    // submission must surface as a failure so the caller can retry or show an error; inventing a
    // plausible profile is the one outcome that is worse than an error message.
    const { data } = await api.post(`/baseline-assessment/submit/${userId}`, payload);
    if (!data?.digitalTwin) {
      throw new Error('Assessment submitted but no profile was returned. Please retry.');
    }
    return data;
  },

  async resetAssessment(userId: string): Promise<{ success: boolean }> {
    try {
      const { data } = await api.post(`/baseline-assessment/reset/${userId}`);
      return data;
    } catch (e) {
      console.warn('baselineAssessmentApi.resetAssessment error', e);
      return { success: false };
    }
  },

  async getDigitalTwin(userId: string): Promise<StudentDigitalTwinData | null> {
    try {
      const { data } = await api.get(`/baseline-assessment/digital-twin/${userId}`);
      if (data && data.userId) return data as StudentDigitalTwinData;
    } catch (e) {
      console.warn('baselineAssessmentApi.getDigitalTwin fallback', e);
    }
    return null;
  },
};
