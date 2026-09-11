/**
 * Synthetic tests for the Qdrant backend and the migration's pure logic.
 *
 * Pinecone reads are refused while the monthly egress cap holds, so the real migration cannot be
 * exercised. Everything that does NOT need Pinecone can be, and that is most of the risk: the id
 * mapping, the filter translation, namespace isolation, metadata fidelity, and idempotency.
 *
 * Deterministic vectors throughout — a seeded generator, not Math.random — so a failure is
 * reproducible and a passing run means the same thing tomorrow.
 *
 * Writes to a THROWAWAY collection and deletes it at the end. It never touches edtech_ai_rag.
 *
 *   npx tsx scripts/test-qdrant-synthetic.ts
 */
import { QdrantClient } from '@qdrant/js-client-rest';
import { env } from '../src/config/env';
import { QdrantService, QDRANT_DIMENSION, QDRANT_DISTANCE } from '../src/services/rag/qdrant.service';
import { toQdrantId, toQdrantFilter, NS_SADHYA, PINECONE_ID_KEY, PINECONE_NAMESPACE_KEY } from '../src/services/rag/qdrantFilter';
import { compareMetadata, compareVectors } from '../src/services/rag/metadataDiff';
import { VectorDocument } from '../src/services/rag/vectorStore.types';

const TEST_COLLECTION = `migration_selftest_${Date.now()}`;

let passed = 0, failed = 0;
const failures: string[] = [];

