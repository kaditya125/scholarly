/**
 * Backfills chapterCount, readyChapterCount, estimatedStudyHours onto all
 * ncert-curriculum notebook documents so the book library list endpoint
 * doesn't need to read every sources subcollection on cold cache.
 */
import { db } from './src/config/firebase';

const READY_STATUSES = new Set(['READY', 'ready', 'completed', 'COMPLETED']);

async function backfill() {
  const snap = await db.collection('notebooks').where('owner', '==', 'ncert-curriculum').get();
  console.log(`Found ${snap.size} curriculum notebooks. Starting sequential backfill...`);

  let done = 0;
  let failed = 0;

  for (const doc of snap.docs) {
    try {
      const sources = await doc.ref.collection('sources').get();
      const chapterCount = sources.size;
      const readyChapterCount = sources.docs.filter(s => READY_STATUSES.has((s.data() as any).status || '')).length;
      const estimatedStudyHours = Math.round(
        sources.docs.reduce((sum, s) => sum + ((s.data() as any).metadata?.estimatedStudyTimeMinutes || 0), 0) / 60
      );
      await doc.ref.update({ chapterCount, readyChapterCount, estimatedStudyHours });
      done++;
      console.log(`[${done}/${snap.size}] ${doc.id} — chapters: ${chapterCount}, ready: ${readyChapterCount}`);
    } catch (e) {
      failed++;
      console.error(`FAILED: ${doc.id}`, e);
    }
  }

  console.log(`\nDone! ${done} updated, ${failed} failed.`);
  process.exit(0);
}

backfill().catch(e => { console.error(e); process.exit(1); });
