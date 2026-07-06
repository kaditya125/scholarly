import { api } from './client';

export interface Room {
  id: string | number;
  name: string;
  icon: string;
}

export interface DiscussionMessage {
  id: string | number;
  author?: string;
  role?: string;
  avatar?: string;
  time?: string;
  content?: string;
  likes?: number;
  chapter?: string;
  topic?: string;
  aiAssisted?: boolean;
  title?: string;
  description?: string;
  participants?: string[];
  replies?: number;
  views?: number;
  aiSummary?: string;
  similarThreadIds?: string[];
  createdAt?: number;
}

export const discussionsApi = {
  async getRooms(): Promise<Room[]> {
    const response = await api.get('/rooms');
    return response.data;
  },
  
  async getDiscussions(): Promise<DiscussionMessage[]> {
    const response = await api.get('/discussions');
    return response.data;
  },
  
  async sendMessage(roomId: string | number, content: string): Promise<void> {
    await api.post(`/discussions/${roomId}/messages`, { content });
  }
};
