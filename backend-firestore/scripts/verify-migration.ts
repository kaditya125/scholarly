/**
 * Verify a Pinecone -> Qdrant migration. Four checks, none of which trusts the migration's own
 * success counters.
 *
 *   counts      per namespace, Pinecone vs Qdrant
 *   vectors     random sample, compared component by component
 *   metadata    same sample, compared field by field
 *   search      the SAME query vector run against both, comparing ids, scores and ranking
 *
 * The search check is the one that actually answers the question the migration exists to
 * answer. Counts and checksums can all agree while retrieval still behaves differently — a
 * distance-metric mismatch reorders results without losing a single vector. It deliberately
 * reuses one embedding per query rather than calling the provider twice: two embeddings of the
 * same text are not bit-identical, and the difference would show up as a ranking difference
 * that has nothing to do with the migration.
 *
 * Usage:
 *   npx tsx scripts/verify-migration.ts
 *   npx tsx scripts/verify-migration.ts --sample 100
 *   npx tsx scripts/verify-migration.ts --namespace production --sample 25
 *   npx tsx scripts/verify-migration.ts --skip-search
 */
import { Pinecone } from '@pinecone-database/pinecone';
import { env } from '../src/config/env';
import { getSecret } from '../src/services/runtimeSecrets.service';
import { QdrantService, QDRANT_COLLECTION } from '../src/services/rag/qdrant.service';
import { toQdrantFilter, toQdrantId, PINECONE_ID_KEY, PINECONE_NAMESPACE_KEY } from '../src/services/rag/qdrantFilter';
import { compareMetadata, compareVectors } from '../src/services/rag/metadataDiff';
import { GoogleEmbeddingProvider } from '../src/services/ai/providers/google-embedding.provider';

const argv = process.argv.slice(2);
const valueOf = (f: string) => { const i = argv.indexOf(f); return i >= 0 ? argv[i + 1] : undefined; };
const SAMPLE = Number(valueOf('--sample') || 100);
const ONLY_NAMESPACE = valueOf('--namespace');
const SKIP_SEARCH = argv.includes('--skip-search');

/** Representative of how the application actually queries: Hindi and English, broad and narrow. */
const QUERIES = [
  'photosynthesis in plants',
  'what is an ecosystem and its components',
  'भारत का संविधान',
  'quadratic equations roots',
  'मैंने हैरान होकर देखा',
  'structure of the atom quantum numbers',
];

const SCORE_FLOOR = 0.50; // retrieval.service.ts drops anything below this before reranking

function pickRandom<T>(arr: T[], n: number): T[] {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy.slice(0, n);
}

