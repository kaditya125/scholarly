import { Request, Response } from 'express';
import { studentSupportService } from '../services/support/studentSupport.service';
import { FeedbackService } from '../services/feedback.service';
import { logger } from '../utils/logger';

const feedbackService = new FeedbackService();

export class SupportController {
  /**
   * POST /help/authenticated/chat
   * Protected AI Assistant endpoint for authenticated students
   */
  async queryStudentHelp(req: Request, res: Response): Promise<Response> {
    try {
      const userId = (req as any).user?.uid;
      if (!userId) {
        return res.status(401).json({ error: 'Unauthorized. Authenticated session required.' });
      }

      const { query, sessionId, history, contextOverride } = req.body;
      if (!query || typeof query !== 'string' || !query.trim()) {
        return res.status(400).json({ error: 'Query string is required' });
      }

      const result = await studentSupportService.processHelpQuery(userId, {
        query: query.trim(),
        sessionId,
        history,
        contextOverride,
      });

      return res.status(200).json({ success: true, data: result });
    } catch (err: any) {
      logger.error('[SupportController] Error in queryStudentHelp', err);
      return res.status(500).json({ error: err.message || 'Internal Server Error' });
    }
  }

  /**
   * GET /help/tickets
   * Lists all support tickets belonging to the authenticated user
   */
  async getStudentTickets(req: Request, res: Response): Promise<Response> {
    try {
      const userId = (req as any).user?.uid;
      if (!userId) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      const status = req.query.status as string;
      const tickets = await studentSupportService.getStudentTickets(userId, status);
      return res.status(200).json({ success: true, data: tickets });
    } catch (err: any) {
      logger.error('[SupportController] Error in getStudentTickets', err);
      return res.status(500).json({ error: err.message || 'Internal Server Error' });
    }
  }

  /**
   * GET /help/tickets/:id
   * Retrieves single ticket with permission verification
   */
  async getTicketById(req: Request, res: Response): Promise<Response> {
    try {
      const userId = (req as any).user?.uid;
      if (!userId) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      const { id } = req.params;
      const ticket = await studentSupportService.getTicketById(userId, id);
      if (!ticket) {
        return res.status(404).json({ error: 'Ticket not found' });
      }

      return res.status(200).json({ success: true, data: ticket });
    } catch (err: any) {
      if (err.message?.includes('FORBIDDEN')) {
        return res.status(403).json({ error: 'Forbidden: Access denied' });
      }
      logger.error('[SupportController] Error in getTicketById', err);
      return res.status(500).json({ error: err.message || 'Internal Server Error' });
    }
  }

  /**
   * POST /help/tickets
   * Submits a support ticket or grievance
   */
  async createTicket(req: Request, res: Response): Promise<Response> {
    try {
      const userId = (req as any).user?.uid;
      if (!userId) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      const { category, subject, description, priority, relatedCourseId, relatedCourseName, relatedOrderId, relatedTestId, attachments } = req.body;
      if (!category || !subject || !description) {
        return res.status(400).json({ error: 'Category, subject, and description are required' });
      }

      const ticket = await studentSupportService.createTicket(userId, {
        category,
        subject: subject.trim(),
        description: description.trim(),
        priority,
        relatedCourseId,
        relatedCourseName,
        relatedOrderId,
        relatedTestId,
        attachments,
      });

      return res.status(201).json({ success: true, data: ticket });
    } catch (err: any) {
      logger.error('[SupportController] Error in createTicket', err);
      return res.status(500).json({ error: err.message || 'Internal Server Error' });
    }
  }

  /**
   * POST /help/tickets/:id/messages
   * Appends student message to ticket thread
   */
  async addTicketMessage(req: Request, res: Response): Promise<Response> {
    try {
      const userId = (req as any).user?.uid;
      if (!userId) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      const { id } = req.params;
      const { content, attachments } = req.body;
      if (!content || !content.trim()) {
        return res.status(400).json({ error: 'Message content is required' });
      }

      const updated = await studentSupportService.addTicketMessage(userId, id, content.trim(), attachments);
      return res.status(200).json({ success: true, data: updated });
    } catch (err: any) {
      logger.error('[SupportController] Error in addTicketMessage', err);
      return res.status(500).json({ error: err.message || 'Internal Server Error' });
    }
  }

  /**
   * POST /help/feedback
   * Records student satisfaction and general product feedback
   */
  async submitFeedback(req: Request, res: Response): Promise<Response> {
    try {
      const userId = (req as any).user?.uid || 'anonymous';
      const userEmail = (req as any).user?.email || req.body.email || 'anonymous';
      const { messageId, rating, comment, feedback, category, sentiment, currentUrl, metadata } = req.body;
      const feedbackText = (comment || feedback || '').trim();

      if (!feedbackText && !rating) {
        return res.status(400).json({ error: 'Please provide feedback comments or a rating.' });
      }

      const feedbackId = await feedbackService.submitFeedback({
        userId,
        messageId: messageId || `app_feedback_${Date.now()}`,
        sessionId: `session_${Date.now()}`,
        rating: rating || 'thumbs_up',
        comment: feedbackText,
        promptVersion: 'app_feedback_v2',
        retrievalIds: [],
        contextChunks: currentUrl ? [currentUrl] : [],
        providerUsed: 'Sadhya Student Portal',
        modelUsed: metadata?.device || 'web',
        examMode: category || 'General Feedback',
        learningMode: (sentiment || 'GENERAL').toUpperCase(),
        confidenceScore: 1.0,
        verificationScore: 1.0,
        traceId: `trace_${Date.now()}`,
        latencyMs: 0,
        tokensUsed: 0,
      });

      logger.info('[SupportController] Feedback submitted successfully', { feedbackId, userId, userEmail, category });
      return res.status(200).json({ success: true, data: { feedbackId } });
    } catch (err: any) {
      logger.error('[SupportController] Error in submitFeedback', err);
      return res.status(500).json({ error: err.message || 'Internal Server Error' });
    }
  }
}

export const supportController = new SupportController();
