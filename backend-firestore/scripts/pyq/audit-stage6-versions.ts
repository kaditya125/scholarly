/** Stage 6 real-data audit. READ ONLY. No embeddings, no Pinecone. */
import 'dotenv/config';
import { db } from '../../src/config/firebase';

(async () => {
  const graphs = await db.collection('exam_syllabi_graphs').listDocuments();
  console.log(`exams with a persisted graph: ${graphs.length}\n`);

  let multi = 0, totalVersions = 0, totalNodes = 0;
  const rows: any[] = [];
  for (const g of graphs) {
    const versions = await g.collection('versions').get();
    totalVersions += versions.size;
    if (versions.size > 1) multi++;
    for (const v of versions.docs) {
      const m: any = v.data();
      const n = await v.ref.collection('nodes').count().get().catch(() => null);
      const count = n ? n.data().count : (await v.ref.collection('nodes').get()).size;
      totalNodes += count;
      rows.push({ exam: g.id, syllabusId: v.id, nodes: count, validated: m.validated, cycleId: m.cycleId });
    }
  }
  rows.sort((a, b) => b.nodes - a.nodes).slice(0, 6).forEach((r) =>
    console.log(`  ${r.exam.padEnd(16)} ${r.syllabusId.padEnd(34)} nodes=${String(r.nodes).padStart(5)} cycle=${r.cycleId}`));
  console.log(`\nexams with MORE THAN ONE version: ${multi}`);
  console.log(`total versions: ${totalVersions}   total graph nodes: ${totalNodes}`);

  // What version metadata actually exists on the syllabus record?
  const syl = await db.collection('exam_syllabi').where('status', '==', 'CURRENT').limit(1).get();
  if (!syl.empty) {
    const s: any = syl.docs[0].data();
    const versionish = Object.keys(s).filter((k) =>
      /version|effective|status|source|cycle|retriev|publish|createdAt|updatedAt|supersed|previous/i.test(k));
    console.log(`\nversion-ish fields on a CURRENT syllabus record (${s.examId}):`);
    versionish.sort().forEach((k) => console.log(`  ${k.padEnd(24)} ${JSON.stringify(s[k]).slice(0, 70)}`));
    console.log(`\nlineage-ish fields: ${Object.keys(s).filter((k) => /supersed|previous|replaces|lineage|derivedFrom/i.test(k)).join(', ') || 'NONE'}`);
  }

  // Multiple syllabus records per exam = the raw material for a future real diff.
  const all = await db.collection('exam_syllabi').get();
  const byExam = new Map<string, string[]>();
  all.forEach((d) => { const x: any = d.data(); byExam.set(x.examId, [...(byExam.get(x.examId) || []), `${x.syllabusId}(${x.status})`]); });
  const withMany = [...byExam.entries()].filter(([, v]) => v.length > 1);
  console.log(`\nexams with >1 syllabus RECORD: ${withMany.length}`);
  withMany.slice(0, 4).forEach(([e, v]) => console.log(`  ${e}: ${v.join(', ')}`));
  process.exit(0);
})().catch((e) => { console.error('FAILED:', e?.message || e); process.exit(1); });
