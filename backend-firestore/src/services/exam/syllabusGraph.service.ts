/**
 * Syllabus Graph Service
 * Builds and queries global hierarchical syllabus knowledge graphs for examinations.
 * Connects Stages, Papers, Subjects, Topics, and Subtopics with semantic edges.
 */

import { logger } from '../../utils/logger';
import { db } from '../../config/firebase';
import { ExamSyllabus, ExamTopic } from '../../types/exam.types';
import { buildCanonicalGraph, validateCanonicalGraph } from './syllabusCanonicalGraph';

export interface SyllabusGraphNode {
  id: string; // e.g. "stage:tier_1", "topic:ssc_cgl_quant_algebra"
  label: string;
  type: 'STAGE' | 'PAPER' | 'SUBJECT' | 'TOPIC' | 'SUBTOPIC';
  examId: string;
  cycleId: string;
  syllabusId: string;
  parentEntityId?: string;
  marks?: number;
  order: number;
}

export interface SyllabusGraphEdge {
  id: string;
  sourceId: string;
  targetId: string;
  relationType: 'PART_OF' | 'PREREQUISITE_OF' | 'RELATED_TO';
  weight: number;
}

export class SyllabusGraphService {
  /**
   * Firestore location of ONE syllabus version's graph.
   *
   * `exam_syllabi_graphs/{examId}/versions/{syllabusId}/nodes`
   *
   * The version is part of the PATH, not a field to be filtered on, so isolation is a property of
   * where the data lives rather than a rule every caller has to remember. The previous layout put
   * every version's nodes in one `exam_syllabi_graphs/{examId}/nodes` collection keyed by a node id
   * that contained no cycle or version — so ingesting SSC CGL 2026 overwrote the 2024 nodes in
   * place, silently repointing any 2024 evidence at the 2026 definition. Read-time filtering could
   * never have recovered that: the older rows were already gone.
   *
   * Private on purpose. Nothing outside this service composes these paths.
   */
  private versionRef(examId: string, syllabusId: string) {
    return db.collection('exam_syllabi_graphs').doc(examId).collection('versions').doc(syllabusId);
  }
  private nodesCol(examId: string, syllabusId: string) {
    return this.versionRef(examId, syllabusId).collection('nodes');
  }
  private edgesCol(examId: string, syllabusId: string) {
    return this.versionRef(examId, syllabusId).collection('edges');
  }

  /**
   * Builds, validates and persists ONE syllabus version's graph.
   *
   * Writes are confined to that version's own subtree, so an ingestion can neither mutate nor
   * delete another version's nodes — a topic dropped from the 2026 syllabus simply never appears
   * in the 2026 graph, while the 2024 graph that still contains it is untouched.
   *
   * Validation runs BEFORE any write. A malformed extraction is rejected whole rather than
   * partially persisted, and the failure is thrown rather than degraded into an empty graph:
   * "this syllabus is broken" and "this syllabus has no topics" must stay distinguishable, or
   * coverage would report a real 0% denominator for an exam whose extraction merely failed.
   */
  async buildSyllabusGraph(syllabus: ExamSyllabus): Promise<{ nodeCount: number; edgeCount: number }> {
    const { examId, cycleId, syllabusId } = syllabus;
    if (!examId || !cycleId || !syllabusId) {
      throw new Error(
        `[SyllabusGraph] refusing to build: incomplete version identity ` +
        `(examId=${examId}, cycleId=${cycleId}, syllabusId=${syllabusId})`,
      );
    }

    // Identity is minted here, by the application, from the version's authoritative coordinates.
    // Any *Id slug present on the incoming document (historically produced by the extraction model)
    // is deliberately ignored — see syllabusCanonicalGraph for why that could orphan evidence.
    const graph = buildCanonicalGraph(syllabus);

    const validation = validateCanonicalGraph(graph, { examId, cycleId, syllabusId });
    if (!validation.valid) {
      logger.error('[SyllabusGraph] validation failed; graph NOT published', {
        examId, cycleId, syllabusId, errorCount: validation.errors.length,
        errors: validation.errors.slice(0, 10),
      });
      const summary = validation.errors.slice(0, 5)
        .map((e) => `${e.code}${e.nodeId ? ` (${e.nodeId})` : ''}: ${e.detail}`).join('; ');
      throw new Error(
        `[SyllabusGraph] ${syllabusId} failed validation with ${validation.errors.length} error(s): ${summary}`,
      );
    }

    const nodesCol = this.nodesCol(examId, syllabusId);
    const edgesCol = this.edgesCol(examId, syllabusId);

    // Replace this version's own contents so a re-ingestion cannot leave nodes that the newer
    // extraction dropped. Scoped strictly to this version's subtree — other versions are never
    // read or written here.
    const [staleNodes, staleEdges] = await Promise.all([nodesCol.get(), edgesCol.get()]);

    const batch = db.batch();
    for (const d of staleNodes.docs) batch.delete(d.ref);
    for (const d of staleEdges.docs) batch.delete(d.ref);
    for (const node of graph.nodes) batch.set(nodesCol.doc(this.nodeDocId(node.id)), node);
    for (const edge of graph.edges) batch.set(edgesCol.doc(this.edgeDocId(edge.id)), edge);

    // Version manifest, so a read can enumerate versions without scanning node subcollections.
    batch.set(this.versionRef(examId, syllabusId), {
      examId, cycleId, syllabusId,
      version: syllabus.version ?? null,
      status: syllabus.status ?? null,
      sourceDocumentUrl: syllabus.sourceDocumentUrl ?? null,
      sourceDocumentHash: syllabus.sourceDocumentHash ?? null,
      nodeCount: graph.nodes.length,
      edgeCount: graph.edges.length,
      validated: true,
      builtAt: Date.now(),
    }, { merge: true });

    await batch.commit();

    logger.info('[SyllabusGraph] published version graph', {
      examId, cycleId, syllabusId, nodeCount: graph.nodes.length, edgeCount: graph.edges.length,
      replacedNodes: staleNodes.size,
    });
    return { nodeCount: graph.nodes.length, edgeCount: graph.edges.length };
  }

