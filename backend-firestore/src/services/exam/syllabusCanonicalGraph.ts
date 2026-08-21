import crypto from 'crypto';
import { ExamSyllabus } from '../../types/exam.types';
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

const VALID_TYPES: Array<SyllabusGraphNode['type']> = ['STAGE', 'PAPER', 'SUBJECT', 'TOPIC', 'SUBTOPIC'];

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

  for (const stage of syllabus.stages || []) {
    const stagePath: string[] = [];
    const stageId = add('STAGE', stage.name, stagePath, stage.order);

    for (const paper of stage.papers || []) {
      const paperPath = [stage.name];
      const paperId = add('PAPER', paper.name, paperPath, paper.order, stageId);

      for (const subject of paper.subjects || []) {
        const subjectPath = [stage.name, paper.name];
        const subjectId = add('SUBJECT', subject.name, subjectPath, subject.order, paperId, subject.marks);

        let prevTopicId: string | null = null;
        for (const topic of subject.topics || []) {
          const topicPath = [stage.name, paper.name, subject.name];
          const topicId = add('TOPIC', topic.name, topicPath, topic.order, subjectId);

          // Sequential hint between topics as printed in the official order. Advisory only — it is
          // never consulted for identity, and carries no claim about real prerequisite structure.
          if (prevTopicId) {
            edges.push({ id: `${prevTopicId}->${topicId}`, sourceId: prevTopicId, targetId: topicId,
                         relationType: 'PREREQUISITE_OF', weight: 0.8 });
          }
          prevTopicId = topicId;

          for (const subtopic of topic.subtopics || []) {
            const subtopicPath = [stage.name, paper.name, subject.name, topic.name];
            add('SUBTOPIC', subtopic.name, subtopicPath, subtopic.order, topicId);
          }
        }
      }
    }
  }

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

/** Which parent type each node type must have. A TOPIC hanging off a STAGE is malformed. */
const REQUIRED_PARENT: Record<SyllabusGraphNode['type'], SyllabusGraphNode['type'] | null> = {
  STAGE: null, PAPER: 'STAGE', SUBJECT: 'PAPER', TOPIC: 'SUBJECT', SUBTOPIC: 'TOPIC',
};

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
    const requiredParent = REQUIRED_PARENT[n.type];

    if (requiredParent === null) {
      if (n.parentEntityId) {
        errors.push({ code: 'INVALID_HIERARCHY', nodeId: n.id, detail: `STAGE must not have a parent` });
      }
      continue;
    }
    if (!n.parentEntityId) {
      errors.push({ code: 'ORPHAN_NODE', nodeId: n.id, detail: `${n.type} has no parent` });
      continue;
    }
    const parent = byId.get(n.parentEntityId);
    if (!parent) {
      errors.push({ code: 'MISSING_PARENT', nodeId: n.id, detail: `parent ${n.parentEntityId} not in graph` });
      continue;
    }
    if (parent.type !== requiredParent) {
      errors.push({ code: 'INVALID_HIERARCHY', nodeId: n.id,
                    detail: `${n.type} parent must be ${requiredParent}, found ${parent.type}` });
    }
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
