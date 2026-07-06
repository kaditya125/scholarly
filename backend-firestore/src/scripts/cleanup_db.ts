/**
 * Production DB cleanup.
 *  - Deletes all non-curriculum (test/demo) notebooks + cascades their subcollections
 *    and best-effort purges their Pinecone vectors.
 *  - Deletes stale FAILED source records inside preserved curriculum notebooks.
 *  - De-duplicates preserved notebooks by title.
 *  - Preserves only real curriculum (owner === 'ncert-curriculum').
 *
 * Dry-run by default. Pass --apply to actually delete.
 *   npx tsx src/scripts/cleanup_db.ts            # dry run (prints plan)
 *   npx tsx src/scripts/cleanup_db.ts --apply    # execute
 */
import { db } from '../config/firebase';
import { env } from '../config/env';
import { notebookRepository } from '../repositories/notebook.repository';
import { pineconeService } from '../services/rag/pinecone.service';

const KEEP_OWNER = 'ncert-curriculum';
const APPLY = process.argv.includes('--apply');

async function purgePineconeForSources(sources: any[]) {
  const ids: string[] = [];
  for (const s of sources) {
    const chunks = s.chunksExtracted || 0;
    for (let i = 0; i < chunks; i++) ids.push(`${s.id}_chunk_${i}`);
  }
  if (ids.length === 0) return 0;
  for (let i = 0; i < ids.length; i += 500) {
    try { await pineconeService.deleteVectors(ids.slice(i, i + 500), env.PINECONE_NAMESPACE); } catch { /* best effort */ }
  }
  return ids.length;
}

async function main() {
  console.log(APPLY ? '=== CLEANUP (APPLYING) ===' : '=== CLEANUP (DRY RUN — no changes) ===');
  const snap = await db.collection('notebooks').get();
  console.log(`Total notebooks: ${snap.size}`);

  const kept: { id: string; title: string; ready: number; failed: number }[] = [];
  let deletedNotebooks = 0, deletedFailedSources = 0, purgedVectors = 0;

  for (const doc of snap.docs) {
    const nb: any = doc.data();
    const id = doc.id;
    const owner = nb.userId || nb.owner || '?';
    const srcSnap = await doc.ref.collection('sources').get();
    const sources = srcSnap.docs.map((d) => ({ id: d.id, ref: d.ref, ...(d.data() as any) }));
    const ready = sources.filter((s) => s.status === 'READY');
    const failed = sources.filter((s) => s.status === 'FAILED');

    if (owner !== KEEP_OWNER) {
      // Test/demo notebook -> delete entirely.
      console.log(`  DELETE notebook "${nb.title}" (owner=${owner}, sources=${sources.length}) [${id}]`);
      if (APPLY) {
        purgedVectors += await purgePineconeForSources(ready);
        await notebookRepository.deleteWithSubcollections(id);
      }
      deletedNotebooks++;
      continue;
    }

    // Preserved curriculum notebook -> strip stale FAILED sources.
    for (const f of failed) {
      console.log(`    drop FAILED source "${f.title}" in "${nb.title}"`);
      if (APPLY) await f.ref.delete();
      deletedFailedSources++;
    }
    kept.push({ id, title: nb.title, ready: ready.length, failed: failed.length });
  }

  // De-duplicate preserved notebooks by title (keep the one with most READY sources).
  const byTitle: Record<string, typeof kept> = {};
  for (const k of kept) (byTitle[k.title] ||= []).push(k);
  for (const [title, group] of Object.entries(byTitle)) {
    if (group.length <= 1) continue;
    group.sort((a, b) => b.ready - a.ready);
    for (const dup of group.slice(1)) {
      console.log(`  DELETE duplicate notebook "${title}" [${dup.id}]`);
      if (APPLY) await notebookRepository.deleteWithSubcollections(dup.id);
      deletedNotebooks++;
    }
  }

  console.log('\n--- SUMMARY ---');
  console.log(`Notebooks deleted        : ${deletedNotebooks}`);
  console.log(`FAILED sources removed   : ${deletedFailedSources}`);
  console.log(`Pinecone vectors purged  : ${purgedVectors}`);
  console.log(`Preserved curriculum NBs : ${kept.length}`);
  kept.forEach((k) => console.log(`   keep "${k.title}" ready=${k.ready}`));
  console.log(APPLY ? '\nApplied.' : '\nDry run only. Re-run with --apply to execute.');
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
