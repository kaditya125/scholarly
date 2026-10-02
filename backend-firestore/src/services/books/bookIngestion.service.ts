/**
 * Book ingestion — runs the question parser over a book's OCR pages and stores the result in the
 * private bank (`book_questions`), tracked by a `book_ingestion_jobs` record.
 *
 * Only licensed books are ingested: the caller must pass the book's licence attestation, and the
 * job refuses to run for a book recorded as unlicensed.
 *
 * Idempotent: question ids are deterministic (book + chapter + set + number), so a re-run updates
 * rows in place and keeps their original createdAt. Rows a newer extraction no longer produces are
 * marked QUARANTINED / not_in_latest_extraction (kept for audit and takedown), never deleted.
 */
import { randomUUID } from 'crypto';
import { logger } from '../../utils/logger';
import { parseBook, EXTRACTION_VERSION, OcrPage, ParseOptions } from './bookQuestionParser';
import { parseEnglishBook } from './englishExerciseParser';
import { parseTypedBook } from './typedSectionsLayout';
import {
  bookQuestionsRepository, bookQuestionId, BookRecord, BookQuestionDoc, IngestionJob,
} from '../../repositories/bookQuestions.repository';

export interface IngestBookInput {
  book: Omit<BookRecord, 'createdAt' | 'updatedAt' | 'lastIngestionJobId' | 'stats'>;
  pages: OcrPage[];
  parse: ParseOptions;
  /** Parse and report only — write nothing. */
  dryRun?: boolean;
}

export interface IngestBookResult {
  jobId: string;
  status: IngestionJob['status'];
  counts: NonNullable<IngestionJob['counts']>;
  quarantineReasons: Record<string, number>;
  perChapter: NonNullable<IngestionJob['perChapter']>;
}

/** Below this share of usable questions a run is PARTIAL — worth a look before relying on it. */
const PARTIAL_BELOW = 0.6;

export const bookIngestionService = {
  async ingest(input: IngestBookInput): Promise<IngestBookResult> {
    const { book, pages, parse, dryRun } = input;
    if (book.licenseStatus !== 'licensed') {
      throw new Error(`Refusing to ingest ${book.bookId}: licenseStatus is ${book.licenseStatus}`);
    }
    const jobId = `bookjob_${book.bookId}_${Date.now()}_${randomUUID().slice(0, 8)}`;
    const startedAt = new Date().toISOString();
    if (!dryRun) {
      await bookQuestionsRepository.upsertBook(book);
      await bookQuestionsRepository.createJob({ jobId, bookId: book.bookId, status: 'PROCESSING', extractionVersion: EXTRACTION_VERSION, startedAt });
    }

    try {
      if (!dryRun) await bookQuestionsRepository.updateJob(jobId, { status: 'EXTRACTING' });
      const { chapters, questions } = parse.layout === 'english-exercises' ? parseEnglishBook(pages, parse)
        : parse.layout === 'typed-sections' ? parseTypedBook(pages, parse)
        : parseBook(pages, parse);

      const now = new Date().toISOString();
      const existing = dryRun ? new Map() : await bookQuestionsRepository.existingIds(book.bookId);
      const docs: BookQuestionDoc[] = questions.map((q) => {
        const id = bookQuestionId(book.bookId, q);
        return {
          ...q,
          quarantineReason: q.quarantineReason,
          id,
          bookId: book.bookId,
          subject: book.subject,
          chapterId: `${book.bookId}:ch${q.chapterOrdinal}`,
          // A re-run must not discard classification: an unchanged question keeps CLASSIFIED; one
          // whose text changed drops back to EXTRACTED so it gets reclassified.
          status: q.quarantineReason
            ? 'QUARANTINED'
            : existing.get(id)?.status === 'CLASSIFIED' && existing.get(id)?.originalQuestionHash === q.originalQuestionHash ? 'CLASSIFIED' : 'EXTRACTED',
          extractionVersion: EXTRACTION_VERSION,
          jobId,
          createdAt: existing.get(id)?.createdAt || now,
          updatedAt: now,
        };
      });

      // Two questions mapping to one id would silently overwrite each other in the batch write.
      const dupes = docs.length - new Set(docs.map((d) => d.id)).size;
      if (dupes > 0) throw new Error(`${dupes} question id collision(s) in ${book.bookId} — refusing to write`);

      const reasons: Record<string, number> = {};
      for (const d of docs) if (d.quarantineReason) reasons[d.quarantineReason] = (reasons[d.quarantineReason] || 0) + 1;
      const perChapter = chapters.map((c) => {
        const inCh = docs.filter((d) => d.chapterOrdinal === c.ordinal);
        return { ordinal: c.ordinal, name: c.name, questions: inCh.length, extracted: inCh.filter((d) => d.status !== 'QUARANTINED').length };
      });
      const producedIds = new Set(docs.map((d) => d.id));
      const superseded = [...existing.keys()].filter((id) => !producedIds.has(id) && existing.get(id)?.status !== 'QUARANTINED');
      const extracted = docs.filter((d) => d.status !== 'QUARANTINED').length;
      const counts = { chapters: chapters.length, questions: docs.length, extracted, quarantined: docs.length - extracted, superseded: superseded.length };
      const status: IngestionJob['status'] = docs.length === 0 ? 'FAILED' : extracted / docs.length < PARTIAL_BELOW ? 'PARTIAL' : 'COMPLETED';

      if (!dryRun) {
        await bookQuestionsRepository.updateJob(jobId, { status: 'INDEXING' });
        await bookQuestionsRepository.writeQuestions(docs);
        if (superseded.length) await bookQuestionsRepository.markSuperseded(superseded, jobId);
        await bookQuestionsRepository.updateJob(jobId, { status, finishedAt: new Date().toISOString(), counts, quarantineReasons: reasons, perChapter });
        await bookQuestionsRepository.upsertBook({
          ...book,
          lastIngestionJobId: jobId,
          stats: { chapters: counts.chapters, questions: counts.questions, extracted: counts.extracted, quarantined: counts.quarantined },
        } as any);
      }
      logger.info('[BookIngestion] done', { bookId: book.bookId, jobId, dryRun: Boolean(dryRun), status, ...counts });
      return { jobId, status, counts, quarantineReasons: reasons, perChapter };
    } catch (e: any) {
      if (!dryRun) await bookQuestionsRepository.updateJob(jobId, { status: 'FAILED', finishedAt: new Date().toISOString(), error: String(e?.message || e) }).catch(() => {});
      throw e;
    }
  },
};
