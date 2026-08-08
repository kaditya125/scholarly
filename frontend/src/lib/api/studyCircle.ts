import { api } from './client';

export type CircleKnowledgeSource = 'note' | 'resource' | 'summary' | 'message';

export interface CircleKnowledgeItem {
  id: string;
  groupId: string;
  title?: string;
  text: string;
  source: CircleKnowledgeSource;
  addedBy: string;
  addedByName?: string;
  createdAt: number;
  updatedAt?: number;
}

export interface CircleChatTurn {
  id: string;
  groupId: string;
  askedBy: string;
  askedByName?: string;
  question: string;
  answer: string;
  createdAt: number;
}

export interface CircleConcept {
  id: string;
  groupId: string;
  label: string;
  definition: string;
  importance: number;
  mentions: number;
  relatedConceptIds: string[];
  createdAt: number;
  updatedAt: number;
}

/**
 * AI Study Circle REST surface (knowledge base + shared conversation log). The streaming `ask`
 * endpoint is consumed directly via fetch in the useStudyCircle hook, since it returns SSE.
 */
export const studyCircleApi = {
  async listKnowledge(groupId: string): Promise<CircleKnowledgeItem[]> {
    const { data } = await api.get(`/study-groups/${groupId}/circle/knowledge`);
    return data.items;
  },
  async addKnowledge(
    groupId: string,
    input: { text: string; title?: string; source?: CircleKnowledgeSource }
  ): Promise<CircleKnowledgeItem> {
    const { data } = await api.post(`/study-groups/${groupId}/circle/knowledge`, input);
    return data.item;
  },
  async deleteKnowledge(groupId: string, itemId: string): Promise<void> {
    await api.delete(`/study-groups/${groupId}/circle/knowledge/${itemId}`);
  },
  async chatLog(groupId: string): Promise<CircleChatTurn[]> {
    const { data } = await api.get(`/study-groups/${groupId}/circle/chat`);
    return data.turns;
  },
  async getGraph(groupId: string): Promise<CircleConcept[]> {
    const { data } = await api.get(`/study-groups/${groupId}/circle/graph`);
    return data.concepts;
  },
  async synthesizeGraph(groupId: string): Promise<CircleConcept[]> {
    const { data } = await api.post(`/study-groups/${groupId}/circle/graph/synthesize`);
    return data.concepts;
  },
};
