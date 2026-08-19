export interface ConceptNode {
  conceptId: string;
  conceptName: string;
  subject: string;
  topic: string;
  parentConceptId?: string;
  childConceptIds?: string[];
  prerequisiteIds?: string[];
  dependencyWeight: number; // 0 - 1
  masteryScore: number; // 0 - 100
  status: 'mastered' | 'learning' | 'weak' | 'untested';
}

export interface ConfidenceMetrics {
  confidenceAccuracyGap: number; // e.g. -20 to +20
  overconfidenceScore: number; // 0 - 100
  underconfidenceScore: number; // 0 - 100
  guessAccuracy: number; // percentage
  confidenceConsistency: number; // 0 - 100
}

export interface BehavioralMetrics {
  avgReadingTimeSeconds: number;
  avgThinkingTimeSeconds: number;
  optionHoverFrequency: number;
  rapidGuessCount: number;
  answerSwitchCount: number;
  fatigueIndex: number; // 0 - 100
  revisitCount: number;
  idleDurationSeconds: number;
}

export interface AILearnerPersona {
  learningStyle: 'Visual-Analytical' | 'Conceptual' | 'Practical-Application' | 'Step-by-Step' | 'Intuitive';
  problemSolvingStyle: 'Methodical' | 'Intuitive-Fast' | 'Analytical-Cautious' | 'Guess-Prone';
  motivationType: 'Goal-Driven' | 'Mastery-Driven' | 'Competitive' | 'Structured';
  attentionPattern: 'Sustained' | 'Burst' | 'Wandering-Under-Fatigue';
  revisionPattern: 'Spaced-Repetition' | 'Cramming-Prone' | 'Consistent-Daily';
  conceptualStrength: 'High' | 'Moderate' | 'Needs-Foundational-Support';
  preferredExplanationStyle: 'Analogy-Rich' | 'First-Principles' | 'Formula-First' | 'Visual-Diagram';
  preferredDifficulty: 'Easy' | 'Medium' | 'Hard' | 'Adaptive';
}

export interface PerformancePredictions {
  expectedBoardScore: number; // e.g. 92%
  expectedExamRank?: string; // e.g. "AIR < 2500"
  targetProbabilityPercentage: number; // e.g. 84%
  estimatedCompletionWeeks: number;
  recommendedDailyHours: number;
  riskOfMissingTarget: 'Low' | 'Moderate' | 'High';
  potentialBoostIfHoursIncrease: number; // percentage gain
}

export interface StudyPlanDay {
  day: number;
  title: string;
  focusSubject: string;
  activities: {
    type: 'notebook' | 'tutor' | 'quiz' | 'flashcard' | 'podcast' | 'mindmap';
    title: string;
    durationMins: number;
    targetConcept: string;
  }[];
}

export interface StudentDigitalTwin {
  userId: string;
  updatedAt: number;
  version: number;
  
  academicProfile: {
    board?: string;
    classLevel?: string;
    stream?: string;
    targetExam?: string;
    targetScore?: string;
    targetYear?: string;
    subjects: string[];
    weakAreas: string[];
    strongAreas: string[];
  };

  /**
   * These are nullable because they are inferred, not measured, and inference can fail or be
   * unavailable. `null` means "not established yet" and MUST be rendered as such — never
   * defaulted to a plausible-looking number. They previously carried invented fallbacks
   * (readiness 75, "Top 5%", risk "Low") that presented a failed analysis as a healthy student.
   */
  overallReadinessScore: number | null; // 0 - 100, or null if not yet established
  subjectMastery: Record<string, number>; // subject -> mastery %
  topicMastery: Record<string, number>; // topic -> mastery %

  knowledgeGraph: Record<string, ConceptNode>; // conceptId -> ConceptNode
  confidenceProfile: ConfidenceMetrics | null;
  behavioralProfile: BehavioralMetrics | null;
  learnerPersona: AILearnerPersona | null;
  predictions: PerformancePredictions | null;
  firstWeekRoadmap: StudyPlanDay[];

  latestAssessmentSummary?: {
    totalQuestions: number;
    correctAnswers: number;
    accuracyPercentage: number;
    avgTimePerQuestionSec: number;
    completedAt: number;
  };
}
