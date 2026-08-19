/**
 * Student Context Types
 * 
 * These interfaces define the complete student profile and context
 * that Sadhya AI uses to personalize every interaction.
 */

// ─── Supported Examinations ───────────────────────────────────────────────────

export const SUPPORTED_EXAMS = [
  // SSC
  'SSC CGL', 'SSC CHSL', 'SSC MTS', 'SSC GD', 'SSC CPO', 'SSC Stenographer',
  // UPSC
  'UPSC CSE', 'UPSC CAPF', 'UPSC CDS', 'UPSC NDA', 'UPSC EPFO',
  // Bihar
  'BPSC', 'Bihar TRE PRT', 'Bihar TRE TGT', 'Bihar TRE PGT', 'BSSC',
  // Engineering & Medical
  'JEE Main', 'JEE Advanced', 'NEET UG', 'NEET PG',
  // University Entrance
  'CUET UG', 'CUET PG',
  // Banking
  'IBPS PO', 'IBPS Clerk', 'SBI PO', 'SBI Clerk', 'RBI Grade B',
  // Railway
  'RRB NTPC', 'RRB Group D', 'RRB ALP', 'RRB JE',
  // State PSC
  'State PSC', 'UPPSC', 'MPPSC', 'RPSC', 'WBPSC', 'KPSC',
  // Teaching
  'CTET', 'STET', 'UGC NET', 'CSIR NET',
  // Defence
  'CDS', 'AFCAT', 'Indian Navy',
  // Other
  'Other'
] as const;

export type SupportedExam = typeof SUPPORTED_EXAMS[number] | string;

// ─── Student Profile (Onboarding Data) ───────────────────────────────────────

export interface StudentProfile {
  /** The competitive exam the student is preparing for */
  targetExam: SupportedExam;
  /** Target year for the exam (e.g., "2026", "2027") */
  targetYear?: string;
  /** How many hours per day the student can study */
  dailyStudyHours?: number;
  /** Preferred language for learning (e.g., "English", "Hindi", "Hinglish") */
  preferredLanguage?: string;
  /** Current self-assessed preparation level */
  preparationLevel?: 'beginner' | 'intermediate' | 'advanced';
  /** Subjects the student is focusing on */
  subjects?: string[];
  /** Self-identified weak areas */
  weakAreas?: string[];
  /** When the onboarding was completed */
  onboardedAt?: string;
  /** Whether the onboarding is complete */
  isComplete?: boolean;
  /** ISO timestamp of last profile update */
  updatedAt?: string;
  /** ISO timestamp of profile creation */
  createdAt?: string;

  // New Digital Twin fields
  board?: string;
  classLevel?: string;
  stream?: string;
  target?: string;
  learningStyles?: string[];
  goal?: string;
}

// ─── Planner Summary (Lightweight) ───────────────────────────────────────────

export interface PlannerSummary {
  /** Today's tasks */
  todayTasks: { title: string; type: string; completed: boolean; priority: string }[];
  /** Number of overdue (uncompleted past) tasks */
  overdueCount: number;
  /** Overall completion rate (0-100) */
  completionRate: number;
  /** Target exam from the planner goal */
  targetExam?: string;
}

// ─── Notebook Summary (Lightweight) ──────────────────────────────────────────

export interface NotebookSummary {
  /** Total number of notebooks */
  totalNotebooks: number;
  /** Names of recent/active notebooks */
  recentNotebookNames: string[];
  /** Total number of uploaded sources across all notebooks */
  totalSources: number;
}

// ─── Full Student Context ────────────────────────────────────────────────────

export interface StudentContext {
  /** User ID */
  userId: string;

  /** Onboarding profile (exam, target year, study hours, etc.) */
  profile: StudentProfile | null;

  /** User memory (weak/strong topics, learning speed, comprehension depth) */
  memory: {
    weakTopics: string[];
    strongTopics: string[];
    learningSpeed: 'slow' | 'medium' | 'fast';
    comprehensionDepth: 'beginner' | 'intermediate' | 'advanced';
    preferredModes: string[];
  } | null;

  /** Quantitative learning metrics */
  analytics: {
    masteryPercentage: number;
    retentionScore: number;
    learningVelocity: number;
    questionAccuracy: number;
    /**
     * null = not yet computable from real evidence. Previously hardcoded to 0, which meant every
     * prompt asserted "Exam Readiness: 0%" to the model regardless of how the student was doing.
     * A genuine readiness model (syllabus coverage + mastery + accuracy + consistency + goal gap)
     * is Phase B; until it exists this stays null and is simply not stated.
     */
    examReadiness: number | null;
    studyConsistencyScore: number;
    timeSpentLearningMinutes: number;
  } | null;

  /** Gamification & performance stats */
  stats: {
    totalTestsAttempted: number;
    averageAccuracy: number;
    xp: number;
    level: number;
    rank: string;
    studyStreakDays: number;
    
    // Phase 6 Global Context Engine
    activeExam?: string;
    targetYear?: string;
    preferredLanguage?: string;
    difficultyLevel?: "Beginner" | "Intermediate" | "Advanced";
  } | null;

  /** Today's planner summary */
  planner: PlannerSummary | null;

  /** Notebook overview */
  notebooks: NotebookSummary | null;

  /** Canonical Exam Intelligence Context (Phases 1-3) */
  examContext?: {
    examId: string;
    examName: string;
    cycleId: string;
    conductingAuthority: string;
    activeSyllabusVersionId?: string;
    totalVacancies?: number;
    timelineCountdowns?: import('./exam.types').ExamTimelineCountdown[];
    eligibilityEvaluation?: import('./exam.types').StudentEligibilityEvaluation;
  } | null;

  /** Whether this is the user's first interaction (no onboarding profile) */
  isFirstTimeUser: boolean;

  /** Whether the user has completed the onboarding flow */
  isOnboarded: boolean;
}
