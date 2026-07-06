import { Request, Response, NextFunction } from 'express';
import { FeedbackService } from '../services/feedback.service';
import { FeedbackRating } from '../types/observability';
import { logger } from '../utils/logger';

/**
 * FeedbackController — Handles user feedback on AI responses
 * 
 * POST /api/chat/:messageId/feedback
 */
export class FeedbackController {
  private feedbackService = new FeedbackService();

  public submitFeedback = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { messageId } = req.params;
      const userId = req.user?.uid;
      if (!userId) return res.status(401).json({ error: 'Unauthorized' });

      const {
        sessionId,
        rating,
        comment,
        promptVersion,
        retrievalIds,
        contextChunks,
        providerUsed,
        modelUsed,
        examMode,
        learningMode,
        confidenceScore,
        verificationScore,
        latencyMs,
        tokensUsed,
      } = req.body;

      if (!sessionId || !messageId || !rating) {
        return res.status(400).json({ error: 'Missing required fields: sessionId, rating' });
      }

      const validRatings: FeedbackRating[] = [
        'thumbs_up', 'thumbs_down', 'incorrect', 'outdated',
        'too_easy', 'too_hard', 'hallucination', 'needs_citation',
        'very_helpful', 'report_issue'
      ];
      if (!validRatings.includes(rating)) {
        return res.status(400).json({ error: `Invalid rating. Must be one of: ${validRatings.join(', ')}` });
      }

      const traceId = (req.headers['x-trace-id'] as string) || 'unknown';

      const feedbackId = await this.feedbackService.submitFeedback({
        userId,
        sessionId,
        messageId,
        rating,
        comment: comment || '',
        promptVersion: promptVersion || 'unknown',
        retrievalIds: retrievalIds || [],
        contextChunks: contextChunks || [],
        providerUsed: providerUsed || 'unknown',
        modelUsed: modelUsed || 'unknown',
        examMode: examMode || 'general',
        learningMode: learningMode || 'TEACHER',
        confidenceScore: confidenceScore || 0,
        verificationScore: verificationScore || 0,
        traceId,
        latencyMs: latencyMs || 0,
        tokensUsed: tokensUsed || 0,
      });

      res.status(201).json({ success: true, feedbackId });
    } catch (error) {
      logger.error('Feedback submission failed', { error });
      next(error);
    }
  };

  public getFeedbackSummary = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const days = parseInt(req.query.days as string) || 7;
      const summary = await this.feedbackService.getFeedbackSummary(days);
      res.json(summary);
    } catch (error) {
      next(error);
    }
  };
}
