/**
 * Phase B (Part 9) — Backfill the 2-layer knowledge graph for ALREADY-ingested notebooks.
 *
 * For each notebook it re-links concepts using the two-layer linker (embedding-similarity
 * RELATED_TO edges + LLM directional/typed labels). It:
 *   - embeds concept nodes once (cached in kg_node_embeddings; re-runs reuse the cache),
 *   - does NOT re-download PDFs, does NOT re-embed chunk vectors, does NOT delete data,
 *   - processes nodes in batches so the LLM catalog stays small,
 *   - is idempotent: notebooks already at the current graphVersion are skipped (use --force).
 *
 * Usage (from backend-firestore/):
 *   npx tsx src/scripts/backfill_graph_edges.ts --all --dry-run
 *   npx tsx src/scripts/backfill_graph_edges.ts --all --verbose
 *   npx tsx src/scripts/backfill_graph_edges.ts --notebook ncert-c11-physics --force
 *
 * Flags: --all | --notebook <id> | --dry-run | --verbose | --limit <n> | --force
 */
import { db } from '../config/firebase';
import { notebookRepository } from '../repositories/notebook.repository';
import { sourceService } from '../services/source.service';
import { GRAPH_VERSION } from '../config/featureFlags';

const arg = (name: string): string | undefined => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
};
const hasFlag = (name: string) => process.argv.includes(`--${name}`);

async function notebookIds(): Promise<string[]> {
  const nb = arg('notebook');
  if (nb) return [nb];
  const snap = await db.collection('notebooks').get();
  return snap.docs.map(d => d.id);
}

async function main() {
  const dryRun = hasFlag('dry-run');
  const verbose = hasFlag('verbose');
  const force = hasFlag('force');
  const limit = parseInt(arg('limit') || '0', 10) || 0;
  const start = Date.now();

  if (!hasFlag('all') && !arg('notebook')) {
    console.error('Specify a scope: --all OR --notebook <id>.');
    process.exit(1);
  }

  let ids = await notebookIds();
  if (limit) ids = ids.slice(0, limit);
  console.log(`Graph backfill — ${ids.length} notebook(s). mode=${dryRun ? 'DRY-RUN' : 'APPLY'} graphVersion=${GRAPH_VERSION}`);

  const report = { notebooks: 0, batches: 0, skipped: 0, failed: 0 };
  const BATCH = 40;

  for (const id of ids) {
    try {
      const nb: any = await notebookRepository.getByIdAdmin(id);
      if (!nb) { report.skipped++; continue; }
      if ((nb.graphVersion || 0) >= GRAPH_VERSION && !force) { report.skipped++; continue; }

      const MIN_IMP = Number(process.env.KG_LINK_MIN_IMPORTANCE || '0.5');
      const allNodes = await notebookRepository.getKGNodes(id);
      // Link only meaningful concepts (skip low-importance keyword nodes) — matches the linker's
      // internal filter, and keeps the run far cheaper + the graph denser with real relationships.
      const nodes = allNodes.filter(n => (n.importance ?? 0) >= MIN_IMP);
      if (nodes.length < 2) { report.skipped++; continue; }

      if (dryRun) {
        report.notebooks++;
        if (verbose) console.log(`  [dry] ${id}: ${nodes.length}/${allNodes.length} nodes (importance>=${MIN_IMP}) -> ${Math.ceil(nodes.length / BATCH)} batch(es)`);
        continue;
      }

      const owner = nb.owner || nb.userId || 'system';
      // Load the node set + embedding cache ONCE per notebook and reuse across all batches.
      // Previously each batch re-read every kg_nodes + kg_node_embeddings doc, which multiplied
      // Firestore reads by the batch count. `allNodes` is already loaded above; the shared cache
      // is mutated in place by the linker as new nodes get embedded.
      const embeddingCache = await notebookRepository.getKGNodeEmbeddings(id);
      for (let i = 0; i < nodes.length; i += BATCH) {
        await sourceService.linkGraphConceptsTwoLayer(id, nodes.slice(i, i + BATCH), owner, { allNodes, embeddingCache });
        report.batches++;
      }
      await notebookRepository.updateAdmin(id, { graphVersion: GRAPH_VERSION } as any);
      report.notebooks++;
      if (verbose) console.log(`  [ok] ${id}: linked ${nodes.length} nodes`);
    } catch (e: any) {
      report.failed++;
      console.warn(`  [error] ${id}: ${String(e?.message || e).slice(0, 160)}`);
    }
  }

  console.log(
    `\n=== DONE: notebooks=${report.notebooks}, batches=${report.batches}, skipped=${report.skipped}, ` +
    `failed=${report.failed}, elapsed=${((Date.now() - start) / 1000).toFixed(1)}s ${dryRun ? '(dry-run: no writes)' : ''} ===`
  );
  process.exit(0);
}

main().catch((e) => { console.error('backfill_graph_edges error:', e); process.exit(1); });
