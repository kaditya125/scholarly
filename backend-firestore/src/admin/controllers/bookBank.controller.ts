import { Request, Response, NextFunction } from 'express';
import { db } from '../../config/firebase';
import { bookQuestionsRepository, BookQuestionStatus } from '../../repositories/bookQuestions.repository';

/**
 * Admin view of the private reference-book question bank. Returns licensed source text, so these
 * routes are mounted behind requireRoles(['super_admin', 'admin']) — never a student surface.
 */
export class BookBankController {
  /** GET /admin/books — every ingested book with its latest stats. */
  listBooks = async (_req: Request, res: Response, next: NextFunction) => {
    try {
      res.json({ books: await bookQuestionsRepository.listBooks() });
    } catch (e) { next(e); }
  };

  /** GET /admin/books/:bookId/status — the book plus its latest ingestion job (per-chapter counts). */
  getStatus = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const book = await bookQuestionsRepository.getBook(req.params.bookId);
      if (!book) return res.status(404).json({ error: 'Book not found' });
      const job = book.lastIngestionJobId ? await bookQuestionsRepository.getJob(book.lastIngestionJobId) : null;
      res.json({ book, job });
    } catch (e) { next(e); }
  };

  /** GET /admin/books/:bookId/chapters — per chapter: syllabus mapping per exam, taxonomy, coverage. */
  listChapters = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const snap = await db.collection('book_chapters').where('bookId', '==', req.params.bookId).get();
      const chapters = snap.docs.map((d) => d.data()).sort((a: any, b: any) => a.chapterOrdinal - b.chapterOrdinal);
      res.json({ chapters });
    } catch (e) { next(e); }
  };

  /** GET /admin/book-questions?bookId=&chapter=&status=&limit=&after= — paged private questions. */
  listQuestions = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const bookId = String(req.query.bookId || '');
      if (!bookId) return res.status(400).json({ error: 'bookId is required' });
      const status = ['EXTRACTED', 'CLASSIFIED', 'QUARANTINED'].includes(String(req.query.status)) ? (req.query.status as BookQuestionStatus) : undefined;
      const chapter = req.query.chapter !== undefined ? Number(req.query.chapter) : undefined;
      const questions = await bookQuestionsRepository.listQuestions({
        bookId,
        status,
        chapterOrdinal: Number.isFinite(chapter) ? chapter : undefined,
        limit: Number(req.query.limit) || 50,
        startAfterId: req.query.after ? String(req.query.after) : undefined,
      });
      res.json({ questions, next: questions.length ? questions[questions.length - 1].id : null });
    } catch (e) { next(e); }
  };
}
