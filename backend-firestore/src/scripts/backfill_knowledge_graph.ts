/**
 * Knowledge-Graph Backfill
 * ------------------------
 * Upgrades the knowledge graph of ALREADY-ingested (READY) documents using the improved
 * full-document concept extraction + relationship linking — WITHOUT re-downloading or
 * re-embedding anything. Each document's text is reconstructed from its existing Pinecone
 * chunks, then re-run through sourceService.rebuildGraphFromText (the same code path ingestion
 * now uses).
 *
 * Idempotent + resumable: each processed source is stamped with `graphBackfilledAt` and skipped
 * on subsequent runs unless --force is given.
 *
 * Usage:
 *   npx tsx src/scripts/backfill_knowledge_graph.ts                      # owner = ncert-curriculum (default)
 *   npx tsx src/scripts/backfill_knowledge_graph.ts --owner=admin-user   # a specific owner
 *   npx tsx src/scripts/backfill_knowledge_graph.ts --all                # every notebook
 *   npx tsx src/scripts/backfill_knowledge_graph.ts --notebook=ncert-c9-physics
 *   npx tsx src/scripts/backfill_knowledge_graph.ts --limit=5            # cap number of sources
 *   npx tsx src/scripts/backfill_knowledge_graph.ts --force              # redo already-backfilled
 *
 * NOTE: each source triggers up to ~15 Gemini extraction calls + 1 linking call, so a full run
 * over the whole curriculum is slow and costs paid-tier spend. It is safe to stop and resume.
 */
import { db } from '../config/firebase';
import { env } from '../config/env';
import { pineconeService } from '../services/rag/pinecone.service';
import { sourceService } from '../services/source.service';

function parseArgs() {
  const args = process.argv.slice(2);
  const val = (k: string): string | undefined => {
    const a = args.find((x) => x.startsWith(`--${k}=`));
    return a ? a.split('=').slice(1).join('=') : undefined;
  };
  const limitRaw = val('limit');
  return {
    all: args.includes('--all'),
    force: args.includes('--force'),
    reset: args.includes('--reset'),
    notebook: val('notebook'),
    owner: val('owner') || 'ncert-curriculum',
    limit: limitRaw ? parseInt(limitRaw, 10) : undefined,
  };
}

/** Reconstruct a document's text from its already-indexed chunk vectors (no re-download). */
async function reconstructText(source: any): Promise<string> {
  const chunkCount: number = source.chunksExtracted || 0;
  if (chunkCount <= 0) return '';

  const ids: string[] = [];
  for (let i = 0; i < chunkCount; i++) ids.push(`${source.id}_chunk_${i}`);

  const collected: { idx: number; text: string }[] = [];
  const BATCH = 100;
  for (let i = 0; i < ids.length; i += BATCH) {
    const recs = await pineconeService.fetchVectors(ids.slice(i, i + BATCH), env.PINECONE_NAMESPACE);
    for (const rec of Object.values(recs)) {
      const md: any = (rec as any)?.metadata || {};
      const text = typeof md.text === 'string' ? md.text : '';
      if (!text) continue;
      const idx = typeof md.chunkIndex === 'number' ? md.chunkIndex : collected.length;
      collected.push({ idx, text });
    }
  }
  collected.sort((a, b) => a.idx - b.idx);
  return collected.map((c) => c.text).join('\n');
}

async function listNotebookIds(opts: ReturnType<typeof parseArgs>): Promise<string[]> {
  if (opts.notebook) return [opts.notebook];
  let q: FirebaseFirestore.Query = db.collection('notebooks');
  if (!opts.all) q = q.where('owner', '==', opts.owner);
  const snap = await q.get();
  return snap.docs.map((d) => d.id);
}

