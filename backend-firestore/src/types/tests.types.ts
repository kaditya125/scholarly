import { Subject, Difficulty } from './index';
export { Subject, Difficulty };

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
  subject?: Subject | string;
  topic?: string;
  difficulty: Difficulty | string;
  isLive: boolean;
  questionIds: string[]; // References to Question documents
  sections?: { name: string; questionIds: string[]; totalQuestions: number; marks: number }[];
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
  subject: Subject | string;
  topic: string;
  difficulty: Difficulty | string;
  text: string;
  options: string[];
  correctAnswerIndex: number;
  explanation: string; // Used for study mode / result analysis
  marks?: number;
  negativeMarks?: number;
  examId?: string;
  section?: string;
  sourcePyqId?: string;
  sourceYear?: number;
  sourceShift?: string;
  sourcePaper?: string;
  questionOrigin?: 'AUTHENTIC_PYQ' | 'PYQ_INSPIRED' | 'REFERENCE_BOOK' | 'GENERATED';
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
