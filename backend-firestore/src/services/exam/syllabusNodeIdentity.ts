import { syllabusGraphService, type SyllabusGraphNode } from './syllabusGraph.service';

/**
 * The single contract for attaching a learning object to a syllabus node.
 *
 * Stage 1 of the learning graph. Every learning object that wants to say "this is about that part
 * of the syllabus" resolves through here, so there is one definition of what a valid syllabus
 * identity is rather than one per consumer.
 *
 * ── This does not replace syllabusGraphService ──────────────────────────────────────────────
 * The graph service already reads nodes, validates a node for a question and walks ancestry, and
 * quizGenerator already depends on it. This module wraps that with a structured result contract
 * and a zero-read fast path; it does not fork the identity system. Anything needing raw graph
 * access should still call the graph service directly.
 *
 * ── Most validation needs no database read at all ───────────────────────────────────────────
 * A canonical id is `type:examId:cycleId:syllabusId:slug:fingerprint`, produced by
 * canonicalNodeId(). The exam, cycle, syllabus version and node type are therefore CARRIED IN THE
 * ID. Malformed input, a wrong exam and a wrong version are all decidable locally, which matters
 * when mapping thousands of objects: only genuine existence checks reach Firestore, and those are
 * batched per exam rather than per object.
 *
 * ── The encoding trap ───────────────────────────────────────────────────────────────────────
 * Nodes are STORED under `nodeDocId(id) = id.replace(/[:/]/g, '_')`, because a Firestore document
 * id cannot contain a slash. The canonical id lives in the document's `id` FIELD. Comparing a
 * stored identity against document ids therefore reports every correct mapping as broken — the
 * Stage 1 audit did precisely that and declared 44 valid PYQ mappings invalid before the mistake
 * was caught. Resolution here always goes through the graph service, which reads the field.
 */

/** Outcome of a validation. Structured so callers branch on a code rather than parse a message. */
export type SyllabusIdentityCode =
  | 'VALID'
  | 'MISSING_NODE_ID'      // nothing supplied — legitimate for optional relationships
  | 'MALFORMED_NODE_ID'    // not a canonical id at all
  | 'WRONG_EXAM'           // well-formed, but belongs to a different exam
  | 'UNKNOWN_NODE_TYPE'    // shape is right, the type segment is not one we recognise
  | 'NODE_NOT_FOUND'       // well-formed and correctly scoped, but no such node exists
  | 'NODE_TYPE_NOT_ALLOWED'; // exists, but not a type this caller accepts

export interface SyllabusIdentityResult {
  code: SyllabusIdentityCode;
  valid: boolean;
  node?: SyllabusGraphNode | null;
  /** Parsed coordinates, present whenever the id was at least well-formed. */
  parsed?: ParsedNodeId;
  detail?: string;
}

export interface ParsedNodeId {
  type: string;
  examId: string;
  cycleId: string;
  syllabusId: string;
  slug: string;
  fingerprint: string;
}

const KNOWN_TYPES = new Set(['stage', 'paper', 'section', 'subject', 'topic', 'subtopic']);

/** Types a question or attempt may legitimately point at. Anything coarser is not a question topic. */
export const QUESTION_NODE_TYPES: Array<SyllabusGraphNode['type']> = ['TOPIC', 'SUBTOPIC'];

/**
 * Split a canonical id into its coordinates. Pure and read-free.
 *
 * The slug may itself contain colons in principle, so the id is split from both ends: the first
 * four segments and the last are fixed, and whatever remains between them is the slug.
 */
export function parseSyllabusNodeId(nodeId: string): ParsedNodeId | null {
  if (typeof nodeId !== 'string' || !nodeId.trim()) return null;
  const parts = nodeId.split(':');
  if (parts.length < 6) return null;
  const [type, examId, cycleId, syllabusId] = parts;
  const fingerprint = parts[parts.length - 1];
  const slug = parts.slice(4, parts.length - 1).join(':');
  if (!type || !examId || !cycleId || !syllabusId || !slug || !fingerprint) return null;
  // The fingerprint is a hex slice; anything else means this is not one of our ids.
  if (!/^[0-9a-f]{6,}$/i.test(fingerprint)) return null;
  return { type, examId, cycleId, syllabusId, slug, fingerprint };
}

