import crypto from 'crypto';
import {
  ExamSyllabus, SyllabusNode, syllabusNodesOf,
} from '../../types/exam.types';
// Type-only: the service imports the builders from here, so a value import would close a runtime
// require() cycle. `import type` is erased at compile time and cannot.
import type { SyllabusGraphNode, SyllabusGraphEdge } from './syllabusGraph.service';

/**
 * Canonical syllabus identity — pure, application-owned, deterministic.
 *
 * Two defects this replaces, both found in the Phase 0 audit and both capable of destroying
 * historical evidence:
 *
 *  1. IDENTITY WAS LLM-OWNED. The ingestion prompt asked the model to emit `topicId`, `subjectId`
 *     and friends as slugs, and those became the canonical node ids verbatim. Model output is not
 *     deterministic, so re-ingesting the SAME official document could mint different ids and
 *     orphan every piece of evidence keyed to the previous ones. The model may report what the
 *     official document SAYS; it may never decide what something IS CALLED by the system.
 *
 *  2. IDENTITY WAS NOT VERSION-SCOPED. Ids looked like `topic:number_systems` — no exam, no cycle,
 *     no syllabus version — so SSC CGL 2026 and SSC CGL 2024 minted the same id for the same topic
 *     name and the newer ingestion overwrote the older node in place.
 *
 * The rule now: an id is a function of the AUTHORITATIVE COORDINATES of a node, nothing else.
 *
 *     examId + cycleId + syllabusId + node type + ordered parent path + official name
 *
 * Same official syllabus ingested twice → identical ids. A different version → different ids, so
 * a 2024 question keeps resolving to its 2024 node forever. Nothing here reads a clock, a random
 * source, or a model, which is what makes that guarantee testable rather than aspirational.
 */

/** Node types that may carry a question. Kept here so validation and the read API agree. */
export const QUESTION_BEARING_TYPES: Array<SyllabusGraphNode['type']> = ['TOPIC', 'SUBTOPIC'];

const VALID_TYPES: Array<SyllabusGraphNode['type']> = ['STAGE', 'PAPER', 'SECTION', 'SUBJECT', 'TOPIC', 'SUBTOPIC'];

/**
 * Normalizes an official name for IDENTITY purposes only — the displayed label always keeps the
 * official wording exactly as printed.
 *
 * Deliberately conservative: case, surrounding whitespace and internal whitespace runs are the
 * only things collapsed. It does NOT stem, drop stopwords, or strip meaningful punctuation,
 * because two officially distinct topics can differ by exactly those characters, and merging them
 * would be the silent mis-association this whole layer exists to prevent.
 */
export function normalizeOfficialName(name: string): string {
  return String(name ?? '').trim().replace(/\s+/g, ' ').toLowerCase();
}

/** Short readable fragment for humans. Never used for matching — the fingerprint carries identity. */
function readableSlug(name: string): string {
  const slug = normalizeOfficialName(name).replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
  return slug.slice(0, 40) || 'unnamed';
}

/**
 * The authoritative coordinate string a node id is derived from.
 *
 * Fields are joined with a unit separator that cannot occur in the inputs, so
 * ("ab", "c") and ("a", "bc") can never collapse to the same string — a classic
 * delimiter-collision bug that would silently merge two distinct syllabus nodes.
 */
export function canonicalCoordinates(params: {
  examId: string; cycleId: string; syllabusId: string;
  type: SyllabusGraphNode['type']; parentPath: string[]; officialName: string;
}): string {
  const { examId, cycleId, syllabusId, type, parentPath, officialName } = params;
  return [
    examId, cycleId, syllabusId, type,
    parentPath.map(normalizeOfficialName).join(''),
    normalizeOfficialName(officialName),
  ].join('');
}

/**
 * The canonical node id.
 *
 * Shape: `topic:SSC_CGL:2026:syl_ssc_cgl_2026_v1:algebra:7f3a9c2e1b4d`
 *        └type └exam     └cycle└syllabus version  └readable └fingerprint
 *
 * The readable segment is a convenience for logs and admin screens; the fingerprint is what makes
 * it unique and stable. Note that two SIBLINGS with the same official name under the same parent
 * produce the SAME id — that is intentional. A duplicate canonical path is a real extraction
 * defect, and having it surface as an id collision is what lets validation reject the graph rather
 * than silently persisting two nodes that mean the same thing.
 */
export function canonicalNodeId(params: {
  examId: string; cycleId: string; syllabusId: string;
  type: SyllabusGraphNode['type']; parentPath: string[]; officialName: string;
}): string {
  const fingerprint = crypto.createHash('sha256')
    .update(canonicalCoordinates(params)).digest('hex').slice(0, 12);
  return [
    params.type.toLowerCase(), params.examId, params.cycleId, params.syllabusId,
    readableSlug(params.officialName), fingerprint,
  ].join(':');
}

