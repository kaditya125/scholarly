"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.ChatService = void 0;
const chat_repository_1 = require("../repositories/chat.repository");
const WorkflowEngine_1 = require("../core/workflow/WorkflowEngine");
const logger_1 = require("../utils/logger");
class ChatService {
    repository = new chat_repository_1.ChatRepository();
    // Removed getProvider because DI container handles it now.
    async processChat(userId, sessionId, message, model, topicType, productRole) {
        // 1. Get or create session
        await this.repository.getOrCreateSession(sessionId, userId, topicType, model);
        // 2. Load conversation history
        const history = await this.repository.getMessages(sessionId);
        // 3. Create new user message
        const userMessage = {
            role: 'user',
            content: message,
            timestamp: Date.now()
        };
        // Add to history so AI sees it
        history.push(userMessage);
        // 4. Run Workflow
        const req = {
            userId,
            sessionId,
            query: message,
            history: history,
            mode: topicType,
            model,
            productRole
        };
        // Because this is the non-streaming fallback, we manually consume the stream to get the full reply
        const stream = WorkflowEngine_1.workflowEngine.executeStream(req);
        let fullReply = '';
        for await (const event of stream) {
            if (event.type === 'chunk' && event.chunk) {
                fullReply += event.chunk;
            }
        }
        // 6. Create assistant message
        const assistantMessage = {
            role: 'ai',
            content: fullReply,
            timestamp: Date.now()
        };
        // 7. Store both user and assistant messages
        await this.repository.saveMessagesBatch(sessionId, [userMessage, assistantMessage]);
        // Asynchronously generate a proper subject title if this is early in the conversation
        if (history.length <= 4) {
            this.generateAndSaveTitle(sessionId, [...history, userMessage, assistantMessage]).catch(e => console.error(e));
        }
        // 8. Return data
        return {
            reply: fullReply,
            usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
            timestamps: { start: userMessage.timestamp, end: assistantMessage.timestamp },
            conversationHistory: [...history, assistantMessage]
        };
    }
    async processChatStream(userId, sessionId, message, model, topicType, res, notebookId, traceId, productRole) {
        logger_1.logger.info(`Starting stream workflow for user ${userId}`, { traceId, sessionId });
        // 1. Get or create session
        await this.repository.getOrCreateSession(sessionId, userId, topicType, model);
        // 2. Load conversation history
        const history = await this.repository.getMessages(sessionId);
        // 3. Create new user message and save it immediately
        const userMessage = {
            role: 'user',
            content: message,
            timestamp: Date.now()
        };
        // Save user message immediately so it's not lost if AI fails
        await this.repository.saveMessage(sessionId, userMessage);
        history.push(userMessage);
        // 4. Execute through Workflow Engine
        const req = {
            userId,
            sessionId,
            notebookId,
            query: message,
            history: history,
            mode: topicType,
            model,
            traceId,
            productRole
        };
        const stream = WorkflowEngine_1.workflowEngine.executeStream(req);
        let fullReply = '';
        try {
            for await (const event of stream) {
                if (event.type === 'progress') {
                    // Forward the `stage` too — the frontend's ReasoningTimeline
                    // matches each step to a backend stage id to decide whether that
                    // row lights up or is grayed out as "not needed for this reply".
                    // Dropping `stage` here (as we used to) meant every stage arrived
                    // as undefined, so every timeline row rendered as skipped even
                    // though the backend was actually emitting them.
                    res.write(`data: ${JSON.stringify({
                        type: 'progress',
                        stage: event.stage,
                        message: event.message
                    })}\n\n`);
                }
                else if (event.type === 'chunk') {
                    fullReply += event.chunk;
                    res.write(`data: ${JSON.stringify({ type: 'chunk', content: event.chunk })}\n\n`);
                }
                else if (event.type === 'error') {
                    throw new Error(event.message);
                }
                else if (event.type === 'reasoning') {
                    // Forwarded verbatim; the client types it out in the reasoning timeline.
                    // Deliberately NOT appended to fullReply — this is thinking, not the answer.
                    res.write(`data: ${JSON.stringify({ type: 'reasoning', content: event.text })}\n\n`);
                }
                else if (event.type === 'citation') {
                    res.write(`data: ${JSON.stringify({ type: 'citation', citation: event.citation })}\n\n`);
                }
                else if (event.type === 'warning') {
                    res.write(`data: ${JSON.stringify({ type: 'warning', message: event.warning })}\n\n`);
                }
                else if (event.type === 'done') {
                    res.write(`data: ${JSON.stringify({ type: 'done', data: event.data })}\n\n`);
                }
            }
            res.write('data: [DONE]\n\n');
            res.end();
        }
        catch (error) {
            console.error("Stream generation error:", error);
            let errorMessage = error.message || 'Error generating AI response';
            // Clean up Gemini's raw JSON string error if it's a 429 Rate Limit
            if (errorMessage.includes('"code": 429') || errorMessage.includes('429')) {
                const match = errorMessage.match(/Please retry in ([\d\.]+)s/);
                const waitTime = match ? Math.ceil(parseFloat(match[1])) : 30;
                errorMessage = `Google API Rate Limit Exceeded: Please wait ${waitTime} seconds before asking another question.`;
            }
            if (!res.headersSent) {
                res.status(500).json({ error: errorMessage });
            }
            else {
                res.write(`data: ${JSON.stringify({ error: errorMessage })}\n\n`);
                res.end();
            }
            // Save the error message as the AI's response so chat history makes sense
            const errorAssistantMessage = {
                role: 'ai',
                content: `*(Error: ${errorMessage})*`,
                timestamp: Date.now()
            };
            await this.repository.saveMessage(sessionId, errorAssistantMessage);
            return; // Stop execution
        }
        // 7. Save to database after stream finishes
        const assistantMessage = {
            role: 'ai',
            content: fullReply,
            timestamp: Date.now()
        };
        // Only save the assistant message since user message was saved earlier
        await this.repository.saveMessage(sessionId, assistantMessage);
        // Asynchronously generate a proper subject title if this is early in the conversation
        if (history.length <= 4) {
            this.generateAndSaveTitle(sessionId, [...history, userMessage, assistantMessage]).catch(e => console.error(e));
        }
    }
    async generateAndSaveTitle(sessionId, messages) {
        try {
            const { GeminiProvider } = await Promise.resolve().then(() => __importStar(require('./ai/gemini.provider')));
            const llm = new GeminiProvider();
            const prompt = `Based on the following conversation, generate a short 2-5 word title that summarizes the main topic of discussion. Do not include quotes, punctuation, or any prefixes like "Title:". Just the raw title text.\n\n` +
                messages.map(m => `${m.role}: ${m.content}`).join('\n');
            const response = await llm.generateResponse([{ role: 'user', content: prompt, timestamp: Date.now() }]);
            const title = response.reply.trim().replace(/^["']|["']$/g, '');
            if (title && title.length < 50) {
                await this.repository.updateSessionTitle(sessionId, title);
            }
        }
        catch (e) {
            console.error('Failed to generate dynamic title', e);
        }
    }
    async getUserSessions(userId) {
        return this.repository.getSessionsByUser(userId);
    }
    async getSessionHistory(sessionId, requesterId) {
        // Ownership check: when a requester is provided, ensure they own the session.
        if (requesterId) {
            const session = await this.repository.getSession(sessionId);
            if (session && session.userId && session.userId !== requesterId) {
                throw new Error('Forbidden');
            }
        }
        return this.repository.getMessages(sessionId);
    }
    async deleteSession(sessionId, userId) {
        return this.repository.deleteSession(sessionId, userId);
    }
    async getDeletedSessions(userId) { return []; }
    async restoreSession(sessionId, userId) { }
    async permanentlyDeleteSession(sessionId, userId) { }
}
exports.ChatService = ChatService;
