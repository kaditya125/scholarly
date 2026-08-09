import { Request, Response } from 'express';
import { PDFDocument } from 'pdf-lib';
import { notebookRepository } from '../repositories/notebook.repository';
import { cacheService } from './cache.service';
import { ncertCoverUrl } from './ncertBookCodes';
import { Notebook, DocumentSource, isReadyStatus } from '../types';
import { firebaseApp } from '../config/firebase';
import { env } from '../config/env';

export interface BookSummary {
  notebookId: string;
  title: string;
  subject: string;
  className?: string; // e.g. "Class 10" — parsed from the notebook title when present
  bookName?: string;
  chapterCount: number;
  readyChapterCount: number;
  estimatedStudyHours: number;
  updatedAt: number;
}

export interface BookChapter {
  sourceId: string;
  title: string;              // source title, e.g. "NCERT Class 10 Science - Chapter 2"
  chapterName?: string;       // real chapter name, e.g. "Acids, Bases and Salts"
  status: DocumentSource['status'];
  totalPages?: number;
  headings: string[];         // section headings within the chapter
  learningObjectives: string[];
  keyConcepts: { term: string; definition: string }[];
  importantFacts: string[];
  keywords: string[];
  formulae: string[];
  estimatedStudyTimeMinutes?: number;
  difficulty?: 'Easy' | 'Medium' | 'Hard';
}

export interface BookDetail extends BookSummary {
  description?: string;
  chapters: BookChapter[];
}

// Every book in the catalog today comes from the shared, admin-ingested NCERT corpus
// (see scripts/ingest_curriculum.ts), which stamps notebook ids with this prefix and
// owns them under a synthetic user id. Restricting reads to this prefix is a deliberate,
// hard security boundary: it means this "public" catalog endpoint can NEVER leak a real
// student's private notebook, no matter what notebookId is requested.
const CURRICULUM_ID_PREFIX = 'ncert-';
const CURRICULUM_OWNER = 'ncert-curriculum';

/**
 * Fetches a cover PDF with a few retries. NCERT's server occasionally resets the connection
 * (ECONNRESET) mid-handshake, so a single attempt would spuriously drop real covers. A genuine
 * 404 (no such prelims file) returns null immediately (no retry) so it falls back cleanly.
 */
async function fetchCoverPdf(url: string, attempts = 3): Promise<Buffer | null> {
  for (let i = 0; i < attempts; i++) {
    try {
      const resp = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
      if (resp.status === 404) return null; // real miss — don't retry
      if (!resp.ok) {
        if (i < attempts - 1) { await new Promise((r) => setTimeout(r, 400 * (i + 1))); continue; }
        return null;
      }
      const buf = Buffer.from(await resp.arrayBuffer());
      if (buf.slice(0, 4).toString('latin1') !== '%PDF') return null;
      return buf;
    } catch (err) {
      if (i < attempts - 1) { await new Promise((r) => setTimeout(r, 400 * (i + 1))); continue; }
      throw err;
    }
  }
  return null;
}

function isCurriculumNotebook(nb: Notebook): boolean {
  // Some legacy notebook docs don't carry an `id` field (only the Firestore doc id) —
  // guard defensively rather than throwing, since this filters a broad admin listing.
  return typeof nb.id === 'string' && nb.id.startsWith(CURRICULUM_ID_PREFIX) && (nb.owner === CURRICULUM_OWNER || nb.userId === CURRICULUM_OWNER);
}

/** Parses "NCERT Class 12 Physics (Part 1)" style titles into subject + class for display/filtering. */
function parseBookTitle(title: string): { subject: string; className?: string; bookName?: string } {
  const classMatch = title.match(/Class\s+(\d+)/i);
  const bookNameMatch = title.match(/\(([^)]+)\)/);
  let subject = title
    .replace(/^NCERT\s*/i, '')
    .replace(/Class\s+\d+\s*/i, '')
    .replace(/\([^)]*\)/g, '')
    .trim();
  return {
    subject: subject || 'General',
    className: classMatch ? `Class ${classMatch[1]}` : undefined,
    bookName: bookNameMatch ? bookNameMatch[1] : undefined,
  };
}

