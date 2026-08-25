/**
 * Part 1 Step 2 — resolve every ownership group before defining the candidate set.
 * The census found five distinct owners; only one is self-evidently public NCERT content.
 * Anything not provably public must be excluded, not assumed.
 */
import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { Pinecone } from '@pinecone-database/pinecone';
import { env } from '../../src/config/env';

(async () => {
  const census = JSON.parse(fs.readFileSync(path.join(__dirname, 'census.json'), 'utf8'));
  const recs: Array<{ id: string; userId: string; board: string }> = census.records;

  const strict = recs.filter(r => r.userId === 'ncert-curriculum' && r.board === 'NCERT');
  const ncertNoBoard = recs.filter(r => r.userId === 'ncert-curriculum' && r.board !== 'NCERT');
  const notNcertButBoard = recs.filter(r => r.userId !== 'ncert-curriculum' && r.board === 'NCERT');

  console.log('=== INTERSECTION ===');
  console.log(`  userId=ncert-curriculum AND board=NCERT : ${strict.length}`);
  console.log(`  userId=ncert-curriculum, board!=NCERT   : ${ncertNoBoard.length}`);
  console.log(`  board=NCERT but owner!=ncert-curriculum : ${notNcertButBoard.length}`);
  if (notNcertButBoard.length) {
    const byOwner: Record<string, number> = {};
    notNcertButBoard.forEach(r => { byOwner[r.userId] = (byOwner[r.userId] || 0) + 1; });
    console.log('     owners:', JSON.stringify(byOwner));
  }

  // Inspect the ambiguous groups' actual content-identifying metadata.
  const pc = new Pinecone({ apiKey: env.PINECONE_API_KEY! });
  const ns = pc.index(env.PINECONE_INDEX_NAME).namespace(env.PINECONE_NAMESPACE);

  const groups: Record<string, string[]> = {
    'ncert-curriculum (no NCERT board)': ncertNoBoard.slice(0, 5).map(r => r.id),
    'admin-user': recs.filter(r => r.userId === 'admin-user').slice(0, 5).map(r => r.id),
    'system': recs.filter(r => r.userId === 'system').map(r => r.id),
    '(absent userId)': recs.filter(r => r.userId === '(absent)').slice(0, 5).map(r => r.id),
    'REAL FIREBASE UID (28ch)': recs.filter(r => /^[A-Za-z0-9]{28}$/.test(r.userId)).map(r => r.id),
  };

  for (const [label, gids] of Object.entries(groups)) {
    if (!gids.length) continue;
    console.log(`\n=== ${label} (showing ${gids.length}) ===`);
    const res: any = await ns.fetch({ ids: gids } as any);
    for (const [id, rec] of Object.entries(res.records || {})) {
      const md: any = (rec as any).metadata || {};
      // Identifiers only. `text` is document content and is deliberately never printed.
      console.log(`  ${id.slice(0, 40)}`);
      console.log(`     notebookId=${md.notebookId ?? '-'}  sourceTitle=${String(md.sourceTitle ?? '-').slice(0, 52)}`);
      console.log(`     board=${md.board ?? '-'}  class=${md.class ?? '-'}  subject=${md.subject ?? '-'}`);
    }
  }
  process.exit(0);
})().catch(e => { console.error('FAILED:', e?.message || e); process.exit(1); });
