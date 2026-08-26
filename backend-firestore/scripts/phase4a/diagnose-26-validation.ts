/**
 * Read what the validator is actually rejecting.
 *
 * A VALIDATION_FAILED ingestion still persists its record, so the node tree that failed is on
 * disk and can be re-validated locally — no model call, no embedding spend, and the exact same
 * code path that rejected it.
 *
 * Written because three fixes in a row were aimed at a REASON CODE rather than at an error.
 * GRAPH_VALIDATION_FAILED is a category; it can cover several unrelated structural faults, and
 * guessing which one from the label has now been wrong twice.
 *
 *   npx tsx scripts/phase4a/diagnose-26-validation.ts
 */
import 'dotenv/config';
import { db } from '../../src/config/firebase';
import { buildCanonicalGraph, validateCanonicalGraph } from '../../src/services/exam/syllabusCanonicalGraph';
import { syllabusNodesOf, walkSyllabusNodes, SYLLABUS_NODE_RANK } from '../../src/types/exam.types';

(async () => {
  const snap = await db.collection('exam_syllabi').get();
  const failing = snap.docs
    .map((d) => d.data() as any)
    .filter((s) => s.status === 'INVALID' || s.status === 'VERIFIED')
    .filter((s) => (s.nodes?.length || s.stages?.length));

  console.log(`syllabus records with a node tree: ${failing.length}\n`);

  for (const s of failing) {
    const nodes = syllabusNodesOf(s);
    if (!nodes.length) continue;

    const byType: Record<string, number> = {};
    walkSyllabusNodes(nodes, (n) => { byType[n.type] = (byType[n.type] || 0) + 1; });

    const graph = buildCanonicalGraph(s);
    const result = validateCanonicalGraph(graph, {
      examId: s.examId, cycleId: s.cycleId, syllabusId: s.syllabusId,
    });

    const shallowest = Math.min(...graph.nodes.map((n: any) => SYLLABUS_NODE_RANK[n.type]));
    console.log(`── ${s.syllabusId}  [${s.status}]`);
    console.log(`   types: ${JSON.stringify(byType)}  roots=${nodes.length}  shallowestRank=${shallowest}`);
    console.log(`   valid: ${result.valid}   errors: ${result.errors.length}`);

    if (result.errors.length) {
      const byCode: Record<string, number> = {};
      result.errors.forEach((e: any) => { byCode[e.code] = (byCode[e.code] || 0) + 1; });
      console.log(`   codes: ${JSON.stringify(byCode)}`);
      // The detail is the point — three fixes were aimed at the label instead of this.
      for (const e of result.errors.slice(0, 4)) {
        const node = graph.nodes.find((n: any) => n.id === e.nodeId);
        const parent = node?.parentEntityId ? graph.nodes.find((n: any) => n.id === node.parentEntityId) : null;
        console.log(`     ${e.code}: ${e.detail}`);
        if (node) console.log(`        node=${node.type} "${String(node.label).slice(0, 44)}"  parent=${parent ? parent.type : '(none)'}`);
      }
    }
    console.log('');
  }
  process.exit(0);
})().catch((e) => { console.error('FAILED:', e?.message || e); process.exit(1); });
