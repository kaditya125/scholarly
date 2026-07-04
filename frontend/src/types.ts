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

// --- Notebook Workspace Types ---

export interface Notebook {
  id: string;
  userId: string;
  title: string;
  color: string;
  createdAt: number;
  updatedAt: number;
  lastOpenedAt?: number;
  lastChatAt?: number;
  currentLearningMode?: string;
  isPinned: boolean;
  isFavorite: boolean;
  isArchived: boolean;
  stats: {
    documentCount: number;
    conversationCount: number;
    knowledgeGraphNodes: number;
    flashcardsCount: number;
    quizCount: number;
  };
}

export type ProcessingStatus = 'PENDING' | 'EXTRACTING' | 'CHUNKING' | 'EMBEDDING' | 'GRAPH_BUILDING' | 'INDEXING' | 'READY' | 'FAILED';

export interface DocumentSource {
  id: string;
  notebookId: string;
  title: string;
  type: string;
  pages?: number;
  sizeBytes: number;
  status: ProcessingStatus;
  chunksExtracted: number;
  createdAt: number;
}

export interface LearningAsset {
  id: string;
  notebookId: string;
  type: 'FLASHCARDS' | 'QUIZ' | 'MIND_MAP' | 'NOTES' | 'SUMMARY' | 'TIMELINE';
  title: string;
  content: any; // We'll keep it as `any` on frontend for now, to be cast later
  createdAt: number;
}

export interface KGNode {
  id: string;
  label: string;
  type: string;
  definition: string;
}

export interface KGEdge {
  id: string;
  sourceNodeId: string;
  targetNodeId: string;
  relationshipType: string;
}
