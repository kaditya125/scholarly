/**
 * Write AI-verified keys (ai_verify_keys.py) to the book bank — only where two models agree.
 *
 *   key   : gemini-2.5-pro and qwen3-235b answered the same option (null never agrees) →
 *           answerKey/answerIndex, answerSource 'ai-verified', status EXTRACTED.
 *   build : an open item gemini turned into an MCQ, and qwen — blind, options shuffled — picked
 *           gemini's correct answer → stem/options replaced by the MCQ, answerSource 'ai-verified',
 *           optionsSource 'ai-generated', status EXTRACTED. The printed item stays in sourceItem.
 * Every disagreement is recorded on the row (aiKeyAttempt) and the row stays quarantined.
 *
 *   npx tsx scripts/reference/books/ai-keys-apply.ts key|build [--apply]
 */
import 'dotenv/config';
import * as fs from 'fs';
import * as path from 'path';
import { FieldValue } from 'firebase-admin/firestore';
import { db } from '../../../src/config/firebase';
import { hashQuestion } from '../../../src/services/books/bookQuestionParser';

const mode = process.argv[2];
const apply = process.argv.includes('--apply');
const DIR = path.resolve(process.cwd(), '..', 'dataset_staging', 'ai_keys');
/** A results file plus its shards (build_gemini.jsonl + build_gemini.s0.jsonl, …), by id. */
const jsonl = (f: string) => {
  const base = f.replace(/\.jsonl$/, '');
  const files = fs.readdirSync(DIR).filter((x) => x === f || (x.startsWith(`${base}.s`) && x.endsWith('.jsonl')));
  return new Map(files.flatMap((x) => fs.readFileSync(path.join(DIR, x), 'utf8').split('\n').filter(Boolean))
    .map((l) => { const j = JSON.parse(l); return [j.id, j] as [string, any]; }));
};
const LETTERS = 'abcde';
/** Parser run-on at an option's end: "… follow. - Statement | Courses of action", "… # Theme Detection", "… follows and". */
const cleanOption = (o: string) => String(o).replace(/\s+#.*$/, '').replace(/\s+-\s+(?:Statement|Courses?|Arguments?|Assumptions?|Conclusions?)\b.*$/i, '')
  .replace(/\s+and$/, '').replace(/\s*\|\s*$/, '').trim();
const MODELS = ['gemini-2.5-pro', 'qwen3-235b-a22b-instruct-2507'];
const KIMI = 'kimi-k2-thinking';

(async () => {
  const now = new Date().toISOString();
  const updates: { id: string; data: any }[] = [];
  let agreed = 0, majorityN = 0, disagreed = 0, nulls = 0, rejected = 0;

  if (mode === 'key') {
    const targets: any[] = JSON.parse(fs.readFileSync(path.join(DIR, 'targets.json'), 'utf8'));
    const g = jsonl('key_gemini.jsonl'), q = jsonl('key_qwen.jsonl'), k = jsonl('key_kimi.jsonl');
    for (const t of targets) {
      const a = g.get(t.id)?.answer ?? null, b = q.get(t.id)?.answer ?? null;
      if (!g.has(t.id) || !q.has(t.id)) continue;
      // gemini + qwen agreeing = 'ai-verified'; when they don't, Kimi K2 (a third family) can make
      // a 2-of-3 majority = 'ai-verified-majority' — labelled apart, so it can be filtered or audited.
      const c = k.get(t.id)?.answer ?? null;
      const unanimous = a && a === b ? a : null;
      // Gemini (the strongest of the three on the hand-checked sample) must be in the majority:
      // qwen + kimi outvoting it picked a traditional-grammar "No error" item wrongly.
      const majority = !unanimous && c && c === a ? c : null;
      const key = unanimous ?? majority;
      const idx = key ? LETTERS.indexOf(key) : -1;
      if (key && idx >= 0 && idx < t.options.length) {
        if (unanimous) agreed++; else majorityN++;
        const options = t.options.map(cleanOption);
        updates.push({ id: t.id, data: {
          ...(options.some((o: string, i: number) => o !== t.options[i]) && options.every(Boolean) ? { options, originalQuestionHash: hashQuestion(t.stem, options) } : {}),
          answerKey: key, answerIndex: idx, answerSource: unanimous ? 'ai-verified' : 'ai-verified-majority',
          status: 'EXTRACTED', quarantineReason: FieldValue.delete(),
          aiKey: { models: unanimous ? MODELS : [...MODELS, KIMI], answers: unanimous ? [a, b] : [a, b, c], at: now }, updatedAt: now,
        } });
      } else {
        if (!a || !b) nulls++; else disagreed++;
        updates.push({ id: t.id, data: { aiKeyAttempt: { models: [...MODELS, KIMI], answers: [a, b, c], at: now }, updatedAt: now } });
      }
    }
  } else if (mode === 'build') {
    const items = new Map((JSON.parse(fs.readFileSync(path.join(DIR, 'open.json'), 'utf8')) as any[]).map((i) => [i.id, i]));
    const g = jsonl('build_gemini.jsonl'), q = jsonl('build_qwen.jsonl');
    for (const [id, b] of g) {
      const item = items.get(id);
      if (!item) continue;
      if (!b.usable) { rejected++; updates.push({ id, data: { aiKeyAttempt: { models: MODELS.slice(0, 1), verdict: 'not a usable exercise item', at: now }, updatedAt: now } }); continue; }
      const c = q.get(id);
      if (!c) continue;
      const idx = c.answer ? LETTERS.indexOf(c.answer) : -1;
      const options: string[] = c.options;
      if (idx >= 0 && options[idx] === b.correct) {
        agreed++;
        updates.push({ id, data: {
          stem: b.question, options, answerKey: c.answer, answerIndex: idx,
          answerSource: 'ai-verified', optionsSource: 'ai-generated', sourceItem: item.stem,
          originalQuestionHash: hashQuestion(b.question, options),
          status: 'EXTRACTED', quarantineReason: FieldValue.delete(),
          aiKey: { models: [b.model ?? MODELS[0], MODELS[1]], method: 'gemini wrote the MCQ; qwen answered it blind', at: now }, updatedAt: now,
        } });
      } else {
        if (idx < 0) nulls++; else disagreed++;
        updates.push({ id, data: { aiKeyAttempt: { models: MODELS, built: b, blindAnswer: c.answer, at: now }, updatedAt: now } });
      }
    }
  } else throw new Error('mode: key | build');

  console.log(`${apply ? '' : '[dry run] '}${mode}: agreed ${agreed}${mode === 'key' ? `, 2-of-3 majority ${majorityN}` : ''}, disagreed ${disagreed}, unanswerable/null ${nulls}${mode === 'build' ? `, not usable items ${rejected}` : ''}`);
  if (apply) {
    for (let i = 0; i < updates.length; i += 400) {
      const batch = db.batch();
      for (const u of updates.slice(i, i + 400)) batch.update(db.collection('book_questions').doc(u.id), u.data);
      await batch.commit();
    }
    console.log(`  wrote ${updates.length} rows (${agreed} now EXTRACTED)`);
  }
  process.exit(0);
})().catch((e) => { console.error(e?.message || e); process.exit(1); });
