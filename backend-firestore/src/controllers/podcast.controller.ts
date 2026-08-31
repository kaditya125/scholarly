import { Request, Response } from 'express';
import { getStorage } from 'firebase-admin/storage';
import { podcastEngineService } from '../services/podcast/podcastEngine.service';
import { bookmarksService } from '../services/podcast/bookmarks.service';
import { analyticsService, PodcastEventType } from '../services/podcast/analytics.service';
import { liveInteractionService } from '../services/podcast/liveInteraction.service';
import { PodcastGenerateRequest, PodcastSourceKind } from '../core/workflow/podcast/types';
import { PODCAST_STYLE_IDS, isPodcastStyleId } from '../core/workflow/podcast/podcastStyles';
import { featureFlags, cinematicTracks, cinematicIntensity } from '../config/featureFlags';
import { usageService } from '../services/usage.service';

const AUDIO_URL_TTL_MS = 6 * 60 * 60 * 1000; // 6 hours

const VALID_SOURCE_KINDS: PodcastSourceKind[] = ['prompt', 'notebook', 'weak_topics', 'topic'];

/**
 * PodcastController — the Podcast Engine's HTTP surface.
 * generate (durable async), list/history, get (ownership-checked), cancel.
 */
export class PodcastController {
  generate = async (req: Request, res: Response) => {
    try {
      const userId = req.user?.uid;
      if (!userId) return res.status(401).json({ error: 'Unauthorized' });

      const body = (req.body || {}) as PodcastGenerateRequest;
      const source = body.source;
      if (!source || !VALID_SOURCE_KINDS.includes(source.kind)) {
        return res.status(400).json({ error: 'A valid source.kind is required (prompt | notebook | weak_topics | topic).' });
      }
      if (source.kind === 'prompt' && !(source.prompt || '').trim()) {
        return res.status(400).json({ error: 'source.prompt is required for a prompt podcast.' });
      }
      if (source.kind === 'notebook' && !(source.notebookId || '').trim()) {
        return res.status(400).json({ error: 'source.notebookId is required for a notebook podcast.' });
      }
      if (source.kind === 'topic' && !(source.topic || source.prompt || '').trim()) {
        return res.status(400).json({ error: 'source.topic is required for a topic podcast.' });
      }
      // Reject rather than silently fall back, so a typo'd style is visible to the
      // caller instead of quietly producing a teacher/student episode.
      if (body.podcastStyle !== undefined && !isPodcastStyleId(body.podcastStyle)) {
        return res.status(400).json({
          error: `podcastStyle must be one of: ${PODCAST_STYLE_IDS.join(' | ')}.`,
        });
      }

      // ── Server-Side Quota Enforcement ──
      try {
        await usageService.consumeQuota(userId, 'podcastsGenerated', 1);
      } catch (err: any) {
        if (err.code === 'QUOTA_EXHAUSTED') {
          return res.status(403).json({
            code: 'QUOTA_EXHAUSTED',
            feature: 'podcasts',
            error: err.message,
            used: err.used,
            limit: err.limit,
            remaining: err.remaining,
            resetsAt: err.resetsAt,
            plan: err.plan,
          });
        }
        throw err;
      }

      const { podcastId, jobId } = await podcastEngineService.startGeneration(userId, body);
      res.status(202).json({ podcastId, jobId, status: 'PENDING' });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  };

  list = async (req: Request, res: Response) => {
    try {
      const userId = req.user?.uid;
      if (!userId) return res.status(401).json({ error: 'Unauthorized' });
      const podcasts = await podcastEngineService.list(userId);
      res.status(200).json(podcasts);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  };

  get = async (req: Request, res: Response) => {
    try {
      const userId = req.user?.uid;
      if (!userId) return res.status(401).json({ error: 'Unauthorized' });
      const podcast = await podcastEngineService.get(userId, req.params.id);
      if (!podcast) return res.status(404).json({ error: 'Podcast not found' });
      res.status(200).json(podcast);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  };

  cancel = async (req: Request, res: Response) => {
    try {
      const userId = req.user?.uid;
      if (!userId) return res.status(401).json({ error: 'Unauthorized' });
      const ok = await podcastEngineService.requestCancel(userId, req.params.id);
      if (!ok) return res.status(404).json({ error: 'Podcast not found' });
      res.status(200).json({ success: true });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  };

  deletePodcast = async (req: Request, res: Response) => {
    try {
      const userId = req.user?.uid;
      if (!userId) return res.status(401).json({ error: 'Unauthorized' });
      const ok = await podcastEngineService.deletePodcast(userId, req.params.id);
      if (!ok) return res.status(404).json({ error: 'Podcast not found' });
      res.status(200).json({ success: true });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  };

  /** GET /podcasts/:id/audio -> { url }. Ownership-checked. For private episodes we mint a
   * short-lived v4 signed URL (GCS serves it directly, with HTTP Range → seek/resume); legacy
   * episodes that stored a public URL return it as-is. The client fetches this over the
   * authenticated API client and then uses the returned url as the <audio> src.
   */
  getAudioUrl = async (req: Request, res: Response) => {
    try {
      const userId = req.user?.uid;
      if (!userId) return res.status(401).json({ error: 'Unauthorized' });
      const podcast = await podcastEngineService.get(userId, req.params.id);
      if (!podcast) return res.status(404).json({ error: 'Podcast not found' });

      if (podcast.audioPath) {
        const [url] = await getStorage().bucket().file(podcast.audioPath).getSignedUrl({
          version: 'v4',
          action: 'read',
          expires: Date.now() + AUDIO_URL_TTL_MS,
        });
        return res.json({ url, expiresInMs: AUDIO_URL_TTL_MS });
      }
      if (podcast.audioUrl) return res.json({ url: podcast.audioUrl }); // legacy public episode
      return res.status(404).json({ error: 'Audio is not available yet.' });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  };

  /** GET /podcasts/:id/cover -> { url }. Ownership-checked. Returns signed URL for cover image. */
  getCoverUrl = async (req: Request, res: Response) => {
    try {
      const userId = req.user?.uid;
      if (!userId) return res.status(401).json({ error: 'Unauthorized' });
      const podcast = await podcastEngineService.get(userId, req.params.id);
      if (!podcast) return res.status(404).json({ error: 'Podcast not found' });

      const coverImagePath = (podcast as any).coverImagePath;
      if (coverImagePath) {
        const [url] = await getStorage().bucket().file(coverImagePath).getSignedUrl({
          version: 'v4',
          action: 'read',
          expires: Date.now() + (7 * 24 * 60 * 60 * 1000), // 7 days for images
        });
        return res.json({ url });
      }
      
      // No cover image yet
      return res.status(404).json({ error: 'Cover image not available yet.' });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  };

  /**
   * POST /podcasts/:id/cover -> { url }. Ownership-checked.
   *
   * Regenerates the cover art on demand. Needed because podcasts produced
   * before the Imagen aspect-ratio fix fell back to a flat SVG gradient, and
   * that stored fallback would otherwise be permanent. Synchronous so the
   * caller can swap the image in as soon as it returns.
   */
  regenerateCover = async (req: Request, res: Response) => {
    try {
      const userId = req.user?.uid;
      if (!userId) return res.status(401).json({ error: 'Unauthorized' });

      const podcastId = req.params.id;
      const podcast = await podcastEngineService.get(userId, podcastId);
      if (!podcast) return res.status(404).json({ error: 'Podcast not found' });

      const { coverImageService } = await import('../services/ai/coverImage.service');
      const { podcastRepository } = await import('../repositories/podcast.repository');

      const coverImagePath = await coverImageService.generateAndUpload({
        userId,
        podcastId,
        title: podcast.title || 'Podcast',
        description: podcast.description || '',
        language: (podcast as any).language,
        type: (podcast as any).type,
      });

      await podcastRepository.updatePodcast(podcastId, { coverImagePath } as any);

      const [url] = await getStorage().bucket().file(coverImagePath).getSignedUrl({
        version: 'v4',
        action: 'read',
        expires: Date.now() + 7 * 24 * 60 * 60 * 1000,
      });

      return res.json({ url });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  };

  /** GET /podcasts/:id/transcript -> timed segments JSON. Ownership-checked. */
  getTranscript = async (req: Request, res: Response) => {
    try {
      const userId = req.user?.uid;
      if (!userId) return res.status(401).json({ error: 'Unauthorized' });
      const podcast = await podcastEngineService.get(userId, req.params.id);
      if (!podcast) return res.status(404).json({ error: 'Podcast not found' });

      if (podcast.transcriptPath) {
        const [buf] = await getStorage().bucket().file(podcast.transcriptPath).download();
        return res.json(JSON.parse(buf.toString('utf-8')));
      }
      if (podcast.transcriptUrl) {
        const r = await fetch(podcast.transcriptUrl);
        if (!r.ok) return res.status(502).json({ error: 'Failed to load transcript' });
        return res.json(await r.json());
      }
      return res.json([]);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  };

  /** POST /podcasts/:id/bookmark -> { timeMs, label, note } */
  bookmark = async (req: Request, res: Response) => {
    try {
      const userId = req.user?.uid;
      if (!userId) return res.status(401).json({ error: 'Unauthorized' });
      const { timeMs, label, note } = req.body;
      const bmk = await bookmarksService.createBookmark(userId, req.params.id, timeMs, label, note);
      res.status(201).json(bmk);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  };

  /** POST /podcasts/:id/analytics -> { type, timeMs, fromMs, toMs, segmentId } */
  analytics = async (req: Request, res: Response) => {
    try {
      const userId = req.user?.uid;
      if (!userId) return res.status(401).json({ error: 'Unauthorized' });
      const { type, timeMs, fromMs, toMs, segmentId } = req.body;
      await analyticsService.logEvent(userId, req.params.id, type as PodcastEventType, timeMs, fromMs, toMs, segmentId);
      res.status(204).end();
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  };

  /** POST /podcasts/:id/ask -> { question, timeMs, segmentId } (SSE stream) */
  ask = async (req: Request, res: Response) => {
    try {
      const userId = req.user?.uid;
      if (!userId) return res.status(401).json({ error: 'Unauthorized' });
      const { question, timeMs, segmentId } = req.body;
      if (!question) return res.status(400).json({ error: 'question is required' });
      await liveInteractionService.ask(userId, req.params.id, question, timeMs, segmentId, res);
    } catch (error: any) {
      // If headers already sent (SSE started), we can't send a 500 JSON.
      if (!res.headersSent) {
        res.status(500).json({ error: error.message });
      } else {
        res.write(`data: ${JSON.stringify({ error: error.message })}\n\n`);
        res.end();
      }
    }
  };

  /**
   * GET /podcasts/cinematic/status
   * Returns the current cinematic audio feature flags for the Studio UI indicator.
   * No auth required - these are deployment-level public configuration signals.
   */
  getCinematicStatus = async (_req: Request, res: Response) => {
    try {
      const tracks = cinematicTracks();
      const intensity = cinematicIntensity();
      
      res.status(200).json({
        enabled: featureFlags.aiDirector && !featureFlags.aiDirectorShadowMode && tracks.size > 0,
        shadowMode: featureFlags.aiDirector && featureFlags.aiDirectorShadowMode,
        tracks: Array.from(tracks),
        intensity,
        flags: {
          aiDirector: featureFlags.aiDirector,
          aiDirectorShadowMode: featureFlags.aiDirectorShadowMode,
          aiProducer: featureFlags.aiProducer,
          emotionVoices: featureFlags.emotionVoices,
          // Exposed so the live process can be checked without reading its env:
          // a stale server silently ignoring `podcastStyle` looks identical to a
          // working one until you compare two episodes.
          enhancedPodcastStyles: featureFlags.enhancedPodcastStyles,
        },
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  };
}
