/**
 * DirectorDryRun — produce a ProducerPlan + MasterTimeline for an EXISTING
 * podcast, without touching the generation pipeline.
 *
 * Why this exists: the authorization requires the inspector to be complete
 * before audio rendering, and shadow mode is not wired yet. Without a dry run
 * the inspector would have nothing to inspect until the pipeline is edited —
 * which is exactly the edit we want to make last, with the tool already in hand.
 *
 * A dry run reconstructs the Director's inputs from a finished podcast:
 *   - PodcastPlan-like    ← podcast metadata + chapters
 *   - GeneratedScript-like ← the stored transcript.json
 *
 * READ-ONLY by default. `persist: true` writes the artifacts so the admin UI can
 * reload them, and even then it writes ONLY to the new collections — never to
 * `podcasts` or `podcast_jobs`.
 */

import { getStorage } from 'firebase-admin/storage';
import { logger } from '../../../utils/logger';
import { podcastRepository } from '../../../repositories/podcast.repository';
import { timelineRepository } from '../../../repositories/timeline.repository';
import { characterRepository } from '../../../repositories/character.repository';
import { AssetManifest, emptyAssetManifest } from '../../../services/media/assets/AssetManifest';
import { AIProducer, aiProducer } from '../../producer/AIProducer';
import { AIDirector, aiDirector } from '../AIDirector';
import { cinematicIntensity as cinematicIntensityFlag, targetLufs } from '../../../config/featureFlags';
import type { ProducerPlan } from '../../producer/schema/producerPlan.schema';
import type { MasterTimeline } from '../schema/timeline.schema';
import { TimelineInspector, timelineInspector, type TimelineInspectionReport } from './TimelineInspector';
import { syntheticDirect, type SyntheticDirectInput } from './syntheticDirect';

export interface DryRunOptions {
  /** Persist the ProducerPlan + MasterTimeline to their own collections. */
  persist?: boolean;
  /** Overrides the CINEMATIC_INTENSITY flag for a single run. */
  cinematicIntensity?: 'subtle' | 'balanced' | 'dramatic';
  /** Asset catalogue for resolution checks. Defaults to empty. */
  manifest?: AssetManifest;
}

export interface DryRunResult {
  podcastId: string;
  producerPlan: ProducerPlan;
  timeline: MasterTimeline;
  report: TimelineInspectionReport;
  persisted: boolean;
  /** Wall-clock cost of the dry run, for the performance budget. */
  timings: { producerMs: number; directorMs: number; totalMs: number };
}

interface TranscriptSegmentLike {
  speaker?: string;
  text?: string;
  chapterIndex?: number;
}

export class DirectorDryRun {
  constructor(
    private readonly producer: AIProducer = aiProducer,
    private readonly director: AIDirector = aiDirector,
    private readonly inspector: TimelineInspector = timelineInspector
  ) {}

