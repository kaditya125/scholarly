/**
 * Backend Planning Types
 * 
 * Type definitions for the intelligent conversational planning system.
 * These types extend the existing podcast types without breaking them.
 */

// ============================================================================
// Message Types (Backend)
// ============================================================================

export type MessageRole = 'user' | 'assistant' | 'system';

export type MessageType = 
  | 'text'
  | 'thinking'
  | 'clarification'
  | 'recommendation'
  | 'plan'
  | 'research'
  | 'progress'
  | 'artifact';

export interface BaseMessage {
  id: string;
  role: MessageRole;
  type: MessageType;
  timestamp: Date;
  content?: string;
}

export interface TextMessage extends BaseMessage {
  type: 'text';
  content: string;
}

export interface ThinkingMessage extends BaseMessage {
  type: 'thinking';
  content: string;
  animated?: boolean;
}

export interface ClarificationMessage extends BaseMessage {
  type: 'clarification';
  question: string;
  options: ClarificationOption[];
  allowCustom?: boolean;
  selectedOptionId?: string;
}

export interface ClarificationOption {
  id: string;
  label: string;
  description?: string;
  recommended?: boolean;
}

export interface RecommendationMessage extends BaseMessage {
  type: 'recommendation';
  title: string;
  recommendations: Recommendation[];
  accepted?: boolean;
}

export interface Recommendation {
  id: string;
  category: RecommendationCategory;
  content: string;
  rationale?: string;
  priority: 'high' | 'medium' | 'low';
}

export type RecommendationCategory =
  | 'learning_objectives'
  | 'misconceptions'
  | 'exam_tips'
  | 'memory_tricks'
  | 'prerequisites'
  | 'difficulty'
  | 'teaching_strategy'
  | 'related_topics';


export interface ResearchMessage extends BaseMessage {
  type: 'research';
  title: string;
  sources: ResearchSource[];
}

export interface ResearchSource {
  id: string;
  type: 'notebook' | 'chapter' | 'notes' | 'graphrag' | 'external';
  title: string;
  description?: string;
  notebookId?: string;
  chapterId?: string;
  relevanceScore?: number;
  selected?: boolean;
}

export interface PlanMessage extends BaseMessage {
  type: 'plan';
  plan: LessonPlan;
  status: 'draft' | 'approved' | 'modified';
}

export interface ProgressMessage extends BaseMessage {
  type: 'progress';
  stage: string;
  current?: number;
  total?: number;
  percentage?: number;
  eta?: number;
}

export type ConversationMessage =
  | TextMessage
  | ThinkingMessage
  | ClarificationMessage
  | RecommendationMessage
  | ResearchMessage
  | PlanMessage
  | ProgressMessage;

// ============================================================================
// Lesson Plan Types
// ============================================================================

export interface LessonPlan {
  id: string;
  title: string;
  description?: string;
  targetAudience: TargetAudience;
  curriculum?: Curriculum;
  duration: number; // minutes
  teachingStyle: TeachingStyle;
  voiceStyle: VoiceStyle;
  language: string;
  
  // Pedagogical metadata
  learningObjectives: string[];
  prerequisites?: string[];
  keyTopics: string[];
  difficulty: 'beginner' | 'intermediate' | 'advanced';
  
  // Content structure
  outline: OutlineSection[];
  teachingStrategy?: string;
  
  // Sources
  sources: ResearchSource[];
  
  // Generation metadata
  createdAt: Date;
  updatedAt: Date;
  version: number;
}

export interface OutlineSection {
  id: string;
  order: number;
  title: string;
  duration: number; // minutes
  topics: string[];
  teachingApproach?: string;
}

export interface TargetAudience {
  grade?: string;
  ageRange?: string;
  priorKnowledge?: string;
  specialNeeds?: string[];
}

export type Curriculum =
  | 'NCERT'
  | 'CBSE'
  | 'ICSE'
  | 'STATE_BOARD'
  | 'JEE'
  | 'NEET'
  | 'GENERAL';

