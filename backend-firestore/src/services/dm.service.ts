import { dmRepository, conversationId } from '../repositories/dm.repository';
import { connectionRepository } from '../repositories/connection.repository';
import { attachmentService } from './attachment.service';
import { eventBus } from '../core/events/EventBus';
import { isAllowedReaction } from '../types/reactions';
import {
  ConversationSummary,
  ConversationThread,
  DmConversation,
  DmMessage,
} from '../types/dm.types';

/** Thrown for expected, user-facing failures; carries an HTTP status for the controller. */
export class DmError extends Error {
  constructor(public status: number, message: string) {
    super(message);
    this.name = 'DmError';
  }
}

/**
 * Direct messaging between connected users. Messaging is gated on an accepted connection (and never
 * allowed across a block), so the social graph is the single source of truth for who can talk to whom.
 * Peer identity on every payload comes from the shared user directory.
 */
export class DmService {
  private otherOf(conv: DmConversation, uid: string): string {
    return conv.users.find((u) => u !== uid) || uid;
  }

  /** Enforces the messaging policy: not yourself, not blocked either way, and an accepted connection. */
  private async assertCanMessage(uid: string, otherId: string): Promise<void> {
    if (!otherId) throw new DmError(400, 'A recipient is required');
    if (uid === otherId) throw new DmError(400, 'You cannot message yourself');
    if (await connectionRepository.isBlockedEitherWay(uid, otherId)) {
      throw new DmError(403, 'This conversation is unavailable');
    }
    const connection = await connectionRepository.getConnection(uid, otherId);
    if (!connection || connection.status !== 'accepted') {
      throw new DmError(403, 'You can only message people you are connected with');
    }
  }

  /** The caller's conversations (only those with at least one message), newest first. */
  async listConversations(uid: string): Promise<ConversationSummary[]> {
    const conversations = await dmRepository.listForUser(uid);
    const withMessages = conversations.filter((c) => c.lastMessage);

    const otherIds = withMessages.map((c) => this.otherOf(c, uid));
    const directory = await connectionRepository.getDirectoryMany(otherIds);
    const dirMap = new Map(directory.map((e) => [e.uid, e]));

    return withMessages.map((c) => {
      const otherId = this.otherOf(c, uid);
      const entry = dirMap.get(otherId);
      return {
        id: c.id,
        peer: {
          uid: otherId,
          displayName: entry?.displayName || 'Sadhya learner',
          photoURL: entry?.photoURL,
        },
        lastMessage: c.lastMessage,
        unread: c.unread?.[uid] || 0,
        updatedAt: c.updatedAt,
      };
    });
  }

  /**
   * Loads a conversation thread with a peer, creating the (empty) conversation on first open. Marks
   * the thread read for the caller unless paging older messages (`before` set).
   */
  async getThread(
    uid: string,
    otherId: string,
    opts: { limit?: number; before?: number } = {}
  ): Promise<ConversationThread> {
    await this.assertCanMessage(uid, otherId);
    const id = conversationId(uid, otherId);

    let conversation = await dmRepository.getById(id);
    if (!conversation) conversation = await dmRepository.create(uid, otherId);

    const { messages, hasMore } = await dmRepository.listMessages(id, opts);

    // Opening (not paging) the thread clears the caller's unread badge.
    if (!opts.before && (conversation.unread?.[uid] || 0) > 0) {
      await dmRepository.markRead(id, uid);
    }

    const entry = await connectionRepository.getDirectory(otherId);
    return {
      id,
      peer: {
        uid: otherId,
        displayName: entry?.displayName || 'Sadhya learner',
        photoURL: entry?.photoURL,
        email: entry?.email,
      },
      messages,
      hasMore,
      peerLastReadAt: conversation.lastReadAt?.[otherId],
    };
  }

  /** Toggles the caller's emoji reaction on a message in the conversation with `otherId`. */
  async toggleReaction(
    uid: string,
    otherId: string,
    messageId: string,
    emoji: string
  ): Promise<DmMessage> {
    if (!isAllowedReaction(emoji)) throw new DmError(400, 'Unsupported reaction');
    await this.assertCanMessage(uid, otherId);
    const id = conversationId(uid, otherId);
    const updated = await dmRepository.toggleReaction(id, messageId, uid, emoji);
    if (!updated) throw new DmError(404, 'Message not found');
    return updated;
  }

