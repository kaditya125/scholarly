/**
 * Put re-read text (reread_pages.py) onto rows the first OCR damaged — any book.
 * Generalises schand-reocr-apply.ts (S. Chand verbal options, 1 Oct 2026).
 *
 * Match: the gemini-2.5-pro read of the row's page(s) has a question of the row's number whose stem
 * matches (word overlap ≥ 0.75; for a run-on row, the re-read stem must be contained in it).
 * The re-read must be a full option set (a–d / a–e), none empty, none duplicated. Then ONE
 * independent cross-check must hold, the strongest available:
 *   text-layer books (RY, S. Chand Quant): every option appears in the PDF's own text on that page
 *     (symbol options compared with their symbols), or else the second read matches it exactly;
 *   otherwise: every option the first OCR did read reappears (a run-on one must start with its option),
 *   or — when the first OCR read none — the gemini-2.5-flash read gives exactly the same options.
 * A printed key must be one of the letters. Keyed rows → EXTRACTED; keyless rows stay quarantined as
 * no_answer_key with complete options (the AI-verified key step takes them next).
 *
 *   npx tsx scripts/reference/books/reread-apply.ts <bookKey> [--apply]
 */
import 'dotenv/config';
import * as fs from 'fs';
import * as path from 'path';
import { execFileSync } from 'child_process';
import { FieldValue } from 'firebase-admin/firestore';
import { db } from '../../../src/config/firebase';
import { hashQuestion } from '../../../src/services/books/bookQuestionParser';
import { BOOKS } from './contract';

