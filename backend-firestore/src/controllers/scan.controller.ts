import { Request, Response, NextFunction } from 'express';
import { scanService, ScanInput } from '../services/scan.service';

/**
 * ScanController — SSE entrypoint for the AI Question Scanner.
 * POST /scan/solve  { notebookId, sourceId, action, imageBase64, mimeType?, page?, chapterTitle?, bookTitle?, subject? }
 * Streams: progress | extracted | citation | chunk | done (then [DONE]) | error.
 */
export class ScanController {
  public solve = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = req.user?.uid;
      if (!userId) return res.status(401).json({ error: 'Unauthorized' });

      const { notebookId, sourceId, action, imageBase64, mimeType, page, chapterTitle, bookTitle, subject } = req.body || {};
      if (!notebookId || !sourceId || !imageBase64) {
        return res.status(400).json({ error: 'Missing required fields: notebookId, sourceId, imageBase64' });
      }

      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      res.flushHeaders();

      const input: ScanInput = { notebookId, sourceId, action, imageBase64, mimeType, page, chapterTitle, bookTitle, subject };
      await scanService.streamScan(userId, input, res);
    } catch (error) {
      console.error('Scan Stream Error:', error);
      if (!res.headersSent) next(error);
      else {
        res.write(`data: ${JSON.stringify({ type: 'error', error: 'Internal server error during scan' })}\n\n`);
        res.end();
      }
    }
  };
}

export const scanController = new ScanController();
