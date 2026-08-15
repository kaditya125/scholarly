/**
 * AI Workspace Types
 * 
 * Generic conversation and workspace types designed for reusability across
 * multiple AI Studio features (podcasts, videos, articles, etc.)
 */

// ============================================================================
// Message Types
// ============================================================================

export type MessageRole = 'user' | 'assistant' | 'system';

export type MessageType = 
  | 'text'              // Regular text message
  | 'thinking'          // AI thinking indicator
  | 'clarification'     // Multiple choice question
  | 'recommendation'    // AI suggestions
  | 'plan'              // Generated plan/outline
  | 'research'          // Research results
  | 'progress'          // Progress update
  | 'artifact';         // Generated artifact

export interface BaseMessage {
  id: string;
  role: MessageRole;
  type: MessageType;
  timestamp: Date | string;
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

export interface LearningObjective {
  id: string;
  description: string;
  text?: string;
  bloomsLevel?: string;
  bloomLevel?: string;
  importance?: 'essential' | 'important' | 'nice_to_have';
  priority?: 'high' | 'medium' | 'low';
}

export interface Misconception {
  id: string;
  misconception: string;
  correction: string;
  prevalence?: string;
}

export interface RecommendationMessage extends BaseMessage {
  type: 'recommendation';
  title: string;
  recommendations: any;
  accepted?: boolean;
  summary?: string;
  objectives?: any[];
  misconceptions?: any[];
  examTips?: any[];
  memoryTricks?: any[];
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
  eta?: number; // seconds
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
// Planning Types
// ============================================================================

export interface LessonPlan {
  id: string;
  title: string;
  subtitle?: string;
  description?: string;
  targetAudience: TargetAudience | string;
  curriculum?: Curriculum;
  duration: number; // minutes
  estimatedDuration?: number | string;
  teachingStyle: TeachingStyle;
  voiceStyle: VoiceStyle;
  language: string;
  
  // Pedagogical metadata
  learningObjectives: string[];
  prerequisites?: string[];
  keyTopics: string[];
  difficulty: 'beginner' | 'intermediate' | 'advanced';
  difficultyLevel?: 'beginner' | 'intermediate' | 'advanced' | string;
  pedagogicalNotes?: string[];
  
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
  duration?: number | string; // minutes
  topics?: string[];
  keyPoints?: string[];
  description?: string;
  teachingApproach?: string;
}


export interface TargetAudience {
  grade?: string; // e.g., "10", "12", "College"
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
// Planning Session State
// ============================================================================

export interface PlanningSession {
  id: string;
  userId: string;
  projectType: 'podcast' | 'video' | 'article'; // Extensible
  
  // Conversation state
  messages: ConversationMessage[];
  currentStage: PlanningStage;
  
  // Planning artifacts
  initialPrompt: string;
  lessonPlan?: LessonPlan;
  
  // Session metadata
  status: 'in_progress' | 'completed' | 'cancelled';
  createdAt: Date;
  updatedAt: Date;
  
  // For resumption
  conversationContext: Record<string, any>;
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


// ============================================================================
// API Request/Response Types
// ============================================================================

export interface StartPlanningRequest {
  projectType: 'podcast' | 'video' | 'article';
  initialPrompt: string;
}

export interface StartPlanningResponse {
  sessionId: string;
  messages: ConversationMessage[];
  currentStage: PlanningStage;
}

export interface RespondToPlanningRequest {
  sessionId: string;
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
}

export interface GetPlanningSessionResponse {
  session: PlanningSession;
}

// ============================================================================
// UI Component Props
// ============================================================================

export interface ConversationTimelineProps {
  messages: ConversationMessage[];
  onSendMessage?: (content: string) => void;
  onClarificationResponse?: (questionId: string, optionId: string) => void;
  onPlanApproval?: (approved: boolean, modifications?: Partial<LessonPlan>) => void;
  isLoading?: boolean;
}

export interface MessageBubbleProps {
  message: ConversationMessage;
  onAction?: (action: string, data?: any) => void;
}

export interface ClarificationCardProps {
  message: ClarificationMessage;
  onSelect: (optionId: string) => void;
  disabled?: boolean;
}

export interface RecommendationCardProps {
  message: RecommendationMessage;
  onAccept: () => void;
  onModify?: () => void;
  disabled?: boolean;
}

export interface PlanningCardProps {
  message: PlanMessage;
  onApprove: () => void;
  onModify: (modifications: Partial<LessonPlan>) => void;
  onRegenerate: () => void;
  disabled?: boolean;
}

