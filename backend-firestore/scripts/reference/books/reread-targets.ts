/**
 * Rows whose TEXT the first OCR damaged (options missing/empty/run-on, OCR-duplicated options), for any
 * book: list them with their PDF page(s) for reread_pages.py. Supersedes schand-reocr-targets.ts.
 *
 * Targets: live quarantined rows (not superseded, not duplicates, not replaced by a figure row) with
 * reason options_incomplete | empty_option | oversize_text | duplicate_options, a real text stem, key or
 * not (a keyless row whose options get completed moves on to the AI-verified key step).
 * PDF page = where the first OCR has the row's number + the start of its stem.
 *
 *   npx tsx scripts/reference/books/reread-targets.ts <bookKey>  → dataset_staging/<book>/reread/targets.json
 */
import 'dotenv/config';
import * as fs from 'fs';
import * as path from 'path';
import { db } from '../../../src/config/firebase';
import { BOOKS } from './contract';

const book = process.argv[2];
const REASONS = new Set(['options_incomplete', 'empty_option', 'oversize_text', 'duplicate_options']);
const FIGURE_STEM = /FIGURE|\| ---|!\[|\(I\)|\(II\)/i;
const norm = (t: unknown) => String(t ?? '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

(async () => {
  const cfg = BOOKS[book];
  if (!cfg) throw new Error(`unknown book ${book}`);
  const DIR = path.resolve(process.cwd(), '..', 'dataset_staging', ...cfg.stagingDir.split('/'));
  const rows = (await db.collection('book_questions').where('bookId', '==', book).where('status', '==', 'QUARANTINED').get()).docs
    .map((d) => ({ id: d.id, ...(d.data() as any) }))
    .filter((r) => r.extractionSource !== 'figure' && REASONS.has(r.quarantineReason)
      && norm(r.stem).split(' ').length >= 2 && !FIGURE_STEM.test(String(r.stem)));

  const ocr = fs.readdirSync(path.join(DIR, 'ocr')).filter((f) => f.endsWith('.json')).sort().map((f) => {
    const j = JSON.parse(fs.readFileSync(path.join(DIR, 'ocr', f), 'utf8'));
    const pages = (j.pdfPageStart ?? j.page) !== undefined
      ? Array.from({ length: (j.pdfPageEnd ?? j.pdfPageStart ?? j.page) - (j.pdfPageStart ?? j.page) + 1 }, (_, k) => (j.pdfPageStart ?? j.page) + k)
      : [Number((f.match(/p(\d+)/) || [])[1])];
    return { pages, text: norm(String(j.markdown || j.text || '')) };
  });

  const targets: any[] = []; let unplaced = 0;
  for (const r of rows) {
    const probe = `${r.questionNumber} ${norm(r.stem).split(' ').slice(0, 6).join(' ')}`;
    const hits = ocr.filter((o) => o.text.includes(probe));
    if (hits.length !== 1) { unplaced++; continue; }
    targets.push({
      id: r.id, bookId: book, chapterName: r.chapterName, chapterOrdinal: r.chapterOrdinal, sourceSection: r.sourceSection,
      questionNumber: r.questionNumber, sourcePage: r.sourcePage, pdfPages: hits[0].pages, reason: r.quarantineReason,
      stem: r.stem, options: r.options || [], answerKey: r.answerKey ?? null,
    });
  }
  fs.mkdirSync(path.join(DIR, 'reread'), { recursive: true });
  fs.writeFileSync(path.join(DIR, 'reread', 'targets.json'), JSON.stringify(targets, null, 1));
  const byReason: Record<string, number> = {};
  for (const t of targets) byReason[t.reason] = (byReason[t.reason] || 0) + 1;
  console.log(`${book}: targets ${targets.length} of ${rows.length} (unplaced ${unplaced}) on ${new Set(targets.flatMap((t) => t.pdfPages)).size} PDF pages ${JSON.stringify(byReason)}; keyless ${targets.filter((t) => !t.answerKey).length}`);
  process.exit(0);
})().catch((e) => { console.error(e?.message || e); process.exit(1); });
