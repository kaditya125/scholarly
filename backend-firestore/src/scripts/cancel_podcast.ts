/**
 * Cancels an in-flight podcast the same way the HTTP endpoint does, then marks
 * the podcast document so it does not sit in a running state forever after the
 * worker process is stopped.
 *
 * Usage: node --import tsx src/scripts/cancel_podcast.ts <podcastId>
 */

import '../config/firebase';
import { podcastRepository } from '../repositories/podcast.repository';

async function main() {
  const podcastId = process.argv[2];
  if (!podcastId) {
    console.error('Usage: cancel_podcast.ts <podcastId>');
    process.exit(1);
  }

  const podcast = await podcastRepository.getPodcast(podcastId);
  if (!podcast) {
    console.log(`${podcastId}: not found`);
    process.exit(1);
  }

  console.log(`before: status=${podcast.status} jobId=${podcast.jobId ?? '(none)'}`);

  // Cooperative cancel — the pipeline checks this between stages.
  if (podcast.jobId) {
    await podcastRepository.requestCancel(podcast.jobId);
    await podcastRepository.updateJob(podcast.jobId, {
      stage: 'CANCELLED',
      progressPct: 100,
    } as any);
    console.log('cancel requested on job');
  }

  // The worker is about to be stopped, so it will not run the cooperative check.
  // Set the terminal state directly to avoid a permanently "generating" episode.
  await podcastRepository.updatePodcast(podcastId, {
    status: 'CANCELLED',
    progressPct: 100,
  } as any);

  const after = await podcastRepository.getPodcast(podcastId);
  console.log(`after:  status=${after?.status}`);
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