const book = process.argv[2];
const apply = process.argv.includes('--apply');
/** --focus: apply reread_focus.py's one-question reads to reread/failures.json instead of the page reads. */
const focus = process.argv.includes('--focus');
const TEXT_LAYER = new Set(['ry_ssc_reasoning', 'schand_quant']);
const norm = (t: unknown) => String(t ?? '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const words = (t: unknown) => norm(t).split(' ').filter(Boolean);
function dice(a: unknown, b: unknown): number {
  const x = new Set(words(a)), y = new Set(words(b));
  if (!x.size || !y.size) return 0;
  let n = 0; for (const w of x) if (y.has(w)) n++;
  return (2 * n) / (x.size + y.size);
}
/** Symbols kept: "÷ and ×" vs "+ and x" differ here, though norm() reads both as "and". */
const strict = (t: unknown) => String(t ?? '').toLowerCase().replace(/[×✕]/g, 'x').replace(/[−–—]/g, '-').replace(/\s+/g, '');
/** An option whose words carry it ("Gulp : Sip", "₹ 1250") compares by words; a symbol one by every character. */
const wordy = (o: unknown) => norm(o).replace(/ /g, '').length >= 4;
const same = (a: unknown, b: unknown) => (wordy(a) && wordy(b) ? norm(a) === norm(b) : strict(a) === strict(b));
/** "Diagram (a)", "Figure (b)": a stand-in for a picture, not the option itself. */
const PLACEHOLDER = /^(?:diagram|figure|fig\.?|image|option)\s*\(?[a-e]\)?$/i;
const contains = (outer: unknown, inner: unknown) => { const w = words(inner); return w.length >= 4 && norm(outer).includes(w.slice(0, 6).join(' ')); };

(async () => {
  const cfg = BOOKS[book];
  const DIR = path.resolve(process.cwd(), '..', 'dataset_staging', ...cfg.stagingDir.split('/'));
  const targets: any[] = focus
    ? JSON.parse(fs.readFileSync(path.join(DIR, 'reread', 'failures.json'), 'utf8')).map((f: any) => f.t)
    : JSON.parse(fs.readFileSync(path.join(DIR, 'reread', 'targets.json'), 'utf8'));
  const focusRead = (tag: string) => {
    const f = path.join(DIR, 'reread', `focus_${tag}.jsonl`);
    return new Map<string, any>(fs.existsSync(f) ? fs.readFileSync(f, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l))
      .filter((j: any) => j.found !== false && j.options).map((j: any) => [j.id, j]) : []);
  };
  const fPro = focus ? focusRead('pro') : new Map(), fFlash = focus ? focusRead('flash') : new Map();
  const pick = (pages: Map<number, any[]>, t: any) => (focus ? (pages === pro ? fPro : fFlash).get(t.id) ?? null : find(pages, t).q);
  const load = (sub: string) => {
    const m = new Map<number, any[]>();
    const d = path.join(DIR, 'reread', sub);
    if (fs.existsSync(d)) for (const f of fs.readdirSync(d)) { const j = JSON.parse(fs.readFileSync(path.join(d, f), 'utf8')); m.set(j.pdfPage, j.questions || []); }
    return m;
  };
  const pro = load('pages_pro'), flash = load('pages_flash');
  // the PDF's own text per page, for text-layer books
  const layer = new Map<number, string>();
  const layerStrict = new Map<number, string>();
  if (TEXT_LAYER.has(book)) {
    const pages = [...new Set(targets.flatMap((t) => t.pdfPages))];
    const out = execFileSync('python', ['-c', `import pymupdf,json,sys;d=pymupdf.open(sys.argv[1]);print(json.dumps({p:d[p-1].get_text() for p in json.loads(sys.argv[2])}))`,
      path.join(DIR, 'source.pdf'), JSON.stringify(pages)], { maxBuffer: 256 * 1024 * 1024 }).toString();
    for (const [p, t] of Object.entries(JSON.parse(out))) { layer.set(Number(p), norm(t)); layerStrict.set(Number(p), strict(t)); }
  }

  const reasons: Record<string, number> = {};
  const failures: { t: any; why: string }[] = [];
  let current: any = null;
  const skip = (r: string) => { reasons[r] = (reasons[r] || 0) + 1; if (current && r !== 'page not re-read yet') failures.push({ t: current, why: r }); };
  const fixes: { t: any; options: string[]; stem?: string; check: string; idx: number }[] = [];
  const optsOf = (q: any) => {
    const letters = Object.keys(q?.options || {}).map((l) => l.toLowerCase()).sort();
    return { letters, options: letters.map((l) => String(q.options[l] ?? q.options[l.toUpperCase()] ?? '').replace(/\s+/g, ' ').trim()) };
  };
  const find = (pages: Map<number, any[]>, t: any) => {
    const cands = t.pdfPages.flatMap((p: number) => (pages.get(p) || []).filter((q: any) => Number(q.number) === t.questionNumber));
    const runOn = t.reason === 'oversize_text';
    const scored = cands.map((q: any) => ({ q, s: Math.max(dice(q.stem, t.stem), runOn && contains(t.stem, q.stem) ? 0.9 : 0) }))
      .filter((c: any) => c.s >= 0.75).sort((a: any, b: any) => b.s - a.s);
    if (!scored.length) return { q: null, why: 'question not found on the re-read page' };
    if (scored.length > 1 && scored[1].s >= scored[0].s - 0.05) return { q: null, why: 'two questions match' };
    return { q: scored[0].q, why: '' };
  };

  for (const t of targets) {
    current = t;
    if (!focus && !t.pdfPages.every((p: number) => pro.has(p))) { skip('page not re-read yet'); continue; }
    const q = pick(pro, t);
    if (!q) { skip(focus ? 'focused read did not find it' : find(pro, t).why); continue; }
    if (Object.values(q.options || {}).some((o: any) => /^PICTURE$/i.test(String(o).trim()))) { skip('picture options (placeholders)'); continue; }
    const { letters, options } = optsOf(q);
    if (letters.join('') !== 'abcd' && letters.join('') !== 'abcde') { skip('re-read still incomplete'); continue; }
    if (options.some((o) => !o)) { skip('re-read has an empty option'); continue; }
    if (options.some((o) => PLACEHOLDER.test(o))) { skip('picture options (placeholders)'); continue; }
    // exact apart from spacing/case: "−3" and "3", "1/2" and "12" are different options
    if (new Set(options.map((o) => o.toLowerCase().replace(/\s+/g, ''))).size < options.length) { skip('duplicate options'); continue; }

    let check = '';
    if (TEXT_LAYER.has(book)) {
      const text = t.pdfPages.map((p: number) => layer.get(p) || '').join(' ');
      const textStrict = t.pdfPages.map((p: number) => layerStrict.get(p) || '').join('');
      const f = pick(flash, t);
      const fo = f ? optsOf(f).options : [];
      if (options.every((o) => (wordy(o) ? text.includes(norm(o)) : textStrict.includes(strict(o))))) check = 'text-layer';
      // signs and stacked fractions don't survive a PDF text layer: then the independent read must match exactly
      else if (f && fo.length === options.length && fo.every((o, i) => strict(o) === strict(options[i]))) check = 'second-read';
      else { skip('neither the text layer nor the second read confirms'); continue; }
    } else {
      const had: string[] = (t.options || []).map((o: unknown) => String(o ?? '').trim()).filter(Boolean);
      if (had.length && t.reason !== 'duplicate_options') {
        const runOn = t.reason === 'oversize_text';
        // each first-pass option found, in the same order (the first pass kept the letters it read, in order)
        const at = had.map((h) => options.findIndex((o) => (runOn ? (wordy(o) ? norm(h).startsWith(norm(o)) : strict(h).startsWith(strict(o))) : same(o, h))));
        const ok = at.every((i) => i >= 0) && at.every((i, k) => k === 0 || i > at[k - 1]);
        if (ok) check = 'first-pass';
        else { skip('re-read disagrees with first pass'); continue; }
      } else {
        const f = pick(flash, t);
        const fo = f ? optsOf(f).options : [];
        if (f && fo.length === options.length && fo.every((o, i) => same(o, options[i]))) check = 'second-read';
        else { skip('second read disagrees'); continue; }
      }
    }
    const idx = t.answerKey ? letters.indexOf(String(t.answerKey).toLowerCase()) : -1;
    if (t.answerKey && idx < 0) { skip('key not among options'); continue; }
    const stem = t.reason === 'oversize_text' ? String(q.stem).replace(/\s+/g, ' ').trim() : undefined;
    fixes.push({ t, options, stem, check, idx });
  }

  const byCheck: Record<string, number> = {};
  for (const f of fixes) byCheck[f.check] = (byCheck[f.check] || 0) + 1;
  console.log(`${apply ? '' : '[dry run] '}${book}: repairable ${fixes.length} of ${targets.length} ${JSON.stringify(byCheck)} — keyed ${fixes.filter((f) => f.t.answerKey).length}, keyless ${fixes.filter((f) => !f.t.answerKey).length}`);
  console.log('  not repaired:', JSON.stringify(reasons));
  if (process.argv.includes('--dump')) fs.writeFileSync(path.join(DIR, 'reread', 'fixes.json'), JSON.stringify(fixes, null, 1));
  // what the focused second pass (reread_focus.py) takes: everything that failed a check, not unread pages
  if (!focus) fs.writeFileSync(path.join(DIR, 'reread', 'failures.json'), JSON.stringify(failures.filter((f) => f.why !== 'picture options (placeholders)'), null, 1));

  if (apply) {
    const now = new Date().toISOString();
    for (let i = 0; i < fixes.length; i += 400) {
      const b = db.batch();
      for (const f of fixes.slice(i, i + 400)) {
        const stem = f.stem ?? f.t.stem;
        const data: any = {
          options: f.options, originalQuestionHash: hashQuestion(stem, f.options),
          optionsRecovery: { method: focus ? 'reread-focus-gemini-2.5-pro' : 'reread-gemini-2.5-pro', check: f.check, previousOptions: f.t.options, ...(f.stem ? { previousStem: f.t.stem } : {}), at: now },
          updatedAt: now,
        };
        if (f.stem) data.stem = f.stem;
        if (f.t.answerKey) Object.assign(data, { answerIndex: f.idx, status: 'EXTRACTED', quarantineReason: FieldValue.delete() });
        else data.quarantineReason = 'no_answer_key';
        b.update(db.collection('book_questions').doc(f.t.id), data);
      }
      await b.commit();
    }
    console.log(`  wrote ${fixes.length}`);
  }
  process.exit(0);
})().catch((e) => { console.error(e?.message || e); process.exit(1); });
