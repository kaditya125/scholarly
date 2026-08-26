import { syllabusGraphService, type SyllabusGraphNode } from '../exam/syllabusGraph.service';
import { getUserMasteryForExam, MASTERY_ALLOWED_TYPES } from './nodeMastery.service';
import type { ConceptMastery } from '../../core/intelligence/MasteryEngine';
import { logger } from '../../utils/logger';

/**
 * Stage 3 — the student's syllabus coverage map.
 *
 * Answers "what portion of my actual syllabus have I covered?" rather than "how many quizzes did
 * I take?". Every figure here is computed from canonical syllabus nodes and validated learning
 * evidence; nothing is derived from activity counts, and nothing from unvalidated content.
 *
 * ── The distinction the whole feature rests on ──────────────────────────────────────────────
 * UNTOUCHED is not zero. A node with no evidence and a node the student keeps getting wrong are
 * different facts about their preparation, and rendering both as "0%" tells a student they are
 * bad at something they have never seen. UNTOUCHED carries no score at all — not a zero — so the
 * UI cannot accidentally average it in or colour it like a failure.
 */

/**
 * Thresholds, in one place.
 *
 * These are not arbitrary: they follow the Stage 2 scoring model exactly. mastery starts neutral
 * at 0.5 and each graded event pulls it toward the event target with alpha 0.4, so the reachable
 * trajectory from a fresh node is
 *
 *   correct:   0.50 → 0.70 → 0.82 → 0.892 → 0.935
 *   incorrect: 0.50 → 0.30 → 0.18 → 0.108
 *
 * Every threshold below is chosen against that curve, which is why they must live here and not be
 * re-guessed in a component. A UI that invents its own cut-off will disagree with the API about
 * what the same node is, and the student will see two different answers to one question.
 */
export const COVERAGE_THRESHOLDS = {
  /** Evidence needed before a node may be called weak or strong at all. */
  MIN_EVIDENCE: 3,
  /** Evidence needed before a node may be called mastered. Deliberately higher. */
  MASTERY_EVIDENCE: 4,
  WEAK_BELOW: 0.40,
  STRONG_AT_OR_ABOVE: 0.70,
  MASTERED_AT_OR_ABOVE: 0.85,
} as const;

export type CoverageState = 'UNTOUCHED' | 'LEARNING' | 'WEAK' | 'STRONG' | 'MASTERED';

/**
 * Classify one node from its evidence.
 *
 * Order matters. UNTOUCHED is decided first because absence of evidence outranks any score, and
 * MASTERED before STRONG because the mastered band is a subset of the strong one.
 *
 * The evidence floors are what stop a single answer deciding anything: one correct answer reaches
 * 0.70, which clears the STRONG score, but with one attempt it is LEARNING — the student has met
 * the topic, not conquered it. One wrong answer reaches 0.30, below the WEAK score, but is also
 * LEARNING rather than WEAK: calling a topic a weakness on one bad answer is both statistically
 * unsound and discouraging.
 */
export function classify(mastery: Pick<ConceptMastery, 'masteryScore' | 'attempts'> | null): CoverageState {
  if (!mastery || mastery.attempts === 0) return 'UNTOUCHED';
  const { masteryScore: s, attempts: n } = mastery;
  const T = COVERAGE_THRESHOLDS;
  if (n >= T.MASTERY_EVIDENCE && s >= T.MASTERED_AT_OR_ABOVE) return 'MASTERED';
  if (n >= T.MIN_EVIDENCE && s >= T.STRONG_AT_OR_ABOVE) return 'STRONG';
  if (n >= T.MIN_EVIDENCE && s < T.WEAK_BELOW) return 'WEAK';
  return 'LEARNING';
}

export interface CoverageNode {
  nodeId: string;
  label: string;
  nodeType: string;
  parentId: string | null;
  state: CoverageState;
  /** Null when UNTOUCHED — absent evidence has no score, and a zero would be a different claim. */
  masteryScore: number | null;
  attempts: number;
  accuracy: number | null;
  lastSeenAt: number | null;
  /** True for the addressable leaves that coverage percentage is computed over. */
  isLeaf: boolean;
  children: CoverageNode[];
}

export interface CoverageTotals {
  addressable: number;
  untouched: number;
  learning: number;
  weak: number;
  strong: number;
  mastered: number;
}

export interface SyllabusCoverage {
  examId: string;
  examName?: string;
  syllabusId: string | null;
  coveragePercent: number;
  masteredPercent: number;
  totals: CoverageTotals;
  subjects: CoverageNode[];
  generatedAt: number;
}

/**
 * Which nodes the percentage is computed over.
 *
 * A LEAF is a mastery-eligible node with no mastery-eligible children. Counting a TOPIC and also
 * its SUBTOPICs would count the same ground twice and let a single deeply-nested topic outweigh a
 * whole subject; counting only TOPICs would silently discard the finer detail the syllabus
 * actually specifies. Taking the deepest addressable level gives every unit of real syllabus one
 * vote, which is the only rule that stays honest across exams whose depth differs wildly —
 * UPSC CSE nests four deep in places, SSC MTS barely nests at all.
 */
function markLeaves(nodes: SyllabusGraphNode[]): Set<string> {
  const eligible = new Set(
    nodes.filter((n) => (MASTERY_ALLOWED_TYPES as readonly string[]).includes(n.type)).map((n) => n.id),
  );
  const hasEligibleChild = new Set<string>();
  for (const n of nodes) {
    if (n.parentEntityId && eligible.has(n.id)) hasEligibleChild.add(n.parentEntityId);
  }
  return new Set([...eligible].filter((id) => !hasEligibleChild.has(id)));
}