/**
 * Is this identity usable for this exam?
 *
 * `examId` is required: an identity is only meaningful relative to the exam that owns it, and
 * validating without one is how a JEE node ends up attached to an SSC attempt. Cross-exam
 * contamination cannot occur silently because the exam is inside the id — a mismatch is detected
 * before any read happens.
 */
export async function validateSyllabusNodeId(params: {
  examId: string;
  syllabusNodeId?: string | null;
  allowedTypes?: Array<SyllabusGraphNode['type']>;
  /** Skip the existence read. Only for callers that have already resolved the node. */
  shallow?: boolean;
}): Promise<SyllabusIdentityResult> {
  const { examId, syllabusNodeId, allowedTypes = QUESTION_NODE_TYPES, shallow } = params;

  // Absence is not an error. Plenty of learning objects legitimately have no mapping yet, and
  // treating that as a failure pushes callers into inventing one.
  if (!syllabusNodeId) return { code: 'MISSING_NODE_ID', valid: false };

  const parsed = parseSyllabusNodeId(syllabusNodeId);
  if (!parsed) {
    return { code: 'MALFORMED_NODE_ID', valid: false, detail: 'not a canonical syllabus node id' };
  }
  if (!KNOWN_TYPES.has(parsed.type.toLowerCase())) {
    return { code: 'UNKNOWN_NODE_TYPE', valid: false, parsed, detail: parsed.type };
  }

  const wantExam = examId.trim().toUpperCase().replace(/[\s_-]+/g, '_');
  if (parsed.examId.toUpperCase() !== wantExam) {
    return {
      code: 'WRONG_EXAM', valid: false, parsed,
      detail: `id belongs to ${parsed.examId}, caller claimed ${wantExam}`,
    };
  }

  if (shallow) return { code: 'VALID', valid: true, parsed };

  const check = await syllabusGraphService.validateNodeForQuestion({
    examId: wantExam,
    nodeId: syllabusNodeId,
    cycleId: parsed.cycleId,
    syllabusId: parsed.syllabusId,
    allowedTypes,
  });

  if (!check.node) return { code: 'NODE_NOT_FOUND', valid: false, parsed, detail: check.reason };
  if (!check.valid) {
    return { code: 'NODE_TYPE_NOT_ALLOWED', valid: false, parsed, node: check.node, detail: check.reason };
  }
  return { code: 'VALID', valid: true, parsed, node: check.node };
}

/** Resolve to the node itself, or null. Convenience over the validator for read paths. */
export async function resolveSyllabusNode(
  examId: string, syllabusNodeId: string,
): Promise<SyllabusGraphNode | null> {
  const r = await validateSyllabusNodeId({
    examId, syllabusNodeId,
    allowedTypes: ['STAGE', 'PAPER', 'SECTION', 'SUBJECT', 'TOPIC', 'SUBTOPIC'],
  });
  return r.valid ? r.node ?? null : null;
}

/**
 * Validate many identities without an N+1 read pattern.
 *
 * Everything decidable from the id itself is decided first, so a batch of ten thousand objects
 * costs at most one node read per (exam, version) actually referenced — not one per object. That
 * is the difference between a migration that runs in seconds and one that melts a read quota.
 */