export class BookLibraryService {
  /**
   * Full catalog of curriculum books, one card per notebook, aggregated from that
   * notebook's sources (chapters). Cached briefly since the catalog changes only when an
   * admin runs the ingestion script, not on every page load.
   */
  async listBooks(): Promise<BookSummary[]> {
    const cacheKey = 'book_library:list';
    const cached = await cacheService.get<BookSummary[]>(cacheKey);
    if (cached) return cached;

    const curriculumNotebooks = await notebookRepository.getCurriculumNotebooks();

    // Fast path: read summary counters that are stored on the notebook doc itself during
    // ingestion (chapterCount, readyChapterCount, estimatedStudyHours). This avoids
    // N×getSources() subcollection reads that make the cold-cache load very slow.
    // Slow path: if those fields are missing (older notebooks pre-dating this optimisation),
    // we fall back to counting sources the old way.
    const notebooks_needing_sources = curriculumNotebooks.filter(
      (nb: any) => nb.chapterCount == null || nb.readyChapterCount == null
    );

    // Batch-fetch sources only for notebooks that are missing the summary fields.
    const sourcesMap = new Map<string, any[]>();
    await Promise.all(
      notebooks_needing_sources.map(async (nb: Notebook) => {
        const sources = await notebookRepository.getSources(nb.id);
        sourcesMap.set(nb.id, sources);
      })
    );

    const books = curriculumNotebooks.map((nb: any) => {
      const { subject, className, bookName } = parseBookTitle(nb.title);

      // Use pre-computed summary fields when available.
      if (nb.chapterCount != null && nb.readyChapterCount != null) {
        return {
          notebookId: nb.id,
          title: nb.title,
          subject,
          className,
          bookName,
          chapterCount: nb.chapterCount,
          readyChapterCount: nb.readyChapterCount,
          estimatedStudyHours: nb.estimatedStudyHours || 0,
          updatedAt: nb.updatedAt,
        } as BookSummary;
      }

      // Slow path fallback.
      const sources = sourcesMap.get(nb.id) || [];
      const readyChapterCount = sources.filter((s: any) => isReadyStatus(s.status)).length;
      const estimatedStudyHours = Math.round(
        sources.reduce((sum: number, s: any) => sum + (s.metadata?.estimatedStudyTimeMinutes || 0), 0) / 60
      );
      return {
        notebookId: nb.id,
        title: nb.title,
        subject,
        className,
        bookName,
        chapterCount: sources.length,
        readyChapterCount,
        estimatedStudyHours,
        updatedAt: nb.updatedAt,
      } as BookSummary;
    });

    // Only show books with at least one usable chapter.
    const usable = books.filter((b: BookSummary) => b.readyChapterCount > 0);
    usable.sort((a: BookSummary, b: BookSummary) =>
      (a.className || '').localeCompare(b.className || '') || a.subject.localeCompare(b.subject)
    );

    await cacheService.set(cacheKey, usable, 3600); // 1 hour — NCERT catalog rarely changes
    return usable;
  }

  /** Chapter-level breakdown for one book, for the overview screen. */
  async getBookDetail(notebookId: string): Promise<BookDetail | null> {
    if (!notebookId.startsWith(CURRICULUM_ID_PREFIX)) return null; // hard boundary, see above

    const cacheKey = `book_library:detail:${notebookId}`;
    const cached = await cacheService.get<BookDetail>(cacheKey);
    if (cached) return cached;

    const nb = await notebookRepository.getByIdAdmin(notebookId);
    if (!nb || !isCurriculumNotebook(nb)) return null;

    const sources = await notebookRepository.getSources(notebookId);
    const usableSources = sources.filter((s) => isReadyStatus(s.status));
    if (usableSources.length === 0) return null;

    const { subject, className, bookName } = parseBookTitle(nb.title);
    const chapters: BookChapter[] = usableSources
      // Part + chapter numbers are embedded in the title ("... (Part 2) - Chapter 4.pdf"). Multi-part
      // books (e.g. Class 12 Physics/Chemistry) restart chapter numbering per part, so we must order
      // by (part, chapter) — sorting on the chapter number alone interleaves Part 1 and Part 2.
      // Single-part books have no "(Part N)" so part = 0 for all and this is identical to before.
      .map((s) => ({
        source: s,
        part: parseInt((s.title.match(/Part\s+(\d+)/i) || [])[1] || '0', 10),
        num: parseInt((s.title.match(/Chapter\s+(\d+)/i) || [])[1] || '0', 10),
      }))
      .sort((a, b) => a.part - b.part || a.num - b.num)
      .map(({ source: s }) => {
        const m = s.metadata;
        return {
          sourceId: s.id,
          title: s.title.replace(/\.pdf$/i, ''),
          chapterName: m?.chapters?.[0],
          status: s.status,
          totalPages: s.totalPages,
          headings: m?.headings || [],
          learningObjectives: m?.learningObjectives || [],
          keyConcepts: m?.definitions || [],
          importantFacts: m?.importantFacts || [],
          keywords: m?.keywords || [],
          formulae: m?.formulae || [],
          estimatedStudyTimeMinutes: m?.estimatedStudyTimeMinutes,
          difficulty: m?.difficultyLevel,
        };
      });

    const detail: BookDetail = {
      notebookId,
      title: nb.title,
      subject,
      className,
      bookName,
      // `description` isn't part of the typed Notebook interface, but ingest_curriculum.ts
      // writes it via an `any`-typed object, so it's present on curriculum notebooks at runtime.
      description: (nb as any).description || `Official NCERT ${subject} textbook${className ? ` (${className})` : ''}.`,
      chapterCount: sources.length,
      readyChapterCount: usableSources.length,
      estimatedStudyHours: Math.round(chapters.reduce((sum, c) => sum + (c.estimatedStudyTimeMinutes || 0), 0) / 60),
      updatedAt: nb.updatedAt,
      chapters,
    };

    await cacheService.set(cacheKey, detail, 300);
    return detail;
  }

