/**
 * Syllabus Graph Service
 * Builds and queries global hierarchical syllabus knowledge graphs for examinations.
 * Connects Stages, Papers, Subjects, Topics, and Subtopics with semantic edges.
 */

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
}

export const syllabusGraphService = new SyllabusGraphService();
