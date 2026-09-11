/**
 * Copy across whatever Qdrant is missing, without re-reading everything.
 *
 * The bulk migration enumerates once and walks that list. Pinecone is a live index, so anything
 * written after a namespace's enumeration passed that point is never seen — the first real run
 * finished with both namespaces marked done and 260 vectors absent, because production grew from
 * 46,306 to 46,406 while the copy was in flight.
 *
 * Re-running the full migration would recover those 260 at the cost of re-reading all ~50,000.
 * This reads ids (cheap — no vectors) and fetches ONLY the ones Qdrant does not already hold, so
 * the egress is proportional to the gap rather than the corpus.
 *
 * That makes it the right tool for two jobs: finishing a migration that raced the source, and
 * keeping Qdrant current afterwards while both stores are live.
 *
 * Idempotent, like the migration — point ids are deterministic, so re-running re-copies nothing.
 *
 * Usage:
 *   npx tsx scripts/sync-missing-to-qdrant.ts --dry-run
 *   npx tsx scripts/sync-missing-to-qdrant.ts
 *   npx tsx scripts/sync-missing-to-qdrant.ts --namespace production
 */
import { Pinecone } from '@pinecone-database/pinecone';
import { env } from '../src/config/env';
import { getSecret } from '../src/services/runtimeSecrets.service';
import { QdrantService, QDRANT_COLLECTION } from '../src/services/rag/qdrant.service';
import { toQdrantId, PINECONE_ID_KEY, PINECONE_NAMESPACE_KEY } from '../src/services/rag/qdrantFilter';

const argv = process.argv.slice(2);
const DRY_RUN = argv.includes('--dry-run');
const ONLY = (() => { const i = argv.indexOf('--namespace'); return i >= 0 ? argv[i + 1] : undefined; })();

const log = (stage: string, msg: string) => console.log(`[${stage}] ${msg}`);
const mb = (b: number) => `${(b / 1048576).toFixed(1)} MB`;

async function run() {
  const apiKey = getSecret('PINECONE_API_KEY') || env.PINECONE_API_KEY;
  if (!apiKey) throw new Error('PINECONE_API_KEY is not configured');

  const pc = new Pinecone({ apiKey });
  const index = pc.index(env.PINECONE_INDEX_NAME);
  const qdrant = new QdrantService();
  const qc = (qdrant as any).client();

  console.log('='.repeat(78));
  console.log(`Qdrant delta sync${DRY_RUN ? '   [DRY RUN — nothing will be written]' : ''}`);
  console.log('='.repeat(78));

  const desc: any = await pc.describeIndex(env.PINECONE_INDEX_NAME);
  if (desc?.dimension !== 768 || desc?.metric !== 'cosine') {
    throw new Error(`index is ${desc?.dimension}d/${desc?.metric}; this tool expects 768d/cosine`);
  }

  await qdrant.ensureCollection();

  const stats: any = await index.describeIndexStats();
  const namespaces = Object.keys(stats.namespaces ?? {}).filter((n) => !ONLY || n === ONLY);
  if (!namespaces.length) throw new Error(`no namespace matched${ONLY ? ` --namespace ${ONLY}` : ''}`);

  let grandMissing = 0, grandCopied = 0, grandFailed = 0, grandBytes = 0;

  for (const ns of namespaces) {
    // ── 1. every id Pinecone currently holds (ids only) ─────────────────────────────────────
    const ids: string[] = [];
    let token: string | undefined;
    for (;;) {
      const page: any = await index.namespace(ns).listPaginated({ limit: 100, paginationToken: token });
      ids.push(...(page?.vectors ?? []).map((v: any) => v.id).filter(Boolean));
      token = page?.pagination?.next;
      if (!token) break;
    }
    const unique = [...new Set(ids)];
    log('ENUMERATION', `${ns}: ${unique.length} ids in Pinecone`);

    // ── 2. which of them Qdrant is missing ──────────────────────────────────────────────────
    const missing: string[] = [];
    for (let i = 0; i < unique.length; i += 200) {
      const slice = unique.slice(i, i + 200);
      const points: any[] = await qc.retrieve(QDRANT_COLLECTION, {
        ids: slice.map((id) => toQdrantId(ns, id)),
        with_payload: false,
        with_vector: false,
      });
      const found = new Set(points.map((p) => String(p.id)));
      for (const id of slice) if (!found.has(toQdrantId(ns, id))) missing.push(id);
    }

    grandMissing += missing.length;
    log('DIFF', `${ns}: ${missing.length} missing from Qdrant`);
    if (!missing.length) continue;

    if (DRY_RUN) {
      console.log(`      would copy: ${missing.slice(0, 5).join(', ')}${missing.length > 5 ? ` … and ${missing.length - 5} more` : ''}`);
      console.log(`      estimated egress: ${mb(missing.length * 12 * 1024)}`);
      continue;
    }

    // ── 3. fetch and copy only those ────────────────────────────────────────────────────────
    for (let i = 0; i < missing.length; i += 100) {
      const slice = missing.slice(i, i + 100);
      try {
        const res: any = await index.namespace(ns).fetch({ ids: slice });
        const records = res?.records ?? {};
        grandBytes += Buffer.byteLength(JSON.stringify(records), 'utf8');

        const points: any[] = [];
        for (const id of slice) {
          const rec = records[id];
          if (!rec || !Array.isArray(rec.values) || rec.values.length !== 768) {
            grandFailed++;
            console.log(`      SKIP ${ns}/${id}: ${!rec ? 'absent from fetch' : `dimension ${rec.values?.length}`}`);
            continue;
          }
          points.push({
            id: toQdrantId(ns, id),
            vector: rec.values,
            payload: { ...(rec.metadata ?? {}), [PINECONE_ID_KEY]: id, [PINECONE_NAMESPACE_KEY]: ns },
          });
        }

        if (points.length) {
          await qc.upsert(QDRANT_COLLECTION, { wait: true, points });
          grandCopied += points.length;
          log('UPLOAD', `${ns}: ${grandCopied} copied (${mb(grandBytes)} egress)`);
        }
      } catch (e: any) {
        grandFailed += slice.length;
        console.log(`      FAILED ${ns} batch at ${i}: ${String(e?.message || e).slice(0, 160)}`);
      }
    }
  }

  console.log('\n' + '='.repeat(78));
  console.log(`  missing found : ${grandMissing}`);
  console.log(`  copied        : ${grandCopied}`);
  console.log(`  failed        : ${grandFailed}`);
  console.log(`  egress        : ${mb(grandBytes)}`);
  console.log('');
  if (DRY_RUN) console.log('STATUS: DRY RUN — nothing written');
  else if (grandFailed > 0) console.log('STATUS: NOT COMPLETE — some vectors failed');
  else if (grandCopied === grandMissing) console.log('STATUS: IN SYNC — re-run to confirm, since the source is live');
  else console.log('STATUS: PARTIAL');
}

run().then(() => process.exit(0)).catch((e) => { console.error('FAILED:', e?.message || e); process.exit(1); });
