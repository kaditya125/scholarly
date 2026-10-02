import { api } from './client';

/**
 * Quiz client — matches the backend (quiz.controller.ts / quizAttempts.service.ts) route-for-route.
 *
 * Note: `GET /quiz` and `POST /quiz/generate` both GENERATE and PERSIST a new in-progress
 * attempt. Never call them just to read data — use getAttempt/listAttempts for that.
 */

export const quizApi = {
  /** Generates a fresh, personalized weak-area (or topic/notebook) quiz and starts an attempt. */
  async generate(opts: {
    topic?: string; notebookId?: string; notebookTitle?: string; mode?: QuizMode; count?: number;
    /** The topic's subject, sent separately so the backend resolves the topic within it. */
    subject?: string;
    /** Backend source mix — see testBlueprint.service.ts (quiz.controller reads body.testMode). */
    testMode?: 'PRACTICE' | 'SMART_MIXED' | 'PYQ_PRACTICE' | 'WEAK_AREA_DRILL';
    /** A real canonical syllabus node — from a weak-area recommendation or an explicit topic
     *  pick, never guessed client-side. Pins WHERE the questions come from. */
    syllabusNodeId?: string;
    /** Canonical examId, when known (e.g. resolved via examApi.resolveExamId beforehand). */
    examId?: string;
    /** True when this request originated from a weak-area recommendation — keeps the
     *  real-PYQ/reference-weighted source mix even when syllabusNodeId also narrows WHERE. */
    isWeakAreaDrill?: boolean;
  } = {}) {
    const { data } = await api.post('/quiz/generate', opts);
    return data as { attemptId: string; questions: Pick<StoredQuizQuestion, 'id' | 'text' | 'topic' | 'options'>[]; durationMinutes: number; title: string; topic?: string; totalQuestions: number };
  },

  /** Real, examId/syllabusNodeId-scoped weak areas — see quiz.controller.ts's getWeakAreas. */
  async getWeakAreas(examQuery: string): Promise<{ examId: string | null; examResolved: boolean; weakAreas: WeakTopic[] }> {
    const { data } = await api.get('/quiz/weak-areas', { params: { exam: examQuery } });
    return data;
  },

  /** The exam's drillable topics ranked by genuine PYQ frequency — see quiz.controller.ts's
   *  getDrillTopics. Accepts free text ("SSC CGL") or an examId. */
  async getDrillTopics(examQuery: string): Promise<DrillTopicsResponse> {
    const { data } = await api.get('/quiz/drill-topics', { params: { exam: examQuery } });
    return data;
  },

  async listAttempts(): Promise<QuizAttemptSummary[]> {
    const { data } = await api.get('/quiz/attempts');
    return data;
  },

  async getProgressReport(): Promise<ProgressReport> {
    const { data } = await api.get('/quiz/progress');
    return data;
  },

  /** In-progress attempts come back with the answer key masked (-1 / empty explanation). */
  async getAttempt(attemptId: string): Promise<QuizAttempt> {
    const { data } = await api.get(`/quiz/attempts/${attemptId}`);
    return data;
  },

  async submitAttempt(attemptId: string, payload: { answers: Record<string, number>; timeSpentSeconds: number }): Promise<QuizAttempt> {
    const { data } = await api.post(`/quiz/attempts/${attemptId}/submit`, payload);
    return data;
  },

  /**
   * "Fix this gap": generates (once) the 3-question drill for one diagnosis on a completed attempt.
   * A repeat call returns the drill already generated (status EXISTS) instead of a new one.
   */
  async createRemediationDrill(attemptId: string, diagnosticId: string): Promise<RemediationOutcome> {
    const { data } = await api.post(`/quiz/attempts/${attemptId}/remediation-drill`, { diagnosticId });
    return data;
  },

  /** Starts an attempt from a stored mock test's own questions (no generation). */
  async startMockTest(testId: string, opts: { mode?: QuizMode } = {}) {
    const { data } = await api.post(`/quiz/mock-tests/${encodeURIComponent(testId)}/start`, opts);
    return data as { attemptId: string; questions: Pick<StoredQuizQuestion, 'id' | 'text' | 'topic' | 'options'>[]; durationMinutes: number; title: string; totalQuestions: number };
  },
};

export type DiagnosticStatus = 'ROOT_CAUSE_IDENTIFIED' | 'TOPIC_LEVEL_GAP' | 'PREREQUISITES_UNASSESSED';

export interface PrerequisiteChainItem {
  conceptId: string;
  title: string;
  chapter: string;
  accuracy?: number;
  evidence: 'weak' | 'strong' | 'unassessed';
}

export interface RemediationDrillRef {
  drillAttemptId: string;
  title: string;
  kind: 'ROOT_CAUSE' | 'PREREQUISITE_CHECK';
  targetConceptIds: string[];
  targetConcept: string;
  questionCount: number;
  createdAt: string;
}

