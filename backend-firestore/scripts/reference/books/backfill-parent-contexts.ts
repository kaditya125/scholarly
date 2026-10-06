/**
 * Backfill parent contexts for reference books that already have child vectors but no parents.
 *
 *   npx tsx scripts/reference/books/backfill-parent-contexts.ts                 # dry run, every eligible book
 *   npx tsx scripts/reference/books/backfill-parent-contexts.ts --book jd_lee_inorganic
 *   npx tsx scripts/reference/books/backfill-parent-contexts.ts --book jd_lee_inorganic --apply
 *
 * For each book:
 *   existing children (Qdrant scroll, no vectors)
 *     → groupExistingChildren()            (src/services/rag/parentChunking.ts)
 *     → parent_documents  (Firestore, merge by deterministic id)
 *     → set_payload { parentDocId } on the existing points (no re-embed, no re-ingest, no new points)
 *     → verify: points with parentDocId == children; parent docs written == parents
 *
 * Eligible: a canonical book (referenceBookRegistry) with ZERO children carrying parentDocId. A book
 * with SOME parented children (H.C. Verma vol 1/2) holds two ingestions of the same pages; linking
 * the older copy would create duplicate parents — those are reported, not touched.
 *
 * Writes only with --apply. Idempotent: ids and assignments are a pure function of the data.
 * Needs QDRANT_URL/QDRANT_API_KEY (e.g. an SSH tunnel to the VM's 127.0.0.1:6333) and Firestore.
 */
import { bootstrapForProbe } from '../../../src/core/di/probeBootstrap';
bootstrapForProbe();

import { QdrantClient } from '@qdrant/js-client-rest';
import { db } from '../../../src/config/firebase';
import { env } from '../../../src/config/env';
import { QDRANT_COLLECTION } from '../../../src/services/rag/qdrant.service';
import { PINECONE_NAMESPACE_KEY, PINECONE_ID_KEY } from '../../../src/services/rag/qdrantFilter';
import { REFERENCE_BOOK_NAMESPACE } from '../../../src/services/rag/namespaces';
import { PARENT_DOCS_COLLECTION } from '../../../src/services/rag/parentDocument.service';
import { groupExistingChildren, ExistingChild } from '../../../src/services/rag/parentChunking';
import { CANONICAL_REFERENCE_BOOKS } from '../../../src/services/rag/referenceBookRegistry';
import { REF_SOURCE_COLLECTION } from './contract';

/** Books whose chapter/section payload came from a structural parser (03-structure-and-chunk.ts). */
const TRUSTED_HEADING_BOOKS = new Set(['lucent_gk', 'lucent_science', 'lucent_english', 'schand_quant', 'schand_reasoning']);

const args = process.argv.slice(2);
const APPLY = args.includes('--apply');
const ONLY = args.flatMap((a, i) => (a === '--book' ? [args[i + 1]] : []));
/**
 * --mark-superseded: for a book holding BOTH a parent-linked ingestion and an older un-parented
 * copy of the same pages (H.C. Verma vol 1/2), flag the un-parented points `superseded: true`.
 * Retrieval excludes flagged points (buildReferenceFilter). Nothing is deleted; reverse with
 * Qdrant delete_payload { keys: ['superseded'] }. Requires --book; writes only with --apply.
 */
const MARK_SUPERSEDED = args.includes('--mark-superseded');

const client = new QdrantClient({ url: env.QDRANT_URL, apiKey: env.QDRANT_API_KEY || undefined, checkCompatibility: false });
const nsCond = { key: PINECONE_NAMESPACE_KEY, match: { value: REFERENCE_BOOK_NAMESPACE } };

async function readChildren(book: string) {
  const points: Array<{ pointId: string | number; child: ExistingChild; hasParent: boolean; parentDocId?: string }> = [];
  let offset: any;
  do {
    const res: any = await client.scroll(QDRANT_COLLECTION, {
      filter: { must: [nsCond, { key: 'book', match: { value: book } }] } as any,
      limit: 1000,
      offset,
      with_payload: [PINECONE_ID_KEY, 'text', 'page_number', 'page_start', 'chapter', 'section', 'parentDocId', 'superseded'],
      with_vector: false,
    });
    for (const p of res?.points ?? []) {
      const pl = p.payload ?? {};
      points.push({
        pointId: p.id,
        hasParent: !!pl.parentDocId,
        parentDocId: pl.parentDocId ? String(pl.parentDocId) : undefined,
        child: {
          id: String(pl[PINECONE_ID_KEY] ?? p.id),
          pageNumber: Number(pl.page_number ?? pl.page_start ?? 0),
          text: String(pl.text ?? ''),
          chapter: pl.chapter ? String(pl.chapter) : undefined,
          section: pl.section ? String(pl.section) : undefined,
        },
      });
    }
    offset = res?.next_page_offset;
  } while (offset);
  return points;
}

