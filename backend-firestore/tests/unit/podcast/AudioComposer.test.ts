import { audioComposer } from '../../../src/core/workflow/podcast/AudioComposer';
import { ttsService } from '../../../src/services/ai/tts.service';
import fs from 'fs';
import ffmpeg from 'fluent-ffmpeg';

jest.mock('../../../src/services/ai/tts.service');
jest.mock('fs');
jest.mock('fluent-ffmpeg');
jest.mock('firebase-admin/storage', () => ({
  getStorage: () => ({
    bucket: () => ({
      upload: jest.fn().mockResolvedValue([]),
      file: () => ({
        download: jest.fn().mockResolvedValue([]),
      }),
    }),
  }),
}));

describe('AudioComposer', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (fs.existsSync as jest.Mock).mockReturnValue(true);
    (fs.mkdirSync as jest.Mock).mockImplementation(() => {});
  });

  it('should synthesize audio, probe duration, and stitch segments', async () => {
    // Mock TTS Service
    (ttsService.synthesize as jest.Mock).mockResolvedValue(undefined);
    
    // Mock FFmpeg stitching chain
    const mockFfmpeg = {
      input: jest.fn().mockReturnThis(),
      on: jest.fn().mockImplementation(function (this: any, event: string, cb: Function) {
        if (event === 'end') setTimeout(cb, 10);
        return this;
      }),
      mergeToFile: jest.fn().mockReturnThis(),
      ffprobe: jest.fn().mockImplementation((file: string, cb: Function) => {
        cb(null, { format: { duration: 1.5 } });
      })
    };
    (ffmpeg as unknown as jest.Mock).mockReturnValue(mockFfmpeg);
    (ffmpeg.ffprobe as jest.Mock) = mockFfmpeg.ffprobe;

    const plan = {
      speakers: [{ name: 'Dr. Jane', role: 'Teacher', voiceStyle: 'warm_teacher' }],
      segments: [{ index: 0, title: 'Intro' }]
    } as any;

    const script = {
      lines: [{ speaker: 'Dr. Jane', text: 'Hello world', chapterIndex: 0 }],
      citations: [[]],
      totalWords: 2
    };

    const chunks = await audioComposer.composeChunks('user_1', 'pod_1', 'nb_1', plan, script, '/tmp/podcast_1');
    const composed = await audioComposer.stitchChunks(chunks, '/tmp/podcast_1');
    
    expect(ttsService.synthesize).toHaveBeenCalledWith(
      expect.objectContaining({ text: 'Hello world', speaker: 'Teacher' }),
      expect.stringContaining('seg_0.mp3')
    );
    expect(mockFfmpeg.input).toHaveBeenCalled();
    expect(mockFfmpeg.mergeToFile).toHaveBeenCalledWith(expect.stringContaining('final.mp3'), expect.any(String));
    
    expect(composed.transcript.length).toBe(1);
    expect(composed.chapters.length).toBe(1);
    expect(composed.totalWords).toBe(2);
    expect(composed.audioLocalPath).toContain('final.mp3');
  }, 10000);
});
