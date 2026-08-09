/**
 * MasterTimeline + ProducerPlan persistence.
 *
 * Stored in SEPARATE top-level collections rather than inside the `podcasts`
 * document, for two reasons documented in AI_DIRECTOR_ARCHITECTURE.md §17.3:
 *   - a 30-minute episode's timeline is ~400KB and would crowd the 1MiB limit
 *   - Firestore forbids nested arrays, which already forced the podcast job to
 *     store `scriptComplete: boolean` instead of the script itself
 *
 * Reads validate on the way out. A stored document that fails validation is
 * returned as `null` rather than as a malformed object, so a corrupt timeline
 * degrades to the legacy render path instead of crashing the mixer.
 */

import { db } from '../config/firebase';
import { logger } from '../utils/logger';
import {
  MasterTimelineSchema,
  type MasterTimeline,
} from '../core/director/schema/timeline.schema';
import {
  ProducerPlanSchema,
  type ProducerPlan,
} from '../core/producer/schema/producerPlan.schema';

export class TimelineRepository {
  private readonly timelines = db.collection('podcast_timelines');
  private readonly producerPlans = db.collection('podcast_producer_plans');

  // ── MasterTimeline ────────────────────────────────────────────────────────

  /**
   * Persist a timeline. Keyed by podcastId (not timeline id) so the latest
   * timeline for an episode is always a single deterministic read.
   */
  async saveTimeline(timeline: MasterTimeline): Promise<void> {
    // Firestore rejects `undefined`; strip via a JSON round-trip. Also gives us
    // a plain object, which the Admin SDK requires for nested writes.
    const sanitized = JSON.parse(JSON.stringify(timeline));
    await this.timelines.doc(timeline.podcastId).set(sanitized);
  }

  /** Latest timeline for an episode, or null when absent/corrupt. */
  async getTimeline(podcastId: string): Promise<MasterTimeline | null> {
    const doc = await this.timelines.doc(podcastId).get();
    if (!doc.exists) return null;

    const parsed = MasterTimelineSchema.safeParse(doc.data());
    if (!parsed.success) {
      logger.warn('[TimelineRepository] Stored timeline failed validation', {
        podcastId,
        issues: parsed.error.issues.slice(0, 3).map((i) => i.message),
      });
      return null;
    }
    return parsed.data;
  }

  /** Whether a timeline exists, without paying to deserialize it. */
  async hasTimeline(podcastId: string): Promise<boolean> {
    const doc = await this.timelines.doc(podcastId).get();
    return doc.exists;
  }

  /** Merge-patch a timeline (e.g. attaching resolved timings). */
  async patchTimeline(
    podcastId: string,
    patch: Partial<MasterTimeline>
  ): Promise<void> {
    const sanitized = JSON.parse(JSON.stringify(patch));
    await this.timelines.doc(podcastId).set(sanitized, { merge: true });
  }

  async deleteTimeline(podcastId: string): Promise<void> {
    await this.timelines.doc(podcastId).delete();
  }

  /**
   * Timelines for one user, newest first — the input to a batch quality sweep.
   *
   * Documents that fail validation are SKIPPED rather than returned as nulls, so
   * a single corrupt timeline cannot break a 20-timeline review run. The count
   * returned may therefore be smaller than `limit`.
   */
  async listTimelinesForUser(
    userId: string,
    limit = 20
  ): Promise<MasterTimeline[]> {
    try {
      const snap = await this.timelines
        .where('userId', '==', userId)
        .orderBy('createdAt', 'desc')
        .limit(limit)
        .get();

      const out: MasterTimeline[] = [];
      for (const doc of snap.docs) {
        const parsed = MasterTimelineSchema.safeParse(doc.data());
        if (parsed.success) {
          out.push(parsed.data);
        } else {
          logger.warn('[TimelineRepository] Skipping invalid timeline in list', {
            podcastId: doc.id,
            issues: parsed.error.issues.slice(0, 2).map((i) => i.message),
          });
        }
      }
      return out;
    } catch (error) {
      // A missing composite index is the likely cause; report it rather than
      // failing the whole sweep.
      logger.warn('[TimelineRepository] listTimelinesForUser failed', {
        userId,
        error: error instanceof Error ? error.message : String(error),
      });
      return [];
    }
  }

  // ── ProducerPlan ──────────────────────────────────────────────────────────

  async saveProducerPlan(plan: ProducerPlan): Promise<void> {
    const sanitized = JSON.parse(JSON.stringify(plan));
    await this.producerPlans.doc(plan.podcastId).set(sanitized);
  }

  async getProducerPlan(podcastId: string): Promise<ProducerPlan | null> {
    const doc = await this.producerPlans.doc(podcastId).get();
    if (!doc.exists) return null;

    const parsed = ProducerPlanSchema.safeParse(doc.data());
    if (!parsed.success) {
      logger.warn('[TimelineRepository] Stored producer plan failed validation', {
        podcastId,
        issues: parsed.error.issues.slice(0, 3).map((i) => i.message),
      });
      return null;
    }
    return parsed.data;
  }

  async deleteProducerPlan(podcastId: string): Promise<void> {
    await this.producerPlans.doc(podcastId).delete();
  }

  /** Remove both artifacts for an episode — used by podcast deletion. */
  async deleteAllForPodcast(podcastId: string): Promise<void> {
    await Promise.all([
      this.deleteTimeline(podcastId).catch(() => {}),
      this.deleteProducerPlan(podcastId).catch(() => {}),
    ]);
  }
}

export const timelineRepository = new TimelineRepository();
