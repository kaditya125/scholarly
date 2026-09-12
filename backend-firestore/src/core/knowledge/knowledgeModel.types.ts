/**
 * Unified Knowledge Model & Multi-Corpus Types
 *
 * Defines the canonical metadata contract and EvidencePack structure across all
 * educational corpora in Sadhya:
 * - NCERT Textbooks & Chapters
 * - Official Syllabi & Hierarchical Graphs
 * - Authentic PYQs & Exam Intelligence
 * - Reference Books (Lucent GK, S. Chand Quantitative/Reasoning)
 * - Study Materials & Notes
 * - Practice Question Bank
 * - User Uploaded Documents
 */

export type CorpusAuthority =
  | 'OFFICIAL_SYLLABUS'
  | 'NCERT'
  | 'AUTHENTIC_PYQ'
  | 'REFERENCE_BOOK'
  | 'STUDY_MATERIAL'
  | 'PRACTICE_BANK'
  | 'USER_UPLOAD';

export const CORPUS_AUTHORITY_WEIGHTS: Record<CorpusAuthority, number> = {
  OFFICIAL_SYLLABUS: 1.5,
  NCERT: 1.5,
  AUTHENTIC_PYQ: 1.4,
  REFERENCE_BOOK: 1.1,
  STUDY_MATERIAL: 1.0,
  PRACTICE_BANK: 0.95,
  USER_UPLOAD: 1.0,
};

export type EducationalIntent =
  | 'CONCEPT_EXPLANATION'
  | 'EXAM_PREPARATION'
  | 'PYQ_PRACTICE'
  | 'SYLLABUS_INQUIRY'
  | 'REVISION'
  | 'TEST_GENERATION'
  | 'FACTUAL_QUERY'
  | 'GENERAL_LEARNING';

export interface CorpusRoutingDecision {
  useCurriculum: boolean;
  useOfficialSyllabus: boolean;
  usePYQs: boolean;
  useReferenceBooks: boolean;
  useStudyMaterials: boolean;
  useUserNotebook: boolean;
  targetExamId?: string;
  targetSubject?: string;
  targetClass?: string;
  targetTopic?: string;
  referenceBookFilters?: {
    books?: string[];
    publisher?: string;
  };
  reasoning: string;
}

export interface CanonicalKnowledgeItem {
  id: string;
  sourceId: string;
  notebookId?: string;
  title: string;
  text: string;
  authority: CorpusAuthority;
  authorityWeight: number;
  relevanceScore: number;
  weightedScore: number;
  namespace: string;
  metadata: {
    board?: string;
    class?: string;
    subject?: string;
    chapter?: string;
    topic?: string;
    subtopic?: string;
    examId?: string;
    examCycle?: string;
    paperId?: string;
    stageId?: string;
    syllabusNodeId?: string;
    pageNumber?: number;
    paragraphIndex?: number;
    chunkIndex?: number;
    figureAssetUrl?: string | null;
    year?: number;
    questionNumber?: number;
    difficulty?: string;
    questionType?: string;
    [key: string]: any;
  };
  provenanceRationale: string;
}

export interface ExamPatternProfile {
  examId: string;
  totalQuestionsAnalyzed: number;
  yearsCovered: number[];
  subjectDistribution: Record<string, number>;
  difficultyDistribution: {
    EASY: number;
    MEDIUM: number;
    HARD: number;
  };
  questionTypeDistribution: Record<string, number>;
  highYieldTopics: Array<{
    topic: string;
    subject: string;
    questionCount: number;
    percentageWeight: number;
    yearsAppeared: number[];
  }>;
  recentTrends?: string[];
}

export interface EvidencePack {
  query: string;
  intent: EducationalIntent;
  routing: CorpusRoutingDecision;
  curriculumEvidence: CanonicalKnowledgeItem[];
  syllabusEvidence: CanonicalKnowledgeItem[];
  pyqEvidence: CanonicalKnowledgeItem[];
  referenceEvidence: CanonicalKnowledgeItem[];
  userNotesEvidence: CanonicalKnowledgeItem[];
  patternProfile?: ExamPatternProfile;
  combinedGroundingText: string;
  citations: Array<{
    source: string;
    text: string;
    authority: CorpusAuthority;
    score: number;
    pageNumber?: number;
    figureAssetUrl?: string | null;
    rationale: string;
  }>;
  retrievalLatencyMs: number;
}

export interface KnowledgeIntegrityReport {
  timestamp: string;
  status: 'PASS' | 'WARN' | 'FAIL';
  corpora: {
    ncert: { totalVectors: number; distinctCurriculumVectors: number; reachable: boolean };
    officialSyllabus: { totalVersions: number; totalVectors: number; reachable: boolean };
    pyqs: { totalQuestions: number; totalVectors: number; indexedPercentage: number; reachable: boolean };
    referenceBooks: { totalVectors: number; lucentGk: number; schandReasoning: number; schandQuant: number; reachable: boolean };
    userNotebooks: { totalNotebooks: number; totalVectors: number; reachable: boolean };
  };
  orphanedResources: string[];
  unreachableResources: string[];
  missingProvenance: string[];
  duplicateResources: string[];
  brokenMappings: string[];
  unusedRetrievalPaths: string[];
}
