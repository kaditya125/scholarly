/**
 * Stage 1 migration audit — READ ONLY.
 *
 * Counts how many existing learning objects already carry a canonical syllabus identity, how many
 * carry only a display-name taxonomy, and how many carry an id that does not resolve. Nothing is
 * written, nothing is embedded, no semantic search is performed: every check is a metadata read or
 * a local comparison against the already-persisted graph.
 */
import 'dotenv/config';
import { db } from '../../src/config/firebase';

interface Row { object: string; total: number; mapped: number; missing: number; invalid: number; review: number; }

(async () => {
  const rows: Row[] = [];

  /** Every canonical node id that actually exists, per exam — loaded once, not per record. */
  const nodesByExam = new Map<string, Set<string>>();
  const graphExams = await db.collection('exam_syllabi_graphs').listDocuments();
  for (const ex of graphExams) {
    const versions = await ex.collection('versions').listDocuments();
    const ids = new Set<string>();
    for (const v of versions) {
      const ns = await v.collection('nodes').get();
      /*
       * The canonical id is the `id` FIELD, not the document id. Documents are keyed by
       * nodeDocId(id) = id.replace(/[:/]/g, '_') because Firestore ids cannot carry a slash, so
       * comparing a stored colon-form id against document ids reports every mapping as invalid.
       * This audit did exactly that on its first run and declared 44 valid mappings broken.
       */
      ns.forEach((n) => { const x: any = n.data(); if (x?.id) ids.add(x.id); });
    }
    nodesByExam.set(ex.id, ids);
  }
  const totalNodes = [...nodesByExam.values()].reduce((a, s) => a + s.size, 0);
  console.log(`graph loaded: ${nodesByExam.size} exams, ${totalNodes} canonical node ids\n`);

  const resolves = (examId: string, nodeId: string) => nodesByExam.get(examId)?.has(nodeId) ?? false;
  /** Does this id resolve under a DIFFERENT exam? That is a contamination signal, not a miss. */
  const resolvesElsewhere = (nodeId: string) =>
    [...nodesByExam.entries()].filter(([, s]) => s.has(nodeId)).map(([e]) => e);

  const audit = async (label: string, coll: string, examField = 'examId', nodeField = 'syllabusNodeId') => {
    const snap = await db.collection(coll).get();
    const r: Row = { object: label, total: snap.size, mapped: 0, missing: 0, invalid: 0, review: 0 };
    const collisions: string[] = [];
    snap.forEach((d) => {
      const x: any = d.data();
      const nodeId = x[nodeField];
      const examId = x[examField];
      if (!nodeId) { r.missing++; return; }
      if (!examId) { r.review++; return; }
      if (resolves(examId, nodeId)) { r.mapped++; return; }
      const elsewhere = resolvesElsewhere(nodeId);
      if (elsewhere.length) { r.invalid++; collisions.push(`${d.id}: claims ${examId}, resolves under ${elsewhere.join(',')}`); }
      else r.invalid++;
    });
    rows.push(r);
    if (collisions.length) { console.log(`  CROSS-EXAM COLLISIONS in ${label}:`); collisions.slice(0,3).forEach(c=>console.log('    '+c)); }
    return r;
  };

  await audit('PYQ questions', 'pyq_questions');

  // Mastery is per-user, so it lives in a collection group.
  const mastery = await db.collectionGroup('mastery').get();
  const mr: Row = { object: 'Mastery records', total: mastery.size, mapped: 0, missing: 0, invalid: 0, review: 0 };
  const labelKeys = new Set<string>();
  mastery.forEach((d) => {
    const x: any = d.data();
    if (x.syllabusNodeId) mr.mapped++;
    else { mr.missing++; labelKeys.add(d.id); }
  });
  rows.push(mr);

  console.log('| Object            | Total | Mapped | Missing | Invalid | Review |');
  console.log('|-------------------|-------|--------|---------|---------|--------|');
  for (const r of rows) {
    console.log(`| ${r.object.padEnd(17)} | ${String(r.total).padStart(5)} | ${String(r.mapped).padStart(6)} | ${String(r.missing).padStart(7)} | ${String(r.invalid).padStart(7)} | ${String(r.review).padStart(6)} |`);
  }
  if (labelKeys.size) {
    console.log(`\nlabel-keyed mastery concept ids (no canonical node): ${labelKeys.size}`);
    console.log('  e.g. ' + [...labelKeys].slice(0, 8).join(', '));
  }
  process.exit(0);
})().catch((e) => { console.error('FAILED:', e?.message || e); process.exit(1); });
