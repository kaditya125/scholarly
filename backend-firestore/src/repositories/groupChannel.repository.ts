import { db } from '../config/firebase';
import { GroupChannel, GroupChannelMessage } from '../types/channel.types';
import { Attachment } from '../types/attachment.types';

/**
 * Firestore access for group channels + their messages. Channels live under a group
 * (`studyGroups/{groupId}/channels`), messages under each channel, and per-user read state in
 * `studyGroups/{groupId}/reads/{uid}`. Reads stay index-light: channel lists are small (sorted in
 * memory) and message paging uses the single-field `createdAt` index. Unread is derived from
 * `lastMessageAt` vs the user's saved read timestamp, so there are no per-user counters to maintain.
 */
export class GroupChannelRepository {
  private groups = db.collection('studyGroups');

  private channelsCol(groupId: string) {
    return this.groups.doc(groupId).collection('channels');
  }
  private messagesCol(groupId: string, channelId: string) {
    return this.channelsCol(groupId).doc(channelId).collection('messages');
  }
  private readsDoc(groupId: string, uid: string) {
    return this.groups.doc(groupId).collection('reads').doc(uid);
  }

  async listChannels(groupId: string): Promise<GroupChannel[]> {
    const snap = await this.channelsCol(groupId).get();
    return snap.docs
      .map((d) => d.data() as GroupChannel)
      .sort((a, b) => a.createdAt - b.createdAt);
  }

  async getChannel(groupId: string, channelId: string): Promise<GroupChannel | null> {
    const doc = await this.channelsCol(groupId).doc(channelId).get();
    return doc.exists ? (doc.data() as GroupChannel) : null;
  }

  async countChannels(groupId: string): Promise<number> {
    const snap = await this.channelsCol(groupId).get();
    return snap.size;
  }

  async createChannel(channel: GroupChannel): Promise<void> {
    await this.channelsCol(channel.groupId).doc(channel.id).set(channel);
  }

  async updateChannel(groupId: string, channelId: string, patch: Partial<GroupChannel>): Promise<void> {
    await this.channelsCol(groupId).doc(channelId).update(patch);
  }

