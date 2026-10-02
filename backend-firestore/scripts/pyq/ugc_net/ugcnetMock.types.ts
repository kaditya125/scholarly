/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * Sadhya — UGC NET Computer Science & Applications (Code 87) Mock Types
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Dedicated isolated types for UGC NET CS Practice and Mock Examination Corpus.
 * Kept strictly segregated from CanonicalPYQQuestion to enforce Two-Layer Isolation:
 *   - isAuthenticPYQ: false (CRITICAL INVARIANT: ALWAYS FALSE)
 *   - corpusBucket: 'PRACTICE_MOCK'
 *   - target collection: 'ugc_net_mock_questions' (NEVER 'pyq_questions')
 */

export type UGCNetCSQuestionType =
  | 'conceptual'
  | 'numerical'
  | 'code_analysis'
  | 'statement_based'
  | 'matching';

export type UGCNetCSDifficulty = 'EASY' | 'MEDIUM' | 'HARD';

export interface UGCNetCSMockQuestion {
  questionId: string; // e.g. "mock:ugc_net:cs_87:flt_01:q001:a8f2c1"
  examId: 'UGC_NET';
  subject: 'Computer Science and Applications';
  subjectCode: '87';
  paper: 'paper_ii';
  testType: 'FULL_LENGTH' | 'UNIT_SECTIONAL';
  testSeriesName: string; // e.g. "Sadhya UGC NET CS 2026 Target Series"
  mockPaperId: string;    // e.g. "UGC_NET_CS_FLT_01"
  corpusBucket: 'PRACTICE_MOCK';
  sourceTier: 'SYNTHETIC_ORIGINAL';
  sourceName: string;
  sourceType: 'rag_generated_mock';
  isAuthenticPYQ: false; // CRITICAL INVARIANT: ALWAYS FALSE
  isGenerated: true;
  unitNumber: number;    // 1 to 10
  unitTitle: string;
  topic: string;
  subtopic?: string;
  questionType: UGCNetCSQuestionType;
  questionNumber: number; // 1 to 100
  questionText: string;
  options: [string, string, string, string]; // Exactly 4 options
  correctAnswer: 'A' | 'B' | 'C' | 'D';
  explanation: string;
  difficulty: UGCNetCSDifficulty;
  marks: 2;              // UGC NET standard: 2 marks per question
  negativeMarks: 0;      // UGC NET standard: no negative marking
  language: 'en';
  exemplarPYQId?: string; // Authentic PYQ used as RAG style exemplar
  antiPlagiarismScore?: number; // Cosine similarity to authentic exemplar (must be < 0.85)
  qualityGateStatus: 'PASSED' | 'FLAGGED';
  contentHash: string;
  createdAt: number;
}
