/**
 * Sadhya — UPSC CSE Prelims Mock Test Intelligence Types
 * Kept strictly segregated from CanonicalPYQQuestion to prevent corpus contamination.
 *
 * UPSC Prelims Pattern:
 *   GS Paper 1  : 100 Qs, +2.00 / -0.66 marks
 *   CSAT Paper 2: 80 Qs,  +2.50 / -0.83 marks (qualifying, 33%)
 */

export type UPSCQuestionType =
  | 'factual'
  | 'conceptual'
  | 'statement_based'
  | 'matching'
  | 'assertion_reason'
  | 'comprehension'
  | 'data_interpretation';

export type UPSCDifficulty = 'EASY' | 'MEDIUM' | 'HARD';

export type UPSCGSSubject =
  | 'Indian Polity & Governance'
  | 'History & Culture'
  | 'Geography'
  | 'Environment & Ecology'
  | 'Indian Economy'
  | 'Science & Technology'
  | 'Current Affairs'
  | 'International Relations';

export type UPSCCSATSubject =
  | 'Reading Comprehension'
  | 'Quantitative Aptitude'
  | 'Logical Reasoning'
  | 'Decision Making';

export type UPSCPaperType = 'GS_PAPER_1' | 'CSAT_PAPER_2';

export interface UPSCMockQuestion {
  questionId: string;
  examId: 'UPSC_CSE';
  examStage: 'prelims';
  paperType: UPSCPaperType;
  patternVersion: 'gs1_4_options_two_marks' | 'csat_4_options_two_five_marks';
  testType: 'SECTIONAL' | 'FULL_LENGTH';
  testSeriesName: string;
  mockPaperId: string;
  corpusBucket: 'PRACTICE_MOCK';
  sourceTier: 'SYNTHETIC_ORIGINAL';
  sourceName: string;
  sourceType: 'ai_generated_mock';
  isAuthenticPYQ: false;
  isGenerated: boolean;
  subject: UPSCGSSubject | UPSCCSATSubject;
  subtopic: string;
  questionType: UPSCQuestionType;
  questionNumber: number;
  questionText: string;
  options: [string, string, string, string];
  correctAnswer: 'A' | 'B' | 'C' | 'D';
  explanation: string;
  difficulty: UPSCDifficulty;
  marks: 2.0 | 2.5;
  negativeMarks: 0.66 | 0.83;
  language: 'en';
  contentHash: string;
  createdAt: number;
  updatedAt: number;
}
