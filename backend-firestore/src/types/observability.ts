/**
 * Feedback Types for Scholarly AI
 * 
 * Captures rich, contextual feedback from students on every AI response.
 * This data feeds into the Continuous Evaluation Pipeline and AI Improvement Dashboard.
 */

export type FeedbackRating = 
  | 'thumbs_up'
  | 'thumbs_down'
  | 'incorrect'
  | 'outdated'
  | 'too_easy'
  | 'too_hard'
  | 'hallucination'
  | 'needs_citation'
  | 'very_helpful'
  | 'report_issue';

export interface AIResponseFeedback {
  id: string;
  userId: string;
  sessionId: string;
  messageId: string;
  rating: FeedbackRating;
  comment?: string;
  
  // Deep context for evaluation
  promptVersion: string;
  retrievalIds: string[];          // Which Pinecone chunks were retrieved
  contextChunks: string[];         // Actual text chunks used
  providerUsed: string;            // groq, gemini, openai
  modelUsed: string;               // gpt-oss-20b, gemini-1.5-pro
  examMode: string;                // UPSC, SSC, NEET, JEE, etc.
  learningMode: string;            // TEACHER, QUIZ, REVISION, etc.
  confidenceScore: number;
  verificationScore: number;
  
  // Telemetry
  traceId: string;
  latencyMs: number;
  tokensUsed: number;
  
  createdAt: number;
}

export interface TelemetryRecord {
  traceId: string;
  userId: string;
  sessionId: string;
  provider: string;
  model: string;
  promptVersion: string;
  
  // Timing
  totalLatencyMs: number;
  retrievalLatencyMs: number;
  rerankerLatencyMs: number;
  generationLatencyMs: number;
  verificationLatencyMs: number;
  timeToFirstTokenMs: number;
  
  // Tokens & Cost
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  estimatedCostUSD: number;
  
  // RAG
  chunkCount: number;
  cacheHit: boolean;
  pineconeQueryTimeMs: number;
  averageSimilarityScore: number;
  
  // Quality
  verificationPassed: boolean;
  citationCount: number;
  
  timestamp: number;
}

export interface FeatureFlag {
  name: string;
  enabled: boolean;
  scope: 'global' | 'user' | 'beta';
  targetUserIds?: string[];       // For user-level or beta flags
  description: string;
  updatedAt: number;
  updatedBy: string;
}

export interface PromptVersion {
  id: string;
  promptName: string;             // e.g. 'teacher', 'verification', 'intent'
  version: string;                // e.g. 'v7', 'v8'
  description: string;
  owner: string;
  content: string;
  active: boolean;
  abTestGroup?: 'A' | 'B';       // For A/B testing
  rollbackVersion: string;
  createdAt: number;
  updatedAt: number;
  
  // A/B Test Metrics (populated by evaluation pipeline)
  metrics?: {
    avgStudentRating: number;
    completionRate: number;
    followUpRate: number;
    hallucinationRate: number;
    pedagogicalScore: number;
    sampleSize: number;
  };
}

export interface ContinuousEvalScore {
  id: string;
  traceId: string;
  userId: string;
  query: string;
  response: string;
  
  // Judge scores (0-10)
  grounding: number;
  citationAccuracy: number;
  conceptCoverage: number;
  pedagogicalQuality: number;
  difficultyMatching: number;
  examRelevance: number;
  hallucination: number;           // 0 = no hallucination, 10 = severe
  completeness: number;
  reasoningQuality: number;
  readability: number;
  
  overallScore: number;
  
  promptVersion: string;
  examMode: string;
  evaluatedAt: number;
}

export interface CostRecord {
  provider: string;                // groq, gemini, openai
  model: string;
  promptTokens: number;
  completionTokens: number;
  estimatedCostUSD: number;
  userId: string;
  notebookId?: string;
  sessionId?: string;
  operation?: string;              // e.g. kg_extraction, kg_linking, asset_summary, asset_quiz, chat
  timestamp: number;
}

export interface AdminAlert {
  id: string;
  type: 'latency' | 'provider_failure' | 'hallucination' | 'token_usage' | 'sse_disconnect' | 'verification_failure';
  severity: 'info' | 'warning' | 'critical';
  message: string;
  metadata: Record<string, any>;
  resolved: boolean;
  createdAt: number;
  resolvedAt?: number;
}