export type TeachingStyle =
  | 'teacher_student'
  | 'storytelling'
  | 'documentary'
  | 'debate'
  | 'interview'
  | 'discussion'
  | 'solo_narrator';

export type VoiceStyle =
  | 'warm_teacher'
  | 'professional_lecturer'
  | 'friendly_mentor'
  | 'energetic_coach';


// ============================================================================
// Planning Session State (Firestore)
// ============================================================================

export interface PlanningSession {
  id: string;
  userId: string;
  projectType: 'podcast' | 'video' | 'article';
  
  // Conversation state
  messages: ConversationMessage[];
  currentStage: PlanningStage;
  
  // Planning artifacts
  initialPrompt: string;
  lessonPlan?: LessonPlan;
  
  // Conversation context (for adaptive behavior)
  conversationContext: ConversationContext;
  
  // Session metadata
  status: 'in_progress' | 'completed' | 'cancelled';
  createdAt: Date;
  updatedAt: Date;
}

export type PlanningStage =
  | 'initial_prompt'
  | 'understanding_intent'
  | 'clarifying_audience'
  | 'clarifying_curriculum'
  | 'clarifying_style'
  | 'researching_sources'
  | 'selecting_sources'
  | 'generating_recommendations'
  | 'generating_plan'
  | 'plan_review'
  | 'plan_approved'
  | 'ready_to_generate';

export interface ConversationContext {
  // Extracted information
  topic?: string;
  targetGrade?: string;
  curriculum?: Curriculum;
  duration?: number;
  teachingStyle?: TeachingStyle;
  voiceStyle?: VoiceStyle;
  language?: string;
  
  // User preferences (learned during conversation)
  selectedSources?: string[];
  customRequirements?: string[];
  
  // Clarifications needed
  needsCurriculumClarification?: boolean;
  needsStyleClarification?: boolean;
  needsSourceSelection?: boolean;
  
  // Educational analysis
  detectedPrerequisites?: string[];
  identifiedMisconceptions?: string[];
  suggestedLearningObjectives?: string[];
}

// ============================================================================
// Intent Analysis (for adaptive questioning)
// ============================================================================

export interface IntentAnalysis {
  topic: string;
  confidence: number; // 0-1
  
  // Detected parameters
  targetAudience?: {
    grade?: string;
    ageRange?: string;
    confidence: number;
  };
  
  curriculum?: {
    type: Curriculum;
    confidence: number;
  };
  
  duration?: {
    minutes: number;
    confidence: number;
  };
  
  teachingStyle?: {
    style: TeachingStyle;
    confidence: number;
  };
  
  // Clarifications needed (adaptive)
  clarificationsNeeded: ClarificationNeeded[];
}

export interface ClarificationNeeded {
  type: 'curriculum' | 'style' | 'duration' | 'audience' | 'sources';
  priority: 'required' | 'recommended' | 'optional';
  reason: string;
}


// ============================================================================
// Educational Recommendations
// ============================================================================

export interface EducationalRecommendations {
  learningObjectives: LearningObjective[];
  commonMisconceptions: Misconception[];
  examTips: ExamTip[];
  memoryTricks: MemoryTrick[];
  prerequisites: Prerequisite[];
  difficultyAssessment: DifficultyAssessment;
  teachingStrategy: TeachingStrategyRecommendation;
}

export interface LearningObjective {
  id: string;
  objective: string;
  bloomLevel: 'remember' | 'understand' | 'apply' | 'analyze' | 'evaluate' | 'create';
  priority: 'high' | 'medium' | 'low';
  alignsWithCurriculum?: boolean;
}

export interface Misconception {
  id: string;
  misconception: string;
  correction: string;
  explanation: string;
  prevalence: 'common' | 'occasional' | 'rare';
}

