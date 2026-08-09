/**
 * Direct-messaging types (Phase 1 — private 1:1 chat between connected users).
 *
 * Collections:
 *   - dmConversations/{a__b}                 one doc per user pair, id = the two uids sorted + "__"
 *   - dmConversations/{a__b}/messages/{id}   append-only message log (single-field createdAt index)
 */

import { Attachment } from './attachment.types';

/** A single message within a conversation. */
export interface DmMessage {
  id: string;
  conversationId: string;
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

/** The canonical conversation document (one per user pair). */
export interface DmConversation {
  id: string;                 // `${a}__${b}` where [a,b] are the two uids sorted
  users: string[];            // sorted [uidA, uidB] — enables array-contains membership queries
  createdAt: number;
  updatedAt: number;          // last activity (last message time); drives list ordering
  lastMessage?: { text: string; senderId: string; createdAt: number };
  unread: Record<string, number>;   // uid -> count of messages the user hasn't read
  lastReadAt?: Record<string, number>;
  reactionsUpdatedAt?: number;      // bumped on any reaction so realtime listeners refetch
}

/** A conversation decorated with the other participant's identity, for the list view. */
export interface ConversationSummary {
  id: string;
  peer: { uid: string; displayName: string; photoURL?: string };
  lastMessage?: { text: string; senderId: string; createdAt: number };
  unread: number;             // unread count for the requesting caller
  updatedAt: number;
}

/** A full thread payload: peer identity + a page of messages (ascending). */
export interface ConversationThread {
  id: string;
  peer: { uid: string; displayName: string; photoURL?: string; email?: string };
  messages: DmMessage[];
  hasMore: boolean;
  peerLastReadAt?: number;   // when the peer last read — drives "Seen" receipts
}
