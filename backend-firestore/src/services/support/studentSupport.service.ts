import { db } from '../../config/firebase';
import { GeminiProvider } from '../ai/gemini.provider';
import { GroqProvider } from '../ai/groq.provider';
import { UserProfileService } from '../userProfile.service';
import { UserStatsService } from '../userStats.service';
import { enrollmentService } from '../enrollment.service';
import { supportTicketRepository } from '../../repositories/supportTicket.repository';
import { SADHYA_MASTER_KNOWLEDGE } from '../knowledge/sadhyaKnowledge';
import {
  AuthenticatedHelpQueryDTO,
  AuthenticatedHelpResponseDTO,
  SupportTicket,
  CreateTicketDTO,
  TicketCategory,
} from '../../types/supportTicket.types';
import { logger } from '../../utils/logger';

export interface VerifiedStudentContext {
  userId: string;
  name: string;
  email?: string;
  profile?: {
    goal?: string;
    stream?: string;
    board?: string;
    grade?: string;
    subjects?: string[];
  };
  enrollments: Array<{
    classId: string;
    className: string;
    subject?: string;
    teacherUid: string;
    state: string;
    joinedAt?: string;
  }>;
  recentOrders: Array<{
    orderId: string;
    amount: number;
    planId?: string;
    classId?: string;
    status: string;
    createdAt: number;
  }>;
  stats?: {
    totalTestsAttempted: number;
    averageAccuracy: number;
    xp: number;
    level: number;
  };
  activeTickets: Array<{
    id: string;
    ticketCode: string;
    subject: string;
    category: string;
    status: string;
    updatedAt: number;
  }>;
}

export class StudentSupportService {
  private geminiProvider: GeminiProvider;
  private groqProvider: GroqProvider;
  private profileService: UserProfileService;
  private statsService: UserStatsService;

  constructor() {
    this.geminiProvider = new GeminiProvider();
    this.groqProvider = new GroqProvider();
    this.profileService = new UserProfileService();
    this.statsService = new UserStatsService();
  }

  /**
   * Securely aggregates verified account data for the authenticated student.
   * Only queries resources belonging to userId.
   */
  async resolveStudentContext(userId: string): Promise<VerifiedStudentContext> {
    const [profileDoc, userDirDoc, enrollmentsData, paymentsSnap, statsData, ticketsData] = await Promise.all([
      this.profileService.getProfile(userId).catch(() => null),
      db.collection('userDirectory').doc(userId).get().catch(() => null),
      enrollmentService.listMine(userId).catch(() => []),
      db.collection('payments').where('userId', '==', userId).orderBy('createdAt', 'desc').limit(10).get().catch(() => null),
      this.statsService.getUserStats(userId).catch(() => null),
      supportTicketRepository.listByUser(userId).catch(() => []),
    ]);

    const userDir = userDirDoc && userDirDoc.exists ? userDirDoc.data() : {};
    const name = (profileDoc as any)?.displayName || userDir?.displayName || 'Student';
    const email = userDir?.email;

    const enrollments = enrollmentsData.map((edge) => ({
      classId: edge.classId,
      className: edge.class?.title || edge.class?.name || 'Class',
      subject: edge.class?.subject,
      teacherUid: edge.teacherUid,
      state: edge.state,
      joinedAt: edge.createdAt && typeof (edge.createdAt as any).toDate === 'function' ? (edge.createdAt as any).toDate().toISOString() : undefined,
    }));

    const recentOrders: VerifiedStudentContext['recentOrders'] = [];
    if (paymentsSnap && !paymentsSnap.empty) {
      paymentsSnap.docs.forEach((doc) => {
        const d = doc.data();
        recentOrders.push({
          orderId: doc.id,
          amount: Number(d.amount ? d.amount / 100 : (d.rupees || 0)),
          planId: d.planId,
          classId: d.classId,
          status: (d.status || 'PENDING').toUpperCase(),
          createdAt: typeof d.createdAt === 'number' ? d.createdAt : Date.now(),
        });
      });
    }

    const activeTickets = ticketsData.map((t) => ({
      id: t.id,
      ticketCode: t.ticketCode,
      subject: t.subject,
      category: t.category,
      status: t.status,
      updatedAt: t.updatedAt,
    }));

    return {
      userId,
      name,
      email,
      profile: {
        goal: (profileDoc as any)?.goal || userDir?.goal,
        stream: (profileDoc as any)?.stream || userDir?.stream,
        board: (profileDoc as any)?.board || userDir?.board,
        grade: (profileDoc as any)?.classLevel || userDir?.classLevel,
        subjects: (profileDoc as any)?.subjects || userDir?.subjects || [],
      },
      enrollments,
      recentOrders,
      stats: statsData
        ? {
            totalTestsAttempted: statsData.totalTestsAttempted || 0,
            averageAccuracy: statsData.averageAccuracy || 0,
            xp: statsData.gamification?.xp || 0,
            level: statsData.gamification?.level || 1,
          }
        : undefined,
      activeTickets,
    };
  }

