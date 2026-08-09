import { Request, Response, NextFunction } from 'express';
import { imageGenerationService } from '../services/ai/image-generation.service';

export class ImageController {
  /** POST /media/image { prompt, aspectRatio? } -> { dataUrl, caption?, model } */
  public generate = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const prompt = String(req.body?.prompt || '').trim();
      if (!prompt) return res.status(400).json({ error: 'A prompt is required.' });
      const aspectRatio = req.body?.aspectRatio ? String(req.body.aspectRatio) : undefined;
      const result = await imageGenerationService.generate(prompt, aspectRatio);
      res.json(result);
    } catch (error: any) {
      const msg = String(error?.message || error);
      // Surface the free-tier / billing limitation as an actionable 402.
      if (/\b429\b|quota|billing|paid plan|RESOURCE_EXHAUSTED/i.test(msg)) {
        return res.status(402).json({
          error: 'Image generation needs a paid Gemini API key. Enable billing / image-model quota on the API key (image models are not on the free tier).',
        });
      }
      if (/not configured|GEMINI_API_KEY/i.test(msg)) {
        return res.status(503).json({ error: 'Image generation is not configured on the server.' });
      }
      next(error);
    }
  };
}
