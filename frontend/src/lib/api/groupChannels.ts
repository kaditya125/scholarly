import { api } from './client';
import { Attachment } from './uploads';

export type { Attachment };

export interface GroupChannel {
  id: string;
  groupId: string;
  name: string;
  description?: string;
  isDefault: boolean;
  createdBy: string;
  createdAt: number;
  updatedAt: number;
  lastMessage?: { text: string; senderId: string; createdAt: number };
  lastMessageAt: number;
  unread: boolean;
}

export interface GroupChannelMessage {
  id: string;
  groupId: string;
  channelId: string;
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

export interface ChannelSender {
  uid: string;
  displayName: string;
  photoURL?: string;
}

export interface ChannelMessagesPage {
  messages: GroupChannelMessage[];
  hasMore: boolean;
  senders: Record<string, ChannelSender>;
}

/** Group channels + channel messages. Nested under a study group; caller must be a member. */
export const groupChannelsApi = {
  async list(groupId: string): Promise<GroupChannel[]> {
    const { data } = await api.get(`/study-groups/${groupId}/channels`);
    return data;
  },
  async create(groupId: string, name: string, description?: string): Promise<GroupChannel> {
    const { data } = await api.post(`/study-groups/${groupId}/channels`, { name, description });
    return data;
  },
  async rename(
    groupId: string,
    channelId: string,
    patch: { name?: string; description?: string }
  ): Promise<GroupChannel> {
    const { data } = await api.patch(`/study-groups/${groupId}/channels/${channelId}`, patch);
    return data;
  },
  async remove(groupId: string, channelId: string): Promise<void> {
    await api.delete(`/study-groups/${groupId}/channels/${channelId}`);
  },
  async messages(
    groupId: string,
    channelId: string,
    opts?: { before?: number; limit?: number }
  ): Promise<ChannelMessagesPage> {
    const { data } = await api.get(`/study-groups/${groupId}/channels/${channelId}/messages`, {
      params: opts,
    });
    return data;
  },
  async send(
    groupId: string,
    channelId: string,
    text: string,
    attachments?: Attachment[],
    replyToId?: string
  ): Promise<GroupChannelMessage> {
    const { data } = await api.post(`/study-groups/${groupId}/channels/${channelId}/messages`, {
      text,
      attachments,
      replyToId,
    });
    return data;
  },
  async editMessage(
    groupId: string,
    channelId: string,
    messageId: string,
    text: string
  ): Promise<GroupChannelMessage> {
    const { data } = await api.patch(
      `/study-groups/${groupId}/channels/${channelId}/messages/${messageId}`,
      { text }
    );
    return data;
  },
  async removeMessage(groupId: string, channelId: string, messageId: string): Promise<void> {
    await api.delete(`/study-groups/${groupId}/channels/${channelId}/messages/${messageId}`);
  },
  async pin(
    groupId: string,
    channelId: string,
    messageId: string,
    pinned: boolean
  ): Promise<GroupChannelMessage> {
    const { data } = await api.post(
      `/study-groups/${groupId}/channels/${channelId}/messages/${messageId}/pin`,
      { pinned }
    );
    return data;
  },
  async pins(
    groupId: string,
    channelId: string
  ): Promise<{ messages: GroupChannelMessage[]; senders: Record<string, ChannelSender> }> {
    const { data } = await api.get(`/study-groups/${groupId}/channels/${channelId}/pins`);
    return data;
  },
  async markRead(groupId: string, channelId: string): Promise<void> {
    await api.post(`/study-groups/${groupId}/channels/${channelId}/read`);
  },
  /** Toggle an emoji reaction on a channel message. */
  async react(
    groupId: string,
    channelId: string,
    messageId: string,
    emoji: string
  ): Promise<GroupChannelMessage> {
    const { data } = await api.post(
      `/study-groups/${groupId}/channels/${channelId}/messages/${messageId}/react`,
      { emoji }
    );
    return data;
  },
};
