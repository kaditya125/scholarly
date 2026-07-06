export interface BriefingResponse {
  welcomeMessage: {
    greeting: string;
    examContext: string;
    overview: string;
  };
  studyStreak: {
    days: number;
    yesterdayTime: string;
    thisWeekTime: string;
    consistencyScore: number;
  };
  yesterdaysProgress: {
    summary: string;
    completedItems: string[];
  };
  continueLearning: {
    lastNotebookId?: string;
    lastNotebookName: string;
    chapter?: string;
    topic?: string;
    lastConversationId?: string;
    suggestion: string;
  };
  aiMemorySummary: {
    struggles: string[];
    improvements: string[];
    overdueRevisions: string[];
  };
  todayRecommendations: {
    id: string;
    type: 'revision' | 'quiz' | 'flashcard' | 'reading' | 'mock_test';
    title: string;
    estimatedMinutes: number;
  }[];
  plannerSummary: {
    sessionsCount: number;
    quizCount: number;
    revisionCount: number;
    totalEstimatedMinutes: number;
  };
  mockTestSummary: {
    nextTestName: string;
    status: 'Ready' | 'Upcoming';
    estimatedMinutes: number;
    difficulty: string;
  };
  notebookSummary: {
    activeNotebooks: {
      id: string;
      name: string;
      completionPercentage: number;
    }[];
  };
  learningAnalytics: {
    masteryPercentage: number;
    retentionPercentage: number;
    learningVelocity: string;
    confidencePercentage: number;
  };
  motivation: {
    message: string;
  };
  generatedAt: string;
}
