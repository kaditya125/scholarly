/**
 * Pinecone -> Qdrant migration. Resumable, idempotent, and hard-limited on egress.
 *
 * This copies vectors. It does not re-embed, normalise, truncate or reshape anything: the values
 * Pinecone returns are the values Qdrant stores, at 768 dimensions, with cosine distance to match
 * the source index (discovered via describeIndex, not assumed).
 *
 * Three properties matter more than speed here.
 *
 *   Resumable   The Starter plan allows ~1GB of egress a month and a full copy needs ~212MB of
 *               it. A run that dies at 70% and cannot resume has spent that budget for nothing,
 *               so the checkpoint is written after every confirmed batch and re-reading it is
 *               the normal way to continue.
 *
 *   Idempotent  Point ids are UUIDv5 over `${namespace}:${pineconeId}`, so the same source
 *               vector always lands on the same Qdrant point. Re-running overwrites rather than
 *               duplicating, which is what makes resuming safe even if the checkpoint is stale.
 *
 *   Honest      A batch that fails is recorded, not skipped, and the checkpoint does not advance
 *               past it. A run with any failure reports NOT COMPLETE. Counting successful
 *               upserts is not evidence that the data arrived intact — that is what
 *               verify-migration.ts is for, and it is a separate step on purpose.
 *
 * Usage:
 *   npx tsx scripts/migrate-pinecone-to-qdrant.ts --dry-run
 *   npx tsx scripts/migrate-pinecone-to-qdrant.ts --limit 10
 *   npx tsx scripts/migrate-pinecone-to-qdrant.ts --limit 100
 *   npx tsx scripts/migrate-pinecone-to-qdrant.ts
 *   npx tsx scripts/migrate-pinecone-to-qdrant.ts --namespace production
 *   npx tsx scripts/migrate-pinecone-to-qdrant.ts --reset
 */
import * as fs from 'fs';
import * as path from 'path';
import { Pinecone } from '@pinecone-database/pinecone';
import { env } from '../src/config/env';
import { getSecret } from '../src/services/runtimeSecrets.service';
import { QdrantService, QDRANT_COLLECTION } from '../src/services/rag/qdrant.service';
import { toQdrantId, PINECONE_ID_KEY, PINECONE_NAMESPACE_KEY } from '../src/services/rag/qdrantFilter';

// ── arguments ───────────────────────────────────────────────────────────────────────────────
const argv = process.argv.slice(2);
const has = (f: string) => argv.includes(f);
const valueOf = (f: string): string | undefined => {
  const i = argv.indexOf(f);
  return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : undefined;
};

const DRY_RUN = has('--dry-run');
const RESET = has('--reset');
const LIMIT = Number(valueOf('--limit') || 0);
const ONLY_NAMESPACE = valueOf('--namespace');
const BATCH_SIZE = Math.max(1, Number(env.PINECONE_MIGRATION_BATCH_SIZE) || 100);
const MAX_BYTES = Number(env.PINECONE_MIGRATION_MAX_BYTES) || 700 * 1024 * 1024;
const CHECKPOINT_PATH = path.resolve(env.PINECONE_MIGRATION_CHECKPOINT);
const FAILURE_PATH = CHECKPOINT_PATH.replace(/\.json$/, '') + '.failures.jsonl';

// ── logging ─────────────────────────────────────────────────────────────────────────────────
type Stage = 'DISCOVERY' | 'ENUMERATION' | 'FETCH' | 'UPLOAD' | 'CHECKPOINT' | 'VERIFY' | 'ERROR' | 'COMPLETE' | 'LIMIT';
const log = (stage: Stage, msg: string) => console.log(`[${stage}] ${msg}`);

const mb = (bytes: number) => `${(bytes / 1048576).toFixed(1)} MB`;

// ── checkpoint ──────────────────────────────────────────────────────────────────────────────
interface NamespaceState {
  namespace: string;
  /** Pinecone's own pagination token. Never fabricated — undefined means "start from the top". */
  paginationToken?: string;
  discoveredCount: number;
  migratedCount: number;
  failedCount: number;
  done: boolean;
}

