/**
 * Admin API for the Timeline Inspector.
 *
 * Read-only by default. The only write path is an explicit `persist: true` on a
 * dry run, and even that writes ONLY to the new `podcast_timelines` /
 * `podcast_producer_plans` collections — never to `podcasts` or `podcast_jobs`.
 *
 * Mounted under `/admin`, which already applies `requireAdmin`.
 */

import { Request, Response } from 'express';
import { logger } from '../../utils/logger';
import { podcastRepository } from '../../repositories/podcast.repository';
import { timelineRepository } from '../../repositories/timeline.repository';
import { AssetManifest, emptyAssetManifest } from '../../services/media/assets/AssetManifest';
import { directorDryRun } from '../../core/director/inspector/DirectorDryRun';
import { timelineInspector } from '../../core/director/inspector/TimelineInspector';
import { renderReport } from '../../core/director/inspector/renderReport';
import {
  cinematicIntensity,
  cinematicTracks,
  featureFlags,
  targetLufs,
} from '../../config/featureFlags';
import { assertEmotionCoverage } from '../../core/director/knowledge/emotionProfiles';
import { assertAmbienceCoverage, AMBIENCE_MAP } from '../../core/director/knowledge/ambienceMap';
import { ALL_LOCATIONS } from '../../core/director/schema/scene.schema';
import { ALL_EMOTIONS } from '../../core/director/schema/common.schema';
import { SFX_TRIGGERS } from '../../core/director/knowledge/sfxTriggers';

/**
 * The asset catalogue is loaded from Firestore config when present. Phase E
 * replaces this with a GCS-backed `AssetLibrary`; until then an empty manifest
 * simply means every asset reports as unresolved, which is accurate.
 */
async function loadManifest(): Promise<AssetManifest> {
  try {
    const { db } = await import('../../config/firebase');
    const doc = await db.collection('config').doc('audioAssetCatalogue').get();
    if (!doc.exists) return emptyAssetManifest;
    const { manifest, errors } = AssetManifest.from(doc.data());
    if (errors.length) {
      logger.warn('[DirectorInspector] Asset catalogue has errors', {
        errors: errors.slice(0, 5),
      });
    }
    return manifest;
  } catch {
    return emptyAssetManifest;
  }
}

export class DirectorInspectorController {
  /**
   * GET /admin/director/status
   * Flag state + knowledge-map coverage. The first thing to check when
   * something looks wrong.
   */
  getStatus = async (_req: Request, res: Response) => {
    try {
      const manifest = await loadManifest();
      const emotion = assertEmotionCoverage();
      const missingAmbience = assertAmbienceCoverage(ALL_LOCATIONS);

      res.json({
        flags: {
          aiDirector: featureFlags.aiDirector,
          aiDirectorShadowMode: featureFlags.aiDirectorShadowMode,
          aiProducer: featureFlags.aiProducer,
          emotionVoices: featureFlags.emotionVoices,
          cinematicTracks: [...cinematicTracks()],
          cinematicIntensity: cinematicIntensity(),
          targetLufs: targetLufs(),
        },
        coverage: {
          emotions: {
            total: ALL_EMOTIONS.length,
            covered: emotion.covered,
            missing: emotion.missing,
          },
          locations: {
            total: ALL_LOCATIONS.length,
            covered: Object.keys(AMBIENCE_MAP).length,
            missing: missingAmbience,
          },
          sfxTriggers: SFX_TRIGGERS.length,
        },
        assets: manifest.stats(),
      });
    } catch (error: any) {
      logger.error('[DirectorInspector] status failed', { error: error.message });
      res.status(500).json({ error: error.message });
    }
  };

  /**
   * GET /admin/director/timelines?userId=&limit=
   * Podcasts that already have a persisted timeline (i.e. shadow mode ran).
   */
  listTimelines = async (req: Request, res: Response) => {
    try {
      const userId = String(req.query.userId || '').trim();
      if (!userId) {
        return res.status(400).json({ error: 'userId query parameter is required' });
      }
      const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 25));

      const podcasts = await podcastRepository.listByUser(userId);
      const rows = await Promise.all(
        podcasts.slice(0, limit).map(async (p) => ({
          podcastId: p.id,
          title: p.title,
          status: p.status,
          createdAt: p.createdAt,
          hasTimeline: await timelineRepository.hasTimeline(p.id).catch(() => false),
        }))
      );

