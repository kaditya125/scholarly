import { podcastEngineService } from '../../../src/services/podcast/podcastEngine.service';
import { podcastRepository } from '../../../src/repositories/podcast.repository';
import { backgroundQueue } from '../../../src/core/workflow/jobs/BackgroundQueue';

jest.mock('../../../src/repositories/podcast.repository');
jest.mock('../../../src/core/workflow/jobs/BackgroundQueue');
// We need to mock the internals of the pipeline to avoid actual API calls
jest.mock('../../../src/core/workflow/podcast/SourceResolver', () => ({
  sourceResolver: { resolve: jest.fn().mockResolvedValue({ topic: 'test' }) }
}));
jest.mock('../../../src/core/workflow/podcast/PodcastPlanner', () => ({
  podcastPlanner: { buildPlan: jest.fn().mockResolvedValue({ segments: [], speakers: [] }) }
}));
jest.mock('../../../src/core/workflow/podcast/ConversationGenerator', () => ({
  conversationGenerator: { generate: jest.fn().mockResolvedValue({ lines: [{ text: 'hi' }] }) }
}));
// Synthesis and stitching are separate jobs now: runJob synthesizes chunks, checkpoints them and
// enqueues 'podcast.stitch'; runStitchJob stitches, (optionally) renders the cinematic mix, uploads.
const CHUNKS = { ttsSegments: { 0: 'seg0.mp3' }, chapters: [], durationMs: 1000, totalWords: 1, totalCharacters: 2 };
jest.mock('../../../src/core/workflow/podcast/AudioComposer', () => ({
  audioComposer: {
    composeChunks: jest.fn().mockImplementation(async () => CHUNKS),
    stitchChunks: jest.fn().mockResolvedValue({ audioLocalPath: '/tmp/pod1.mp3', durationMs: 1000, chapters: [], totalWords: 1, totalCharacters: 2 }),
  }
}));
jest.mock('../../../src/core/director/ShadowModeRunner', () => ({
  shadowModeRunner: { run: jest.fn().mockResolvedValue({ ok: false, reason: 'director_disabled' }) }
}));
jest.mock('../../../src/services/media/rendering', () => ({
  cinematicShadowRunner: { run: jest.fn().mockResolvedValue({ rendered: false, isActive: false }) }
}));
// Mock storage upload
jest.mock('firebase-admin/storage', () => ({
  getStorage: () => ({
    bucket: () => ({
      upload: jest.fn().mockResolvedValue([])
    })
  })
}));

describe('PodcastEngineService Integration', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should start generation, create job, and enqueue properly', async () => {
    const req = { type: 'custom', source: { kind: 'topic', topic: 'AI' }, durationMinutes: 10 } as any;
    const { podcastId, jobId } = await podcastEngineService.startGeneration('user1', req);
    
    expect(podcastId).toBeDefined();
    expect(jobId).toBeDefined();
    expect(podcastRepository.createPodcast).toHaveBeenCalled();
    expect(podcastRepository.createJob).toHaveBeenCalled();
    expect(backgroundQueue.enqueueGeneric).toHaveBeenCalledWith('podcast.generate', { jobId });
  });

  it('runs synthesis, checkpoints the chunks and hands off to the stitch queue', async () => {
    (podcastRepository.getJob as jest.Mock).mockResolvedValue({
      id: 'job1', podcastId: 'pod1', userId: 'user1', request: { source: {} }
    });

    await podcastEngineService.runJob('job1');

    for (const stage of ['PLANNING', 'SCRIPTING', 'SYNTHESIZING', 'STITCHING']) {
      expect(podcastRepository.updateJob).toHaveBeenCalledWith('job1', expect.objectContaining({ stage }));
    }
    // The checkpoint must be written before the stitch job can run.
    expect(podcastRepository.updateJob).toHaveBeenCalledWith(
      'job1',
      expect.objectContaining({ 'checkpoint.ttsSegments': CHUNKS.ttsSegments })
    );
    expect(backgroundQueue.enqueueMediaJob).toHaveBeenCalledWith('podcast.stitch', { jobId: 'job1' });
    expect(podcastRepository.updatePodcast).not.toHaveBeenCalledWith('pod1', expect.objectContaining({ status: 'FAILED' }));
  });

  it('stitch job stitches the checkpointed chunks, uploads and marks the podcast READY', async () => {
    (podcastRepository.getJob as jest.Mock).mockResolvedValue({
      id: 'job1', podcastId: 'pod1', userId: 'user1', request: { source: {} },
      checkpoint: { ttsSegments: CHUNKS.ttsSegments, chunksMetadata: { chapters: [], durationMs: 1000, totalWords: 1, totalCharacters: 2 } },
    });
    jest.spyOn(podcastEngineService as any, 'upload').mockResolvedValue({ audioPath: 'a.mp3', transcriptPath: 't.json' });

    await podcastEngineService.runStitchJob('job1');

    expect(podcastRepository.updatePodcast).toHaveBeenCalledWith(
      'pod1',
      expect.objectContaining({ status: 'READY', audioPath: 'a.mp3' })
    );
  });
});