  /**
   * Direct a SYNTHETIC script — no podcast, no transcript, no persistence.
   *
   * Delegates to `syntheticDirect`, which imports nothing but the Director, so
   * a bulk sweep needs no credentials and costs nothing. Kept as a method here
   * purely for discoverability alongside `run()`.
   */
  async runSynthetic(
    input: SyntheticDirectInput
  ): Promise<MasterTimeline | null> {
    return syntheticDirect(input);
  }
  /**
   * Run Producer + Director against a finished podcast.
   *
   * Throws only for genuinely unrecoverable input (missing podcast, empty
   * transcript) — the planning layers themselves never throw.
   */
  async run(
    userId: string,
    podcastId: string,
    options: DryRunOptions = {}
  ): Promise<DryRunResult> {
    const started = Date.now();

    const podcast = await podcastRepository.getPodcast(podcastId);
    if (!podcast) throw new Error(`Podcast ${podcastId} not found`);
    if (podcast.userId !== userId) throw new Error('Forbidden');

    const segments = await this.loadTranscript(podcast);
    if (segments.length === 0) {
      throw new Error(
        `Podcast ${podcastId} has no transcript to dry-run against (status ${podcast.status})`
      );
    }

    // ── Reconstruct the Director's inputs ─────────────────────────────────
    const chapters = (podcast.chapters ?? []).map((c, i) => ({
      index: typeof c.index === 'number' ? c.index : i,
      title: c.title || `Segment ${i + 1}`,
    }));

    const planLike = {
      title: podcast.title,
      description: podcast.description,
      language: podcast.language,
      type: podcast.type,
      estimatedMinutes: podcast.duration
        ? Math.round(podcast.duration / 60)
        : podcast.durationMs
        ? Math.round(podcast.durationMs / 60_000)
        : 10,
      speakers: (podcast.speakers ?? []).map((name) => ({
        name,
        role: inferRoleFromSpeakerName(name),
      })),
      segments: chapters.length
        ? chapters
        : // No chapters stored — derive from the transcript's own chapterIndex.
          deriveChaptersFromSegments(segments),
    };

    const scriptLike = {
      lines: segments.map((s, i) => ({
        speaker: s.speaker || 'Narrator',
        text: s.text || '',
        chapterIndex: typeof s.chapterIndex === 'number' ? s.chapterIndex : 0,
        _i: i,
      })),
    };

    const briefLike = {
      topic: podcast.title || 'the topic',
      titleSeed: podcast.title,
      baseText: podcast.description || '',
      notebookId: podcast.notebookId || '',
      focusTopics: podcast.learningObjectives ?? [],
    };

    const requestLike = {
      type: podcast.type || 'custom',
      durationMinutes: planLike.estimatedMinutes,
      speakerStyle: inferSpeakerStyle(podcast.speakers ?? []),
      language: podcast.language,
    };

    // ── Producer ──────────────────────────────────────────────────────────
    const producerStart = Date.now();
    const producerPlan = await this.producer.produce({
      podcastId,
      userId,
      brief: briefLike,
      request: requestLike,
    });
    const producerMs = Date.now() - producerStart;

    // ── Director ──────────────────────────────────────────────────────────
    const manifest = options.manifest ?? emptyAssetManifest;
    // Inject the manifest for this run without mutating the shared singleton.
    const director = new AIDirector({ manifest });

    const directorStart = Date.now();
    const timeline = await director.direct({
      podcastId,
      userId,
      plan: planLike,
      script: scriptLike,
      brief: briefLike,
      producerPlan,
      preferences: {
        cinematicIntensity: options.cinematicIntensity ?? cinematicIntensityFlag(),
        targetLoudnessLufs: targetLufs(),
      },
    });
    const directorMs = Date.now() - directorStart;

    // ── Inspect ───────────────────────────────────────────────────────────
    const report = this.inspector.inspect(timeline, { manifest, producerPlan });

    // ── Optional persistence (new collections only) ────────────────────────
    let persisted = false;
    if (options.persist) {
      try {
        await timelineRepository.saveProducerPlan(producerPlan);
        await timelineRepository.saveTimeline(timeline);
        // Remember the cast so future episodes reuse the same voices.
        await characterRepository.saveMany(userId, timeline.cast.characters);
        persisted = true;
      } catch (err: any) {
        logger.warn('[DirectorDryRun] Persistence failed (dry run still valid)', {
          podcastId,
          error: err?.message,
        });
      }
    }

    const totalMs = Date.now() - started;
    logger.info('[DirectorDryRun] Completed', {
      podcastId,
      lines: scriptLike.lines.length,
      scenes: timeline.scenes.length,
      qualityScore: report.quality.score,
      producerMs,
      directorMs,
      totalMs,
      persisted,
    });

    return {
      podcastId,
      producerPlan,
      timeline,
      report,
      persisted,
      timings: { producerMs, directorMs, totalMs },
    };
  }

