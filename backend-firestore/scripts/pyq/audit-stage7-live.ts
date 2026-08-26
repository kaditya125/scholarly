/**
 * Stage 7 live PYQ audit. READ ONLY, zero embeddings.
 *
 * Measured, not inherited from an earlier report — the corpus has been growing throughout, so any
 * number older than this run is already wrong.
 */
import 'dotenv/config';
import { db } from '../../src/config/firebase';
import { validateSyllabusNodeIdsBatch } from '../../src/services/exam/syllabusNodeIdentity';
import https from 'https';

const tally = (rows: any[], f: (r: any) => string) => {
  const m = new Map<string, number>();
  rows.forEach((r) => { const k = f(r) ?? 'undefined'; m.set(k, (m.get(k) ?? 0) + 1); });
  return [...m.entries()].sort((a, b) => b[1] - a[1]);
};
const show = (label: string, t: [string, number][]) => {
  console.log(`\n${label}`);
  t.forEach(([k, v]) => console.log(`  ${String(k).padEnd(28)} ${v}`));
};

const head = (url: string) => new Promise<number>((resolve) => {
  try {
    const req = https.request(url, { method: 'HEAD', timeout: 10000 }, (res) => { resolve(res.statusCode ?? 0); res.destroy(); });
    req.on('error', () => resolve(-1));
    req.on('timeout', () => { req.destroy(); resolve(-2); });
    req.end();
  } catch { resolve(-1); }
});

(async () => {
  const snap = await db.collection('pyq_questions').get();
  const rows = snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }));
  console.log(`=== LIVE PYQ CORPUS: ${rows.length} questions ===`);

  show('by ingestionState:', tally(rows, (r) => r.ingestionState));
  show('by verificationStatus:', tally(rows, (r) => r.verificationStatus));
  show('by rightsStatus:', tally(rows, (r) => r.rightsStatus));
  show('by exam:', tally(rows, (r) => r.examId));
  console.log(`\nredistributionAllowed === true : ${rows.filter((r) => r.redistributionAllowed === true).length}`);

  // Node mapping, batched — one read per (exam, version), not per question.
  const res = await validateSyllabusNodeIdsBatch(rows.map((r) => ({ examId: r.examId || '', syllabusNodeId: r.syllabusNodeId })));
  const codes = new Map<string, number>();
  res.forEach((x) => codes.set(x.code, (codes.get(x.code) ?? 0) + 1));
  show('syllabus node validation:', [...codes.entries()].sort((a, b) => b[1] - a[1]));

  // Do the cited sources actually exist? The authenticity question, measured.
  const urls = [...new Set(rows.map((r) => r.sourceUrl).filter(Boolean))];
  console.log(`\ndistinct cited source URLs: ${urls.length}`);
  let ok = 0, gone = 0;
  for (const u of urls.slice(0, 12)) {
    const s = await head(u);
    if (s >= 200 && s < 400) ok++; else gone++;
  }
  console.log(`  sampled ${Math.min(12, urls.length)}: reachable=${ok}  unreachable/404=${gone}`);

  // Duplicate question text under different ids — a generation signature.
  const byText = new Map<string, number>();
  rows.forEach((r) => { const t = String(r.questionText || '').toLowerCase().replace(/\s+/g, ' ').trim(); if (t) byText.set(t, (byText.get(t) ?? 0) + 1); });
  const dupes = [...byText.values()].filter((v) => v > 1).length;
  console.log(`\ndistinct question texts: ${byText.size} of ${rows.length}`);
  console.log(`  texts appearing more than once: ${dupes}`);

  const placeholderHash = rows.filter((r) => /^hash_/.test(String(r.contentHash || ''))).length;
  console.log(`  contentHash that is a placeholder string: ${placeholderHash}`);
  process.exit(0);
})().catch((e) => { console.error('FAILED:', e?.message || e); process.exit(1); });
