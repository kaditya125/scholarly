import { Router, Request, Response } from 'express';
import { SrijyaAssistantService } from '../services/srijyaAssistant.service';
import { helpdeskLimiter } from '../middleware/rateLimiter';

const router = Router();
const assistant = new SrijyaAssistantService();

/**
 * Public endpoint for Ask Srijya on the corporate site.
 *
 * Its own router rather than a branch inside help.routes: that file serves
 * Sadhya's helpdesk, and two products sharing one handler is how a change made
 * for one silently alters the other.
 *
 * Unauthenticated by necessity — it answers questions for visitors who have no
 * account and never will. That makes the rate limiter the only thing between an
 * open endpoint and a model bill, so it is applied before anything else runs,
 * and the payload is bounded before it reaches a provider.
 */

/** POST /api/srijya/ask  —  { query } -> { answer } */
router.post('/ask', helpdeskLimiter, async (req: Request, res: Response) => {
  try {
    const { query } = req.body;

    if (!query || typeof query !== 'string') {
      return res.status(400).json({ error: 'A string "query" is required' });
    }

    const trimmed = query.trim();
    if (trimmed.length === 0) {
      return res.status(400).json({ error: 'Query cannot be empty' });
    }

    /* 1000 chars matches the Sadhya helpdesk. It is well past any real question
       and short enough that a long paste cannot be used to push the system
       prompt out of the model's attention. */
    if (trimmed.length > 1000) {
      return res.status(400).json({ error: 'Query exceeds maximum length of 1000 characters' });
    }

    const result = await assistant.ask(trimmed);
    return res.status(200).json(result);
  } catch (error) {
    console.error('Srijya assistant API error:', error);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
});

export default router;
