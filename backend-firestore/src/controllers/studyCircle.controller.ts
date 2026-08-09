import { Request, Response } from 'express';
import { studyCircleService, StudyCircleError } from '../services/studyCircle.service';

/** Maps a thrown error to an HTTP response. */
function fail(res: Response, error: unknown) {
  if (error instanceof StudyCircleError) {
    return res.status(error.status).json({ error: error.message });
  }
  console.error('[StudyCircle] Unexpected error:', error);
  return res.status(500).json({ error: 'Something went wrong in the Study Circle' });
}

/**
 * REST + SSE surface for the AI Study Circle. All handlers derive identity from the verified
 * Firebase token (req.user.uid); the group id comes from the parent `:id` route param.
 */
export class StudyCircleController {
  /** GET /study-groups/:id/circle/knowledge */
  public listKnowledge = async (req: Request, res: Response) => {
    try {
      const uid = req.user?.uid;
      if (!uid) return res.status(401).json({ error: 'Unauthorized' });
      const items = await studyCircleService.listKnowledge(uid, req.params.id);
      res.json({ items });
    } catch (error) {
      fail(res, error);
    }
  };

  /** POST /study-groups/:id/circle/knowledge */
  public addKnowledge = async (req: Request, res: Response) => {
    try {
      const uid = req.user?.uid;
      if (!uid) return res.status(401).json({ error: 'Unauthorized' });
      const { text, title, source } = req.body || {};
      const item = await studyCircleService.addKnowledge(uid, req.params.id, { text, title, source });
      res.status(201).json({ item });
    } catch (error) {
      fail(res, error);
    }
  };

  /** DELETE /study-groups/:id/circle/knowledge/:itemId */
  public deleteKnowledge = async (req: Request, res: Response) => {
    try {
      const uid = req.user?.uid;
      if (!uid) return res.status(401).json({ error: 'Unauthorized' });
      await studyCircleService.deleteKnowledge(uid, req.params.id, req.params.itemId);
      res.json({ ok: true });
    } catch (error) {
      fail(res, error);
    }
  };

  /** GET /study-groups/:id/circle/chat — the shared conversation log. */
  public chatLog = async (req: Request, res: Response) => {
    try {
      const uid = req.user?.uid;
      if (!uid) return res.status(401).json({ error: 'Unauthorized' });
      const turns = await studyCircleService.getChatLog(uid, req.params.id);
      res.json({ turns });
    } catch (error) {
      fail(res, error);
    }
  };

  /** GET /study-groups/:id/circle/graph — the persisted concept graph. */
  public graph = async (req: Request, res: Response) => {
    try {
      const uid = req.user?.uid;
      if (!uid) return res.status(401).json({ error: 'Unauthorized' });
      const concepts = await studyCircleService.getGraph(uid, req.params.id);
      res.json({ concepts });
    } catch (error) {
      fail(res, error);
    }
  };

  /** POST /study-groups/:id/circle/graph/synthesize — synthesize/refresh the graph from circle material. */
  public synthesize = async (req: Request, res: Response) => {
    try {
      const uid = req.user?.uid;
      if (!uid) return res.status(401).json({ error: 'Unauthorized' });
      const concepts = await studyCircleService.synthesizeGraph(uid, req.params.id);
      res.json({ concepts });
    } catch (error) {
      fail(res, error);
    }
  };

  /**
   * POST /study-groups/:id/circle/ask — streams a grounded answer via Server-Sent Events.
   * We prime the generator before writing SSE headers so membership/validation errors surface as
   * real HTTP status codes rather than being swallowed inside the stream.
   */
  public ask = async (req: Request, res: Response) => {
    const uid = req.user?.uid;
    if (!uid) return res.status(401).json({ error: 'Unauthorized' });
    const { question } = req.body || {};

    let stream: AsyncGenerator<string, void, unknown> | undefined;
    try {
      stream = studyCircleService.askStream(uid, req.params.id, question);
      const first = await stream.next();

      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      res.flushHeaders();

      if (!first.done && first.value) {
        res.write(`data: ${JSON.stringify({ type: 'chunk', content: first.value })}\n\n`);
      }
      if (!first.done) {
        for await (const chunk of stream) {
          res.write(`data: ${JSON.stringify({ type: 'chunk', content: chunk })}\n\n`);
        }
      }

      res.write(`data: ${JSON.stringify({ type: 'done' })}\n\n`);
      res.write('data: [DONE]\n\n');
      res.end();
    } catch (error) {
      if (!res.headersSent) {
        return fail(res, error);
      }
      const message = error instanceof StudyCircleError ? error.message : 'Error generating response';
      res.write(`data: ${JSON.stringify({ type: 'error', error: message })}\n\n`);
      res.end();
    }
  };
}

export const studyCircleController = new StudyCircleController();
