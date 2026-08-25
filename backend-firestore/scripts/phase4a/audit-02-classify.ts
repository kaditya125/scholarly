/**
 * Part 1 Steps 1-2 — full census of namespace `production`, read-only.
 *
 * Vector IDs are `<uuid>_chunk_<n>` and carry no ownership, so every vector must be classified
 * from its metadata. This enumerates all of them rather than sampling: the backfill decides who
 * can read what, and a sample cannot prove the absence of a private vector in the candidate set.
 *
 * Writes a manifest so the mutation step operates on a reviewed, frozen list instead of
 * re-deriving its own target set.
 */
import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { Pinecone } from '@pinecone-database/pinecone';
import { env } from '../../src/config/env';

const OUT = path.join(__dirname, 'census.json');

(async () => {
  const pc = new Pinecone({ apiKey: env.PINECONE_API_KEY! });
  const ns = pc.index(env.PINECONE_INDEX_NAME).namespace(env.PINECONE_NAMESPACE);

  // ── enumerate every id ───────────────────────────────────────────────────────────────
  const ids: string[] = [];
  let token: string | undefined;
  do {
    const page = await ns.listPaginated({ limit: 100, paginationToken: token });
    // Guard: a malformed page entry would otherwise push undefined and the fetch call rejects
    // the whole batch with 'Must pass in at least 1 recordID', losing the entire census run.
    (page.vectors || []).forEach((v: any) => { if (v?.id) ids.push(String(v.id)); });
    token = page.pagination?.next;
    if (ids.length % 2000 === 0) process.stdout.write(`\r  listed ${ids.length}...`);
  } while (token);
  console.log(`\r  listed ${ids.length} vector ids`);

  // ── fetch metadata in batches ────────────────────────────────────────────────────────
  const owners: Record<string, number> = {};
  const ownerSampleIds: Record<string, string[]> = {};
  const boards: Record<string, number> = {};
  const keyShapes: Record<string, number> = {};
  let alreadyPublic = 0;
  const records: Array<{ id: string; userId: string; board: string; pub: boolean }> = [];

  for (let i = 0; i < ids.length; i += 100) {
    const batch = ids.slice(i, i + 100).filter(Boolean);
    if (batch.length === 0) continue;
    // SDK v8 takes an options object; fetch(array) is rejected as "Must pass in at least 1 recordID".
    const res = await ns.fetch({ ids: batch } as any);
    for (const [id, rec] of Object.entries(res.records || {})) {
      const md: any = (rec as any).metadata || {};
      const uid = String(md.userId ?? '(absent)');
      const board = String(md.board ?? '(absent)');
      const pub = md.public === true;
      owners[uid] = (owners[uid] || 0) + 1;
      boards[board] = (boards[board] || 0) + 1;
      if (pub) alreadyPublic++;
      (ownerSampleIds[uid] ||= []).length < 3 && ownerSampleIds[uid].push(id);
      const shape = Object.keys(md).sort().join(',');
      keyShapes[shape] = (keyShapes[shape] || 0) + 1;
      records.push({ id, userId: uid, board, pub });
    }
    if (i % 2000 === 0) process.stdout.write(`\r  fetched ${i}/${ids.length}...`);
  }
  console.log(`\r  fetched metadata for ${records.length} vectors`);

  console.log('\n=== OWNERSHIP (userId) ===');
  Object.entries(owners).sort((a, b) => b[1] - a[1]).forEach(([k, v]) => {
    console.log(`  ${k.padEnd(34)} ${String(v).padStart(6)}   len=${k === '(absent)' ? '-' : k.length}   sample=${(ownerSampleIds[k] || [])[0] || '-'}`);
  });

  console.log('\n=== board ===');
  Object.entries(boards).sort((a, b) => b[1] - a[1]).slice(0, 12).forEach(([k, v]) => console.log(`  ${k.padEnd(20)} ${v}`));

  console.log('\n=== distinct metadata key shapes ===');
  Object.entries(keyShapes).sort((a, b) => b[1] - a[1]).forEach(([k, v]) => console.log(`  (${v}) ${k}`));

  console.log(`\nvectors already carrying public:true = ${alreadyPublic}`);

  fs.writeFileSync(OUT, JSON.stringify({ takenAt: Date.now(), namespace: env.PINECONE_NAMESPACE, total: records.length, records }, null, 0));
  console.log(`\nmanifest written: ${OUT}`);
  process.exit(0);
})().catch((e) => { console.error('FAILED:', e?.message || e); process.exit(1); });
