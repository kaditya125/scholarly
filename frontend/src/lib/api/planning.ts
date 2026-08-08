/**
 * Planning API Client
 *
 * API functions for conversational planning sessions. The backend expects
 * userId in the body and uses `messageType`/`content` field naming, while the
 * frontend hooks send a normalized `responseType` + `data` payload. This
 * client bridges the two shapes so callers can stay clean.
 */

import { api } from './client';
import { auth } from '../firebase';
import type {
  PlanningSession,
  ConversationMessage,
} from '../../types/workspace.types';

export interface StartPlanningRequest {
  projectType: 'podcast' | 'video' | 'article';
  initialPrompt: string;
  notebookId?: string;
}

export interface StartPlanningResponse {
  sessionId: string;
  messages: ConversationMessage[];
  status: string;
}

export interface RespondToPlanningRequest {
  sessionId: string;
  responseType:
    | 'clarification_response'
    | 'text_message'
    | 'accept_recommendations'
    | 'approve_plan'
    | 'modify_plan'
    | 'regenerate_plan';
  data?: any;
}

export interface RespondToPlanningResponse {
  messages: ConversationMessage[];
  status: string;
  readyToGenerate?: boolean;
  planId?: string;
}

export interface PlanningSessionResponse {
  session: PlanningSession;
}

export interface UserPlanningSessionsResponse {
  sessions: PlanningSession[];
}

/**
 * Read the Firebase uid so we can put it in the request body. The auth
 * interceptor already attaches the Bearer token; the backend also expects the
 * uid inline for its planning endpoints.
 */
function getUserId(): string {
  const uid = auth.currentUser?.uid;
  if (!uid) {
    throw new Error('You must be signed in to start a planning session.');
  }
  return uid;
}

/**
 * Translate a frontend responseType into the backend's messageType payload.
 * Anything without a direct backend equivalent (accept_recommendations,
 * modify_plan, regenerate_plan) is sent as a plain text message so the
 * conversation keeps flowing rather than hard-erroring.
 */
function toBackendResponsePayload(
  req: RespondToPlanningRequest,
  userId: string
): Record<string, any> {
  const base = { sessionId: req.sessionId, userId };

  switch (req.responseType) {
    case 'text_message':
      return {
        ...base,
        messageType: 'text',
        content: req.data?.message ?? '',
      };

    case 'clarification_response':
      return {
        ...base,
        messageType: 'clarification_response',
        clarificationResponse: {
          questionId: req.data?.questionId,
          optionId: req.data?.optionId,
          customValue: req.data?.customValue,
        },
      };

    case 'approve_plan':
      return {
        ...base,
        messageType: 'plan_approval',
        planApproval: {
          approved: true,
          modifications: req.data?.modifications,
        },
      };

    case 'modify_plan':
      return {
        ...base,
        messageType: 'plan_approval',
        planApproval: {
          approved: false,
          modifications: req.data?.modifications ?? {},
        },
      };

    case 'regenerate_plan':
      return {
        ...base,
        messageType: 'text',
        content: 'Please regenerate the lesson plan.',
      };

    case 'accept_recommendations':
      return {
        ...base,
        messageType: 'text',
        content: 'Accept the recommendations and continue.',
      };

    default:
      return {
        ...base,
        messageType: 'text',
        content: req.data?.message ?? '',
      };
  }
}

/** Normalize backend field names to what the frontend hooks and UI expect. */
function normalizeStartResponse(raw: any): StartPlanningResponse {
  return {
    sessionId: raw?.sessionId,
    messages: raw?.messages ?? [],
    status: raw?.status ?? raw?.currentStage ?? 'in_progress',
  };
}

function normalizeRespondResponse(raw: any): RespondToPlanningResponse {
  return {
    messages: raw?.messages ?? [],
    status: raw?.status ?? raw?.currentStage ?? 'in_progress',
    readyToGenerate: raw?.readyToGenerate,
    planId: raw?.planId,
  };
}

export const planningApi = {
  /**
   * Start a new planning session with an initial prompt.
   */
  async start(req: StartPlanningRequest): Promise<StartPlanningResponse> {
    const userId = getUserId();
    const res = await api.post('/planning/start', { ...req, userId });
    return normalizeStartResponse(res.data);
  },

  /**
   * Respond to the AI during a planning conversation.
   */
  async respond(req: RespondToPlanningRequest): Promise<RespondToPlanningResponse> {
    const userId = getUserId();
    const body = toBackendResponsePayload(req, userId);
    const res = await api.post('/planning/respond', body);
    return normalizeRespondResponse(res.data);
  },

  /**
   * Get a specific planning session by ID.
   */
  async getSession(sessionId: string): Promise<PlanningSessionResponse> {
    const userId = getUserId();
    const res = await api.get(`/planning/${sessionId}`, { params: { userId } });
    return res.data;
  },

  /**
   * Get all planning sessions for the current user.
   */
  async getUserSessions(userId: string): Promise<UserPlanningSessionsResponse> {
    const res = await api.get(`/planning/user/${userId}`);
    return res.data;
  },

  /**
   * Cancel/delete a planning session.
   */
  async cancelSession(sessionId: string): Promise<void> {
    const userId = getUserId();
    await api.delete(`/planning/${sessionId}`, { data: { userId } });
  },
};
