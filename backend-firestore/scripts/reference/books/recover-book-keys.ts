/**
 * Recover PRINTED answer keys the parser missed (S. Chand Quant / Reasoning).
 *
 * Some exercises lost their key because the grid changed format mid-way ("141. | (d) |" on the page
 * after "1. (c) | 2. (d)"), or ran on to another page. For every exercise that has keyless rows:
 *   1. find the page of its highest-numbered question in the first-pass OCR (stem search);
 *   2. from there, the first "ANSWERS" heading, then every "N. (x)" / "N. | (x)" pair until the
 *      next exercise/chapter heading or the numbering restarts — following the grid across pages;
 *   3. CROSS-CHECK: every key the bank already holds for that exercise must agree with the grid, and
 *      there must be at least 5 of them — an exercise with no keys can't prove its grid (two exercises
 *      can resolve to the same grid), so it is left for the AI-verified step.
 * Rows get answerKey (+ answerIndex when their options are complete) and answerSource
 * 'book-key-recovered'; a row whose only problem was the key goes back to EXTRACTED.
 *
 *   npx tsx scripts/reference/books/recover-book-keys.ts <bookKey> [--apply]
 */
import 'dotenv/config';
import * as fs from 'fs';
import * as path from 'path';
import { FieldValue } from 'firebase-admin/firestore';
import { db } from '../../../src/config/firebase';
import { BOOKS } from './contract';

const book = process.argv[2];
const apply = process.argv.includes('--apply');
const norm = (t: unknown) => String(t ?? '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const PAIR = /(\d{1,3})\s*\.\s*\|?\s*\(\s*([a-e])\s*\)/gi;
const STOP = /^\s*#{0,3}\s*(?:EXERCISE\b|SOLUTIONS?\b|HINTS?\b|EXPLANATIONS?\b)/im;

(async () => {
  const cfg = BOOKS[book];
  if (!cfg) throw new Error(`unknown book ${book}`);
  const dir = path.resolve(process.cwd(), '..', 'dataset_staging', ...cfg.stagingDir.split('/'), 'ocr');
  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.json')).sort().map((f) => {
    const j = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
    return { f, md: String(j.markdown || '') };
  });
  const flat = files.map((x) => norm(x.md));

  const rows = (await db.collection('book_questions').where('bookId', '==', book).get()).docs
    .map((d) => ({ id: d.id, ...(d.data() as any) }))
    .filter((r) => r.extractionSource !== 'figure' && r.quarantineReason !== 'not_in_latest_extraction');
  const groups = new Map<string, any[]>();
  for (const r of rows) {
    const k = `${r.chapterOrdinal}|${r.sourceSectionIndex}`;
    (groups.get(k) ?? groups.set(k, []).get(k)!).push(r);
  }

  const fixes: { r: any; key: string }[] = [];
  const report: string[] = [];
  for (const [, g] of groups) {
    const keyless = g.filter((r) => !r.answerKey);
    if (!keyless.length) continue;
    const label = `${g[0].chapterName} / ${g[0].sourceSection}`;
    // the exercise's last question, located in the OCR
    const last = [...g].sort((a, b) => b.questionNumber - a.questionNumber).find((r) => norm(r.stem).split(' ').length >= 3);
    if (!last) { report.push(`${label}: no locatable question`); continue; }
    const probe = `${last.questionNumber} ${norm(last.stem).split(' ').slice(0, 6).join(' ')}`;
    const fi = flat.findIndex((t) => t.includes(probe));
    if (fi < 0) { report.push(`${label}: last question not found in OCR`); continue; }
    // collect the grid
    const grid = new Map<number, string>();
    let started = false, done = false, prev = 0;
    for (let k = fi; k < Math.min(files.length, fi + 6) && !done; k++) {
      let md = files[k].md;
      if (!started) {
        const qAt = k === fi ? md.indexOf(`${last.questionNumber}.`) : 0;
        const a = md.slice(Math.max(0, qAt)).search(/ANSWERS?\b/);
        if (a < 0) continue;
        md = md.slice(Math.max(0, qAt) + a); started = true;
      }
      const stop = md.slice(10).search(STOP);
      const text = stop >= 0 ? md.slice(0, stop + 10) : md;
      for (const m of text.matchAll(PAIR)) {
        const n = Number(m[1]);
        if (grid.size && n === 1 && prev > 5) { done = true; break; }   // numbering restarted: the next exercise's grid
        if (!grid.has(n)) grid.set(n, m[2].toLowerCase());
        prev = n;
      }
      if (stop >= 0) done = true;
    }
    if (!grid.size) { report.push(`${label}: no answer grid found`); continue; }
    const known = g.filter((r) => r.answerKey && grid.has(r.questionNumber));
    const agree = known.filter((r) => String(r.answerKey).toLowerCase() === grid.get(r.questionNumber)).length;
    const max = Math.max(...g.map((r) => r.questionNumber));
    const contiguous = Array.from({ length: max }, (_, i) => i + 1).every((n) => grid.has(n));
    // Only a grid proven on this exercise's own keys: two exercises can share one grid ("Ex 7" twice).
    const trusted = known.length >= 5 && agree === known.length;
    const got = keyless.filter((r) => grid.has(r.questionNumber));
    report.push(`${label}: grid ${grid.size}, cross-check ${agree}/${known.length}${contiguous ? ', contiguous' : ''} → ${trusted ? `RECOVER ${got.length}/${keyless.length}` : 'REJECTED'}`);
    if (trusted) for (const r of got) fixes.push({ r, key: grid.get(r.questionNumber)! });
  }
  for (const l of report.sort()) console.log('  ' + l);
  console.log(`${apply ? '' : '[dry run] '}${book}: keys recovered for ${fixes.length} rows`);

  if (apply) {
    const now = new Date().toISOString();
    let toExtracted = 0;
    for (let i = 0; i < fixes.length; i += 400) {
      const b = db.batch();
      for (const { r, key } of fixes.slice(i, i + 400)) {
        const opts: string[] = r.options || [];
        const complete = (opts.length === 4 || opts.length === 5) && opts.every((o) => String(o).trim());
        const idx = complete ? 'abcde'.indexOf(key) : -1;
        const upd: any = { answerKey: key, answerSource: 'book-key-recovered', updatedAt: now };
        if (idx >= 0 && idx < opts.length) upd.answerIndex = idx;
        if (r.quarantineReason === 'no_answer_key' && idx >= 0 && idx < opts.length) {
          upd.status = 'EXTRACTED'; upd.quarantineReason = FieldValue.delete(); toExtracted++;
        }
        b.update(db.collection('book_questions').doc(r.id), upd);
      }
      await b.commit();
    }
    console.log(`  wrote ${fixes.length} keys; ${toExtracted} rows back to EXTRACTED (the rest still need options)`);
  }
  process.exit(0);
})().catch((e) => { console.error(e?.message || e); process.exit(1); });
