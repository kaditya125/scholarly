/**
 * Curriculum GAP AUDIT — read-only, no AI cost.
 *
 * For every candidate NCERT chapter in the manifest:
 *   1. Probes the real PDF URL (ranged GET, ~1KB) to learn which files ACTUALLY exist.
 *   2. For each existing file, checks whether its chapter is already ingested (READY)
 *      in the target notebook — matched by exact manifest title AND, as a fallback,
 *      by chapter number (to detect content already present under a different title,
 *      e.g. from the old seed script).
 *
 * Output: exact list of REAL chapters that are NOT yet ingested (true gaps), grouped
 * by notebook, plus duplicate/empty-notebook diagnostics.
 *
 * Usage: npx tsx src/scripts/curriculum_gap_audit.ts
 */
import { db } from '../config/firebase';

const BASE = 'https://ncert.nic.in/textbook/pdf';

const BOOKS: Array<{ cls: number; subject: string; bookName?: string; code: string; parts: number; chapters: number }> = [
  { cls: 12, subject: 'Physics', code: 'leph', parts: 2, chapters: 15 },
  { cls: 12, subject: 'Chemistry', code: 'lech', parts: 2, chapters: 16 },
  { cls: 12, subject: 'Biology', code: 'lebo', parts: 1, chapters: 16 },
  { cls: 12, subject: 'Mathematics', code: 'lemh', parts: 2, chapters: 13 },
  { cls: 11, subject: 'Physics', code: 'keph', parts: 2, chapters: 15 },
  { cls: 11, subject: 'Chemistry', code: 'kech', parts: 2, chapters: 14 },
  { cls: 11, subject: 'Biology', code: 'kebo', parts: 1, chapters: 22 },
  { cls: 11, subject: 'Mathematics', code: 'kemh', parts: 1, chapters: 16 },
  { cls: 10, subject: 'Science', code: 'jesc', parts: 1, chapters: 16 },
  { cls: 10, subject: 'Mathematics', code: 'jemh', parts: 1, chapters: 15 },
  { cls: 9, subject: 'Science', code: 'iesc', parts: 1, chapters: 15 },
  { cls: 9, subject: 'Mathematics', code: 'iemh', parts: 1, chapters: 15 },
  { cls: 8, subject: 'Science', code: 'hesc', parts: 1, chapters: 18 },
  { cls: 8, subject: 'Mathematics', code: 'hemh', parts: 1, chapters: 16 },
  { cls: 7, subject: 'Science', bookName: 'Curiosity', code: 'gecu', parts: 1, chapters: 18 },
  { cls: 7, subject: 'Mathematics', bookName: 'Ganita Prakash', code: 'gegp', parts: 1, chapters: 15 },
  { cls: 6, subject: 'Science', bookName: 'Curiosity', code: 'fecu', parts: 1, chapters: 16 },
  { cls: 6, subject: 'Mathematics', bookName: 'Ganita Prakash', code: 'fegp', parts: 1, chapters: 14 },
  { cls: 5, subject: 'EVS', bookName: 'Looking Around', code: 'eeap', parts: 1, chapters: 22 },
  { cls: 5, subject: 'Mathematics', bookName: 'Math-Magic', code: 'eemh', parts: 1, chapters: 14 },
];

interface Item { url: string; cls: number; subject: string; bookName?: string; title: string; notebookId: string; chapter: number; }

const pad2 = (n: number) => String(n).padStart(2, '0');

function notebookIdFor(cls: number, subject: string, bookName?: string): string {
  const slug = bookName ? `${subject.toLowerCase()}-${bookName.toLowerCase()}` : subject.toLowerCase();
  return `ncert-c${cls}-${slug.replace(/[^a-z0-9]/g, '-')}`;
}

function buildManifest(): Item[] {
  const items: Item[] = [];
  for (const b of BOOKS) {
    for (let p = 1; p <= b.parts; p++) {
      for (let c = 1; c <= b.chapters; c++) {
        const partTag = b.parts > 1 ? ` (Part ${p})` : '';
        const bookTag = b.bookName ? ` (${b.bookName})` : '';
        items.push({
          url: `${BASE}/${b.code}${p}${pad2(c)}.pdf`,
          cls: b.cls, subject: b.subject, bookName: b.bookName,
          title: `NCERT Class ${b.cls} ${b.subject}${bookTag}${partTag} - Chapter ${c}.pdf`,
          notebookId: notebookIdFor(b.cls, b.subject, b.bookName),
          chapter: c,
        });
      }
    }
  }
  return items;
}

