import { Request, Response, NextFunction } from 'express';
import { ChatService } from '../services/chat.service';
import { FileParserService } from '../services/fileParser.service';
import { PRODUCT_ROLE_CLAIM, ProductRole, isProductRole } from '../types/roles';
import { usageService } from '../services/usage.service';
import { entitlementService, PLAN_LIMITS } from '../services/entitlement.service';

/** Same claim capability.ts's middleware reads — decoded from the verified Firebase token. */
function productRoleOf(req: Request): ProductRole | undefined {
  const raw = (req.user as unknown as Record<string, any> | undefined)?.[PRODUCT_ROLE_CLAIM];
  return isProductRole(raw) ? raw : undefined;
}

export class ChatController {
  private service = new ChatService();

  public handleChat = async (req: Request, res: Response, next: NextFunction) => {
    try {
      // Identity is taken from the verified Firebase token, never from the request body.
      const userId = req.user?.uid;
      if (!userId) return res.status(401).json({ error: 'Unauthorized' });

      const { sessionId, message, model, topicType } = req.body;

      // Basic validation
      if (!sessionId || !message || !model || !topicType) {
        return res.status(400).json({ error: "Missing required fields: sessionId, message, model, topicType" });
      }

      // ── Server-Side Quota Enforcement ──
      try {
        await usageService.consumeQuota(userId, 'chatMessages', 1);
      } catch (err: any) {
        if (err.code === 'QUOTA_EXHAUSTED') {
          return res.status(403).json({
            code: 'QUOTA_EXHAUSTED',
            feature: 'chat',
            error: err.message,
            used: err.used,
            limit: err.limit,
            remaining: err.remaining,
            resetsAt: err.resetsAt,
            plan: err.plan,
          });
        }
        throw err;
      }

      const response = await this.service.processChat(userId, sessionId, message, model, topicType, productRoleOf(req));

      res.json(response);
    } catch (error) {
      console.error("Chat Error:", error);
      next(error);
    }
  };

  public handleChatStream = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = req.user?.uid;
      if (!userId) return res.status(401).json({ error: 'Unauthorized' });

      const { sessionId, message, model, topicType, attachments, notebookId } = req.body;

      if (!sessionId || (!message && (!attachments || attachments.length === 0)) || !model || !topicType) {
        return res.status(400).json({ error: "Missing required fields: sessionId, message, model, topicType" });
      }

      // ── Server-Side Quota & Document Size Enforcement ──
      try {
        if (attachments && Array.isArray(attachments) && attachments.length > 0) {
          const { plan } = await entitlementService.getUserPlan(userId);
          const maxMb = PLAN_LIMITS[plan].maxDocumentSizeMB;
          for (const att of attachments) {
            if (att.data && typeof att.data === 'string') {
              const approxSizeMb = (att.data.length * 0.75) / (1024 * 1024);
              if (approxSizeMb > maxMb) {
                return res.status(400).json({
                  code: 'FILE_TOO_LARGE',
                  error: `File ${att.name || 'attachment'} exceeds your plan maximum allowed size of ${maxMb}MB.`,
                });
              }
            }
          }
          await usageService.consumeQuota(userId, 'documentsUploaded', attachments.length);
        }

        await usageService.consumeQuota(userId, 'chatMessages', 1);
      } catch (err: any) {
        if (err.code === 'QUOTA_EXHAUSTED') {
          return res.status(403).json({
            code: 'QUOTA_EXHAUSTED',
            feature: err.feature || 'chat',
            error: err.message,
            used: err.used,
            limit: err.limit,
            remaining: err.remaining,
            resetsAt: err.resetsAt,
            plan: err.plan,
          });
        }
        throw err;
      }

      let finalMessage = message || '';

      if (attachments && Array.isArray(attachments) && attachments.length > 0) {
        let attachmentsText = '';
        for (const att of attachments) {
          const parsedPages = await FileParserService.extractText(att.data, att.mimeType, att.name);
          const extractedText = parsedPages.map(p => p.text).join('\n');
          attachmentsText += `[File Attached: ${att.name}]\n${extractedText.trim()}\n\n`;
        }
        finalMessage = finalMessage ? `${attachmentsText.trim()}\n\n${finalMessage}` : attachmentsText.trim();
      }

      // Setup Server-Sent Events headers
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      res.flushHeaders();

      const traceId = req.headers['x-trace-id'] as string;

      await this.service.processChatStream(userId, sessionId, finalMessage, model, topicType, res, notebookId, traceId, productRoleOf(req));

    } catch (error) {
      console.error("Chat Stream Error:", error);
      // Can't reliably send JSON if headers were already sent for SSE
      if (!res.headersSent) {
        next(error);
      } else {
        res.write(`data: ${JSON.stringify({ error: "Internal server error during stream" })}\n\n`);
        res.end();
      }
    }
  };

  public getUserSessions = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = req.user?.uid;
      if (!userId) return res.status(401).json({ error: 'Unauthorized' });

      const sessions = await this.service.getUserSessions(userId);
      res.json(sessions);
    } catch (error) {
      console.error("Get Sessions Error:", error);
      next(error);
    }
  };

  public getSessionHistory = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = req.user?.uid;
      if (!userId) return res.status(401).json({ error: 'Unauthorized' });

      const { sessionId } = req.params;
      if (!sessionId) {
        return res.status(400).json({ error: "Missing required path parameter: sessionId" });
      }

      const history = await this.service.getSessionHistory(sessionId, userId);
      res.json(history);
    } catch (error: any) {
      if (error?.message === 'Forbidden') return res.status(403).json({ error: 'Forbidden' });
      console.error("Get Session History Error:", error);
      next(error);
    }
  };

  public deleteSession = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = req.user?.uid;
      if (!userId) return res.status(401).json({ error: 'Unauthorized' });

      const { sessionId } = req.params;
      if (!sessionId) {
        return res.status(400).json({ error: "Missing required parameter: sessionId" });
      }

      const success = await this.service.deleteSession(sessionId, userId);

      if (!success) {
        return res.status(404).json({ error: "Session not found or you do not have permission to delete it" });
      }

      res.json({ message: "Session deleted successfully" });
    } catch (error) {
      console.error("Delete Session Error:", error);
      next(error);
    }
  };
}
