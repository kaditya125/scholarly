import { GeminiProvider } from './ai/gemini.provider';
import { GroqProvider } from './ai/groq.provider';
import { RetrievalService } from './rag/retrieval.service';
import { cacheService } from './cache.service';
import { ChatMessage } from '../types';
import { Telemetry } from '../lib/telemetry';
import { SCHOLARLY_MASTER_KNOWLEDGE } from './knowledge/scholarlyKnowledge';

export interface HelpQueryRequest {
  sessionId: string;
  query: string;
  history?: ChatMessage[];
}

export interface IntentClassification {
  intent: string;
  confidence: number;
  requiresAuth: boolean;
  requiresKnowledge: boolean;
}

export interface StructuredResponse {
  type: 'text' | 'feature_list' | 'feature_cards' | 'cta' | 'error';
  text?: string;
  features?: string[];
  cards?: { title: string; description: string; icon?: string }[];
  cta?: { label: string; url: string; type: 'primary' | 'secondary' };
  policyLinks?: { title: string; url: string; description?: string }[];
  relatedQuestions?: string[];
}

export interface HelpResponse {
  response: StructuredResponse;
  metadata: {
    intent: string;
    confidence: number;
    sources?: string[];
  };
}

const AUTH_REQUIRED_INTENTS = [
  'PERSONAL_TEST_SCORES',
  'COURSES',
  'ENROLLMENTS',
  'PAYMENTS',
  'SUBSCRIPTIONS',
  'PERSONAL_PERFORMANCE',
  'PRIVATE_MESSAGES',
  'AUTH_REQUIRED'
];

export class HelpService {
  private geminiProvider: GeminiProvider;
  private groqProvider: GroqProvider;
  private retrievalService: RetrievalService;

  constructor() {
    this.geminiProvider = new GeminiProvider();
    this.groqProvider = new GroqProvider();
    this.retrievalService = new RetrievalService();
  }

  private async executeLLM(prompt: string, systemPrompt?: string): Promise<string> {
    try {
      const res = await this.geminiProvider.generateResponse(
        [{ role: 'user', content: prompt, timestamp: Date.now() }],
        systemPrompt
      );
      return res.reply;
    } catch (e) {
      console.warn('[HelpService] Gemini provider failed, falling back to Groq...', e);
      const res = await this.groqProvider.generateResponse(
        [{ role: 'user', content: prompt, timestamp: Date.now() }],
        systemPrompt
      );
      return res.reply;
    }
  }

  /**
   * Retrieves or initializes a short-lived session context
   */
  private async getSessionHistory(sessionId: string): Promise<ChatMessage[]> {
    const key = `help_session:${sessionId}`;
    const history = await cacheService.get<ChatMessage[]>(key);
    return history || [];
  }

  private async saveSessionHistory(sessionId: string, history: ChatMessage[]) {
    const key = `help_session:${sessionId}`;
    // Keep session short-lived (1 hour) to protect privacy and limit context size
    await cacheService.set(key, history.slice(-10), 3600);
  }

  /**
   * Hybrid intent classifier: uses heuristics first, then a fast LLM.
   */
  private async classifyIntent(query: string, history: ChatMessage[]): Promise<IntentClassification> {
    const tStart = performance.now();
    
    // 1. Deterministic Checks (Request Validation / Scope Detection)
    const lowerQuery = query.toLowerCase();
    if (lowerQuery.includes('human') || lowerQuery.includes('live agent') || lowerQuery.includes('real person') || lowerQuery.includes('talk to someone') || lowerQuery.includes('helpdesk agent') || lowerQuery.includes('support agent')) {
      return { intent: 'LIVE_AGENT_REQUEST', confidence: 1.0, requiresAuth: false, requiresKnowledge: false };
    }
    if (lowerQuery.includes('my score') || lowerQuery.includes('my test') || lowerQuery.includes('my password') || lowerQuery.includes('my account')) {
      return { intent: 'AUTH_REQUIRED', confidence: 1.0, requiresAuth: true, requiresKnowledge: false };
    }
    
    // 2. Fast LLM Classification
    const prompt = `You are the intent classifier for the public Ask Scholarly experience.
Analyze the query and return a valid JSON object.
Use exactly this structure:
{
  "intent": "YOUR_ACTUAL_INTENT_HERE",
  "confidence": 0.95,
  "requiresAuth": false,
  "requiresKnowledge": true
}
Note: "intent" MUST be one of: PLATFORM_OVERVIEW, TEACHER_CLASS, AI_TUTOR, PRICING, OUT_OF_SCOPE, AUTH_REQUIRED, or LIVE_AGENT_REQUEST.
IMPORTANT: Do not copy the example values. Write your real analysis into the JSON.

History:
${history.map(m => `${m.role}: ${m.content}`).join('\n')}

Query: "${query}"`;

    try {
      const rawText = await this.executeLLM(prompt);
      const rawStr = rawText.replace(/```json/g, '').replace(/```/g, '').trim();
      const firstBrace = rawStr.indexOf('{');
      const lastBrace = rawStr.lastIndexOf('}');
      
      let cleanStr = rawStr;
      if (firstBrace !== -1 && lastBrace !== -1) {
        cleanStr = rawStr.substring(firstBrace, lastBrace + 1);
      }
      
      cleanStr = cleanStr.replace(/,\s*([}\]])/g, '$1');
      const classification = JSON.parse(cleanStr) as IntentClassification;
      
