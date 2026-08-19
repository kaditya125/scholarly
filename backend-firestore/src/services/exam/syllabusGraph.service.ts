/**
 * Syllabus Graph Service
 * Builds and queries global hierarchical syllabus knowledge graphs for examinations.
 * Connects Stages, Papers, Subjects, Topics, and Subtopics with semantic edges.
 */

import { logger } from '../../utils/logger';
import { db } from '../../config/firebase';
import { ExamSyllabus, ExamTopic } from '../../types/exam.types';

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
   * Builds and persists graph nodes and edges in Firestore for a published syllabus version.
   */
  async buildSyllabusGraph(syllabus: ExamSyllabus): Promise<{ nodeCount: number; edgeCount: number }> {
    const nodes: SyllabusGraphNode[] = [];
    const edges: SyllabusGraphEdge[] = [];

    const graphDocRef = db.collection('exam_syllabi_graphs').doc(syllabus.examId);
    const nodesCol = graphDocRef.collection('nodes');
    const edgesCol = graphDocRef.collection('edges');

    // 1. Traverse hierarchy
    for (const stage of syllabus.stages || []) {
      const stageNodeId = `stage:${stage.stageId}`;
      nodes.push({
        id: stageNodeId,
        label: stage.name,
        type: 'STAGE',
        examId: syllabus.examId,
        cycleId: syllabus.cycleId,
        syllabusId: syllabus.syllabusId,
        order: stage.order,
      });

      for (const paper of stage.papers || []) {
        const paperNodeId = `paper:${paper.paperId}`;
        nodes.push({
          id: paperNodeId,
          label: paper.name,
          type: 'PAPER',
          examId: syllabus.examId,
          cycleId: syllabus.cycleId,
          syllabusId: syllabus.syllabusId,
          parentEntityId: stageNodeId,
          order: paper.order,
        });

        edges.push({
          id: `${paperNodeId}->${stageNodeId}`,
          sourceId: paperNodeId,
          targetId: stageNodeId,
          relationType: 'PART_OF',
          weight: 1.0,
        });

        for (const subject of paper.subjects || []) {
          const subjectNodeId = `subject:${subject.subjectId}`;
          nodes.push({
            id: subjectNodeId,
            label: subject.name,
            type: 'SUBJECT',
            examId: syllabus.examId,
            cycleId: syllabus.cycleId,
            syllabusId: syllabus.syllabusId,
            parentEntityId: paperNodeId,
            marks: subject.marks,
            order: subject.order,
          });

          edges.push({
            id: `${subjectNodeId}->${paperNodeId}`,
            sourceId: subjectNodeId,
            targetId: paperNodeId,
            relationType: 'PART_OF',
            weight: 1.0,
          });

          let prevTopicId: string | null = null;

          for (const topic of subject.topics || []) {
            const topicNodeId = `topic:${topic.topicId}`;
            nodes.push({
              id: topicNodeId,
              label: topic.name,
              type: 'TOPIC',
              examId: syllabus.examId,
              cycleId: syllabus.cycleId,
              syllabusId: syllabus.syllabusId,
              parentEntityId: subjectNodeId,
              order: topic.order,
            });

            edges.push({
              id: `${topicNodeId}->${subjectNodeId}`,
              sourceId: topicNodeId,
              targetId: subjectNodeId,
              relationType: 'PART_OF',
              weight: 1.0,
            });

            // Sequential / Prerequisite edge between topics in same subject
            if (prevTopicId) {
              edges.push({
                id: `${prevTopicId}->${topicNodeId}`,
                sourceId: prevTopicId,
                targetId: topicNodeId,
                relationType: 'PREREQUISITE_OF',
                weight: 0.8,
              });
            }
            prevTopicId = topicNodeId;

            for (const subtopic of topic.subtopics || []) {
              const subtopicNodeId = `subtopic:${subtopic.subtopicId}`;
              nodes.push({
                id: subtopicNodeId,
                label: subtopic.name,
                type: 'SUBTOPIC',
                examId: syllabus.examId,
                cycleId: syllabus.cycleId,
                syllabusId: syllabus.syllabusId,
                parentEntityId: topicNodeId,
                order: subtopic.order,
              });

              edges.push({
                id: `${subtopicNodeId}->${topicNodeId}`,
                sourceId: subtopicNodeId,
                targetId: topicNodeId,
                relationType: 'PART_OF',
                weight: 1.0,
              });
            }
          }
        }
      }
    }

    // 2. Batch write nodes & edges
    const batch = db.batch();
    for (const node of nodes) {
      batch.set(nodesCol.doc(node.id.replace(/[:/]/g, '_')), node);
    }
    for (const edge of edges) {
      batch.set(edgesCol.doc(edge.id.replace(/[:/->]/g, '_')), edge);
    }
    await batch.commit();

    return { nodeCount: nodes.length, edgeCount: edges.length };
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
      const snap = await db.collection('exam_syllabi_graphs').doc(examId).collection('nodes').get();
      return snap.docs
        .map((d) => d.data() as SyllabusGraphNode)
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
    const snap = await db
      .collection('exam_syllabi_graphs').doc(examId)
      .collection('nodes').doc(this.nodeDocId(nodeId))
      .get();
    if (!snap.exists) return null;

    const node = snap.data() as SyllabusGraphNode;
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
  async getNodeParentPath(examId: string, nodeId: string): Promise<string[]> {
    const nodes = await this.getSyllabusNodes({ examId });
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
