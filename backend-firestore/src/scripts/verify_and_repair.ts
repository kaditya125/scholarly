/**
 * Phase A — Verify & Repair already-ingested curriculum sources.
 *
 * Scans sources, runs the integrity verification (Storage PDF, Pinecone vectors, knowledge
 * graph, assets, metadata), optionally repairs missing artifacts in place (no re-download /
 * no re-embed unless ENABLE_VECTOR_REPAIR), and persists the result + resolved status
 * (READY / READY_DEGRADED). Idempotent and resumable.
 *
 * Usage (from backend-firestore/):
 *   npx tsx src/scripts/verify_and_repair.ts --all --dry-run
 *   npx tsx src/scripts/verify_and_repair.ts --all --repair
 *   npx tsx src/scripts/verify_and_repair.ts --notebook ncert-c11-physics --repair --verbose
 *   npx tsx src/scripts/verify_and_repair.ts --notebook ncert-c11-physics --source <sourceId> --repair
 *
 * Flags: --all | --notebook <id> [--source <id>] | --dry-run | --repair | --verbose | --limit <n>
 */
import { db } from '../config/firebase';
import { DocumentSource, isReadyStatus } from '../types';
import { sourceRepository } from '../repositories/source.repository';
import { verificationService } from '../services/verification.service';

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
  // --all
  const snap = await db.collectionGroup('sources').get();
  const all = snap.docs.map(d => d.data() as DocumentSource);
  return limit ? all.slice(0, limit) : all;
}

async function main() {
  const dryRun = hasFlag('dry-run');
  const repair = hasFlag('repair') && !dryRun;
  const verbose = hasFlag('verbose');
  const start = Date.now();

  if (!hasFlag('all') && !arg('notebook')) {
    console.error('Specify a scope: --all OR --notebook <id> [--source <id>].');
    process.exit(1);
  }

  const sources = await collectSources();
  console.log(`Verify & Repair — ${sources.length} source(s). mode=${dryRun ? 'DRY-RUN' : repair ? 'REPAIR' : 'VERIFY-ONLY'}`);

  const report = { verified: 0, repaired: 0, skipped: 0, stillDegraded: 0, failed: 0 };

  for (const source of sources) {
    // Only verify sources that finished ingestion. In-flight and FAILED sources are out of scope
    // (FAILED should be re-ingested, not repaired).
    if (!isReadyStatus(source.status)) { report.skipped++; continue; }
    try {
      const result = await verificationService.verifySource(source, { repair });
      if (!dryRun) await verificationService.persistResult(source, result);

      if (result.repairedArtifacts.length) report.repaired++;
      if (result.passed) report.verified++;
      else report.stillDegraded++;

      if (verbose || !result.passed || result.repairedArtifacts.length) {
        console.log(
          `  [${result.status}] ${source.notebookId}/${source.id} "${source.title}"` +
          (result.missingArtifacts.length ? ` missing=[${result.missingArtifacts.join(',')}]` : '') +
          (result.repairedArtifacts.length ? ` repaired=[${result.repairedArtifacts.join(',')}]` : '')
        );
      }
    } catch (e: any) {
      report.failed++;
      console.warn(`  [error] ${source.notebookId}/${source.id}: ${String(e?.message || e).slice(0, 160)}`);
    }
  }

  console.log(
    `\n=== DONE: verified=${report.verified}, repaired=${report.repaired}, ` +
    `stillDegraded=${report.stillDegraded}, skipped=${report.skipped}, failed=${report.failed}, ` +
    `elapsed=${((Date.now() - start) / 1000).toFixed(1)}s ${dryRun ? '(dry-run: no writes)' : ''} ===`
  );
  process.exit(0);
}

main().catch((e) => { console.error('verify_and_repair error:', e); process.exit(1); });