  /**
   * Deterministic & Fast Intent Classifier
   */
  private classifyIntent(query: string): {
    intent: string;
    urgency: 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';
    category: TicketCategory;
    isGrievance: boolean;
  } {
    const q = query.toLowerCase();

    if (q.includes('harass') || q.includes('misconduct') || q.includes('inappropriate') || q.includes('abuse') || q.includes('threat')) {
      return { intent: 'GRIEVANCE_SAFETY', urgency: 'URGENT', category: 'GRIEVANCE', isGrievance: true };
    }
    if (q.includes('refund') || q.includes('money back') || q.includes('deducted') || q.includes('charged twice') || q.includes('double charge')) {
      return { intent: 'PAYMENT_DISPUTE', urgency: 'HIGH', category: 'PAYMENT', isGrievance: false };
    }
    if (q.includes('payment') || q.includes('paid') || q.includes('bought') || q.includes('purchase') || q.includes('subscription') || q.includes('order')) {
      return { intent: 'PAYMENT_STATUS', urgency: 'MEDIUM', category: 'PAYMENT', isGrievance: false };
    }
    if (q.includes('course') || q.includes('class') || q.includes('batch') || q.includes('enroll') || q.includes('access')) {
      return { intent: 'COURSE_ACCESS', urgency: 'MEDIUM', category: 'COURSE_ACCESS', isGrievance: false };
    }
    if (q.includes('teacher') || q.includes('instructor') || q.includes('faculty')) {
      return { intent: 'TEACHER_QUERY', urgency: 'MEDIUM', category: 'TEACHER', isGrievance: q.includes('complain') || q.includes('bad') };
    }
    if (q.includes('test') || q.includes('quiz') || q.includes('marks') || q.includes('score') || q.includes('result') || q.includes('accuracy')) {
      return { intent: 'TEST_RESULTS', urgency: 'LOW', category: 'TEST', isGrievance: false };
    }
    if (q.includes('ai') || q.includes('wrong answer') || q.includes('ai tutor') || q.includes('tutor error')) {
      return { intent: 'AI_TUTOR_ISSUE', urgency: 'LOW', category: 'AI_TUTOR', isGrievance: false };
    }
    if (q.includes('video') || q.includes('audio') || q.includes('not loading') || q.includes('slow') || q.includes('bug') || q.includes('error') || q.includes('crash')) {
      return { intent: 'TECHNICAL_ISSUE', urgency: 'HIGH', category: 'TECHNICAL', isGrievance: false };
    }
    if (q.includes('human') || q.includes('agent') || q.includes('real person') || q.includes('speak to') || q.includes('call support')) {
      return { intent: 'HUMAN_SUPPORT', urgency: 'HIGH', category: 'OTHER', isGrievance: false };
    }
    if (q.includes('password') || q.includes('email') || q.includes('phone') || q.includes('otp') || q.includes('profile') || q.includes('account')) {
      return { intent: 'ACCOUNT_MANAGEMENT', urgency: 'LOW', category: 'ACCOUNT', isGrievance: false };
    }

    return { intent: 'GENERAL_SUPPORT', urgency: 'LOW', category: 'OTHER', isGrievance: false };
  }