  /**
   * Inspect an ALREADY-PERSISTED timeline (what shadow mode will produce).
   * Returns null when no timeline exists for the podcast.
   */
  async inspectStored(
    userId: string,
    podcastId: string,
    manifest: AssetManifest = emptyAssetManifest
  ): Promise<TimelineInspectionReport | null> {
    const timeline = await timelineRepository.getTimeline(podcastId);
    if (!timeline) return null;
    if (timeline.userId !== userId) throw new Error('Forbidden');

    const producerPlan = await timelineRepository.getProducerPlan(podcastId);
    return this.inspector.inspect(timeline, {
      manifest,
      producerPlan: producerPlan ?? undefined,
    });
  }

  // ── Transcript loading ──────────────────────────────────────────────────

  /** Mirrors the read path the podcast controller already uses. */
  private async loadTranscript(podcast: {
    transcriptPath?: string;
    transcriptUrl?: string;
  }): Promise<TranscriptSegmentLike[]> {
    try {
      if (podcast.transcriptPath) {
        const [buf] = await getStorage().bucket().file(podcast.transcriptPath).download();
        return normalizeTranscript(JSON.parse(buf.toString('utf-8')));
      }
      if (podcast.transcriptUrl) {
        const res = await fetch(podcast.transcriptUrl);
        if (!res.ok) return [];
        return normalizeTranscript(await res.json());
      }
    } catch (err: any) {
      logger.warn('[DirectorDryRun] Transcript load failed', { error: err?.message });
    }
    return [];
  }
}

// ---------------------------------------------------------------------------
// Helpers (exported for testing)
// ---------------------------------------------------------------------------

/** Transcript files have appeared in three shapes across pipeline versions. */
export function normalizeTranscript(raw: unknown): TranscriptSegmentLike[] {
  if (Array.isArray(raw)) return raw as TranscriptSegmentLike[];
  const obj = raw as { segments?: unknown; transcript?: unknown };
  if (Array.isArray(obj?.segments)) return obj.segments as TranscriptSegmentLike[];
  if (Array.isArray(obj?.transcript)) return obj.transcript as TranscriptSegmentLike[];
  return [];
}

/**
 * The stored podcast keeps only speaker NAMES, not roles. Recover a plausible
 * role so the voice registry and emotion ranges behave sensibly.
 */
export function inferRoleFromSpeakerName(name: string): string {
  const n = (name || '').trim().toLowerCase();
  // Devanagari role words appear directly as speaker names in Hindi episodes.
  if (/शिक्षक|अध्यापक/.test(name)) return 'Teacher';
  if (/छात्र|विद्यार्थी/.test(name)) return 'Student';
  if (/सूत्रधार|वाचक/.test(name)) return 'Narrator';

  if (/teacher|tutor|professor/.test(n)) return 'Teacher';
  if (/student|learner/.test(n)) return 'Student';
  if (/narrator/.test(n)) return 'Narrator';
  if (/host|anchor/.test(n)) return 'Host';
  if (/expert|scientist/.test(n)) return 'Subject Expert';
  if (/coach/.test(n)) return 'Exam Coach';
  if (/mentor/.test(n)) return 'Mentor';

  // A personal name with no role hint: treat the first speaker as the teacher.
  return 'Teacher';
}

/** Speaker count + roles → the closest SpeakerStyle. */
export function inferSpeakerStyle(speakers: string[]): string {
  if (speakers.length <= 1) return 'solo_narrator';
  const roles = speakers.map(inferRoleFromSpeakerName);
  if (roles.includes('Teacher') && roles.includes('Student')) return 'teacher_student';
  if (roles.includes('Host') && roles.includes('Subject Expert')) return 'interview';
  if (speakers.length >= 3) return 'discussion';
  return 'teacher_student';
}

/** Build chapter stubs from the transcript when the podcast stored none. */
export function deriveChaptersFromSegments(
  segments: TranscriptSegmentLike[]
): Array<{ index: number; title: string }> {
  const indices = [
    ...new Set(
      segments.map((s) => (typeof s.chapterIndex === 'number' ? s.chapterIndex : 0))
    ),
  ].sort((a, b) => a - b);

  return indices.map((index) => ({ index, title: `Segment ${index + 1}` }));
}

export const directorDryRun = new DirectorDryRun();
