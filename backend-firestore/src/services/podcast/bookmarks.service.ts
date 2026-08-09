import { v4 as uuidv4 } from 'uuid';
import { podcastRepository } from '../../repositories/podcast.repository';

export class BookmarksService {
  async createBookmark(userId: string, podcastId: string, timeMs: number, label?: string, note?: string): Promise<any> {
    const podcast = await podcastRepository.getPodcast(podcastId);
    if (!podcast || podcast.userId !== userId) throw new Error('Unauthorized or Podcast not found');

    const bookmarkId = `bmk_${uuidv4()}`;
    const data = {
      id: bookmarkId,
      userId,
      timeMs,
      label: label || '',
      note: note || '',
      createdAt: Date.now(),
    };
    await podcastRepository.createBookmark(podcastId, bookmarkId, data);
    return data;
  }

  async listBookmarks(userId: string, podcastId: string): Promise<any[]> {
    const podcast = await podcastRepository.getPodcast(podcastId);
    if (!podcast || podcast.userId !== userId) throw new Error('Unauthorized or Podcast not found');
    return podcastRepository.listBookmarks(podcastId);
  }
}

export const bookmarksService = new BookmarksService();
