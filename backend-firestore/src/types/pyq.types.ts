/**
 * Sadhya — Canonical PYQ Intelligence Types
 * Data models for Source Discovery, Canonical Question Bank, Provenance, Verification, Rights, and Ingestion.
 */

export type PYQSourceTier = 'TIER_A_OFFICIAL' | 'TIER_B_REPUTABLE_PLATFORM' | 'TIER_C_SECONDARY';

export type PYQSourceStatus =
  | 'DISCOVERED'
  | 'ACCESSIBLE'
  | 'FETCHED'
  | 'EXTRACTION_COMPLETED'
  | 'VERIFIED'
  | 'FAILED'
  | 'UNAVAILABLE'
  | 'BLOCKED_ROBOTS';

export type PYQDocumentType =
  | 'QUESTION_PAPER'
  | 'ANSWER_KEY'
  | 'SOLUTION_SET'
  | 'COMBINED_PAPER_KEY'
  | 'RESPONSE_SHEET';

export type PYQRightsStatus =
  | 'OFFICIAL_SOURCE_REVIEWED'
  | 'PUBLIC_DOMAIN_OR_CLEAR'
  | 'LICENSED'
  | 'PERMISSION_REQUIRED'
  | 'UNKNOWN'
  | 'DO_NOT_REDISTRIBUTE';

export type PYQVerificationStatus =
  | 'OFFICIAL_CONFIRMED'
  | 'SECONDARY_CONFIRMED'
  | 'MULTI_SOURCE_CONFIRMED'
  | 'SECONDARY_ONLY'
  | 'UNVERIFIED'
  | 'CONFLICTING';

export type PYQIngestionState =
  | 'DISCOVERED'
  | 'SOURCE_REVIEWED'
  | 'EXTRACTED'
  | 'VERIFIED'
  | 'RIGHTS_APPROVED'
  | 'READY_FOR_INDEX'
  | 'INDEXED'
  | 'RETRIEVAL_VERIFIED'
  | 'QUARANTINED';

export type PYQQuestionType =
  | 'MCQ_SINGLE'
  | 'MCQ_MULTIPLE'
  | 'NUMERICAL'
  | 'ASSERTION_REASON'
  | 'MATCH_FOLLOWING'
  | 'PASSAGE_COMPREHENSION';

export type PYQDifficulty = 'EASY' | 'MEDIUM' | 'HARD';

export type PYQLanguage = 'en' | 'hi' | 'bilingual';

/**
 * 1. PYQSourceEntry — Registry record for discovered official and secondary question sources.
 */
export interface PYQSourceEntry {
  sourceId: string; // Deterministic ID e.g. "src_jee_main_2025_session1_shift1_nta"
  examId: string;   // Canonical examId, e.g. "JEE_MAIN"
  examName: string;
  year: number;     // e.g. 2025
  session?: string; // e.g. "January", "Session 1", "June"
  paper?: string;   // e.g. "Paper 1", "Paper 2"
  shift?: string;   // e.g. "Shift 1", "Shift 2", "Forenoon"
  subject?: string; // e.g. "Physics", "Chemistry", "Mathematics", "Quantitative Aptitude"
  language: PYQLanguage;
  authority: string;// e.g. "National Testing Agency", "Staff Selection Commission"
  sourceTier: PYQSourceTier;
  sourceName: string; // e.g. "NTA Official Archive", "Careers360", "Testbook"
  sourceUrl: string;
  sourceDomain: string;
  documentType: PYQDocumentType;
  availabilityStatus: 'AVAILABLE' | 'PARTIAL' | 'MISSING' | 'BEHIND_RESTRICTION';
  retrievalStatus: PYQSourceStatus;
  rightsStatus: PYQRightsStatus;
  licenseNotes?: string;
  storagePath?: string;
  sourceDocumentHash?: string;
  questionCountDiscovered?: number;
  hasAnswerKey: boolean;
  hasSolutions: boolean;
  discoveredAt: number;
  lastCheckedAt: number;
  duplicateGroupId?: string;
}

/**
 * 2. PYQProvenanceRecord — Complete source trail attached to every question.
 */
export interface PYQProvenanceRecord {
  sourceTier: PYQSourceTier;
  sourceName: string;
  sourceUrl: string;
  sourceDomain: string;
  retrievedAt: number;
  isOfficial: boolean;
  extractedAnswer?: string;
  extractedSolution?: string;
  contentHash: string;
  notes?: string;
}

/**
 * 3. PYQDiagramAsset — Diagram, circuit, table, or graph required by the question.
 */
export interface PYQDiagramAsset {
  assetId: string;
  storagePath: string;
  downloadUrl?: string;
  altText: string;
  isRequiredForAnswering: boolean;
}

/**
 * 4. MatchTheFollowingData — Structured support for Match the Following questions.
 */
export interface MatchTheFollowingData {
  leftColumn: { id: string; text: string }[];
  rightColumn: { id: string; text: string }[];
  correctMapping: Record<string, string>; // e.g. { "A": "3", "B": "1", "C": "4", "D": "2" }
}

