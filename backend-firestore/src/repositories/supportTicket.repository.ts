import { db } from '../config/firebase';
import {
  SupportTicket,
  CreateTicketDTO,
  AddTicketMessageDTO,
  TicketStatus,
  TicketPriority,
  TicketMessage,
} from '../types/supportTicket.types';

export class SupportTicketRepository {
  private collection = db.collection('support_tickets');

  /**
   * Generates a unique, human-readable ticket code e.g. SCH-2026-10482
   */
  private generateTicketCode(): string {
    const year = new Date().getFullYear();
    const randomSeq = Math.floor(10000 + Math.random() * 90000);
    return `SCH-${year}-${randomSeq}`;
  }

  /**
   * Creates a new support ticket for an authenticated student
   */
  async create(userId: string, userDetails: { displayName: string; email?: string; role?: string }, dto: CreateTicketDTO): Promise<SupportTicket> {
    const ticketId = `ticket_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const ticketCode = this.generateTicketCode();
    const now = Date.now();

    const initialMessages: TicketMessage[] = [];
    if (dto.initialMessage || dto.description) {
      initialMessages.push({
        id: `msg_init_${now}`,
        senderId: userId,
        senderName: userDetails.displayName || 'Student',
        senderRole: 'student',
        content: dto.initialMessage || dto.description,
        attachments: dto.attachments || [],
        createdAt: now,
      });
    }

    const ticket: SupportTicket = {
      id: ticketId,
      ticketCode,
      userId,
      userEmail: userDetails.email,
      userName: userDetails.displayName || 'Student',
      userRole: userDetails.role || 'student',
      category: dto.category,
      subject: dto.subject,
      description: dto.description,
      priority: dto.priority || 'MEDIUM',
      status: 'OPEN',
      relatedCourseId: dto.relatedCourseId,
      relatedCourseName: dto.relatedCourseName,
      relatedOrderId: dto.relatedOrderId,
      relatedTestId: dto.relatedTestId,
      messages: initialMessages,
      attachments: dto.attachments || [],
      createdAt: now,
      updatedAt: now,
    };

    await this.collection.doc(ticketId).set(ticket);
    return ticket;
  }

  /**
   * Lists tickets for the authenticated user, strictly scoped to userId
   */
  async listByUser(userId: string, status?: string): Promise<SupportTicket[]> {
    let query: FirebaseFirestore.Query = this.collection
      .where('userId', '==', userId)
      .orderBy('updatedAt', 'desc');

    if (status && status !== 'all') {
      query = query.where('status', '==', status);
    }

    const snap = await query.limit(50).get();
    return snap.docs.map((doc) => doc.data() as SupportTicket);
  }

  /**
   * Retrieves a single ticket by ID, ensuring user owns it or has admin privileges
   */
  async getById(userId: string, ticketId: string, isAdmin: boolean = false): Promise<SupportTicket | null> {
    const doc = await this.collection.doc(ticketId).get();
    if (!doc.exists) return null;

    const data = doc.data() as SupportTicket;
    if (!isAdmin && data.userId !== userId) {
      throw new Error('FORBIDDEN: You do not have permission to view this ticket.');
    }

    return data;
  }

  /**
   * Appends a message to a ticket conversation
   */
  async addMessage(
    userId: string,
    ticketId: string,
    senderDetails: { displayName: string; role: 'student' | 'agent' | 'ai' | 'system' },
    dto: AddTicketMessageDTO,
    isAdmin: boolean = false
  ): Promise<SupportTicket> {
    const ticket = await this.getById(userId, ticketId, isAdmin);
    if (!ticket) {
      throw new Error('Ticket not found');
    }

    const now = Date.now();
    const newMessage: TicketMessage = {
      id: `msg_${now}_${Math.random().toString(36).slice(2, 6)}`,
      senderId: userId,
      senderName: senderDetails.displayName,
      senderRole: senderDetails.role,
      content: dto.content,
      attachments: dto.attachments || [],
      createdAt: now,
    };

    const updatedMessages = [...(ticket.messages || []), newMessage];
    const newStatus: TicketStatus =
      senderDetails.role === 'student' && ticket.status === 'WAITING_FOR_STUDENT'
        ? 'IN_PROGRESS'
        : ticket.status;

    await this.collection.doc(ticketId).update({
      messages: updatedMessages,
      status: newStatus,
      updatedAt: now,
    });

    return {
      ...ticket,
      messages: updatedMessages,
      status: newStatus,
      updatedAt: now,
    };
  }

  /**
   * Updates status of ticket (e.g. RESOLVED, CLOSED, IN_PROGRESS)
   */
  async updateStatus(ticketId: string, status: TicketStatus, resolvedAt?: number): Promise<void> {
    const updatePayload: Record<string, any> = {
      status,
      updatedAt: Date.now(),
    };
    if (resolvedAt !== undefined) {
      updatePayload.resolvedAt = resolvedAt;
    }
    await this.collection.doc(ticketId).update(updatePayload);
  }

  /**
   * Updates AI summary and triage metadata
   */
  async updateAiSummary(ticketId: string, summary: string, classification?: any): Promise<void> {
    await this.collection.doc(ticketId).update({
      aiSummary: summary,
      aiClassification: classification,
      updatedAt: Date.now(),
    });
  }

  /**
   * List all tickets (Admin only)
   */
  async listAllForAdmin(status?: string, category?: string, limit: number = 50): Promise<SupportTicket[]> {
    let query: FirebaseFirestore.Query = this.collection.orderBy('updatedAt', 'desc');

    if (status && status !== 'all') {
      query = query.where('status', '==', status);
    }
    if (category && category !== 'all') {
      query = query.where('category', '==', category);
    }

    const snap = await query.limit(limit).get();
    return snap.docs.map((doc) => doc.data() as SupportTicket);
  }
}

export const supportTicketRepository = new SupportTicketRepository();
