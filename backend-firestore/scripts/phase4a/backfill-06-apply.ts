/**
 * Part 1 Step 4 — the backfill.
 *
 * Operates strictly from the frozen candidates.json manifest; it never re-derives its own target
 * set, so what was reviewed in the dry run is exactly what gets written.
 *
 * Idempotent and restartable by construction: each batch is fetched first, and only vectors
 * actually missing public:true are written. Re-running costs reads and updates nothing, so an
 * interrupted run is resumed simply by running it again — no checkpoint file to go stale.
 */
import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { Pinecone } from '@pinecone-database/pinecone';
import { env } from '../../src/config/env';

const CONCURRENCY = 24;
const APPLY = process.argv.includes('--apply');

async function pool<T>(items: T[], n: number, fn: (t: T) => Promise<void>) {
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => {
    while (i < items.length) { const k = i++; await fn(items[k]); }
  }));
}

(async () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(__dirname, 'candidates.json'), 'utf8'));
  const ids: string[] = manifest.ids;
  console.log(`manifest rule : ${manifest.rule}`);
  console.log(`targeted      : ${ids.length}`);
  console.log(`mode          : ${APPLY ? 'APPLY' : 'DRY RUN (pass --apply to write)'}\n`);

  let alreadyCorrect = 0, updated = 0, missing = 0;
  const errors: Array<{ id: string; err: string }> = [];
  const ns = new Pinecone({ apiKey: env.PINECONE_API_KEY! }).index(env.PINECONE_INDEX_NAME).namespace(env.PINECONE_NAMESPACE);

  for (let i = 0; i < ids.length; i += 100) {
    const batch = ids.slice(i, i + 100);
    let res: any;
    try { res = await ns.fetch({ ids: batch } as any); }
    catch (e: any) { batch.forEach(id => errors.push({ id, err: String(e?.message || e).slice(0, 60) })); continue; }

    const needsWrite: string[] = [];
    for (const id of batch) {
      const rec = res.records?.[id];
      if (!rec) { missing++; continue; }
      if ((rec.metadata || {}).public === true) alreadyCorrect++;
      else needsWrite.push(id);
    }

    if (APPLY && needsWrite.length) {
      await pool(needsWrite, CONCURRENCY, async (id) => {
        try { await ns.update({ id, metadata: { public: true } } as any); updated++; }
        catch (e: any) { errors.push({ id, err: String(e?.message || e).slice(0, 60) }); }
      });
    } else {
      updated += needsWrite.length; // dry run: what WOULD be written
    }
    if (i % 2000 === 0) process.stdout.write(`\r  ${i}/${ids.length}  updated=${updated} alreadyCorrect=${alreadyCorrect} errors=${errors.length}`);
  }

  console.log(`\r  ${ids.length}/${ids.length} complete.${' '.repeat(30)}\n`);
  console.log('=== BACKFILL REPORT ===');
  console.log(`  vectors targeted       : ${ids.length}`);
  console.log(`  vectors ${APPLY ? 'updated        ' : 'that WOULD update'} : ${updated}`);
  console.log(`  vectors already correct: ${alreadyCorrect}`);
  console.log(`  vectors skipped/missing: ${missing}`);
  console.log(`  errors                 : ${errors.length}`);
  errors.slice(0, 5).forEach(e => console.log(`     ${e.id}  ${e.err}`));
  process.exit(errors.length ? 3 : 0);
})().catch(e => { console.error('FAILED:', e?.message || e); process.exit(1); });
