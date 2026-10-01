/**
 * S. Chand Reasoning — put the re-read options (schand_reocr.py) onto the rows that lost them.
 *
 * A row is repaired only when every check holds:
 *   - the re-read page has a question of the row's number whose stem matches the row's stem;
 *   - its options are a full set, (a)–(d) or (a)–(e), none empty, none duplicated;
 *   - every option the first OCR DID read reappears among them (the independent cross-check — a row
 *     that had no options at all has nothing to check against and is left out);
 *   - the book's printed key is one of its letters.
 * The row gets its full options and answerIndex and goes back to EXTRACTED (the classifier picks it
 * up); what it had before is kept in optionsRecovery. Nothing else on the row changes.
 *
 *   npx tsx scripts/reference/books/schand-reocr-apply.ts [--apply]
 */
import 'dotenv/config';
import * as fs from 'fs';
import * as path from 'path';
import { FieldValue } from 'firebase-admin/firestore';
import { db } from '../../../src/config/firebase';
import { hashQuestion } from '../../../src/services/books/bookQuestionParser';

const apply = process.argv.includes('--apply');
const DIR = path.resolve(process.cwd(), '..', 'dataset_staging', 'schand', 'reasoning', 'reocr');
const norm = (t: unknown) => String(t ?? '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const words = (t: unknown) => new Set(norm(t).split(' ').filter(Boolean));
/** Dice overlap of word sets — OCR differences in a word or two still match; another question doesn't. */
function similar(a: unknown, b: unknown): number {
  const x = words(a), y = words(b);
  if (!x.size || !y.size) return 0;
  let both = 0; for (const w of x) if (y.has(w)) both++;
  return (2 * both) / (x.size + y.size);
}

(async () => {
  const targets: any[] = JSON.parse(fs.readFileSync(path.join(DIR, 'targets.json'), 'utf8'));
  const pages = new Map<number, any[]>();
  for (const f of fs.readdirSync(path.join(DIR, 'pages'))) {
    const j = JSON.parse(fs.readFileSync(path.join(DIR, 'pages', f), 'utf8'));
    pages.set(j.pdfPage, j.questions || []);
  }
  const reasons: Record<string, number> = {};
  const skip = (r: string) => { reasons[r] = (reasons[r] || 0) + 1; };
  const fixes: { t: any; options: string[]; answerIndex: number }[] = [];

  // Checked by hand 1 Oct 2026: these complete fine but still can't stand alone —
  //  Coding-Decoding Ex. 41 Q1–10: their code table in the directions is corrupted (three tables run together);
  //  Situation Reaction Test Ex. 20 (pp. 556–557): Verification-of-Truth questions filed under the wrong chapter.
  const EXCLUDE: [RegExp, string][] = [[/^Coding-Decoding$/, 'code table corrupted'], [/^Situation Reaction Test$/, 'misfiled chapter']];
  for (const t of targets) {
    const ex = EXCLUDE.find(([re]) => re.test(t.chapterName));
    if (ex) { skip(ex[1]); continue; }
    if (!t.pdfPages.every((p: number) => pages.has(p))) { skip('page not re-read yet'); continue; }
    const cands = t.pdfPages.flatMap((p: number) => pages.get(p)!.filter((q: any) => Number(q.number) === t.questionNumber));
    const scored = cands.map((q: any) => ({ q, s: similar(q.stem, t.stem) })).filter((c: any) => c.s >= 0.75).sort((a: any, b: any) => b.s - a.s);
    if (!scored.length) { skip('question not found on the re-read page'); continue; }
    if (scored.length > 1 && scored[1].s >= scored[0].s - 0.05) { skip('two questions match'); continue; }
    const q = scored[0].q;
    const letters = Object.keys(q.options || {}).map((l) => l.toLowerCase()).sort();
    if (letters.join('') !== 'abcd' && letters.join('') !== 'abcde') { skip('re-read still incomplete'); continue; }
    const options = letters.map((l) => String(q.options[l] ?? q.options[l.toUpperCase()] ?? '').replace(/\s+/g, ' ').trim());
    if (options.some((o) => !o)) { skip('re-read has an empty option'); continue; }
    if (new Set(options.map(norm)).size < options.length) { skip('duplicate options'); continue; }
    const had: string[] = (t.options || []).map((o: string) => norm(o)).filter(Boolean);
    if (!had.length) { skip('no first-pass option to cross-check'); continue; }
    if (!had.every((h) => options.some((o) => norm(o) === h))) { skip('re-read disagrees with first pass'); continue; }
    const answerIndex = letters.indexOf(String(t.answerKey).toLowerCase());
    if (answerIndex < 0) { skip('key not among options'); continue; }
    fixes.push({ t, options, answerIndex });
  }

  console.log(`${apply ? '' : '[dry run] '}repairable ${fixes.length} of ${targets.length}`);
  console.log('  not repaired:', JSON.stringify(reasons));
  const byCh: Record<string, number> = {};
  for (const f of fixes) byCh[f.t.chapterName] = (byCh[f.t.chapterName] || 0) + 1;
  console.log('  by chapter:', JSON.stringify(byCh));
  for (const f of fixes.slice(0, 5)) console.log(`   ${f.t.chapterName} Q${f.t.questionNumber}: ${f.t.stem.slice(0, 50)} | had ${JSON.stringify(f.t.options)} → ${JSON.stringify(f.options)} key ${f.t.answerKey}`);
  if (process.argv.includes('--dump')) fs.writeFileSync(path.join(DIR, 'fixes.json'), JSON.stringify(fixes, null, 1));

  if (apply) {
    const now = new Date().toISOString();
    for (let i = 0; i < fixes.length; i += 400) {
      const b = db.batch();
      for (const f of fixes.slice(i, i + 400)) {
        b.update(db.collection('book_questions').doc(f.t.id), {
          options: f.options, answerIndex: f.answerIndex, status: 'EXTRACTED', quarantineReason: FieldValue.delete(),
          originalQuestionHash: hashQuestion(f.t.stem, f.options),
          optionsRecovery: { method: 'reocr-page-gemini-2.5-pro', previousOptions: f.t.options, at: now },
          updatedAt: now,
        });
      }
      await b.commit();
    }
    console.log(`  repaired ${fixes.length} rows → EXTRACTED; chapters to classify: ${[...new Set(fixes.map((f) => f.t.chapterOrdinal))].sort((a, b) => a - b).join(',')}`);
  }
  process.exit(0);
})().catch((e) => { console.error(e?.message || e); process.exit(1); });
