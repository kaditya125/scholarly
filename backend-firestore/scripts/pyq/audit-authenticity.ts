/**
 * Are the canonical PYQ questions authentic, or generated?
 *
 * Rule 2 of this phase is that every content_type="pyq" question must be traceable to a real
 * historical paper. Before scaling a corpus from tens to thousands, the seed has to be checked,
 * because scaling a synthetic seed multiplies the problem rather than revealing it.
 *
 * The specific reason for suspicion: IBPS_PO vectors indexed earlier today carry two DIFFERENT
 * question ids — vec_pyq_ibps_po_2022_mains_q28 and _q5 — with byte-identical question text.
 * Two distinct questions from one paper cannot have the same text; that is a signature of
 * generation, not extraction.
 *
 * Read-only. No embeddings.
 */
import 'dotenv/config';
import { db } from '../../src/config/firebase';

const norm = (s: string) => String(s || '').toLowerCase().replace(/\s+/g, ' ').trim();

(async () => {
  const exam = process.argv[2] || 'JEE_MAIN';
  const snap = await db.collection('pyq_questions').get();
  const all = snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }));
  const rows = all.filter((q) => (q.examId || q.exam) === exam);
  console.log(`pyq_questions total=${all.length}, ${exam}=${rows.length}\n`);
  if (!rows.length) { console.log('nothing to audit'); process.exit(0); }

  // 1. Duplicate question text under different ids — the IBPS signature.
  const byText = new Map<string, string[]>();
  for (const q of rows) {
    const t = norm(q.questionText || q.text || q.stem);
    if (!t) continue;
    byText.set(t, [...(byText.get(t) || []), q.id]);
  }
  const dupes = [...byText.entries()].filter(([, ids]) => ids.length > 1);
  console.log(`=== duplicate question text under different ids: ${dupes.length} ===`);
  for (const [t, ids] of dupes.slice(0, 5)) {
    console.log(`  ${ids.length}x  ${ids.slice(0, 4).join(', ')}`);
    console.log(`      "${t.slice(0, 110)}"`);
  }

  // 2. Provenance: does each question point at a real, checkable source?
  const provKeys = [...new Set(rows.flatMap((q) => Object.keys(q)))].filter((k) =>
    /source|provenance|origin|url|evidence|extract|hash|page/i.test(k));
  console.log(`\n=== provenance-ish fields present: ${provKeys.join(', ') || 'NONE'} ===`);

  const sample = rows[0];
  console.log('\n=== one full record ===');
  for (const k of Object.keys(sample).sort()) {
    const v = (sample as any)[k];
    console.log(`  ${k.padEnd(24)} ${JSON.stringify(v).slice(0, 150)}`);
  }
  process.exit(0);
})().catch((e) => { console.error('FAILED:', e?.message || e); process.exit(1); });
