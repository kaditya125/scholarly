import { Request, Response, NextFunction } from 'express';
import { dmService, DmError } from '../services/dm.service';

/**
 * DmController — private 1:1 messaging. Every action is scoped to the authenticated user
 * (req.user.uid); the peer is taken from the route param. Messaging policy (connected + not blocked)
 * is enforced in the service and surfaced here as DmError status codes.
 */
export class DmController {
  private fail(res: Response, error: unknown, next: NextFunction) {
    if (error instanceof DmError) {
      return res.status(error.status).json({ error: error.message });
    }
    next(error);
  }

  /** GET /dm/conversations — the caller's conversation list. */
  public conversations = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const uid = req.user?.uid;
      if (!uid) return res.status(401).json({ error: 'Unauthorized' });
      res.json(await dmService.listConversations(uid));
    } catch (error) {
      this.fail(res, error, next);
    }
  };

  /** GET /dm/unread — total unread count across conversations. */
  public unread = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const uid = req.user?.uid;
      if (!uid) return res.status(401).json({ error: 'Unauthorized' });
      res.json({ count: await dmService.getTotalUnread(uid) });
    } catch (error) {
      this.fail(res, error, next);
    }
  };

  /** GET /dm/conversations/:otherId — thread with a peer (supports ?before=&limit= paging). */
  public thread = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const uid = req.user?.uid;
      if (!uid) return res.status(401).json({ error: 'Unauthorized' });
      const before = req.query.before ? Number(req.query.before) : undefined;
      const limit = req.query.limit ? Number(req.query.limit) : undefined;
      res.json(
        await dmService.getThread(uid, req.params.otherId, {
          before: Number.isFinite(before) ? before : undefined,
          limit: Number.isFinite(limit) ? limit : undefined,
        })
      );
    } catch (error) {
      this.fail(res, error, next);
    }
  };

  /** POST /dm/conversations/:otherId/messages — send a message (body: { text }). */
  public send = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const uid = req.user?.uid;
      if (!uid) return res.status(401).json({ error: 'Unauthorized' });
      const text = (req.body?.text ?? '').toString();
      const message = await dmService.sendMessage(
        uid,
        req.params.otherId,
        text,
        req.body?.attachments,
        req.body?.replyToId
      );
      res.status(201).json(message);
    } catch (error) {
      this.fail(res, error, next);
    }
  };

  /** POST /dm/conversations/:otherId/read — mark the conversation read for the caller. */
  public markRead = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const uid = req.user?.uid;
      if (!uid) return res.status(401).json({ error: 'Unauthorized' });
      await dmService.markRead(uid, req.params.otherId);
      res.json({ success: true });
    } catch (error) {
      this.fail(res, error, next);
    }
  };

  /** POST /dm/conversations/:otherId/messages/:messageId/react — toggle an emoji reaction. */
  public react = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const uid = req.user?.uid;
      if (!uid) return res.status(401).json({ error: 'Unauthorized' });
      const emoji = (req.body?.emoji || '').toString();
      res.json(
        await dmService.toggleReaction(uid, req.params.otherId, req.params.messageId, emoji)
      );
    } catch (error) {
      this.fail(res, error, next);
    }
  };

  /** PATCH /dm/conversations/:otherId/messages/:messageId — edit own message text. */
  public edit = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const uid = req.user?.uid;
      if (!uid) return res.status(401).json({ error: 'Unauthorized' });
      const text = (req.body?.text ?? '').toString();
      res.json(await dmService.editMessage(uid, req.params.otherId, req.params.messageId, text));
    } catch (error) {
      this.fail(res, error, next);
    }
  };

  /** DELETE /dm/conversations/:otherId/messages/:messageId — soft-delete own message. */
  public remove = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const uid = req.user?.uid;
      if (!uid) return res.status(401).json({ error: 'Unauthorized' });
      await dmService.deleteMessage(uid, req.params.otherId, req.params.messageId);
      res.json({ success: true });
    } catch (error) {
      this.fail(res, error, next);
    }
  };

  /** POST /dm/conversations/:otherId/messages/:messageId/pin — pin/unpin (body { pinned }). */
  public pin = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const uid = req.user?.uid;
      if (!uid) return res.status(401).json({ error: 'Unauthorized' });
      const pinned = !!req.body?.pinned;
      res.json(await dmService.pinMessage(uid, req.params.otherId, req.params.messageId, pinned));
    } catch (error) {
      this.fail(res, error, next);
    }
  };

  /** GET /dm/conversations/:otherId/pins — the conversation's pinned messages. */
  public pins = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const uid = req.user?.uid;
      if (!uid) return res.status(401).json({ error: 'Unauthorized' });
      res.json(await dmService.getPins(uid, req.params.otherId));
    } catch (error) {
      this.fail(res, error, next);
    }
  };
}

export const dmController = new DmController();
