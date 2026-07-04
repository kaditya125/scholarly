"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ChatService = void 0;
const chat_repository_1 = require("../repositories/chat.repository");
const WorkflowEngine_1 = require("../core/workflow/WorkflowEngine");
const prompts_1 = require("../config/prompts");
class ChatService {
    repository = new chat_repository_1.ChatRepository();
    // Removed getProvider because DI container handles it now.
    async processChat(userId, sessionId, message, model, topicType) {
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
            mode: topicType
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
        // 8. Return data
        return {
            reply: fullReply,
            usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
            timestamps: { start: userMessage.timestamp, end: assistantMessage.timestamp },
            conversationHistory: [...history, assistantMessage]
        };
    }
    async processChatStream(userId, sessionId, message, model, topicType, res) {
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
            query: message,
            history: history,
            mode: topicType
        };
        const stream = WorkflowEngine_1.workflowEngine.executeStream(req);
        let fullReply = '';
        try {
            for await (const event of stream) {
                if (event.type === 'progress') {
                    res.write(`data: ${JSON.stringify({ type: 'progress', message: event.message })}\n\n`);
                }
                else if (event.type === 'chunk') {
                    fullReply += event.chunk;
                    res.write(`data: ${JSON.stringify({ chunk: event.chunk })}\n\n`);
                }
                else if (event.type === 'error') {
                    throw new Error(event.message);
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
    }
    async getUserSessions(userId) {
        return this.repository.getSessionsByUser(userId);
    }
    async getSessionHistory(sessionId) {
        return this.repository.getMessages(sessionId);
    }
    async deleteSession(sessionId, userId) {
        return this.repository.deleteSession(sessionId, userId);
    }
    getSystemPromptForTopic(topicType) {
        // We now use the massive, comprehensive Exam Prep system prompt you provided!
        // We can still append topic-specific nuances if needed, but the base prompt covers everything.
        switch (topicType) {
            case 'image':
                return `${prompts_1.EXAM_PREP_SYSTEM_PROMPT}\n\nThe user explicitly wants an image right now. Focus heavily on generating the visual.`;
            case 'study-guide':
                return `${prompts_1.EXAM_PREP_SYSTEM_PROMPT}\n\nYour specific goal right now is to generate a highly structured, comprehensive study guide based on the user's queries. Ensure all the universal structures are followed.`;
            default:
                return prompts_1.EXAM_PREP_SYSTEM_PROMPT;
        }
    }
}
exports.ChatService = ChatService;