async function main() {
  const opts = parseArgs();
  console.log(
    `=== KG BACKFILL === scope=${opts.all ? 'ALL owners' : `owner=${opts.owner}`} notebook=${opts.notebook || 'ALL'} force=${opts.force} limit=${opts.limit ?? 'none'}`
  );

  const notebookIds = await listNotebookIds(opts);

  // --reset: clear the graphBackfilledAt marker for in-scope sources so a subsequent plain run
  // reprocesses them (e.g. after a run aborted mid-way due to exhausted quota/credits).
  if (opts.reset) {
    let cleared = 0;
    for (const notebookId of notebookIds) {
      const srcSnap = await db.collection('notebooks').doc(notebookId).collection('sources').get();
      for (const doc of srcSnap.docs) {
        if ((doc.data() as any).graphBackfilledAt) {
          await doc.ref.update({ graphBackfilledAt: null });
          cleared++;
        }
      }
    }
    console.log(`[reset] cleared graphBackfilledAt on ${cleared} source(s). Re-run without --reset to backfill.`);
    process.exit(0);
  }

  let processed = 0;
  let skipped = 0;
  let failed = 0;
  let consecutiveZero = 0;
  const summary: any[] = [];

  for (const notebookId of notebookIds) {
    if (opts.limit && processed >= opts.limit) break;

    const nbRef = db.collection('notebooks').doc(notebookId);
    const srcSnap = await nbRef.collection('sources').where('status', '==', 'READY').get();
    if (srcSnap.empty) continue;

    const kgBefore = (await nbRef.collection('kg_nodes').get()).size;
    const edgesBefore = (await nbRef.collection('kg_edges').get()).size;
    let nbProcessed = 0;

    for (const doc of srcSnap.docs) {
      if (opts.limit && processed >= opts.limit) break;
      const source: any = { id: doc.id, ...(doc.data() as any) };

      if (!opts.force && source.graphBackfilledAt) {
        skipped++;
        continue;
      }

      try {
        const text = await reconstructText(source);
        if (!text || text.length < 100) {
          console.log(`  [skip] ${notebookId} / ${source.title}: no reconstructable text (chunks=${source.chunksExtracted || 0})`);
          failed++;
          continue;
        }
        const concepts = await sourceService.rebuildGraphFromText(source, text);
        if (concepts > 0) {
          // Only mark done when the graph was actually (re)built, so a source that failed
          // (e.g. transient error) is retried on the next plain run instead of being skipped.
          await nbRef.collection('sources').doc(source.id).update({ graphBackfilledAt: Date.now() });
          processed++;
          nbProcessed++;
          consecutiveZero = 0;
          console.log(`  [ok] ${notebookId} / ${source.title}: textLen=${text.length} concepts=${concepts}`);
        } else {
          failed++;
          consecutiveZero++;
          console.warn(`  [warn] ${notebookId} / ${source.title}: 0 concepts extracted (NOT marked done)`);
          if (consecutiveZero >= 3) {
            console.error(`\n[ABORT] ${consecutiveZero} consecutive sources produced 0 concepts — likely Gemini quota/credits exhausted or a systemic failure. Stopping so nothing is mis-marked. Restore quota, then re-run (idempotent + resumable). processed=${processed} failed=${failed}`);
            process.exit(1);
          }
        }
      } catch (e: any) {
        failed++;
        console.error(`  [FAIL] ${notebookId} / ${source.title}: ${e?.message || e}`);
      }
    }

    if (nbProcessed > 0) {
      const kgAfter = (await nbRef.collection('kg_nodes').get()).size;
      const edgesAfter = (await nbRef.collection('kg_edges').get()).size;
      console.log(`[${notebookId}] sources=${nbProcessed}  nodes ${kgBefore} -> ${kgAfter}  edges ${edgesBefore} -> ${edgesAfter}`);
      summary.push({ notebookId, sources: nbProcessed, nodes: `${kgBefore}->${kgAfter}`, edges: `${edgesBefore}->${edgesAfter}` });
    }
  }

  console.log(`\n=== BACKFILL DONE === processed=${processed} skipped=${skipped} failed=${failed}`);
  if (summary.length > 0) console.table(summary);
  process.exit(0);
}

main().catch((e) => {
  console.error('backfill error:', e);
  process.exit(1);
});
