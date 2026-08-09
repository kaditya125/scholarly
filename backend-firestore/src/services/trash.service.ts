import { ChatService } from './chat.service';

/**
 * A single item shown in the Trash / Recycle Bin.
 */
export interface TrashItem {
  id: string;
  type: TrashType;
  title: string;
  subtitle?: string;
  deletedAt: number;
}

export type TrashType = 'chat';

/**
 * Per-type handler. Adding a new deletable entity to the recycle bin is a matter of
 * implementing this contract and registering it in the `handlers` map below.
 */
interface TrashHandler {
  list(userId: string): Promise<TrashItem[]>;
  restore(userId: string, id: string): Promise<boolean>;
  purge(userId: string, id: string): Promise<boolean>;
}

/**
 * Unified recycle-bin service. It aggregates soft-deleted items across the app so the
 * frontend has a single place to list, restore, and permanently delete them.
 */
export class TrashService {
  private chatService = new ChatService();

  private handlers: Record<TrashType, TrashHandler> = {
    chat: {
      list: async (userId) => {
        const sessions = await this.chatService.getDeletedSessions(userId);
        return sessions.map((s) => ({
          id: s.sessionId,
          type: 'chat' as const,
          title: s.title || 'Untitled chat',
          subtitle: 'Chat',
          deletedAt: s.deletedAt || 0,
        }));
      },
      restore: (userId, id) => this.chatService.restoreSession(id, userId),
      purge: (userId, id) => this.chatService.permanentlyDeleteSession(id, userId),
    },
  };

  private isValidType(type: string): type is TrashType {
    return Object.prototype.hasOwnProperty.call(this.handlers, type);
  }

  /** List every trashed item for the user across all supported types. */
  async list(userId: string): Promise<TrashItem[]> {
    const all = await Promise.all(
      Object.values(this.handlers).map((h) => h.list(userId))
    );
    return all.flat().sort((a, b) => b.deletedAt - a.deletedAt);
  }

  /** Restore a single trashed item back to its original location. */
  async restore(userId: string, type: string, id: string): Promise<boolean> {
    if (!this.isValidType(type)) return false;
    return this.handlers[type].restore(userId, id);
  }

  /** Permanently delete a single trashed item. Irreversible. */
  async purge(userId: string, type: string, id: string): Promise<boolean> {
    if (!this.isValidType(type)) return false;
    return this.handlers[type].purge(userId, id);
  }

  /** Permanently delete every trashed item for the user. Irreversible. */
  async empty(userId: string): Promise<number> {
    let count = 0;
    for (const type of Object.keys(this.handlers) as TrashType[]) {
      const items = await this.handlers[type].list(userId);
      for (const item of items) {
        const ok = await this.handlers[type].purge(userId, item.id);
        if (ok) count += 1;
      }
    }
    return count;
  }
}