async function run() {
  const apiKey = getSecret('PINECONE_API_KEY') || env.PINECONE_API_KEY;
  if (!apiKey) throw new Error('PINECONE_API_KEY is not configured');
  const pc = new Pinecone({ apiKey });
  const index = pc.index(env.PINECONE_INDEX_NAME);
  const qdrant = new QdrantService();
  const qclient = (qdrant as any).client();

  console.log('='.repeat(78));
  console.log('Migration verification');
  console.log('='.repeat(78));
  console.log(`Pinecone source : ${env.PINECONE_INDEX_NAME}`);
  console.log(`Qdrant dest     : ${QDRANT_COLLECTION} @ ${env.QDRANT_URL}`);

  // ── 1. counts ─────────────────────────────────────────────────────────────────────────────
  const stats: any = await index.describeIndexStats();
  const namespaces = Object.entries(stats?.namespaces ?? {})
    .map(([name, ns]: [string, any]) => ({ name, count: ns?.recordCount ?? 0 }))
    .filter((n) => !ONLY_NAMESPACE || n.name === ONLY_NAMESPACE);

  console.log('\nNamespaces');
  console.log('-'.repeat(78));
  let countsMatch = true;
  let pineTotal = 0, qdrantTotal = 0;

  for (const ns of namespaces) {
    const c: any = await qclient.count(QDRANT_COLLECTION, {
      filter: toQdrantFilter(undefined, ns.name) as any,
      exact: true,
    });
    const qCount = c?.count ?? 0;
    const diff = qCount - ns.count;
    if (diff !== 0) countsMatch = false;
    pineTotal += ns.count; qdrantTotal += qCount;
    console.log(`\n${ns.name}`);
    console.log(`  Pinecone: ${ns.count}`);
    console.log(`  Qdrant:   ${qCount}`);
    console.log(`  Difference: ${diff}`);
  }
  console.log(`\nTotal`);
  console.log(`  Pinecone: ${pineTotal}`);
  console.log(`  Qdrant:   ${qdrantTotal}`);
  console.log(`  Difference: ${qdrantTotal - pineTotal}`);

  // ── 2 & 3. vector + metadata integrity on a random sample ─────────────────────────────────
  let sampled = 0, vecIdentical = 0, vecDifferent = 0, metaPassed = 0, metaFailed = 0;
  let worstNormalisedDiff = 0, worstCosineDelta = 0, worstRawDiff = 0;
  const metaProblems: string[] = [];

  for (const ns of namespaces) {
    const nsIndex = index.namespace(ns.name);

    // Collect candidate ids by paging the id list (ids only — cheap).
    const ids: string[] = [];
    let token: string | undefined;
    while (ids.length < Math.max(SAMPLE * 3, 300)) {
      const page: any = await nsIndex.listPaginated({ limit: 100, paginationToken: token });
      const batch = (page?.vectors ?? []).map((v: any) => v.id).filter(Boolean);
      if (!batch.length) break;
      ids.push(...batch);
      token = page?.pagination?.next;
      if (!token) break;
    }
    if (!ids.length) { console.log(`\n[VERIFY] ${ns.name}: no ids enumerated, skipping integrity check`); continue; }

    const chosen = pickRandom(ids, Math.min(SAMPLE, ids.length));
    for (let i = 0; i < chosen.length; i += 50) {
      const slice = chosen.slice(i, i + 50);
      const res: any = await nsIndex.fetch({ ids: slice });
      const records = res?.records ?? {};

      const qPoints: any[] = await qclient.retrieve(QDRANT_COLLECTION, {
        ids: slice.map((id) => toQdrantId(ns.name, id)),
        with_payload: true,
        with_vector: true,
      });
      const byOriginal = new Map<string, any>();
      for (const p of qPoints) byOriginal.set(p?.payload?.[PINECONE_ID_KEY], p);

      for (const id of slice) {
        const src = records[id];
        if (!src) continue;
        sampled++;

        const tgt = byOriginal.get(id);
        if (!tgt) {
          vecDifferent++; metaFailed++;
          metaProblems.push(`${ns.name}/${id}: absent from Qdrant`);
          continue;
        }

        const v = compareVectors(src.values, Array.isArray(tgt.vector) ? tgt.vector : undefined);

        // Qdrant normalises to unit length on write for Cosine collections — verified directly:
        // [2,0,..] in, [1,0,..] out, while a Dot collection stores it unchanged. Bitwise equality
        // is therefore not achievable through this API, and it is not what preserves retrieval.
        // Direction is: cosine similarity is scale-invariant, so identical direction means
        // identical ranking and identical scores. Judge on that, plus agreement to float32
        // epsilon once both sides are normalised.
        const sameDirection = v.dimensionMatch && Math.abs(v.cosineSimilarity - 1) < 1e-6;
        const sameComponents = v.maxAbsDiffNormalised < 1e-5;
        if (sameDirection && sameComponents) vecIdentical++; else {
          vecDifferent++;
          metaProblems.push(
            `${ns.name}/${id}: vector differs — dims ${v.sourceDimension}->${v.targetDimension}, ` +
            `cos=${v.cosineSimilarity.toFixed(9)}, normalised max|d|=${v.maxAbsDiffNormalised.toExponential(2)}`
          );
        }
        worstNormalisedDiff = Math.max(worstNormalisedDiff, v.maxAbsDiffNormalised);
        worstCosineDelta = Math.max(worstCosineDelta, Math.abs(v.cosineSimilarity - 1));
        worstRawDiff = Math.max(worstRawDiff, v.maxAbsDiff);

        const m = compareMetadata(src.metadata, tgt.payload, [PINECONE_ID_KEY, PINECONE_NAMESPACE_KEY]);
        if (m.equal) metaPassed++; else {
          metaFailed++;
          metaProblems.push(`${ns.name}/${id}: metadata — ${m.diffs.slice(0, 4).map((d) => `${d.key}(${d.kind})`).join(', ')}`);
        }
      }
    }
  }

  console.log('\nVector verification');
  console.log('-'.repeat(78));
  console.log(`  Sampled:   ${sampled}`);
  console.log(`  Identical: ${vecIdentical}   (same direction, components within float32 epsilon)`);
  console.log(`  Different: ${vecDifferent}`);
  console.log(`  Max |cosine similarity - 1| : ${worstCosineDelta.toExponential(3)}   (0 = direction preserved exactly)`);
  console.log(`  Max |delta| after normalising: ${worstNormalisedDiff.toExponential(3)}   (float32 epsilon is ~1.2e-7)`);
  console.log(`  Max |delta| raw              : ${worstRawDiff.toExponential(3)}   (non-zero expected — Qdrant normalises`);
  console.log('                                 on write for Cosine collections)');

  console.log('\nMetadata verification');
  console.log('-'.repeat(78));
  console.log(`  Sampled: ${sampled}`);
  console.log(`  Passed:  ${metaPassed}`);
  console.log(`  Failed:  ${metaFailed}`);
  if (metaProblems.length) {
    console.log('\n  problems (first 15):');
    for (const p of metaProblems.slice(0, 15)) console.log(`    ${p}`);
  }

  // ── 4. search equivalence ─────────────────────────────────────────────────────────────────
  let queriesTested = 0, queriesMatching = 0, queriesDifferent = 0;

  if (!SKIP_SEARCH) {
    console.log('\nSearch verification');
    console.log('-'.repeat(78));
    const embedder = new GoogleEmbeddingProvider();
    const searchNs = ONLY_NAMESPACE || env.PINECONE_NAMESPACE;

    for (const q of QUERIES) {
      let vector: number[];
      try {
        vector = await embedder.generateEmbedding(q); // ONE embedding, used for both stores
      } catch (e: any) {
        console.log(`\nQuery: "${q}"\n  SKIPPED — could not embed: ${String(e?.message || e).slice(0, 120)}`);
        continue;
      }
      queriesTested++;

      const pRes: any = await index.namespace(searchNs).query({
        vector, topK: 5, includeMetadata: true, includeValues: false,
      });
      const pHits = (pRes?.matches ?? []).map((m: any) => ({ id: m.id, score: m.score }));

      const qRes: any = await qclient.query(QDRANT_COLLECTION, {
        query: vector,
        filter: toQdrantFilter(undefined, searchNs) as any,
        limit: 5, with_payload: true, with_vector: false,
      });
      const qHits = (qRes?.points ?? []).map((p: any) => ({ id: p?.payload?.[PINECONE_ID_KEY], score: p.score }));

      console.log(`\nQuery: "${q}"`);
      console.log('Pinecone:');
      pHits.forEach((h: any, i: number) => console.log(`  ${i + 1}. ${h.id} score=${(h.score ?? 0).toFixed(4)}`));
      console.log('Qdrant:');
      qHits.forEach((h: any, i: number) => console.log(`  ${i + 1}. ${h.id} score=${(h.score ?? 0).toFixed(4)}`));
      // What counts as "the same result" for a migration.
      //
      // Bitwise-equal scores are unattainable and were the wrong bar. Qdrant normalises vectors
      // on write for Cosine collections, so it computes dot(a-hat, b-hat) where Pinecone computes
      // dot(a,b)/(|a||b|) at query time; the rounding differs by ~1e-3.
      //
      // That drift is small, but it is enough to reorder two documents that are closer together
      // than the drift itself. Observed here: topic:UPSC_CDS at 0.6726 and chunk_12 at 0.6713 are
      // 1.3e-3 apart in Pinecone and swap places in Qdrant. Both engines rank correctly for their
      // own arithmetic — Qdrant's ANN order matches Qdrant's own exact order — so no amount of
      // index tuning removes it, and calling it a failure would mean this check can never pass.
      //
      // So: the same documents, the same survivors past the 0.50 floor, and any reordering
      // confined to pairs closer together than the measured drift. A document appearing or
      // disappearing, or a reorder between documents that are genuinely far apart, still fails —
      // the recall bug produced exactly that, with a 1.5e-1 gap.
      const pIds = pHits.map((h: any) => h.id);
      const qIds = qHits.map((h: any) => h.id);
      const sameSet = pIds.length === qIds.length && pIds.every((id: string) => qIds.includes(id));
      const sameOrder = pIds.every((id: string, i: number) => id === qIds[i]);
      const maxScoreDelta = Math.max(0, ...pHits.map((h: any) => {
        const match = qHits.find((q: any) => q.id === h.id);
        return match ? Math.abs((h.score ?? 0) - (match.score ?? 0)) : 0;
      }));
      const pSurvive = pHits.filter((h: any) => (h.score ?? 0) >= SCORE_FLOOR).length;
      const qSurvive = qHits.filter((h: any) => (h.score ?? 0) >= SCORE_FLOOR).length;

      // Is every position that moved a near-tie in the source ranking?
      const tieBand = Math.max(maxScoreDelta * 2, 1e-6);
      let reorderIsTiesOnly = true;
      for (let i = 0; i < pIds.length; i++) {
        if (pIds[i] === qIds[i]) continue;
        const moved = pHits.find((h: any) => h.id === qIds[i]);
        if (!moved || Math.abs((moved.score ?? 0) - (pHits[i].score ?? 0)) > tieBand) { reorderIsTiesOnly = false; break; }
      }

      const ok = sameSet && pSurvive === qSurvive && maxScoreDelta < 5e-3 && (sameOrder || reorderIsTiesOnly);
      if (ok) queriesMatching++; else queriesDifferent++;

      const why = !sameSet ? 'different documents returned'
        : pSurvive !== qSurvive ? `floor survivors differ (${pSurvive} vs ${qSurvive})`
        : maxScoreDelta >= 5e-3 ? `score drift ${maxScoreDelta.toExponential(2)} exceeds 5e-3`
        : !reorderIsTiesOnly ? 'documents reordered beyond the precision band'
        : '';
      const note = ok && !sameOrder ? ' — same documents, near-ties reordered within precision' : '';

      console.log(`Result: ${ok ? `MATCH${note}` : `DIFFERENT — ${why}`}   (max score d=${maxScoreDelta.toExponential(2)}, past ${SCORE_FLOOR} floor: ${pSurvive} vs ${qSurvive})`);
    }

    console.log(`\n  Queries tested: ${queriesTested}`);
    console.log(`  Matching:       ${queriesMatching}`);
    console.log(`  Different:      ${queriesDifferent}`);
  }

  // ── verdict ───────────────────────────────────────────────────────────────────────────────
  const pass = countsMatch && vecDifferent === 0 && metaFailed === 0 && queriesDifferent === 0 && sampled > 0;
  console.log('\n' + '='.repeat(78));
  console.log(pass ? 'VERDICT: PASS' : 'VERDICT: FAIL');
  if (!pass) {
    if (!countsMatch) console.log('  - namespace counts differ');
    if (vecDifferent) console.log(`  - ${vecDifferent} sampled vectors differ`);
    if (metaFailed) console.log(`  - ${metaFailed} sampled metadata objects differ`);
    if (queriesDifferent) console.log(`  - ${queriesDifferent} queries returned different results`);
    if (!sampled) console.log('  - nothing was sampled; the check did not actually run');
  }
  console.log('='.repeat(78));
  process.exit(pass ? 0 : 1);
}

run().catch((e) => { console.error('FAILED:', e?.message || e); process.exit(1); });
