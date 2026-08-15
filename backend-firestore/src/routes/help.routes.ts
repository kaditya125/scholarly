import { Router, Request, Response } from 'express';
import { HelpService } from '../services/help.service';
import { supportController } from '../controllers/support.controller';
import { requireAuth } from '../middlewares/auth';

const router = Router();
const helpService = new HelpService();

/* ── Public Visitor Help Routes ────────────────────────────────────────── */

router.post('/ask', async (req: Request, res: Response) => {
  try {
    const { sessionId, query, history } = req.body;
    
    if (!sessionId || !query) {
      return res.status(400).json({ error: 'sessionId and query are required' });
    }

    const result = await helpService.handleQuery({ sessionId, query, history });
    return res.status(200).json(result);
  } catch (error) {
    console.error('Help API error:', error);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
});

router.post('/agent-chat', async (req: Request, res: Response) => {
  try {
    const { sessionId, message, agentName, contextSummary, history } = req.body;
    if (!sessionId || !message) {
      return res.status(400).json({ error: 'sessionId and message are required' });
    }

    const result = await helpService.handleSupportAgentReply({
      sessionId,
      message,
      agentName: agentName || 'Sarah Chen',
      contextSummary,
      history
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