/**
 * Build the whole coverage map for one exam.
 *
 * Two reads total, regardless of syllabus size: the graph for this exam, and this user's mastery.
 * Everything else is in-memory. A per-node read would be roughly 800 round trips for UPSC CSE.
 */
export async function getSyllabusCoverage(
  userId: string, examId: string, opts: { syllabusId?: string; examName?: string } = {},
): Promise<SyllabusCoverage> {
  const started = Date.now();
  const canonicalExam = examId.trim().toUpperCase().replace(/[\s_-]+/g, '_');

  const [nodes, mastery] = await Promise.all([
    syllabusGraphService.getSyllabusNodes({ examId: canonicalExam, syllabusId: opts.syllabusId }),
    getUserMasteryForExam(userId, canonicalExam),
  ]);

  const byNode = new Map<string, ConceptMastery>();
  for (const m of mastery) if (m.syllabusNodeId) byNode.set(m.syllabusNodeId, m);

  const leaves = markLeaves(nodes);
  const childrenOf = new Map<string, SyllabusGraphNode[]>();
  const roots: SyllabusGraphNode[] = [];
  for (const n of nodes) {
    if (n.parentEntityId) childrenOf.set(n.parentEntityId, [...(childrenOf.get(n.parentEntityId) || []), n]);
    else roots.push(n);
  }

  const totals: CoverageTotals = { addressable: 0, untouched: 0, learning: 0, weak: 0, strong: 0, mastered: 0 };

  const seen = new Set<string>();
  const build = (n: SyllabusGraphNode): CoverageNode => {
    seen.add(n.id);                                   // a malformed parent cycle must not recurse forever
    const kids = (childrenOf.get(n.id) || []).filter((c) => !seen.has(c.id)).map(build);
    const m = byNode.get(n.id) ?? null;
    const isLeaf = leaves.has(n.id);
    const state = classify(m);

    if (isLeaf) {
      totals.addressable++;
      totals[state.toLowerCase() as keyof CoverageTotals]++;
    }

    return {
      nodeId: n.id,
      label: n.label,
      nodeType: n.type,
      parentId: n.parentEntityId ?? null,
      state,
      // Only ever a number when evidence exists. See the note on UNTOUCHED above.
      masteryScore: m && m.attempts > 0 ? Number(m.masteryScore.toFixed(3)) : null,
      attempts: m?.attempts ?? 0,
      accuracy: m && m.attempts > 0 ? Number(m.successRate.toFixed(3)) : null,
      lastSeenAt: m?.lastPracticed || null,
      isLeaf,
      children: kids,
    };
  };

  const subjects = roots.map(build);

  /*
   * Anything the walk could not reach still has to appear.
   *
   * A node whose parent is missing, or a parent cycle, leaves nodes unreachable from any root —
   * and if EVERY node is in a cycle there are no roots at all, which produced a completely empty
   * coverage map: the student sees nothing, with no error anywhere. A malformed graph must
   * degrade to a flatter view, never to a blank screen. Unreached nodes are surfaced as
   * additional top-level entries so their evidence still counts.
   */
  const unreached = nodes.filter((n) => !seen.has(n.id));
  if (unreached.length) {
    logger.warn('[Coverage] nodes unreachable from any root — surfacing them flat', {
      examId: canonicalExam, unreached: unreached.length, total: nodes.length,
    });
    for (const n of unreached) if (!seen.has(n.id)) subjects.push(build(n));
  }

  const touched = totals.addressable - totals.untouched;
  const coveragePercent = totals.addressable ? Math.round((touched / totals.addressable) * 1000) / 10 : 0;
  const masteredPercent = totals.addressable ? Math.round((totals.mastered / totals.addressable) * 1000) / 10 : 0;

  logger.info('[Coverage] built', {
    userId, examId: canonicalExam, nodes: nodes.length, addressable: totals.addressable,
    withEvidence: byNode.size, ms: Date.now() - started,
  });

  return {
    examId: canonicalExam,
    examName: opts.examName,
    syllabusId: opts.syllabusId ?? (nodes[0] ? nodes[0].id.split(':')[3] ?? null : null),
    coveragePercent,
    masteredPercent,
    totals,
    subjects,
    generatedAt: Date.now(),
  };
}

/**
 * The tree without its leaves, for a first paint on a small screen.
 *
 * UPSC CSE is 2,120 nodes; sending all of them so a phone can render four collapsed subjects is
 * wasteful on both ends. Depth 2 carries the summary and the subject rows, and the rest is
 * fetched when a student actually expands something.
 */
export function pruneToDepth(coverage: SyllabusCoverage, depth: number): SyllabusCoverage {
  const prune = (n: CoverageNode, d: number): CoverageNode => ({
    ...n,
    children: d >= depth ? [] : n.children.map((c) => prune(c, d + 1)),
  });
  return { ...coverage, subjects: coverage.subjects.map((s) => prune(s, 1)) };
}

/** One subtree, for lazy expansion. Returns null when the node is not in this exam. */
export async function getCoverageSubtree(
  userId: string, examId: string, nodeId: string,
): Promise<CoverageNode | null> {
  const full = await getSyllabusCoverage(userId, examId);
  const find = (ns: CoverageNode[]): CoverageNode | null => {
    for (const n of ns) {
      if (n.nodeId === nodeId) return n;
      const hit = find(n.children);
      if (hit) return hit;
    }
    return null;
  };
  return find(full.subjects);
}
