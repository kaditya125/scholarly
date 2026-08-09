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
jest.mock('../../../src/core/workflow/podcast/AudioComposer', () => ({
  audioComposer: { compose: jest.fn().mockResolvedValue({ durationMs: 1000, chapters: [] }) }
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

  it('should run job successfully and execute all pipeline stages', async () => {
    (podcastRepository.getJob as jest.Mock).mockResolvedValue({
      id: 'job1', podcastId: 'pod1', userId: 'user1', request: { source: {} }
    });

    await podcastEngineService.runJob('job1');

    // Should progress through all stages
    expect(podcastRepository.updateJob).toHaveBeenCalledWith(
      'job1',
      expect.objectContaining({ stage: 'PLANNING' })
    );
    expect(podcastRepository.updateJob).toHaveBeenCalledWith(
      'job1',
      expect.objectContaining({ stage: 'SCRIPTING' })
    );
    expect(podcastRepository.updateJob).toHaveBeenCalledWith(
      'job1',
      expect.objectContaining({ stage: 'SYNTHESIZING' })
    );
    expect(podcastRepository.updatePodcast).toHaveBeenCalledWith(
      'pod1',
      expect.objectContaining({ status: 'READY' })
    );
  });
});
