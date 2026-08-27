/**
 * The exam registry, classified by EXACT identifier — never by substring.
 *
 * A previous pass classified with /ibps|sbi|bank|clerk|lic|po\b/ and reported UPSC Civil Services
 * as a banking exam, because "lic" is inside "Public". Category membership is now an explicit
 * list of exam ids; an id that is not on a list is uncategorised and says so, which is a fact
 * rather than a guess.
 *
 * Costs ZERO embedding quota. Vector counts come from a constant probe vector — Pinecone only
 * needs correct dimensionality to apply a metadata filter, and the match COUNT is all we want.
 * Generating a real embedding here would compete with a live indexer for the same per-minute
 * quota, which is exactly what produced a 429 earlier.
 *
 *   npx tsx scripts/phase4a/audit-35-registry-matrix.ts [--csv]
 */
import 'dotenv/config';
import { env } from '../../src/config/env';
import { pineconeService } from '../../src/services/rag/pinecone.service';
import { db } from '../../src/config/firebase';

const DUMMY = new Array(768).fill(0.02);
const CSV = process.argv.includes('--csv');

/** Explicit membership. Add ids here; never infer a category from the name. */
const BANKING = new Set(['IBPS_PO', 'IBPS_CLERK', 'IBPS_RRB', 'IBPS_SO', 'SBI_PO', 'SBI_CLERK',
  'SBI_SO', 'RBI_GRADE_B', 'RBI_ASSISTANT', 'NABARD_GRADE_A', 'NABARD_GRADE_B']);
const RAILWAY = new Set(['RRB_NTPC', 'RRB_GROUP_D', 'RRB_ALP', 'RRB_JE', 'RRB_TECHNICIAN',
  'RPF_CONSTABLE', 'RPF_SI', 'RRB_PARAMEDICAL', 'RRB_MINISTERIAL']);

type State =
  | 'LIVE' | 'INDEXING' | 'QUEUED' | 'INDEXED_NOT_VERIFIED'
  | 'SYLLABUS_NOT_INDEXED' | 'REJECTED' | 'NO_SYLLABUS';

(async () => {
  const [examSnap, sylSnap] = await Promise.all([
    db.collection('exams').get(),
    db.collection('exam_syllabi').get(),
  ]);

  /** Best syllabus record per exam: CURRENT > VERIFIED > most recent INVALID. */
  const rank = (s: string) => (s === 'CURRENT' ? 3 : s === 'VERIFIED' ? 2 : 1);
  const best = new Map<string, any>();
  const allByExam = new Map<string, any[]>();
  sylSnap.forEach((d) => {
    const x: any = d.data();
    allByExam.set(x.examId, [...(allByExam.get(x.examId) || []), x]);
    const cur = best.get(x.examId);
    if (!cur || rank(x.status) > rank(cur.status)) best.set(x.examId, x);
  });

  const rows: any[] = [];
  for (const d of examSnap.docs) {
    const e: any = d.data();
    const examId = e.examId || d.id;
    const s = best.get(examId);
    const vectors = (await pineconeService.queryVectors(
      DUMMY as any, 2000, { examId } as any, env.PINECONE_NAMESPACE))?.length ?? 0;

    let state: State;
    if (!s) state = 'NO_SYLLABUS';
    else if (s.status === 'CURRENT') state = vectors > 0 ? 'LIVE' : 'SYLLABUS_NOT_INDEXED';
    else if (s.status === 'VERIFIED') state = vectors > 0 ? 'INDEXING' : 'QUEUED';
    else state = 'REJECTED';

    const ts = s?.revalidatedAt || s?.updatedAt || s?.fetchedAt || s?.createdAt || 0;
    rows.push({
      name: String(e.name || e.fullName || '').slice(0, 44),
      examId,
      authority: String(e.conductingAuthority || e.authority || s?.authority || '—').slice(0, 22),
      registered: true,
      syllabusStatus: s?.status || 'none',
      source: String(s?.sourceDocumentUrl || s?.sourceUrl || '—'),
      extraction: s ? `${(s.nodes || s.stages || []).length} roots` : 'none',
      vectors,
      state,
      verified: state === 'LIVE',
      updated: ts ? new Date(Number(ts)).toISOString().slice(0, 16).replace('T', ' ') : '—',
      versions: (allByExam.get(examId) || []).length,
      category: BANKING.has(examId) ? 'BANKING' : RAILWAY.has(examId) ? 'RAILWAY' : 'CIVIL/OTHER',
    });
  }
  rows.sort((a, b) => a.examId.localeCompare(b.examId));

  if (CSV) {
    console.log('examId,name,authority,syllabusStatus,vectors,state,verified,updated,source');
    rows.forEach((r) => console.log([r.examId, `"${r.name}"`, `"${r.authority}"`, r.syllabusStatus,
      r.vectors, r.state, r.verified, r.updated, `"${r.source}"`].join(',')));
    process.exit(0);
  }

  console.log('EXAM ID           SYLLABUS   VEC   STATE                  VER  UPDATED           AUTHORITY');
  console.log('─'.repeat(104));
  for (const r of rows) {
    console.log(`${r.examId.padEnd(17)} ${String(r.syllabusStatus).padEnd(10)} ${String(r.vectors).padStart(4)}  ` +
      `${r.state.padEnd(22)} ${(r.verified ? 'yes' : 'no').padEnd(4)} ${r.updated.padEnd(17)} ${r.authority}`);
  }

  const count = (s: State) => rows.filter((r) => r.state === s).length;
  console.log('\n=== TOTALS ===');
  console.log(`  registered exams          ${rows.length}`);
  console.log(`  LIVE                      ${count('LIVE')}`);
  console.log(`  INDEXING (partial vecs)   ${count('INDEXING')}`);
  console.log(`  QUEUED (verified, 0 vec)  ${count('QUEUED')}`);
  console.log(`  SYLLABUS_NOT_INDEXED      ${count('SYLLABUS_NOT_INDEXED')}`);
  console.log(`  INDEXED_NOT_VERIFIED      ${count('INDEXED_NOT_VERIFIED')}`);
  console.log(`  REJECTED (bad source)     ${count('REJECTED')}`);
  console.log(`  NO_SYLLABUS               ${count('NO_SYLLABUS')}`);
  console.log(`  without vectors           ${rows.filter((r) => r.vectors === 0).length}`);

  for (const cat of ['BANKING', 'RAILWAY'] as const) {
    const c = rows.filter((r) => r.category === cat);
    console.log(`\n=== ${cat} COVERAGE ===`);
    if (!c.length) { console.log('  no exams registered in this category'); continue; }
    c.forEach((r) => console.log(`  ${r.examId.padEnd(17)} ${r.state}  vectors=${r.vectors}`));
  }
  process.exit(0);
})().catch((e) => { console.error('FAILED:', e?.message || e); process.exit(1); });
