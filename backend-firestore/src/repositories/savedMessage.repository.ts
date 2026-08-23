import { db } from '../config/firebase';
import { SavedMessageItem, ListSavedMessagesOptions } from '../types/savedMessage.types';

export class SavedMessageRepository {
  private userSavedRef(uid: string) {
    return db.collection('users').doc(uid).collection('savedMessages');
  }

  async getById(uid: string, id: string): Promise<SavedMessageItem | null> {
    const doc = await this.userSavedRef(uid).doc(id).get();
    return doc.exists ? (doc.data() as SavedMessageItem) : null;
  }

  async getByMessageId(uid: string, messageId: string): Promise<SavedMessageItem | null> {
    const snap = await this.userSavedRef(uid).where('messageId', '==', messageId).limit(1).get();
    return snap.empty ? null : (snap.docs[0].data() as SavedMessageItem);
  }

  async save(uid: string, item: Omit<SavedMessageItem, 'id' | 'userId' | 'savedAt'>): Promise<SavedMessageItem> {
    const existing = await this.getByMessageId(uid, item.messageId);
    if (existing) return existing;

    const docRef = this.userSavedRef(uid).doc();
    const savedItem: SavedMessageItem = {
      ...item,
      id: docRef.id,
      userId: uid,
      savedAt: Date.now(),
    };

    await docRef.set(savedItem);
    return savedItem;
  }

  async remove(uid: string, id: string): Promise<boolean> {
    const docRef = this.userSavedRef(uid).doc(id);
    const doc = await docRef.get();
    if (!doc.exists) {
      // Check if `id` was the messageId instead
      const byMsg = await this.getByMessageId(uid, id);
      if (byMsg) {
        await this.userSavedRef(uid).doc(byMsg.id).delete();
        return true;
      }
      return false;
    }
    await docRef.delete();
    return true;
  }

  async list(uid: string, opts: ListSavedMessagesOptions = {}): Promise<SavedMessageItem[]> {
    let query: FirebaseFirestore.Query = this.userSavedRef(uid).orderBy('savedAt', 'desc');

    if (opts.before) {
      query = query.startAfter(opts.before);
    }
    const limit = opts.limit ? Math.min(opts.limit, 100) : 50;
    query = query.limit(limit);

    const snap = await query.get();
    let items = snap.docs.map((d) => d.data() as SavedMessageItem);

    if (opts.q && opts.q.trim()) {
      const lower = opts.q.trim().toLowerCase();
      items = items.filter(
        (it) =>
          it.text.toLowerCase().includes(lower) ||
          it.senderName.toLowerCase().includes(lower) ||
          (it.groupName && it.groupName.toLowerCase().includes(lower)) ||
          (it.channelName && it.channelName.toLowerCase().includes(lower)) ||
          (it.note && it.note.toLowerCase().includes(lower))
      );
    }

    if (opts.category && opts.category !== 'all') {
      const cat = opts.category.toLowerCase();
      items = items.filter((it) => {
        if (cat === 'audio') return it.attachments?.some((a) => a.kind === 'audio');
        if (cat === 'diagram' || cat === 'image') return it.attachments?.some((a) => a.kind === 'image');
        if (cat === 'file') return it.attachments?.some((a) => a.kind === 'file');
        return it.category === cat;
      });
    }

    return items;
  }

  async listIds(uid: string): Promise<string[]> {
    const snap = await this.userSavedRef(uid).select('messageId').get();
    return snap.docs.map((d) => (d.data().messageId as string)).filter(Boolean);
  }
}

export const savedMessageRepository = new SavedMessageRepository();
