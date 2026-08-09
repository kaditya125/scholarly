/**
 * Timeline Resolver Service — Firestore integration for timeline resolution.
 *
 * Wraps the core TimelineResolver with persistence:
 *   1. Load the planned timeline via TimelineRepository
 *   2. Resolve it (TTS synthesis + timestamp re-anchoring)
 *   3. Save the resolved timeline back
 *
 * Persistence goes through TimelineRepository so this service reads and writes
 * the SAME `podcast_timelines` document the renderer consumes. (An earlier
 * version hand-rolled a `podcasts/{id}/cinematicTimeline/latest` subcollection
 * path that nothing else in the codebase ever wrote to.)
 *
 * The service is idempotent: resolving an already-resolved timeline is a no-op
 * unless force=true, so the rendering pipeline can call it unconditionally
 * without risking duplicate TTS charges.
 */

import { logger } from '../../utils/logger';
import {
  TimelineResolver,
  emptyResolutionResult,
  type ResolutionResult,
} from '../../core/director/TimelineResolver';
import { timelineRepository } from '../../repositories/timeline.repository';
import type { MasterTimeline } from '../../core/director/schema/timeline.schema';

export interface ResolveTimelineRequest {
  userId: string;
  podcastId: string;
  /** Force re-resolution even if already resolved. */
  force?: boolean;
}

export interface ResolveTimelineResponse {
  success: boolean;
  result: ResolutionResult;
  timeline?: MasterTimeline;
}

class TimelineResolverService {
  /**
   * Resolve a planned timeline and persist the result.
   *
   * The cast embedded in the timeline is authoritative, so no ProducerPlan
   * lookup is required — that embedded snapshot is exactly what guarantees a
   * reproducible re-render.
   */
  async resolve(request: ResolveTimelineRequest): Promise<ResolveTimelineResponse> {
    const { userId, podcastId, force } = request;

    try {
      const timeline = await timelineRepository.getTimeline(podcastId);

      if (!timeline) {
        return {
          success: false,
          result: emptyResolutionResult({
            error: 'Timeline not found (or failed schema validation)',
          }),
        };
      }

      if (!timeline.cast?.characters?.length) {
        return {
          success: false,
          result: emptyResolutionResult({
            timelineId: timeline.id,
            error: 'Timeline has no cast; cannot bind voices',
          }),
        };
      }

      const resolver = new TimelineResolver({ skipIfResolved: !force });
      const result = await resolver.resolve(timeline);

      if (!result.success) {
        return { success: false, result, timeline };
      }

      if (!result.skipped) {
        await timelineRepository.saveTimeline(timeline);
        logger.info('[TimelineResolverService] Resolved timeline saved', {
          userId,
          podcastId,
          timelineId: timeline.id,
          totalDurationMs: timeline.totalDurationMs,
        });
      }

      return { success: true, result, timeline };
    } catch (error: any) {
      logger.error('[TimelineResolverService] Resolution failed', {
        userId,
        podcastId,
        error: error?.message,
      });

      return {
        success: false,
        result: emptyResolutionResult({ error: error?.message || String(error) }),
      };
    }
  }

  /** Check if a timeline is resolved without triggering resolution. */
  async isResolved(userId: string, podcastId: string): Promise<boolean> {
    try {
      const timeline = await timelineRepository.getTimeline(podcastId);
      return timeline?.phase === 'resolved';
    } catch (error: any) {
      logger.warn('[TimelineResolverService] Failed to check resolution status', {
        userId,
        podcastId,
        error: error?.message,
      });
      return false;
    }
  }
}

export const timelineResolverService = new TimelineResolverService();
