/**
 * Part 1 Step 3 — canary. Proves on ONE vector that a metadata update:
 *   - adds public:true
 *   - preserves every other metadata field
 *   - does not disturb the embedding values
 * Establishing this on one vector is what makes running it on 22,505 defensible.
 */
import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { Pinecone } from '@pinecone-database/pinecone';
import { env } from '../../src/config/env';

(async () => {
  const { ids } = JSON.parse(fs.readFileSync(path.join(__dirname, 'candidates.json'), 'utf8'));
  const id = ids[0];
  const ns = new Pinecone({ apiKey: env.PINECONE_API_KEY! }).index(env.PINECONE_INDEX_NAME).namespace(env.PINECONE_NAMESPACE);

  const before: any = await ns.fetch({ ids: [id] } as any);
  const b = before.records[id];
  const bMeta = b.metadata || {};
  const bVals: number[] = b.values || [];
  console.log(`canary id: ${id}`);
  console.log(`  before: keys=${Object.keys(bMeta).length}  public=${bMeta.public ?? '(absent)'}  dims=${bVals.length}  v[0]=${bVals[0]}`);

  await ns.update({ id, metadata: { public: true } } as any);
  await new Promise(r => setTimeout(r, 2500)); // index consistency is eventual

  const after: any = await ns.fetch({ ids: [id] } as any);
  const a = after.records[id];
  const aMeta = a.metadata || {};
  const aVals: number[] = a.values || [];
  console.log(`  after : keys=${Object.keys(aMeta).length}  public=${aMeta.public}  dims=${aVals.length}  v[0]=${aVals[0]}`);

  const lost = Object.keys(bMeta).filter(k => !(k in aMeta));
  const changed = Object.keys(bMeta).filter(k => k in aMeta && JSON.stringify(bMeta[k]) !== JSON.stringify(aMeta[k]));
  const valsSame = bVals.length === aVals.length && bVals.every((v, i) => v === aVals[i]);

  console.log(`\n  metadata fields lost    : ${lost.length ? lost.join(',') : 'none'}`);
  console.log(`  metadata fields changed : ${changed.length ? changed.join(',') : 'none'}`);
  console.log(`  embedding values identical: ${valsSame}`);
  const ok = aMeta.public === true && lost.length === 0 && changed.length === 0 && valsSame;
  console.log(`\n  CANARY ${ok ? 'PASS — safe to proceed' : 'FAIL — do not proceed'}`);
  process.exit(ok ? 0 : 2);
})().catch(e => { console.error('FAILED:', e?.message || e); process.exit(1); });
