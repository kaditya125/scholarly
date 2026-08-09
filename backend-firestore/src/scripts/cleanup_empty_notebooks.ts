/**
 * Deletes the known EMPTY duplicate curriculum notebooks (naming-drift orphans).
 * Safety guard: a notebook is deleted ONLY if it currently has 0 source documents.
 * Uses recursiveDelete so any stray subcollections go too.
 *
 * Usage: npx tsx src/scripts/cleanup_empty_notebooks.ts        (dry run — reports only)
 *        npx tsx src/scripts/cleanup_empty_notebooks.ts --apply (actually deletes)
 */
import { db, firebaseApp } from '../config/firebase';

const TARGETS = [
  'ncert-c5-evs',
  'ncert-c5-mathematics',
  'ncert-c6-mathematics',
  'ncert-c6-science',
  'ncert-c7-mathematics',
];

async function main() {
  const apply = process.argv.includes('--apply');
  console.log(`Cleanup empty notebooks — mode: ${apply ? 'APPLY (will delete)' : 'DRY RUN (report only)'}\n`);

  for (const id of TARGETS) {
    const ref = db.collection('notebooks').doc(id);
    const doc = await ref.get();
    if (!doc.exists) { console.log(`  [skip] ${id}: does not exist`); continue; }

    const sources = await ref.collection('sources').get();
    const nodes = await ref.collection('kg_nodes').get();
    if (sources.size > 0) {
      console.log(`  [KEEP] ${id}: has ${sources.size} source(s) — NOT empty, skipping for safety`);
      continue;
    }

    if (!apply) {
      console.log(`  [would delete] ${id}: sources=0, kg_nodes=${nodes.size}`);
      continue;
    }

    await firebaseApp.firestore().recursiveDelete(ref);
    console.log(`  [DELETED] ${id} (had sources=0, kg_nodes=${nodes.size})`);
  }

  console.log(`\nDone. ${apply ? '' : 'Re-run with --apply to actually delete.'}`);
  process.exit(0);
}

main().catch((e) => { console.error('cleanup error:', e); process.exit(1); });
