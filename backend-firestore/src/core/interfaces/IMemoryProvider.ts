export interface LearningMetrics {
  masteryPercentage: number;
  revisionFrequency: number;
  averageConfidence: number;
  questionAccuracy: number;
  timeSpentLearningMinutes: number;
  preferredLearningStyle: string;
  preferredAIAgent: string;
  preferredLearningMode: string;
  studyConsistencyScore: number;
  learningVelocity: number;
  retentionScore: number;
  difficultyAdaptation: 'beginner' | 'intermediate' | 'advanced';
}

export interface ConversationMemory {
  messages: any[];
}

export interface SessionMemory {
  sessionId: string;
  activeTopic: string;
  contextWindow: any[];
  startTime: string;
}

export interface IMemoryProvider {
  /**
   * Conversation Memory: Short-term context for the current chat.
   */
  getConversationMemory(userId: string, notebookId: string): Promise<ConversationMemory>;
  
  /**
   * Session Memory: Ephemeral context for the current active study session.
   */
  getSessionMemory(userId: string, sessionId: string): Promise<SessionMemory>;
  
  /**
   * Notebook Memory: Medium-term context isolated to a specific notebook.
   */
  getNotebookMemory(userId: string, notebookId: string): Promise<any>;
  
  /**
   * Long-Term Student Memory: Cross-notebook global learning profile.
   */
  getLongTermMemory(userId: string): Promise<any>;

  /**
   * Learning Analytics Memory: Quantitative metrics for adaptation.
   */
  getLearningAnalytics(userId: string): Promise<LearningMetrics>;

  // Updaters
  updateSessionMemory(userId: string, sessionId: string, data: Partial<SessionMemory>): Promise<void>;
  updateLearningAnalytics(userId: string, data: Partial<LearningMetrics>): Promise<void>;
}
