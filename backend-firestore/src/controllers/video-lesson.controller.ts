import { Request, Response } from 'express';
import { Readable } from 'stream';
import { videoLessonService } from '../services/ai/video-lesson.service';

/**
 * Student-facing AI Video Lesson endpoints (auth via requireAuth -> req.user.uid).
 *   POST /video-lessons            { topic }  -> creates (or returns cached) lesson
 *   GET  /video-lessons/:id                   -> job status + scene progress + final uri
 *   GET  /video-lessons/:id/video             -> streams the merged mp4
 */
export class VideoLessonController {
  create = async (req: Request, res: Response) => {
    try {
      const userId = req.user?.uid;
      if (!userId) return res.status(401).json({ error: 'Unauthorized' });
      const topic = String(req.body?.topic || '').trim();
      if (!topic) return res.status(400).json({ error: 'A concept/topic is required.' });
      const lesson = await videoLessonService.createLesson(topic, userId);
      res.status(201).json(lesson);
    } catch (e: any) {
      res.status(400).json({ error: e?.message || 'Failed to start video lesson.' });
    }
  };

  status = async (req: Request, res: Response) => {
    try {
      const lesson = await videoLessonService.getLesson(req.params.id);
      if (!lesson) return res.status(404).json({ error: 'Lesson not found.' });
      res.json(lesson);
    } catch (e: any) {
      res.status(500).json({ error: e?.message || 'Failed to fetch lesson.' });
    }
  };

  video = async (req: Request, res: Response) => {
    try {
      const lesson = await videoLessonService.getLesson(req.params.id);
      if (!lesson?.finalVideoUri) return res.status(404).json({ error: 'Video not ready.' });
      const r = await videoLessonService.openObject(lesson.finalVideoUri);
      if (!r.ok || !r.body) return res.status(502).json({ error: `Storage read failed (${r.status}).` });
      res.setHeader('Content-Type', 'video/mp4');
      res.setHeader('Cache-Control', 'private, max-age=600');
      Readable.fromWeb(r.body as any).pipe(res);
    } catch (e: any) {
      res.status(500).json({ error: e?.message || 'Stream failed.' });
    }
  };
}

export const videoLessonController = new VideoLessonController();
