/**
 * Sadhya — BPSC Mock Test Intelligence Types
 * Dedicated isolated models for BPSC Mock and Practice Examination Corpus.
 * Kept strictly segregated from CanonicalPYQQuestion to prevent any corpus contamination.
 */

export type BPSCQuestionType =
  | 'factual'
  | 'conceptual'
  | 'statement_based'
  | 'matching'
  | 'assertion_reason';

export type BPSCDifficulty = 'EASY' | 'MEDIUM' | 'HARD';

export type BPSCSubject =
  | 'History'
  | 'Geography'
  | 'Indian Polity & Economy'
  | 'General Science'
  | 'Current Affairs'
  | 'General Mental Ability';

export interface BPSCMockQuestion {
  questionId: string; // e.g. "mock:bpsc:sectional:science:2026:a1b2c3d4"
  examId: 'BPSC_CCE';
  examStage: 'prelims';
  patternVersion: 'latest_4_options_one_third_neg';
  testType: 'SECTIONAL' | 'FULL_LENGTH';
  testSeriesName: string; // e.g. "Sadhya BPSC 71st/72nd Target Series"
  mockPaperId?: string;   // e.g. "BPSC_FLT_01"
  corpusBucket: 'PRACTICE_MOCK';
  sourceTier: 'TIER_B_REPUTABLE' | 'SYNTHETIC_ORIGINAL';
  sourceName: string;     // e.g. "Sadhya Academic Engine" | "Reference Benchmarks"
  sourceType: 'ai_generated_mock' | 'third_party_reference';
  isAuthenticPYQ: false;  // CRITICAL INVARIANT: ALWAYS FALSE
  isGenerated: boolean;
  subject: BPSCSubject;
  subtopic: string;
  isBiharSpecial: boolean;
  questionType: BPSCQuestionType;
  questionNumber: number;
  questionText: string;
  options: [string, string, string, string]; // Strictly 4 options: A, B, C, D
  correctAnswer: 'A' | 'B' | 'C' | 'D';
  explanation: string;
  difficulty: BPSCDifficulty;
  marks: 1;
  negativeMarks: 0.33;
  language: 'en';
  contentHash: string;
  createdAt: number;
  updatedAt: number;
}
