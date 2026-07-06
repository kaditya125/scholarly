import { Subject, Difficulty } from './index';

export type ExamCategory = 'SSC' | 'UPSC' | 'Banking' | 'Teaching' | 'State PSC' | 'Railways' | 'Engineering' | 'Medical';
export type TestType = 'full-length' | 'sectional' | 'chapter' | 'topic' | 'pyq' | 'adaptive';

export interface TestSeries {
  id: string;
  title: string;
  description: string;
  category: ExamCategory;
  targetExam: string; // e.g. "SSC CGL 2026"
  totalTests: number;
  featured: boolean;
  enrollmentCount: number;
  averageRating: number;
  thumbnailUrl?: string;
  createdAt: string;
}

export interface MockTest {
  id: string;
  seriesId?: string; // Optional: If part of a TestSeries
  title: string;
  type: TestType;
  category: ExamCategory;
  subject?: Subject;
  topic?: string;
  difficulty: Difficulty;
  isLive: boolean;
  questionIds: string[]; // References to Question documents
  totalQuestions: number;
  totalMarks: number;
  durationMinutes: number;
  positiveMarks: number;
  negativeMarks: number;
  participantsCount: number;
  averageScore?: number;
  aiRecommended?: boolean;
}

export interface Question {
  id: string;
  subject: Subject;
  topic: string;
  difficulty: Difficulty;
  text: string;
  options: string[];
  correctAnswerIndex: number;
  explanation: string; // Used for study mode / result analysis
}

export interface TestAttempt {
  id: string;
  userId: string;
  testId: string;
  seriesId?: string;
  startedAt: string;
  completedAt?: string;
  status: 'in-progress' | 'completed' | 'abandoned';
  
  // Maps questionId to selected option index
  answers: Record<string, number>;
  
  // Maps questionId to time spent in seconds
  timeSpentPerQuestion: Record<string, number>;
  
  // Set of questionIds marked for review
  markedForReview: string[];
  
  score?: number;
  accuracy?: number; // 0-100
  totalTimeSpent?: number;
  percentile?: number;
  
  // AI Generated after submission
  aiAnalysis?: {
    strengths: string[];
    weaknesses: string[];
    conceptGaps: string[];
    recoveryPlanTasks: string[]; // Recommendations for Planner
  };
}
