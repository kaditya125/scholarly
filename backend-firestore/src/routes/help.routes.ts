import { Router, Request, Response } from 'express';
import { HelpService } from '../services/help.service';
import { supportController } from '../controllers/support.controller';
import { requireAuth } from '../middlewares/auth';
import { helpdeskLimiter } from '../middleware/rateLimiter';

const router = Router();
const helpService = new HelpService();

/* ── Public Visitor Help Routes ────────────────────────────────────────── */

router.post('/ask', helpdeskLimiter, async (req: Request, res: Response) => {
  try {
    const { sessionId, query, history } = req.body;
    
    if (!sessionId || !query || typeof query !== 'string') {
      return res.status(400).json({ error: 'sessionId and a valid string query are required' });
    }

    if (query.trim().length === 0) {
      return res.status(400).json({ error: 'Query cannot be empty' });
    }

    if (query.length > 1000) {
      return res.status(400).json({ error: 'Query exceeds maximum length of 1000 characters' });
    }

    // Bound client history to prevent excessive payload injection
    const boundedHistory = Array.isArray(history) ? history.slice(-10) : undefined;

    const result = await helpService.handleQuery({ sessionId, query: query.trim(), history: boundedHistory });
    return res.status(200).json(result);
  } catch (error) {
    console.error('Help API error:', error);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
});

router.post('/agent-chat', helpdeskLimiter, async (req: Request, res: Response) => {
  try {
    const { sessionId, message, agentName, contextSummary, history } = req.body;
    if (!sessionId || !message || typeof message !== 'string') {
      return res.status(400).json({ error: 'sessionId and a valid message string are required' });
    }

    if (message.trim().length === 0) {
      return res.status(400).json({ error: 'Message cannot be empty' });
    }

    if (message.length > 1000) {
      return res.status(400).json({ error: 'Message exceeds maximum length of 1000 characters' });
    }

    const boundedHistory = Array.isArray(history) ? history.slice(-10) : undefined;

    const result = await helpService.handleSupportAgentReply({
      sessionId,
      message: message.trim(),
      agentName: agentName || 'Sarah Chen',
      contextSummary: typeof contextSummary === 'string' ? contextSummary.slice(0, 500) : undefined,
      history: boundedHistory
    });
    return res.status(200).json(result);
  } catch (error) {
    console.error('Support agent chat error:', error);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
});

/* ── Authenticated Student Help & Support Routes ───────────────────────── */

// Protected AI Assistant query
router.post('/authenticated/chat', requireAuth, (req, res) => supportController.queryStudentHelp(req, res));

// Ticket management
router.get('/tickets', requireAuth, (req, res) => supportController.getStudentTickets(req, res));
router.get('/tickets/:id', requireAuth, (req, res) => supportController.getTicketById(req, res));
router.post('/tickets', requireAuth, (req, res) => supportController.createTicket(req, res));
router.post('/tickets/:id/messages', requireAuth, (req, res) => supportController.addTicketMessage(req, res));

// Feedback
router.post('/feedback', requireAuth, (req, res) => supportController.submitFeedback(req, res));

export default router;