  /**
   * Streams the REAL book cover — page 1 of the book's official NCERT "prelims" PDF
   * (`<code>1ps.pdf`), which is the illustrated front cover. Only page 1 is extracted server-side
   * (via pdf-lib) so the client gets a small cover, not the whole prelims section. Cached for a
   * week since covers never change. If the book has no known NCERT code or the fetch fails, we
   * 404 — the client then shows its designed subject-cover fallback (never the inner chapter page).
   */
  async streamCover(notebookId: string, _req: Request, res: Response): Promise<void> {
    if (!notebookId.startsWith(CURRICULUM_ID_PREFIX)) {
      res.status(404).json({ error: 'Book not found' });
      return;
    }

    const cacheKey = `book_library:cover_bytes:${notebookId}`;
    const cachedBase64 = await cacheService.get<string>(cacheKey);
    if (cachedBase64) {
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Cache-Control', 'public, max-age=604800');
      res.send(Buffer.from(cachedBase64, 'base64'));
      return;
    }

    const coverUrl = ncertCoverUrl(notebookId);
    if (!coverUrl) {
      res.status(404).json({ error: 'No cover available for this book' });
      return;
    }

    try {
      const fullBuf = await fetchCoverPdf(coverUrl);
      if (!fullBuf) {
        res.status(404).json({ error: 'Cover not available upstream' });
        return;
      }

      // Extract ONLY page 1 (the cover) so the client downloads a small file, not the whole
      // prelims section (title page, foreword, contents, etc.).
      const fullDoc = await PDFDocument.load(fullBuf, { ignoreEncryption: true });
      const coverDoc = await PDFDocument.create();
      const [firstPage] = await coverDoc.copyPages(fullDoc, [0]);
      coverDoc.addPage(firstPage);
      const coverBuf = Buffer.from(await coverDoc.save());

      await cacheService.set(cacheKey, coverBuf.toString('base64'), 604800); // 7 days

      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Cache-Control', 'public, max-age=604800');
      res.send(coverBuf);
    } catch (err) {
      console.error(`[BookLibrary] Failed to fetch NCERT cover for ${notebookId}:`, err);
      res.status(502).json({ error: 'Failed to fetch cover' });
    }
  }

