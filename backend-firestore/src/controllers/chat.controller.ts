import { Request, Response, NextFunction } from 'express';
import { ChatService } from '../services/chat.service';
import { FileParserService } from '../services/fileParser.service';

export class ChatController {
  private service = new ChatService();

  public handleChat = async (req: Request, res: Response, next: NextFunction) => {
    try {
      // In a real app, userId should be extracted from the auth middleware (`req.user.uid`)
      // For now, we extract from body or query as requested by schema
      const { userId, sessionId, message, model, topicType } = req.body;

      // Basic validation (Will be replaced by Zod in Phase 5)
      if (!userId || !sessionId || !message || !model || !topicType) {
        return res.status(400).json({ error: "Missing required fields: userId, sessionId, message, model, topicType" });
      }

      const response = await this.service.processChat(userId, sessionId, message, model, topicType);
      
      res.json(response);
    } catch (error) {
      console.error("Chat Error:", error);
      next(error);
    }
  };

  public handleChatStream = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { userId, sessionId, message, model, topicType, attachments } = req.body;

      if (!userId || !sessionId || (!message && (!attachments || attachments.length === 0)) || !model || !topicType) {
        return res.status(400).json({ error: "Missing required fields: userId, sessionId, message, model, topicType" });
      }

      let finalMessage = message || '';

      if (attachments && Array.isArray(attachments) && attachments.length > 0) {
        let attachmentsText = '';
        for (const att of attachments) {
          const extractedText = await FileParserService.extractText(att.data, att.mimeType, att.name);
          attachmentsText += `[File Attached: ${att.name}]\n${extractedText.trim()}\n\n`;
        }
        finalMessage = finalMessage ? `${attachmentsText.trim()}\n\n${finalMessage}` : attachmentsText.trim();
      }

      // Setup Server-Sent Events headers
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      res.flushHeaders();

      await this.service.processChatStream(userId, sessionId, finalMessage, model, topicType, res);
      
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
      const { userId } = req.query;
      if (!userId || typeof userId !== 'string') {
        return res.status(400).json({ error: "Missing required query parameter: userId" });
      }
      
      const sessions = await this.service.getUserSessions(userId);
      res.json(sessions);
    } catch (error) {
      console.error("Get Sessions Error:", error);
      next(error);
    }
  };

  public getSessionHistory = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { sessionId } = req.params;
      if (!sessionId) {
        return res.status(400).json({ error: "Missing required path parameter: sessionId" });
      }
      
      const history = await this.service.getSessionHistory(sessionId);
      res.json(history);
    } catch (error) {
      console.error("Get Session History Error:", error);
      next(error);
    }
  };

  public deleteSession = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { sessionId } = req.params;
      const { userId } = req.query;

      if (!sessionId || !userId || typeof userId !== 'string') {
        return res.status(400).json({ error: "Missing required parameters: sessionId and userId" });
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
