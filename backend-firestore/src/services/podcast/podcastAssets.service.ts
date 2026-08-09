import { backgroundQueue } from '../../core/workflow/jobs/BackgroundQueue';
import { podcastRepository } from '../../repositories/podcast.repository';

/**
 * Handles post-generation asset creation for podcasts (Flashcards, Quizzes, Mindmaps, etc.)
 */
export class PodcastAssetsService {
  async triggerAssetGeneration(userId: string, podcastId: string, transcriptPath: string): Promise<void> {
    // We could queue this up as a separate background job, or integrate with existing notebook asset generation.
    // For now, we'll enqueue a post-assets job.
    await backgroundQueue.enqueueGeneric('podcast.postassets', { podcastId, userId, transcriptPath });
  }

  /**
   * Executed by the BackgroundWorker for 'podcast.postassets' job.
   */
  async generateAssets(podcastId: string, userId: string, transcriptPath: string): Promise<void> {
    try {
      // Set status to GENERATING_ASSETS
      await podcastRepository.updatePodcast(podcastId, { status: 'GENERATING_ASSETS' });

      // Here you would integrate with existing structured LLM calls to generate 
      // the flashcards, mind maps, quizzes, etc. based on the transcript JSON in Cloud Storage.
      // E.g., const transcript = await downloadTranscript(transcriptPath);
      // const flashcards = await callStructuredLLM(...);

      // Once done, set it back to READY
      await podcastRepository.updatePodcast(podcastId, { status: 'READY' });
    } catch (err) {
      console.error(`[PodcastAssets] failed to generate assets for ${podcastId}:`, err);
      // Revert to READY even if asset generation fails so the user can still listen to the audio.
      await podcastRepository.updatePodcast(podcastId, { status: 'READY' });
    }
  }
}

export const podcastAssetsService = new PodcastAssetsService();
