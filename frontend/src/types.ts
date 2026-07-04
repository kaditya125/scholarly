export type Level = "Primary" | "Middle" | "Secondary" | "Higher Secondary";
export type Subject = "Child Development and Pedagogy" | "General Studies" | "Bihar GK" | "Mathematics" | "Science";

export interface Question {
  id: string;
  subject: Subject;
  topic: string;
  level: Level;
  type: "MCQ"; // Keeping it simple for the prototype
  text: string;
  options: string[];
  correctAnswerIndex: number;
  explanation: string;
}

export interface UserStats {
  totalTestsAttempted: number;
  averageAccuracy: number; // percentage
  overallRank: number;
  studyStreakDays: number;
  completionPercentage: number;
  performanceHistory: { date: string; score: number }[];
  weakTopics: string[];
  strongTopics: string[];
}

export interface TestResult {
  score: number;
  total: number;
  timeSpentSeconds: number;
  answers: Record<string, number>; // questionId -> selectedOptionIndex
}
