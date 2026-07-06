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
  owner?: string;
  editors?: string[];
  viewers?: string[];
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

export type ProcessingStatus = 'PENDING' | 'UPLOADING' | 'PROCESSING' | 'OCR' | 'EXTRACTING' | 'CHUNKING' | 'EMBEDDING' | 'INDEXING' | 'GENERATING_GRAPH' | 'READY' | 'FAILED';

export interface DocumentSource {
  id: string;
  userId: string;
  notebookId: string;
  title: string;          // Maps to originalName
  originalName?: string;
  type: string;
  mimeType?: string;
  extension?: string;
  sizeBytes: number;
  storagePath?: string;
  gcsPath?: string;       // Legacy / current path
  downloadUrl?: string;
  
  status: ProcessingStatus;
  parsingStatus?: string;
  embeddingStatus?: string;
  knowledgeGraphStatus?: string;
  summaryStatus?: string;
  flashcardStatus?: string;
  quizStatus?: string;

  totalPages?: number;
  chunksExtracted: number;
  totalTokens?: number;
  
  checksum?: string;
  version?: number;
  error?: string;
  
  conceptsExtracted: number;
  authorityScore: number;
  processingDurationMs: number;
  createdAt: number;
  uploadedAt?: number;
}

export interface LearningAsset {
  id: string;
  notebookId: string;
  type: 'FLASHCARDS' | 'QUIZ' | 'MIND_MAP' | 'NOTES' | 'SUMMARY' | 'TIMELINE' | 'PODCAST';
  title: string;
  description?: string;
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

export type PodcastStatus = 
  | 'PENDING'
  | 'GENERATING_SCRIPT'
  | 'GENERATING_AUDIO'
  | 'STITCHING_AUDIO'
  | 'UPLOADING'
  | 'READY'
  | 'FAILED';

export interface PodcastMetadata {
  id: string; // Document ID (podcastId)
  notebookId: string;
  userId: string;
  title: string;
  description: string;
  duration?: number;
  language: string;
  voiceProvider: string;
  speakers: string[];
  transcriptUrl?: string;
  audioUrl?: string;
  coverImageUrl?: string;
  status: PodcastStatus;
  createdAt: number;
  updatedAt: number;
  estimatedListeningTime?: number;
  totalWords?: number;
  totalCharacters?: number;
}
