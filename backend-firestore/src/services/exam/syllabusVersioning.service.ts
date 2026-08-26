import { db } from '../../config/firebase';
import { syllabusGraphService, type SyllabusGraphNode } from './syllabusGraph.service';
import { parseSyllabusNodeId } from './syllabusNodeIdentity';
import { masteryKeyForNode } from '../learning/nodeMastery.service';
import { logger } from '../../utils/logger';

/**
 * Stage 6 — syllabus versions, diffing and student impact.
 *
 * Deterministic and metadata-only: no embeddings, no vector store, no language model. Whether two
 * syllabus nodes are "the same" is a question about identity, and identity is not something to ask
 * a model about.
 *
 * ── The central constraint, discovered by reading the id construction ───────────────────────
 * A canonical id is `type:examId:cycleId:syllabusId:slug:fingerprint`, and the fingerprint hashes
 * canonicalCoordinates — which INCLUDES the syllabusId. So between two versions of one exam,
 * every single node id changes: different syllabusId segment, and a different fingerprint.
 *
 * That is by design. Stage 1 scoped identity to a version precisely so a 2024 id and a 2026 id for
 * the same topic name are different strings, which is what keeps historical mastery interpretable.
 *
 * The consequence for diffing is unavoidable: a raw set difference reports 100% added and 100%
 * removed. That answer is literally correct — every node does have a new identity — and on its own
 * it is useless. So this module reports TWO layers and never confuses them:
 *
 *   LAYER 1 — AUTHORITATIVE. added / removed / unchanged on raw canonical ids. Set arithmetic.
 *   LAYER 2 — CORRELATION. A version-independent key (type + exam + normalised ancestor path +
 *             normalised official name) that suggests which removed node CORRESPONDS to which
 *             added one. Deterministic, computed the same way canonicalCoordinates is minus the
 *             version segments — not fuzzy, not similarity, not a model.
 *
 * Layer 2 is a REPORT, never an identity. Nothing here transfers mastery, rewrites a node id, or
 * silently treats a correlated pair as the same node. §6 is explicit: absent deterministic
 * lineage, the honest answer is REMOVED + ADDED, and that is what layer 1 says.
 */

/** Normalisation mirroring the graph's own, so correlation keys agree with how ids were built. */
const normalizeName = (s: string) => (s || '').toLowerCase().replace(/[^a-z0-9]+/g, '');

export interface SyllabusVersionInfo {
  examId: string;
  syllabusId: string;
  version: string;
  cycleId: string;
  status: string;
  /** From the source document itself. Never invented — absent stays absent. */
  sourceDocumentUrl?: string;
  sourceDocumentHash?: string;
  sourceDocumentTitle?: string;
  retrievedAt?: number;
  publishedAt?: number;
  updatedAt?: number;
  nodeCount?: number;
  hasGraph: boolean;
}

export type NodeChangeType = 'UNCHANGED' | 'METADATA_CHANGED';

export interface ChangedNode {
  nodeId: string;
  label: string;
  changeType: NodeChangeType;
  changedFields: string[];
  before: Record<string, unknown>;
  after: Record<string, unknown>;
}

export interface CorrelatedPair {
  removedNodeId: string;
  addedNodeId: string;
  label: string;
  /** Always 'CORRELATION_KEY'. Named so no caller can mistake this for proven lineage. */
  basis: 'CORRELATION_KEY';
  labelChanged: boolean;
}

export interface SyllabusDiff {
  examId: string;
  from: { syllabusId: string; version?: string } | null;
  to: { syllabusId: string; version?: string };
  added: Array<{ nodeId: string; label: string; type: string }>;
  removed: Array<{ nodeId: string; label: string; type: string }>;
  unchanged: string[];
  changed: ChangedNode[];
  /** Layer 2. Suggestions only — see the module note. */
  correlated: CorrelatedPair[];
  /** Removed nodes with no correlated counterpart: genuinely gone, as far as the data shows. */
  uncorrelatedRemovals: string[];
  summary: {
    addedLeaves: number;
    removedLeaves: number;
    changedNodes: number;
    correlatedPairs: number;
    identityRebased: boolean;
  };
  nodesProcessed: number;
  firestoreReads: number;
  tookMs: number;
}

