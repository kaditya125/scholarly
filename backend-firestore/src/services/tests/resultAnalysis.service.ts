import { testsRepository } from '../../repositories/tests.repository';
import { TestAttempt, MockTest, Question } from '../../types/tests.types';
import { PlannerService } from '../planner.service';
import { v4 as uuidv4 } from 'uuid';

export class ResultAnalysisService {
  private plannerService = new PlannerService();
  async processSubmission(attemptId: string): Promise<TestAttempt> {
    const attempt = await testsRepository.getTestAttempt(attemptId);
    if (!attempt) throw new Error('Attempt not found');
    if (attempt.status === 'completed') return attempt; // Already processed

    const test = await testsRepository.getTestById(attempt.testId);
    if (!test) throw new Error('Test not found');

    const questions = await testsRepository.getQuestions(test.questionIds);
    const questionMap = new Map<string, Question>();
    questions.forEach(q => questionMap.set(q.id, q));

    let score = 0;
    let correctCount = 0;
    const totalAttempted = Object.keys(attempt.answers || {}).length;

    // Calculate score
    for (const [qId, selectedIdx] of Object.entries(attempt.answers || {})) {
      const q = questionMap.get(qId);
      if (q && q.correctAnswerIndex === selectedIdx) {
        score += test.positiveMarks;
        correctCount++;
      } else if (q) {
        score -= test.negativeMarks;
      }
    }

    const accuracy = totalAttempted > 0 ? (correctCount / totalAttempted) * 100 : 0;
    
    // Calculate total time
    let totalTimeSpent = 0;
    if (attempt.timeSpentPerQuestion) {
        totalTimeSpent = Object.values(attempt.timeSpentPerQuestion).reduce((a, b) => a + b, 0);
    }

    // Prepare updated attempt
    attempt.status = 'completed';
    attempt.completedAt = new Date().toISOString();
    attempt.score = score;
    attempt.accuracy = accuracy;
    attempt.totalTimeSpent = totalTimeSpent;
    attempt.percentile = 85; // Mock percentile for now

    // AI Analysis
    const needsRevision = accuracy < 70;
    attempt.aiAnalysis = {
        strengths: !needsRevision ? ['Good overall comprehension'] : [],
        weaknesses: needsRevision ? ['Needs revision on fundamental concepts'] : [],
        conceptGaps: [],
        recoveryPlanTasks: needsRevision ? [`Revise ${test.subject || 'concepts'} from missed questions`] : []
    };

    await testsRepository.saveTestAttempt(attempt);

    // If needs revision, add a task to the planner
    if (needsRevision) {
      try {
        const today = new Date().toISOString().split('T')[0];
        await this.plannerService.addTask(attempt.userId, today, {
          id: `rec_${uuidv4()}`,
          title: `Revision: ${test.title}`,
          type: 'revision',
          chapter: test.topic || test.subject || 'General',
          topic: test.topic || 'General',
          estimatedMinutes: 30,
          completed: false,
          priority: 'high'
        });
      } catch (e) {
        console.error("Failed to add AI recovery task to planner", e);
      }
    }

    return attempt;
  }
}

export const resultAnalysisService = new ResultAnalysisService();
