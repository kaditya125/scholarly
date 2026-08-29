export type Level = "Primary" | "Middle" | "Secondary" | "Higher Secondary";
export type Subject = "Child Development and Pedagogy" | "General Studies" | "Bihar GK" | "Mathematics" | "Science" | "Language";
export type Difficulty = "Easy" | "Medium" | "Hard";
export type TopicType = "study-guide" | "podcast" | "chat" | "slides" | "worksheet" | "infographic" | "mindmap" | "image" | "page" | "meeting-notes";

export interface Question {
  id: string; // Document ID
  subject: Subject;
  topic: string;
  level: Level;
  type: "MCQ"; 
  text: string;
  options: string[];
  correctAnswerIndex: number;
  explanation: string;
}

export interface AICoachRecommendation {
  type: 'review' | 'quiz' | 'milestone' | 'warning' | 'mentor_conversation';
  title: string;
  message: string;
  reasoning?: string; // Explainability: Why was this generated?
  actionUrl?: string;
  priority: 'low' | 'medium' | 'high';
}

export interface GamificationProfile {
  xp: number;
  level: number;
  rank: string; // e.g., 'Bronze', 'Silver', 'Gold'
  studyStreakDays: number;
  longestStreak: number;
  badges: string[];
}

export interface UserStats {
  userId: string;
  totalTestsAttempted: number;
  averageAccuracy: number; 
  overallRank: number;
  completionPercentage: number;
  performanceHistory: { topic: string; score: number }[];
  weakTopics: string[];
  strongTopics: string[];
  activityHeatmap: { date: string; count: number; intensity: number }[];
  
  // Advanced Phase 2 Metrics
  gamification: GamificationProfile;
  aiRecommendations: AICoachRecommendation[];
  learningVelocity: number; // e.g. concepts mastered per week
  retentionScore: number; // 0-100 based on spaced repetition success
  
  // Phase 5 Extended Metrics
  learningHealthScore: number; // 0-100 Single indicator of prep quality
  examReadiness: {
    estimatedScoreRange: string;
    projectedPercentile: number;
    probabilityOfClearing: number;
    confidenceLevel: "Low" | "Medium" | "High";
    riskAreas: string[];
    recommendedFocus: string;
  };
  coachMemory: {
    preferredExplanationStyle: string;
    preferredStudyTime: string;
    favoriteLearningMode: string;
    attentionSpanMinutes: number;
  };
  
  // Phase 6 Global Context Engine
  activeExam?: string;
  targetYear?: string;
  preferredLanguage?: string;
  difficultyLevel?: "Beginner" | "Intermediate" | "Advanced";
}

export interface Room {
  id: string; // Document ID
  name: string;
  icon: string; // E.g., 'Hash', 'Users' to map to Lucide icons
}

export interface StudyGroup {
  id: string;
  name: string;
  description: string;
  subject?: string;
  ownerId: string;
  memberIds: string[]; // For efficient querying
  members: { userId: string; role: 'admin' | 'member'; joinedAt: number }[];
  notebookIds: string[];
  plannerIds: string[];
  createdAt: number;
  weeklyChallenges?: { id: string; title: string; completedBy: string[] }[];
}

export interface DiscussionAuthor {
  uid: string;
  displayName: string;
  photoURL?: string;
}

export interface DiscussionResponseItem {
  id: string;
  author: DiscussionAuthor;
  authorId: string;
  createdAt: number;
  text: string;
  isBest?: boolean;
}

export interface Discussion {
  id: string; // Document ID
  chapter?: string;
  topic: string;
  title: string;
  description?: string;
  roomId?: string; // Foreign key to Room
  authorId?: string;
  authorName?: string;
  authorPhotoURL?: string;
  author?: DiscussionAuthor;
  status?: 'active' | 'resolved' | 'closed';
  tags?: string[];
  replies: number;
  views: number;
  likes?: string[]; // Array of user UIDs who liked
  likeCount?: number;
  liked?: boolean;
  participants: string[];
  participantProfiles?: DiscussionAuthor[];
  bestResponseId?: string;
  aiAssisted?: boolean;
  aiSummary?: string;
  similarThreadIds?: string[];
  createdAt: number; // Unix timestamp
}

export interface LeaderboardEntry {
  userId: string; // Document ID should match User UID
  name: string;
  followers: string;
  points: string;
  reward: number;
  prize?: string;
  avatar: string;
  rank: number;
  handle: string;
  rankTrend: "up" | "down" | "same";
  scoreTrend: "up" | "down" | "same";
  targetExam?: string;
  streakDays?: number;
  level?: number;
  tier?: string;
  accuracy?: number;
}

