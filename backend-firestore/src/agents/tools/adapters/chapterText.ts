/**
 * The text of a curriculum chapter, read from the NCERT PDF itself — the source a formula is
 * verified against. Read through the repo's one PDF-text implementation (FileParserService,
 * pdf-parse v2), per page, so a verified formula can cite the page it is on.
 *
 * Reading a chapter costs a ~2 MB download and ~4 s of parsing, so pages are cached per chapter
 * for an hour; chapters do not change once ingested.
 */

export interface ChapterPages {
  notebookId: string;
  sourceId: string;
  pages: Array<{ pageNumber: number; text: string }>;
  chars: number;
}

const TTL_MS = 60 * 60 * 1000;
const MAX_ENTRIES = 12;
const cache = new Map<string, { value: ChapterPages; at: number }>();

export class ChapterTextError extends Error {
  constructor(readonly code: 'NOT_CURRICULUM' | 'NO_SOURCE' | 'NO_FILE' | 'NO_TEXT', message: string) {
    super(message);
    this.name = 'ChapterTextError';
  }
}

export async function loadChapterPages(notebookId: string, sourceId: string): Promise<ChapterPages> {
  const key = `${notebookId}/${sourceId}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.value;

  // Same boundary as every curriculum tool: only the shared NCERT corpus can be read.
  const { bookLibraryService } = require('../../../services/bookLibrary.service');
  if (!(await bookLibraryService.getBookDetail(notebookId))) {
    throw new ChapterTextError('NOT_CURRICULUM', 'That notebook is not part of the shared curriculum corpus.');
  }
  const { notebookRepository } = require('../../../repositories/notebook.repository');
  const source = (await notebookRepository.getSources(notebookId)).find((s: any) => s.id === sourceId);
  if (!source) throw new ChapterTextError('NO_SOURCE', 'That chapter is not in the book.');
  const storagePath: string = source.storagePath || String(source.gcsPath ?? '').replace(/^gs:\/\/[^/]+\//, '');
  if (!storagePath) throw new ChapterTextError('NO_FILE', 'The chapter has no stored PDF to read.');

  const { firebaseApp } = require('../../../config/firebase');
  const { env } = require('../../../config/env');
  const bucket = env.FIREBASE_STORAGE_BUCKET ? firebaseApp.storage().bucket(env.FIREBASE_STORAGE_BUCKET) : firebaseApp.storage().bucket();
  const [buffer] = await bucket.file(storagePath).download();

  const { FileParserService } = require('../../../services/fileParser.service');
  const pages: Array<{ pageNumber: number; text: string }> = await FileParserService.extractText(
    Buffer.from(buffer).toString('base64'),
    'application/pdf',
    'chapter.pdf',
  );
  const chars = pages.reduce((n, p) => n + (p.text?.length ?? 0), 0);
  if (chars < 500) throw new ChapterTextError('NO_TEXT', 'The chapter PDF has no readable text to check formulae against.');

  const value: ChapterPages = { notebookId, sourceId, pages, chars };
  if (cache.size >= MAX_ENTRIES) cache.delete(cache.keys().next().value as string);
  cache.set(key, { value, at: Date.now() });
  return value;
}

/** Tests only. */
export function clearChapterTextCache(): void {
  cache.clear();
}