  /**
   * Main Authenticated Query Processing Pipeline
   */
  async processHelpQuery(userId: string, dto: AuthenticatedHelpQueryDTO): Promise<AuthenticatedHelpResponseDTO> {
    const studentContext = await this.resolveStudentContext(userId);
    const classification = this.classifyIntent(dto.query);

    // Build data chips from real state to ground the UI
    const dataChips: AuthenticatedHelpResponseDTO['dataChips'] = [];
    const suggestedActions: AuthenticatedHelpResponseDTO['suggestedActions'] = [];

    // Add relevant context chips depending on intent
    if (classification.intent.startsWith('PAYMENT')) {
      studentContext.recentOrders.forEach((o) => {
        dataChips.push({
          type: 'PAYMENT',
          title: `Order #${o.orderId.slice(0, 10)}`,
          subtitle: `₹${o.amount} • ${o.planId || 'Course'}`,
          status: o.status,
          meta: o,
        });
      });
      suggestedActions.push({ label: 'View Payment Details', action: 'VIEW_ORDER' });
      suggestedActions.push({ label: 'Create Billing Ticket', action: 'CREATE_TICKET', payload: { category: 'PAYMENT' } });
    } else if (classification.intent.startsWith('COURSE')) {
      studentContext.enrollments.forEach((e) => {
        dataChips.push({
          type: 'ENROLLMENT',
          title: e.className,
          subtitle: `Subject: ${e.subject || 'General'}`,
          status: e.state.toUpperCase(),
          meta: e,
        });
      });
      suggestedActions.push({ label: 'Go to My Classes', action: 'VIEW_COURSE' });
      suggestedActions.push({ label: 'Report Access Issue', action: 'CREATE_TICKET', payload: { category: 'COURSE_ACCESS' } });
    } else if (classification.intent.startsWith('TEST')) {
      if (studentContext.stats) {
        dataChips.push({
          type: 'TEST',
          title: `${studentContext.stats.totalTestsAttempted} Tests Completed`,
          subtitle: `Avg. Accuracy: ${studentContext.stats.averageAccuracy}% • Level ${studentContext.stats.level}`,
          status: 'VERIFIED',
        });
      }
      suggestedActions.push({ label: 'Open Test Center', action: 'VIEW_TEST' });
    }

    if (studentContext.activeTickets.length > 0) {
      studentContext.activeTickets.slice(0, 2).forEach((t) => {
        dataChips.push({
          type: 'TICKET',
          title: `${t.ticketCode}: ${t.subject}`,
          subtitle: `Category: ${t.category}`,
          status: t.status,
          meta: t,
        });
      });
      suggestedActions.push({ label: 'View My Requests', action: 'VIEW_TICKETS' });
    }

    // Prepare System Prompt for LLM with Grounded Context
    const systemPrompt = `You are the Sadhya Personal AI Support & Academic Helpdesk Assistant for authenticated students.
You are assisting ${studentContext.name} (User ID: ${studentContext.userId}).

AUTHENTICATED STUDENT CONTEXT (VERIFIED LIVE FROM FIRESTORE):
- Student Name: ${studentContext.name}
- Email: ${studentContext.email || 'Not set'}
- Academic Goal: ${studentContext.profile?.goal || 'Not specified'} (Stream: ${studentContext.profile?.stream || 'N/A'}, Board: ${studentContext.profile?.board || 'N/A'})
- Active Enrolled Classes (${studentContext.enrollments.length}): ${JSON.stringify(studentContext.enrollments)}
- Recent Payment Orders (${studentContext.recentOrders.length}): ${JSON.stringify(studentContext.recentOrders)}
- Test Performance: ${JSON.stringify(studentContext.stats || 'None')}
- Active Support Requests (${studentContext.activeTickets.length}): ${JSON.stringify(studentContext.activeTickets)}

MASTER PLATFORM POLICIES & GUIDANCE:
${SADHYA_MASTER_KNOWLEDGE}

CRITICAL OPERATIONAL RULES:
1. ALWAYS use the student's actual account data above. NEVER guess or hallucinate enrollments or payments.
2. If the student has a paid order but enrollment is not active, acknowledge the specific Order ID and explain that you can create an instant support ticket for activation.
3. For refunds: explain the policy clearly (7-day evaluation window). If they request a refund, offer to create an official refund request ticket. NEVER promise a refund yourself.
4. For grievances (teacher misconduct, harassment, serious errors): acknowledge with empathy, prioritize urgency, and guide them to submit a formal grievance.
5. If the user asks for a human agent: respond warmly and immediately provide human support escalation.

RESPONSE STRUCTURE & AESTHETICS:
- Deliver a clear, helpful, and personalized answer.
- Always include a "### 📌 Key Takeaways" section highlighting 2-3 essential points in bullet format.
- If the question involves an action, guide, or troubleshooting, provide a "### 🛠️ Recommended Action Steps" section with clear numbered steps.
- Conclude gracefully with a brief check: "Did this resolve what you were looking for? Feel free to check the related topics below or let me know if you need further help!"
- Use clean Markdown with bold keywords and bullet markers.`;

    const userMessage = dto.query;
    let reply = '';

    try {
      const res = await this.geminiProvider.generateResponse(
        [
          ...(dto.history || []).map((h) => ({
            role: (h.role === 'assistant' ? 'ai' : h.role) as 'user' | 'ai' | 'system',
            content: h.content,
            timestamp: h.timestamp || Date.now(),
          })),
          { role: 'user' as const, content: userMessage, timestamp: Date.now() },
        ],
        systemPrompt
      );
      reply = res.reply;
    } catch (err) {
      logger.warn('[StudentSupportService] Gemini failed, falling back to Groq', err);
      try {
        const res = await this.groqProvider.generateResponse(
          [
            ...(dto.history || []).map((h) => ({
              role: (h.role === 'assistant' ? 'ai' : h.role) as 'user' | 'ai' | 'system',
              content: h.content,
              timestamp: h.timestamp || Date.now(),
            })),
            { role: 'user' as const, content: userMessage, timestamp: Date.now() },
          ],
          systemPrompt
        );
        reply = res.reply;
      } catch (fallbackErr) {
        logger.error('[StudentSupportService] All LLM providers failed', fallbackErr);
        reply = `Hi ${studentContext.name}, I checked your account records. For immediate assistance with your query, please explore the action buttons and related topics below.`;
      }
    }

    // Always provide contact support as fallback
    if (!suggestedActions.some((a) => a.action === 'CONTACT_SUPPORT')) {
      suggestedActions.push({ label: 'Contact Human Support', action: 'CONTACT_SUPPORT' });
    }

    // Contextual related queries
    let relatedQueries: string[] = [];
    if (classification.intent.startsWith('COURSE')) {
      relatedQueries = [
        'Which subjects are included in my batch?',
        'How do I join a live class session?',
        'Where can I find class notes & assignments?',
      ];
    } else if (classification.intent.startsWith('PAYMENT') || classification.intent.startsWith('REFUND')) {
      relatedQueries = [
        'How does the 7-day refund policy work?',
        'What features are included in Sadhya Pro?',
        'How do I download tax invoices for my orders?',
      ];
    } else if (classification.intent.startsWith('TEST')) {
      relatedQueries = [
        'How are test accuracy & percentiles calculated?',
        'How do I take a chapter-wise adaptive test?',
        'Can I review solutions for my completed tests?',
      ];
    } else if (classification.intent.startsWith('AI_TUTOR')) {
      relatedQueries = [
        'How does the AI Podcast Studio work?',
        'How can I upload custom PDF notes for AI analysis?',
        'How do I report an inaccurate AI answer?',
      ];
    } else if (classification.intent.startsWith('TECHNICAL')) {
      relatedQueries = [
        'What to do if video playback is buffering?',
        'How do I clear app cache and sync my data?',
        'How to report a platform bug or issue?',
      ];
    } else if (classification.isGrievance) {
      relatedQueries = [
        'How long does grievance review usually take?',
        'Can I submit screenshots with my ticket?',
        'How do I track ticket updates in My Requests?',
      ];
    } else {
      relatedQueries = [
        'Tell me about AI Study Groups & Circles',
        'How do referral rewards & free Pro days work?',
        'How do I update my target exam & class level?',
      ];
    }

    return {
      reply,
      intent: classification.intent,
      confidence: 0.95,
      urgency: classification.urgency,
      dataChips: dataChips.slice(0, 4),
      suggestedActions: suggestedActions.slice(0, 4),
      relatedQueries,
    };
  }