/** Fields worth comparing. Only ones that exist on the persisted node — nothing invented. */
const COMPARABLE_FIELDS = ['label', 'type', 'parentEntityId', 'marks', 'order'] as const;

/**
 * A version-independent key for a node.
 *
 * Deliberately built from the same ingredients canonicalCoordinates uses, minus cycleId and
 * syllabusId — the two segments that make an id version-scoped. Deterministic and reproducible;
 * two nodes correlate only if they have the same type, the same exam, the same normalised
 * ancestor path and the same normalised official name.
 *
 * This is NOT identity. It cannot be, because a syllabus can legitimately move a topic to a new
 * parent or reword it, and either would break the key while the topic is plainly the same one.
 * That is exactly why it reports rather than decides.
 */
export function correlationKey(node: SyllabusGraphNode, ancestorLabels: string[]): string {
  const parsed = parseSyllabusNodeId(node.id);
  return [
    node.type.toLowerCase(),
    parsed?.examId ?? '',
    ancestorLabels.map(normalizeName).join(''),
    normalizeName(node.label),
  ].join('|');
}

/** Ancestor labels for every node in one pass, so correlation is not O(n²) in reads or walks. */
function ancestorLabelMap(nodes: SyllabusGraphNode[]): Map<string, string[]> {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const cache = new Map<string, string[]>();
  const resolve = (n: SyllabusGraphNode, seen = new Set<string>()): string[] => {
    if (cache.has(n.id)) return cache.get(n.id)!;
    if (!n.parentEntityId || seen.has(n.id)) return [];
    seen.add(n.id);                                    // a malformed parent cycle must terminate
    const parent = byId.get(n.parentEntityId);
    const path = parent ? [...resolve(parent, seen), parent.label] : [];
    cache.set(n.id, path);
    return path;
  };
  nodes.forEach((n) => cache.set(n.id, resolve(n)));
  return cache;
}

/** Every syllabus version on record for an exam, newest first. Reuses existing metadata. */
export async function getSyllabusVersions(examId: string): Promise<SyllabusVersionInfo[]> {
  const canonical = examId.trim().toUpperCase().replace(/[\s_-]+/g, '_');
  const snap = await db.collection('exam_syllabi').where('examId', '==', canonical).get();

  const graphVersions = await db.collection('exam_syllabi_graphs').doc(canonical)
    .collection('versions').get().catch(() => null);
  const withGraph = new Set((graphVersions?.docs ?? []).map((d) => d.id));
  const nodeCounts = new Map<string, number>();
  for (const d of graphVersions?.docs ?? []) nodeCounts.set(d.id, (d.data() as any).nodeCount ?? 0);

  return snap.docs
    .map((d) => {
      const s: any = d.data();
      return {
        examId: s.examId, syllabusId: s.syllabusId, version: s.version, cycleId: s.cycleId,
        status: s.status,
        sourceDocumentUrl: s.sourceDocumentUrl, sourceDocumentHash: s.sourceDocumentHash,
        sourceDocumentTitle: s.sourceDocumentTitle,
        retrievedAt: s.retrievedAt, publishedAt: s.publishedAt, updatedAt: s.updatedAt,
        nodeCount: nodeCounts.get(s.syllabusId),
        hasGraph: withGraph.has(s.syllabusId),
      } as SyllabusVersionInfo;
    })
    .sort((a, b) => (b.publishedAt ?? b.updatedAt ?? 0) - (a.publishedAt ?? a.updatedAt ?? 0));
}

/**
 * Diff two syllabus versions.
 *
 * Two bulk reads — one graph per version — then pure set and map work in memory. Never one read
 * per node: UPSC CSE alone would be 2,120 round trips.
 */
