/**
 * Stage 2 migration audit — READ ONLY, no writes, no embeddings.
 *
 * Reports what historical activity COULD contribute to node mastery if a migration were run.
 * Nothing is migrated: §25 requires the audit to be validated before any historical mastery is
 * written, and the mastery collection being empty means there is no pressure to rush it.
 *
 * The 282 unresolved PYQs are counted separately and marked EXCLUDED rather than folded into
 * "missing", because they are not merely unmapped — their provenance is unresolved, and mapping
 * them would give questionable content real syllabus addresses.
 */
import 'dotenv/config';
import { db } from '../../src/config/firebase';
import { validateSyllabusNodeIdsBatch } from '../../src/services/exam/syllabusNodeIdentity';

interface Row { source: string; total: number; eligible: number; excluded: number; reason: string; }

(async () => {
  const rows: Row[] = [];
  let reads = 0;

  // ── PYQs ────────────────────────────────────────────────────────────────────────────────
  const pyq = await db.collection('pyq_questions').get();
  reads++;
  const pyqItems = pyq.docs.map((d) => { const x: any = d.data(); return { examId: x.examId || '', syllabusNodeId: x.syllabusNodeId }; });
  const pyqResults = await validateSyllabusNodeIdsBatch(pyqItems);
  const pyqValid = pyqResults.filter((r) => r.valid).length;
  const pyqUnmapped = pyqResults.filter((r) => r.code === 'MISSING_NODE_ID').length;
  rows.push({
    source: 'PYQ (validated)', total: pyq.size, eligible: pyqValid, excluded: 0,
    reason: 'mapped + node resolves',
  });
  rows.push({
    source: 'PYQ (unresolved)', total: pyqUnmapped, eligible: 0, excluded: pyqUnmapped,
    reason: 'provenance unresolved — HELD per Stage 2 §8/§29',
  });

  // ── Quiz / test attempts ────────────────────────────────────────────────────────────────
  for (const coll of ['quiz_attempts', 'test_attempts', 'attempts']) {
    try {
      const snap = await db.collection(coll).limit(2000).get();
      reads++;
      if (snap.empty) { rows.push({ source: coll, total: 0, eligible: 0, excluded: 0, reason: 'collection empty or absent' }); continue; }
      const items = snap.docs.map((d) => { const x: any = d.data(); return { examId: x.examId || '', syllabusNodeId: x.syllabusNodeId }; });
      const res = await validateSyllabusNodeIdsBatch(items);
      const ok = res.filter((r) => r.valid).length;
      rows.push({ source: coll, total: snap.size, eligible: ok, excluded: snap.size - ok, reason: 'no validated node on the attempt' });
    } catch {
      rows.push({ source: coll, total: 0, eligible: 0, excluded: 0, reason: 'collection absent' });
    }
  }

  // ── Existing mastery ────────────────────────────────────────────────────────────────────
  const mastery = await db.collectionGroup('mastery').get();
  reads++;
  const anchored = mastery.docs.filter((d) => (d.data() as any).syllabusNodeId).length;
  rows.push({
    source: 'existing mastery', total: mastery.size, eligible: anchored, excluded: mastery.size - anchored,
    reason: 'legacy label-keyed records carry no canonical node',
  });

  console.log('| Source              | Total | Eligible | Excluded | Reason |');
  console.log('|---------------------|-------|----------|----------|--------|');
  for (const r of rows) {
    console.log(`| ${r.source.padEnd(19)} | ${String(r.total).padStart(5)} | ${String(r.eligible).padStart(8)} | ${String(r.excluded).padStart(8)} | ${r.reason} |`);
  }
  console.log(`\ncollection reads: ${reads}  ·  writes: 0  ·  embeddings: 0`);
  process.exit(0);
})().catch((e) => { console.error('FAILED:', e?.message || e); process.exit(1); });