async function backfillBook(book: string) {
  const points = await readChildren(book);
  // Links written by THIS script (parent_<book>_bfNNNN) mean an interrupted run to resume — the
  // grouping is deterministic, so re-applying rewrites identical assignments. Any other parent id
  // means a separate parent-linked ingestion (mixed book), which is never touched here.
  const ownLink = new RegExp(`^parent_${book}_bf\\d{4}$`);
  const parented = points.filter((p) => p.hasParent && !ownLink.test(p.parentDocId ?? '')).length;
  const resumed = points.filter((p) => p.hasParent && ownLink.test(p.parentDocId ?? '')).length;
  if (resumed && !parented) console.log(`· ${book}: resuming an interrupted backfill (${resumed}/${points.length} already linked)`);
  if (!points.length) return console.log(`· ${book}: no vectors — skipped`);
  if (parented && MARK_SUPERSEDED) {
    const old = points.filter((p) => !p.hasParent);
    console.log(`· ${book}: ${old.length} un-parented points beside ${parented} parent-linked ones → mark superseded`);
    if (!APPLY || !old.length) return;
    for (let i = 0; i < old.length; i += 500) {
      await client.setPayload(QDRANT_COLLECTION, { payload: { superseded: true }, points: old.slice(i, i + 500).map((p) => p.pointId) as any, wait: true });
    }
    const flagged: any = await client.count(QDRANT_COLLECTION, {
      filter: { must: [nsCond, { key: 'book', match: { value: book } }, { key: 'superseded', match: { value: true } }] } as any, exact: true,
    });
    const ok = flagged.count === old.length;
    console.log(`  ${ok ? '✅' : '❌'} flagged ${flagged.count}/${old.length}`);
    if (!ok) process.exitCode = 1;
    return;
  }
  if (parented) return console.log(`· ${book}: ${parented}/${points.length} already parented — skipped (mixed ingestions; see BOOK_ALIASES/report)`);

  const source = (await db.collection(REF_SOURCE_COLLECTION).doc(book).get()).data() ?? {};
  const trustHeadings = TRUSTED_HEADING_BOOKS.has(book);
  const { parents, assignment } = groupExistingChildren(points.map((p) => p.child), {
    bookKey: book,
    bookTitle: String(source.book_title ?? source.title ?? book),
    trustHeadings,
    // Page-window books store one ~600–760-word page per vector; a 1,200 cap closed most parents
    // after a single page (parent == child, no added context). 1,500 / 900 yields two-page parents
    // in the intended 1,000–1,500-word range. Heading books keep real-section boundaries at 1,200.
    ...(trustHeadings ? {} : { parentWords: 1500, minParentWords: 900 }),
    metadata: { subject: source.subject, exam_relevance: source.exam_relevance ?? source.examRelevance },
  });
  const words = parents.map((p) => p.fullText.split(/\s+/).length);
  const avg = Math.round(words.reduce((a, b) => a + b, 0) / Math.max(1, words.length));
  console.log(`· ${book}: children=${points.length} parents=${parents.length} avgParentWords=${avg} ` +
    `min=${Math.min(...words)} max=${Math.max(...words)} boundaries=${trustHeadings ? 'heading+size' : 'page-window'}`);
  if (!APPLY) return;

  for (let i = 0; i < parents.length; i += 400) {
    const batch = db.batch();
    for (const p of parents.slice(i, i + 400)) {
      batch.set(db.collection(PARENT_DOCS_COLLECTION).doc(p.id), { ...p, createdAt: Date.now(), updatedAt: Date.now() }, { merge: true });
    }
    await batch.commit();
  }

  const pointsByParent = new Map<string, Array<string | number>>();
  for (const p of points) {
    const parentId = assignment.get(p.child.id)!;
    pointsByParent.set(parentId, [...(pointsByParent.get(parentId) ?? []), p.pointId]);
  }
  for (const [parentDocId, ids] of pointsByParent) {
    await client.setPayload(QDRANT_COLLECTION, { payload: { parentDocId }, points: ids as any, wait: true });
  }

  // Verify against the stores, not against what we meant to write.
  const linked: any = await client.count(QDRANT_COLLECTION, {
    filter: { must: [nsCond, { key: 'book', match: { value: book } }], must_not: [{ is_empty: { key: 'parentDocId' } }] } as any,
    exact: true,
  });
  const parentDocs = await db.collection(PARENT_DOCS_COLLECTION).where('book', '==', book).count().get();
  const ok = linked.count === points.length && parentDocs.data().count >= parents.length;
  console.log(`  ${ok ? '✅' : '❌'} linked ${linked.count}/${points.length} points; parent_documents for book: ${parentDocs.data().count} (expected ≥ ${parents.length})`);
  if (!ok) process.exitCode = 1;
}

async function main() {
  const books = ONLY.length ? ONLY : [...CANONICAL_REFERENCE_BOOKS];
  for (const b of books) {
    if (!(CANONICAL_REFERENCE_BOOKS as readonly string[]).includes(b)) {
      console.log(`· ${b}: not a canonical book (see referenceBookRegistry) — skipped`);
      continue;
    }
    await backfillBook(b);
  }
  console.log(APPLY ? '\nApplied.' : '\nDry run only — nothing written. Re-run with --apply.');
  process.exit(process.exitCode ?? 0);
}

main().catch((e) => { console.error(e); process.exit(1); });