      res.json({ userId, count: rows.length, podcasts: rows });
    } catch (error: any) {
      logger.error('[DirectorInspector] listTimelines failed', { error: error.message });
      res.status(500).json({ error: error.message });
    }
  };

  /**
   * GET /admin/director/timeline/:podcastId?userId=&format=json|text
   * Inspect a PERSISTED timeline.
   */
  inspectStored = async (req: Request, res: Response) => {
    try {
      const userId = String(req.query.userId || '').trim();
      if (!userId) {
        return res.status(400).json({ error: 'userId query parameter is required' });
      }

      const manifest = await loadManifest();
      const report = await directorDryRun.inspectStored(
        userId,
        req.params.podcastId,
        manifest
      );

      if (!report) {
        return res.status(404).json({
          error: 'No persisted timeline for this podcast. Run a dry run instead.',
          hint: `POST /admin/director/dry-run/${req.params.podcastId}`,
        });
      }

      if (String(req.query.format) === 'text') {
        res.type('text/plain').send(renderReport(report));
        return;
      }
      res.json(report);
    } catch (error: any) {
      const status = /forbidden/i.test(error.message) ? 403 : 500;
      res.status(status).json({ error: error.message });
    }
  };

  /**
   * POST /admin/director/dry-run/:podcastId
   * Body: { userId, persist?, cinematicIntensity?, format? }
   *
   * Runs Producer + Director against a finished podcast WITHOUT touching the
   * generation pipeline. This is how direction quality is validated before any
   * pipeline edit.
   */
  dryRun = async (req: Request, res: Response) => {
    try {
      const userId = String(req.body?.userId || req.query.userId || '').trim();
      if (!userId) return res.status(400).json({ error: 'userId is required' });

      const intensity = req.body?.cinematicIntensity;
      if (intensity && !['subtle', 'balanced', 'dramatic'].includes(intensity)) {
        return res
          .status(400)
          .json({ error: 'cinematicIntensity must be subtle | balanced | dramatic' });
      }

      const manifest = await loadManifest();
      const result = await directorDryRun.run(userId, req.params.podcastId, {
        persist: req.body?.persist === true,
        cinematicIntensity: intensity,
        manifest,
      });

      if (String(req.body?.format || req.query.format) === 'text') {
        res.type('text/plain').send(renderReport(result.report));
        return;
      }

      res.json({
        podcastId: result.podcastId,
        persisted: result.persisted,
        timings: result.timings,
        report: result.report,
      });
    } catch (error: any) {
      const message = error?.message || 'Dry run failed';
      const status = /not found/i.test(message)
        ? 404
        : /forbidden/i.test(message)
        ? 403
        : /no transcript/i.test(message)
        ? 409
        : 500;
      logger.warn('[DirectorInspector] dryRun failed', { message });
      res.status(status).json({ error: message });
    }
  };

  /**
   * GET /admin/director/producer-plan/:podcastId?userId=
   * The raw ProducerPlan, including its decision rationale.
   */
  getProducerPlan = async (req: Request, res: Response) => {
    try {
      const userId = String(req.query.userId || '').trim();
      if (!userId) {
        return res.status(400).json({ error: 'userId query parameter is required' });
      }

      const plan = await timelineRepository.getProducerPlan(req.params.podcastId);
      if (!plan) return res.status(404).json({ error: 'No producer plan stored' });
      if (plan.userId !== userId) return res.status(403).json({ error: 'Forbidden' });

      res.json(plan);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  };

  /**
   * GET /admin/director/raw/:podcastId?userId=
   * The unprocessed MasterTimeline, for deep debugging.
   */
  getRawTimeline = async (req: Request, res: Response) => {
    try {
      const userId = String(req.query.userId || '').trim();
      if (!userId) {
        return res.status(400).json({ error: 'userId query parameter is required' });
      }

      const timeline = await timelineRepository.getTimeline(req.params.podcastId);
      if (!timeline) return res.status(404).json({ error: 'No timeline stored' });
      if (timeline.userId !== userId) return res.status(403).json({ error: 'Forbidden' });

      res.json(timeline);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  };

  /**
   * DELETE /admin/director/timeline/:podcastId?userId=
   * Removes only the planning artifacts. The podcast itself is untouched.
   */
  deleteArtifacts = async (req: Request, res: Response) => {
    try {
      const userId = String(req.query.userId || '').trim();
      if (!userId) {
        return res.status(400).json({ error: 'userId query parameter is required' });
      }

      const timeline = await timelineRepository.getTimeline(req.params.podcastId);
      if (timeline && timeline.userId !== userId) {
        return res.status(403).json({ error: 'Forbidden' });
      }

      await timelineRepository.deleteAllForPodcast(req.params.podcastId);
      res.status(204).end();
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  };
}

export const directorInspectorController = new DirectorInspectorController();
