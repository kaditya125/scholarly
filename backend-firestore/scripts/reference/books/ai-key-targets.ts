/**
 * Rows with no printed key whose question is otherwise complete → dataset_staging/ai_keys/targets.json
 * for ai_verify_keys.py. (Owner approved AI-verified keys for the book bank on 1 Oct 2026.)
 *
 * Eligible: live QUARANTINED, reason no_answer_key, a real stem (no figure markers), 4–5 options all
 * present and distinct. Run again after a re-read pass — rows whose options were just completed join.
 *
 *   npx tsx scripts/reference/books/ai-key-targets.ts
 */
import 'dotenv/config';
import * as fs from 'fs';
import * as path from 'path';
import { db } from '../../../src/config/firebase';

const FIGURE_STEM = /FIGURE|\| ---|!\[|\(I\)\s*\|/i;
const norm = (t: unknown) => String(t ?? '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

(async () => {
  const rows = (await db.collection('book_questions').where('quarantineReason', '==', 'no_answer_key').get()).docs
    .map((d) => ({ id: d.id, ...(d.data() as any) }))
    .filter((r) => r.status === 'QUARANTINED' && r.extractionSource !== 'figure');
  const out: any[] = []; const why: Record<string, number> = {};
  for (const r of rows) {
    const opts: string[] = (r.options || []).map((o: unknown) => String(o ?? '').trim());
    const text = `${r.sharedDirections || ''} ${r.stem || ''}`;
    if (FIGURE_STEM.test(text)) { why.figure = (why.figure || 0) + 1; continue; }
    if (norm(r.stem).length < 3 && norm(r.sharedDirections).length < 10) { why.no_stem = (why.no_stem || 0) + 1; continue; }
    if (!(opts.length === 4 || opts.length === 5) || opts.some((o) => !o) || new Set(opts.map((o) => o.toLowerCase().replace(/\s+/g, ''))).size < opts.length) { why.options = (why.options || 0) + 1; continue; }
    out.push({ id: r.id, bookId: r.bookId, subject: r.subject, chapterName: r.chapterName, directions: r.sharedDirections || '', stem: r.stem, options: opts });
  }
  const dir = path.resolve(process.cwd(), '..', 'dataset_staging', 'ai_keys');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'targets.json'), JSON.stringify(out, null, 1));
  const byBook: Record<string, number> = {};
  for (const t of out) byBook[t.bookId] = (byBook[t.bookId] || 0) + 1;
  console.log(`eligible ${out.length} of ${rows.length} keyless rows ${JSON.stringify(byBook)}; not eligible ${JSON.stringify(why)}`);
  process.exit(0);
})().catch((e) => { console.error(e?.message || e); process.exit(1); });
