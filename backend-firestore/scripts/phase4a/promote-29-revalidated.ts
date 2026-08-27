/**
 * Promote INVALID syllabi that now pass validation.
 *
 * These trees were rejected by type-based hierarchy rules that were later removed — each of the
 * five was contradicted by a real official notice. The extraction itself succeeded and is on
 * disk, so this re-runs the CURRENT validator and promotes only what genuinely passes now.
 *
 * Re-validates rather than trusting the old status in either direction: a stale INVALID must not
 * block a good tree, and it must equally not wave a bad one through. Nothing is promoted without
 * the validator agreeing on this run.
 *
 * ── One version per exam ────────────────────────────────────────────────────────────────────
 * Retries left several exams with more than one INVALID record — BPSC OSH has both a v1 and a v3.
 * Promoting both would index two competing trees for one exam and publish whichever finished
 * last, so retrieval would answer from a version nobody chose. Exactly one record per exam is
 * promoted: the one with the most TOPIC nodes, since a retry that captured more of the document
 * is the better tree, with the version string as a tie-break. The losers are named, not silently
 * dropped.
 *
 * Refuses outright if the exam already has a CURRENT version — that is a replacement, which is a
 * different and more dangerous operation than filling a gap.
 *
 * ── The graph manifest is not optional ──────────────────────────────────────────────────────
 * Setting status to VERIFIED is NOT enough to make a version publishable. The publish gate reads
 * a separate manifest at exam_syllabi_graphs/{examId}/versions/{syllabusId}, which only
 * syllabusGraphService writes and only after structural validation passes; an absent manifest
 * means no graph was ever built, and publication is refused with GRAPH_NOT_VALIDATED.
 *
 * An earlier version of this script set the status alone. UPSC CSE therefore indexed all 797
 * vectors over two hours and was then refused at the publish gate — the gate behaving exactly as
 * designed, catching a version whose graph had never been built. buildSyllabusGraph is now called
 * BEFORE the status is set, so a version is never marked VERIFIED without the artefact that makes
 * that claim checkable.
 *
 *   npx tsx scripts/phase4a/promote-29-revalidated.ts UPSC_NDA SSC_CHSL [--apply]
 */
import 'dotenv/config';
import { db } from '../../src/config/firebase';
import { buildCanonicalGraph, validateCanonicalGraph } from '../../src/services/exam/syllabusCanonicalGraph';
import { syllabusGraphService } from '../../src/services/exam/syllabusGraph.service';

const APPLY = process.argv.includes('--apply');
const WANTED = process.argv.slice(2).filter((a) => !a.startsWith('--'));

interface Candidate { ref: FirebaseFirestore.DocumentReference; s: any; topics: number; errors: number; }

(async () => {
  if (!WANTED.length) { console.error('give at least one examId'); process.exit(1); }

  const all = await db.collection('exam_syllabi').get();
  const live = new Set<string>();
  all.forEach((d) => { const x: any = d.data(); if (x.status === 'CURRENT') live.add(x.examId); });

  const byExam = new Map<string, Candidate[]>();
  for (const doc of all.docs) {
    const s = doc.data() as any;
    // VERIFIED records are included too: one may be VERIFIED yet still lack a graph manifest,
    // which is precisely the state that fails at the publish gate.
    if (!['INVALID', 'VERIFIED'].includes(s.status) || !WANTED.includes(s.examId)) continue;
    const graph = buildCanonicalGraph(s);
    const result = validateCanonicalGraph(graph, { examId: s.examId, cycleId: s.cycleId, syllabusId: s.syllabusId });
    const topics = graph.nodes.filter((n: any) => n.type === 'TOPIC').length;
    const list = byExam.get(s.examId) || [];
    list.push({ ref: doc.ref, s, topics, errors: result.valid ? result.errors.length : Math.max(1, result.errors.length) });
    byExam.set(s.examId, list);
  }

  console.log(`${WANTED.length} exam(s) requested${APPLY ? '' : '  (DRY RUN)'}\n`);
  let promoted = 0;

  for (const examId of WANTED) {
    const list = byExam.get(examId);
    console.log(`── ${examId}`);
    if (!list?.length) { console.log('   no INVALID record — nothing to promote'); continue; }
    if (live.has(examId)) { console.log('   REFUSED — already has a CURRENT version; replacing is a separate decision'); continue; }

    const passing = list.filter((c) => c.errors === 0 && c.topics > 0);
    for (const c of list.filter((x) => !passing.includes(x))) {
      console.log(`   skip ${c.s.syllabusId} — errors=${c.errors} topics=${c.topics}`);
    }
    if (!passing.length) { console.log('   nothing passes validation'); continue; }

    passing.sort((a, b) => b.topics - a.topics || String(b.s.version).localeCompare(String(a.s.version)));
    const [winner, ...losers] = passing;
    console.log(`   winner ${winner.s.syllabusId}  topics=${winner.topics}  errors=0`);
    for (const l of losers) console.log(`   losing duplicate left INVALID: ${l.s.syllabusId} (topics=${l.topics})`);

    const manifestRef = db.collection('exam_syllabi_graphs').doc(examId)
      .collection('versions').doc(winner.s.syllabusId);
    const hasManifest = (await manifestRef.get()).exists;
    console.log(`   graph manifest: ${hasManifest ? 'present' : 'MISSING — will build'}`);
    if (hasManifest && winner.s.status === 'VERIFIED') { console.log('   already publishable'); continue; }

    if (!APPLY) { console.log('   would build graph, then promote -> VERIFIED'); continue; }

    // Graph first: it validates again and throws rather than leaving a half-built subtree.
    const built = await syllabusGraphService.buildSyllabusGraph(winner.s);
    console.log(`   graph built: ${built.nodeCount} nodes, ${built.edgeCount} edges`);

    await winner.ref.update({
      status: 'VERIFIED',
      revalidatedAt: Date.now(),
      revalidationNote: 'promote-29: re-validated after hierarchy-rule removal; graph manifest built',
    });
    console.log('   promoted -> VERIFIED (publishable)');
    promoted++;
  }
  console.log(`\n${APPLY ? 'promoted' : 'would promote'} ${APPLY ? promoted : '(dry run)'}`);
  process.exit(0);
})().catch((e) => { console.error('FAILED:', e?.message || e); process.exit(1); });
