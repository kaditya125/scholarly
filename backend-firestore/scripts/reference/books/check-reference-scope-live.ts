/**
 * Live, data-level check that reference-book scoping reaches the right books — and only them.
 *
 *   QDRANT_URL=... npx tsx scripts/reference/books/check-reference-scope-live.ts
 *
 * Builds each case's filter with the PRODUCTION code path (buildReferenceFilter → toQdrantFilter)
 * and counts matching vectors in Qdrant. Read-only `count` calls; no embeddings, so no quota use.
 */
import { QdrantClient } from '@qdrant/js-client-rest';
import { env } from '../../../src/config/env';
import { QDRANT_COLLECTION } from '../../../src/services/rag/qdrant.service';
import { toQdrantFilter } from '../../../src/services/rag/qdrantFilter';
import { REFERENCE_BOOK_NAMESPACE } from '../../../src/services/rag/namespaces';
import { buildReferenceFilter, ReferenceRetrievalOptions } from '../../../src/services/rag/referenceBooks.service';

const PHYSICS = ['hc_verma_physics_vol1', 'hc_verma_physics_vol2', 'irodov_physics_problems'];
type Expect = 'SOME' | 'NONE' | 'NO_SUPPORTED';
const CASES: Array<{ label: string; opts: ReferenceRetrievalOptions; expect: Expect }> = [
  { label: 'JEE physics → HCV/Irodov', opts: { examCode: 'JEE_MAIN', book: PHYSICS }, expect: 'SOME' },
  { label: 'NEET physics → HCV (NEET/NEET_UG tags)', opts: { examCode: 'NEET_UG', book: PHYSICS }, expect: 'SOME' },
  { label: 'JEE organic → MS Chouhan', opts: { examCode: 'JEE_MAIN', book: ['ms_chouhan_organic'] }, expect: 'SOME' },
  { label: 'NEET inorganic → JD Lee', opts: { examCode: 'NEET_UG', book: ['jd_lee_inorganic'] }, expect: 'SOME' },
  { label: 'JEE maths → Hall & Knight / Loney', opts: { examCode: 'JEE_MAIN', book: ['hall_knight_algebra', 'sl_loney_trigonometry'] }, expect: 'SOME' },
  { label: 'NEET biology → Trueman / Campbell', opts: { examCode: 'NEET_UG', book: ['trueman_biology_vol1', 'trueman_biology_vol2', 'campbell_biology'] }, expect: 'SOME' },
  { label: 'UPSC polity → Laxmikanth', opts: { examCode: 'UPSC_CSE', book: ['laxmikanth_polity'] }, expect: 'SOME' },
  { label: 'SSC CGL physics → NOT HCV/Irodov (JEE/NEET books)', opts: { examCode: 'SSC_CGL', book: PHYSICS }, expect: 'NONE' },
  { label: 'NEET → NOT Hall & Knight (JEE maths)', opts: { examCode: 'NEET_UG', book: ['hall_knight_algebra'] }, expect: 'NONE' },
  { label: 'JEE → NOT Laxmikanth (civil services)', opts: { examCode: 'JEE_MAIN', book: ['laxmikanth_polity'] }, expect: 'NONE' },
  { label: 'SSC IMD CS → CS books', opts: { examCode: 'SSC_IMD_CS' }, expect: 'SOME' },
  { label: 'UGC NET CS → CS books', opts: { examCode: 'UGC_NET', domain: 'database_management' }, expect: 'SOME' },
  { label: 'UGC NET Economics → no supported books', opts: { examCode: 'UGC_NET', domain: 'Economics' }, expect: 'NO_SUPPORTED' },
  { label: 'Superseded irodov_physics never served', opts: { book: ['irodov_physics'] }, expect: 'SOME' /* resolves to the canonical book */ },
];

async function main() {
  const client = new QdrantClient({ url: env.QDRANT_URL, apiKey: env.QDRANT_API_KEY || undefined, checkCompatibility: false });
  let failures = 0;
  for (const c of CASES) {
    const { scope, filter } = buildReferenceFilter(c.opts);
    let got: Expect;
    let n = 0;
    if (scope.kind === 'NO_SUPPORTED_REFERENCE_BOOKS') got = 'NO_SUPPORTED';
    else if (!filter) got = 'NONE';
    else {
      const r: any = await client.count(QDRANT_COLLECTION, { filter: toQdrantFilter(filter, REFERENCE_BOOK_NAMESPACE) as any, exact: true });
      n = r.count;
      got = n > 0 ? 'SOME' : 'NONE';
    }
    const ok = got === c.expect;
    if (!ok) failures++;
    console.log(`${ok ? 'PASS' : 'FAIL'}  ${c.label.padEnd(52)} ${got}${got === 'SOME' ? ` (${n} vectors)` : ''}`);
  }
  // The superseded copy itself must be unreachable through any unfiltered query.
  const unfiltered = buildReferenceFilter({}).filter!;
  const leak: any = await client.count(QDRANT_COLLECTION, {
    filter: { ...toQdrantFilter(unfiltered, REFERENCE_BOOK_NAMESPACE), must: [...(toQdrantFilter(unfiltered, REFERENCE_BOOK_NAMESPACE).must ?? []), { key: 'book', match: { any: ['irodov_physics', 'arihant_csat_reasoning', 'hc_verma_vol1'] } }] } as any,
    exact: true,
  });
  const leakOk = leak.count === 0;
  if (!leakOk) failures++;
  console.log(`${leakOk ? 'PASS' : 'FAIL'}  ${'Excluded books unreachable in unfiltered queries'.padEnd(52)} ${leak.count} vectors`);
  console.log(failures ? `\n${failures} failing` : '\nall passing');
  process.exit(failures ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });
