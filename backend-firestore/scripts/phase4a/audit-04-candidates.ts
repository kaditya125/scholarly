/**
 * Part 1 Step 1/2 — DRY RUN. Defines the candidate set and proves its boundaries.
 * Nothing here mutates Pinecone.
 *
 * Candidate rule (both conditions required):
 *   userId     === 'ncert-curriculum'      system pseudo-user, not a Firebase uid
 *   notebookId matches /^ncert-/           system curriculum notebook, not a user upload
 *
 * Two independent signals must agree. Owner alone is not enough to expose content publicly.
 */
import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { Pinecone } from '@pinecone-database/pinecone';
import { env } from '../../src/config/env';

const FIREBASE_UID = /^[A-Za-z0-9]{28}$/;

(async () => {
  const census = JSON.parse(fs.readFileSync(path.join(__dirname, 'census.json'), 'utf8'));
  const recs: Array<{ id: string; userId: string; board: string }> = census.records;
  const pc = new Pinecone({ apiKey: env.PINECONE_API_KEY! });
  const ns = pc.index(env.PINECONE_INDEX_NAME).namespace(env.PINECONE_NAMESPACE);

  // notebookId was not kept in the census; re-fetch it for the owner group under test.
  const owned = recs.filter(r => r.userId === 'ncert-curriculum').map(r => r.id);
  console.log(`owner group userId=ncert-curriculum: ${owned.length}`);

  const notebooks: Record<string, number> = {};
  const candidates: string[] = [];
  const rejected: Array<{ id: string; why: string }> = [];
  for (let i = 0; i < owned.length; i += 100) {
    const res: any = await ns.fetch({ ids: owned.slice(i, i + 100) } as any);
    for (const [id, rec] of Object.entries(res.records || {})) {
      const md: any = (rec as any).metadata || {};
      const nb = String(md.notebookId ?? '');
      notebooks[nb] = (notebooks[nb] || 0) + 1;
      if (/^ncert-/.test(nb)) candidates.push(id);
      else rejected.push({ id, why: `notebookId=${nb || '(empty)'}` });
    }
    if (i % 4000 === 0) process.stdout.write(`\r  checked ${i}/${owned.length}...`);
  }
  console.log(`\r  checked ${owned.length}/${owned.length}   `);

  console.log('\n=== notebooks in owner group ===');
  Object.entries(notebooks).sort((a, b) => b[1] - a[1]).forEach(([k, v]) => console.log(`  ${k.padEnd(30)} ${v}`));

  const excluded = recs.filter(r => r.userId !== 'ncert-curriculum');
  const excludedOwners: Record<string, number> = {};
  excluded.forEach(r => { excludedOwners[r.userId] = (excludedOwners[r.userId] || 0) + 1; });

  console.log('\n=== DRY RUN REPORT ===');
  console.log(`  candidate vectors (will receive public:true) : ${candidates.length}`);
  console.log(`  excluded vectors                             : ${excluded.length + rejected.length}`);
  console.log(`     rejected inside owner group               : ${rejected.length}`);
  rejected.slice(0, 5).forEach(r => console.log(`        ${r.id.slice(0, 44)}  ${r.why}`));
  console.log('     excluded by owner:');
  Object.entries(excludedOwners).sort((a, b) => b[1] - a[1]).forEach(([k, v]) =>
    console.log(`        ${k.padEnd(32)} ${String(v).padStart(4)}${FIREBASE_UID.test(k) ? '   <-- REAL FIREBASE UID (private)' : ''}`));

  // Hard safety gate: a real user's vector must never be inside the candidate set.
  const candSet = new Set(candidates);
  const leaked = recs.filter(r => FIREBASE_UID.test(r.userId) && candSet.has(r.id));
  console.log(`\n  PRIVACY GATE: private (Firebase-uid-owned) vectors inside candidate set = ${leaked.length}`);
  if (leaked.length) { console.error('  *** STOP: candidate set contains private user content ***'); process.exit(2); }

  console.log('\n  sample candidate ids:');
  candidates.slice(0, 3).forEach(id => console.log(`     ${id}`));
  console.log('  sample excluded ids:');
  excluded.slice(0, 3).forEach(r => console.log(`     ${r.id}   owner=${r.userId}`));

  fs.writeFileSync(path.join(__dirname, 'candidates.json'),
    JSON.stringify({ builtAt: Date.now(), rule: "userId==='ncert-curriculum' && /^ncert-/.test(notebookId)", count: candidates.length, ids: candidates }));
  console.log(`\n  manifest: candidates.json (${candidates.length} ids)`);
  process.exit(0);
})().catch(e => { console.error('FAILED:', e?.message || e); process.exit(1); });
