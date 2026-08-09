/**
 * Read-only coverage report: how many chapters are actually ingested (READY) per
 * ncert-curriculum notebook. Uses the app's own Firestore connection.
 *
 * Usage: npx tsx src/scripts/curriculum_coverage.ts
 */
import { db } from '../config/firebase';

async function run() {
  const snap = await db.collection('notebooks').where('owner', '==', 'ncert-curriculum').get();
  const rows: any[] = [];
  let totalReady = 0;

  for (const d of snap.docs) {
    const sources = await d.ref.collection('sources').get();
    let ready = 0, failed = 0, other = 0;
    const readyTitles: string[] = [];
    for (const s of sources.docs) {
      const st = (s.data() as any).status;
      if (st === 'READY') { ready++; readyTitles.push((s.data() as any).title || s.id); }
      else if (st === 'FAILED') failed++;
      else other++;
    }
    totalReady += ready;
    // Extract chapter numbers from titles like "... - Chapter 7.pdf"
    const chapNums = readyTitles
      .map((t) => { const m = t.match(/Chapter (\d+)/i); return m ? parseInt(m[1], 10) : null; })
      .filter((n): n is number => n != null)
      .sort((a, b) => a - b);
    rows.push({
      notebook: d.id,
      ready,
      failed,
      inProgress: other,
      chapters: chapNums.join(','),
    });
  }

  rows.sort((a, b) => a.notebook.localeCompare(b.notebook));
  console.table(rows);
  console.log(`\nTotal curriculum notebooks: ${rows.length}`);
  console.log(`Total READY chapters: ${totalReady}`);
  process.exit(0);
}

run().catch((e) => { console.error(e); process.exit(1); });
