import { podcastRepository } from '../../../src/repositories/podcast.repository';
import { db } from '../../../src/config/firebase';

jest.mock('../../../src/config/firebase', () => {
  const mDoc = {
    set: jest.fn(),
    get: jest.fn(),
    delete: jest.fn(),
  };
  const mCollection = {
    doc: jest.fn(() => mDoc),
    where: jest.fn().mockReturnThis(),
    get: jest.fn(),
  };
  return {
    db: {
      collection: jest.fn(() => mCollection),
    },
  };
});

describe('PodcastRepository', () => {
  let mDoc: any;

  beforeEach(() => {
    jest.clearAllMocks();
    mDoc = db.collection('podcasts').doc('pod_1');
    jest.clearAllMocks();
  });

  it('should create and get a podcast', async () => {
    const podcast = { id: 'pod_1', userId: 'user_1', title: 'Test', status: 'PENDING' } as any;
    
    mDoc.get.mockResolvedValue({
      exists: true,
      id: 'pod_1',
      data: () => podcast
    });

    await podcastRepository.createPodcast(podcast);
    expect(mDoc.set).toHaveBeenCalledWith(podcast);

    const fetched = await podcastRepository.getPodcast('pod_1');
    expect(fetched?.id).toBe('pod_1');
  });

  it('should request job cancellation', async () => {
    await podcastRepository.requestCancel('job_1');
    expect(mDoc.set).toHaveBeenCalledWith(
      expect.objectContaining({ cancelRequested: true }),
      { merge: true }
    );
  });
});
