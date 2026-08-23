import { Attachment } from './attachment.types';

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

export interface ListSavedMessagesOptions {
  q?: string;
  category?: string;
  before?: number;
  limit?: number;
}
