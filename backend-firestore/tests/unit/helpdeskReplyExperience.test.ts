import { HelpService } from '../../src/services/help.service';

// Mock AI Providers and External Services
jest.mock('../../src/services/ai/gemini.provider', () => {
  return {
    GeminiProvider: jest.fn().mockImplementation(() => ({
      generateResponse: jest.fn().mockResolvedValue({
        reply: JSON.stringify({
          type: 'feature_list',
          text: 'Sadhya is an AI-powered adaptive educational platform designed to personalize learning for CBSE, JEE, and NEET students using syllabus-grounded tutoring.',
          features: [
            '24/7 AI tutor with verified step-by-step reasoning',
            'Camera OCR to scan and solve handwritten problems',
            'AI Podcast Studio converting PDF notes into audio discussions'
          ],
          relatedQuestions: [
            'How does OCR handwriting scanner work?',
            'What is the pricing for Sadhya Pro?'
          ]
        })
      })
    }))
  };
});

jest.mock('../../src/services/ai/groq.provider', () => {
  return {
    GroqProvider: jest.fn().mockImplementation(() => ({
      generateResponse: jest.fn().mockResolvedValue({
        reply: JSON.stringify({
          type: 'feature_list',
          text: 'Groq fallback response with educational features.',
          features: ['Feature 1', 'Feature 2']
        })
      })
    }))
  };
});

jest.mock('../../src/services/rag/retrieval.service', () => {
  return {
    RetrievalService: jest.fn().mockImplementation(() => ({
      rewriteQuery: jest.fn().mockResolvedValue('rewritten query'),
      retrievePublicKnowledge: jest.fn().mockResolvedValue([
        { text: 'Sadhya provides AI learning tools.', source: 'platform_docs' }
      ])
    }))
  };
});

jest.mock('../../src/services/cache.service', () => {
  const store = new Map<string, any>();
  return {
    cacheService: {
      get: jest.fn().mockImplementation(async (k: string) => store.get(k) || null),
      set: jest.fn().mockImplementation(async (k: string, v: any) => store.set(k, v))
    }
  };
});

describe('Enhanced Helpdesk & User Reply Experience Tests', () => {
  let helpService: HelpService;

  beforeEach(() => {
    helpService = new HelpService();
  });

  it('should return a rich structured response with keyHighlight, actionChips, and featureCards for student queries', async () => {
    const result = await helpService.handleQuery({
      sessionId: 'test_session_101',
      query: 'What AI features does Sadhya provide for students?'
    });

    expect(result).toBeDefined();
    expect(result.response).toBeDefined();
    expect(result.response.text).toContain('Sadhya is an AI-powered');

    // Verify keyHighlight (TL;DR)
    expect(result.response.keyHighlight).toBeDefined();
    expect(typeof result.response.keyHighlight).toBe('string');

    // Verify dynamic action chips (quick replies)
    expect(result.response.actionChips).toBeDefined();
    expect(Array.isArray(result.response.actionChips)).toBe(true);
    expect(result.response.actionChips!.length).toBeGreaterThanOrEqual(2);

    // Verify CTA resolution
    expect(result.response.cta).toBeDefined();
    expect(result.response.cta!.url).toBeDefined();

    // Verify related questions
    expect(result.response.relatedQuestions).toBeDefined();
    expect(result.response.relatedQuestions!.length).toBeGreaterThanOrEqual(2);
  });

  it('should resolve smart policy links when asking about refund and guarantee', async () => {
    const result = await helpService.handleQuery({
      sessionId: 'test_session_102',
      query: 'What is your 7-day refund guarantee policy?'
    });

    expect(result.response.policyLinks).toBeDefined();
    const refundLink = result.response.policyLinks?.find(l => l.url === '/refunds');
    expect(refundLink).toBeDefined();
    expect(refundLink?.title).toContain('Refunds');
  });

  it('should generate personalized human specialist opening reply with conversation context', async () => {
    const replyResult = await helpService.handleSupportAgentReply({
      sessionId: 'test_session_103',
      message: 'I would like to verify how teacher payouts work.',
      agentName: 'Sarah Chen',
      contextSummary: 'User was asking about teacher classes and monetization.',
      history: [{ role: 'user', content: 'Can teachers earn money?' }]
    });

    expect(replyResult).toBeDefined();
    expect(replyResult.reply).toBeDefined();
    expect(typeof replyResult.reply).toBe('string');
  });
});
