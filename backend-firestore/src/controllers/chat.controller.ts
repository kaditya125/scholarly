import { Request, Response, NextFunction } from 'express';
import { ChatService } from '../services/chat.service';
import { FileParserService } from '../services/fileParser.service';
import { PRODUCT_ROLE_CLAIM, ProductRole, isProductRole } from '../types/roles';
import { usageService } from '../services/usage.service';
import { entitlementService, PLAN_LIMITS } from '../services/entitlement.service';
import { SessionAccessError } from '../repositories/chat.repository';

/** Same claim capability.ts's middleware reads — decoded from the verified Firebase token. */
function productRoleOf(req: Request): ProductRole | undefined {
  const raw = (req.user as unknown as Record<string, any> | undefined)?.[PRODUCT_ROLE_CLAIM];
  return isProductRole(raw) ? raw : undefined;
}

/** Only these values are honoured; anything else from the body means ordinary chat. */
function executionModeOf(raw: unknown): 'chat' | 'agent' | 'auto' {
  return raw === 'agent' || raw === 'auto' ? raw : 'chat';
}

function sessionForbidden(res: Response, err: SessionAccessError) {
  return res.status(403).json({ code: err.code, error: err.message });
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

      // Session ownership before any quota is charged.
      try {
        await this.service.assertSessionAccess(sessionId, userId);
      } catch (err: any) {
        if (err instanceof SessionAccessError) return sessionForbidden(res, err);
        throw err;
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
      if (error instanceof SessionAccessError) return sessionForbidden(res, error);
      console.error("Chat Error:", error);
      next(error);
    }
  };

  public handleChatStream = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = req.user?.uid;
      if (!userId) return res.status(401).json({ error: 'Unauthorized' });

      const { sessionId, message, model, topicType, attachments, notebookId, agenticRetrieval, executionMode } = req.body;
      // Never trust the raw body type — coerce like isWeakAreaDrill in quiz.controller.ts.
      const agenticRetrievalFlag = agenticRetrieval === true || agenticRetrieval === 'true';

      if (!sessionId || (!message && (!attachments || attachments.length === 0)) || !model || !topicType) {
        return res.status(400).json({ error: "Missing required fields: sessionId, message, model, topicType" });
      }

      // Session ownership before any quota is charged or any SSE header is sent.
      try {
        await this.service.assertSessionAccess(sessionId, userId);
      } catch (err: any) {
        if (err instanceof SessionAccessError) return sessionForbidden(res, err);
        throw err;
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
      // Agent mode needs the attachments as documents (pages it can quote), not as text flattened
      // into a 2,000-character goal; ordinary chat keeps the flattened message as before.
      const documents: Array<{ name: string; mimeType: string; pages: Array<{ pageNumber?: number; text: string }> }> = [];

      if (attachments && Array.isArray(attachments) && attachments.length > 0) {
        let attachmentsText = '';
        for (const att of attachments) {
          const parsedPages = await FileParserService.extractText(att.data, att.mimeType, att.name);
          const extractedText = parsedPages.map(p => p.text).join('\n');
          attachmentsText += `[File Attached: ${att.name}]\n${extractedText.trim()}\n\n`;
          documents.push({ name: String(att.name || 'document'), mimeType: String(att.mimeType || ''), pages: parsedPages });
        }
        finalMessage = finalMessage ? `${attachmentsText.trim()}\n\n${finalMessage}` : attachmentsText.trim();
      }
      const mode = executionModeOf(executionMode);

      // Setup Server-Sent Events headers
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      res.flushHeaders();

      const traceId = req.headers['x-trace-id'] as string;

      // Stop generating when the client goes away. `res` 'close' fires on disconnect AND on a
      // normal finish; only an unfinished response means the student left.
      const disconnect = new AbortController();
      if (typeof (res as any).on === 'function') {
        res.on('close', () => {
          if (!res.writableFinished) disconnect.abort();
        });
      }

      await this.service.processChatStream(userId, sessionId, finalMessage, model, topicType, res, notebookId, traceId, productRoleOf(req), agenticRetrievalFlag, {
        signal: disconnect.signal,
        executionMode: mode,
        ...(documents.length && mode !== 'chat' ? { agentInput: { goal: String(message || '').trim(), documents } } : {}),
      });

    } catch (error) {
      if (error instanceof SessionAccessError && !res.headersSent) return sessionForbidden(res, error);
      console.error("Chat Stream Error:", error);
      // Can't reliably send JSON if headers were already sent for SSE
      if (!res.headersSent) {
        next(error);
      } else if (!res.writableEnded) {
        res.write(`data: ${JSON.stringify({ type: 'error', error: "Internal server error during stream", message: "Internal server error during stream" })}\n\n`);
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
