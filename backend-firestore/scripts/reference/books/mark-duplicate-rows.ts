/**
 * Quarantined rows that are the SAME question as a usable row of the same book — the first-pass OCR
 * read some pages twice (overlapping slices), so a damaged copy sits beside the good one. Same
 * normalised stem (≥ 12 chars) and same question number → quarantineReason 'duplicate_of_usable',
 * duplicateOf = the usable row's id. Nothing is deleted; the copy just stops counting as work to do.
 *
 *   npx tsx scripts/reference/books/mark-duplicate-rows.ts [--apply]
 */
import 'dotenv/config';
import { db } from '../../../src/config/firebase';

const apply = process.argv.includes('--apply');
const norm = (t: unknown) => String(t ?? '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

(async () => {
  let total = 0;
  for (const book of ['schand_reasoning', 'schand_quant', 'ry_ssc_reasoning', 'lucent_english', 'lucent_science']) {
    const all = (await db.collection('book_questions').where('bookId', '==', book).get()).docs
      .map((d) => ({ id: d.id, ...(d.data() as any) })).filter((q) => q.extractionSource !== 'figure');
    const good = new Map<string, any>();
    for (const q of all) if (q.status === 'CLASSIFIED' && norm(q.stem).length >= 12) good.set(`${norm(q.stem)}|${q.questionNumber}`, q);
    const dups = all.filter((q) => q.status === 'QUARANTINED' && q.quarantineReason !== 'not_in_latest_extraction'
      && q.quarantineReason !== 'duplicate_of_usable' && good.has(`${norm(q.stem)}|${q.questionNumber}`));
    console.log(`${book}: ${dups.length} duplicates of usable rows`);
    total += dups.length;
    if (!apply) continue;
    const now = new Date().toISOString();
    for (let i = 0; i < dups.length; i += 400) {
      const b = db.batch();
      for (const q of dups.slice(i, i + 400)) {
        b.update(db.collection('book_questions').doc(q.id), {
          quarantineReason: 'duplicate_of_usable', previousQuarantineReason: q.quarantineReason,
          duplicateOf: good.get(`${norm(q.stem)}|${q.questionNumber}`).id, updatedAt: now,
        });
      }
      await b.commit();
    }
  }
  console.log(`${apply ? 'marked' : '[dry run] would mark'} ${total}`);
  process.exit(0);
})().catch((e) => { console.error(e?.message || e); process.exit(1); });
