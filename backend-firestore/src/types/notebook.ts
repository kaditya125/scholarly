export interface Notebook {
  id: string;
  userId: string;
  title: string;
  color: string;
  createdAt: number;
  updatedAt: number;
  stats: {
    documentCount: number;
    conversationCount: number;
    storageUsedBytes: number;
    knowledgeGraphNodes: number;
    flashcardsCount: number;
    quizCount: number;
    masteryPercentage: number;
    completionPercentage: number;
  };
  learningGoals: string[];
  weakTopics: string[];
  strongTopics: string[];
  owner: string;
  editors: string[];
  viewers: string[];
}

export type ProcessingStatus = 'PENDING' | 'EXTRACTING' | 'CHUNKING' | 'EMBEDDING' | 'GRAPH_BUILDING' | 'INDEXING' | 'READY' | 'FAILED';

export interface ExtractionMetadata {
  chapters: string[];
  headings: string[];
  definitions: { term: string; definition: string }[];
  theorems: string[];
  formulae: string[];
  importantFacts: string[];
  keywords: string[];
  people: string[];
  places: string[];
  dates: string[];
  learningObjectives: string[];
  difficultyLevel: 'Easy' | 'Medium' | 'Hard';
  estimatedStudyTimeMinutes: number;
}

export interface DocumentSource {
  id: string;
  notebookId: string;
  userId: string;
  title: string;
  type: string;
  sizeBytes: number;
  pages?: number;
  status: ProcessingStatus;
  chunksExtracted: number;
  conceptsExtracted: number;
  authorityScore: number;
  processingDurationMs: number;
  createdAt: number;
  metadata?: ExtractionMetadata;
  gcsPath?: string; // If stored in Google Cloud Storage
}

export type TimelineEventType = 
  | 'NOTEBOOK_CREATED' 
  | 'DOCUMENT_UPLOADED' 
  | 'DOCUMENT_INDEXED' 
  | 'GRAPH_BUILT' 
  | 'FLASHCARDS_GENERATED' 
  | 'QUIZ_ATTEMPTED' 
  | 'REVISION_COMPLETED' 
  | 'WEAK_TOPIC_DETECTED' 
  | 'MASTERY_IMPROVED';

export interface TimelineEvent {
  id: string;
  notebookId: string;
  type: TimelineEventType;
  description: string;
  timestamp: number;
  metadata?: any;
}

export type AssetType = 'FLASHCARDS' | 'QUIZ' | 'MIND_MAP' | 'NOTES' | 'SUMMARY' | 'TIMELINE' | 'PODCAST_SCRIPT';

export interface LearningAsset {
  id: string;
  notebookId: string;
  userId: string;
  type: AssetType;
  title: string;
  content: any; // Can be array of flashcards, markdown for notes, json for quiz
  sourceDocIds: string[];
  createdAt: number;
  updatedAt: number;
}
