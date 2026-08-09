import * as admin from 'firebase-admin';
import { db } from '../config/firebase';
import { DmConversation, DmMessage } from '../types/dm.types';
import { Attachment } from '../types/attachment.types';

const FieldValue = admin.firestore.FieldValue;

/** Canonical conversation id for a user pair — order-independent (matches the connections model). */
export const conversationId = (a: string, b: string): string => [a, b].sort().join('__');

/**
 * Firestore access for direct messages. Conversations are one doc per pair (`dmConversations/{a__b}`)
 * with an append-only `messages` subcollection. Reads stay index-light: the conversation list uses a
 * single array-contains query sorted in memory, and message paging uses the single-field `createdAt`
 * index, so no composite indexes are required.
 */
export class DmRepository {
  private conversations = db.collection('dmConversations');

  async getById(id: string): Promise<DmConversation | null> {
    const doc = await this.conversations.doc(id).get();
    return doc.exists ? (doc.data() as DmConversation) : null;
  }

  async getByUsers(a: string, b: string): Promise<DmConversation | null> {
    return this.getById(conversationId(a, b));
  }

  /** Creates the conversation shell for a pair (no messages yet). */
  async create(a: string, b: string): Promise<DmConversation> {
    const id = conversationId(a, b);
    const now = Date.now();
    const conversation: DmConversation = {
      id,
      users: [a, b].sort(),
      createdAt: now,
      updatedAt: now,
      unread: { [a]: 0, [b]: 0 },
      lastReadAt: {},
    };
    await this.conversations.doc(id).set(conversation);
    return conversation;
  }

  /** All conversations a user belongs to, newest activity first (sorted in memory). */
  async listForUser(uid: string): Promise<DmConversation[]> {
    const snap = await this.conversations.where('users', 'array-contains', uid).get();
    return snap.docs
      .map((d) => d.data() as DmConversation)
      .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
  }

  /**
   * Appends a message and updates the conversation's last-message / unread counters atomically.
   * The recipient's unread count is incremented; the sender's is reset to 0 (they've "read" it).
   */
  async addMessage(
    id: string,
    senderId: string,
    recipientId: string,
    text: string,
    attachments: Attachment[] = [],
    replyTo?: { id: string; senderId: string; text: string }
  ): Promise<DmMessage> {
    const now = Date.now();
    const convRef = this.conversations.doc(id);
    const msgRef = convRef.collection('messages').doc();
    const message: DmMessage = {
      id: msgRef.id,
      conversationId: id,
      senderId,
      text,
      ...(attachments.length ? { attachments } : {}),
      ...(replyTo ? { replyTo } : {}),
      createdAt: now,
    };
    const preview = text || (attachments[0] ? `📎 ${attachments[0].name}` : '');

    const batch = db.batch();
    batch.set(msgRef, message);
    batch.set(
      convRef,
      {
        lastMessage: { text: preview, senderId, createdAt: now },
        updatedAt: now,
        unread: { [recipientId]: FieldValue.increment(1), [senderId]: 0 },
      },
      { merge: true }
    );
    await batch.commit();
    return message;
  }

  /**
   * A page of messages in ascending (chronological) order. Pass `before` (a createdAt timestamp)
   * to load older messages. `hasMore` indicates another older page likely exists.
   */
  async listMessages(
    id: string,
    opts: { limit?: number; before?: number } = {}
  ): Promise<{ messages: DmMessage[]; hasMore: boolean }> {
    const limit = Math.min(Math.max(opts.limit || 30, 1), 100);
    let query: FirebaseFirestore.Query = this.conversations
      .doc(id)
      .collection('messages')
      .orderBy('createdAt', 'desc');
    if (opts.before) query = query.where('createdAt', '<', opts.before);

    const snap = await query.limit(limit).get();
    const descending = snap.docs.map((d) => d.data() as DmMessage);
    return { messages: descending.reverse(), hasMore: snap.size === limit };
  }

  /** Marks the conversation as read for `uid` (clears their unread counter). */
  async markRead(id: string, uid: string): Promise<void> {
    await this.conversations.doc(id).update({
      [`unread.${uid}`]: 0,
      [`lastReadAt.${uid}`]: Date.now(),
    });
  }

  /**
   * Toggles a user's emoji reaction on a message and bumps the conversation's `reactionsUpdatedAt`
   * so realtime listeners (which watch the conversation doc) refetch. Returns the updated message,
   * or null if the message no longer exists.
   */
  async toggleReaction(
    convId: string,
    messageId: string,
    uid: string,
    emoji: string
  ): Promise<DmMessage | null> {
    const convRef = this.conversations.doc(convId);
    const msgRef = convRef.collection('messages').doc(messageId);
    const snap = await msgRef.get();
    if (!snap.exists) return null;

    const message = snap.data() as DmMessage;
    const reactions: Record<string, string[]> = { ...(message.reactions || {}) };
    const current = new Set(reactions[emoji] || []);
    if (current.has(uid)) current.delete(uid);
    else current.add(uid);
    if (current.size === 0) delete reactions[emoji];
    else reactions[emoji] = [...current];

    const batch = db.batch();
    batch.update(msgRef, { reactions });
    batch.set(convRef, { reactionsUpdatedAt: Date.now() }, { merge: true });
    await batch.commit();

    return { ...message, reactions };
  }

  async getMessage(convId: string, messageId: string): Promise<DmMessage | null> {
    const snap = await this.conversations.doc(convId).collection('messages').doc(messageId).get();
    return snap.exists ? (snap.data() as DmMessage) : null;
  }

  /** Edits a message's text. Bumps `reactionsUpdatedAt` so realtime listeners refetch. */
  async editMessage(convId: string, messageId: string, text: string): Promise<void> {
    const convRef = this.conversations.doc(convId);
    const batch = db.batch();
    batch.update(convRef.collection('messages').doc(messageId), { text, editedAt: Date.now() });
    batch.set(convRef, { reactionsUpdatedAt: Date.now() }, { merge: true });
    await batch.commit();
  }

  /** Soft-deletes a message (keeps the doc so replies/order survive; clears its content). */
  async deleteMessage(convId: string, messageId: string): Promise<void> {
    const convRef = this.conversations.doc(convId);
    const batch = db.batch();
    batch.update(convRef.collection('messages').doc(messageId), {
      deleted: true,
      text: '',
      attachments: [],
      reactions: {},
      editedAt: Date.now(),
    });
    batch.set(convRef, { reactionsUpdatedAt: Date.now() }, { merge: true });
    await batch.commit();
  }

  /** Pins/unpins a message and bumps `reactionsUpdatedAt` so realtime listeners refetch. */
  async setPinned(convId: string, messageId: string, pinned: boolean, uid: string): Promise<void> {
    const convRef = this.conversations.doc(convId);
    const batch = db.batch();
    batch.update(
      convRef.collection('messages').doc(messageId),
      pinned ? { pinned: true, pinnedAt: Date.now(), pinnedBy: uid } : { pinned: false }
    );
    batch.set(convRef, { reactionsUpdatedAt: Date.now() }, { merge: true });
    await batch.commit();
  }

  /** All pinned messages in a conversation, most-recently-pinned first. */
  async listPinned(convId: string): Promise<DmMessage[]> {
    const snap = await this.conversations
      .doc(convId)
      .collection('messages')
      .where('pinned', '==', true)
      .get();
    return snap.docs
      .map((d) => d.data() as DmMessage)
      .sort((a, b) => (b.pinnedAt || 0) - (a.pinnedAt || 0));
  }
}

export const dmRepository = new DmRepository();
