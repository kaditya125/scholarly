import { api } from './client';
import { PodcastMetadata } from '../../types';

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
 * LEGACY conversation shape. Kept so existing drafts and the older
 * GeneratePodcastModal keep working; it cannot express the six studio formats
 * (Storytelling, Documentary and Solo Narration all collapse onto
 * 'solo_narrator'). Use `PodcastStyleId` for new work.
 */
export type SpeakerStyle = 'teacher_student' | 'mentor' | 'discussion' | 'interview' | 'solo_narrator';

/**
 * The six production formats. Mirrors PodcastStyleId in
 * backend-firestore/src/core/workflow/podcast/podcastStyles.ts — keep in sync.
 */
export type PodcastStyleId =
  | 'teacher_student'
  | 'storytelling'
  | 'documentary'
  | 'interview'
  | 'debate'
  | 'solo_narration';

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
  prompt?: string;
  topic?: string;
}

export interface GeneratePodcastRequest {
  type: PodcastType;
  source: PodcastSource;
  durationMinutes: number;
  /** LEGACY — still sent for back-compat with older backends. */
  speakerStyle?: SpeakerStyle;
  /**
   * The chosen production format. Honoured by the backend only when
   * ENHANCED_PODCAST_STYLES is enabled; otherwise `speakerStyle` is used.
   */
  podcastStyle?: PodcastStyleId;
  voiceStyle?: VoiceStyle;
  language?: string;
}

export interface GeneratePodcastResponse {
  podcastId: string;
  jobId: string;
  status: string;
}

/** A time-synced transcript segment (matches backend transcript.json). */
export interface TranscriptSegment {
  segmentId: number;
  chapterIndex?: number;
  speaker: string;
  text: string;
  startMs?: number;
  endMs?: number;
  citations?: { source: string; score: number }[];
}

export const podcastsApi = {
  /** All podcasts owned by the current user (newest first). */
  async list(): Promise<PodcastMetadata[]> {
    const res = await api.get('/podcasts');
    return res.data;
  },

  /** Kick off a durable generation job. Returns immediately with the new podcast id. */
  async generate(req: GeneratePodcastRequest): Promise<GeneratePodcastResponse> {
    const res = await api.post('/podcasts/generate', req);
    return res.data;
  },

  /** Fetch a single episode (ownership-checked). */
  async get(id: string): Promise<PodcastMetadata> {
    const res = await api.get(`/podcasts/${id}`);
    return res.data;
  },

  /** Request cancellation of an in-progress generation. */
  async cancel(id: string): Promise<void> {
    await api.post(`/podcasts/${id}/cancel`);
  },

  /** Delete a podcast and its associated job. */
  async delete(id: string): Promise<void> {
    await api.delete(`/podcasts/${id}`);
  },

  /**
   * Signed playback URL for the podcast audio. The backend generates a
   * short-lived signed URL, so this must be called when playback starts
   * rather than cached long-term.
   */
  async getAudioUrl(id: string): Promise<string | null> {
    const res = await api.get(`/podcasts/${id}/audio`);
    return res.data?.url ?? null;
  },

  /** Signed URL for the generated cover art, or null if none exists yet. */
  async getCoverUrl(id: string): Promise<string | null> {
    try {
      const res = await api.get(`/podcasts/${id}/cover`);
      return res.data?.url ?? null;
    } catch {
      // 404 until the cover job finishes — not an error worth surfacing.
      return null;
    }
  },

  /**
   * Regenerate the cover art and return the new signed URL. Runs Imagen
   * synchronously on the backend, so expect this to take a few seconds.
   */
  async regenerateCover(id: string): Promise<string | null> {
    const res = await api.post(`/podcasts/${id}/cover`);
    return res.data?.url ?? null;
  },

  /**
   * Fetch the timed transcript segments for a podcast. The backend owns the
   * signed-URL/GCS-download plumbing at `GET /podcasts/:id/transcript` so we
   * never need to touch a raw storage URL from the browser.
   */
  async getTranscript(id: string): Promise<TranscriptSegment[]> {
    const res = await api.get(`/podcasts/${id}/transcript`);
    const data = res.data;
    if (Array.isArray(data)) return data;
    if (Array.isArray(data?.segments)) return data.segments;
    if (Array.isArray(data?.transcript)) return data.transcript;
    return [];
  },

  /** Bookmark a specific time in the podcast. */
  async bookmark(id: string, req: { timeMs: number; label?: string; note?: string }): Promise<void> {
    await api.post(`/podcasts/${id}/bookmark`, req);
  },

  /** Log an analytics event (play, pause, seek, etc). */
  async analytics(id: string, req: { type: string; timeMs: number; fromMs?: number; toMs?: number; segmentId?: number }): Promise<void> {
    await api.post(`/podcasts/${id}/analytics`, req);
  },

  /** Live interaction Q&A via SSE. Returns the Response object to process the stream. */
  async ask(id: string, req: { question: string; timeMs: number; segmentId: number }): Promise<Response> {
    // Note: Since this is an SSE stream, we use native fetch with the auth token.
    const { auth } = await import('../firebase');
    const token = await auth.currentUser?.getIdToken();
    const res = await fetch(`${api.defaults.baseURL}/podcasts/${id}/ask`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(req),
    });
    if (!res.ok) throw new Error('Failed to start ask stream');
    return res;
  },

  /** Get cinematic audio feature status (no auth required - public deployment config). */
  async getCinematicStatus(): Promise<{
    enabled: boolean;
    shadowMode: boolean;
    tracks: ('music' | 'ambience' | 'sfx' | 'pause')[];
    intensity: 'subtle' | 'balanced' | 'dramatic';
    flags: {
      aiDirector: boolean;
      aiDirectorShadowMode: boolean;
      aiProducer: boolean;
      emotionVoices: boolean;
    };
  }> {
    const res = await api.get('/podcasts/cinematic/status');
    return res.data;
  },
};