export async function getSyllabusDiff(
  examId: string, fromSyllabusId: string | null, toSyllabusId: string,
  injected?: { fromNodes?: SyllabusGraphNode[]; toNodes?: SyllabusGraphNode[] },
): Promise<SyllabusDiff> {
  const started = Date.now();
  const canonical = examId.trim().toUpperCase().replace(/[\s_-]+/g, '_');
  let reads = 0;

  const toNodes = injected?.toNodes
    ?? (reads++, await syllabusGraphService.getSyllabusNodes({ examId: canonical, syllabusId: toSyllabusId }));
  const fromNodes = injected?.fromNodes
    ?? (fromSyllabusId ? (reads++, await syllabusGraphService.getSyllabusNodes({ examId: canonical, syllabusId: fromSyllabusId })) : []);

  const oldById = new Map(fromNodes.map((n) => [n.id, n]));
  const newById = new Map(toNodes.map((n) => [n.id, n]));

  // ── Layer 1: authoritative set arithmetic on canonical ids ────────────────────────────
  const addedIds = [...newById.keys()].filter((id) => !oldById.has(id));
  const removedIds = [...oldById.keys()].filter((id) => !newById.has(id));
  const unchangedIds = [...newById.keys()].filter((id) => oldById.has(id));

  // ── Metadata changes, only for ids present in BOTH versions ───────────────────────────
  const changed: ChangedNode[] = [];
  for (const id of unchangedIds) {
    const a = oldById.get(id)! as any;
    const b = newById.get(id)! as any;
    const changedFields = COMPARABLE_FIELDS.filter((f) => JSON.stringify(a[f]) !== JSON.stringify(b[f]));
    if (changedFields.length) {
      changed.push({
        nodeId: id, label: b.label, changeType: 'METADATA_CHANGED', changedFields: [...changedFields],
        before: Object.fromEntries(changedFields.map((f) => [f, a[f]])),
        after: Object.fromEntries(changedFields.map((f) => [f, b[f]])),
      });
    }
  }

  // ── Layer 2: correlation. Reported, never treated as identity ─────────────────────────
  const oldAnc = ancestorLabelMap(fromNodes);
  const newAnc = ancestorLabelMap(toNodes);
  const addedByKey = new Map<string, SyllabusGraphNode[]>();
  for (const id of addedIds) {
    const n = newById.get(id)!;
    const key = correlationKey(n, newAnc.get(id) ?? []);
    addedByKey.set(key, [...(addedByKey.get(key) ?? []), n]);
  }

  const correlated: CorrelatedPair[] = [];
  const uncorrelatedRemovals: string[] = [];
  const claimed = new Set<string>();
  for (const id of removedIds) {
    const n = oldById.get(id)!;
    const key = correlationKey(n, oldAnc.get(id) ?? []);
    const candidates = (addedByKey.get(key) ?? []).filter((c) => !claimed.has(c.id));
    /*
     * Exactly one unclaimed candidate, or nothing. An ambiguous key — two added nodes sharing a
     * correlation key — is reported as uncorrelated rather than resolved by picking one; guessing
     * between two candidates is precisely the fuzzy matching this module refuses to do.
     */
    if (candidates.length === 1) {
      claimed.add(candidates[0].id);
      correlated.push({
        removedNodeId: id, addedNodeId: candidates[0].id, label: n.label,
        basis: 'CORRELATION_KEY', labelChanged: n.label !== candidates[0].label,
      });
    } else {
      uncorrelatedRemovals.push(id);
    }
  }

  const isLeaf = (n: SyllabusGraphNode, all: Map<string, SyllabusGraphNode>) =>
    !['TOPIC', 'SUBTOPIC'].includes(n.type) ? false
      : ![...all.values()].some((c) => c.parentEntityId === n.id && ['TOPIC', 'SUBTOPIC'].includes(c.type));

  /*
   * True when the two versions share no ids at all despite both having nodes — the signature of a
   * version rebase rather than a content change. Without it a reader sees "everything added,
   * everything removed" and reasonably concludes the syllabus was rewritten from scratch.
   */
  const identityRebased = fromNodes.length > 0 && unchangedIds.length === 0;

  const diff: SyllabusDiff = {
    examId: canonical,
    from: fromSyllabusId ? { syllabusId: fromSyllabusId } : null,
    to: { syllabusId: toSyllabusId },
    added: addedIds.map((id) => ({ nodeId: id, label: newById.get(id)!.label, type: newById.get(id)!.type })),
    removed: removedIds.map((id) => ({ nodeId: id, label: oldById.get(id)!.label, type: oldById.get(id)!.type })),
    unchanged: unchangedIds,
    changed,
    correlated,
    uncorrelatedRemovals,
    summary: {
      addedLeaves: addedIds.filter((id) => isLeaf(newById.get(id)!, newById)).length,
      removedLeaves: removedIds.filter((id) => isLeaf(oldById.get(id)!, oldById)).length,
      changedNodes: changed.length,
      correlatedPairs: correlated.length,
      identityRebased,
    },
    nodesProcessed: fromNodes.length + toNodes.length,
    firestoreReads: reads,
    tookMs: Date.now() - started,
  };

  logger.info('[SyllabusDiff] computed', {
    examId: canonical, from: fromSyllabusId, to: toSyllabusId,
    added: addedIds.length, removed: removedIds.length, changed: changed.length,
    correlated: correlated.length, identityRebased, reads, ms: diff.tookMs,
  });
  return diff;
}

