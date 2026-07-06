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
  estimatedCompletionHours?: number;
  isPinned: boolean;
  isFavorite: boolean;
  isArchived: boolean;
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
  auditLogs: {
    userId: string;
    action: string;
    timestamp: number;
    details?: any;
  }[];
}

export type ProcessingStatus = 'PENDING' | 'UPLOADING' | 'PROCESSING' | 'OCR' | 'EXTRACTING' | 'CHUNKING' | 'EMBEDDING' | 'INDEXING' | 'GENERATING_GRAPH' | 'READY' | 'FAILED';

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
  metadata?: ExtractionMetadata;
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

export type AssetContent = 
  | { flashcards: { question: string; answer: string; hint?: string }[] }
  | { quiz: { question: string; options: string[]; answerIndex: number; explanation: string }[] }
  | { 
      mindMap: { 
        nodes: { 
          id: string; 
          title: string; 
          description?: string; 
          category?: string; 
          importance?: number; 
          difficulty?: number; 
          parentId?: string; 
          childrenIds?: string[]; 
          references?: string[]; 
          relatedAssets?: string[] 
        }[]; 
        edges: { 
          source: string; 
          target: string; 
          relationshipType?: string; 
          direction?: string; 
          label?: string; 
          weight?: number 
        }[] 
      } 
    }
  | { notes: { markdown: string; concepts: string[] } }
  | { summary: { markdown: string; keyTakeaways: string[] } }
  | { 
      timeline: { 
        events: { 
          date: string; 
          label: string; 
          description: string; 
          importance?: string; 
          references?: string[]; 
          images?: string[]; 
          relatedConcepts?: string[] 
        }[] 
      } 
    }
  | { podcastScript: { speakers: string[]; script: { speaker: string; text: string }[] } };

export interface LearningAsset {
  id: string;
  notebookId: string;
  userId: string;
  type: AssetType;
  title: string;
  description?: string;
  content: AssetContent;
  sourceDocIds: string[];
  createdAt: number;
  updatedAt: number;
  
  // Community / Social Fields
  isPublic?: boolean;
  authorId?: string;
  authorName?: string;
  aiModel?: string; // e.g., 'gemini-1.5-pro'
  rating?: number;
  downloads?: number;
  bookmarks?: number;
  reports?: number;
  
  // Phase 4 Metadata
  isArchived?: boolean;
  isFavorite?: boolean;
  subject?: string;
  chapter?: string;
  difficulty?: 'Beginner' | 'Intermediate' | 'Advanced';
  examFocus?: string;
  versionHistory?: { updatedAt: number; changes: string }[];
  estimatedStudyTime?: number; // minutes
}

export interface KGNode {
  id: string;              // Unique concept identifier
  notebookId: string;
  label: string;           // Display name
  type: 'CONCEPT' | 'PERSON' | 'PLACE' | 'FORMULA' | 'EVENT';
  definition: string;
  sourceDocIds: string[];
  importance: number;      // 0.0 to 1.0
  difficulty: 'Easy' | 'Medium' | 'Hard';
  estimatedStudyTime: number; // minutes
  masteryPercentage: number;
  
  // Phase 4 Extensions
  revisionStatus?: 'DUE' | 'UP_TO_DATE' | 'OVERDUE';
  confidenceScore?: number;
  quizAccuracy?: number;
  lastRevised?: number;
  learningPriority?: 'HIGH' | 'MEDIUM' | 'LOW';
  spacedRepetitionInterval?: number; // days
  
  linkedAssetIds?: string[]; // Connections to flashcards, notes, etc.
  crossNotebookReferences?: { notebookId: string; nodeId: string }[];
  prerequisites?: string[]; // IDs of other nodes
}

export interface KGEdge {
  id: string;
  sourceNodeId: string;
  targetNodeId: string;
  relationshipType: 'PREREQUISITE_OF' | 'RELATED_TO' | 'PART_OF' | 'OPPOSITE_OF';
  confidence: number;
}
