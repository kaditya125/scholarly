import { db } from '../config/firebase';
import { Doubt, DoubtPreview, DoubtStatus } from '../types/doubt.types';

/**
 * DoubtsService — the student's saved scanned questions (revision notebook / mistake book).
 * Firestore-direct (same pattern as UserProfileService), scoped to users/{userId}/doubts. Every
 * method takes the authenticated userId from the controller so a user can only ever touch their
 * own doubts.
 */
export class DoubtsService {
  private col(userId: string) {
    return db.collection('users').doc(userId).collection('doubts');
  }

  /** Auto-tags derived from the saved context (deduped, non-empty). */
  private autoTags(input: Partial<Doubt>): string[] {
    const tags = new Set<string>();
    if (input.subject) tags.add(input.subject);
    if (input.chapterTitle) tags.add(input.chapterTitle);
    for (const t of input.tags || []) if (t && t.trim()) tags.add(t.trim());
    return Array.from(tags).slice(0, 12);
  }

  async create(userId: string, input: Partial<Doubt>): Promise<Doubt> {
    const ref = this.col(userId).doc();
    const now = Date.now();
    const doubt: Doubt = {
      id: ref.id,
      userId,
      notebookId: input.notebookId,
      sourceId: input.sourceId,
      bookTitle: input.bookTitle,
      chapterTitle: input.chapterTitle,
      subject: input.subject,
      page: typeof input.page === 'number' ? input.page : undefined,
      questionText: (input.questionText || '').slice(0, 8000),
      action: input.action,
      answer: (input.answer || '').slice(0, 40000),
      imageDataUrl: input.imageDataUrl,
      thumbDataUrl: input.thumbDataUrl,
      notes: input.notes || '',
      tags: this.autoTags(input),
      status: 'open',
      createdAt: now,
      updatedAt: now,
    };
    // Firestore rejects `undefined` — the app initializes with ignoreUndefinedProperties, but strip
    // defensively so this service is safe even if that setting ever changes.
    const clean: any = {};
    for (const [k, v] of Object.entries(doubt)) if (v !== undefined) clean[k] = v;
    await ref.set(clean);
    return doubt;
  }

  async list(userId: string, opts?: { status?: DoubtStatus; subject?: string }): Promise<DoubtPreview[]> {
    const snap = await this.col(userId).orderBy('createdAt', 'desc').limit(300).get();
    let rows = snap.docs.map((d) => d.data() as Doubt);
    if (opts?.status) rows = rows.filter((r) => r.status === opts.status);
    if (opts?.subject) rows = rows.filter((r) => (r.subject || '') === opts.subject);
    return rows.map((r) => this.toPreview(r));
  }

  async get(userId: string, id: string): Promise<Doubt | null> {
    const doc = await this.col(userId).doc(id).get();
    return doc.exists ? (doc.data() as Doubt) : null;
  }

  async update(userId: string, id: string, patch: { notes?: string; status?: DoubtStatus; tags?: string[] }): Promise<Doubt | null> {
    const ref = this.col(userId).doc(id);
    const doc = await ref.get();
    if (!doc.exists) return null;
    const update: any = { updatedAt: Date.now() };
    if (typeof patch.notes === 'string') update.notes = patch.notes.slice(0, 8000);
    if (patch.status === 'open' || patch.status === 'reviewed') update.status = patch.status;
    if (Array.isArray(patch.tags)) update.tags = patch.tags.filter((t) => typeof t === 'string' && t.trim()).map((t) => t.trim()).slice(0, 20);
    await ref.set(update, { merge: true });
    return this.get(userId, id);
  }

  async remove(userId: string, id: string): Promise<boolean> {
    const ref = this.col(userId).doc(id);
    const doc = await ref.get();
    if (!doc.exists) return false;
    await ref.delete();
    return true;
  }

  private toPreview(r: Doubt): DoubtPreview {
    const plain = (r.answer || '').replace(/[#*`>_~$\\]/g, '').replace(/\s+/g, ' ').trim();
    return {
      id: r.id,
      notebookId: r.notebookId,
      sourceId: r.sourceId,
      bookTitle: r.bookTitle,
      chapterTitle: r.chapterTitle,
      subject: r.subject,
      page: r.page,
      questionText: (r.questionText || '').slice(0, 400),
      answerPreview: plain.slice(0, 220),
      thumbDataUrl: r.thumbDataUrl,
      notes: r.notes,
      tags: r.tags || [],
      status: r.status,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
    };
  }
}

export const doubtsService = new DoubtsService();
