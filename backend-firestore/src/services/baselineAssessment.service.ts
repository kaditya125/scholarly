import { db } from '../config/firebase';
import { adaptiveCatService, AdaptiveQuestion } from './adaptiveCat.service';
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
    const totalQuestions = responses.length || 20;
    const correctCount = responses.filter((r: any) => r.isCorrect).length;
    const accuracyPct = Math.round((correctCount / Math.max(totalQuestions, 1)) * 100);

    const totalTimeSec = responses.reduce((sum: number, r: any) => sum + (r.timeTakenSeconds || 30), 0);
    const avgTimePerQSec = Math.round(totalTimeSec / Math.max(totalQuestions, 1));

    const submissionSummary = {
      totalQuestions,
      correctCount,
      accuracyPct,
      totalTimeSec,
      avgTimePerQSec,
      behavioralSignals: payload.behavioralSignals || {},
      confidenceSummary: payload.confidenceSummary || {},
      responses,
    };

    // Generate Student Digital Twin
    const digitalTwin = await studentDigitalTwinService.generateInitialDigitalTwin(userId, submissionSummary);

    // Update baselineSession status
    const docRef = db.collection('users').doc(userId).collection('assessments').doc('baselineSession');
    await docRef.set(
      {
        isSubmitted: true,
        submittedAt: Date.now(),
        readinessScore: digitalTwin.overallReadinessScore,
      },
      { merge: true }
    );

    return { digitalTwin };
  }
}

export const baselineAssessmentService = new BaselineAssessmentService();