interface Checkpoint {
  index: string;
  collection: string;
  dimension: number;
  metric: string;
  namespaces: Record<string, NamespaceState>;
  bytesTransferred: number;
  readUnits: number;
  startedAt: string;
  updatedAt: string;
  /**
   * What the LAST write to this file knew.
   *
   * `running` is written before the first batch and left there for the duration, so a file still
   * saying `running` means the process died without reaching its own report — which is exactly
   * what an interrupted run looks like, and is worth saying rather than leaving to inference.
   *
   * The per-namespace `done` flags are the authoritative record of progress; this field is a
   * summary of how the run ENDED, and must never claim more than they do.
   */
  status: 'running' | 'stopped_at_limit' | 'partial' | 'complete' | 'complete_with_failures';
}

function loadCheckpoint(): Checkpoint | null {
  try {
    if (!fs.existsSync(CHECKPOINT_PATH)) return null;
    return JSON.parse(fs.readFileSync(CHECKPOINT_PATH, 'utf8'));
  } catch (e: any) {
    log('ERROR', `checkpoint at ${CHECKPOINT_PATH} is unreadable (${e?.message}); refusing to guess — move it aside or pass --reset`);
    process.exit(1);
  }
}

function saveCheckpoint(cp: Checkpoint) {
  cp.updatedAt = new Date().toISOString();
  fs.mkdirSync(path.dirname(CHECKPOINT_PATH), { recursive: true });
  // Write-then-rename so an interrupted write cannot leave a half-parsed checkpoint behind.
  const tmp = `${CHECKPOINT_PATH}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(cp, null, 2), 'utf8');
  fs.renameSync(tmp, CHECKPOINT_PATH);
}

function recordFailure(entry: Record<string, any>) {
  fs.mkdirSync(path.dirname(FAILURE_PATH), { recursive: true });
  fs.appendFileSync(FAILURE_PATH, JSON.stringify({ ...entry, at: new Date().toISOString() }) + '\n', 'utf8');
}

// ── retry ───────────────────────────────────────────────────────────────────────────────────
/** Egress exhaustion is not transient — retrying it burns nothing but time and muddies the log. */
function isEgressExhausted(e: any): boolean {
  return /egress limit/i.test(String(e?.message || e));
}

async function withRetry<T>(label: string, fn: () => Promise<T>, retries = 5): Promise<T> {
  let lastError: any;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (e: any) {
      lastError = e;
      if (isEgressExhausted(e)) throw e;
      if (attempt === retries) break;
      const delay = Math.min(30_000, 500 * 2 ** attempt) + Math.floor(Math.random() * 250);
      log('ERROR', `${label} failed (attempt ${attempt + 1}/${retries + 1}): ${String(e?.message || e).slice(0, 140)} — retrying in ${delay}ms`);
      await new Promise((r) => setTimeout(r, delay));
    }
  }
  throw lastError;
}

// ── main ────────────────────────────────────────────────────────────────────────────────────
async function run() {
  const apiKey = getSecret('PINECONE_API_KEY') || env.PINECONE_API_KEY;
  if (!apiKey) throw new Error('PINECONE_API_KEY is not configured');

  const pc = new Pinecone({ apiKey });
  const qdrant = new QdrantService();

  console.log('='.repeat(78));
  console.log(`Pinecone -> Qdrant migration${DRY_RUN ? '   [DRY RUN — nothing will be written]' : ''}`);
  console.log('='.repeat(78));

  // ── discovery ─────────────────────────────────────────────────────────────────────────────
  const desc: any = await pc.describeIndex(env.PINECONE_INDEX_NAME);
  const dimension: number = desc?.dimension;
  const metric: string = desc?.metric;
  log('DISCOVERY', `index=${desc?.name} dimension=${dimension} metric=${metric} type=${desc?.vectorType}`);

  if (dimension !== 768) throw new Error(`unexpected dimension ${dimension}; this migration is written for 768`);
  if (metric !== 'cosine') {
    throw new Error(
      `index metric is "${metric}" but the Qdrant collection is created as Cosine. ` +
      `Fix QDRANT_DISTANCE in qdrant.service.ts before migrating — a mismatch changes ranking silently.`
    );
  }

  const index = pc.index(env.PINECONE_INDEX_NAME);
  const stats: any = await index.describeIndexStats();
  const discovered = Object.entries(stats?.namespaces ?? {}).map(([name, ns]: [string, any]) => ({
    name: name || '',
    count: ns?.recordCount ?? 0,
  }));

  log('DISCOVERY', `namespaces found: ${discovered.map((n) => `${n.name || '(default)'}=${n.count}`).join(', ')}`);
  log('DISCOVERY', `total vectors: ${discovered.reduce((s, n) => s + n.count, 0)}`);

  if (discovered.length === 0) throw new Error('no namespaces discovered — refusing to proceed');

  const targets = ONLY_NAMESPACE ? discovered.filter((n) => n.name === ONLY_NAMESPACE) : discovered;
  if (ONLY_NAMESPACE && targets.length === 0) {
    throw new Error(`--namespace ${ONLY_NAMESPACE} not found. Discovered: ${discovered.map((d) => d.name).join(', ')}`);
  }

  // ── checkpoint ────────────────────────────────────────────────────────────────────────────
  if (RESET && fs.existsSync(CHECKPOINT_PATH)) {
    fs.unlinkSync(CHECKPOINT_PATH);
    log('CHECKPOINT', 'existing checkpoint removed (--reset)');
  }

  let cp = loadCheckpoint();
  if (cp && cp.index !== env.PINECONE_INDEX_NAME) {
    throw new Error(`checkpoint is for index "${cp.index}" but configured index is "${env.PINECONE_INDEX_NAME}" — refusing to mix them`);
  }
  if (!cp) {
    cp = {
      index: env.PINECONE_INDEX_NAME,
      collection: QDRANT_COLLECTION,
      dimension,
      metric,
      namespaces: {},
      bytesTransferred: 0,
      readUnits: 0,
      startedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      status: 'running',
    };
  }
  for (const t of targets) {
    if (!cp.namespaces[t.name]) {
      cp.namespaces[t.name] = { namespace: t.name, discoveredCount: t.count, migratedCount: 0, failedCount: 0, done: false };
    } else {
      cp.namespaces[t.name].discoveredCount = t.count; // refresh, the source may have grown
    }
  }

  const resuming = Object.values(cp.namespaces).some((n) => n.migratedCount > 0);
  if (resuming) {
    // A checkpoint still reading `running` was written by a process that never reached its own
    // report — it was killed, crashed, or the box went down. Say so, because the alternative is
    // the operator inferring it from a timestamp.
    if (cp.status === 'running') {
      log('CHECKPOINT', `the previous run did not finish (status was left at "running", last write ${cp.updatedAt}) — resuming from where it stopped`);
    }
    log('CHECKPOINT', `resuming — ${Object.values(cp.namespaces).map((n) => `${n.namespace}: ${n.migratedCount}/${n.discoveredCount}`).join(', ')}`);
    log('CHECKPOINT', `egress already spent by previous runs: ${mb(cp.bytesTransferred)}`);
  }

  // ── dry run stops here ────────────────────────────────────────────────────────────────────
  if (DRY_RUN) {
    const remaining = targets.reduce((s, t) => s + Math.max(0, t.count - (cp!.namespaces[t.name]?.migratedCount ?? 0)), 0);
    const estimate = remaining * (dimension * 4 + 1500);
    console.log('\n--- dry run ---');
    console.log(`  Target collection    : ${QDRANT_COLLECTION} (768d, Cosine)`);
    console.log(`  Qdrant URL           : ${env.QDRANT_URL}`);
    const health = await qdrant.health();
    console.log(`  Qdrant server        : ${health.serverReachable ? 'reachable' : `UNREACHABLE — ${health.detail}`}`);
    console.log(`  Qdrant collection    : ${health.collectionExists ? `exists, ${health.points} points` : 'not created yet (the migration creates it)'}`);
    console.log(`  vectors to migrate   : ${remaining}`);
    console.log(`  estimated egress     : ${mb(estimate)}`);
    console.log(`  configured ceiling   : ${mb(MAX_BYTES)}`);
    console.log(`  batch size           : ${BATCH_SIZE}`);
    console.log(`  checkpoint           : ${CHECKPOINT_PATH}`);
    console.log('\nNothing was written. Re-run without --dry-run to migrate.');
    return;
  }

  // Claim the file as in-progress BEFORE any batch. Without this every intermediate save carries
  // whatever terminal status the previous run left behind — a resumed run would sit at
  // "complete" for its entire duration while thousands of vectors were still outstanding.
  cp.status = 'running';
  saveCheckpoint(cp);

  // ── prepare the destination ───────────────────────────────────────────────────────────────
  const { created } = await qdrant.ensureCollection();
  log('UPLOAD', `collection ${QDRANT_COLLECTION} ${created ? 'created' : 'already present'} (768d, Cosine, payload indexes ensured)`);

  let stoppedAtLimit = false;
  let totalMigrated = 0;
  let totalFailed = 0;

  for (const target of targets) {
    const state = cp.namespaces[target.name];
    if (state.done) { log('ENUMERATION', `${target.name}: already complete, skipping`); continue; }

    log('ENUMERATION', `${target.name}: ${target.count} vectors reported by Pinecone`);
    const ns = index.namespace(target.name);

    for (;;) {
      if (cp.bytesTransferred >= MAX_BYTES) { stoppedAtLimit = true; break; }
      if (LIMIT && state.migratedCount >= LIMIT) { log('LIMIT', `${target.name}: reached --limit ${LIMIT}`); break; }

      // 1. enumerate a page of ids (ids only — cheap)
      const page: any = await withRetry(`list(${target.name})`, () =>
        ns.listPaginated({ limit: BATCH_SIZE, paginationToken: state.paginationToken })
      );

      const ids: string[] = (page?.vectors ?? []).map((v: any) => v.id).filter(Boolean);
      const nextToken: string | undefined = page?.pagination?.next;

      if (ids.length === 0) {
        state.done = !nextToken;
        state.paginationToken = nextToken;
        saveCheckpoint(cp);
        if (!nextToken) { log('ENUMERATION', `${target.name}: enumeration complete`); break; }
        continue;
      }

      const wanted = LIMIT ? ids.slice(0, Math.max(0, LIMIT - state.migratedCount)) : ids;
      if (wanted.length === 0) { log('LIMIT', `${target.name}: reached --limit ${LIMIT}`); break; }

      // 2. fetch the vectors (this is what costs egress)
      log('FETCH', `${target.name}: fetching ${wanted.length} vectors (migrated so far ${state.migratedCount}/${state.discoveredCount})`);
      let records: Record<string, any>;
      let usedBytes = 0;
      try {
        const res: any = await withRetry(`fetch(${target.name})`, () => ns.fetch({ ids: wanted }));
        records = res?.records ?? {};
        usedBytes = Buffer.byteLength(JSON.stringify(records), 'utf8');
        cp.bytesTransferred += usedBytes;
        cp.readUnits += res?.usage?.readUnits ?? 0;
      } catch (e: any) {
        if (isEgressExhausted(e)) {
          log('LIMIT', 'Pinecone refused the read: monthly egress exhausted');
          stoppedAtLimit = true;
          break;
        }
        recordFailure({ namespace: target.name, operation: 'fetch', ids: wanted, error: String(e?.message || e) });
        state.failedCount += wanted.length;
        totalFailed += wanted.length;
        // Do NOT advance the token past ids we never read.
        saveCheckpoint(cp);
        throw new Error(`[FETCH] ${target.name}: unrecoverable fetch failure, checkpoint left at the failing page`);
      }

      // 3. convert — values copied through untouched
      const points: any[] = [];
      for (const id of wanted) {
        const rec = records[id];
        if (!rec) {
          recordFailure({ namespace: target.name, operation: 'fetch-missing', id, error: 'id enumerated but absent from fetch response' });
          state.failedCount++; totalFailed++;
          continue;
        }
        const values: number[] = rec.values ?? [];
        if (values.length !== dimension) {
          recordFailure({ namespace: target.name, operation: 'dimension', id, error: `expected ${dimension} got ${values.length}` });
          state.failedCount++; totalFailed++;
          continue;
        }
        points.push({
          id: toQdrantId(target.name, id),
          vector: values,
          payload: {
            ...(rec.metadata ?? {}),
            [PINECONE_ID_KEY]: id,
            [PINECONE_NAMESPACE_KEY]: target.name,
          },
        });
      }

      // 4. upload, and only then advance the checkpoint
      if (points.length) {
        try {
          await withRetry(`upsert(${target.name})`, async () => {
            const client = (qdrant as any).client();
            await client.upsert(QDRANT_COLLECTION, { wait: true, points });
          });
          log('UPLOAD', `${target.name}: uploaded ${points.length} vectors (+${mb(usedBytes)} egress, ${mb(cp.bytesTransferred)} total)`);
        } catch (e: any) {
          recordFailure({ namespace: target.name, operation: 'upsert', ids: points.map((p) => p.payload[PINECONE_ID_KEY]), error: String(e?.message || e) });
          state.failedCount += points.length;
          totalFailed += points.length;
          saveCheckpoint(cp); // token NOT advanced — this page will be retried on resume
          throw new Error(`[UPLOAD] ${target.name}: Qdrant upsert failed, checkpoint left at the failing page`);
        }
      }

      state.migratedCount += points.length;
      totalMigrated += points.length;
      state.paginationToken = nextToken;
      state.done = !nextToken;
      saveCheckpoint(cp);
      log('CHECKPOINT', `${target.name}: ${state.migratedCount}/${state.discoveredCount} saved`);

      if (!nextToken) { log('ENUMERATION', `${target.name}: enumeration complete`); break; }
    }

    if (stoppedAtLimit) break;
  }

  // ── report ────────────────────────────────────────────────────────────────────────────────
  // `complete` is reserved for the one case that actually earns it: every namespace enumerated
  // to exhaustion, every discovered vector accounted for, no failures, and no --limit truncating
  // the run. Anything short of that is `partial`, so the field can never claim more than the
  // per-namespace `done` flags support.
  const everyNamespaceFinished = Object.values(cp.namespaces)
    .every((n) => n.done && n.migratedCount >= n.discoveredCount);

  cp.status =
    stoppedAtLimit ? 'stopped_at_limit'
    : totalFailed > 0 ? 'complete_with_failures'
    : everyNamespaceFinished && !LIMIT ? 'complete'
    : 'partial';
  saveCheckpoint(cp);

  console.log('\n' + '='.repeat(78));
  console.log('Migration progress');
  console.log('-'.repeat(78));
  for (const st of Object.values(cp.namespaces)) {
    console.log(`Namespace: ${st.namespace}`);
    console.log(`  Vectors discovered : ${st.discoveredCount}`);
    console.log(`  Vectors migrated   : ${st.migratedCount}`);
    console.log(`  Vectors remaining  : ${Math.max(0, st.discoveredCount - st.migratedCount)}`);
    console.log(`  Failed             : ${st.failedCount}`);
  }
  console.log(`\nEstimated Pinecone egress used: ${mb(cp.bytesTransferred)}`);
  console.log(`Pinecone read units consumed  : ${cp.readUnits}`);
  console.log(`Configured safety limit       : ${mb(MAX_BYTES)}`);
  console.log(`Checkpoint                    : ${CHECKPOINT_PATH}`);
  if (totalFailed > 0) console.log(`Failure log                   : ${FAILURE_PATH}`);

  if (stoppedAtLimit) {
    log('LIMIT', 'Checkpoint saved. Migration stopped safely. Re-run to continue from here.');
    console.log('\nSTATUS: STOPPED AT LIMIT — NOT COMPLETE');
  } else if (totalFailed > 0) {
    log('ERROR', `${totalFailed} vectors failed and are listed in the failure log.`);
    console.log('\nSTATUS: NOT COMPLETE — failures recorded');
  } else {
    // Same condition that set cp.status above — computed once so the printed verdict and the
    // stored field can never disagree.
    if (everyNamespaceFinished && !LIMIT) {
      log('COMPLETE', 'All namespaces migrated. Run verify-migration.ts before trusting this.');
      console.log('\nSTATUS: COPIED — verification still required');
    } else {
      console.log(`\nSTATUS: PARTIAL${LIMIT ? ` (--limit ${LIMIT})` : ''} — re-run to continue`);
    }
  }
}

run().then(() => process.exit(0)).catch((e) => {
  log('ERROR', String(e?.message || e));
  console.log('\nSTATUS: FAILED — checkpoint preserved, re-run to resume');
  process.exit(1);
});
