import { v4 as uuidv4 } from 'uuid';
import { podcastRepository } from '../../repositories/podcast.repository';

export type PodcastEventType = 'play' | 'pause' | 'seek' | 'complete' | 'replay' | 'bookmark' | 'ask';

export class AnalyticsService {
  async logEvent(
    userId: string,
    podcastId: string,
    type: PodcastEventType,
    timeMs: number,
    fromMs?: number,
    toMs?: number,
    segmentId?: number,
  ): Promise<void> {
    const podcast = await podcastRepository.getPodcast(podcastId);
    if (!podcast || podcast.userId !== userId) throw new Error('Unauthorized or Podcast not found');

    const eventId = `evt_${uuidv4()}`;
    const data = {
      id: eventId,
      userId,
      type,
      timeMs,
      fromMs,
      toMs,
      segmentId,
      createdAt: Date.now(),
    };
    await podcastRepository.createEvent(podcastId, eventId, data);
  }
}

export const analyticsService = new AnalyticsService();