  /**
   * Streams a chapter's original PDF bytes from Firebase Storage so the in-app reader can render it
   * (pdf.js consumes the bytes client-side). Same hard security boundary as streamCover: only the
   * shared NCERT curriculum corpus is ever served, so this can never leak a real student's private
   * upload. Sources whose PDF wasn't stored (older/degraded ingests with no gcsPath) 404 cleanly so
   * the client can fall back. Storage path is resolved from storagePath || gcsPath (the two ingest
   * paths differ — see backfill_storage.ts).
   */
  async streamChapterPdf(notebookId: string, sourceId: string, res: Response): Promise<void> {
    if (!notebookId.startsWith(CURRICULUM_ID_PREFIX)) { res.status(404).json({ error: 'Book not found' }); return; }
    if (!env.FIREBASE_STORAGE_BUCKET) { res.status(404).json({ error: 'PDF storage not configured' }); return; }

    const nb = await notebookRepository.getByIdAdmin(notebookId);
    if (!nb || !isCurriculumNotebook(nb)) { res.status(404).json({ error: 'Book not found' }); return; }

    const sources = await notebookRepository.getSources(notebookId);
    const source = sources.find((s) => s.id === sourceId);
    if (!source) { res.status(404).json({ error: 'Chapter not found' }); return; }

    const storagePath = source.storagePath || (source.gcsPath ? source.gcsPath.replace(/^gs:\/\/[^/]+\//, '') : '');
    if (!storagePath) { res.status(404).json({ error: 'Chapter PDF not available for this chapter' }); return; }

    try {
      const file = firebaseApp.storage().bucket(env.FIREBASE_STORAGE_BUCKET).file(storagePath);
      const [exists] = await file.exists();
      if (!exists) { res.status(404).json({ error: 'Chapter PDF not found in storage' }); return; }

      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Cache-Control', 'public, max-age=604800'); // curriculum PDFs are immutable
      res.setHeader('Content-Disposition', `inline; filename="${sourceId}.pdf"`);
      file.createReadStream()
        .on('error', (err) => {
          console.error(`[BookLibrary] chapter PDF stream error ${notebookId}/${sourceId}:`, err);
          if (!res.headersSent) res.status(502).json({ error: 'Failed to stream chapter PDF' });
          else res.end();
        })
        .pipe(res);
    } catch (err) {
      console.error(`[BookLibrary] Failed to serve chapter PDF ${notebookId}/${sourceId}:`, err);
      if (!res.headersSent) res.status(502).json({ error: 'Failed to fetch chapter PDF' });
    }
  }

  /**
   * Streams the REAL first page of a chapter's stored PDF as a small single-page PDF (extracted
   * server-side via pdf-lib), so cards can show the chapter's actual opening page without the
   * client downloading the whole chapter. Cached for a week (curriculum PDFs are immutable). Same
   * hard curriculum-only security boundary as the other book endpoints; 404s cleanly when a chapter
   * has no stored PDF so the client keeps its synthesized fallback.
   */
  async streamChapterCover(notebookId: string, sourceId: string, res: Response): Promise<void> {
    if (!notebookId.startsWith(CURRICULUM_ID_PREFIX)) { res.status(404).json({ error: 'Book not found' }); return; }
    if (!env.FIREBASE_STORAGE_BUCKET) { res.status(404).json({ error: 'PDF storage not configured' }); return; }

    const cacheKey = `book_library:chapter_cover_bytes:${notebookId}:${sourceId}`;
    const cachedBase64 = await cacheService.get<string>(cacheKey);
    if (cachedBase64) {
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Cache-Control', 'public, max-age=604800');
      res.send(Buffer.from(cachedBase64, 'base64'));
      return;
    }

    const nb = await notebookRepository.getByIdAdmin(notebookId);
    if (!nb || !isCurriculumNotebook(nb)) { res.status(404).json({ error: 'Book not found' }); return; }

    const sources = await notebookRepository.getSources(notebookId);
    const source = sources.find((s) => s.id === sourceId);
    if (!source) { res.status(404).json({ error: 'Chapter not found' }); return; }

    const storagePath = source.storagePath || (source.gcsPath ? source.gcsPath.replace(/^gs:\/\/[^/]+\//, '') : '');
    if (!storagePath) { res.status(404).json({ error: 'Chapter PDF not available for this chapter' }); return; }

    try {
      const file = firebaseApp.storage().bucket(env.FIREBASE_STORAGE_BUCKET).file(storagePath);
      const [exists] = await file.exists();
      if (!exists) { res.status(404).json({ error: 'Chapter PDF not found in storage' }); return; }

      const [fullBuf] = await file.download();

      // Extract ONLY page 1 so the client downloads a tiny cover, not the whole chapter PDF.
      const fullDoc = await PDFDocument.load(fullBuf, { ignoreEncryption: true });
      const coverDoc = await PDFDocument.create();
      const [firstPage] = await coverDoc.copyPages(fullDoc, [0]);
      coverDoc.addPage(firstPage);
      const coverBuf = Buffer.from(await coverDoc.save());

      await cacheService.set(cacheKey, coverBuf.toString('base64'), 604800); // 7 days

      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Cache-Control', 'public, max-age=604800');
      res.send(coverBuf);
    } catch (err) {
      console.error(`[BookLibrary] Failed to build chapter cover ${notebookId}/${sourceId}:`, err);
      if (!res.headersSent) res.status(502).json({ error: 'Failed to build chapter cover' });
    }
  }
}

export const bookLibraryService = new BookLibraryService();