  /**
   * Fast in-memory extraction of all syllabus topic nodes for an exam from an ExamSyllabus.
   */
  public extractTopicsFromSyllabus(syllabus: ExamSyllabus): ExamTopic[] {
    const list: ExamTopic[] = [];
    for (const stage of syllabus.stages || []) {
      for (const paper of stage.papers || []) {
        for (const subject of paper.subjects || []) {
          for (const topic of subject.topics || []) {
            list.push(topic);
          }
        }
      }
    }
    return list;
  }

  // ── Read side ─────────────────────────────────────────────────────────────────────────────
  //
  // The graph was write-only until now: buildSyllabusGraph persisted it and nothing ever read it
  // back. That is why questions carry LLM-invented topic STRINGS instead of canonical node ids,
  // and why per-student syllabus coverage had no authoritative denominator.
  //
  // These reads exist to serve two callers:
  //   #91 — question generation, so the APPLICATION picks the syllabus node before the model
  //         writes any content and the model never controls identity;
  //   #89 — coverage, so the denominator is the set of nodes genuinely applicable to the
  //         student's own exam and syllabus version.
  //
  // Version isolation is enforced on every read rather than left to callers. A 2026 question must
  // never resolve against a 2024 syllabus just because a label matches; that is precisely the
  // silent mis-association this pipeline exists to prevent.

  /** Firestore document id for a node id (mirrors the write path's escaping exactly). */
  private nodeDocId(nodeId: string): string {
    return nodeId.replace(/[:/]/g, '_');
  }
  private edgeDocId(edgeId: string): string {
    return edgeId.replace(/[:/]|->/g, '_');
  }

  /**
   * Version manifests for an exam, newest-built first, optionally narrowed by cycle.
   *
   * Reading version metadata from manifest documents rather than scanning node subcollections
   * keeps an unfiltered read to one query plus one per version, and needs no composite index.
   */
  private async listVersions(examId: string, cycleId?: string): Promise<Array<{ syllabusId: string; cycleId: string }>> {
    const snap = await db.collection('exam_syllabi_graphs').doc(examId).collection('versions').get();
    return snap.docs
      .map((d) => d.data() as { syllabusId: string; cycleId: string; builtAt?: number })
      .filter((v) => (cycleId ? v.cycleId === cycleId : true))
      .sort((a: any, b: any) => (b.builtAt ?? 0) - (a.builtAt ?? 0))
      .map((v) => ({ syllabusId: v.syllabusId, cycleId: v.cycleId }));
  }

  /**
   * All canonical nodes for an exam, optionally narrowed by cycle, syllabus version and node type.
   *
   * cycleId/syllabusId are applied as post-filters rather than composite queries so this needs no
   * additional Firestore index; node counts per exam are small (subjects/topics/subtopics), so
   * reading the exam's node set and filtering in memory is the cheaper trade here.
   */
  async getSyllabusNodes(params: {
    examId: string;
    cycleId?: string;
    syllabusId?: string;
    type?: SyllabusGraphNode['type'];
  }): Promise<SyllabusGraphNode[]> {
    const { examId, cycleId, syllabusId, type } = params;
    if (!examId) return [];
    try {
      // Version isolation is structural: with a syllabusId we read exactly that version's subtree,
      // and without one we read each matching version's own subtree. There is no shared collection
      // in which two versions could ever be confused for one another.
      const versions = syllabusId
        ? [{ syllabusId, cycleId: cycleId ?? '' }]
        : await this.listVersions(examId, cycleId);

      const collected: SyllabusGraphNode[] = [];
      for (const v of versions) {
        const snap = await this.nodesCol(examId, v.syllabusId).get();
        collected.push(...snap.docs.map((d) => d.data() as SyllabusGraphNode));
      }

      return collected
        // Retained as defence in depth. The path already guarantees these, so a mismatch means
        // corrupt data rather than a filtering miss — and silently returning it would be worse.
        .filter((n) => n.examId === examId)
        .filter((n) => (cycleId ? n.cycleId === cycleId : true))
        .filter((n) => (syllabusId ? n.syllabusId === syllabusId : true))
        .filter((n) => (type ? n.type === type : true))
        .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
    } catch (err: any) {
      // Rethrow: callers must distinguish "syllabus unavailable" from "syllabus has no nodes".
      // Swallowing this would let coverage report 0% for an exam whose syllabus simply failed
      // to load — a fabricated measurement, which is the failure mode this programme removes.
      logger.error('[SyllabusGraph] node read failed', { examId, error: err?.message });
      throw err;
    }
  }

