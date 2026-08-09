import { firebaseApp } from './src/config/firebase';

/**
 * Edge-coverage audit for the KG graph backfill.
 *
 * For every notebook it reports graphVersion, node counts, edge count, and edges-per-strong-node.
 * A notebook stamped graphVersion=2 but with very few edges relative to its strong-node count is
 * a likely victim of the embedding-quota exhaustion (batches errored -> no edges -> still stamped).
 * These are the ones that need a targeted --force re-run.
 */
async function main() {
  const db = firebaseApp.firestore();
  const nbSnap = await db.collection('notebooks').get();

  type Row = { id: string; gv: number; strong: number; edges: number; ratio: number };
  const rows: Row[] = [];

  for (const doc of nbSnap.docs) {
    const id = doc.id;
    const gv = Number((doc.data() as any).graphVersion || 0);
    try {
      const [strongSnap, edgeSnap] = await Promise.all([
        db.collection('notebooks').doc(id).collection('kg_nodes').where('importance', '>=', 0.5).count().get(),
        db.collection('notebooks').doc(id).collection('kg_edges').count().get(),
      ]);
      const strong = strongSnap.data().count;
      const edges = edgeSnap.data().count;
      const ratio = strong > 0 ? edges / strong : 0;
      rows.push({ id, gv, strong, edges, ratio });
    } catch (e: any) {
      console.log(`${id}: error ${e?.message || e}`);
    }
  }

  rows.sort((a, b) => a.ratio - b.ratio);

  console.log('\n===== EDGE COVERAGE (sorted by edges-per-strong-node, lowest first) =====');
  console.log('  ratio  gv  strongNodes  edges   notebook');
  for (const r of rows) {
    const flag = r.gv >= 2 && r.strong >= 40 && r.ratio < 0.5 ? '  <-- LIKELY INCOMPLETE' : '';
    console.log(
      `  ${r.ratio.toFixed(2).padStart(5)}  ${String(r.gv).padStart(2)}  ${String(r.strong).padStart(11)}  ${String(r.edges).padStart(6)}   ${r.id}${flag}`,
    );
  }

  const suspects = rows.filter(r => r.gv >= 2 && r.strong >= 40 && r.ratio < 0.5);
  console.log(`\n===== SUSPECTS (graphVersion=2 but edges/strongNode < 0.5) =====`);
  if (suspects.length === 0) console.log('  NONE — all backfilled notebooks have healthy edge coverage.');
  else suspects.forEach(s => console.log(`  ${s.id} (strong=${s.strong}, edges=${s.edges}) -> re-run with --force`));

  process.exit(0);
}
main().catch(e => { console.error(e); process.exit(1); });
