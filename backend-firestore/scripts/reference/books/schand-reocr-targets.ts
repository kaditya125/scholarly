/**
 * S. Chand Reasoning — verbal questions whose options the OCR dropped: list them with their PDF page.
 *
 * S. Chand prints options as a 2×2 grid, "(a) … (b) …" over "(c) … (d) …"; the first OCR often read
 * only the left half, so (b)/(d) vanished and the parser quarantined the row as options_incomplete.
 * Targets: current extraction (v1.1), verbal chapters, a real text stem, a printed key.
 * The PDF page is where the first OCR has this question's number line followed by its stem — the
 * printed page markers alone are not reliable enough to pick one scanned page.
 *
 *   npx tsx scripts/reference/books/schand-reocr-targets.ts   → dataset_staging/schand/reasoning/reocr/targets.json
 */
import 'dotenv/config';
import * as fs from 'fs';
import * as path from 'path';
import { db } from '../../../src/config/firebase';

const DIR = path.resolve(process.cwd(), '..', 'dataset_staging', 'schand', 'reasoning');
const FIGURE_STEM = /FIGURE|\| ---|!\[|\(I\)|\(II\)/i;
const verbalChapter = (n: number) => n <= 18 || n >= 39;
const norm = (t: string) => t.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

(async () => {
  const snap = await db.collection('book_questions').where('bookId', '==', 'schand_reasoning')
    .where('quarantineReason', '==', 'options_incomplete').get();
  const rows = snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }))
    .filter((r) => r.extractionVersion === 'bookextract-v1.1' && r.status === 'QUARANTINED' && verbalChapter(r.chapterOrdinal)
      && String(r.stem || '').trim().length > 0 && !FIGURE_STEM.test(String(r.stem)) && r.answerKey);

  const ocr = fs.readdirSync(path.join(DIR, 'ocr')).filter((f) => f.endsWith('.json')).sort().map((f) => {
    const j = JSON.parse(fs.readFileSync(path.join(DIR, 'ocr', f), 'utf8'));
    return { start: j.pdfPageStart as number, end: j.pdfPageEnd as number, text: norm(String(j.markdown || '')) };
  });

  const targets: any[] = []; let unplaced = 0;
  for (const r of rows) {
    const probe = `${r.questionNumber} ${norm(r.stem).split(' ').slice(0, 8).join(' ')}`;
    const hits = ocr.filter((o) => o.text.includes(probe));
    if (hits.length !== 1) { unplaced++; continue; }
    // Some first-pass OCR slices cover two PDF pages: re-read both, the match decides which it was on.
    const pdfPages = Array.from({ length: hits[0].end - hits[0].start + 1 }, (_, k) => hits[0].start + k);
    targets.push({
      id: r.id, chapterName: r.chapterName, chapterOrdinal: r.chapterOrdinal, sourceSection: r.sourceSection,
      questionNumber: r.questionNumber, sourcePage: r.sourcePage, pdfPages,
      stem: r.stem, options: r.options || [], answerKey: r.answerKey,
    });
  }
  fs.mkdirSync(path.join(DIR, 'reocr'), { recursive: true });
  fs.writeFileSync(path.join(DIR, 'reocr', 'targets.json'), JSON.stringify(targets, null, 1));
  const pages = new Set(targets.flatMap((t) => t.pdfPages));
  console.log(`targets ${targets.length} of ${rows.length} (unplaced ${unplaced}) on ${pages.size} PDF pages`);
  process.exit(0);
})().catch((e) => { console.error(e?.message || e); process.exit(1); });