  /** Builds a quoted-reply preview from a message in the same conversation (if it still exists). */
  private async resolveReply(
    convId: string,
    replyToId?: string
  ): Promise<{ id: string; senderId: string; text: string } | undefined> {
    if (!replyToId) return undefined;
    const target = await dmRepository.getMessage(convId, replyToId);
    if (!target || target.deleted) return undefined;
    const preview = target.text || (target.attachments?.length ? '📎 Attachment' : '');
    return { id: target.id, senderId: target.senderId, text: preview.slice(0, 140) };
  }

  /** Sends a message (text and/or attachments, optionally a reply) to a connected peer. */
  async sendMessage(
    uid: string,
    otherId: string,
    text: string,
    attachments?: unknown,
    replyToId?: string
  ): Promise<DmMessage> {
    const clean = (text || '').trim();
    const atts = attachmentService.sanitizeForMessage(attachments);
    if (!clean && atts.length === 0) throw new DmError(400, 'Message cannot be empty');
    if (clean.length > 4000) throw new DmError(400, 'Message is too long (max 4000 characters)');

    await this.assertCanMessage(uid, otherId);
    const id = conversationId(uid, otherId);

    if (!(await dmRepository.getById(id))) await dmRepository.create(uid, otherId);
    const replyTo = await this.resolveReply(id, replyToId);
    const msg = await dmRepository.addMessage(id, uid, otherId, clean, atts, replyTo);

    // Get sender profile for notification
    const sender = await connectionRepository.getDirectory(uid);
    const senderName = sender?.displayName || 'Someone';

    eventBus.publish('notification.created', {
      userId: otherId,
      category: 'social',
      type: 'dm.received',
      title: `New Message from ${senderName}`,
      body: clean || (atts.length ? 'Sent an attachment' : 'New message'),
      actionUrl: `/messages/${uid}`,
      priority: 'high'
    });

    return msg;
  }

  /** Edits the caller's own message text. */
  async editMessage(uid: string, otherId: string, messageId: string, text: string): Promise<DmMessage> {
    const clean = (text || '').trim();
    if (!clean) throw new DmError(400, 'Message cannot be empty');
    if (clean.length > 4000) throw new DmError(400, 'Message is too long (max 4000 characters)');

    const id = conversationId(uid, otherId);
    const msg = await dmRepository.getMessage(id, messageId);
    if (!msg || msg.deleted) throw new DmError(404, 'Message not found');
    if (msg.senderId !== uid) throw new DmError(403, 'You can only edit your own messages');

    await dmRepository.editMessage(id, messageId, clean);
    return { ...msg, text: clean, editedAt: Date.now() };
  }

  /** Soft-deletes the caller's own message. */
  async deleteMessage(uid: string, otherId: string, messageId: string): Promise<void> {
    const id = conversationId(uid, otherId);
    const msg = await dmRepository.getMessage(id, messageId);
    if (!msg) throw new DmError(404, 'Message not found');
    if (msg.senderId !== uid) throw new DmError(403, 'You can only delete your own messages');
    await dmRepository.deleteMessage(id, messageId);
  }

  /** Pins/unpins a message in the conversation (either participant may pin). */
  async pinMessage(uid: string, otherId: string, messageId: string, pinned: boolean): Promise<DmMessage> {
    const id = conversationId(uid, otherId);
    const msg = await dmRepository.getMessage(id, messageId);
    if (!msg || msg.deleted) throw new DmError(404, 'Message not found');
    await dmRepository.setPinned(id, messageId, pinned, uid);
    return {
      ...msg,
      pinned,
      pinnedAt: pinned ? Date.now() : undefined,
      pinnedBy: pinned ? uid : undefined,
    };
  }

  /** The pinned messages in the conversation with `otherId`. */
  async getPins(uid: string, otherId: string): Promise<DmMessage[]> {
    return dmRepository.listPinned(conversationId(uid, otherId));
  }

  /** Marks a conversation read for the caller. */
  async markRead(uid: string, otherId: string): Promise<void> {
    const id = conversationId(uid, otherId);
    if (await dmRepository.getById(id)) await dmRepository.markRead(id, uid);
  }

  /** Total unread across all conversations — for the nav badge. */
  async getTotalUnread(uid: string): Promise<number> {
    const conversations = await dmRepository.listForUser(uid);
    return conversations.reduce((sum, c) => sum + (c.unread?.[uid] || 0), 0);
  }
}

export const dmService = new DmService();