  /**
   * Creates a formal support or grievance ticket with automatic AI triage
   */
  async createTicket(userId: string, dto: CreateTicketDTO): Promise<SupportTicket> {
    const studentContext = await this.resolveStudentContext(userId);

    const ticket = await supportTicketRepository.create(
      userId,
      {
        displayName: studentContext.name,
        email: studentContext.email,
        role: 'student',
      },
      dto
    );

    // Run AI Triage asynchronously in background
    this.runAiTriage(ticket, studentContext).catch((e) => {
      logger.warn('[StudentSupportService] AI triage failed', e);
    });

    return ticket;
  }

  /**
   * Generates AI summary and auto-triage for support agents
   */
  private async runAiTriage(ticket: SupportTicket, context: VerifiedStudentContext): Promise<void> {
    const prompt = `You are the Support Triage AI for Sadhya EdTech.
Analyze this newly created support request:
- Ticket Code: ${ticket.ticketCode}
- Student: ${context.name} (${context.userId})
- Category: ${ticket.category}
- Priority: ${ticket.priority}
- Subject: ${ticket.subject}
- Description: ${ticket.description}
- Relevant Enrollments: ${JSON.stringify(context.enrollments)}
- Relevant Orders: ${JSON.stringify(context.recentOrders)}

Generate a concise 2-sentence summary for the human support agent, highlighting the root issue, student context, and immediate recommended action.`;

    try {
      const res = await this.geminiProvider.generateResponse(
        [{ role: 'user', content: prompt, timestamp: Date.now() }],
        'You are an expert support triage assistant.'
      );
      await supportTicketRepository.updateAiSummary(ticket.id, res.reply, {
        intent: ticket.category,
        confidence: 0.98,
        urgency: ticket.priority,
        suggestedCategory: ticket.category,
      });
    } catch (err) {
      logger.warn('[StudentSupportService] Failed to generate AI summary for ticket', err);
    }
  }

  /**
   * Appends student or agent reply to a ticket
   */
  async addTicketMessage(userId: string, ticketId: string, content: string, attachments?: any[]): Promise<SupportTicket> {
    const studentContext = await this.resolveStudentContext(userId);
    return supportTicketRepository.addMessage(
      userId,
      ticketId,
      { displayName: studentContext.name, role: 'student' },
      { content, attachments }
    );
  }

  /**
   * Retrieves all tickets for authenticated student
   */
  async getStudentTickets(userId: string, status?: string): Promise<SupportTicket[]> {
    return supportTicketRepository.listByUser(userId, status);
  }

  /**
   * Retrieves single ticket for student
   */
  async getTicketById(userId: string, ticketId: string): Promise<SupportTicket | null> {
    return supportTicketRepository.getById(userId, ticketId);
  }
}

export const studentSupportService = new StudentSupportService();
