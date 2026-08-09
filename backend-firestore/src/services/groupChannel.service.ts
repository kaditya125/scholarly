import { v4 as uuidv4 } from 'uuid';
import { groupChannelRepository } from '../repositories/groupChannel.repository';
import { studyGroupRepository } from '../repositories/studyGroup.repository';
import { connectionRepository } from '../repositories/connection.repository';
import { attachmentService } from './attachment.service';
import { isAllowedReaction } from '../types/reactions';
import { StudyGroup } from '../types';
import {
  ChannelMessagesPage,
  ChannelSender,
  ChannelView,
  GroupChannel,
  GroupChannelMessage,
} from '../types/channel.types';

/** Thrown for expected, user-facing failures; carries an HTTP status for the controller. */
export class GroupChannelError extends Error {
  constructor(public status: number, message: string) {
    super(message);
    this.name = 'GroupChannelError';
  }
}

/**
 * Channels inside a study group. All access is gated on group membership (managing channels requires
 * admin); message senders are hydrated from the shared directory so ex-members still render. Unread
 * is derived from each channel's `lastMessageAt` versus the caller's saved read timestamp.
 */
export class GroupChannelService {
  private async loadGroupForMember(groupId: string, uid: string): Promise<StudyGroup> {
    const group = await studyGroupRepository.getGroupById(groupId);
    if (!group) throw new GroupChannelError(404, 'Group not found');
    if (!group.memberIds.includes(uid)) {
      throw new GroupChannelError(403, 'You are not a member of this group');
    }
    return group;
  }

  private assertAdmin(group: StudyGroup, uid: string): void {
    const member = group.members.find((m) => m.userId === uid);
    if (!member || member.role !== 'admin') {
      throw new GroupChannelError(403, 'Only group admins can manage channels');
    }
  }

  /** Guarantees every group has at least the default #general channel. */
  private async ensureDefaultChannel(groupId: string, creatorId: string): Promise<GroupChannel[]> {
    const channels = await groupChannelRepository.listChannels(groupId);
    if (channels.length > 0) return channels;

    const now = Date.now();
    const channel: GroupChannel = {
      id: uuidv4(),
      groupId,
      name: 'general',
      description: 'Group-wide chat',
      isDefault: true,
      createdBy: creatorId,
      createdAt: now,
      updatedAt: now,
      lastMessageAt: 0,
    };
    await groupChannelRepository.createChannel(channel);
    return [channel];
  }

