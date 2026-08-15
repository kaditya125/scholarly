/**
 * Syllabus Diff & Change Detection Engine
 * Compares two versions of an official examination syllabus to accurately detect
 * additions, deletions, structural changes, and subtopic modifications.
 */

import { ExamSyllabus, ExamStage, ExamPaper, ExamSubject, ExamTopic } from '../../types/exam.types';

export interface TopicChange {
  stageId: string;
  stageName: string;
  subjectId: string;
  subjectName: string;
  topicId: string;
  topicName: string;
  type: 'ADDED' | 'REMOVED' | 'MODIFIED';
  details: {
    addedSubtopics?: string[];
    removedSubtopics?: string[];
    nameChanged?: { from: string; to: string };
    marksChanged?: { from?: number; to?: number };
  };
}

export interface SyllabusDiffReport {
  examId: string;
  fromVersion: string;
  toVersion: string;
  hasChanges: boolean;
  totalAddedTopics: number;
  totalRemovedTopics: number;
  totalModifiedTopics: number;
  changes: TopicChange[];
  summary: string[];
}

export class SyllabusDiffService {
  /**
   * Flattens a syllabus into a lookup map of TopicId -> { stage, paper, subject, topic }
   */
  private flattenTopics(syllabus: ExamSyllabus) {
    const map = new Map<string, { stage: ExamStage; paper: ExamPaper; subject: ExamSubject; topic: ExamTopic }>();

    for (const stage of syllabus.stages || []) {
      for (const paper of stage.papers || []) {
        for (const subject of paper.subjects || []) {
          for (const topic of subject.topics || []) {
            map.set(topic.topicId, { stage, paper, subject, topic });
          }
        }
      }
    }

    return map;
  }

  /**
   * Compares a baseline syllabus against a newer target syllabus version.
   */
  public compare(baseSyllabus: ExamSyllabus, targetSyllabus: ExamSyllabus): SyllabusDiffReport {
    const baseMap = this.flattenTopics(baseSyllabus);
    const targetMap = this.flattenTopics(targetSyllabus);

    const changes: TopicChange[] = [];
    const summary: string[] = [];

    // 1. Check for Added or Modified Topics in Target
    for (const [topicId, targetEntry] of targetMap.entries()) {
      const baseEntry = baseMap.get(topicId);

      if (!baseEntry) {
        // Newly added topic
        changes.push({
          stageId: targetEntry.stage.stageId,
          stageName: targetEntry.stage.name,
          subjectId: targetEntry.subject.subjectId,
          subjectName: targetEntry.subject.name,
          topicId,
          topicName: targetEntry.topic.name,
          type: 'ADDED',
          details: {
            addedSubtopics: (targetEntry.topic.subtopics || []).map((s) => s.name),
          },
        });
        summary.push(
          `[+] Added topic '${targetEntry.topic.name}' in ${targetEntry.stage.name} (${targetEntry.subject.name})`
        );
      } else {
        // Topic exists in both — check for modifications
        const nameChanged =
          baseEntry.topic.name !== targetEntry.topic.name
            ? { from: baseEntry.topic.name, to: targetEntry.topic.name }
            : undefined;

        const baseSubtopics = new Set((baseEntry.topic.subtopics || []).map((s) => s.name.trim().toLowerCase()));
        const targetSubtopics = new Set((targetEntry.topic.subtopics || []).map((s) => s.name.trim().toLowerCase()));

        const addedSubtopics = (targetEntry.topic.subtopics || [])
          .map((s) => s.name)
          .filter((name) => !baseSubtopics.has(name.trim().toLowerCase()));

        const removedSubtopics = (baseEntry.topic.subtopics || [])
          .map((s) => s.name)
          .filter((name) => !targetSubtopics.has(name.trim().toLowerCase()));

        const marksChanged =
          baseEntry.subject.marks !== targetEntry.subject.marks
            ? { from: baseEntry.subject.marks, to: targetEntry.subject.marks }
            : undefined;

        if (nameChanged || addedSubtopics.length > 0 || removedSubtopics.length > 0 || marksChanged) {
          changes.push({
            stageId: targetEntry.stage.stageId,
            stageName: targetEntry.stage.name,
            subjectId: targetEntry.subject.subjectId,
            subjectName: targetEntry.subject.name,
            topicId,
            topicName: targetEntry.topic.name,
            type: 'MODIFIED',
            details: {
              nameChanged,
              addedSubtopics: addedSubtopics.length > 0 ? addedSubtopics : undefined,
              removedSubtopics: removedSubtopics.length > 0 ? removedSubtopics : undefined,
              marksChanged,
            },
          });

          if (addedSubtopics.length > 0) {
            summary.push(
              `[*] '${targetEntry.topic.name}' (${targetEntry.subject.name}): Added subtopics [${addedSubtopics.join(', ')}]`
            );
          }
          if (removedSubtopics.length > 0) {
            summary.push(
              `[-] '${targetEntry.topic.name}' (${targetEntry.subject.name}): Removed subtopics [${removedSubtopics.join(', ')}]`
            );
          }
        }
      }
    }

    // 2. Check for Removed Topics in Target (present in base but missing in target)
    for (const [topicId, baseEntry] of baseMap.entries()) {
      if (!targetMap.has(topicId)) {
        changes.push({
          stageId: baseEntry.stage.stageId,
          stageName: baseEntry.stage.name,
          subjectId: baseEntry.subject.subjectId,
          subjectName: baseEntry.subject.name,
          topicId,
          topicName: baseEntry.topic.name,
          type: 'REMOVED',
          details: {
            removedSubtopics: (baseEntry.topic.subtopics || []).map((s) => s.name),
          },
        });
        summary.push(
          `[-] Removed topic '${baseEntry.topic.name}' from ${baseEntry.stage.name} (${baseEntry.subject.name})`
        );
      }
    }

    const totalAdded = changes.filter((c) => c.type === 'ADDED').length;
    const totalRemoved = changes.filter((c) => c.type === 'REMOVED').length;
    const totalModified = changes.filter((c) => c.type === 'MODIFIED').length;

    return {
      examId: targetSyllabus.examId,
      fromVersion: baseSyllabus.version,
      toVersion: targetSyllabus.version,
      hasChanges: changes.length > 0,
      totalAddedTopics: totalAdded,
      totalRemovedTopics: totalRemoved,
      totalModifiedTopics: totalModified,
      changes,
      summary,
    };
  }
}

export const syllabusDiffService = new SyllabusDiffService();
