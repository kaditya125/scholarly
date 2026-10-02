/**
 * ConceptGraphService — prerequisite graph and root-cause diagnosis for weak quiz topics.
 * ======================================================================================
 *
 * A small hand-authored DAG of concept dependencies for JEE / NEET physics, chemistry and maths.
 * When a student scores below ROOT_CAUSE_ACCURACY_THRESHOLD on a topic, the graph is walked
 * backwards through prerequisite edges and the student's own evidence (this attempt plus stored
 * weak-topic history) decides which upstream concept is the real gap.
 *
 * Three rules this file exists to enforce:
 *
 *  1. NO SUBSTRING MATCHING. The previous version matched aliases with `includes`, so the alias
 *     "com" turned "Compound Interest", "Computer Awareness", "Combustion" and "Complex Numbers"
 *     into Center of Mass and told SSC students they had a mechanics gap. Resolution is now by
 *     canonical syllabus slug, exact normalised label, or a contiguous WHOLE-TOKEN alias — and an
 *     ambiguous match resolves to nothing rather than to whichever alias was registered first.
 *
 *  2. SCOPED BY EXAM. The graph only describes JEE / NEET concepts. A row from any other exam (or
 *     with no exam at all) is NOT_SUPPORTED — no diagnosis is invented for it.
 *
 *  3. EVIDENCE, NOT GUESSES. The root cause is the earliest prerequisite the student has actually
 *     been measured as weak in. With no evidence about prerequisites the diagnosis says exactly
 *     that (PREREQUISITES_UNASSESSED) instead of naming a plausible-sounding concept.
 */

import type {
  TopicBreakdown,
  PedagogicalDiagnostic,
  PrerequisiteChainItem,
  WeakTopic,
  DiagnosticConfidence,
} from '../../types/quizAttempt.types';

/** A topic is diagnosed — and a prerequisite counts as weak — strictly below this fraction. */
export const ROOT_CAUSE_ACCURACY_THRESHOLD = 0.5;

/** Exams the graph describes. Anything else gets no diagnosis. */
export const CONCEPT_GRAPH_SUPPORTED_EXAMS = ['JEE_MAIN', 'JEE_ADVANCED', 'NEET_UG', 'NEET'] as const;

const JEE = ['JEE_MAIN', 'JEE_ADVANCED'];
const JEE_NEET = [...JEE, 'NEET_UG', 'NEET'];

export type ConceptSubject = 'physics' | 'chemistry' | 'mathematics';

export interface ConceptNode {
  id: string;
  name: string;
  subject: ConceptSubject;
  examCodes: string[];
  chapter: string;
  /** Immediate upstream concepts — edges point from a concept to what it depends on. */
  prerequisites: string[];
  /**
   * Phrases a syllabus label may use for this concept. Matched as whole-token sequences only, so
   * single-token aliases must be words that cannot occur inside an unrelated topic name
   * ("tension" was dropped: it is inside "Surface Tension"; "resonance" likewise, it is a
   * physics topic too).
   */
  aliases: string[];
  description: string;
  rootCauseTip: string;
}

/** The evidence a diagnosis rests on, for one concept. */
interface ConceptEvidence {
  correct: number;
  total: number;
  /** 0-100 */
  accuracy: number;
  source: 'this_attempt' | 'history';
}

export type ConceptResolution =
  | { status: 'RESOLVED'; node: ConceptNode; examId: string; via: 'syllabus_node' | 'exact_label' | 'alias' }
  | { status: 'NOT_SUPPORTED'; reason: 'no_exam' | 'exam_not_supported' | 'concept_not_in_exam' }
  | { status: 'UNRESOLVED'; reason: 'no_match' | 'ambiguous' };