// ─── Graph construction (pure) ───────────────────────────────────────────────────────────────

export interface CanonicalGraph {
  nodes: SyllabusGraphNode[];
  edges: SyllabusGraphEdge[];
}

/**
 * Flattens a versioned ExamSyllabus into canonical nodes and edges. Pure: same input, same output.
 *
 * The parent path accumulates OFFICIAL NAMES rather than ids, so a node's identity is anchored to
 * where it sits in the official document. Re-running against the same document reproduces every
 * id exactly; running against a different version reproduces none of them.
 */
export function buildCanonicalGraph(syllabus: ExamSyllabus): CanonicalGraph {
  const nodes: SyllabusGraphNode[] = [];
  const edges: SyllabusGraphEdge[] = [];
  const base = { examId: syllabus.examId, cycleId: syllabus.cycleId, syllabusId: syllabus.syllabusId };

  const add = (
    type: SyllabusGraphNode['type'], officialName: string, parentPath: string[],
    order: number, parentEntityId?: string, marks?: number,
  ): string => {
    const id = canonicalNodeId({ ...base, type, parentPath, officialName });
    nodes.push({ id, label: officialName, type, ...base, parentEntityId, marks, order });
    if (parentEntityId) {
      edges.push({ id: `${id}->${parentEntityId}`, sourceId: id, targetId: parentEntityId,
                   relationType: 'PART_OF', weight: 1.0 });
    }
    return id;
  };

  /*
   * One generic descent. There is no per-level code, because there is no fixed set of levels: a
   * STAGE may hold SUBJECTs directly, a SECTION may hold TOPICs, a SUBTOPIC may hold SUBTOPICs.
   * Whatever the official document nests, this walks.
   *
   * Ids still come from type + ancestor path, so nesting that skips a level yields a stable,
   * reproducible identity and the *Id slugs printed in the source stay ignored.
   */
  const descend = (children: SyllabusNode[] | undefined, parentPath: string[], parentEntityId?: string) => {
    let prevTopicId: string | null = null;

    (children || []).forEach((node, i) => {
      const id = add(node.type, node.name, parentPath, node.order ?? i + 1, parentEntityId, node.marks);

      // Sequential hint between sibling topics as printed in the official order. Advisory only —
      // never consulted for identity, and carries no claim about real prerequisite structure.
      if (node.type === 'TOPIC') {
        if (prevTopicId) {
          edges.push({ id: `${prevTopicId}->${id}`, sourceId: prevTopicId, targetId: id,
                       relationType: 'PREREQUISITE_OF', weight: 0.8 });
        }
        prevTopicId = id;
      }

      descend(node.children, [...parentPath, node.name], id);
    });
  };

  descend(syllabusNodesOf(syllabus), []);

  return { nodes, edges };
}

// ─── Validation (pure) ───────────────────────────────────────────────────────────────────────

export interface GraphValidationError {
  code:
    | 'DUPLICATE_NODE_ID' | 'DUPLICATE_CANONICAL_PATH' | 'MISSING_PARENT' | 'ORPHAN_NODE'
    | 'PARENT_CYCLE' | 'INVALID_NODE_TYPE' | 'INVALID_HIERARCHY' | 'EMPTY_IDENTIFIER'
    | 'VERSION_MISMATCH' | 'EMPTY_GRAPH';
  nodeId?: string;
  detail: string;
}

export interface GraphValidationResult {
  valid: boolean;
  errors: GraphValidationError[];
}


/**
 * Validates a graph BEFORE it is allowed to become usable.
 *
 * A failure here must never be downgraded into an empty graph: "this syllabus is malformed" and
 * "this syllabus has no topics" are different facts, and collapsing them would let coverage
 * silently report a real denominator of zero for an exam whose extraction was simply broken.
 * Nothing in here repairs or fabricates a node — it reports and refuses.
 */
