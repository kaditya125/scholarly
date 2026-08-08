import { api } from './client';
import { Attachment } from './uploads';

export type { Attachment };

export interface DmMessage {
  id: string;
  conversationId: string;
  senderId: string;
  text: string;
  attachments?: Attachment[];
  reactions?: Record<string, string[]>;
  replyTo?: { id: string; senderId: string; text: string };
  editedAt?: number;
  deleted?: boolean;
  pinned?: boolean;
  pinnedAt?: number;
  pinnedBy?: string;
  createdAt: number;
}

export interface ConversationSummary {
  id: string;
  peer: { uid: string; displayName: string; photoURL?: string };
  lastMessage?: { text: string; senderId: string; createdAt: number };
  unread: number;
  updatedAt: number;
}

export interface ConversationThread {
  id: string;
  peer: { uid: string; displayName: string; photoURL?: string; email?: string };
  messages: DmMessage[];
  hasMore: boolean;
  peerLastReadAt?: number;
}

/**
 * Direct-messaging API. The Firebase token is attached automatically by the axios interceptor, so
 * the caller is always the authenticated user; the peer is addressed by uid in the path.
 */
export const dmApi = {
  /** The caller's conversations, newest activity first. */
  async conversations(): Promise<ConversationSummary[]> {
    const { data } = await api.get('/dm/conversations');
    return data;
  },
  /** Total unread messages across all conversations. */
  async unread(): Promise<number> {
    const { data } = await api.get('/dm/unread');
    return data?.count ?? 0;
  },
  /** The thread with a peer (opens/creates it). Pass `before` to page older messages. */
  async thread(otherId: string, opts?: { before?: number; limit?: number }): Promise<ConversationThread> {
    const { data } = await api.get(`/dm/conversations/${otherId}`, { params: opts });
    return data;
  },
  async send(
    otherId: string,
    text: string,
    attachments?: Attachment[],
    replyToId?: string
  ): Promise<DmMessage> {
    const { data } = await api.post(`/dm/conversations/${otherId}/messages`, {
      text,
      attachments,
      replyToId,
    });
    return data;
  },
  async edit(otherId: string, messageId: string, text: string): Promise<DmMessage> {
    const { data } = await api.patch(`/dm/conversations/${otherId}/messages/${messageId}`, { text });
    return data;
  },
  async remove(otherId: string, messageId: string): Promise<void> {
    await api.delete(`/dm/conversations/${otherId}/messages/${messageId}`);
  },
  async pin(otherId: string, messageId: string, pinned: boolean): Promise<DmMessage> {
    const { data } = await api.post(`/dm/conversations/${otherId}/messages/${messageId}/pin`, {
      pinned,
    });
    return data;
  },
  async pins(otherId: string): Promise<DmMessage[]> {
    const { data } = await api.get(`/dm/conversations/${otherId}/pins`);
    return data;
  },
  async markRead(otherId: string): Promise<void> {
    await api.post(`/dm/conversations/${otherId}/read`);
  },
  /** Toggle an emoji reaction on a message. */
  async react(otherId: string, messageId: string, emoji: string): Promise<DmMessage> {
    const { data } = await api.post(
      `/dm/conversations/${otherId}/messages/${messageId}/react`,
      { emoji }
    );
    return data;
  },
};