export type PlanningMode = "Crash Course" | "Balanced" | "Weekend Only" | "Working Professional" | "Daily Practice" | "Revision Mode" | "Final 30 Days";

export interface BlueprintNode {
  id: string;
  type: "subject" | "chapter" | "topic" | "concept";
  title: string;
  weightage?: number;
  prerequisites?: string[]; // IDs of other blueprint nodes
  children?: BlueprintNode[];
}

export interface ExamBlueprint {
  id: string; // e.g., 'UPSC_CSE_2026'
  examName: string;
  syllabus: BlueprintNode[];
  createdAt: number;
}

export interface StudyGoal {
  id: string; // Document ID
  userId: string;
  targetExam: string;
  blueprintId?: string; // Foreign key to ExamBlueprint
  examDate: string; // ISO date
  subjects: string[];
  weeklyHours: number;
  planningMode: PlanningMode;
  preferredStudyHours?: "Morning" | "Night" | "Flexible";
  createdAt: number;
}

export interface DailyTask {
  id: string;
  title: string;
  type: 'read' | 'quiz' | 'revision' | 'practice_test' | 'break';
  chapter: string;
  topic: string;
  blueprintNodeId?: string; // Links to the ExamBlueprint
  estimatedMinutes: number;
  completed: boolean;
  priority: 'high' | 'medium' | 'low';
}

export interface Timetable {
  id: string; // Document ID (usually 1:1 with StudyGoal or UserId)
  userId: string;
  goalId: string;
  startDate: string;
  endDate: string;
  schedule: Record<string, DailyTask[]>; // Keyed by ISO date string (YYYY-MM-DD)
  lastAdaptedAt: number;
}

export interface PlannerTask {
  id: string; // Document ID
  status: "To do" | "In Progress" | "Under Review" | "Completed";
  subject: string;
  title: string;
  desc: string;
  date: string;
  ratio?: string;
  grade?: string;
  views: number;
  comments: number;
  avatars: string[];
}

export interface MockTest {
  id: string; // Document ID
  title: string;
  subject: string;
  difficulty: Difficulty;
  users: string; 
  questions: number;
  marks: number;
  mins: number;
}

export interface ChatMessage {
  id?: string;
  role: "user" | "ai" | "system";
  content: string;
  timestamp: number;
}

export interface ChatSession {
  sessionId: string; // Document ID
  userId: string; // Document ID of the owner
  topicType: TopicType;
  selectedModel: string; // e.g., 'gemini', 'gpt', 'claude'
  createdAt: number;
}

export type PodcastStatus = 
  | 'PENDING'
  | 'PLANNING'
  | 'GENERATING_SCRIPT'
  | 'GENERATING_ASSETS'
  | 'GENERATING_AUDIO'
  | 'STITCHING_AUDIO'
  | 'UPLOADING'
  | 'READY'
  | 'CANCELLED'
  | 'FAILED';

export interface PodcastMetadata {
  id: string; // Document ID (podcastId)
  type?: string;
  jobId?: string;
  notebookId: string;
  userId: string;
  title: string;
  description: string;
  sourceKind?: string;
  progressPct?: number;
  audioPath?: string;
  coverImagePath?: string;
  transcriptPath?: string;
  duration?: number;
  language: string;
  voiceProvider: string;
  speakers: string[];
  transcriptUrl?: string;
  audioUrl?: string;
  coverImageUrl?: string;
  status: PodcastStatus;
  createdAt: number;
  updatedAt: number;
  estimatedListeningTime?: number;
  totalWords?: number;
  totalCharacters?: number;
}
export * from "./notebook";
export * from "./observability";
export * from "./exam.types";
export * from "./pyq.types";

export const isReadyStatus = (status: string) => status === 'READY' || status === 'READY_DEGRADED';
export type KGRelationshipType = string;

export interface CircleChatTurn {
  id?: string;
  role?: string;
  question?: string;
  answer?: string;
  content?: string;
  createdAt?: number;
}

export interface CircleConcept {
  id: string;
  label?: string;
  name?: string;
  definition?: string;
  importance?: number;
  mentions?: number;
  groupId?: string;
  relatedConceptIds?: string[];
  updatedAt?: number;
}

export interface CircleKnowledgeItem {
  id: string;
  title?: string;
  text?: string;
  content?: string;
  groupId?: string;
  addedBy?: string;
}

export type CircleKnowledgeSource = string | {
  id?: string;
  type?: string;
  [key: string]: any;
};