  /**
   * One node, validated against the exam (and cycle/syllabus when supplied).
   *
   * Returns null rather than a best-effort match when the node does not exist or belongs to a
   * different exam/version. There is deliberately NO fuzzy fallback: identity is either exact or
   * absent.
   */
  async getSyllabusNode(params: {
    examId: string;
    nodeId: string;
    cycleId?: string;
    syllabusId?: string;
  }): Promise<SyllabusGraphNode | null> {
    const { examId, nodeId, cycleId, syllabusId } = params;
    if (!examId || !nodeId) return null;

    // With a syllabusId this is a single direct document read in that version's subtree. Without
    // one, each version is probed separately — a node can only ever be found inside the version
    // that actually contains it, so a 2024 id cannot surface from the 2026 graph even if both
    // versions describe a topic of the same name.
    const versions = syllabusId
      ? [{ syllabusId, cycleId: cycleId ?? '' }]
      : await this.listVersions(examId, cycleId);

    let node: SyllabusGraphNode | null = null;
    for (const v of versions) {
      const snap = await this.nodesCol(examId, v.syllabusId).doc(this.nodeDocId(nodeId)).get();
      if (snap.exists) { node = snap.data() as SyllabusGraphNode; break; }
    }
    if (!node) return null;
    // Defence in depth: the document lives under the exam, but the node carries its own examId
    // and a mismatch would mean corrupt data rather than a miss.
    if (node.examId !== examId) return null;
    if (cycleId && node.cycleId !== cycleId) return null;
    if (syllabusId && node.syllabusId !== syllabusId) return null;
    return node;
  }

  /**
   * Validation used at the question-persistence boundary.
   *
   * `allowedTypes` defaults to the levels a question can meaningfully be authored against —
   * a question belongs to a TOPIC or SUBTOPIC, not to a whole STAGE or PAPER.
   */
  async validateNodeForQuestion(params: {
    examId: string;
    nodeId: string;
    cycleId?: string;
    syllabusId?: string;
    allowedTypes?: Array<SyllabusGraphNode['type']>;
  }): Promise<{ valid: boolean; node: SyllabusGraphNode | null; reason?: string }> {
    const allowed = params.allowedTypes ?? ['TOPIC', 'SUBTOPIC'];
    const node = await this.getSyllabusNode(params);
    if (!node) return { valid: false, node: null, reason: 'NODE_NOT_FOUND_FOR_EXAM_OR_VERSION' };
    if (!allowed.includes(node.type)) {
      return { valid: false, node, reason: `NODE_TYPE_NOT_VALID_FOR_QUESTION:${node.type}` };
    }
    return { valid: true, node };
  }

  /** Human-readable ancestry ("Quantitative Aptitude → Algebra"), for generation context only. */
  /**
   * Ancestry is resolved WITHIN a single version. Passing the version scope keeps this to one
   * subtree read; without it every version is read, which is still correct because canonical node
   * ids now embed the syllabusId — a 2024 id and a 2026 id for the same topic name are different
   * strings, so the lookup map cannot conflate them the way the old flat ids could.
   */
  async getNodeParentPath(
    examId: string, nodeId: string, scope?: { cycleId?: string; syllabusId?: string },
  ): Promise<string[]> {
    const nodes = await this.getSyllabusNodes({ examId, ...scope });
    const byId = new Map(nodes.map((n) => [n.id, n]));
    const path: string[] = [];
    let cursor = byId.get(nodeId);
    const seen = new Set<string>();
    while (cursor?.parentEntityId && !seen.has(cursor.id)) {
      seen.add(cursor.id); // guards against a malformed cycle in parent links
      const parent = byId.get(cursor.parentEntityId);
      if (!parent) break;
      path.unshift(parent.label);
      cursor = parent;
    }
    return path;
  }
}

export const syllabusGraphService = new SyllabusGraphService();
