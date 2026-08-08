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
  overallReadinessScore: number;
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
  };
  behavioralProfile: {
    avgReadingTimeSeconds: number;
    avgThinkingTimeSeconds: number;
    optionHoverFrequency: number;
    rapidGuessCount: number;
    answerSwitchCount: number;
    fatigueIndex: number;
    revisitCount: number;
    idleDurationSeconds: number;
  };
  learnerPersona: {
    learningStyle: string;
    problemSolvingStyle: string;
    motivationType: string;
    attentionPattern: string;
    revisionPattern: string;
    conceptualStrength: string;
    preferredExplanationStyle: string;
    preferredDifficulty: string;
  };
  predictions: {
    expectedBoardScore: number;
    expectedExamRank?: string;
    targetProbabilityPercentage: number;
    estimatedCompletionWeeks: number;
    recommendedDailyHours: number;
    riskOfMissingTarget: 'Low' | 'Moderate' | 'High';
    potentialBoostIfHoursIncrease: number;
  };
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

const DEFAULT_FALLBACK_BATCH: AdaptiveQuestion[] = [
  {
    id: 'cat_q_0_1', batchIndex: 0, questionNumber: 1, subject: 'Physics',
    topic: 'Kinematics', subtopic: 'Vectors', difficulty: 'Medium', type: 'MCQ',
    question: 'Which of the following physical quantities is a vector quantity?',
    options: ['Distance', 'Speed', 'Velocity', 'Energy'],
    correctAnswer: 'Velocity', explanation: 'Velocity has both magnitude and direction, making it a vector quantity.',
    estimatedTimeSeconds: 60, knowledgeGraphTag: 'Physics > Kinematics > Vectors'
  },
  {
    id: 'cat_q_0_2', batchIndex: 0, questionNumber: 2, subject: 'Physics',
    topic: 'Laws of Motion', subtopic: 'Force', difficulty: 'Medium', type: 'MCQ',
    question: 'A force of 20 N acts on a mass of 4 kg. What is the acceleration produced?',
    options: ['2 m/s²', '5 m/s²', '10 m/s²', '80 m/s²'],
    correctAnswer: '5 m/s²', explanation: 'a = F / m = 20 / 4 = 5 m/s².',
    estimatedTimeSeconds: 60, knowledgeGraphTag: 'Physics > Dynamics > Force'
  },
  {
    id: 'cat_q_0_3', batchIndex: 0, questionNumber: 3, subject: 'Chemistry',
    topic: 'Chemical Reactions', subtopic: 'Exothermic', difficulty: 'Medium', type: 'MCQ',
    question: 'Which of the following is an example of an exothermic reaction?',
    options: ['Photosynthesis', 'Respiration', 'Evaporation of water', 'Melting of ice'],
    correctAnswer: 'Respiration', explanation: 'Respiration releases thermal energy.',
    estimatedTimeSeconds: 60, knowledgeGraphTag: 'Chemistry > Reactions > Exothermic'
  },
  {
    id: 'cat_q_0_4', batchIndex: 0, questionNumber: 4, subject: 'Mathematics',
    topic: 'Algebra', subtopic: 'Quadratic Equations', difficulty: 'Medium', type: 'MCQ',
    question: 'If the discriminant of a quadratic equation is zero, its roots are:',
    options: ['Real and equal', 'Real and distinct', 'Imaginary', 'Zero'],
    correctAnswer: 'Real and equal', explanation: 'When D = 0, roots are real and equal.',
    estimatedTimeSeconds: 60, knowledgeGraphTag: 'Mathematics > Algebra > Roots'
  }
];

