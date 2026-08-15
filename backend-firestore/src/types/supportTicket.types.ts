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
  ticketCode: string; // e.g. SCH-2026-10482
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

export interface CreateTicketDTO {
  category: TicketCategory;
  subject: string;
  description: string;
  priority?: TicketPriority;
  relatedCourseId?: string;
  relatedCourseName?: string;
  relatedOrderId?: string;
  relatedTestId?: string;
  attachments?: TicketAttachment[];
  initialMessage?: string;
}

export interface AddTicketMessageDTO {
  content: string;
  attachments?: TicketAttachment[];
}

export interface AuthenticatedHelpQueryDTO {
  query: string;
  sessionId?: string;
  history?: Array<{
    role: 'user' | 'assistant' | 'system';
    content: string;
    timestamp?: number;
  }>;
  contextOverride?: {
    source?: 'COURSE' | 'PAYMENT' | 'TEST' | 'GENERAL';
    courseId?: string;
    orderId?: string;
    testId?: string;
  };
}

export interface AuthenticatedHelpResponseDTO {
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
