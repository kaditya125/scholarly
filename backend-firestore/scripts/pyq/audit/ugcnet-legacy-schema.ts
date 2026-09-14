/**
 * How much of UGC NET is recoverable deterministically? READ-ONLY.
 *
 * The Phase 2 audit reported UGC NET as 4.9% question text, 0% answers, 0% topic and 0% syllabus
 * mapping, which read as "a raw dump with no exam intelligence". That reading was wrong, and the
 * mistake was mine: the audit looked for the canonical field names.
 *
 * The bulk of the corpus was written by an earlier ingestion with a different contract —
 * `text` rather than `questionText`, `correctOption` rather than `correctAnswer` — and it carries
 * `unitCode` / `unitName` / `unitNumber`, i.e. unit-level syllabus mapping that no other exam in
 * the corpus has. So this is a field-naming mismatch, not missing data, and almost all of it can
 * be recovered by renaming rather than by inference.
 *
 * This script measures exactly how much, and flags the one genuine content problem: legacy font
 * encoding in the Indic-language subjects, the same class of corruption as the Kruti Dev issue.
 */
import { firebaseApp } from '../../../src/config/firebase';
import * as fs from 'fs';
import * as path from 'path';

const OUT = path.join(__dirname, 'out', 'ugcnet-legacy-schema.json');
const has = (v: any) => v !== undefined && v !== null && String(v).trim() !== '';
const nonEmptyList = (v: any) =>
  Array.isArray(v) ? v.length > 0 : (v && typeof v === 'object' ? Object.keys(v).length > 0 : false);

/**
 * Text that decoded through the wrong code page.
 *
 * Latin-1 mojibake from a UTF-8 source shows up as runs of Ã/Ø/Ö/Ü/ú/¸ and similar. Devanagari
 * that survived correctly is in U+0900–U+097F, so a record with Indic subject matter, no
 * Devanagari at all, and a high share of these markers was almost certainly mis-decoded.
 */
function looksMojibake(s: string): boolean {
  if (!s) return false;
  const markers = (s.match(/[ÃÂØÙÖÜúûÛ×¸Ÿ]/g) || []).length;
  const devanagari = (s.match(/[ऀ-ॿ]/g) || []).length;
  return markers >= 3 && markers / s.length > 0.08 && devanagari === 0;
}