/** Lowercase, fold possessives ("Newton's" → "newtons"), and reduce everything else to single spaces. */
export function normalizeConceptText(str: string): string {
  return String(str || '')
    .toLowerCase()
    .replace(/['’]s\b/g, 's')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/** `topic:JEE_MAIN:2026:syl_x:rotational_motion:7f3a9c2e1b4d` → { examId, slug }. */
export function parseSyllabusNodeId(id: string | undefined): { examId?: string; slug?: string } {
  if (!id) return {};
  const parts = id.split(':');
  if (parts.length < 6) return {};
  return { examId: parts[1] || undefined, slug: parts[4] ? parts[4].replace(/_/g, ' ') : undefined };
}

function containsTokenSequence(haystack: string[], needle: string[]): boolean {
  if (!needle.length || needle.length > haystack.length) return false;
  outer: for (let i = 0; i + needle.length <= haystack.length; i++) {
    for (let j = 0; j < needle.length; j++) if (haystack[i + j] !== needle[j]) continue outer;
    return true;
  }
  return false;
}

function confidenceFor(...totals: number[]): DiagnosticConfidence {
  const n = Math.min(...totals);
  if (n >= 5) return 'high';
  if (n >= 3) return 'medium';
  return 'low';
}

export class ConceptGraphService {
  private nodes = new Map<string, ConceptNode>();
  /** normalised phrase → concept ids that own it (more than one means the phrase is ambiguous). */
  private phraseIndex = new Map<string, Set<string>>();

  constructor(nodes: ConceptNode[] = CONCEPT_NODES) {
    for (const n of nodes) this.registerNode(n);
    this.assertAcyclic();
  }

  getNode(id: string): ConceptNode | undefined {
    return this.nodes.get(id);
  }

  isExamSupported(examId: string | undefined): boolean {
    return !!examId && (CONCEPT_GRAPH_SUPPORTED_EXAMS as readonly string[]).includes(examId);
  }

  /**
   * Resolve a quiz row to a concept. Order of preference: the canonical syllabus node's slug, the
   * exact normalised label, then the longest whole-token alias contained in the label.
   */
  resolveConcept(input: { topic?: string; syllabusNodeId?: string; examId?: string }): ConceptResolution {
    const parsed = parseSyllabusNodeId(input.syllabusNodeId);
    const examId = input.examId || parsed.examId;
    if (!examId) return { status: 'NOT_SUPPORTED', reason: 'no_exam' };
    if (!this.isExamSupported(examId)) return { status: 'NOT_SUPPORTED', reason: 'exam_not_supported' };

    const attempts: Array<{ text: string | undefined; via: 'syllabus_node' | 'exact_label' }> = [
      { text: parsed.slug, via: 'syllabus_node' },
      { text: input.topic, via: 'exact_label' },
    ];

    let sawAmbiguity = false;
    for (const { text, via } of attempts) {
      if (!text) continue;
      const exact = this.matchExact(text);
      if (exact === 'ambiguous') { sawAmbiguity = true; continue; }
      if (exact) return this.scopeToExam(exact, examId, via);
    }
    for (const { text } of attempts) {
      if (!text) continue;
      const alias = this.matchAlias(text);
      if (alias === 'ambiguous') { sawAmbiguity = true; continue; }
      if (alias) return this.scopeToExam(alias, examId, 'alias');
    }
    return { status: 'UNRESOLVED', reason: sawAmbiguity ? 'ambiguous' : 'no_match' };
  }

  /**
   * Every prerequisite reachable from `conceptId`, with its distance (in edges) from the target.
   * Distance is the LONGEST path, so a concept reached both directly and via a chain counts as
   * deep as its deepest route — that is what "more foundational" means in a DAG.
   */
  ancestorsOf(conceptId: string): Map<string, number> {
    const depth = new Map<string, number>();
    const visit = (id: string, d: number) => {
      const node = this.nodes.get(id);
      if (!node) return;
      for (const pre of node.prerequisites) {
        if ((depth.get(pre) ?? -1) < d + 1) {
          depth.set(pre, d + 1);
          visit(pre, d + 1);
        }
      }
    };
    visit(conceptId, 0);
    return depth;
  }

  /** Shortest prerequisite path from `fromId` (an ancestor) down to `toId` (the target), inclusive. */
  pathBetween(fromId: string, toId: string): string[] {
    // BFS backwards from the target over prerequisite edges, remembering who reached whom.
    const cameFrom = new Map<string, string>();
    const queue = [toId];
    const seen = new Set([toId]);
    while (queue.length) {
      const id = queue.shift()!;
      if (id === fromId) break;
      for (const pre of this.nodes.get(id)?.prerequisites ?? []) {
        if (seen.has(pre)) continue;
        seen.add(pre);
        cameFrom.set(pre, id);
        queue.push(pre);
      }
    }
    if (!seen.has(fromId)) return [toId];
    const path = [fromId];
    let cur = fromId;
    while (cur !== toId) {
      cur = cameFrom.get(cur)!;
      path.push(cur);
    }
    return path;
  }

  /**
   * Diagnose every weak row of a graded attempt.
   *
   * Returns `null` when no row belongs to a supported exam — the caller stores that as "this
   * attempt is outside the graph", which is different from `[]` ("in scope, nothing weak enough").
   */
  diagnoseAttempt(breakdowns: TopicBreakdown[], history: WeakTopic[] = []): PedagogicalDiagnostic[] | null {
    type Resolved = { row: TopicBreakdown; node: ConceptNode; examId: string };
    const resolved: Resolved[] = [];
    let anySupported = false;

    for (const row of breakdowns) {
      const r = this.resolveConcept({ topic: row.topic, syllabusNodeId: row.syllabusNodeId, examId: row.examId });
      if (r.status === 'NOT_SUPPORTED') continue;
      anySupported = true;
      if (r.status === 'RESOLVED') resolved.push({ row, node: r.node, examId: r.examId });
    }
    if (!anySupported) return null;

    // Evidence per (exam, concept). This attempt outranks history: it is the newer measurement.
    const evidence = new Map<string, ConceptEvidence>();
    const key = (examId: string, conceptId: string) => `${examId}::${conceptId}`;
    for (const h of history) {
      const r = this.resolveConcept({ topic: h.topicName, syllabusNodeId: h.syllabusNodeId, examId: h.examId });
      if (r.status !== 'RESOLVED' || !h.total) continue;
      evidence.set(key(r.examId, r.node.id), { correct: h.correct, total: h.total, accuracy: h.accuracy, source: 'history' });
    }
    const attemptEvidence = new Map<string, ConceptEvidence>();
    for (const { row, node, examId } of resolved) {
      if (!row.total) continue;
      const k = key(examId, node.id);
      const prev = attemptEvidence.get(k);
      const correct = (prev?.correct ?? 0) + row.correct;
      const total = (prev?.total ?? 0) + row.total;
      attemptEvidence.set(k, { correct, total, accuracy: Math.round((correct / total) * 100), source: 'this_attempt' });
    }
    for (const [k, v] of attemptEvidence) evidence.set(k, v);

    const diagnostics: PedagogicalDiagnostic[] = [];
    const diagnosed = new Set<string>();
    for (const { row, node, examId } of resolved) {
      const target = evidence.get(key(examId, node.id));
      if (!target || target.accuracy / 100 >= ROOT_CAUSE_ACCURACY_THRESHOLD) continue;
      if (diagnosed.has(key(examId, node.id))) continue;
      diagnosed.add(key(examId, node.id));
      diagnostics.push(this.diagnoseConcept({
        node, examId, topic: row.topic, syllabusNodeId: row.syllabusNodeId, target,
        evidenceFor: (id) => evidence.get(key(examId, id)),
      }));
    }
    return diagnostics;
  }

  /** The root-cause decision for one weak concept. Exported via diagnoseAttempt; public for tests. */
  diagnoseConcept(p: {
    node: ConceptNode;
    examId: string;
    topic: string;
    syllabusNodeId?: string;
    target: ConceptEvidence;
    evidenceFor: (conceptId: string) => ConceptEvidence | undefined;
  }): PedagogicalDiagnostic {
    const { node, examId, target } = p;
    // Only prerequisites that belong to this exam count: maths nodes are not NEET prerequisites.
    const ancestors = [...this.ancestorsOf(node.id)].filter(([id]) => this.nodes.get(id)?.examCodes.includes(examId));
    const isWeak = (e?: ConceptEvidence) => !!e && e.accuracy / 100 < ROOT_CAUSE_ACCURACY_THRESHOLD;

    const weak = ancestors.filter(([id]) => isWeak(p.evidenceFor(id)));
    const assessed = ancestors.filter(([id]) => p.evidenceFor(id));
    const directPrereqs = node.prerequisites.filter((id) => this.nodes.get(id)?.examCodes.includes(examId));
    const unassessedDirect = directPrereqs.filter((id) => !p.evidenceFor(id));

    const chainItem = (id: string): PrerequisiteChainItem => {
      const n = this.nodes.get(id)!;
      const e = id === node.id ? target : p.evidenceFor(id);
      return {
        conceptId: id,
        title: n.name,
        chapter: n.chapter,
        accuracy: e?.accuracy,
        evidence: !e ? 'unassessed' : isWeak(e) ? 'weak' : 'strong',
      };
    };

    const base = {
      id: `diag_${examId}_${node.id}`,
      examId,
      subject: node.subject,
      topic: p.topic,
      syllabusNodeId: p.syllabusNodeId,
      targetConceptId: node.id,
      targetConcept: node.name,
      accuracy: target.accuracy,
    };

    if (weak.length) {
      // Earliest unresolved: a weak prerequisite none of whose own prerequisites is also weak.
      const weakIds = new Set(weak.map(([id]) => id));
      const roots = weak.filter(([id]) => ![...this.ancestorsOf(id).keys()].some((a) => weakIds.has(a)));
      roots.sort((a, b) =>
        b[1] - a[1]
        || p.evidenceFor(a[0])!.accuracy - p.evidenceFor(b[0])!.accuracy
        || a[0].localeCompare(b[0]));
      const rootId = roots[0][0];
      const root = this.nodes.get(rootId)!;
      const rootEvidence = p.evidenceFor(rootId)!;
      const chain = this.pathBetween(rootId, node.id).map(chainItem);
      const explanation =
        `${node.name} builds on ${chain.slice(0, -1).map((c) => c.title).join(' → ')}. ` +
        `You scored ${rootEvidence.accuracy}% in ${root.name} ` +
        `(${rootEvidence.source === 'this_attempt' ? 'in this test' : 'in earlier tests'}), ` +
        `and it is the earliest concept on that path you are weak in.`;
      return {
        ...base,
        status: 'ROOT_CAUSE_IDENTIFIED',
        rootCauseConceptId: root.id,
        rootCauseTitle: root.name,
        rootCauseChapter: root.chapter,
        prerequisiteChain: chain,
        unassessedPrerequisites: unassessedDirect.map((id) => this.nodes.get(id)!.name),
        confidence: confidenceFor(target.total, rootEvidence.total),
        explanation,
        diagnosticMessage: `You scored ${target.accuracy}% in ${node.name}. The underlying gap looks like ${root.name} (${root.chapter}).`,
        recommendedAction: root.rootCauseTip,
        remediationEligible: true,
      };
    }

    if (directPrereqs.length === 0 || (assessed.length > 0 && unassessedDirect.length === 0)) {
      // Nothing upstream to blame: either a foundational concept, or every direct prerequisite was
      // measured and is fine. The gap is in this concept itself.
      return {
        ...base,
        status: 'TOPIC_LEVEL_GAP',
        rootCauseConceptId: node.id,
        rootCauseTitle: node.name,
        rootCauseChapter: node.chapter,
        prerequisiteChain: [...directPrereqs.map(chainItem), chainItem(node.id)],
        unassessedPrerequisites: [],
        confidence: confidenceFor(target.total),
        explanation: directPrereqs.length
          ? `You did well on the prerequisites of ${node.name}, so the gap is in ${node.name} itself.`
          : `${node.name} is a foundational concept, so the gap is in ${node.name} itself.`,
        diagnosticMessage: `You scored ${target.accuracy}% in ${node.name}. The gap is in ${node.name} itself, not an earlier chapter.`,
        recommendedAction: node.rootCauseTip,
        remediationEligible: true,
      };
    }

    return {
      ...base,
      status: 'PREREQUISITES_UNASSESSED',
      rootCauseConceptId: null,
      rootCauseTitle: null,
      rootCauseChapter: null,
      prerequisiteChain: [...directPrereqs.map(chainItem), chainItem(node.id)],
      unassessedPrerequisites: unassessedDirect.map((id) => this.nodes.get(id)!.name),
      confidence: 'low',
      explanation:
        `${node.name} depends on ${directPrereqs.map((id) => this.nodes.get(id)!.name).join(', ')}, ` +
        `but you have not been tested on ${unassessedDirect.length === directPrereqs.length ? 'them' : 'all of them'} yet, ` +
        `so we cannot tell yet whether the gap is in ${node.name} or earlier.`,
      diagnosticMessage: `You scored ${target.accuracy}% in ${node.name}. A short prerequisite check will show whether the gap is earlier.`,
      recommendedAction: `Check ${unassessedDirect.map((id) => this.nodes.get(id)!.name).join(', ')} before re-attempting ${node.name}.`,
      remediationEligible: true,
    };
  }

  // ─── internals ──────────────────────────────────────────────────────────────────────────────

  private registerNode(node: ConceptNode) {
    if (this.nodes.has(node.id)) throw new Error(`[ConceptGraph] duplicate concept id ${node.id}`);
    this.nodes.set(node.id, node);
    for (const phrase of [node.id.replace(/_/g, ' '), node.name, ...node.aliases]) {
      const norm = normalizeConceptText(phrase);
      if (!norm) continue;
      const owners = this.phraseIndex.get(norm) ?? new Set<string>();
      owners.add(node.id);
      this.phraseIndex.set(norm, owners);
    }
  }

  private assertAcyclic() {
    const state = new Map<string, 'visiting' | 'done'>();
    const visit = (id: string, path: string[]) => {
      if (state.get(id) === 'done') return;
      if (state.get(id) === 'visiting') throw new Error(`[ConceptGraph] cycle: ${[...path, id].join(' → ')}`);
      const node = this.nodes.get(id);
      if (!node) throw new Error(`[ConceptGraph] unknown prerequisite ${id} (from ${path[path.length - 1]})`);
      state.set(id, 'visiting');
      for (const pre of node.prerequisites) visit(pre, [...path, id]);
      state.set(id, 'done');
    };
    for (const id of this.nodes.keys()) visit(id, []);
  }

  private matchExact(text: string): ConceptNode | 'ambiguous' | null {
    const owners = this.phraseIndex.get(normalizeConceptText(text));
    if (!owners || owners.size === 0) return null;
    if (owners.size > 1) return 'ambiguous';
    return this.nodes.get([...owners][0]) ?? null;
  }

  private matchAlias(text: string): ConceptNode | 'ambiguous' | null {
    const tokens = normalizeConceptText(text).split(' ').filter(Boolean);
    let best = 0;
    const winners = new Set<string>();
    for (const [phrase, owners] of this.phraseIndex) {
      const needle = phrase.split(' ');
      if (needle.length < best || !containsTokenSequence(tokens, needle)) continue;
      if (needle.length > best) { best = needle.length; winners.clear(); }
      owners.forEach((o) => winners.add(o));
    }
    if (winners.size === 0) return null;
    if (winners.size > 1) return 'ambiguous';
    return this.nodes.get([...winners][0]) ?? null;
  }

  private scopeToExam(node: ConceptNode, examId: string, via: 'syllabus_node' | 'exact_label' | 'alias'): ConceptResolution {
    if (!node.examCodes.includes(examId)) return { status: 'NOT_SUPPORTED', reason: 'concept_not_in_exam' };
    return { status: 'RESOLVED', node, examId, via };
  }
}

/**
 * The graph. Edges follow the NCERT / JEE teaching order: a concept lists what a student must
 * already be able to do to learn it — not every chapter that happens to come earlier.
 */
export const CONCEPT_NODES: ConceptNode[] = [
  // ── Physics: mechanics ──────────────────────────────────────────────────────────────────────
  {
    id: 'vectors', name: 'Vectors & Vector Algebra', subject: 'physics', examCodes: JEE_NEET,
    chapter: 'Class 11 Ch 2–4 (Units, Vectors & Basic Maths)', prerequisites: [],
    aliases: ['vectors', 'vector', 'vector algebra', 'cross product', 'dot product', 'resolution of vectors'],
    description: 'Vector addition, components, dot product, cross product and unit vectors.',
    rootCauseTip: 'Review resolving vectors into components and the right-hand rule for cross products.',
  },
  {
    id: 'kinematics', name: 'Kinematics in 1D & 2D', subject: 'physics', examCodes: JEE_NEET,
    chapter: 'Class 11 Ch 3–4 (Motion in a Straight Line & in a Plane)', prerequisites: ['vectors'],
    aliases: ['kinematics', 'projectile motion', 'motion in a straight line', 'motion in a plane', 'relative velocity'],
    description: 'Equations of motion, displacement, velocity, acceleration and projectile trajectories.',
    rootCauseTip: 'Practise the constant-acceleration equations and splitting projectile motion along x and y.',
  },
  {
    id: 'newtons_laws', name: "Newton's Laws of Motion", subject: 'physics', examCodes: JEE_NEET,
    chapter: 'Class 11 Ch 5 (Laws of Motion)', prerequisites: ['vectors', 'kinematics'],
    aliases: ['newtons laws', 'newtons laws of motion', 'laws of motion', 'nlm', 'friction', 'free body diagram', 'tension in strings'],
    description: 'The three laws, free-body diagrams, tension, normal force and friction.',
    rootCauseTip: "Revisit free-body diagrams and Newton's second law (ΣF = ma) along perpendicular axes.",
  },
  {
    id: 'work_energy_power', name: 'Work, Energy & Power', subject: 'physics', examCodes: JEE_NEET,
    chapter: 'Class 11 Ch 6 (Work, Energy and Power)', prerequisites: ['newtons_laws'],
    aliases: ['work energy', 'work energy and power', 'work energy power', 'conservation of energy', 'work energy theorem', 'kinetic energy', 'potential energy'],
    description: 'Work-energy theorem, conservative forces, potential energy curves and conservation of mechanical energy.',
    rootCauseTip: 'Master the work-energy theorem (W_net = ΔK) and tell conservative from non-conservative forces.',
  },
  {
    id: 'circular_motion', name: 'Circular Motion', subject: 'physics', examCodes: JEE_NEET,
    chapter: 'Class 11 Ch 4–5 (Uniform Circular Motion)', prerequisites: ['kinematics', 'newtons_laws'],
    aliases: ['circular motion', 'uniform circular motion', 'centripetal force', 'centripetal acceleration', 'banking of roads'],
    description: 'Centripetal acceleration (v²/r), banking of roads and non-uniform circular motion.',
    rootCauseTip: 'Centripetal force is not an extra force: it is the net radial component of real forces.',
  },
  {
    id: 'center_of_mass', name: 'Center of Mass & Linear Momentum', subject: 'physics', examCodes: JEE_NEET,
    chapter: 'Class 11 Ch 7 (System of Particles)', prerequisites: ['newtons_laws', 'work_energy_power'],
    aliases: ['center of mass', 'centre of mass', 'system of particles', 'collisions', 'conservation of momentum', 'conservation of linear momentum', 'impulse'],
    description: 'Centre of mass of discrete and continuous bodies, momentum conservation and collisions.',
    rootCauseTip: 'Review centre-of-mass formulas for standard shapes and momentum conservation in collisions.',
  },
  {
    id: 'torque_equilibrium', name: 'Torque & Static Equilibrium', subject: 'physics', examCodes: JEE_NEET,
    chapter: 'Class 11 Ch 7 (Equilibrium of Rigid Bodies)', prerequisites: ['vectors', 'newtons_laws'],
    aliases: ['torque', 'rotational equilibrium', 'static equilibrium', 'equilibrium of rigid bodies', 'moment of a force'],
    description: 'Torque (τ = r × F) and the conditions for translational and rotational equilibrium.',
    rootCauseTip: 'Choose an axis through unknown forces so they drop out of the torque balance (Στ = 0).',
  },
  {
    id: 'rotational_dynamics', name: 'Rotational Dynamics & Moment of Inertia', subject: 'physics', examCodes: JEE_NEET,
    chapter: 'Class 11 Ch 7 (Rotational Motion)', prerequisites: ['torque_equilibrium', 'work_energy_power', 'circular_motion', 'center_of_mass'],
    aliases: ['rotational motion', 'rotational mechanics', 'rotational dynamics', 'moment of inertia', 'angular momentum', 'rolling motion', 'rolling without slipping'],
    description: 'Moment of inertia, parallel and perpendicular axis theorems, angular momentum and rolling.',
    rootCauseTip: 'Make sure τ = Iα and the parallel axis theorem (I = I_cm + Md²) are solid before rolling problems.',
  },
  {
    id: 'gravitation', name: 'Gravitation', subject: 'physics', examCodes: JEE_NEET,
    chapter: 'Class 11 Ch 8 (Gravitation)', prerequisites: ['newtons_laws', 'circular_motion', 'work_energy_power'],
    aliases: ['gravitation', 'gravitational potential', 'escape velocity', 'keplers laws', 'satellite motion', 'orbital velocity'],
    description: "Universal gravitation, field and potential, escape velocity and Kepler's laws.",
    rootCauseTip: 'Connect gravitational potential energy (−GMm/r) back to the work-energy principle.',
  },
  // ── Physics: electricity ────────────────────────────────────────────────────────────────────
  {
    id: 'electrostatics', name: 'Electrostatics', subject: 'physics', examCodes: JEE_NEET,
    chapter: 'Class 12 Ch 1–2 (Electric Charges, Fields & Potential)', prerequisites: ['vectors', 'newtons_laws', 'work_energy_power'],
    aliases: ['electrostatics', 'electric charges and fields', 'coulombs law', 'electric field', 'gauss law', 'gausss law', 'electric dipole', 'electrostatic potential', 'electric potential', 'electric potential energy'],
    description: "Coulomb's law, superposition, field lines, Gauss's law and electric potential.",
    rootCauseTip: 'Superposition of fields is vector addition — review component decomposition.',
  },
  {
    id: 'current_electricity', name: 'Current Electricity', subject: 'physics', examCodes: JEE_NEET,
    chapter: 'Class 12 Ch 3 (Current Electricity)', prerequisites: ['electrostatics'],
    aliases: ['current electricity', 'kirchhoffs laws', 'wheatstone bridge', 'drift velocity', 'ohms law', 'potentiometer'],
    description: "Ohm's law, drift velocity, Kirchhoff's laws, potentiometer and circuit analysis.",
    rootCauseTip: "Practise Kirchhoff's loop rule, tracking potential drops across each element.",
  },
  // ── Chemistry ───────────────────────────────────────────────────────────────────────────────
  {
    id: 'atomic_structure', name: 'Atomic Structure', subject: 'chemistry', examCodes: JEE_NEET,
    chapter: 'Class 11 Ch 2 (Structure of Atom)', prerequisites: [],
    aliases: ['atomic structure', 'structure of atom', 'bohr model', 'quantum numbers', 'electronic configuration'],
    description: 'Bohr model, de Broglie relation, uncertainty principle, orbitals and electronic configuration.',
    rootCauseTip: 'Review the Aufbau, Pauli and Hund rules and what each quantum number describes.',
  },
  {
    id: 'chemical_bonding', name: 'Chemical Bonding & Molecular Structure', subject: 'chemistry', examCodes: JEE_NEET,
    chapter: 'Class 11 Ch 4 (Chemical Bonding)', prerequisites: ['atomic_structure'],
    aliases: ['chemical bonding', 'chemical bonding and molecular structure', 'vsepr', 'vsepr theory', 'hybridisation', 'hybridization', 'molecular orbital theory'],
    description: 'Ionic and covalent bonds, Lewis structures, VSEPR, hybridisation and MOT.',
    rootCauseTip: 'Get VSEPR shapes and sp/sp²/sp³ hybridisation solid before reaction chemistry.',
  },
  {
    id: 'organic_goc', name: 'General Organic Chemistry', subject: 'chemistry', examCodes: JEE_NEET,
    chapter: 'Class 11 Ch 8 (Organic Chemistry: Basic Principles)', prerequisites: ['chemical_bonding'],
    aliases: ['goc', 'general organic chemistry', 'organic chemistry some basic principles and techniques', 'inductive effect', 'resonance effect', 'hyperconjugation', 'carbocation stability'],
    description: 'Inductive effect, resonance, hyperconjugation, electrophiles/nucleophiles and intermediate stability.',
    rootCauseTip: 'Most organic mechanism trouble is intermediate stability — re-master carbocation and radical stability.',
  },
  // ── Mathematics (JEE only — NEET has no maths paper) ────────────────────────────────────────
  {
    id: 'functions_relations', name: 'Relations & Functions', subject: 'mathematics', examCodes: JEE,
    chapter: 'Class 11 Ch 2 / Class 12 Ch 1 (Relations and Functions)', prerequisites: [],
    aliases: ['functions', 'relations and functions', 'sets relations and functions', 'domain and range', 'composite functions'],
    description: 'Domain, range, one-one and onto functions, composition and graphs.',
    rootCauseTip: 'Revisit domain and range restrictions before continuity and differentiation.',
  },
  {
    id: 'differentiation', name: 'Limits, Continuity & Differentiation', subject: 'mathematics', examCodes: JEE,
    chapter: 'Class 12 Ch 5 (Continuity and Differentiability)', prerequisites: ['functions_relations'],
    aliases: ['differentiation', 'derivatives', 'chain rule', 'limits', 'limits and derivatives', 'continuity and differentiability', 'limit continuity and differentiability'],
    description: 'Limits, continuity, product/quotient/chain rules and rates of change.',
    rootCauseTip: 'Review the chain rule for composite functions and the standard derivatives.',
  },
  {
    id: 'integral_calculus', name: 'Integral Calculus', subject: 'mathematics', examCodes: JEE,
    chapter: 'Class 12 Ch 7–8 (Integrals & Applications)', prerequisites: ['differentiation'],
    aliases: ['integration', 'integrals', 'integral calculus', 'indefinite integration', 'definite integrals', 'definite integration', 'integration by parts'],
    description: 'Antiderivatives, substitution, integration by parts, partial fractions and definite integrals.',
    rootCauseTip: 'Integration reverses differentiation — make substitution (u = g(x)) automatic first.',
  },
];

export const conceptGraphService = new ConceptGraphService();