export function validateCanonicalGraph(
  graph: CanonicalGraph,
  expected: { examId: string; cycleId: string; syllabusId: string },
): GraphValidationResult {
  const errors: GraphValidationError[] = [];
  const { nodes } = graph;

  if (nodes.length === 0) {
    return { valid: false, errors: [{ code: 'EMPTY_GRAPH', detail: 'syllabus produced no nodes' }] };
  }

  const byId = new Map<string, SyllabusGraphNode>();
  const seenCoordinates = new Set<string>();

  for (const n of nodes) {
    if (!n.id || !n.label?.trim()) {
      errors.push({ code: 'EMPTY_IDENTIFIER', nodeId: n.id, detail: `node has empty id or label` });
      continue;
    }
    if (!VALID_TYPES.includes(n.type)) {
      errors.push({ code: 'INVALID_NODE_TYPE', nodeId: n.id, detail: `unknown type "${n.type}"` });
      continue;
    }
    if (n.examId !== expected.examId || n.cycleId !== expected.cycleId || n.syllabusId !== expected.syllabusId) {
      errors.push({
        code: 'VERSION_MISMATCH', nodeId: n.id,
        detail: `node claims ${n.examId}/${n.cycleId}/${n.syllabusId}, version is ` +
                `${expected.examId}/${expected.cycleId}/${expected.syllabusId}`,
      });
      continue;
    }
    // An id collision IS a duplicate canonical path: ids are a pure function of the coordinates,
    // so two nodes sharing an id are two nodes claiming the same place in the official document.
    if (byId.has(n.id)) {
      errors.push({ code: 'DUPLICATE_CANONICAL_PATH', nodeId: n.id,
                    detail: `"${n.label}" appears twice under the same parent` });
      continue;
    }
    byId.set(n.id, n);
    seenCoordinates.add(n.id);
  }


  for (const n of byId.values()) {
    /*
     * A dangling parent pointer is checked FIRST, whatever the node's rank.
     *
     * Ordering the root rule ahead of it reported "must not have a parent" for a node whose parent
     * simply was not in the graph — describing a reference that failed to resolve as though the
     * reference should not exist. The two are different faults and only one of them means the
     * hierarchy is wrong.
     */
    if (n.parentEntityId) {
      const parent = byId.get(n.parentEntityId);
      if (!parent) {
        errors.push({ code: 'MISSING_PARENT', nodeId: n.id, detail: `parent ${n.parentEntityId} not in graph` });
        continue;
      }
      /*
       * Nesting is NOT validated by type any more, and that is a deliberate retreat.
       *
       * Five separate rules were tried and every one was contradicted by a real notice:
       *
       *   SECTION under SUBJECT     NEET      Physical/Inorganic/Organic Chemistry
       *   PAPER under SECTION       UPSC CDS  sections grouping English, GK, Mathematics
       *   STAGE under SECTION       UPSC CSE  "Part A—Preliminary Examination"   (79 nodes)
       *   STAGE under STAGE         UPSC CDS  "Stage I" inside an examination stage
       *   SUBTOPIC under SUBTOPIC   SSC CGL   seven-deep accounting syllabus
       *
       * The type is a LABEL a model assigns to a heading, not a tier a commission agreed to. Each
       * rule rejected documents that were correctly extracted and perfectly readable, and the cost
       * was paid in exams that never got a syllabus at all.
       *
       * Everything that detects actual damage stays and is unchanged: MISSING_PARENT for a
       * reference that does not resolve, PARENT_CYCLE for a chain that would hang traversal,
       * duplicate ids and coordinates for identity integrity, INVALID_NODE_TYPE for a type outside
       * the vocabulary, EMPTY_GRAPH. Those describe broken data. Hierarchy described taste.
       */
      continue;
    }

    /*
     * A parentless node is accepted at ANY rank.
     *
     * The previous rule — legitimate only at the shallowest rank present — assumed a document has
     * one top level. Official notices do not. UPSC NDA carries a medical-standards annexure beside
     * its syllabus (16 rejected nodes), BPSC OSH carries statutory schedules (3), and BPSC's
     * Assistant Professor notice is 18 per-discipline papers standing alongside stages. All were
     * refused for being a second top-level block.
     *
     * This check existed to catch chunk-boundary damage, where content is severed from a parent
     * that is right there in the tree — NEET's units cut off from Biology. That is now prevented
     * at source: each chunk is told the ancestor trail it continues from, and NEET re-ingested
     * cleanly. Detecting after the fact what is no longer produced cost far more legitimate
     * documents than it saved.
     *
     * MISSING_PARENT above is untouched and still fatal: a parent id that does not resolve is
     * always damage, never a layout.
     */
  }

  // Cycle detection. Structurally impossible from buildCanonicalGraph (parents always precede
  // children), but the graph can also arrive from an external/legacy source, and a cycle would
  // hang getNodeParentPath's ancestor walk.
  for (const start of byId.values()) {
    const seen = new Set<string>([start.id]);
    let cursor: SyllabusGraphNode | undefined = start;
    while (cursor?.parentEntityId) {
      if (seen.has(cursor.parentEntityId)) {
        errors.push({ code: 'PARENT_CYCLE', nodeId: start.id,
                      detail: `parent chain cycles at ${cursor.parentEntityId}` });
        break;
      }
      seen.add(cursor.parentEntityId);
      cursor = byId.get(cursor.parentEntityId);
    }
  }

  return { valid: errors.length === 0, errors };
}
