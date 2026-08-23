import { savedMessageRepository } from '../repositories/savedMessage.repository';
import { SavedMessageItem, ListSavedMessagesOptions } from '../types/savedMessage.types';

export class SavedMessageService {
  async saveMessage(
    uid: string,
    payload: {
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
      attachments?: any[];
      messageCreatedAt: number;
      category?: 'all' | 'solution' | 'audio' | 'diagram' | 'file';
      note?: string;
    }
  ): Promise<SavedMessageItem> {
    if (!payload.messageId) {
      throw new Error('Message ID is required');
    }

    return savedMessageRepository.save(uid, {
      messageId: payload.messageId,
      sourceType: payload.sourceType || 'dm',
      conversationId: payload.conversationId,
      groupId: payload.groupId,
      channelId: payload.channelId,
      groupName: payload.groupName,
      channelName: payload.channelName,
      discussionId: payload.discussionId,
      peerUid: payload.peerUid,
      senderId: payload.senderId,
      senderName: payload.senderName || 'Sender',
      text: (payload.text || '').toString(),
      attachments: Array.isArray(payload.attachments) ? payload.attachments : [],
      messageCreatedAt: payload.messageCreatedAt || Date.now(),
      category: payload.category,
      note: payload.note,
    });
  }

  async removeSavedMessage(uid: string, id: string): Promise<boolean> {
    return savedMessageRepository.remove(uid, id);
  }

  async listSavedMessages(uid: string, opts: ListSavedMessagesOptions = {}): Promise<SavedMessageItem[]> {
    return savedMessageRepository.list(uid, opts);
  }

  async getSavedMessageIds(uid: string): Promise<string[]> {
    return savedMessageRepository.listIds(uid);
  }
}

export const savedMessageService = new SavedMessageService();
