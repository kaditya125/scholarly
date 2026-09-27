/**
 * Private reference-book question bank — Firestore access for `books`, `book_ingestion_jobs` and
 * `book_questions`.
 *
 * These collections hold licensed source text (original stems, options, answer keys, worked
 * solutions). They are server-only: firestore.rules denies every client read/write, and the only
 * HTTP surface is the admin book-bank routes (super_admin/admin). Nothing here may be returned by
 * a student-facing endpoint — student questions are generated variants (a later phase), never these.
 */
import { createHash } from 'crypto';
import { db } from '../config/firebase';
import type { ParsedBookQuestion } from '../services/books/bookQuestionParser';

export type BookQuestionStatus = 'EXTRACTED' | 'QUARANTINED';
export type IngestionJobStatus = 'QUEUED' | 'PROCESSING' | 'EXTRACTING' | 'INDEXING' | 'COMPLETED' | 'PARTIAL' | 'FAILED';
export type BookSubject = 'QUANT' | 'REASONING' | 'ENGLISH' | 'GK' | 'GS';

export interface BookRecord {
  bookId: string;
  title: string;
  publisher: string;
  author?: string;
  edition?: string;
  language?: string;
  subject: BookSubject;
  licenseStatus: 'licensed' | 'unlicensed';
  /** Who confirmed the licence and when — an attestation, recorded for the audit trail. */
  licenseAttestation?: { attestedBy: string; attestedAt: string; note?: string };
  lastIngestionJobId?: string;
  stats?: { chapters: number; questions: number; extracted: number; quarantined: number };
  createdAt: string;
  updatedAt: string;
}

export interface IngestionJob {
  jobId: string;
  bookId: string;
  status: IngestionJobStatus;
  extractionVersion: string;
  startedAt: string;
  finishedAt?: string;
  counts?: { chapters: number; questions: number; extracted: number; quarantined: number; superseded: number };
  quarantineReasons?: Record<string, number>;
  perChapter?: { ordinal: number; name: string; questions: number; extracted: number }[];
  error?: string;
}

export interface BookQuestionDoc extends Omit<ParsedBookQuestion, 'quarantineReason'> {
  id: string;
  bookId: string;
  subject: BookSubject;
  chapterId: string;
  status: BookQuestionStatus;
  quarantineReason?: string;
  extractionVersion: string;
  jobId: string;
  createdAt: string;
  updatedAt: string;
}

const books = () => db.collection('books');
const jobs = () => db.collection('book_ingestion_jobs');
const questions = () => db.collection('book_questions');

/** Deterministic id: re-running extraction updates the same document instead of duplicating it. */
export function bookQuestionId(bookId: string, q: Pick<ParsedBookQuestion, 'chapterOrdinal' | 'sourceSection' | 'sourceSectionIndex' | 'questionNumber'>): string {
  // The first set keeps the original key shape (v1.0 ids stay stable); later sets add their
  // position, since two sets in one chapter can share a label and both restart at 1.
  const section = q.sourceSectionIndex > 1 ? `${q.sourceSection}#${q.sourceSectionIndex}` : q.sourceSection;
  return createHash('sha256').update(`${bookId}|${q.chapterOrdinal}|${section}|${q.questionNumber}`).digest('hex').slice(0, 24);
}

/** Firestore rejects `undefined` field values; strip them. */
function clean<T extends object>(o: T): T {
  return Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as T;
}

export const bookQuestionsRepository = {
  async upsertBook(book: Omit<BookRecord, 'createdAt' | 'updatedAt'>): Promise<void> {
    const ref = books().doc(book.bookId);
    const now = new Date().toISOString();
    const existing = await ref.get();
    await ref.set(clean({ ...book, updatedAt: now, ...(existing.exists ? {} : { createdAt: now }) }), { merge: true });
  },

  async getBook(bookId: string): Promise<BookRecord | null> {
    const s = await books().doc(bookId).get();
    return s.exists ? (s.data() as BookRecord) : null;
  },

  async listBooks(): Promise<BookRecord[]> {
    const s = await books().get();
    return s.docs.map((d) => d.data() as BookRecord);
  },

  async createJob(job: IngestionJob): Promise<void> {
    await jobs().doc(job.jobId).set(clean(job));
  },

  async updateJob(jobId: string, patch: Partial<IngestionJob>): Promise<void> {
    await jobs().doc(jobId).set(clean(patch), { merge: true });
  },

  async getJob(jobId: string): Promise<IngestionJob | null> {
    const s = await jobs().doc(jobId).get();
    return s.exists ? (s.data() as IngestionJob) : null;
  },

  async existingIds(bookId: string): Promise<Map<string, { createdAt?: string; status?: string }>> {
    const s = await questions().where('bookId', '==', bookId).select('createdAt', 'status').get();
    return new Map(s.docs.map((d) => [d.id, d.data() as any]));
  },

  /** Batched writes (Firestore caps a batch at 500 operations). */
  async writeQuestions(docs: BookQuestionDoc[]): Promise<void> {
    for (let i = 0; i < docs.length; i += 400) {
      const batch = db.batch();
      for (const d of docs.slice(i, i + 400)) batch.set(questions().doc(d.id), clean(d as any), { merge: true });
      await batch.commit();
    }
  },

  /** Rows a newer extraction no longer produces are kept for the audit trail, just taken out of use. */
  async markSuperseded(ids: string[], jobId: string): Promise<void> {
    const now = new Date().toISOString();
    for (let i = 0; i < ids.length; i += 400) {
      const batch = db.batch();
      for (const id of ids.slice(i, i + 400)) {
        batch.set(questions().doc(id), { status: 'QUARANTINED', quarantineReason: 'not_in_latest_extraction', supersededByJobId: jobId, updatedAt: now }, { merge: true });
      }
      await batch.commit();
    }
  },

  async listQuestions(filter: { bookId: string; chapterOrdinal?: number; status?: BookQuestionStatus; limit?: number; startAfterId?: string }): Promise<BookQuestionDoc[]> {
    let q: FirebaseFirestore.Query = questions().where('bookId', '==', filter.bookId);
    if (filter.chapterOrdinal !== undefined) q = q.where('chapterOrdinal', '==', filter.chapterOrdinal);
    if (filter.status) q = q.where('status', '==', filter.status);
    q = q.orderBy('__name__').limit(Math.min(filter.limit || 50, 200));
    if (filter.startAfterId) q = q.startAfter(filter.startAfterId);
    const s = await q.get();
    return s.docs.map((d) => d.data() as BookQuestionDoc);
  },
};
