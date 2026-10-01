/**
 * Printed-key audit (key-audit-targets.ts → ai_verify_keys.py audit): a usable row is taken out of
 * service as 'key_disputed' only when gemini AND qwen, solving blind, name the same option and it is
 * not the printed one. The printed key is never overwritten — the dispute is recorded for review.
 *
 *   npx tsx scripts/reference/books/key-audit-apply.ts <bookKey> [--apply]
 */
import 'dotenv/config';
import * as fs from 'fs';
import * as path from 'path';
import { db } from '../../../src/config/firebase';

const book = process.argv[2];
const apply = process.argv.includes('--apply');
const DIR = path.resolve(process.cwd(), '..', 'dataset_staging', 'ai_keys');
const read = (f: string) => new Map<string, any>(fs.existsSync(path.join(DIR, f))
  ? fs.readFileSync(path.join(DIR, f), 'utf8').split('\n').filter(Boolean).map((l) => { const j = JSON.parse(l); return [j.id, j.answer]; })
  : []);

(async () => {
  const rows: any[] = JSON.parse(fs.readFileSync(path.join(DIR, `audit_${book}.json`), 'utf8'));
  const g = read(`audit_${book}_gemini.jsonl`), q = read(`audit_${book}_qwen.jsonl`);
  let confirmed = 0, disputed = 0, split = 0, pending = 0;
  const out: any[] = [];
  for (const r of rows) {
    if (!g.has(r.id) || !q.has(r.id)) { pending++; continue; }
    const a = g.get(r.id), b = q.get(r.id), printed = String(r.printed).toLowerCase();
    if (a && a === b && a === printed) confirmed++;
    else if (a && a === b) { disputed++; out.push({ r, ai: a }); }
    else split++;
  }
  console.log(`${apply ? '' : '[dry run] '}${book}: printed key confirmed by both ${confirmed}, disputed by both ${disputed}, models split ${split}, not yet answered ${pending}`);
  for (const { r, ai } of out.slice(0, 8)) console.log(`   [printed ${r.printed} / AI ${ai}] ${String(r.stem).slice(0, 90)} | ${r.options.map((o: string, i: number) => `(${'abcde'[i]}) ${String(o).slice(0, 25)}`).join(' ')}`);
  if (apply && out.length) {
    const now = new Date().toISOString();
    for (let i = 0; i < out.length; i += 400) {
      const batch = db.batch();
      for (const { r, ai } of out.slice(i, i + 400)) {
        batch.update(db.collection('book_questions').doc(r.id), {
          status: 'QUARANTINED', quarantineReason: 'key_disputed',
          keyAudit: { printed: r.printed, aiAnswer: ai, models: ['gemini-3-flash-preview', 'qwen3-235b-a22b-instruct-2507'], at: now },
          updatedAt: now,
        });
      }
      await batch.commit();
    }
    console.log(`  took ${out.length} disputed rows out of service`);
  }
  process.exit(0);
})().catch((e) => { console.error(e?.message || e); process.exit(1); });