  /** Deletes a channel and all of its messages (paged so it scales past the 500-write batch cap). */
  async deleteChannel(groupId: string, channelId: string): Promise<void> {
    const messages = this.messagesCol(groupId, channelId);
    // Delete messages in pages.
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const snap = await messages.limit(400).get();
      if (snap.empty) break;
      const batch = db.batch();
      snap.docs.forEach((d) => batch.delete(d.ref));
      await batch.commit();
      if (snap.size < 400) break;
    }
    await this.channelsCol(groupId).doc(channelId).delete();
  }

  /** Appends a message and updates the channel's last-message pointer atomically. */
  async addMessage(
    groupId: string,
    channelId: string,
    senderId: string,
    text: string,
    attachments: Attachment[] = [],
    replyTo?: { id: string; senderId: string; text: string }
  ): Promise<GroupChannelMessage> {
    const now = Date.now();
    const channelRef = this.channelsCol(groupId).doc(channelId);
    const msgRef = channelRef.collection('messages').doc();
    const message: GroupChannelMessage = {
      id: msgRef.id,
      groupId,
      channelId,
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
      channelRef,
      { lastMessage: { text: preview, senderId, createdAt: now }, lastMessageAt: now, updatedAt: now },
      { merge: true }
    );
    await batch.commit();
    return message;
  }

  /** A page of messages in ascending order. Pass `before` (createdAt) to load older messages. */
  async listMessages(
    groupId: string,
    channelId: string,
    opts: { limit?: number; before?: number } = {}
  ): Promise<{ messages: GroupChannelMessage[]; hasMore: boolean }> {
    const limit = Math.min(Math.max(opts.limit || 40, 1), 100);
    let query: FirebaseFirestore.Query = this.messagesCol(groupId, channelId).orderBy(
      'createdAt',
      'desc'
    );
    if (opts.before) query = query.where('createdAt', '<', opts.before);

    const snap = await query.limit(limit).get();
    const descending = snap.docs.map((d) => d.data() as GroupChannelMessage);
    return { messages: descending.reverse(), hasMore: snap.size === limit };
  }

  async getReads(groupId: string, uid: string): Promise<Record<string, number>> {
    const doc = await this.readsDoc(groupId, uid).get();
    if (!doc.exists) return {};
    return (doc.data()?.channels as Record<string, number>) || {};
  }

  async setRead(groupId: string, uid: string, channelId: string, ts: number): Promise<void> {
    await this.readsDoc(groupId, uid).set({ channels: { [channelId]: ts } }, { merge: true });
  }

  /**
   * Toggles a user's emoji reaction on a channel message and bumps the channel's `reactionsUpdatedAt`
   * so realtime listeners (which watch the channel doc) refetch. Returns null if the message is gone.
   */
  async toggleReaction(
    groupId: string,
    channelId: string,
    messageId: string,
    uid: string,
    emoji: string
  ): Promise<GroupChannelMessage | null> {
    const channelRef = this.channelsCol(groupId).doc(channelId);
    const msgRef = channelRef.collection('messages').doc(messageId);
    const snap = await msgRef.get();
    if (!snap.exists) return null;

    const message = snap.data() as GroupChannelMessage;
    const reactions: Record<string, string[]> = { ...(message.reactions || {}) };
    const current = new Set(reactions[emoji] || []);
    if (current.has(uid)) current.delete(uid);
    else current.add(uid);
    if (current.size === 0) delete reactions[emoji];
    else reactions[emoji] = [...current];

    const batch = db.batch();
    batch.update(msgRef, { reactions });
    batch.set(channelRef, { reactionsUpdatedAt: Date.now() }, { merge: true });
    await batch.commit();

    return { ...message, reactions };
  }

  async getMessage(
    groupId: string,
    channelId: string,
    messageId: string
  ): Promise<GroupChannelMessage | null> {
    const snap = await this.messagesCol(groupId, channelId).doc(messageId).get();
    return snap.exists ? (snap.data() as GroupChannelMessage) : null;
  }

  /** Edits a channel message's text. Bumps `reactionsUpdatedAt` so realtime listeners refetch. */
  async editMessage(groupId: string, channelId: string, messageId: string, text: string): Promise<void> {
    const channelRef = this.channelsCol(groupId).doc(channelId);
    const batch = db.batch();
    batch.update(channelRef.collection('messages').doc(messageId), { text, editedAt: Date.now() });
    batch.set(channelRef, { reactionsUpdatedAt: Date.now() }, { merge: true });
    await batch.commit();
  }

  /** Soft-deletes a channel message (keeps the doc; clears its content). */
  async deleteMessage(groupId: string, channelId: string, messageId: string): Promise<void> {
    const channelRef = this.channelsCol(groupId).doc(channelId);
    const batch = db.batch();
    batch.update(channelRef.collection('messages').doc(messageId), {
      deleted: true,
      text: '',
      attachments: [],
      reactions: {},
      editedAt: Date.now(),
    });
    batch.set(channelRef, { reactionsUpdatedAt: Date.now() }, { merge: true });
    await batch.commit();
  }

  /** Pins/unpins a channel message and bumps `reactionsUpdatedAt` so realtime listeners refetch. */
  async setPinned(
    groupId: string,
    channelId: string,
    messageId: string,
    pinned: boolean,
    uid: string
  ): Promise<void> {
    const channelRef = this.channelsCol(groupId).doc(channelId);
    const batch = db.batch();
    batch.update(
      channelRef.collection('messages').doc(messageId),
      pinned ? { pinned: true, pinnedAt: Date.now(), pinnedBy: uid } : { pinned: false }
    );
    batch.set(channelRef, { reactionsUpdatedAt: Date.now() }, { merge: true });
    await batch.commit();
  }

  /** All pinned messages in a channel, most-recently-pinned first. */
  async listPinned(groupId: string, channelId: string): Promise<GroupChannelMessage[]> {
    const snap = await this.messagesCol(groupId, channelId).where('pinned', '==', true).get();
    return snap.docs
      .map((d) => d.data() as GroupChannelMessage)
      .sort((a, b) => (b.pinnedAt || 0) - (a.pinnedAt || 0));
  }
}

export const groupChannelRepository = new GroupChannelRepository();