export async function validateSyllabusNodeIdsBatch(
  items: Array<{ examId: string; syllabusNodeId?: string | null }>,
  allowedTypes: Array<SyllabusGraphNode['type']> = QUESTION_NODE_TYPES,
): Promise<SyllabusIdentityResult[]> {
  const results = new Array<SyllabusIdentityResult>(items.length);
  /** (examId, cycleId, syllabusId) -> set of canonical ids that exist there. Loaded at most once. */
  const cache = new Map<string, Set<string>>();
  const typeOf = new Map<string, SyllabusGraphNode['type']>();

  const needed = new Map<string, { examId: string; cycleId: string; syllabusId: string }>();
  const parsedAt: Array<ParsedNodeId | null> = [];

  // Pass 1 — decide everything that needs no read, and note which versions must be loaded.
  for (let i = 0; i < items.length; i++) {
    const { examId, syllabusNodeId } = items[i];
    if (!syllabusNodeId) { results[i] = { code: 'MISSING_NODE_ID', valid: false }; parsedAt.push(null); continue; }
    const parsed = parseSyllabusNodeId(syllabusNodeId);
    parsedAt.push(parsed);
    if (!parsed) { results[i] = { code: 'MALFORMED_NODE_ID', valid: false }; continue; }
    if (!KNOWN_TYPES.has(parsed.type.toLowerCase())) {
      results[i] = { code: 'UNKNOWN_NODE_TYPE', valid: false, parsed }; continue;
    }
    const wantExam = examId.trim().toUpperCase().replace(/[\s_-]+/g, '_');
    if (parsed.examId.toUpperCase() !== wantExam) {
      results[i] = { code: 'WRONG_EXAM', valid: false, parsed }; continue;
    }
    const key = `${wantExam}|${parsed.cycleId}|${parsed.syllabusId}`;
    if (!cache.has(key)) needed.set(key, { examId: wantExam, cycleId: parsed.cycleId, syllabusId: parsed.syllabusId });
  }

  // Pass 2 — one read per distinct version referenced.
  for (const [key, scope] of needed) {
    const nodes = await syllabusGraphService.getSyllabusNodes(scope);
    cache.set(key, new Set(nodes.map((n) => n.id)));
    nodes.forEach((n) => typeOf.set(n.id, n.type));
  }

  // Pass 3 — existence and type, entirely from memory.
  for (let i = 0; i < items.length; i++) {
    if (results[i]) continue;
    const parsed = parsedAt[i]!;
    const wantExam = items[i].examId.trim().toUpperCase().replace(/[\s_-]+/g, '_');
    const key = `${wantExam}|${parsed.cycleId}|${parsed.syllabusId}`;
    const id = items[i].syllabusNodeId!;
    if (!cache.get(key)?.has(id)) { results[i] = { code: 'NODE_NOT_FOUND', valid: false, parsed }; continue; }
    const t = typeOf.get(id);
    if (t && !allowedTypes.includes(t)) {
      results[i] = { code: 'NODE_TYPE_NOT_ALLOWED', valid: false, parsed, detail: t }; continue;
    }
    results[i] = { code: 'VALID', valid: true, parsed };
  }
  return results;
}

/** Ancestors as NODES, nearest-parent-last. `getNodeParentPath` returns labels; this returns identity. */
export async function getSyllabusAncestors(
  examId: string, syllabusNodeId: string,
): Promise<SyllabusGraphNode[]> {
  const parsed = parseSyllabusNodeId(syllabusNodeId);
  if (!parsed) return [];
  const nodes = await syllabusGraphService.getSyllabusNodes({
    examId, cycleId: parsed.cycleId, syllabusId: parsed.syllabusId,
  });
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const out: SyllabusGraphNode[] = [];
  const seen = new Set<string>();
  let cursor = byId.get(syllabusNodeId);
  while (cursor?.parentEntityId && !seen.has(cursor.id)) {
    seen.add(cursor.id);                       // a malformed parent cycle must not hang the walk
    const parent = byId.get(cursor.parentEntityId);
    if (!parent) break;
    out.unshift(parent);
    cursor = parent;
  }
  return out;
}

/** Direct children of a node. */
export async function getSyllabusChildren(
  examId: string, syllabusNodeId: string,
): Promise<SyllabusGraphNode[]> {
  const parsed = parseSyllabusNodeId(syllabusNodeId);
  if (!parsed) return [];
  const nodes = await syllabusGraphService.getSyllabusNodes({
    examId, cycleId: parsed.cycleId, syllabusId: parsed.syllabusId,
  });
  return nodes.filter((n) => n.parentEntityId === syllabusNodeId);
}