  private cleanChannelName(name: string): string {
    return (name || '').trim().replace(/^#+/, '').trim();
  }

  // ─── Channels ──────────────────────────────────────────────────────────────

  async listChannels(uid: string, groupId: string): Promise<ChannelView[]> {
    await this.loadGroupForMember(groupId, uid);
    const channels = await this.ensureDefaultChannel(groupId, uid);
    const reads = await groupChannelRepository.getReads(groupId, uid);
    return channels
      .sort((a, b) => a.createdAt - b.createdAt)
      .map((c) => ({ ...c, unread: (c.lastMessageAt || 0) > (reads[c.id] || 0) }));
  }

  async createChannel(
    uid: string,
    groupId: string,
    name: string,
    description?: string
  ): Promise<ChannelView> {
    const group = await this.loadGroupForMember(groupId, uid);
    this.assertAdmin(group, uid);

    const clean = this.cleanChannelName(name);
    if (!clean) throw new GroupChannelError(400, 'Channel name is required');

    const now = Date.now();
    const channel: GroupChannel = {
      id: uuidv4(),
      groupId,
      name: clean,
      description: description?.trim() || undefined,
      isDefault: false,
      createdBy: uid,
      createdAt: now,
      updatedAt: now,
      lastMessageAt: 0,
    };
    await groupChannelRepository.createChannel(channel);
    return { ...channel, unread: false };
  }

  async renameChannel(
    uid: string,
    groupId: string,
    channelId: string,
    patch: { name?: string; description?: string }
  ): Promise<ChannelView> {
    const group = await this.loadGroupForMember(groupId, uid);
    this.assertAdmin(group, uid);

    const channel = await groupChannelRepository.getChannel(groupId, channelId);
    if (!channel) throw new GroupChannelError(404, 'Channel not found');

    const updates: Partial<GroupChannel> = {};
    if (patch.name !== undefined) {
      const n = this.cleanChannelName(patch.name);
      if (!n) throw new GroupChannelError(400, 'Channel name cannot be empty');
      updates.name = n;
    }
    if (patch.description !== undefined) updates.description = patch.description.trim();
    updates.updatedAt = Date.now();

    await groupChannelRepository.updateChannel(groupId, channelId, updates);
    const reads = await groupChannelRepository.getReads(groupId, uid);
    const merged = { ...channel, ...updates };
    return { ...merged, unread: (merged.lastMessageAt || 0) > (reads[channelId] || 0) };
  }

  async deleteChannel(uid: string, groupId: string, channelId: string): Promise<void> {
    const group = await this.loadGroupForMember(groupId, uid);
    this.assertAdmin(group, uid);

    const count = await groupChannelRepository.countChannels(groupId);
    if (count <= 1) throw new GroupChannelError(400, 'A group must keep at least one channel');

    const channel = await groupChannelRepository.getChannel(groupId, channelId);
    if (!channel) throw new GroupChannelError(404, 'Channel not found');

    await groupChannelRepository.deleteChannel(groupId, channelId);
  }

  // ─── Messages ──────────────────────────────────────────────────────────────

  async getMessages(
    uid: string,
    groupId: string,
    channelId: string,
    opts: { limit?: number; before?: number } = {}
  ): Promise<ChannelMessagesPage> {
    await this.loadGroupForMember(groupId, uid);
    const channel = await groupChannelRepository.getChannel(groupId, channelId);
    if (!channel) throw new GroupChannelError(404, 'Channel not found');

    const { messages, hasMore } = await groupChannelRepository.listMessages(groupId, channelId, opts);

    // Opening (not paging) the channel marks it read for the caller.
    if (!opts.before) {
      await groupChannelRepository.setRead(groupId, uid, channelId, Date.now());
    }

    const senderIds = [...new Set(messages.map((m) => m.senderId))];
    const directory = await connectionRepository.getDirectoryMany(senderIds);
    const senders: Record<string, ChannelSender> = {};
    directory.forEach((e) => {
      senders[e.uid] = { uid: e.uid, displayName: e.displayName, photoURL: e.photoURL };
    });
    senderIds.forEach((id) => {
      if (!senders[id]) senders[id] = { uid: id, displayName: 'Scholarly learner' };
    });

    return { messages, hasMore, senders };
  }

  private async resolveReply(
    groupId: string,
    channelId: string,
    replyToId?: string
  ): Promise<{ id: string; senderId: string; text: string } | undefined> {
    if (!replyToId) return undefined;
    const target = await groupChannelRepository.getMessage(groupId, channelId, replyToId);
    if (!target || target.deleted) return undefined;
    const preview = target.text || (target.attachments?.length ? '📎 Attachment' : '');
    return { id: target.id, senderId: target.senderId, text: preview.slice(0, 140) };
  }

  async sendMessage(
    uid: string,
    groupId: string,
    channelId: string,
    text: string,
    attachments?: unknown,
    replyToId?: string
  ): Promise<GroupChannelMessage> {
    await this.loadGroupForMember(groupId, uid);

    const clean = (text || '').trim();
    const atts = attachmentService.sanitizeForMessage(attachments);
    if (!clean && atts.length === 0) throw new GroupChannelError(400, 'Message cannot be empty');
    if (clean.length > 4000) throw new GroupChannelError(400, 'Message is too long (max 4000 characters)');

    const channel = await groupChannelRepository.getChannel(groupId, channelId);
    if (!channel) throw new GroupChannelError(404, 'Channel not found');

    const replyTo = await this.resolveReply(groupId, channelId, replyToId);
    const message = await groupChannelRepository.addMessage(groupId, channelId, uid, clean, atts, replyTo);
    await groupChannelRepository.setRead(groupId, uid, channelId, message.createdAt);
    return message;
  }

  /** Edits the caller's own channel message text. */
  async editMessage(
    uid: string,
    groupId: string,
    channelId: string,
    messageId: string,
    text: string
  ): Promise<GroupChannelMessage> {
    const clean = (text || '').trim();
    if (!clean) throw new GroupChannelError(400, 'Message cannot be empty');
    if (clean.length > 4000) throw new GroupChannelError(400, 'Message is too long (max 4000 characters)');

    await this.loadGroupForMember(groupId, uid);
    const msg = await groupChannelRepository.getMessage(groupId, channelId, messageId);
    if (!msg || msg.deleted) throw new GroupChannelError(404, 'Message not found');
    if (msg.senderId !== uid) throw new GroupChannelError(403, 'You can only edit your own messages');

    await groupChannelRepository.editMessage(groupId, channelId, messageId, clean);
    return { ...msg, text: clean, editedAt: Date.now() };
  }

  /** Soft-deletes a channel message. Allowed for the author or a group admin (moderation). */
  async deleteMessage(uid: string, groupId: string, channelId: string, messageId: string): Promise<void> {
    const group = await this.loadGroupForMember(groupId, uid);
    const msg = await groupChannelRepository.getMessage(groupId, channelId, messageId);
    if (!msg) throw new GroupChannelError(404, 'Message not found');
    const isAdmin = group.members.find((m) => m.userId === uid)?.role === 'admin';
    if (msg.senderId !== uid && !isAdmin) {
      throw new GroupChannelError(403, 'You can only delete your own messages');
    }
    await groupChannelRepository.deleteMessage(groupId, channelId, messageId);
  }

  async markRead(uid: string, groupId: string, channelId: string): Promise<void> {
    await this.loadGroupForMember(groupId, uid);
    await groupChannelRepository.setRead(groupId, uid, channelId, Date.now());
  }

  /** Toggles the caller's emoji reaction on a channel message. */
  async toggleReaction(
    uid: string,
    groupId: string,
    channelId: string,
    messageId: string,
    emoji: string
  ): Promise<GroupChannelMessage> {
    if (!isAllowedReaction(emoji)) throw new GroupChannelError(400, 'Unsupported reaction');
    await this.loadGroupForMember(groupId, uid);
    const updated = await groupChannelRepository.toggleReaction(groupId, channelId, messageId, uid, emoji);
    if (!updated) throw new GroupChannelError(404, 'Message not found');
    return updated;
  }

  /** Pins/unpins a channel message (any member may pin). */
  async pinMessage(
    uid: string,
    groupId: string,
    channelId: string,
    messageId: string,
    pinned: boolean
  ): Promise<GroupChannelMessage> {
    await this.loadGroupForMember(groupId, uid);
    const msg = await groupChannelRepository.getMessage(groupId, channelId, messageId);
    if (!msg || msg.deleted) throw new GroupChannelError(404, 'Message not found');
    await groupChannelRepository.setPinned(groupId, channelId, messageId, pinned, uid);
    return {
      ...msg,
      pinned,
      pinnedAt: pinned ? Date.now() : undefined,
      pinnedBy: pinned ? uid : undefined,
    };
  }

  /** Pinned messages in a channel, with the identities of everyone who sent them. */
  async getPins(
    uid: string,
    groupId: string,
    channelId: string
  ): Promise<{ messages: GroupChannelMessage[]; senders: Record<string, ChannelSender> }> {
    await this.loadGroupForMember(groupId, uid);
    const messages = await groupChannelRepository.listPinned(groupId, channelId);
    const senderIds = [...new Set(messages.map((m) => m.senderId))];
    const directory = await connectionRepository.getDirectoryMany(senderIds);
    const senders: Record<string, ChannelSender> = {};
    directory.forEach((e) => {
      senders[e.uid] = { uid: e.uid, displayName: e.displayName, photoURL: e.photoURL };
    });
    senderIds.forEach((id) => {
      if (!senders[id]) senders[id] = { uid: id, displayName: 'Scholarly learner' };
    });
    return { messages, senders };
  }
}

export const groupChannelService = new GroupChannelService();
