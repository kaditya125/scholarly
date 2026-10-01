/**
 * One-off: correct `sourcePage` on ry_ssc_reasoning rows ingested on 30 Sep 2026 with a single
 * printed-page offset (PDF − 3). Inserted pages shift the book's numbering (offsets 3→6→7→8→9→10,
 * measured from the printed page numbers in the PDF text layer), so later chapters were up to 7
 * pages off. Only `sourcePage` is written — status, keys and classification are untouched (a full
 * re-ingest could reset classified rows).
 *
 *   npx tsx scripts/reference/books/ry-fix-source-pages.ts [--apply]
 */
import 'dotenv/config';
import { db } from '../../../src/config/firebase';

const apply = process.argv.includes('--apply');
const OFFSETS: [number, number][] = [[4, 3], [67, 6], [125, 7], [185, 8], [305, 9], [405, 10]];
const offsetAt = (pdf: number) => OFFSETS.reduce((o, [from, off]) => (pdf >= from ? off : o), 3);

(async () => {
  const snap = await db.collection('book_questions').where('bookId', '==', 'ry_ssc_reasoning').get();
  let changed = 0, same = 0, missing = 0;
  const updates: { ref: FirebaseFirestore.DocumentReference; page: number }[] = [];
  for (const d of snap.docs) {
    const sp = d.get('sourcePage');
    if (typeof sp !== 'number') { missing++; continue; }
    const pdf = sp + 3; // as ingested
    const printed = pdf - offsetAt(pdf);
    if (printed === sp) same++;
    else { changed++; updates.push({ ref: d.ref, page: printed }); }
  }
  console.log(`rows ${snap.size}: to correct ${changed}, already right ${same}, no page ${missing}`);
  if (!apply) { console.log('dry run — re-run with --apply'); process.exit(0); }
  for (let i = 0; i < updates.length; i += 400) {
    const b = db.batch();
    for (const u of updates.slice(i, i + 400)) b.update(u.ref, { sourcePage: u.page, sourcePageCorrectedAt: new Date().toISOString() });
    await b.commit();
  }
  console.log(`corrected ${updates.length}`);
  process.exit(0);
})();
