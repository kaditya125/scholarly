/**
 * Part 1 Step 1 — read-only reconnaissance before any mutation.
 * Establishes namespace totals and the ID/ownership shape so the candidate set can be defined
 * from evidence rather than from the earlier sample of four vectors.
 */
import 'dotenv/config';
import { Pinecone } from '@pinecone-database/pinecone';
import { env } from '../../src/config/env';

(async () => {
  const pc = new Pinecone({ apiKey: env.PINECONE_API_KEY! });
  const index = pc.index(env.PINECONE_INDEX_NAME);

  const stats = await index.describeIndexStats();
  console.log(`index=${env.PINECONE_INDEX_NAME}  dim=${stats.dimension}  totalRecords=${stats.totalRecordCount}`);
  console.log('namespaces:');
  for (const [ns, v] of Object.entries(stats.namespaces || {})) {
    console.log(`   ${JSON.stringify(ns).padEnd(16)} ${(v as any).recordCount}`);
  }

  const NS = env.PINECONE_NAMESPACE;
  console.log(`\n=== ID shape in namespace ${JSON.stringify(NS)} ===`);
  const page = await index.namespace(NS).listPaginated({ limit: 100 });
  const ids = (page.vectors || []).map((v: any) => v.id);
  console.log(`first page: ${ids.length} ids, paginationToken=${page.pagination?.next ? 'yes' : 'none'}`);
  ids.slice(0, 10).forEach((id) => console.log(`   ${id}`));

  // Prefix histogram: how many distinct leading segments exist?
  const prefixes: Record<string, number> = {};
  ids.forEach((id) => {
    const p = id.split(/[-_#]/)[0];
    prefixes[p] = (prefixes[p] || 0) + 1;
  });
  console.log('\nleading-segment histogram (first page):');
  Object.entries(prefixes).sort((a, b) => b[1] - a[1]).forEach(([k, v]) => console.log(`   ${k.padEnd(24)} ${v}`));
  process.exit(0);
})().catch((e) => { console.error('FAILED:', e?.message || e); process.exit(1); });
