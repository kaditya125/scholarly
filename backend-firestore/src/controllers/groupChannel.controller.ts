import { Request, Response, NextFunction } from 'express';
import { groupChannelService, GroupChannelError } from '../services/groupChannel.service';

/**
 * GroupChannelController — text channels inside a study group. Scoped to the authenticated user
 * (req.user.uid); membership/admin rules live in the service and surface here as status codes.
 * Group id is the `:id` route param (nested under the study-groups router); channel is `:channelId`.
 */
export class GroupChannelController {
  private fail(res: Response, error: unknown, next: NextFunction) {
    if (error instanceof GroupChannelError) {
      return res.status(error.status).json({ error: error.message });
    }
    next(error);
  }

  public list = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const uid = req.user?.uid;
      if (!uid) return res.status(401).json({ error: 'Unauthorized' });
      res.json(await groupChannelService.listChannels(uid, req.params.id));
    } catch (error) {
      this.fail(res, error, next);
    }
  };

  public create = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const uid = req.user?.uid;
      if (!uid) return res.status(401).json({ error: 'Unauthorized' });
      const { name, description } = req.body || {};
      res.status(201).json(await groupChannelService.createChannel(uid, req.params.id, name, description));
    } catch (error) {
      this.fail(res, error, next);
    }
  };

  public rename = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const uid = req.user?.uid;
      if (!uid) return res.status(401).json({ error: 'Unauthorized' });
      const { name, description } = req.body || {};
      res.json(
        await groupChannelService.renameChannel(uid, req.params.id, req.params.channelId, {
          name,
          description,
        })
      );
    } catch (error) {
      this.fail(res, error, next);
    }
  };

  public remove = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const uid = req.user?.uid;
      if (!uid) return res.status(401).json({ error: 'Unauthorized' });
      await groupChannelService.deleteChannel(uid, req.params.id, req.params.channelId);
      res.json({ success: true });
    } catch (error) {
      this.fail(res, error, next);
    }
  };

  public messages = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const uid = req.user?.uid;
      if (!uid) return res.status(401).json({ error: 'Unauthorized' });
      const before = req.query.before ? Number(req.query.before) : undefined;
      const limit = req.query.limit ? Number(req.query.limit) : undefined;
      res.json(
        await groupChannelService.getMessages(uid, req.params.id, req.params.channelId, {
          before: Number.isFinite(before) ? before : undefined,
          limit: Number.isFinite(limit) ? limit : undefined,
        })
      );
    } catch (error) {
      this.fail(res, error, next);
    }
  };

  public send = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const uid = req.user?.uid;
      if (!uid) return res.status(401).json({ error: 'Unauthorized' });
      const text = (req.body?.text ?? '').toString();
      res
        .status(201)
        .json(
          await groupChannelService.sendMessage(
            uid,
            req.params.id,
            req.params.channelId,
            text,
            req.body?.attachments,
            req.body?.replyToId
          )
        );
    } catch (error) {
      this.fail(res, error, next);
    }
  };

  public markRead = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const uid = req.user?.uid;
      if (!uid) return res.status(401).json({ error: 'Unauthorized' });
      await groupChannelService.markRead(uid, req.params.id, req.params.channelId);
      res.json({ success: true });
    } catch (error) {
      this.fail(res, error, next);
    }
  };

  public react = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const uid = req.user?.uid;
      if (!uid) return res.status(401).json({ error: 'Unauthorized' });
      const emoji = (req.body?.emoji || '').toString();
      res.json(
        await groupChannelService.toggleReaction(
          uid,
          req.params.id,
          req.params.channelId,
          req.params.messageId,
          emoji
        )
      );
    } catch (error) {
      this.fail(res, error, next);
    }
  };

  public edit = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const uid = req.user?.uid;
      if (!uid) return res.status(401).json({ error: 'Unauthorized' });
      const text = (req.body?.text ?? '').toString();
      res.json(
        await groupChannelService.editMessage(
          uid,
          req.params.id,
          req.params.channelId,
          req.params.messageId,
          text
        )
      );
    } catch (error) {
      this.fail(res, error, next);
    }
  };

  public removeMessage = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const uid = req.user?.uid;
      if (!uid) return res.status(401).json({ error: 'Unauthorized' });
      await groupChannelService.deleteMessage(
        uid,
        req.params.id,
        req.params.channelId,
        req.params.messageId
      );
      res.json({ success: true });
    } catch (error) {
      this.fail(res, error, next);
    }
  };

  public pin = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const uid = req.user?.uid;
      if (!uid) return res.status(401).json({ error: 'Unauthorized' });
      const pinned = !!req.body?.pinned;
      res.json(
        await groupChannelService.pinMessage(
          uid,
          req.params.id,
          req.params.channelId,
          req.params.messageId,
          pinned
        )
      );
    } catch (error) {
      this.fail(res, error, next);
    }
  };

  public pins = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const uid = req.user?.uid;
      if (!uid) return res.status(401).json({ error: 'Unauthorized' });
      res.json(await groupChannelService.getPins(uid, req.params.id, req.params.channelId));
    } catch (error) {
      this.fail(res, error, next);
    }
  };
}

export const groupChannelController = new GroupChannelController();
