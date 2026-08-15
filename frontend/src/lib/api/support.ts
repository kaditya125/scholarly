import { api } from './client';

export type TicketCategory =
  | 'PAYMENT'
  | 'COURSE_ACCESS'
  | 'TECHNICAL'
  | 'TEACHER'
  | 'AI_TUTOR'
  | 'TEST'
  | 'ACCOUNT'
  | 'GRIEVANCE'
  | 'OTHER';

export type TicketPriority = 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';

export type TicketStatus =
  | 'OPEN'
  | 'IN_PROGRESS'
  | 'WAITING_FOR_STUDENT'
  | 'RESOLVED'
  | 'CLOSED';

export interface TicketAttachment {
  id: string;
  name: string;
  url: string;
  size?: number;
  mimeType?: string;
  uploadedAt: number;
}

export interface TicketMessage {
  id: string;
  senderId: string;
  senderName: string;
  senderRole: 'student' | 'agent' | 'ai' | 'system';
  content: string;
  attachments?: TicketAttachment[];
  createdAt: number;
}

export interface SupportTicket {
  id: string;
  ticketCode: string;
  userId: string;
  userEmail?: string;
  userName: string;
  userRole?: string;

  category: TicketCategory;
  subject: string;
  description: string;
  priority: TicketPriority;
  status: TicketStatus;

  assignedTo?: string;
  assignedAgentName?: string;

  relatedCourseId?: string;
  relatedCourseName?: string;
  relatedOrderId?: string;
  relatedTestId?: string;

  aiSummary?: string;
  aiClassification?: {
    intent: string;
    confidence: number;
    urgency: string;
    suggestedCategory: TicketCategory;
  };

  messages: TicketMessage[];
  attachments?: TicketAttachment[];

  createdAt: number;
  updatedAt: number;
  resolvedAt?: number;
}

export interface CreateTicketInput {
  category: TicketCategory;
  subject: string;
  description: string;
  priority?: TicketPriority;
  relatedCourseId?: string;
  relatedCourseName?: string;
  relatedOrderId?: string;
  relatedTestId?: string;
  attachments?: TicketAttachment[];
}

export interface AuthenticatedHelpResponse {
  reply: string;
  intent: string;
  confidence: number;
  urgency: 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';
  dataChips?: Array<{
    type: 'ENROLLMENT' | 'PAYMENT' | 'TEST' | 'TICKET' | 'PROFILE' | 'POLICY';
    title: string;
    subtitle?: string;
    status?: string;
    meta?: Record<string, any>;
  }>;
  suggestedActions?: Array<{
    label: string;
    action: 'VIEW_COURSE' | 'VIEW_ORDER' | 'VIEW_TEST' | 'CREATE_TICKET' | 'VIEW_TICKETS' | 'CONTACT_SUPPORT' | 'CUSTOM';
    payload?: Record<string, any>;
  }>;
  keyHighlights?: string[];
  solutionSteps?: string[];
  relatedQueries?: string[];
  ticketCreated?: {
    ticketId: string;
    ticketCode: string;
    status: TicketStatus;
  };
}

export const supportApi = {
  /**
   * Sends query to authenticated student AI assistant
   */
  async askStudentHelp(payload: {
    query: string;
    sessionId?: string;
    history?: Array<{ role: 'user' | 'assistant' | 'system'; content: string; timestamp?: number }>;
    contextOverride?: { source?: string; courseId?: string; orderId?: string; testId?: string };
  }): Promise<AuthenticatedHelpResponse> {
    const { data } = await api.post<{ success: boolean; data: AuthenticatedHelpResponse }>('/help/authenticated/chat', payload);
    return data.data;
  },

  /**
   * Lists all tickets belonging to student
   */
  async getTickets(status?: string): Promise<SupportTicket[]> {
    const params = status && status !== 'all' ? `?status=${status}` : '';
    const { data } = await api.get<{ success: boolean; data: SupportTicket[] }>(`/help/tickets${params}`);
    return data.data || [];
  },

  /**
   * Retrieves single ticket by ID
   */
  async getTicket(id: string): Promise<SupportTicket> {
    const { data } = await api.get<{ success: boolean; data: SupportTicket }>(`/help/tickets/${id}`);
    return data.data;
  },

  /**
   * Creates a new support ticket or grievance
   */
  async createTicket(input: CreateTicketInput): Promise<SupportTicket> {
    const { data } = await api.post<{ success: boolean; data: SupportTicket }>('/help/tickets', input);
    return data.data;
  },

  /**
   * Adds reply to an existing ticket
   */
  async addTicketMessage(ticketId: string, content: string, attachments?: TicketAttachment[]): Promise<SupportTicket> {
    const { data } = await api.post<{ success: boolean; data: SupportTicket }>(`/help/tickets/${ticketId}/messages`, {
      content,
      attachments,
    });
    return data.data;
  },

  /**
   * Submits user feedback for AI answer
   */
  async submitFeedback(payload: { messageId?: string; rating: string; comment?: string; category?: string }): Promise<void> {
    await api.post('/help/feedback', payload);
  },
};
