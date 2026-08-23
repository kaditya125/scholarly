import { api } from './client';
import { Attachment } from './uploads';

export interface SavedMessageItem {
  id: string;
  userId: string;
  messageId: string;
  sourceType: 'dm' | 'channel' | 'discussion';
  conversationId?: string;
  groupId?: string;
  channelId?: string;
  groupName?: string;
  channelName?: string;
  discussionId?: string;
  peerUid?: string;
  senderId: string;
  senderName: string;
  text: string;
  attachments?: Attachment[];
  messageCreatedAt: number;
  savedAt: number;
  category?: 'all' | 'solution' | 'audio' | 'diagram' | 'file';
  note?: string;
}

export interface ListSavedMessagesParams {
  q?: string;
  category?: string;
  before?: number;
  limit?: number;
}

export const savedMessagesApi = {
  async list(params?: ListSavedMessagesParams): Promise<SavedMessageItem[]> {
    const { data } = await api.get('/saved-messages', { params });
    return data;
  },

  async ids(): Promise<string[]> {
    const { data } = await api.get('/saved-messages/ids');
    return data;
  },

  async save(payload: {
    messageId: string;
    sourceType: 'dm' | 'channel' | 'discussion';
    conversationId?: string;
    groupId?: string;
    channelId?: string;
    groupName?: string;
    channelName?: string;
    discussionId?: string;
    peerUid?: string;
    senderId: string;
    senderName: string;
    text: string;
    attachments?: Attachment[];
    messageCreatedAt: number;
    category?: 'all' | 'solution' | 'audio' | 'diagram' | 'file';
    note?: string;
  }): Promise<SavedMessageItem> {
    const { data } = await api.post('/saved-messages', payload);
    return data;
  },

  async remove(id: string): Promise<{ success: boolean }> {
    const { data } = await api.delete(`/saved-messages/${id}`);
    return data;
  },
};