/**
 * 5. CanonicalPYQQuestion — The definitive canonical representation of a Previous Year Question.
 */
export interface CanonicalPYQQuestion {
  questionId: string;       // Deterministic canonical ID: `pyq:{examId}:{year}:{session}:{shift}:{qNumber}:{hash}`
  examId: string;           // Canonical exam ID e.g. "JEE_MAIN"
  examName: string;
  year: number;
  session?: string;
  paper?: string;
  shift?: string;
  subject: string;          // Canonical subject e.g. "Physics"
  chapter?: string;
  topic?: string;           // Canonical topic e.g. "Electrostatics"
  subtopic?: string;
  syllabusNodeId?: string;  // Foreign key to canonical syllabus node in `exam_syllabi_graphs`
  questionNumber: number;
  questionText: string;     // Normalized text with LaTeX equations ($...$ / $$...$$)
  questionType: PYQQuestionType;
  options?: string[];       // Normalized options with LaTeX preserved
  correctAnswer: string;    // Normalized canonical answer (e.g. "B", "24.5", "A,C")
  correctAnswerSource: string; // e.g. "NTA Official Final Answer Key"
  solution?: string;        // Step-by-step solution
  solutionSource?: string;  // e.g. "Sadhya Academic Review" or platform name
  explanation?: string;
  difficulty?: PYQDifficulty;
  marks?: number;
  negativeMarks?: number;
  language: PYQLanguage;
  matchData?: MatchTheFollowingData;
  passageText?: string;     // Enclosing passage if question is part of a reading comprehension block
  diagrams?: PYQDiagramAsset[];
  extractionQualityScore: number; // 0.0 to 1.0 (flags low-confidence OCR for human review)
  sourceId: string;
  sourceUrl: string;
  sourceType: PYQSourceTier;
  provenanceRecords: PYQProvenanceRecord[];
  verificationStatus: PYQVerificationStatus;
  verificationEvidence?: {
    officialAnswer?: string;
    secondaryAnswers?: Record<string, string>;
    conflictDetails?: string;
    resolvedAt?: number;
  };
  rightsStatus: PYQRightsStatus;
  rightsSource: string;
  redistributionAllowed: boolean;
  contentHash: string;      // SHA-256 of normalized text + options
  duplicateGroupId?: string;// Group ID if multiple sources share this question
  ingestionState: PYQIngestionState;
  vectorIndexed: boolean;
  vectorIndexedAt?: number;
  retrievalTested: boolean;
  retrievalTestedAt?: number;
  createdAt: number;
  updatedAt: number;
}

/**
 * 6. PYQAvailabilityMatrixRow — Human and machine readable coverage row.
 */
export type PYQCompletenessStatus =
  | 'COMPLETE'
  | 'PARTIAL'
  | 'SOURCE_UNAVAILABLE'
  | 'RIGHTS_RESTRICTED'
  | 'EXTRACTION_FAILED'
  | 'VERIFICATION_PENDING'
  | 'INDEXING_PENDING'
  | 'RETRIEVAL_PENDING'
  | 'DISCOVERED_ONLY';

export interface PYQAvailabilityMatrixRow {
  examId: string;
  examName: string;
  year: number;
  session?: string;
  paper?: string;
  shift?: string;
  subject?: string;
  officialAvailable: boolean;
  officialSource?: string;
  secondaryFallback?: string;
  expectedCount: number;
  expectedCountSource?: string;
  expectedCountConfidence?: 'OFFICIAL_NOTIFICATION' | 'OFFICIAL_PAPER' | 'REPUTABLE_SECONDARY' | 'ESTIMATED' | 'UNKNOWN';
  discoveredCount: number;
  extractedCount: number;
  verifiedCount: number;
  rightsApprovedCount: number;
  readyForIndexCount: number;
  indexedCount: number;
  retrievalTestedCount: number;
  retrievalVerifiedCount: number;
  missingCount: number;
  coveragePercentage: number | null;
  totalQuestions: number;
  verifiedQuestions: number;
  pendingVerification: number;
  hasAnswerKey: boolean;
  hasSolutions: boolean;
  rightsStatus: PYQRightsStatus;
  status: PYQCompletenessStatus;
}

/**
 * 7. PYQAnalyticsSummary — Topic distribution and historical trends.
 */
export interface PYQTopicWeightage {
  topic: string;
  subject: string;
  questionCount: number;
  percentageWeight: number;
  yearsAppeared: number[];
  averageDifficulty: PYQDifficulty;
  commonQuestionTypes: PYQQuestionType[];
}

export interface PYQExamAnalytics {
  examId: string;
  totalQuestions: number;
  yearsCovered: number[];
  subjectDistribution: Record<string, number>;
  difficultyDistribution: Record<PYQDifficulty, number>;
  questionTypeDistribution: Record<PYQQuestionType, number>;
  topTopics: PYQTopicWeightage[];
  updatedAt: number;
}