      // Safety bounds
      classification.requiresAuth = classification.requiresAuth || AUTH_REQUIRED_INTENTS.includes(classification.intent);
      
      Telemetry.logLatency('help_intent_classification', performance.now() - tStart, { intent: classification.intent });
      return classification;
    } catch (e) {
      console.error('Intent classification failed:', e);
      // Safe fallback
      return {
        intent: 'UNKNOWN',
        confidence: 0.0,
        requiresAuth: false,
        requiresKnowledge: true // try to search knowledge anyway as fallback
      };
    }
  }

  private resolveCTA(
    query: string,
    intent: string,
    proposedCTA?: { label: string; url: string; type: 'primary' | 'secondary' },
    requiresAuth?: boolean
  ): { label: string; url: string; type: 'primary' | 'secondary' } {
    if (requiresAuth) {
      return { label: 'Sign in to your account', url: '/signin', type: 'primary' };
    }

    const q = query.toLowerCase();

    // 1. Referrals & Rewards (Checked first to avoid 'pro' in 'program')
    if (q.includes('refer') || q.includes('invite') || q.includes('reward') || q.includes('affiliate') || /\bearn\b/i.test(q)) {
      return { label: 'Explore Referral Program', url: '/refer', type: 'primary' };
    }

    // 2. AI Podcast Studio
    if (q.includes('podcast') || q.includes('audio') || q.includes('voice') || /\blisten\b/i.test(q)) {
      return { label: 'Explore Podcast Studio', url: '/signup', type: 'primary' };
    }

    // 3. Test Center & Assessments
    if (q.includes('test') || q.includes('exam') || q.includes('assessment') || q.includes('quiz') || q.includes('mock') || q.includes('jee') || q.includes('neet') || q.includes('cbse')) {
      return { label: 'Try Adaptive Practice Tests', url: '/signup', type: 'primary' };
    }

    // 4. Teacher Ecosystem & Classroom tools
    if (q.includes('teacher') || q.includes('class') || q.includes('curriculum') || q.includes('syllabus') || q.includes('teach') || q.includes('assignment') || intent.includes('TEACHER')) {
      return { label: 'Create Teacher Workspace', url: '/for-teachers', type: 'primary' };
    }

    // 5. Pricing, Cost & Subscriptions (Using regex for word boundaries so 'program' does not match 'pro')
    if (q.includes('price') || q.includes('cost') || q.includes('subscription') || q.includes('refund') || /\b(plan|plans|pro|pricing|billing|discount|free)\b/i.test(q) || intent.includes('PRICING')) {
      return { label: 'View Pricing & Plans', url: '/pricing', type: 'primary' };
    }

    // 6. Flashcards, Mindmaps & Notebooks
    if (q.includes('flashcard') || q.includes('mindmap') || q.includes('mind map') || q.includes('note') || q.includes('ocr') || q.includes('pdf') || q.includes('tutor') || intent.includes('AI_TUTOR')) {
      return { label: 'Try AI Tutor for Free', url: '/signup', type: 'primary' };
    }

    // 7. If model proposed a valid custom CTA with safe URL, prioritize it
    if (proposedCTA?.label && proposedCTA?.url && (proposedCTA.url.startsWith('/') || proposedCTA.url.startsWith('mailto:'))) {
      return proposedCTA;
    }

    // Default primary CTA
    return { label: 'Get Started for Free', url: '/signup', type: 'primary' };
  }

  private resolveSmartRelatedQuestions(
    query: string,
    intent: string,
    proposed?: string[]
  ): string[] {
    const q = query.toLowerCase();

    // If model provided 2 or more distinct questions, use them (cleaned up)
    if (proposed && Array.isArray(proposed) && proposed.length >= 2) {
      const valid = proposed.map(item => String(item).trim()).filter(item => item.length > 5);
      if (valid.length >= 2) {
        return valid.slice(0, 4);
      }
    }

    // Dynamic contextual topic matching
    if (q.includes('teacher') || q.includes('class') || q.includes('teach') || intent.includes('TEACHER')) {
      return [
        "How do payouts and the Earnings Ledger work?",
        "Can I host live video classes with real-time screen sharing?",
        "How do assignments and auto-grading work for classes?",
        "Can I create private or invite-only classrooms?"
      ];
    }

    if (q.includes('price') || q.includes('cost') || q.includes('plan') || q.includes('subscription') || q.includes('refund') || intent.includes('PRICING')) {
      return [
        "What is the difference between Free and Pro tiers?",
        "How does the 7-day money-back guarantee work?",
        "Can I cancel my subscription anytime?",
        "Do you offer annual discounts or group plans?"
      ];
    }

    if (q.includes('podcast') || q.includes('audio') || q.includes('listen') || q.includes('voice')) {
      return [
        "Can I create podcasts from handwritten notes and PDFs?",
        "How does the two-host conversation format work?",
        "Can I download audio episodes for offline study?",
        "What voice styles and accents are supported?"
      ];
    }

    if (q.includes('test') || q.includes('exam') || q.includes('quiz') || q.includes('assessment')) {
      return [
        "What is the Baseline Assessment Engine?",
        "Can I generate custom mock tests for CBSE/JEE/NEET?",
        "How does the AI analyze my weak subject areas?",
        "Can teachers review student test submissions?"
      ];
    }

    if (q.includes('refer') || q.includes('reward') || q.includes('invite') || q.includes('earn')) {
      return [
        "How much can I earn per successful referral?",
        "Where do I find my personal referral link?",
        "When are referral rewards paid out?",
        "Can teachers also participate in the referral program?"
      ];
    }

    // Default rich platform exploration questions
    return [
      "How does the 24/7 AI Personal Tutor work?",
      "Can I upload textbook photos and handwritten notes?",
      "How do AI concept mind maps work?",
      "Can teachers monetize their course materials?"
    ];
  }

  private resolveSmartPolicyLinks(
    query: string,
    intent: string,
    proposed?: { title: string; url: string; description?: string }[]
  ): { title: string; url: string; description?: string }[] | undefined {
    const q = query.toLowerCase();
    const links: { title: string; url: string; description?: string }[] = [];

    // 1. Refunds, Money-Back, Cancellation
    if (q.includes('refund') || q.includes('cancel') || q.includes('money back') || q.includes('money-back') || q.includes('guarantee')) {
      links.push({
        title: 'Refunds & Cancellation Policy',
        url: '/refunds',
        description: '7-day unconditional money-back guarantee & automated refund processing'
      });
    }

    // 2. Privacy, Student Data, Security, Encryption
    if (q.includes('privacy') || q.includes('data') || q.includes('security') || q.includes('encrypt') || q.includes('sell') || q.includes('tracking') || q.includes('protect')) {
      links.push({
        title: 'Privacy Policy',
        url: '/privacy',
        description: 'Zero third-party data selling & strict student data isolation'
      });
      links.push({
        title: 'Security Architecture',
        url: '/security',
        description: 'SOC2-grade cloud encryption and isolated vector namespaces'
      });
    }

    // 3. Terms of Service, Legal, Rules, Accounts
    if (q.includes('term') || q.includes('legal') || q.includes('rule') || q.includes('service') || q.includes('policy') || q.includes('agreement') || q.includes('rights')) {
      links.push({
        title: 'Terms of Service',
        url: '/terms',
        description: 'Official user agreement, acceptable use standards, and account terms'
      });
    }

    // 4. Pricing & Plans
    if (q.includes('price') || q.includes('cost') || q.includes('tier') || q.includes('subscription') || intent.includes('PRICING')) {
      links.push({
        title: 'Pricing & Plan Details',
        url: '/pricing',
        description: 'Free vs. Pro (₹499/mo) comparison, annual savings, and student discounts'
      });
    }

    // 5. Teacher Guidelines & Earnings
    if (q.includes('teacher') || q.includes('payout') || q.includes('ledger') || q.includes('razorpay') || intent.includes('TEACHER')) {
      links.push({
        title: 'Teacher Guidelines & Classroom Terms',
        url: '/for-teachers',
        description: 'Verified educator status, course monetization, and RazorpayX payouts'
      });
    }

    // 6. Referrals
    if (q.includes('refer') || q.includes('reward') || q.includes('affiliate')) {
      links.push({
        title: 'Referral Program Terms',
        url: '/refer',
        description: 'Guidelines on earning free months of Scholarly Pro through student invites'
      });
    }

    // Merge any custom links generated by the model if valid
    if (proposed && Array.isArray(proposed)) {
      for (const p of proposed) {
        if (p?.title && p?.url && p.url.startsWith('/') && !links.some(l => l.url === p.url)) {
          links.push(p);
        }
      }
    }

    return links.length > 0 ? links.slice(0, 3) : undefined;
  }

  public async handleQuery(request: HelpQueryRequest): Promise<HelpResponse> {
    const { sessionId, query, history: clientHistory } = request;
    const sessionHistory = await this.getSessionHistory(sessionId);
    
    // Prioritize client-provided history for seamless conversational continuity
    const history: ChatMessage[] = clientHistory && clientHistory.length > 0
      ? clientHistory.map(m => ({ role: ((m.role as string) === 'assistant' ? 'ai' : m.role) as any, content: m.content, timestamp: Date.now() }))
      : sessionHistory;
    
    // 1. Intent Detection
    const classification = await this.classifyIntent(query, history);

    // 2. Auth Short-circuit
    if (classification.requiresAuth) {
      const authResponse: StructuredResponse = {
        type: 'cta',
        text: "I can't access personal account details, passwords, or private test scores from here. Please sign in to view your account.",
        cta: this.resolveCTA(query, classification.intent, undefined, true)
      };
      
      // Update history
      history.push({ role: 'user', content: query, timestamp: Date.now() } as any);
      history.push({ role: 'assistant', content: authResponse.text || '', timestamp: Date.now() } as any);
      await this.saveSessionHistory(sessionId, history);

      return {
        response: authResponse,
        metadata: { intent: classification.intent, confidence: classification.confidence }
      };
    }

    // 2.5 Live Agent Escalation Check
    if (classification.intent === 'LIVE_AGENT_REQUEST') {
      const agentResponse: StructuredResponse = {
        type: 'cta',
        text: "I'd be glad to connect you with our live helpdesk support team! Before I transfer you, would you like me to open the live support window so you can chat directly with a real specialist?",
        cta: { label: 'Connect to Live Agent', url: '#live-agent', type: 'primary' },
        relatedQuestions: [
          "What are your support hours?",
          "Can I also email support@scholarly.ai?"
        ]
      };
      return {
        response: agentResponse,
        metadata: { intent: classification.intent, confidence: 1.0 }
      };
    }
    
    // 3. Out of Scope Check
    if (classification.intent === 'OUT_OF_SCOPE' && classification.confidence > 0.8) {
       const oosResponse: StructuredResponse = {
         type: 'text',
         text: "I'm specifically designed to guide you through Scholarly's learning and teaching tools. Let me know what you'd like to explore!",
         cta: { label: 'Explore Scholarly Features', url: '/signup', type: 'primary' }
       };
       return {
         response: oosResponse,
         metadata: { intent: classification.intent, confidence: classification.confidence }
       };
    }

    // 4. Public RAG Retrieval
    let contextStr = '';
    let sources: string[] = [];
    if (classification.requiresKnowledge) {
       const rewrittenQuery = await this.retrievalService.rewriteQuery(query, history);
       const retrievedDocs = await this.retrievalService.retrievePublicKnowledge(rewrittenQuery, 3);
       
       contextStr = retrievedDocs.map(doc => `[Source: ${doc.source}]\n${doc.text}`).join('\n\n');
       sources = Array.from(new Set(retrievedDocs.map(doc => doc.source)));
    }

    // 5. Response Generation with Strict Conversational Formatting
    const prompt = `You are "Ask Scholarly", the official, friendly, and expert conversational guide for Scholarly.

PLATFORM MASTER KNOWLEDGE:
${SCHOLARLY_MASTER_KNOWLEDGE}

ADDITIONAL VERIFIED CONTEXT:
${contextStr || 'No additional custom documents retrieved.'}

CONVERSATION HISTORY (Previous turns in this chat):
${history.length > 0 ? history.map(m => `${m.role === 'user' ? 'User' : 'Ask Scholarly'}: ${m.content}`).join('\n\n') : 'No previous conversation.'}

USER'S LATEST MESSAGE:
"${query}"

CRITICAL FORMATTING & CONTEXT RULES:
1. CONTEXT CONTINUITY: You MUST maintain the full context of this conversation. If the user asks a follow-up, refers to a previous feature (e.g. "what about that?", "how does it work?", "how much is it?"), directly connect your answer to the previous subject.
2. NO RUN-ON ASTERISK LISTS IN TEXT: Write a clean, natural, engaging conversational explanation in the "text" field (1 to 2 short paragraphs). DO NOT dump raw asterisk lists (e.g. "* **Feature**: ...") inside "text"!
3. STRUCTURED FEATURES LIST: If highlighting multiple features, tools, or capabilities, place each item as a clean string inside the "features" array (3 to 5 bullet points).
4. RELATED QUESTIONS: Provide 2 to 3 engaging follow-up questions for the user to explore next.
5. STRICT JSON ONLY: Respond ONLY with a valid JSON object matching the schema below.

JSON SCHEMA:
{
  "type": "feature_list",
  "text": "Conversational explanation here (clean, natural paragraphs, no raw bullet dumps)...",
  "features": [
    "Clean feature or capability 1",
    "Clean feature or capability 2",
    "Clean feature or capability 3"
  ],
  "relatedQuestions": [
    "Logical follow-up question 1?",
    "Logical follow-up question 2?"
  ]
}`;

    try {
      const rawText = await this.executeLLM(prompt);
      const rawStr = rawText.replace(/```json/g, '').replace(/```/g, '').trim();
      const firstBrace = rawStr.indexOf('{');
      const lastBrace = rawStr.lastIndexOf('}');
      
      let cleanStr = rawStr;
      if (firstBrace !== -1 && lastBrace !== -1) {
        cleanStr = rawStr.substring(firstBrace, lastBrace + 1);
      }
      
      cleanStr = cleanStr.replace(/,\s*([}\]])/g, '$1');
      const structuredRes = JSON.parse(cleanStr) as StructuredResponse;
      
      // Inject smart, query-aware CTA
      structuredRes.cta = this.resolveCTA(query, classification.intent, structuredRes.cta, false);
      
      // Enforce guaranteed 3-4 relevant follow-up questions
      structuredRes.relatedQuestions = this.resolveSmartRelatedQuestions(
        query,
        classification.intent,
        structuredRes.relatedQuestions
      );

      // Attach relevant official policy documents if applicable
      structuredRes.policyLinks = this.resolveSmartPolicyLinks(
        query,
        classification.intent,
        structuredRes.policyLinks
      );
      
      // Save to memory
      history.push({ role: 'user', content: query, timestamp: Date.now() } as any);
      history.push({ role: 'assistant', content: structuredRes.text || '', timestamp: Date.now() } as any);
      await this.saveSessionHistory(sessionId, history);

      return {
        response: structuredRes,
        metadata: {
          intent: classification.intent,
          confidence: classification.confidence,
          sources
        }
      };
    } catch (e) {
      console.error('Response generation failed:', e);
      return {
        response: {
          type: 'error',
          text: 'Something went wrong while preparing that answer. Please try again.',
          cta: { label: 'Refresh', url: '/help', type: 'secondary' }
        },
        metadata: { intent: classification.intent, confidence: classification.confidence }
      };
    }
  }

  /**
   * Generates a live support specialist response for the helpdesk right pane
   */
  public async handleSupportAgentReply(request: {
    sessionId: string;
    message: string;
    agentName: string;
    contextSummary?: string;
    history?: { role: string; content: string }[];
  }): Promise<{ reply: string }> {
    const prompt = `You are ${request.agentName}, a senior human customer support specialist at Scholarly.
You are chatting live in real-time with a student or educator who requested human helpdesk assistance.

Scholarly Platform Facts:
${SCHOLARLY_MASTER_KNOWLEDGE}

Context of user's previous inquiry:
${request.contextSummary || 'User transferred from AI assistant for personalized helpdesk support.'}

Conversation history with support agent:
${request.history?.map(m => `${m.role === 'user' ? 'User' : request.agentName}: ${m.content}`).join('\n') || 'No previous support messages.'}

User's new message:
"${request.message}"

Instructions:
1. Reply warmly, empathetically, and professionally as ${request.agentName}, an experienced human support specialist.
2. Keep your answer concise, conversational, and direct (1 to 2 short paragraphs).
3. Directly resolve their concern, offer next steps, or confirm actions.
4. DO NOT output JSON. Output your conversational support message directly.`;

    const rawText = await this.executeLLM(prompt);
    return { reply: rawText.trim() };
  }
}