/** Light existence probe: ranged GET of first 1KB, check 200 + %PDF magic bytes. */
async function existsPdf(url: string): Promise<boolean> {
  try {
    const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0', Range: 'bytes=0-1023' } });
    if (!res.ok && res.status !== 206) return false;
    const buf = Buffer.from(await res.arrayBuffer());
    return buf.slice(0, 4).toString('latin1') === '%PDF';
  } catch {
    return false;
  }
}

async function mapLimit<T, R>(arr: T[], limit: number, fn: (t: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(arr.length);
  let i = 0;
  async function worker() {
    while (i < arr.length) { const idx = i++; out[idx] = await fn(arr[idx]); }
  }
  await Promise.all(Array.from({ length: Math.min(limit, arr.length) }, worker));
  return out;
}

async function main() {
  const manifest = buildManifest();
  console.log(`Probing ${manifest.length} candidate NCERT URLs for existence...`);

  const existsFlags = await mapLimit(manifest, 12, (it) => existsPdf(it.url));
  const real = manifest.filter((_, i) => existsFlags[i]);
  console.log(`Real files on NCERT: ${real.length}  |  non-existent (404): ${manifest.length - real.length}\n`);

  // Load READY titles per notebook once.
  const notebookIds = Array.from(new Set(real.map((r) => r.notebookId)));
  const readyByNotebook = new Map<string, { titles: Set<string>; chapters: Set<number> }>();
  for (const nb of notebookIds) {
    const snap = await db.collection('notebooks').doc(nb).collection('sources').where('status', '==', 'READY').get();
    const titles = new Set<string>();
    const chapters = new Set<number>();
    for (const d of snap.docs) {
      const t = (d.data() as any).title || '';
      titles.add(t);
      const m = t.match(/Chapter (\d+)/i);
      if (m) chapters.add(parseInt(m[1], 10));
    }
    readyByNotebook.set(nb, { titles, chapters });
  }

  const gaps: Item[] = [];
  const dupTitlePresent: Item[] = [];
  for (const it of real) {
    const rec = readyByNotebook.get(it.notebookId);
    if (rec?.titles.has(it.title)) continue; // exact match → ingested
    // Fallback: same chapter number already READY in this notebook (content likely present
    // under a different title, e.g. old seed format). Ambiguous for multi-part books.
    if (rec?.chapters.has(it.chapter)) { dupTitlePresent.push(it); continue; }
    gaps.push(it);
  }

  // Group true gaps by notebook.
  const byNb = new Map<string, Item[]>();
  for (const g of gaps) { if (!byNb.has(g.notebookId)) byNb.set(g.notebookId, []); byNb.get(g.notebookId)!.push(g); }

  console.log('================ TRUE GAPS (real NCERT chapters NOT ingested) ================');
  if (byNb.size === 0) console.log('  none 🎉');
  const gapRows: any[] = [];
  for (const [nb, items] of Array.from(byNb.entries()).sort()) {
    console.log(`\n[${nb}]  missing ${items.length}:`);
    for (const it of items) console.log(`   - ${it.title}   ${it.url}`);
    gapRows.push({ notebook: nb, missing: items.length });
  }

  console.log('\n================ SUMMARY ================');
  console.table(gapRows);
  console.log(`Real NCERT chapters total       : ${real.length}`);
  console.log(`Already ingested (exact title)  : ${real.length - gaps.length - dupTitlePresent.length}`);
  console.log(`Present under different title*  : ${dupTitlePresent.length}  (*likely old-seed duplicates / multi-part ambiguity)`);
  console.log(`TRUE GAPS to ingest             : ${gaps.length}`);
  console.log(`\nNOTE: manifest is STEM-only (Science/Physics/Chemistry/Biology/Math/EVS). Social Science, English, Hindi etc. are NOT in scope.`);
  process.exit(0);
}

main().catch((e) => { console.error('audit error:', e); process.exit(1); });
