/**
 * Group channel types (Phase 1 — text channels inside a study group).
 *
 * Collections (nested under a group):
 *   - studyGroups/{groupId}/channels/{channelId}                     a text channel
 *   - studyGroups/{groupId}/channels/{channelId}/messages/{id}       append-only message log
 *   - studyGroups/{groupId}/reads/{uid}                              per-user read state (channelId -> ts)
 */

import { Attachment } from './attachment.types';

export interface GroupChannel {
  id: string;
  groupId: string;
  name: string;
  description?: string;
  isDefault: boolean;          // the #general channel every group starts with
  createdBy: string;
  createdAt: number;
  updatedAt: number;
  lastMessage?: { text: string; senderId: string; createdAt: number };
  lastMessageAt: number;       // 0 when empty; drives unread + ordering
  reactionsUpdatedAt?: number; // bumped on any reaction so realtime listeners refetch
}

export interface GroupChannelMessage {
  id: string;
  groupId: string;
  channelId: string;
  senderId: string;
  text: string;
  attachments?: Attachment[];
  reactions?: Record<string, string[]>; // emoji -> uids who reacted
  replyTo?: { id: string; senderId: string; text: string }; // quoted message preview
  editedAt?: number;
  deleted?: boolean;
  pinned?: boolean;
  pinnedAt?: number;
  pinnedBy?: string;
  createdAt: number;
}

/** A channel decorated with the caller's unread flag (list view). */
export interface ChannelView extends GroupChannel {
  unread: boolean;
}

/** Minimal sender identity for rendering messages (covers members and ex-members). */
export interface ChannelSender {
  uid: string;
  displayName: string;
  photoURL?: string;
}

/** A page of channel messages (ascending) plus the identities of everyone who sent them. */
export interface ChannelMessagesPage {
  messages: GroupChannelMessage[];
  hasMore: boolean;
  senders: Record<string, ChannelSender>;
}
