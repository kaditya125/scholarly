import { Request, Response } from 'express';
import { Readable } from 'stream';
import { GoogleAuth } from 'google-auth-library';
import { env } from '../../config/env';
import { veoVideoService } from '../../services/ai/veo-video.service';

/**
 * Admin Video Generation endpoints (Veo 3 on Vertex).
 *   POST /admin/video/generate  -> submit a job, returns { operationName }
 *   GET  /admin/video/status    -> poll { done, videoUris }
 *   GET  /admin/video/stream    -> proxy the finished mp4 from GCS to the browser
 *
 * Async by design so no single request exceeds the client's 30s timeout.
 * The stream proxy reads the GCS object with the sadhya-grok SA (which has
 * objectAdmin on the Veo bucket) — the app's default Firebase creds can't.
 */
const auth = new GoogleAuth({
  scopes: ['https://www.googleapis.com/auth/cloud-platform'],
  ...(env.GROK_SA_KEY_FILE ? { keyFile: env.GROK_SA_KEY_FILE } : {}),
});

export class VideoGenerationController {
  generate = async (req: Request, res: Response) => {
    try {
      if (env.VEO_ENABLED !== 'true') return res.status(400).json({ error: 'Video generation is disabled.' });
      const prompt = String(req.body?.prompt || '').trim();
      if (!prompt) return res.status(400).json({ error: 'A prompt is required.' });
      const aspectRatio = req.body?.aspectRatio ? String(req.body.aspectRatio) : undefined;
      const operationName = await veoVideoService.submit(prompt, { sampleCount: 1, ...(aspectRatio ? { aspectRatio } : {}) });
      res.json({ operationName });
    } catch (e: any) {
      res.status(500).json({ error: e?.message || 'Generation failed to start.' });
    }
  };

  status = async (req: Request, res: Response) => {
    try {
      const operationName = String(req.query.operation || '');
      if (!operationName) return res.status(400).json({ error: 'operation is required.' });
      const r = await veoVideoService.fetchOperation(operationName);
      res.json({ done: r.done, videoUris: r.videoUris });
    } catch (e: any) {
      res.status(500).json({ error: e?.message || 'Status check failed.' });
    }
  };

  stream = async (req: Request, res: Response) => {
    try {
      const uri = String(req.query.uri || '');
      if (!uri.startsWith('gs://')) return res.status(400).json({ error: 'A valid gs:// uri is required.' });
      // SSRF guard: only allow objects inside the configured Veo output bucket.
      const allowed = (env.VEO_OUTPUT_BUCKET || '').replace(/\/+$/, '');
      if (allowed && !uri.startsWith(allowed)) return res.status(403).json({ error: 'uri not allowed.' });

      const without = uri.slice('gs://'.length);
      const slash = without.indexOf('/');
      if (slash < 0) return res.status(400).json({ error: 'malformed uri.' });
      const bucket = without.slice(0, slash);
      const object = without.slice(slash + 1);

      const token = (await (await auth.getClient()).getAccessToken()).token;
      const gcs = `https://storage.googleapis.com/storage/v1/b/${bucket}/o/${encodeURIComponent(object)}?alt=media`;
      const r = await fetch(gcs, { headers: { Authorization: `Bearer ${token}` } });
      if (!r.ok || !r.body) {
        return res.status(502).json({ error: `Failed to read video from storage (${r.status}).` });
      }
      res.setHeader('Content-Type', 'video/mp4');
      res.setHeader('Cache-Control', 'private, max-age=300');
      Readable.fromWeb(r.body as any).pipe(res);
    } catch (e: any) {
      res.status(500).json({ error: e?.message || 'Stream failed.' });
    }
  };
}

export const videoGenerationController = new VideoGenerationController();
