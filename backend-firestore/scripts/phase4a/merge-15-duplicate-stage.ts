/**
 * One-time correction: apply the content-free-branch rule to a record ingested before that rule
 * existed.
 *
 * Deliberately NOT a re-ingestion. Re-running extraction would put the document back through a
 * non-deterministic model, and any wording change in an ancestor name shifts the canonical ids
 * derived from that path — orphaning the 68 vectors already indexed and costing another full pass
 * of a quota-limited embedding model to rebuild. This applies the SAME exported function the
 * pipeline now uses, deterministically, to the tree already on record.
 *
 * Safe because the record is VERIFIED but never published: it has never been served to anyone.
 *
 * Refuses to write unless BOTH hold:
 *   - no TOPIC is lost
 *   - every surviving node keeps the exact id its vector is keyed on
 *
 *   npx tsx scripts/phase4a/merge-15-duplicate-stage.ts [--apply]
 */
import 'dotenv/config';
import { db } from '../../src/config/firebase';
import { examRepository } from '../../src/repositories/exam.repository';
import { pruneContentlessBranches } from '../../src/services/exam/syllabusMerge';
import { syllabusNodesOf, walkSyllabusNodes, SyllabusNode } from '../../src/types/exam.types';

const SYLLABUS_ID = 'syl_ssc_cgl_2026_2026_v1';
const APPLY = process.argv.includes('--apply');

const collect = (nodes: SyllabusNode[]) => {
  const ids = new Set<string>(); const topics = new Set<string>(); let total = 0;
  walkSyllabusNodes(nodes, (n) => { ids.add(n.nodeId); total++; if (n.type === 'TOPIC') topics.add(n.nodeId); });
  return { ids, topics, total };
};

(async () => {
  const syllabus: any = await examRepository.getSyllabusById(SYLLABUS_ID);
  if (!syllabus) throw new Error('syllabus not found');
  if (syllabus.status === 'CURRENT') throw new Error('refusing to rewrite a PUBLISHED syllabus');
  console.log(`record ${SYLLABUS_ID}  status=${syllabus.status}  mode=${APPLY ? 'APPLY' : 'DRY RUN'}\n`);

  const before = syllabusNodesOf(syllabus);
  const { nodes: after, dropped } = pruneContentlessBranches(before);
  const b = collect(before), a = collect(after);

  console.log(`stages : ${before.length} -> ${after.length}`);
  console.log(`nodes  : ${b.total} -> ${a.total}`);
  console.log(`topics : ${b.topics.size} -> ${a.topics.size}`);
  console.log(`\ndropped branches (${dropped.length}):`);
  dropped.forEach((d) => console.log(`   ${d}`));

  // ── safety gates ───────────────────────────────────────────────────────────────────
  const lostTopics = [...b.topics].filter((t) => !a.topics.has(t));
  const survivorsChanged = [...a.ids].filter((id) => !b.ids.has(id));
  console.log(`\nGATE topics lost              : ${lostTopics.length}`);
  console.log(`GATE surviving ids altered    : ${survivorsChanged.length}`);
  console.log(`GATE any content dropped      : ${dropped.length > 0 && a.topics.size !== b.topics.size}`);

  if (lostTopics.length || survivorsChanged.length) {
    console.error('\n*** REFUSING TO WRITE — a gate failed ***');
    process.exit(2);
  }
  if (!dropped.length) { console.log('\nnothing to prune; record already clean.'); process.exit(0); }

  if (!APPLY) { console.log('\nDRY RUN — pass --apply to write.'); process.exit(0); }

  await db.collection('exam_syllabi').doc(SYLLABUS_ID).update({ nodes: after, updatedAt: Date.now() });
  const reread = syllabusNodesOf((await examRepository.getSyllabusById(SYLLABUS_ID)) as any);
  const r = collect(reread);
  console.log(`\nwritten. re-read: stages=${reread.length} nodes=${r.total} topics=${r.topics.size}`);
  console.log(`topics preserved: ${r.topics.size === b.topics.size}`);
  process.exit(0);
})().catch((e) => { console.error('FAILED:', e?.message || e); process.exit(1); });
