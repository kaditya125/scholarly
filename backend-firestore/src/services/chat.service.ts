import { ChatRepository } from '../repositories/chat.repository';
import { WorkflowRequest, workflowEngine } from '../core/workflow/WorkflowEngine';
import { ChatMessage, TopicType } from '../types';
import { logger } from '../utils/logger';

export class ChatService {
  private repository = new ChatRepository();

  // Removed getProvider because DI container handles it now.

  async processChat(userId: string, sessionId: string, message: string, model: string, topicType: TopicType) {
    // 1. Get or create session
    await this.repository.getOrCreateSession(sessionId, userId, topicType, model);

    // 2. Load conversation history
    const history = await this.repository.getMessages(sessionId);

    // 3. Create new user message
    const userMessage: ChatMessage = {
      role: 'user',
      content: message,
      timestamp: Date.now()
    };
    
    // Add to history so AI sees it
    history.push(userMessage);

    // 4. Run Workflow
    const req: WorkflowRequest = {
      userId,
      sessionId,
      query: message,
      history: history,
      mode: topicType,
      model
    };

    // Because this is the non-streaming fallback, we manually consume the stream to get the full reply
    const stream = workflowEngine.executeStream(req);
    let fullReply = '';
    
    for await (const event of stream) {
      if (event.type === 'chunk' && event.chunk) {
        fullReply += event.chunk;
      }
    }

    // 6. Create assistant message
    const assistantMessage: ChatMessage = {
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

  async processChatStream(userId: string, sessionId: string, message: string, model: string, topicType: TopicType, res: any, notebookId?: string, traceId?: string) {
    logger.info(`Starting stream workflow for user ${userId}`, { traceId, sessionId });

    // 1. Get or create session
    await this.repository.getOrCreateSession(sessionId, userId, topicType, model);

    // 2. Load conversation history
    const history = await this.repository.getMessages(sessionId);

    // 3. Create new user message and save it immediately
    const userMessage: ChatMessage = {
      role: 'user',
      content: message,
      timestamp: Date.now()
    };
    
    // Save user message immediately so it's not lost if AI fails
    await this.repository.saveMessage(sessionId, userMessage);
    
    history.push(userMessage);

    // 4. Execute through Workflow Engine
    const req: WorkflowRequest = {
      userId,
      sessionId,
      notebookId,
      query: message,
      history: history,
      mode: topicType,
      model,
      traceId
    };

    const stream = workflowEngine.executeStream(req);
    
    let fullReply = '';

    try {
      for await (const event of stream) {
        if (event.type === 'progress') {
          res.write(`data: ${JSON.stringify({ type: 'progress', message: event.message })}\n\n`);
        } else if (event.type === 'chunk') {
          fullReply += event.chunk;
          res.write(`data: ${JSON.stringify({ type: 'chunk', content: event.chunk })}\n\n`);
        } else if (event.type === 'error') {
          throw new Error(event.message);
        } else if (event.type === 'citation') {
          res.write(`data: ${JSON.stringify({ type: 'citation', citation: event.citation })}\n\n`);
        } else if (event.type === 'warning') {
          res.write(`data: ${JSON.stringify({ type: 'warning', message: event.warning })}\n\n`);
        } else if (event.type === 'done') {
          res.write(`data: ${JSON.stringify({ type: 'done', data: event.data })}\n\n`);
        }
      }

      res.write('data: [DONE]\n\n');
      res.end();
    } catch (error: any) {
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
      } else {
        res.write(`data: ${JSON.stringify({ error: errorMessage })}\n\n`);
        res.end();
      }
      
      // Save the error message as the AI's response so chat history makes sense
      const errorAssistantMessage: ChatMessage = {
        role: 'ai',
        content: `*(Error: ${errorMessage})*`,
        timestamp: Date.now()
      };
      await this.repository.saveMessage(sessionId, errorAssistantMessage);
      
      return; // Stop execution
    }

    // 7. Save to database after stream finishes
    const assistantMessage: ChatMessage = {
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

  private async generateAndSaveTitle(sessionId: string, messages: ChatMessage[]) {
    try {
      const { GeminiProvider } = await import('./ai/gemini.provider');
      const llm = new GeminiProvider();
      
      const prompt = `Based on the following conversation, generate a short 2-5 word title that summarizes the main topic of discussion. Do not include quotes, punctuation, or any prefixes like "Title:". Just the raw title text.\n\n` + 
        messages.map(m => `${m.role}: ${m.content}`).join('\n');
      
      const response = await llm.generateResponse([{ role: 'user', content: prompt, timestamp: Date.now() }] as any);
      const title = response.reply.trim().replace(/^["']|["']$/g, '');
      
      if (title && title.length < 50) {
        await this.repository.updateSessionTitle(sessionId, title);
      }
    } catch (e) {
      console.error('Failed to generate dynamic title', e);
    }
  }

  async getUserSessions(userId: string) {
    return this.repository.getSessionsByUser(userId);
  }

  async getSessionHistory(sessionId: string, requesterId?: string) {
    // Ownership check: when a requester is provided, ensure they own the session.
    if (requesterId) {
      const session = await this.repository.getSession(sessionId);
      if (session && session.userId && session.userId !== requesterId) {
        throw new Error('Forbidden');
      }
    }
    return this.repository.getMessages(sessionId);
  }

  async deleteSession(sessionId: string, userId: string) {
    return this.repository.deleteSession(sessionId, userId);
  }

}