/** Prerequisite-graph diagnosis of one weak topic (backend: conceptGraph.service). */
export interface PedagogicalDiagnostic {
  id: string;
  status: DiagnosticStatus;
  examId: string;
  subject: string;
  topic: string;
  targetConceptId: string;
  targetConcept: string;
  accuracy: number;
  rootCauseConceptId: string | null;
  rootCauseTitle: string | null;
  rootCauseChapter: string | null;
  prerequisiteChain: PrerequisiteChainItem[];
  unassessedPrerequisites: string[];
  confidence: 'high' | 'medium' | 'low';
  explanation: string;
  diagnosticMessage: string;
  recommendedAction: string;
  remediationEligible: boolean;
  remediationDrill?: RemediationDrillRef;
}

export interface RemediationOutcome {
  status: 'CREATED' | 'EXISTS';
  drill: RemediationDrillRef;
}

export type RemediationErrorCode =
  | 'NOT_FOUND' | 'DIAGNOSTIC_NOT_FOUND' | 'DIAGNOSTIC_UNSUPPORTED'
  | 'REMEDIATION_IN_PROGRESS' | 'QUOTA_EXCEEDED' | 'REMEDIATION_GENERATION_FAILED';

export type QuizAttemptStatus = 'in-progress' | 'completed';
export type QuizSource = 'weak-areas' | 'topic' | 'notebook' | 'mock-test';
export type QuizMode = 'exam' | 'study';

/** Code-generated non-verbal question figures (server-generated SVG; render as <img>). */
export interface QuestionFigure {
  archetype: string;
  seed: number;
  questionSvgs: string[];
  /** Present when the options are figures; `options` then hold their labels (A–D). */
  optionSvgs?: string[];
  answerSource: 'computed';
}

export interface StoredQuizQuestion {
  id: string;
  text: string;
  topic: string;
  options: string[];
  correctAnswerIndex: number;
  explanation: string;
  figure?: QuestionFigure;
}

export interface TopicBreakdown {
  topic: string;
  correct: number;
  incorrect: number;
  unattempted: number;
  total: number;
  accuracy: number;
}

export interface QuizAttempt {
  id: string;
  userId: string;
  title: string;
  source: QuizSource;
  topic?: string;
  notebookId?: string;
  notebookTitle?: string;
  mode: QuizMode;
  questions: StoredQuizQuestion[];
  totalQuestions: number;
  durationMinutes: number;
  positiveMark: number;
  negativeMark: number;
  status: QuizAttemptStatus;
  createdAt: string;
  completedAt?: string;
  answers?: Record<string, number>;
  score?: number;
  maxMarks?: number;
  correctCount?: number;
  incorrectCount?: number;
  unattemptedCount?: number;
  accuracy?: number;
  timeSpentSeconds?: number;
  topicBreakdown?: TopicBreakdown[];
  weakTopics?: string[];
  strongTopics?: string[];
  feedback?: string;
  /** null: the attempt's exam is outside the prerequisite graph; undefined: not diagnosed. */
  pedagogicalDiagnostics?: PedagogicalDiagnostic[] | null;
  remediationSource?: { attemptId: string; diagnosticId: string; kind: 'ROOT_CAUSE' | 'PREREQUISITE_CHECK' };
}

export interface QuizAttemptSummary {
  id: string;
  title: string;
  source: QuizSource;
  topic?: string;
  notebookId?: string;
  notebookTitle?: string;
  mode: QuizMode;
  totalQuestions: number;
  durationMinutes: number;
  status: QuizAttemptStatus;
  createdAt: string;
  completedAt?: string;
  score?: number;
  maxMarks?: number;
  accuracy?: number;
  correctCount?: number;
  answeredCount?: number;
}

export interface ProgressTopicMastery {
  topic: string;
  attempts: number;
  correct: number;
  total: number;
  accuracy: number;
  /** Present when at least one contributing attempt carried real syllabus identity — pass these
   *  straight into quizApi.generate() instead of just `topic` to get a genuinely scoped drill. */
  examId?: string;
  syllabusNodeId?: string;
  lastAttemptAt?: string;
}

export interface DrillTopicsResponse {
  examId: string | null;
  examResolved: boolean;
  totalPyqs: number;
  subjects: {
    subject: string;
    pyqCount: number;
    /** Sorted by pyqCount desc. */
    topics: { topic: string; pyqCount: number; referenceCount: number }[];
  }[];
}

/** The structured, exam-scoped weak-area shape — see WeakTopic in the backend's
 *  quizAttempt.types.ts. What quiz.controller.ts's GET /quiz/weak-areas returns. */
export interface WeakTopic {
  examId?: string;
  subjectId?: string;
  syllabusNodeId?: string;
  topicId?: string;
  topicName: string;
  attempts: number;
  correct: number;
  incorrect: number;
  total: number;
  accuracy: number;
  confidence: number;
  lastAttemptAt?: string;
}

export interface ProgressTrendPoint {
  attemptId: string;
  title: string;
  date: string;
  accuracy: number;
  score: number;
  maxMarks: number;
}

export interface ProgressReport {
  totalTests: number;
  totalGenerated: number;
  inProgress: number;
  averageAccuracy: number;
  bestAccuracy: number;
  totalQuestionsAnswered: number;
  totalTimeSpentSeconds: number;
  trend: ProgressTrendPoint[];
  topicMastery: ProgressTopicMastery[];
  weakSections: ProgressTopicMastery[];
  strongSections: ProgressTopicMastery[];
  recentAttempts: QuizAttemptSummary[];
  narrative: string;
}