export interface ExamTip {
  id: string;
  tip: string;
  relevantFor: Curriculum[];
  category: 'formula' | 'concept' | 'application' | 'trick' | 'common_error';
}

export interface MemoryTrick {
  id: string;
  what: string;
  trick: string;
  type: 'mnemonic' | 'analogy' | 'visualization' | 'story';
}

export interface Prerequisite {
  id: string;
  concept: string;
  importance: 'essential' | 'helpful' | 'optional';
  coverageRecommendation: 'brief_review' | 'detailed_explanation' | 'assume_known';
}

export interface DifficultyAssessment {
  overallLevel: 'beginner' | 'intermediate' | 'advanced';
  conceptualComplexity: number; // 1-10
  mathematicalDemand: number; // 1-10
  abstractionLevel: number; // 1-10
  reasoning: string;
  recommendedDuration: number; // minutes
}

export interface TeachingStrategyRecommendation {
  primaryApproach: string;
  rationale: string;
  suggestedTechniques: string[];
  avoidances: string[];
  scaffoldingNeeded: boolean;
}

// ============================================================================
// API Request/Response Types
// ============================================================================

export interface StartPlanningRequest {
  userId: string;
  projectType: 'podcast' | 'video' | 'article';
  initialPrompt: string;
  notebookId?: string; // Optional notebook context
}

export interface StartPlanningResponse {
  sessionId: string;
  messages: ConversationMessage[];
  currentStage: PlanningStage;
}

export interface RespondToPlanningRequest {
  sessionId: string;
  userId: string;
  messageType: 'text' | 'clarification_response' | 'plan_approval' | 'plan_modification';
  content?: string;
  clarificationResponse?: {
    questionId: string;
    optionId?: string;
    customValue?: string;
  };
  planApproval?: {
    approved: boolean;
    modifications?: Partial<LessonPlan>;
  };
}

export interface RespondToPlanningResponse {
  messages: ConversationMessage[];
  currentStage: PlanningStage;
  lessonPlan?: LessonPlan;
  readyToGenerate?: boolean;
  podcastId?: string; // If generation started
}

export interface GetPlanningSessionResponse {
  session: PlanningSession;
}


// ============================================================================
// Firestore Schema Extensions
// ============================================================================

/**
 * New Firestore collection: planning_sessions
 * 
 * Structure:
 * /planning_sessions/{sessionId}
 * 
 * This collection stores conversational planning sessions.
 * When a plan is approved and generation starts, the sessionId
 * can be linked to the podcast record.
 */

export interface PlanningSessionDocument {
  id: string;
  userId: string;
  projectType: 'podcast' | 'video' | 'article';
  
  // Conversation
  messages: any[]; // JSON serialized ConversationMessage[]
  currentStage: PlanningStage;
  
  // Artifacts
  initialPrompt: string;
  lessonPlan?: any; // JSON serialized LessonPlan
  
  // Context
  conversationContext: any; // JSON serialized ConversationContext
  
  // Metadata
  status: 'in_progress' | 'completed' | 'cancelled';
  createdAt: FirebaseFirestore.Timestamp;
  updatedAt: FirebaseFirestore.Timestamp;
  
  // Optional link to generated content
  podcastId?: string;
  videoId?: string;
  articleId?: string;
}

/**
 * Extension to existing podcasts collection:
 * Add optional planningSessionId field to link back to conversation
 */
export interface PodcastExtension {
  planningSessionId?: string; // Links to planning_sessions/{sessionId}
}

// ============================================================================
// Helper Types
// ============================================================================

export interface CreateMessageOptions {
  role: MessageRole;
  type: MessageType;
  content?: string;
  metadata?: Record<string, any>;
}

export interface PlanningServiceConfig {
  enableAdaptiveQuestioning: boolean;
  enableRecommendations: boolean;
  enableCurriculumAnalysis: boolean;
  defaultLanguage: string;
  defaultDuration: number;
  maxConversationTurns: number;
}

