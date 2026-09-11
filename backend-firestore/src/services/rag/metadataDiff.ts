/**
 * Structural comparison of two metadata objects.
 *
 * Written for migration verification, where the failure mode to catch is a field that survived
 * the copy in name but not in substance — a number that became a string, an array that lost an
 * element, a `false` that became `undefined`. A shallow equality check reports those as equal,
 * or as wholly different, and neither is useful when the question is "what exactly changed".
 *
 * Deliberately strict about types: Pinecone metadata values are string | number | boolean |
 * string[], and JSON round-tripping can quietly turn one into another. `1` and `"1"` are a
 * difference worth seeing, because a filter matching on one will not match the other.
 */

export type DiffKind =
  | 'missing'        // present in source, absent in target
  | 'extra'          // present in target, absent in source
  | 'type'           // same key, different JS type
  | 'value'          // same key and type, different value
  | 'array_length'   // both arrays, different length
  | 'array_value'    // both arrays, same length, differing element
  | 'nullish';       // one side null/undefined, the other not

export interface FieldDiff {
  key: string;
  kind: DiffKind;
  source?: unknown;
  target?: unknown;
  detail?: string;
}

export interface MetadataComparison {
  equal: boolean;
  diffs: FieldDiff[];
  comparedKeys: number;
}

function typeOf(v: unknown): string {
  if (v === null) return 'null';
  if (Array.isArray(v)) return 'array';
  return typeof v;
}

/**
 * Compare source (Pinecone) against target (Qdrant payload).
 *
 * `ignoreKeys` exists for the adapter-owned keys — `pinecone_id` and `pinecone_namespace` are
 * added by the Qdrant backend and legitimately have no counterpart in the source, so reporting
 * them as `extra` on every single vector would bury the differences that matter.
 */
export function compareMetadata(
  source: Record<string, any> | null | undefined,
  target: Record<string, any> | null | undefined,
  ignoreKeys: string[] = []
): MetadataComparison {
  const src = source ?? {};
  const tgt = target ?? {};
  const ignore = new Set(ignoreKeys);
  const diffs: FieldDiff[] = [];

  const keys = new Set<string>([...Object.keys(src), ...Object.keys(tgt)].filter((k) => !ignore.has(k)));

  for (const key of keys) {
    const a = src[key];
    const b = tgt[key];

    const inA = Object.prototype.hasOwnProperty.call(src, key);
    const inB = Object.prototype.hasOwnProperty.call(tgt, key);

    if (inA && !inB) { diffs.push({ key, kind: 'missing', source: a }); continue; }
    if (!inA && inB) { diffs.push({ key, kind: 'extra', target: b }); continue; }

    // null vs undefined vs a value: separated from `type` because it is usually a different
    // bug — a field that was dropped on write rather than converted.
    const aNullish = a === null || a === undefined;
    const bNullish = b === null || b === undefined;
    if (aNullish !== bNullish) { diffs.push({ key, kind: 'nullish', source: a, target: b }); continue; }
    if (aNullish && bNullish) continue;

    const ta = typeOf(a);
    const tb = typeOf(b);
    if (ta !== tb) { diffs.push({ key, kind: 'type', source: a, target: b, detail: `${ta} -> ${tb}` }); continue; }

    if (ta === 'array') {
      const aa = a as unknown[];
      const bb = b as unknown[];
      if (aa.length !== bb.length) {
        diffs.push({ key, kind: 'array_length', source: aa, target: bb, detail: `${aa.length} -> ${bb.length}` });
        continue;
      }
      for (let i = 0; i < aa.length; i++) {
        if (aa[i] !== bb[i]) {
          diffs.push({ key, kind: 'array_value', source: aa[i], target: bb[i], detail: `index ${i}` });
        }
      }
      continue;
    }

    if (a !== b) diffs.push({ key, kind: 'value', source: a, target: b });
  }

  return { equal: diffs.length === 0, diffs, comparedKeys: keys.size };
}

/**
 * Component-wise vector comparison. Reports the worst case rather than a boolean.
 *
 * `identical` is raw bitwise equality and is NOT the right acceptance test for a Pinecone ->
 * Qdrant copy. Qdrant normalises vectors to unit length on write when a collection's distance is
 * Cosine — it turns cosine similarity into a dot product — so a vector that was not exactly unit
 * length comes back rescaled. Verified directly: input [2,0,…] into a Cosine collection is stored
 * as [1,0,…], while the same input into a Dot collection is stored unchanged.
 *
 * Cosine similarity is scale-invariant, so this changes no ranking and no score. The fields to
 * judge a migration by are therefore `cosineSimilarity` (must be 1 to within float error) and
 * `maxAbsDiffNormalised` (float32 epsilon, ~1e-7), with `maxAbsDiff` reported alongside so the
 * rescaling is visible rather than hidden.
 */
export interface VectorComparison {
  identical: boolean;
  dimensionMatch: boolean;
  sourceDimension: number;
  targetDimension: number;
  maxAbsDiff: number;
  differingComponents: number;
  firstDifferenceAt?: number;
  /** 1 means the two point in exactly the same direction — the property cosine search depends on. */
  cosineSimilarity: number;
  /** Worst component difference after scaling both to unit length. */
  maxAbsDiffNormalised: number;
  sourceNorm: number;
  targetNorm: number;
}

function l2(v: number[]): number {
  let s = 0;
  for (const x of v) s += x * x;
  return Math.sqrt(s);
}

export function compareVectors(source: number[] | undefined, target: number[] | undefined): VectorComparison {
  const a = source ?? [];
  const b = target ?? [];

  const result: VectorComparison = {
    identical: false,
    dimensionMatch: a.length === b.length,
    sourceDimension: a.length,
    targetDimension: b.length,
    maxAbsDiff: 0,
    differingComponents: 0,
    cosineSimilarity: 0,
    maxAbsDiffNormalised: 0,
    sourceNorm: l2(a),
    targetNorm: l2(b),
  };

  if (!result.dimensionMatch || a.length === 0) return result;

  let dot = 0;
  for (let i = 0; i < a.length; i++) {
    const d = Math.abs(a[i] - b[i]);
    if (d > 0) {
      result.differingComponents++;
      if (result.firstDifferenceAt === undefined) result.firstDifferenceAt = i;
      if (d > result.maxAbsDiff) result.maxAbsDiff = d;
    }
    dot += a[i] * b[i];
  }

  const na = result.sourceNorm || 1;
  const nb = result.targetNorm || 1;
  result.cosineSimilarity = dot / (na * nb);

  for (let i = 0; i < a.length; i++) {
    const d = Math.abs(a[i] / na - b[i] / nb);
    if (d > result.maxAbsDiffNormalised) result.maxAbsDiffNormalised = d;
  }

  result.identical = result.differingComponents === 0;
  return result;
}
