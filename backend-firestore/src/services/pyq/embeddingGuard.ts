import * as fs from 'fs';
import * as path from 'path';

/**
 * Production-safe port of the advisory lock check from `scripts/phase4a/_embedding-guard.js`.
 *
 * That script file lives outside `src/` (it's shared by ~60 offline indexer/audit scripts run
 * via tsx) and is NOT part of the TypeScript build, so it's a loose file that has to survive
 * Azure's Oryx zip-deploy as-is. It has been observed landing stale/missing after a deploy even
 * when the zip and `dist/` (which IS tsc-built) were both correct — Oryx's handling of directories
 * outside `src/` has proven unreliable in this repo, twice now, in different ways. `dist/` builds
 * have not shown this problem.
 *
 * pyqVectorIngestion.service.ts and pyqCorpusIngestion.service.ts only ever needed
 * `requireNoIndexer`/`readLock` — pure fs/path lock-file checks with no dependency on env or
 * Pinecone — so porting just those two functions into `src/` removes the fragile dependency
 * entirely rather than trying to make Oryx propagate the loose file correctly.
 *
 * The lock file path is kept IDENTICAL to the original (`scripts/phase4a/.indexer.lock`,
 * resolved relative to the repo root) so this stays interoperable: an offline indexer script
 * (using the original file's `acquireIndexerLock`) and the production API (using this file's
 * `requireNoIndexer`) are coordinating over the same physical lock.
 */

interface IndexerLock {
  pid: number;
  label: string;
  startedAt: number;
}

// dist/services/pyq/embeddingGuard.js and src/services/pyq/embeddingGuard.ts are both 3 levels
// below the repo root, matching the original file's own dist/src depth-parity pattern.
const LOCK = path.join(__dirname, '../../../scripts/phase4a/.indexer.lock');

// Backstop only — liveness is decided by whether the recorded PID still exists, not elapsed time.
// See scripts/phase4a/_embedding-guard.js for the full rationale (indexer runs legitimately span
// hours; this only covers PID reuse after an unclean shutdown).
const LOCK_STALE_MS = 12 * 60 * 60 * 1000;

function readLockRaw(): IndexerLock | null {
  try {
    return JSON.parse(fs.readFileSync(LOCK, 'utf8'));
  } catch {
    return null;
  }
}

/** The live lock, or null when absent, stale, or owned by a process that no longer exists. */
export function readLock(): IndexerLock | null {
  const l = readLockRaw();
  if (!l) return null;
  if (Date.now() - l.startedAt > LOCK_STALE_MS) return null;
  try {
    process.kill(l.pid, 0); // signal 0 only tests existence
  } catch {
    return null;
  }
  return l;
}

/**
 * Refuse to spend embedding quota while an indexer holds the lock.
 * Call this before ANY generateEmbedding in a caller that is not itself the indexer.
 */
export function requireNoIndexer(operation: string): void {
  const l = readLock();
  if (!l) return;
  throw new Error(
    `${operation} needs a real embedding, but "${l.label}" is indexing (pid ${l.pid}).\n` +
    `  Embedding quota is per-minute and shared, so this would compete with it.\n` +
    `  Wait for it to finish, or use a counting-only check that costs no quota.`
  );
}
