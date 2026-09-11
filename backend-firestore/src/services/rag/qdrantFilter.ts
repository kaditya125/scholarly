/**
 * Pinecone metadata filters -> Qdrant filters, and Pinecone ids -> Qdrant point ids.
 *
 * Split out from qdrant.service.ts so both can be exercised without a running Qdrant. These are
 * the two pieces of pure logic where a mistake is silent: a filter that translates to something
 * *looser* than the original still returns results, just the wrong ones, and an id mapping that
 * is not deterministic turns a re-run into a duplicate import.
 */
import { v5 as uuidv5 } from 'uuid';

/**
 * Fixed application namespace for id derivation. Derived from a URL rather than written as a
 * magic literal so its provenance is readable, but the VALUE is what matters and it must never
 * change: every Qdrant point id in existence is a function of it.
 */
export const NS_SADHYA = uuidv5('sadhya.app/vector-store', uuidv5.URL);

/** Payload keys the adapter owns. Application metadata must never use these names. */
export const PINECONE_ID_KEY = 'pinecone_id';
export const PINECONE_NAMESPACE_KEY = 'pinecone_namespace';

/**
 * Qdrant point ids must be an unsigned integer or a UUID; `abc123_chunk_0` is neither.
 *
 * The namespace is part of the hashed string, not just the payload, because Pinecone namespaces
 * are separate keyspaces — the same id may legitimately exist in both `production` and
 * `reference_books` as different vectors. Hashing the id alone would collapse them onto one
 * point and silently lose whichever was written first.
 */
export function toQdrantId(namespace: string, pineconeId: string): string {
  return uuidv5(`${namespace}:${pineconeId}`, NS_SADHYA);
}

/** Comparison operators the application actually uses, counted across the repo. */
type PineconeOperator = '$in' | '$nin' | '$ne' | '$eq' | '$gt' | '$gte' | '$lt' | '$lte';

const RANGE_OPS: Record<string, 'gt' | 'gte' | 'lt' | 'lte'> = {
  $gt: 'gt', $gte: 'gte', $lt: 'lt', $lte: 'lte',
};

export interface QdrantFilter {
  must?: any[];
  must_not?: any[];
}

/**
 * Translate one Pinecone filter object into a Qdrant filter.
 *
 * Deliberately strict: an operator this does not understand throws rather than being dropped.
 * Silently ignoring `$ne` would widen a filter that exists to EXCLUDE something — in this
 * codebase, `corpusBucket: { $ne: 'PRACTICE_MOCK' }` is what keeps practice mocks out of
 * official-PYQ retrieval, and quietly discarding it would mix fabricated questions into results
 * labelled authentic. Failing loudly is the only safe behaviour.
 */
export function toQdrantFilter(
  pineconeFilter: Record<string, any> | undefined,
  namespace: string | undefined
): QdrantFilter {
  const must: any[] = [];
  const must_not: any[] = [];

  // The namespace condition is not optional and is applied first. Pinecone namespaces are hard
  // partitions; in a single Qdrant collection this filter IS the partition.
  if (namespace) {
    must.push({ key: PINECONE_NAMESPACE_KEY, match: { value: namespace } });
  }

  for (const [key, raw] of Object.entries(pineconeFilter ?? {})) {
    if (raw === undefined) continue;

    // Scalar, boolean or direct value -> exact match.
    if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
      if (Array.isArray(raw)) {
        // A bare array in Pinecone means "metadata array contains" semantics.
        must.push({ key, match: { any: raw } });
      } else {
        must.push({ key, match: { value: raw } });
      }
      continue;
    }

    const operators = Object.keys(raw) as PineconeOperator[];
    if (operators.length === 0) continue;

    for (const op of operators) {
      const value = (raw as any)[op];

      if (op === '$eq') { must.push({ key, match: { value } }); continue; }
      if (op === '$ne') { must_not.push({ key, match: { value } }); continue; }
      if (op === '$in') { must.push({ key, match: { any: value } }); continue; }
      if (op === '$nin') { must_not.push({ key, match: { any: value } }); continue; }

      const rangeOp = RANGE_OPS[op];
      if (rangeOp) {
        // Fold repeated range operators on the same key into one condition, so
        // { $gte: 0, $lt: 10 } becomes a single range rather than two competing ones.
        const existing = must.find((c) => c.key === key && c.range);
        if (existing) existing.range[rangeOp] = value;
        else must.push({ key, range: { [rangeOp]: value } });
        continue;
      }

      throw new Error(
        `[qdrantFilter] unsupported Pinecone operator "${op}" on key "${key}". ` +
        `Translating it away would widen the filter; add an explicit mapping instead.`
      );
    }
  }

  const filter: QdrantFilter = {};
  if (must.length) filter.must = must;
  if (must_not.length) filter.must_not = must_not;
  return filter;
}

/**
 * Payload keys worth indexing. Qdrant can filter without an index, but does so by scanning, and
 * these are the keys every retrieval path constrains on.
 */
export const INDEXED_PAYLOAD_KEYS: { key: string; schema: 'keyword' | 'integer' | 'bool' }[] = [
  { key: PINECONE_NAMESPACE_KEY, schema: 'keyword' },
  { key: PINECONE_ID_KEY, schema: 'keyword' },
  { key: 'notebookId', schema: 'keyword' },
  { key: 'sourceId', schema: 'keyword' },
  { key: 'userId', schema: 'keyword' },
  { key: 'examId', schema: 'keyword' },
  { key: 'documentType', schema: 'keyword' },
  { key: 'corpusBucket', schema: 'keyword' },
  { key: 'content_type', schema: 'keyword' },
  { key: 'subject', schema: 'keyword' },
  { key: 'book', schema: 'keyword' },
  { key: 'chunkIndex', schema: 'integer' },
  { key: 'public', schema: 'bool' },
  { key: 'is_pyq', schema: 'bool' },
  { key: 'is_generated', schema: 'bool' },
  { key: 'is_mock', schema: 'bool' },
];