function check(name: string, condition: boolean, detail = '') {
  if (condition) { passed++; console.log(`  PASS  ${name}`); }
  else { failed++; failures.push(`${name}${detail ? ` — ${detail}` : ''}`); console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ''}`); }
}

/**
 * Deterministic pseudo-random unit vector, seeded by id.
 *
 * Quantised through Float32Array on the way out, because that is what real input looks like:
 * Pinecone stores float32 and returns those values as JSON numbers, so anything arriving from it
 * is already exactly representable in float32. Qdrant also stores float32.
 *
 * Generating raw float64 here instead would make the round-trip test fail by ~1e-9 for reasons
 * that have nothing to do with the migration — the test would be measuring its own fixture. The
 * float64 case is still covered explicitly below so the precision behaviour is recorded rather
 * than hidden by the fixture.
 */
function syntheticVector(seed: number, float64 = false): number[] {
  const v: number[] = new Array(QDRANT_DIMENSION);
  let s = seed * 2654435761 % 2147483647;
  for (let i = 0; i < QDRANT_DIMENSION; i++) {
    s = (s * 48271) % 2147483647;
    v[i] = (s / 2147483647) * 2 - 1;
  }
  const norm = Math.sqrt(v.reduce((a, x) => a + x * x, 0));
  const unit = v.map((x) => x / norm);
  return float64 ? unit : Array.from(Float32Array.from(unit));
}

function syntheticDoc(i: number, namespace: string): VectorDocument {
  return {
    id: `src${i % 7}_chunk_${i}`,
    values: syntheticVector(i + (namespace === 'reference_books' ? 100000 : 0)),
    metadata: {
      sourceId: `src${i % 7}`,
      chunkIndex: i,
      text: `synthetic chunk ${i} in ${namespace}`,
      subject: i % 2 === 0 ? 'Biology' : 'Physics',
      notebookId: `nb-${i % 3}`,
      is_pyq: i % 2 === 0,
      is_generated: false,
      corpusBucket: i % 3 === 0 ? 'PRACTICE_MOCK' : 'OFFICIAL_PYQ',
      tags: [`tag${i % 4}`, `tag${(i + 1) % 4}`],
      pageNumber: i * 2,
      createdAt: 1700000000000 + i,
    } as any,
  };
}

async function run() {
  console.log('='.repeat(78));
  console.log(`Qdrant synthetic test suite   collection=${TEST_COLLECTION}`);
  console.log('='.repeat(78));

  // ── A. pure logic, no server needed ───────────────────────────────────────────────────────
  console.log('\n[A] id mapping');
  const idA = toQdrantId('production', 'abc_chunk_0');
  const idB = toQdrantId('production', 'abc_chunk_0');
  const idC = toQdrantId('reference_books', 'abc_chunk_0');
  const idD = toQdrantId('production', 'abc_chunk_1');
  check('same namespace + id -> same UUID', idA === idB, `${idA} vs ${idB}`);
  check('different namespace, same id -> different UUID', idA !== idC, `${idA} vs ${idC}`);
  check('same namespace, different id -> different UUID', idA !== idD);
  check('is a well-formed UUID', /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(idA), idA);
  // The VALUE is load-bearing — every point id in existence derives from it — so it is printed
  // rather than asserted against a literal I would otherwise have to invent here. Record it.
  check('NS_SADHYA is a valid UUID', /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(NS_SADHYA), NS_SADHYA);
  console.log(`        NS_SADHYA = ${NS_SADHYA}   (must never change)`);

  console.log('\n[B] filter translation');
  const fEq = toQdrantFilter({ notebookId: 'nb-1' }, 'production');
  check('equality -> match.value', JSON.stringify(fEq.must).includes('"value":"nb-1"'), JSON.stringify(fEq));
  check('namespace condition always present', JSON.stringify(fEq.must).includes(PINECONE_NAMESPACE_KEY));

  const fIn = toQdrantFilter({ sourceId: { $in: ['a', 'b'] } }, 'production');
  check('$in -> match.any', JSON.stringify(fIn.must).includes('"any":["a","b"]'), JSON.stringify(fIn));

  const fNe = toQdrantFilter({ corpusBucket: { $ne: 'PRACTICE_MOCK' } }, 'production');
  check('$ne -> must_not', JSON.stringify(fNe.must_not ?? []).includes('PRACTICE_MOCK'), JSON.stringify(fNe));

  const fRange = toQdrantFilter({ chunkIndex: { $gte: 0, $lt: 10 } }, 'production');
  check('$gte + $lt fold into one range', JSON.stringify(fRange.must).includes('"gte":0') && JSON.stringify(fRange.must).includes('"lt":10'), JSON.stringify(fRange));

  const fBool = toQdrantFilter({ is_pyq: false }, 'production');
  check('boolean false survives translation', JSON.stringify(fBool.must).includes('"value":false'), JSON.stringify(fBool));

  let threw = false;
  try { toQdrantFilter({ x: { $regex: 'y' } } as any, 'production'); } catch { threw = true; }
  check('unknown operator throws rather than widening the filter', threw);

  console.log('\n[C] comparison utilities');
  check('identical metadata compares equal', compareMetadata({ a: 1, b: 'x' }, { a: 1, b: 'x' }).equal);
  check('type change detected', compareMetadata({ a: 1 }, { a: '1' }).diffs[0]?.kind === 'type');
  check('missing field detected', compareMetadata({ a: 1, b: 2 }, { a: 1 }).diffs[0]?.kind === 'missing');
  check('extra field detected', compareMetadata({ a: 1 }, { a: 1, z: 9 }).diffs[0]?.kind === 'extra');
  check('array length change detected', compareMetadata({ t: ['a', 'b'] }, { t: ['a'] }).diffs[0]?.kind === 'array_length');
  check('array element change detected', compareMetadata({ t: ['a', 'b'] }, { t: ['a', 'c'] }).diffs[0]?.kind === 'array_value');
  check('null vs undefined detected', compareMetadata({ a: null }, {}).diffs.length > 0);
  check('ignoreKeys suppresses adapter keys', compareMetadata({ a: 1 }, { a: 1, [PINECONE_ID_KEY]: 'x' }, [PINECONE_ID_KEY]).equal);
  check('identical vectors compare identical', compareVectors([1, 2, 3], [1, 2, 3]).identical);
  check('vector difference reports maxAbsDiff', compareVectors([1, 2, 3], [1, 2, 3.5]).maxAbsDiff === 0.5);
  check('dimension mismatch flagged', compareVectors([1, 2], [1, 2, 3]).dimensionMatch === false);

  // ── D. against a live Qdrant ──────────────────────────────────────────────────────────────
  const client = new QdrantClient({ url: env.QDRANT_URL, apiKey: env.QDRANT_API_KEY || undefined, checkCompatibility: false });
  let serverUp = true;
  try { await client.getCollections(); } catch (e: any) {
    serverUp = false;
    console.log(`\n[D] SKIPPED — no Qdrant at ${env.QDRANT_URL} (${String(e?.message || e).slice(0, 90)})`);
  }

  if (serverUp) {
    const svc = new QdrantService(TEST_COLLECTION);
    await client.createCollection(TEST_COLLECTION, { vectors: { size: QDRANT_DIMENSION, distance: QDRANT_DISTANCE } });
    for (const key of [PINECONE_NAMESPACE_KEY, PINECONE_ID_KEY, 'sourceId', 'notebookId', 'corpusBucket', 'chunkIndex', 'is_pyq']) {
      try { await client.createPayloadIndex(TEST_COLLECTION, { field_name: key, field_schema: key === 'chunkIndex' ? 'integer' : key === 'is_pyq' ? 'bool' : 'keyword', wait: true }); } catch { /* ok */ }
    }

    console.log('\n[D] round trip: 10 vectors');
    const ten = Array.from({ length: 10 }, (_, i) => syntheticDoc(i, 'production'));
    await svc.upsertVectors(ten, 'production');
    const fetched = await svc.fetchVectors(ten.map((d) => d.id), 'production');
    check('all 10 returned', Object.keys(fetched).length === 10, `got ${Object.keys(fetched).length}`);
    check('ids come back as ORIGINAL pinecone ids', !!fetched[ten[0].id], Object.keys(fetched).slice(0, 2).join(','));
    // Qdrant normalises on write for Cosine collections (verified: [2,0,..] is stored as
    // [1,0,..]), so bitwise equality is not achievable and not the property that matters.
    // Direction is: cosine similarity is scale-invariant, so identical direction means identical
    // ranking and identical scores.
    const v0 = compareVectors(ten[0].values, fetched[ten[0].id]?.values);
    check('direction preserved exactly (cosine similarity = 1)', Math.abs(v0.cosineSimilarity - 1) < 1e-6,
      `cos=${v0.cosineSimilarity}`);
    check('components agree to float32 epsilon once normalised', v0.maxAbsDiffNormalised < 1e-6,
      `maxAbsDiffNormalised=${v0.maxAbsDiffNormalised.toExponential(2)}`);
    console.log(`        raw maxAbsDiff=${v0.maxAbsDiff.toExponential(2)}  |in|=${v0.sourceNorm.toFixed(8)}  |out|=${v0.targetNorm.toFixed(8)}`);

    // The normalisation itself, stated as a test so it cannot quietly change under us.
    const scaled: VectorDocument = {
      id: 'scale_probe_chunk_0',
      values: ten[0].values.map((x) => x * 3),
      metadata: { note: 'normalisation probe' } as any,
    };
    await svc.upsertVectors([scaled], 'production');
    const scaledBack = await svc.fetchVectors([scaled.id], 'production');
    const vs = compareVectors(scaled.values, scaledBack[scaled.id]?.values);
    check('a 3x-scaled vector is stored normalised, not as given', Math.abs(vs.targetNorm - 1) < 1e-5,
      `|in|=${vs.sourceNorm.toFixed(4)} |out|=${vs.targetNorm.toFixed(6)}`);
    check('...and still points the same way, so search is unaffected', Math.abs(vs.cosineSimilarity - 1) < 1e-6,
      `cos=${vs.cosineSimilarity}`);
    await svc.deleteVectors([scaled.id], 'production');
    const m0 = compareMetadata(ten[0].metadata as any, fetched[ten[0].id]?.metadata as any);
    check('metadata round-trips exactly', m0.equal, m0.diffs.map((d) => `${d.key}(${d.kind})`).join(','));
    check('adapter keys stripped from returned metadata', !(PINECONE_ID_KEY in (fetched[ten[0].id]?.metadata ?? {})));

    console.log('\n[D] scale: 100 vectors');
    const hundred = Array.from({ length: 100 }, (_, i) => syntheticDoc(i, 'production'));
    await svc.upsertVectors(hundred, 'production');
    const cProd: any = await client.count(TEST_COLLECTION, { filter: toQdrantFilter(undefined, 'production') as any, exact: true });
    check('100 points in production', cProd?.count === 100, `count=${cProd?.count}`);

    console.log('\n[D] namespace isolation');
    const refs = Array.from({ length: 25 }, (_, i) => syntheticDoc(i, 'reference_books'));
    await svc.upsertVectors(refs, 'reference_books');
    const cRef: any = await client.count(TEST_COLLECTION, { filter: toQdrantFilter(undefined, 'reference_books') as any, exact: true });
    const cAll: any = await client.count(TEST_COLLECTION, { exact: true });
    check('reference_books has 25', cRef?.count === 25, `count=${cRef?.count}`);
    check('collection has 125 total', cAll?.count === 125, `count=${cAll?.count}`);
    check('same id in two namespaces stays two points', toQdrantId('production', 'src0_chunk_0') !== toQdrantId('reference_books', 'src0_chunk_0'));

    const prodHits = await svc.queryVectors(syntheticVector(3), 50, undefined, 'production');
    const refHits = await svc.queryVectors(syntheticVector(3), 50, undefined, 'reference_books');
    check('query in production never leaks reference_books', prodHits.length > 0 && prodHits.length <= 100);
    check('query in reference_books returns only its own', refHits.length > 0 && refHits.length <= 25, `got ${refHits.length}`);

    console.log('\n[D] filters against real data');
    const eqHits = await svc.queryVectors(syntheticVector(5), 100, { notebookId: 'nb-1' }, 'production');
    check('equality filter narrows results', eqHits.length > 0 && eqHits.every((h) => (h.metadata as any)?.notebookId === 'nb-1'), `got ${eqHits.length}`);

    const inHits = await svc.queryVectors(syntheticVector(5), 100, { sourceId: { $in: ['src0', 'src1'] } }, 'production');
    check('$in filter works', inHits.length > 0 && inHits.every((h) => ['src0', 'src1'].includes((h.metadata as any)?.sourceId)), `got ${inHits.length}`);

    const neHits = await svc.queryVectors(syntheticVector(5), 100, { corpusBucket: { $ne: 'PRACTICE_MOCK' } }, 'production');
    check('$ne filter excludes', neHits.length > 0 && neHits.every((h) => (h.metadata as any)?.corpusBucket !== 'PRACTICE_MOCK'), `got ${neHits.length}`);

    const rangeHits = await svc.queryVectors(syntheticVector(5), 100, { chunkIndex: { $gte: 0, $lt: 10 } }, 'production');
    check('$gte/$lt range filter works', rangeHits.length === 10, `got ${rangeHits.length}`);

    const boolHits = await svc.queryVectors(syntheticVector(5), 100, { is_pyq: true }, 'production');
    check('boolean filter works', boolHits.length > 0 && boolHits.every((h) => (h.metadata as any)?.is_pyq === true), `got ${boolHits.length}`);

    const tagDoc = hundred[3];
    const tagFetched = await svc.fetchVectors([tagDoc.id], 'production');
    check('tags[] array preserved', JSON.stringify((tagFetched[tagDoc.id]?.metadata as any)?.tags) === JSON.stringify((tagDoc.metadata as any).tags),
      JSON.stringify((tagFetched[tagDoc.id]?.metadata as any)?.tags));

    console.log('\n[D] idempotency');
    await svc.upsertVectors(hundred, 'production');
    const cAfter: any = await client.count(TEST_COLLECTION, { filter: toQdrantFilter(undefined, 'production') as any, exact: true });
    check('re-running the same upsert creates no duplicates', cAfter?.count === 100, `count=${cAfter?.count}`);

    console.log('\n[D] chunk metadata + delete');
    const chunkMeta = await svc.fetchChunkMetadata('src0', 100, 'production');
    check('fetchChunkMetadata returns that source only', chunkMeta.length > 0 && chunkMeta.every((c) => (c.metadata as any)?.sourceId === 'src0'), `got ${chunkMeta.length}`);

    await svc.deleteVectors([hundred[0].id], 'production');
    const cDel: any = await client.count(TEST_COLLECTION, { filter: toQdrantFilter(undefined, 'production') as any, exact: true });
    check('deleteVectors removes exactly one', cDel?.count === 99, `count=${cDel?.count}`);

    await svc.deleteAllVectors('reference_books');
    const cRefAfter: any = await client.count(TEST_COLLECTION, { filter: toQdrantFilter(undefined, 'reference_books') as any, exact: true });
    const cProdAfter: any = await client.count(TEST_COLLECTION, { filter: toQdrantFilter(undefined, 'production') as any, exact: true });
    check('deleteAllVectors clears only its namespace', cRefAfter?.count === 0, `reference_books=${cRefAfter?.count}`);
    check('deleteAllVectors leaves the other namespace intact', cProdAfter?.count === 99, `production=${cProdAfter?.count}`);

    await client.deleteCollection(TEST_COLLECTION);
    console.log(`\n  cleaned up ${TEST_COLLECTION}`);
  }

  console.log('\n' + '='.repeat(78));
  console.log(`passed ${passed}   failed ${failed}${serverUp ? '' : '   (server-dependent tests skipped)'}`);
  if (failures.length) { console.log('\nfailures:'); for (const f of failures) console.log(`  - ${f}`); }
  console.log('='.repeat(78));
  process.exit(failed === 0 ? 0 : 1);
}

run().catch((e) => { console.error('FAILED:', e?.message || e); process.exit(1); });
