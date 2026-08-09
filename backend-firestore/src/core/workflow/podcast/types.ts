/**
 * Types for the AI Podcast Generation Engine (Phase 1).
 *
 * The engine is a NEW orchestration layer that REUSES the existing Intelligence Layer,
 * GraphRAG, student context, LLM providers, TTS, ffmpeg and the BullMQ queue. These types
 * describe the request, the plan, the generated script/transcript, and the durable job.
 */

import type { PodcastStyleId } from './podcastStyles';

export type PodcastType =
  | 'chapter'
  | 'revision'
  | 'crash_course'
  | 'exam_revision'
  | 'weak_topic'
  | 'doubt'
  | 'current_affairs'
  | 'quiz_review'
  | 'daily'
  | 'custom';

/**
 * Conversation shape the script is written in.
 *
 * LEGACY. Kept for backward compatibility with stored jobs and older clients.
 * It cannot express the six studio formats — 'Storytelling', 'Documentary' and
 * 'Solo Narration' all had to map onto 'solo_narrator' — so new work should use
 * `podcastStyle` (PodcastStyleId) instead.
 */
export type SpeakerStyle = 'teacher_student' | 'mentor' | 'discussion' | 'interview' | 'solo_narrator';

/** Abstract voice persona → mapped to a concrete TTS voice by the TTS layer. */
export type VoiceStyle =
  | 'warm_teacher'
  | 'professional_lecturer'
  | 'friendly_mentor'
  | 'energetic_coach'
  | 'exam_instructor'
  | 'calm_narrator';

export type PodcastSourceKind = 'prompt' | 'notebook' | 'weak_topics' | 'topic';

export interface PodcastSource {
  kind: PodcastSourceKind;
  notebookId?: string;
  sourceIds?: string[];
  assetId?: string;
  prompt?: string;
  topic?: string;
}

/** The request the frontend/controller submits to generate a podcast. */
export interface PodcastGenerateRequest {
  type: PodcastType;
  source: PodcastSource;
  durationMinutes: number; // 5 | 10 | 20 | 30 | 60 (validated/clamped)
  speakerStyle?: SpeakerStyle;
  /**
   * The production format chosen in the studio. Supersedes `speakerStyle`, which
   * could not distinguish storytelling from documentary from solo narration.
   * Honoured only when ENHANCED_PODCAST_STYLES is on.
   */
  podcastStyle?: PodcastStyleId;
  voiceStyle?: VoiceStyle;
  language?: string;
}

/** A speaker in the episode, with its abstract voice persona. */
export interface PodcastSpeaker {
  name: string;   // e.g. "Aarav" / display name used in the transcript
  role: string;   // e.g. "Teacher" | "Student" | "Narrator" (drives the TTS voiceMap)
  voiceStyle: VoiceStyle;
}

/** One planned chapter/segment produced by the PodcastPlanner (pre-scripting). */
export interface PlannedSegment {
  index: number;
  title: string;
  objective: string;
  talkingPoints: string[];
  /** Query used to ground THIS segment against the notebook (GraphRAG). */
  retrievalQuery: string;
  targetWords: number;
}

/** The structured plan the PodcastPlanner emits before any script/audio is generated. */
export interface PodcastPlan {
  title: string;
  description: string;
  type: PodcastType;
  difficulty: string;
  teachingStrategy: string;
  learningObjectives: string[];
  speakers: PodcastSpeaker[];
  segments: PlannedSegment[];
  estimatedMinutes: number;
  /** Human-readable one-liner e.g. "Focuses on your weak topics: Genetics, Cell Cycle." */
  personalizationSummary: string;
  language: string;
  /**
   * The production format this plan was built for.
   *
   * Carried on the plan because the ConversationGenerator receives ONLY the plan.
   * Without this the style died at the planner and the script writer had no idea
   * which format it was writing — the root cause of every style producing the
   * same shape of dialogue.
   */
  podcastStyle?: PodcastStyleId;
}