export interface StudentSyllabusImpact {
  userId: string;
  examId: string;
  activeSyllabusId: string | null;
  /** Mastery anchored to a version that is no longer active. Never deleted, never zeroed. */
  outOfCurrentSyllabus: Array<{
    syllabusNodeId: string; masteryKey: string; label?: string;
    attempts: number; masteryScore: number; syllabusId: string;
  }>;
  affectedByChange: string[];
  recommendedAction:
    | 'NONE'
    | 'REVIEW_UPDATED_TOPICS'
    | 'SOME_TOPICS_NO_LONGER_IN_SYLLABUS'
    | 'NEW_TOPICS_ADDED';
  counts: { masteryRecords: number; outOfSyllabus: number; addedSinceLastStudied: number };
}

/**
 * What a syllabus change means for one student.
 *
 * User-scoped by construction: it reads only this student's mastery, so there is no query through
 * which one student's impact could include another's.
 *
 * Mastery on a node that has left the syllabus is marked OUT_OF_CURRENT_SYLLABUS and left exactly
 * as it is. It is not deleted and not zeroed — "this topic is no longer examinable" and "this
 * student never studied it" are entirely different facts, and conflating them would destroy
 * evidence of work the student genuinely did.
 */
export async function getStudentSyllabusImpact(
  userId: string, examId: string,
  injected?: { mastery?: any[]; activeNodeIds?: Set<string>; activeSyllabusId?: string | null; addedNodeIds?: string[] },
): Promise<StudentSyllabusImpact> {
  const canonical = examId.trim().toUpperCase().replace(/[\s_-]+/g, '_');

  const activeNodes = injected?.activeNodeIds
    ?? new Set((await syllabusGraphService.getSyllabusNodes({ examId: canonical })).map((n) => n.id));

  let activeSyllabusId = injected?.activeSyllabusId;
  if (activeSyllabusId === undefined) {
    const versions = await getSyllabusVersions(canonical);
    activeSyllabusId = versions.find((v) => v.status === 'CURRENT')?.syllabusId ?? null;
  }

  const mastery = injected?.mastery
    ?? (await db.collection('users').doc(userId).collection('mastery').get()).docs.map((d) => d.data());

  const outOfCurrentSyllabus: StudentSyllabusImpact['outOfCurrentSyllabus'] = [];
  let anchored = 0;
  for (const m of mastery as any[]) {
    if (!m.syllabusNodeId) continue;                      // legacy label-keyed: not attributable
    const parsed = parseSyllabusNodeId(m.syllabusNodeId);
    if (parsed?.examId.toUpperCase() !== canonical) continue;   // exam isolation, before anything else
    anchored++;
    if (!activeNodes.has(m.syllabusNodeId)) {
      outOfCurrentSyllabus.push({
        syllabusNodeId: m.syllabusNodeId,
        masteryKey: masteryKeyForNode(m.syllabusNodeId),
        label: m.title, attempts: m.attempts ?? 0, masteryScore: m.masteryScore ?? 0,
        syllabusId: parsed!.syllabusId,
      });
    }
  }

  const added = injected?.addedNodeIds ?? [];
  const recommendedAction: StudentSyllabusImpact['recommendedAction'] =
    outOfCurrentSyllabus.length > 0 ? 'SOME_TOPICS_NO_LONGER_IN_SYLLABUS'
    : added.length > 0 ? 'NEW_TOPICS_ADDED'
    : 'NONE';

  return {
    userId, examId: canonical, activeSyllabusId: activeSyllabusId ?? null,
    outOfCurrentSyllabus, affectedByChange: [],
    recommendedAction,
    counts: { masteryRecords: anchored, outOfSyllabus: outOfCurrentSyllabus.length, addedSinceLastStudied: added.length },
  };
}
