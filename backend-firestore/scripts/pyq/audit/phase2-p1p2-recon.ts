/**
 * P1 + P2 reconnaissance. STRICTLY READ-ONLY.
 *
 * Two questions must be answered from the data before any code is written:
 *
 *   P1  What shape are the existing syllabus `nodes`? The graph collection is empty but the
 *       source is populated, so the graph must be built from what is already canonical rather
 *       than from a taxonomy invented here.
 *
 *   P2  What do the 27,640 UGC NET records actually contain? "topic = 0%" says a field is empty;
 *       it does not say whether the information is absent, or present under a different name, or
 *       recoverable from the question id. Embedding 27,537 records before knowing which is true
 *       would spend ~90 hours of quota on records that still could not be retrieved by topic.
 */
import { firebaseApp } from '../../../src/config/firebase';
import * as fs from 'fs';
import * as path from 'path';

const OUT = path.join(__dirname, 'out', 'p1p2-recon.json');
const has = (v: any) => v !== undefined && v !== null && String(v).trim() !== '';

async function main() {
  const db = firebaseApp.firestore();
  const report: any = {};

  // ── P1: syllabus node schema ───────────────────────────────────────────────────────────────
  console.log('=== P1: exam_syllabi node schema ===');
  const syl = await db.collection('exam_syllabi').limit(100).get();
  const docs = syl.docs.map((d) => ({ id: d.id, ...(d.data() as any) }));
  console.log(`  documents: ${docs.length}`);
  const withNodes = docs.filter((d: any) => Array.isArray(d.nodes) && d.nodes.length > 0);
  console.log(`  with a populated nodes array: ${withNodes.length}`);
  const nodeCounts = withNodes.map((d: any) => ({ examId: d.examId, id: d.id, nodes: d.nodes.length, status: d.status, version: d.version }));
  for (const n of nodeCounts.slice(0, 12)) {
    console.log(`    ${String(n.examId).padEnd(14)} nodes=${String(n.nodes).padStart(4)} status=${n.status} v=${n.version}`);
  }
  const totalNodes = nodeCounts.reduce((a, n) => a + n.nodes, 0);
  console.log(`  total nodes across all syllabi: ${totalNodes}`);

  const sampleNode = (withNodes[0] as any)?.nodes?.[0];
  if (sampleNode) {
    console.log(`\n  node fields: ${Object.keys(sampleNode).sort().join(', ')}`);
    console.log(`  sample node: ${JSON.stringify(sampleNode).slice(0, 320)}`);
    // Is it a flat list with parent pointers, or nested children?
    const nodes = (withNodes[0] as any).nodes;
    const hasParent = nodes.filter((n: any) => has(n.parentId) || has(n.parent)).length;
    const hasChildren = nodes.filter((n: any) => Array.isArray(n.children) && n.children.length).length;
    const levels = [...new Set(nodes.map((n: any) => n.level ?? n.depth ?? n.type ?? '(none)'))];
    console.log(`  shape: ${hasParent} nodes carry a parent pointer, ${hasChildren} carry children`);
    console.log(`  level/type values: ${JSON.stringify(levels.slice(0, 12))}`);
    report.syllabusNodeSample = sampleNode;
    report.syllabusShape = { hasParent, hasChildren, levels };
  }
  report.syllabi = nodeCounts;

  // Do question syllabusNodeIds actually match node ids?
  const nodeIdSet = new Set<string>();
  for (const d of withNodes as any[]) for (const n of d.nodes) if (has(n.id ?? n.nodeId)) nodeIdSet.add(String(n.id ?? n.nodeId));
  console.log(`\n  distinct syllabus node ids: ${nodeIdSet.size}`);

  // ── P2: UGC NET structural audit ───────────────────────────────────────────────────────────
  console.log('\n=== P2: UGC NET structural audit ===');
  const ugc: any[] = [];
  let last: any = null;
  while (true) {
    let q: FirebaseFirestore.Query = db.collection('pyq_questions').where('examId', '==', 'UGC_NET').orderBy('__name__').limit(2000);
    if (last) q = q.startAfter(last);
    const s = await q.get();
    if (s.empty) break;
    for (const d of s.docs) ugc.push(d.data());
    last = s.docs[s.docs.length - 1];
    if (s.size < 2000) break;
  }
  console.log(`  records: ${ugc.length}`);

  const FIELDS = ['questionText', 'options', 'correctAnswer', 'explanation', 'solution', 'subject',
    'paper', 'year', 'session', 'shift', 'questionNumber', 'sourceId', 'sourceUrl', 'provenanceRecords',
    'difficulty', 'questionType', 'topic', 'subtopic', 'syllabusNodeId', 'canonicalPaperId',
    'sittingId', 'normalizedSession', 'normalizedShift', 'language', 'corpusBucket', 'verificationStatus'];
  console.log('\n  field presence:');
  const presence: Record<string, number> = {};
  for (const f of FIELDS) {
    const n = ugc.filter((q) => {
      const v = q[f];
      if (Array.isArray(v)) return v.length > 0;
      if (v && typeof v === 'object') return Object.keys(v).length > 0;
      return has(v);
    }).length;
    presence[f] = n;
    const pct = ((n / ugc.length) * 100).toFixed(1);
    console.log(`    ${f.padEnd(20)} ${String(n).padStart(6)}  ${pct.padStart(6)}%`);
  }
  report.ugcNetPresence = presence;
  report.ugcNetCount = ugc.length;

  // What identity IS present?
  const tally = (f: (q: any) => any, limit = 14) => {
    const m = new Map<string, number>();
    for (const q of ugc) { const v = f(q); const k = has(v) ? String(v) : '(empty)'; m.set(k, (m.get(k) ?? 0) + 1); }
    return [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, limit);
  };
  console.log('\n  subject distribution (top 14):');
  for (const [k, v] of tally((q) => q.subject)) console.log(`    ${String(v).padStart(6)}  ${k.slice(0, 60)}`);
  console.log('\n  paper distribution:');
  for (const [k, v] of tally((q) => q.paper, 10)) console.log(`    ${String(v).padStart(6)}  ${k.slice(0, 60)}`);
  console.log('\n  year distribution (top 12):');
  for (const [k, v] of tally((q) => q.year, 12)) console.log(`    ${String(v).padStart(6)}  ${k}`);
  console.log('\n  session distribution (top 10):');
  for (const [k, v] of tally((q) => q.session, 10)) console.log(`    ${String(v).padStart(6)}  ${k.slice(0, 50)}`);

  // questionId encodes identity — can subject/paper/year be recovered deterministically from it?
  console.log('\n  questionId samples (identity may be recoverable from the id itself):');
  for (const q of ugc.slice(0, 6)) console.log(`    ${q.questionId}`);
  const idPattern = ugc.filter((q) => /^pyq:ugc_net:/i.test(String(q.questionId))).length;
  console.log(`  ids matching 'pyq:ugc_net:...': ${idPattern}/${ugc.length}`);

  // P2.2 — Computer Science specifically
  console.log('\n  === UGC NET Computer Science ===');
  const csRe = /comput/i;
  const cs = ugc.filter((q) => csRe.test(String(q.subject ?? '')) || csRe.test(String(q.questionId ?? '')) || csRe.test(String(q.examName ?? '')));
  console.log(`    records matching "comput": ${cs.length}`);
  if (cs.length) {
    const csYears = [...new Set(cs.map((q) => q.year).filter(Boolean))].sort();
    console.log(`    years: ${JSON.stringify(csYears)}`);
    console.log(`    papers: ${JSON.stringify([...new Set(cs.map((q) => q.paper).filter(Boolean))].slice(0, 8))}`);
    console.log(`    sessions: ${JSON.stringify([...new Set(cs.map((q) => q.session).filter(Boolean))].slice(0, 8))}`);
    console.log(`    sample: ${JSON.stringify(String(cs[0].questionText ?? '').slice(0, 90))}`);
  }
  report.ugcNetComputerScience = { count: cs.length };

  // P2.3 — is there a UGC NET syllabus anywhere under any identifier?
  console.log('\n  === UGC NET syllabus search ===');
  const allSyl = docs.map((d: any) => ({ id: d.id, examId: d.examId, title: d.sourceDocumentTitle }));
  const ugcSyl = allSyl.filter((s: any) => /ugc|net/i.test(String(s.id)) || /ugc|net/i.test(String(s.examId)) || /ugc|net/i.test(String(s.title ?? '')));
  console.log(`    exam_syllabi rows mentioning ugc/net: ${ugcSyl.length}`);
  if (ugcSyl.length) for (const s of ugcSyl.slice(0, 5)) console.log(`      ${s.id} examId=${s.examId} title=${JSON.stringify(String(s.title).slice(0, 50))}`);
  const examsSnap = await db.collection('exams').limit(200).get();
  const ugcExam = examsSnap.docs.filter((d) => /ugc|net/i.test(d.id));
  console.log(`    exams rows mentioning ugc/net: ${ugcExam.length} ${JSON.stringify(ugcExam.map((d) => d.id))}`);
  const srcSnap = await db.collection('exam_official_sources').limit(100).get();
  console.log(`    exam_official_sources rows: ${srcSnap.size} ${JSON.stringify(srcSnap.docs.map((d) => d.id).slice(0, 6))}`);
  report.ugcNetSyllabus = { inExamSyllabi: ugcSyl.length, inExams: ugcExam.length };

  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify(report, null, 2));
  console.log(`\n-> ${OUT}`);
}

main().then(() => process.exit(0)).catch((e) => { console.error('FAILED:', e?.message || e); process.exit(1); });