/** A single spoken turn in the script. */
export interface ScriptLine {
  speaker: string;      // matches a PodcastSpeaker.role (voice lookup) or name
  text: string;
  /** Which planned segment (chapter) this line belongs to. */
  chapterIndex: number;
  citations?: { source: string; score: number }[];
}

/** A time-synced transcript entry (per spoken line) — powers click-transcript → jump-audio. */
export interface TranscriptSegment {
  segmentId: number;
  chapterIndex: number;
  speaker: string;
  text: string;
  startMs: number;
  endMs: number;
  citations?: { source: string; score: number }[];
}

/** Chapter marker with real audio timings. */
export interface PodcastChapter {
  index: number;
  title: string;
  startMs: number;
  endMs: number;
}

/** Output of the AudioComposer when generating chunks only. */
export interface ComposedChunks {
  ttsSegments: Record<number, { durMs: number; storagePath: string }>;
  transcript: TranscriptSegment[];
  chapters: PodcastChapter[];
  durationMs: number;
  totalWords: number;
  totalCharacters: number;
}

/** Output of the AudioComposer: the stitched audio + real per-line timings. */
export interface ComposedAudio extends ComposedChunks {
  audioLocalPath: string;
}

/** Grounding brief produced by the SourceResolver (what/where to teach from). */
export interface GroundingBrief {
  titleSeed: string;
  topic: string;
  /** Base source text (prompt, notebook summary, weak-topic list) to seed planning. */
  baseText: string;
  /** Notebook to scope GraphRAG retrieval to (empty string = no notebook / curriculum-wide). */
  notebookId: string;
  sourceIds?: string[];
  /** Focus topics distilled from the source (e.g. weak topics). */
  focusTopics: string[];
}

// ─── Durable job ─────────────────────────────────────────────────────────────

export type PodcastJobStage =
  | 'QUEUED'
  | 'PLANNING'
  | 'SCRIPTING'
  | 'SYNTHESIZING'
  | 'STITCHING'
  | 'SYNCING'
  | 'UPLOADING'
  | 'DONE'
  | 'ERROR'
  | 'CANCELLED';

export interface PodcastJob {
  id: string;
  podcastId: string;
  userId: string;
  request: PodcastGenerateRequest;
  stage: PodcastJobStage;
  progressPct: number;
  stageMessage: string;
  cancelRequested: boolean;
  attempts: number;
  error?: string;
  createdAt: number;
  updatedAt: number;
  checkpoint?: {
    plan?: PodcastPlan;
    scriptComplete?: boolean; // Flag to indicate script stage completed (script not stored due to Firestore nested array limitation)
    ttsSegments?: Record<number, { durMs: number; storagePath: string }>;
    chunksMetadata?: {
      transcript: TranscriptSegment[];
      chapters: PodcastChapter[];
      durationMs: number;
      totalWords: number;
      totalCharacters: number;
    };
  };
}

/** Maps a coarse job stage to the client-facing PodcastStatus + a friendly progress %. */
export const STAGE_PROGRESS: Record<PodcastJobStage, number> = {
  QUEUED: 2,
  PLANNING: 12,
  SCRIPTING: 35,
  SYNTHESIZING: 65,
  STITCHING: 82,
  SYNCING: 88,
  UPLOADING: 94,
  DONE: 100,
  ERROR: 100,
  CANCELLED: 100,
};

export const DURATION_CHOICES = [5, 10, 20, 30, 60] as const;

/** Default voice persona per role, used when the plan doesn't specify one. */
export const DEFAULT_ROLE_VOICE: Record<string, VoiceStyle> = {
  Teacher: 'warm_teacher',
  Student: 'friendly_mentor',
  Narrator: 'calm_narrator',
  Mentor: 'friendly_mentor',
  Examiner: 'exam_instructor',
  'Exam Coach': 'energetic_coach',
  Host: 'professional_lecturer',
  'Subject Expert': 'professional_lecturer',
};
