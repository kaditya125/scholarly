import { Request, Response, NextFunction } from 'express';
import { connectionService, ConnectionError } from '../services/connection.service';

/**
 * ConnectionController — the social graph API. Every action is scoped to the authenticated user
 * (req.user.uid); a client-supplied uid is never trusted. Expected, user-facing failures are raised
 * as ConnectionError (with an HTTP status) by the service and translated here.
 */
export class ConnectionController {
  private fail(res: Response, error: unknown, next: NextFunction) {
    if (error instanceof ConnectionError) {
      return res.status(error.status).json({ error: error.message });
    }
    next(error);
  }

  /** Refresh the caller's directory entry from their auth record + onboarding profile. */
  public sync = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const uid = req.user?.uid;
      if (!uid) return res.status(401).json({ error: 'Unauthorized' });
      const entry = await connectionService.syncDirectory(uid);
      res.json(entry);
    } catch (error) {
      this.fail(res, error, next);
    }
  };

  /** The caller's accepted connections. */
  public list = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const uid = req.user?.uid;
      if (!uid) return res.status(401).json({ error: 'Unauthorized' });
      res.json(await connectionService.getConnections(uid));
    } catch (error) {
      this.fail(res, error, next);
    }
  };

  /** Pending requests, split into incoming (received) and outgoing (sent). */
  public requests = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const uid = req.user?.uid;
      if (!uid) return res.status(401).json({ error: 'Unauthorized' });
      res.json(await connectionService.getRequests(uid));
    } catch (error) {
      this.fail(res, error, next);
    }
  };

  /** Ranked study-partner suggestions. */
  public suggestions = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const uid = req.user?.uid;
      if (!uid) return res.status(401).json({ error: 'Unauthorized' });
      const limit = Math.min(Math.max(Number(req.query.limit) || 12, 1), 50);
      res.json(await connectionService.getSuggestions(uid, limit));
    } catch (error) {
      this.fail(res, error, next);
    }
  };

  /** Name / email search over the directory. */
  public search = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const uid = req.user?.uid;
      if (!uid) return res.status(401).json({ error: 'Unauthorized' });
      const q = (req.query.q as string) || '';
      res.json(await connectionService.search(uid, q));
    } catch (error) {
      this.fail(res, error, next);
    }
  };

  /** Send a connection request (body: { targetId }). */
  public sendRequest = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const uid = req.user?.uid;
      if (!uid) return res.status(401).json({ error: 'Unauthorized' });
      const targetId = (req.body?.targetId || '').toString();
      const connection = await connectionService.sendRequest(uid, targetId);
      res.status(201).json(connection);
    } catch (error) {
      this.fail(res, error, next);
    }
  };

  /** Accept an incoming request from :otherId. */
  public accept = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const uid = req.user?.uid;
      if (!uid) return res.status(401).json({ error: 'Unauthorized' });
      res.json(await connectionService.respond(uid, req.params.otherId, true));
    } catch (error) {
      this.fail(res, error, next);
    }
  };

  /** Decline an incoming request from :otherId. */
  public decline = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const uid = req.user?.uid;
      if (!uid) return res.status(401).json({ error: 'Unauthorized' });
      res.json(await connectionService.respond(uid, req.params.otherId, false));
    } catch (error) {
      this.fail(res, error, next);
    }
  };

  /** Cancel an outgoing request to :otherId. */
  public cancelRequest = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const uid = req.user?.uid;
      if (!uid) return res.status(401).json({ error: 'Unauthorized' });
      await connectionService.cancelRequest(uid, req.params.otherId);
      res.json({ success: true });
    } catch (error) {
      this.fail(res, error, next);
    }
  };

  /** Remove an existing connection with :otherId. */
  public remove = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const uid = req.user?.uid;
      if (!uid) return res.status(401).json({ error: 'Unauthorized' });
      await connectionService.removeConnection(uid, req.params.otherId);
      res.json({ success: true });
    } catch (error) {
      this.fail(res, error, next);
    }
  };

  /** Follow a user (body: { targetId }). */
  public follow = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const uid = req.user?.uid;
      if (!uid) return res.status(401).json({ error: 'Unauthorized' });
      const targetId = (req.body?.targetId || '').toString();
      await connectionService.follow(uid, targetId);
      res.status(201).json({ success: true });
    } catch (error) {
      this.fail(res, error, next);
    }
  };

  /** Unfollow :otherId. */
  public unfollow = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const uid = req.user?.uid;
      if (!uid) return res.status(401).json({ error: 'Unauthorized' });
      await connectionService.unfollow(uid, req.params.otherId);
      res.json({ success: true });
    } catch (error) {
      this.fail(res, error, next);
    }
  };

  /** Block a user (body: { targetId }). Also tears down connection + follows both ways. */
  public block = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const uid = req.user?.uid;
      if (!uid) return res.status(401).json({ error: 'Unauthorized' });
      const targetId = (req.body?.targetId || '').toString();
      await connectionService.block(uid, targetId);
      res.status(201).json({ success: true });
    } catch (error) {
      this.fail(res, error, next);
    }
  };

  /** Unblock :otherId. */
  public unblock = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const uid = req.user?.uid;
      if (!uid) return res.status(401).json({ error: 'Unauthorized' });
      await connectionService.unblock(uid, req.params.otherId);
      res.json({ success: true });
    } catch (error) {
      this.fail(res, error, next);
    }
  };
}

export const connectionController = new ConnectionController();
