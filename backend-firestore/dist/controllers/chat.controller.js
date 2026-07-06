"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ChatController = void 0;
const chat_service_1 = require("../services/chat.service");
const fileParser_service_1 = require("../services/fileParser.service");
class ChatController {
    service = new chat_service_1.ChatService();
    handleChat = async (req, res, next) => {
        try {
            // Identity is taken from the verified Firebase token, never from the request body.
            const userId = req.user?.uid;
            if (!userId)
                return res.status(401).json({ error: 'Unauthorized' });
            const { sessionId, message, model, topicType } = req.body;
            // Basic validation
            if (!sessionId || !message || !model || !topicType) {
                return res.status(400).json({ error: "Missing required fields: sessionId, message, model, topicType" });
            }
            const response = await this.service.processChat(userId, sessionId, message, model, topicType);
            res.json(response);
        }
        catch (error) {
            console.error("Chat Error:", error);
            next(error);
        }
    };
    handleChatStream = async (req, res, next) => {
        try {
            const userId = req.user?.uid;
            if (!userId)
                return res.status(401).json({ error: 'Unauthorized' });
            const { sessionId, message, model, topicType, attachments, notebookId } = req.body;
            if (!sessionId || (!message && (!attachments || attachments.length === 0)) || !model || !topicType) {
                return res.status(400).json({ error: "Missing required fields: sessionId, message, model, topicType" });
            }
            let finalMessage = message || '';
            if (attachments && Array.isArray(attachments) && attachments.length > 0) {
                let attachmentsText = '';
                for (const att of attachments) {
                    const parsedPages = await fileParser_service_1.FileParserService.extractText(att.data, att.mimeType, att.name);
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
            const traceId = req.headers['x-trace-id'];
            await this.service.processChatStream(userId, sessionId, finalMessage, model, topicType, res, notebookId, traceId);
        }
        catch (error) {
            console.error("Chat Stream Error:", error);
            // Can't reliably send JSON if headers were already sent for SSE
            if (!res.headersSent) {
                next(error);
            }
            else {
                res.write(`data: ${JSON.stringify({ error: "Internal server error during stream" })}\n\n`);
                res.end();
            }
        }
    };
    getUserSessions = async (req, res, next) => {
        try {
            const userId = req.user?.uid;
            if (!userId)
                return res.status(401).json({ error: 'Unauthorized' });
            const sessions = await this.service.getUserSessions(userId);
            res.json(sessions);
        }
        catch (error) {
            console.error("Get Sessions Error:", error);
            next(error);
        }
    };
    getSessionHistory = async (req, res, next) => {
        try {
            const userId = req.user?.uid;
            if (!userId)
                return res.status(401).json({ error: 'Unauthorized' });
            const { sessionId } = req.params;
            if (!sessionId) {
                return res.status(400).json({ error: "Missing required path parameter: sessionId" });
            }
            const history = await this.service.getSessionHistory(sessionId, userId);
            res.json(history);
        }
        catch (error) {
            if (error?.message === 'Forbidden')
                return res.status(403).json({ error: 'Forbidden' });
            console.error("Get Session History Error:", error);
            next(error);
        }
    };
    deleteSession = async (req, res, next) => {
        try {
            const userId = req.user?.uid;
            if (!userId)
                return res.status(401).json({ error: 'Unauthorized' });
            const { sessionId } = req.params;
            if (!sessionId) {
                return res.status(400).json({ error: "Missing required parameter: sessionId" });
            }
            const success = await this.service.deleteSession(sessionId, userId);
            if (!success) {
                return res.status(404).json({ error: "Session not found or you do not have permission to delete it" });
            }
            res.json({ message: "Session deleted successfully" });
        }
        catch (error) {
            console.error("Delete Session Error:", error);
            next(error);
        }
    };
}
exports.ChatController = ChatController;
