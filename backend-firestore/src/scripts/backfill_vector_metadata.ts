/**
 * Phase A (Part 13) — Backfill normalized metadata onto EXISTING Pinecone vectors.
 *
 * Adds the required scoping/version fields (userId, notebookId, sourceId, chapterId, subject,
 * class, board, language, embeddingVersion, chunkVersion, metadataVersion) to vectors that were
 * indexed before normalization existed. It performs metadata-only updates:
 *   - does NOT regenerate embeddings,
 *   - does NOT change vector values,
 *   - does NOT create or delete vectors.
 * Idempotent: sources already at the current metadataVersion are skipped.
 *
 * Usage (from backend-firestore/):
 *   npx tsx src/scripts/backfill_vector_metadata.ts --all --dry-run
 *   npx tsx src/scripts/backfill_vector_metadata.ts --all
 *   npx tsx src/scripts/backfill_vector_metadata.ts --notebook ncert-c11-physics --verbose
 *
 * Flags: --all | --notebook <id> [--source <id>] | --dry-run | --verbose | --limit <n>
 * Gated by ENABLE_VECTOR_METADATA_BACKFILL (unless --dry-run).
 */
import { db } from '../config/firebase';
import { env } from '../config/env';
import { DocumentSource, Notebook, isReadyStatus } from '../types';
import { sourceRepository } from '../repositories/source.repository';
import { pineconeService } from '../services/rag/pinecone.service';
import { resolveNotebookContext, normalizedMetadataPatch } from '../services/vectorMetadata';
import { featureFlags, METADATA_VERSION } from '../config/featureFlags';

const arg = (name: string): string | undefined => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
};
const hasFlag = (name: string) => process.argv.includes(`--${name}`);

async function collectSources(): Promise<DocumentSource[]> {
  const notebookId = arg('notebook');
  const sourceId = arg('source');
  const limit = parseInt(arg('limit') || '0', 10) || 0;
  if (notebookId && sourceId) {
    const s = await sourceRepository.getSource(notebookId, sourceId);
    return s ? [s] : [];
  }
  if (notebookId) {
    const all = await sourceRepository.getSourcesByNotebook(notebookId);
    return limit ? all.slice(0, limit) : all;
  }
  const snap = await db.collectionGroup('sources').get();
  const all = snap.docs.map(d => d.data() as DocumentSource);
  return limit ? all.slice(0, limit) : all;
}

const notebookCache = new Map<string, Notebook | null>();
async function getNotebook(id: string): Promise<Notebook | null> {
  if (notebookCache.has(id)) return notebookCache.get(id)!;
  const doc = await db.collection('notebooks').doc(id).get();
  const nb = doc.exists ? (doc.data() as Notebook) : null;
  notebookCache.set(id, nb);
  return nb;
}

async function main() {
  const dryRun = hasFlag('dry-run');
  const verbose = hasFlag('verbose');
  const start = Date.now();

  if (!hasFlag('all') && !arg('notebook')) {
    console.error('Specify a scope: --all OR --notebook <id> [--source <id>].');
    process.exit(1);
  }
  if (!dryRun && !featureFlags.vectorMetadataBackfill) {
    console.error('ENABLE_VECTOR_METADATA_BACKFILL is off. Set it to true, or run with --dry-run.');
    process.exit(1);
  }

  const ns = env.PINECONE_NAMESPACE;
  const sources = await collectSources();
  console.log(`Vector metadata backfill — ${sources.length} source(s). mode=${dryRun ? 'DRY-RUN' : 'APPLY'} ns=${ns || '(default)'}`);

  const report = { sources: 0, skipped: 0, vectorsUpdated: 0, failed: 0 };

  for (const source of sources) {
    if (!isReadyStatus(source.status)) { report.skipped++; continue; }
    // Idempotent: skip sources already normalized to the current metadata version.
    if ((source.metadataVersion || 0) >= METADATA_VERSION && !hasFlag('force')) { report.skipped++; continue; }

    const expected = source.chunksExtracted || 0;
    if (expected <= 0) { report.skipped++; continue; }

    try {
      const nb = await getNotebook(source.notebookId);
      const ctx = resolveNotebookContext(nb, source);
      const patch = normalizedMetadataPatch(source, ctx);

      if (dryRun) {
        report.sources++;
        report.vectorsUpdated += expected;
        if (verbose) console.log(`  [dry] ${source.notebookId}/${source.id} would patch ${expected} vectors -> ${JSON.stringify(ctx)}`);
        continue;
      }

      for (let i = 0; i < expected; i++) {
        await pineconeService.updateVectorMetadata(`${source.id}_chunk_${i}`, patch, ns);
        report.vectorsUpdated++;
      }
      await sourceRepository.updateSource(source.notebookId, source.id, { metadataVersion: METADATA_VERSION });
      report.sources++;
      if (verbose) console.log(`  [ok] ${source.notebookId}/${source.id} patched ${expected} vectors`);
    } catch (e: any) {
      report.failed++;
      console.warn(`  [error] ${source.notebookId}/${source.id}: ${String(e?.message || e).slice(0, 160)}`);
    }
  }

  console.log(
    `\n=== DONE: sources=${report.sources}, vectorsUpdated=${report.vectorsUpdated}, ` +
    `skipped=${report.skipped}, failed=${report.failed}, elapsed=${((Date.now() - start) / 1000).toFixed(1)}s ` +
    `${dryRun ? '(dry-run: no writes)' : ''} ===`
  );
  process.exit(0);
}

main().catch((e) => { console.error('backfill_vector_metadata error:', e); process.exit(1); });