async function main() {
  const db = firebaseApp.firestore();
  const rows: any[] = [];
  let last: any = null;
  while (true) {
    let q: FirebaseFirestore.Query = db.collection('pyq_questions').where('examId', '==', 'UGC_NET').orderBy('__name__').limit(2000);
    if (last) q = q.startAfter(last);
    const s = await q.get();
    if (s.empty) break;
    for (const d of s.docs) rows.push(d.data());
    last = s.docs[s.docs.length - 1];
    if (s.size < 2000) break;
  }
  console.log(`=== UGC NET LEGACY SCHEMA AUDIT ===`);
  console.log(`records: ${rows.length}\n`);

  const canonical = rows.filter((r) => has(r.questionText));
  const legacy = rows.filter((r) => !has(r.questionText) && has(r.text));
  const neither = rows.filter((r) => !has(r.questionText) && !has(r.text));

  console.log('--- which contract is each record written in? ---');
  console.log(`  canonical (questionText)   ${String(canonical.length).padStart(6)}  ${((canonical.length / rows.length) * 100).toFixed(1)}%`);
  console.log(`  legacy    (text)           ${String(legacy.length).padStart(6)}  ${((legacy.length / rows.length) * 100).toFixed(1)}%`);
  console.log(`  neither (genuinely empty)  ${String(neither.length).padStart(6)}  ${((neither.length / rows.length) * 100).toFixed(1)}%`);

  const pct = (n: number, d: number) => `${((n / Math.max(d, 1)) * 100).toFixed(1)}%`.padStart(7);
  console.log('\n--- what the legacy records actually carry ---');
  const legacyFields: Array<[string, (r: any) => boolean]> = [
    ['text', (r) => has(r.text)],
    ['options', (r) => nonEmptyList(r.options)],
    ['correctOption (answer)', (r) => has(r.correctOption)],
    ['unitName', (r) => has(r.unitName)],
    ['unitCode', (r) => has(r.unitCode)],
    ['unitNumber', (r) => has(r.unitNumber)],
    ['subjectCode', (r) => has(r.subjectCode)],
    ['sourcePaperId', (r) => has(r.sourcePaperId)],
    ['sourceName', (r) => has(r.sourceName)],
    ['sourceTier', (r) => has(r.sourceTier)],
    ['documentHash', (r) => has(r.documentHash)],
    ['isAuthenticPYQ', (r) => r.isAuthenticPYQ !== undefined],
    ['marks', (r) => has(r.marks)],
    ['canonicalQuestionId', (r) => has(r.canonicalQuestionId)],
    ['status', (r) => has(r.status)],
  ];
  for (const [name, fn] of legacyFields) {
    const n = legacy.filter(fn).length;
    console.log(`  ${name.padEnd(24)} ${String(n).padStart(6)} ${pct(n, legacy.length)}`);
  }

  // Unit mapping is the prize: syllabus depth no other exam in the corpus has.
  const units = new Map<string, number>();
  for (const r of legacy) if (has(r.unitName)) units.set(`${r.subject} :: ${r.unitName}`, (units.get(`${r.subject} :: ${r.unitName}`) ?? 0) + 1);
  console.log(`\n--- unit-level mapping already present ---`);
  console.log(`  distinct (subject, unit) pairs: ${units.size}`);
  for (const [k, v] of [...units.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10)) {
    console.log(`    ${String(v).padStart(5)}  ${k.slice(0, 72)}`);
  }

  // The genuine content problem.
  console.log('\n--- text integrity ---');
  const withText = legacy.filter((r) => has(r.text));
  const mojibake = withText.filter((r) => looksMojibake(String(r.text)));
  const bySubject = new Map<string, { total: number; bad: number }>();
  for (const r of withText) {
    const k = String(r.subject);
    if (!bySubject.has(k)) bySubject.set(k, { total: 0, bad: 0 });
    const e = bySubject.get(k)!;
    e.total++;
    if (looksMojibake(String(r.text))) e.bad++;
  }
  console.log(`  legacy records whose text looks mis-decoded: ${mojibake.length} / ${withText.length} (${((mojibake.length / Math.max(withText.length, 1)) * 100).toFixed(1)}%)`);
  console.log(`  worst-affected subjects:`);
  for (const [subj, e] of [...bySubject.entries()].filter(([, e]) => e.bad > 0).sort((a, b) => b[1].bad - a[1].bad).slice(0, 8)) {
    console.log(`    ${subj.padEnd(26)} ${String(e.bad).padStart(5)} / ${String(e.total).padStart(5)}  ${((e.bad / e.total) * 100).toFixed(0)}%`);
  }
  if (mojibake[0]) console.log(`  sample: ${JSON.stringify(String(mojibake[0].text).slice(0, 70))}`);

  // What a normalisation pass would deterministically recover.
  const recoverable = {
    questionText: legacy.filter((r) => has(r.text)).length,
    correctAnswer: legacy.filter((r) => has(r.correctOption)).length,
    unitMapping: legacy.filter((r) => has(r.unitName) || has(r.unitCode)).length,
    sourceProvenance: legacy.filter((r) => has(r.sourceName) || has(r.sourcePaperId)).length,
  };
  console.log('\n--- deterministically recoverable by renaming (no inference, no LLM) ---');
  for (const [k, v] of Object.entries(recoverable)) console.log(`  ${k.padEnd(20)} ${String(v).padStart(6)}`);

  const cleanRecoverable = legacy.filter((r) => has(r.text) && !looksMojibake(String(r.text))).length;
  console.log(`\n  recoverable AND text is clean: ${cleanRecoverable}`);
  console.log(`  recoverable but needs re-decoding first: ${mojibake.length}`);

  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify({
    generatedAt: new Date().toISOString(),
    total: rows.length,
    contracts: { canonical: canonical.length, legacy: legacy.length, neither: neither.length },
    legacyFieldPresence: Object.fromEntries(legacyFields.map(([n, fn]) => [n, legacy.filter(fn).length])),
    distinctSubjectUnitPairs: units.size,
    mojibake: { count: mojibake.length, ofTextBearing: withText.length },
    recoverable, cleanRecoverable,
  }, null, 2));
  console.log(`\n-> ${OUT}`);
}

main().then(() => process.exit(0)).catch((e) => { console.error('FAILED:', e?.message || e); process.exit(1); });
