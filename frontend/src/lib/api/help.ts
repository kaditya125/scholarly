import { api } from './client';

export interface PolicyLink {
  title: string;
  url: string;
  description?: string;
}

export interface StructuredResponse {
  type: 'text' | 'feature_list' | 'feature_cards' | 'cta' | 'error';
  text?: string;
  features?: string[];
  cards?: { title: string; description: string; icon?: string }[];
  cta?: { label: string; url: string; type: 'primary' | 'secondary' };
  policyLinks?: PolicyLink[];
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

export async function askHelpQuery(
  sessionId: string, 
  query: string,
  history?: { role: 'user' | 'assistant'; content: string }[]
): Promise<HelpResponse> {
  const { data } = await api.post<HelpResponse>('/help/ask', { sessionId, query, history });
  return data;
}

export async function sendSupportAgentMessage(
  sessionId: string,
  message: string,
  agentName: string = 'Sarah Chen',
  contextSummary?: string,
  history?: { role: string; content: string }[]
): Promise<{ reply: string }> {
  const { data } = await api.post<{ reply: string }>('/help/agent-chat', {
    sessionId,
    message,
    agentName,
    contextSummary,
    history
  });
  return data;
}
