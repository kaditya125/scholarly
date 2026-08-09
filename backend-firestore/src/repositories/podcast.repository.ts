import { db } from '../config/firebase';
import { PodcastMetadata } from '../types';
import { PodcastJob } from '../core/workflow/podcast/types';

/**
 * Firestore persistence for the Podcast Engine: episode metadata (`podcasts`) + durable
 * generation jobs (`podcast_jobs`). Listing filters by userId only and sorts in memory to
 * avoid a composite index (matches the platform's existing pattern).
 */
export class PodcastRepository {
  private readonly podcasts = db.collection('podcasts');
  private readonly jobs = db.collection('podcast_jobs');

  private bookmarks(podcastId: string) {
    return this.podcasts.doc(podcastId).collection('bookmarks');
  }

  private events(podcastId: string) {
    return this.podcasts.doc(podcastId).collection('events');
  }

  private interactions(podcastId: string) {
    return this.podcasts.doc(podcastId).collection('interactions');
  }

  // ── podcasts ──────────────────────────────────────────────────────────────
  async createPodcast(p: PodcastMetadata): Promise<void> {
    await this.podcasts.doc(p.id).set(p);
  }

  async getPodcast(id: string): Promise<PodcastMetadata | null> {
    const doc = await this.podcasts.doc(id).get();
    if (!doc.exists) return null;
    return { ...(doc.data() as any), id: doc.id } as PodcastMetadata;
  }

  async updatePodcast(id: string, patch: Partial<PodcastMetadata>): Promise<void> {
    await this.podcasts.doc(id).set({ ...patch, updatedAt: Date.now() }, { merge: true });
  }

  async listByUser(userId: string): Promise<PodcastMetadata[]> {
    const snap = await this.podcasts.where('userId', '==', userId).get();
    const items = snap.docs.map((d) => ({ ...(d.data() as any), id: d.id })) as PodcastMetadata[];
    return items.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  }

  async deletePodcast(id: string): Promise<void> {
    await this.podcasts.doc(id).delete();
  }

  // ── jobs ──────────────────────────────────────────────────────────────────
  async createJob(job: PodcastJob): Promise<void> {
    await this.jobs.doc(job.id).set(job);
  }

  async getJob(id: string): Promise<PodcastJob | null> {
    const doc = await this.jobs.doc(id).get();
    if (!doc.exists) return null;
    return { ...(doc.data() as any), id: doc.id } as PodcastJob;
  }

  async updateJob(id: string, patch: Partial<PodcastJob>): Promise<void> {
    // Handle nested field paths (e.g., 'checkpoint.plan' → proper nested structure)
    const update: any = { updatedAt: Date.now() };
    
    for (const [key, value] of Object.entries(patch)) {
      if (key.includes('.')) {
        // Nested field path like 'checkpoint.plan'
        const parts = key.split('.');
        let current = update;
        for (let i = 0; i < parts.length - 1; i++) {
          if (!current[parts[i]]) current[parts[i]] = {};
          current = current[parts[i]];
        }
        current[parts[parts.length - 1]] = value;
      } else {
        update[key] = value;
      }
    }
    
    await this.jobs.doc(id).set(update, { merge: true });
  }

  async requestCancel(id: string): Promise<void> {
    await this.jobs.doc(id).set({ cancelRequested: true, updatedAt: Date.now() }, { merge: true });
  }

  async deleteJob(id: string): Promise<void> {
    await this.jobs.doc(id).delete();
  }

  // ── subcollections ────────────────────────────────────────────────────────

  async createBookmark(podcastId: string, id: string, data: any): Promise<void> {
    await this.bookmarks(podcastId).doc(id).set(data);
  }

  async listBookmarks(podcastId: string): Promise<any[]> {
    const snap = await this.bookmarks(podcastId).get();
    return snap.docs.map(d => ({ ...(d.data() as any), id: d.id }));
  }

  async createEvent(podcastId: string, id: string, data: any): Promise<void> {
    await this.events(podcastId).doc(id).set(data);
  }

  async createInteraction(podcastId: string, id: string, data: any): Promise<void> {
    await this.interactions(podcastId).doc(id).set(data);
  }
}

export const podcastRepository = new PodcastRepository();