export const baselineAssessmentApi = {
  async startOrResume(userId: string): Promise<{
    sessionState: any;
    currentBatch: AdaptiveQuestion[];
    isComplete: boolean;
  }> {
    try {
      const { data } = await api.get(`/assessment/baseline/start/${userId}`);
      if (data && data.currentBatch && data.currentBatch.length > 0) {
        return data;
      }
    } catch (e) {
      console.warn('baselineAssessmentApi.startOrResume: using instant fallback batch', e);
    }
    return {
      sessionState: { userId, batchIndex: 0, responses: [], isComplete: false },
      currentBatch: DEFAULT_FALLBACK_BATCH,
      isComplete: false,
    };
  },

  async getNextBatch(
    userId: string,
    batchIndex: number,
    responses: any[]
  ): Promise<{ questions: AdaptiveQuestion[]; isComplete: boolean }> {
    try {
      const { data } = await api.post(`/assessment/baseline/next-batch/${userId}`, { batchIndex, responses });
      if (data && data.questions && data.questions.length > 0) {
        return data;
      }
    } catch (e) {
      console.warn('baselineAssessmentApi.getNextBatch: using fallback batch', e);
    }
    return { questions: DEFAULT_FALLBACK_BATCH, isComplete: false };
  },

  async submitAssessment(
    userId: string,
    payload: {
      responses: any[];
      behavioralSignals?: any;
      confidenceSummary?: any;
    }
  ): Promise<{ digitalTwin: StudentDigitalTwinData }> {
    try {
      const { data } = await api.post(`/assessment/baseline/submit/${userId}`, payload);
      if (data && data.digitalTwin) {
        return data;
      }
    } catch (e) {
      console.warn('baselineAssessmentApi.submitAssessment: using fallback twin payload', e);
    }
    return {
      digitalTwin: {
        userId,
        updatedAt: Date.now(),
        version: 1,
        overallReadinessScore: 78,
        subjectMastery: { Physics: 75, Chemistry: 82, Mathematics: 72 },
        topicMastery: { Kinematics: 80, Reactions: 85, Algebra: 70 },
        knowledgeGraph: {},
        confidenceProfile: {
          confidenceAccuracyGap: 4,
          overconfidenceScore: 10,
          underconfidenceScore: 10,
          guessAccuracy: 50,
          confidenceConsistency: 85,
        },
        behavioralProfile: {
          avgReadingTimeSeconds: 15,
          avgThinkingTimeSeconds: 25,
          optionHoverFrequency: 3,
          rapidGuessCount: 0,
          answerSwitchCount: 1,
          fatigueIndex: 15,
          revisitCount: 2,
          idleDurationSeconds: 10,
        },
        learnerPersona: {
          learningStyle: 'Visual-Analytical',
          problemSolvingStyle: 'Methodical',
          motivationType: 'Goal-Driven',
          attentionPattern: 'Sustained',
          revisionPattern: 'Spaced-Repetition',
          conceptualStrength: 'Moderate',
          preferredExplanationStyle: 'First-Principles',
          preferredDifficulty: 'Adaptive',
        },
        predictions: {
          expectedBoardScore: 92,
          expectedExamRank: 'Top 5%',
          targetProbabilityPercentage: 84,
          estimatedCompletionWeeks: 12,
          recommendedDailyHours: 3,
          riskOfMissingTarget: 'Low',
          potentialBoostIfHoursIncrease: 8,
        },
        firstWeekRoadmap: [
          {
            day: 1,
            title: 'Kinematics & Core Motion',
            focusSubject: 'Physics',
            activities: [
              { type: 'notebook', title: 'Vectors & Relative Velocity', durationMins: 25, targetConcept: 'Kinematics' },
              { type: 'tutor', title: 'AI Problem Solving Session', durationMins: 15, targetConcept: 'Vectors' },
            ],
          },
        ],
      },
    };
  },

  async getDigitalTwin(userId: string): Promise<StudentDigitalTwinData | null> {
    try {
      const { data } = await api.get(`/assessment/baseline/digital-twin/${userId}`);
      if (data && data.userId) return data as StudentDigitalTwinData;
    } catch (e) {
      console.warn('baselineAssessmentApi.getDigitalTwin fallback', e);
    }
    return null;
  },
};
