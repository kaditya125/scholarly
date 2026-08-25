/**
 * Part 1 Step 4 + Part 9 — independent verification of the backfill.
 * Re-reads from Pinecone rather than trusting the writer's own counters, and checks BOTH
 * directions: candidates gained public:true, and non-candidates did not.
 */
import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { Pinecone } from '@pinecone-database/pinecone';
import { env } from '../../src/config/env';

const FIREBASE_UID = /^[A-Za-z0-9]{28}$/;

(async () => {
  const census = JSON.parse(fs.readFileSync(path.join(__dirname, 'census.json'), 'utf8'));
  const { ids: candidateIds } = JSON.parse(fs.readFileSync(path.join(__dirname, 'candidates.json'), 'utf8'));
  const candSet = new Set<string>(candidateIds);
  const ns = new Pinecone({ apiKey: env.PINECONE_API_KEY! }).index(env.PINECONE_INDEX_NAME).namespace(env.PINECONE_NAMESPACE);

  // ── A. every candidate now carries public:true ────────────────────────────────────────
  let pub = 0, notPub = 0; const stragglers: string[] = [];
  for (let i = 0; i < candidateIds.length; i += 100) {
    const res: any = await ns.fetch({ ids: candidateIds.slice(i, i + 100) } as any);
    for (const [id, rec] of Object.entries(res.records || {})) {
      if ((rec as any).metadata?.public === true) pub++;
      else { notPub++; if (stragglers.length < 5) stragglers.push(id); }
    }
    if (i % 6000 === 0) process.stdout.write(`\r  verifying candidates ${i}/${candidateIds.length}...`);
  }
  console.log(`\r  candidates with public:true : ${pub} / ${candidateIds.length}          `);
  console.log(`  candidates still missing it : ${notPub}`);
  stragglers.forEach(s => console.log(`     ${s}`));

  // ── B. non-candidates must be untouched ───────────────────────────────────────────────
  const excluded = census.records.filter((r: any) => !candSet.has(r.id));
  let exclPub = 0; const violations: string[] = [];
  for (let i = 0; i < excluded.length; i += 100) {
    const res: any = await ns.fetch({ ids: excluded.slice(i, i + 100).map((r: any) => r.id) } as any);
    for (const [id, rec] of Object.entries(res.records || {})) {
      if ((rec as any).metadata?.public === true) { exclPub++; violations.push(id); }
    }
  }
  console.log(`\n  excluded vectors examined   : ${excluded.length}`);
  console.log(`  excluded now marked public  : ${exclPub}  ${exclPub === 0 ? '(correct)' : '*** VIOLATION ***'}`);
  violations.slice(0, 5).forEach(v => console.log(`     ${v}`));

  // ── C. the private vector specifically ────────────────────────────────────────────────
  const priv = census.records.filter((r: any) => FIREBASE_UID.test(r.userId));
  if (priv.length) {
    const res: any = await ns.fetch({ ids: priv.map((r: any) => r.id) } as any);
    for (const [id, rec] of Object.entries(res.records || {})) {
      const md: any = (rec as any).metadata || {};
      console.log(`\n  PRIVATE vector ${id.slice(0, 40)}`);
      console.log(`     owner=${String(md.userId).slice(0, 10)}...  public=${md.public ?? '(absent)'}  ${md.public === true ? '*** EXPOSED ***' : '(not exposed — correct)'}`);
    }
  }
  const ok = notPub === 0 && exclPub === 0;
  console.log(`\n  BACKFILL VERIFICATION: ${ok ? 'PASS' : 'FAIL'}`);
  process.exit(ok ? 0 : 2);
})().catch(e => { console.error('FAILED:', e?.message || e); process.exit(1); });
