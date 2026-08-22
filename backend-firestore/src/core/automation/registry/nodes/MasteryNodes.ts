/**
 * @file MasteryNodes.ts
 * @description Mastery calculation and decision layer nodes for Scholarly Automation Studio with event idempotency.
 */

import { z } from 'zod';
import { WorkflowNodeHandler } from '../WorkflowNodeRegistry';
import { WorkflowExecutionContext } from '../../types/workflow.types';
import { masteryEngine, ConceptMastery } from '../../../intelligence/MasteryEngine';
import { StudentDecisionService } from '../../../../services/studentDecision.service';
import { db } from '../../../../config/firebase';

const studentDecisionService = new StudentDecisionService();

export const GetStudentMasteryNode: WorkflowNodeHandler = {
  type: 'GET_STUDENT_MASTERY',
  category: 'Mastery',
  label: 'Get Student Mastery',
  description: 'Fetches concept-level mastery scores, learning velocity, and accuracy metrics for the student.',
  icon: 'Award',
  requiresStudent: true,
  configSchema: z.object({
    conceptId: z.string().optional(),
    minConfidence: z.number().min(0).max(1).default(0.3)
  }),
  inputSchema: z.record(z.unknown()),
  outputSchema: z.object({
    studentId: z.string(),
    concepts: z.array(
      z.object({
        conceptId: z.string(),
        title: z.string(),
        masteryScore: z.number(),
        confidence: z.number(),
        accuracy: z.number(),
        syllabusNodeId: z.string().optional()
      })
    ),
    averageMastery: z.number()
  }),
  validateConfig() {
    return { valid: true };
  },
  async execute(ctx: WorkflowExecutionContext, config) {
    const studentId = ctx.studentId;
    if (!studentId) {
      throw new Error('[GetStudentMasteryNode] Missing studentId in execution context.');
    }

    if (config.conceptId) {
      const single = await masteryEngine.get(studentId, config.conceptId);
      const concepts = single
        ? [
            {
              conceptId: single.conceptId,
              title: single.title,
              masteryScore: single.masteryScore,
              confidence: single.confidence,
              accuracy: single.successRate,
              syllabusNodeId: single.syllabusNodeId
            }
          ]
        : [];
      return {
        studentId,
        concepts,
        averageMastery: single ? single.masteryScore : 0
      };
    }

    const allConcepts = (await masteryEngine.listConcepts(studentId)) as ConceptMastery[];
    const filtered = allConcepts.filter((c: ConceptMastery) => c.confidence >= (config.minConfidence ?? 0.3));
    const avg =
      filtered.length > 0
        ? filtered.reduce((sum: number, c: ConceptMastery) => sum + c.masteryScore, 0) / filtered.length
        : 0;

    return {
      studentId,
      concepts: filtered.map((c: ConceptMastery) => ({
        conceptId: c.conceptId,
        title: c.title,
        masteryScore: c.masteryScore,
        confidence: c.confidence,
        accuracy: c.successRate,
        syllabusNodeId: c.syllabusNodeId
      })),
      averageMastery: avg
    };
  }
};

export const UpdateMasteryNode: WorkflowNodeHandler = {
  type: 'UPDATE_MASTERY',
  category: 'Mastery',
  label: 'Update Mastery',
  description: 'Records a learning event or graded quiz outcome into the student concept mastery model with idempotency.',
  icon: 'TrendingUp',
  requiresStudent: true,
  producesExternalSideEffect: true,
  supportsSimulation: true,
  configSchema: z.object({
    conceptId: z.string().min(1),
    event: z.enum(['quiz_correct', 'quiz_incorrect', 'chat', 'mistake', 'followup', 'revision']),
    title: z.string().optional(),
    subject: z.string().optional(),
    topic: z.string().optional()
  }),
  inputSchema: z.record(z.unknown()),
  outputSchema: z.object({
    success: z.boolean(),
    conceptId: z.string(),
    simulated: z.boolean(),
    idempotentReplay: z.boolean().optional()
  }),
  validateConfig(config) {
    if (!config.conceptId) {
      return { valid: false, errors: ['conceptId is required.'] };
    }
    return { valid: true };
  },
  async execute(ctx: WorkflowExecutionContext, config) {
    const studentId = ctx.studentId;
    if (!studentId) {
      throw new Error('[UpdateMasteryNode] Missing studentId in execution context.');
    }

    if (ctx.isSimulation) {
      return {
        success: true,
        conceptId: config.conceptId,
        simulated: true
      };
    }

    // Mastery Idempotency Check: Prevent duplicate EMA distortion for the same execution node
    const dedupDocId = `mastery_dedup_${ctx.executionId}_${config.conceptId}_${config.event}`;
    const dedupRef = db.collection('masteryEventsDedup').doc(dedupDocId);
    const existingSnap = await dedupRef.get();

    if (existingSnap.exists) {
      return {
        success: true,
        conceptId: config.conceptId,
        simulated: false,
        idempotentReplay: true
      };
    }

    await dedupRef.set({
      executionId: ctx.executionId,
      studentId,
      conceptId: config.conceptId,
      event: config.event,
      recordedAt: Date.now()
    });

    await masteryEngine.recordEvent(
      studentId,
      {
        id: config.conceptId,
        title: config.title,
        subject: config.subject,
        topic: config.topic
      },
      config.event
    );

    return {
      success: true,
      conceptId: config.conceptId,
      simulated: false,
      idempotentReplay: false
    };
  }
};

export const GetStudentDecisionNode: WorkflowNodeHandler = {
  type: 'GET_STUDENT_DECISION',
  category: 'Mastery',
  label: 'Get Student Decision (Gate 8)',
  description: 'Executes Gate 8 deterministic decision engine to derive readiness, priorities, and prescribed next actions.',
  icon: 'Compass',
  requiresStudent: true,
  configSchema: z.object({}),
  inputSchema: z.record(z.unknown()),
  outputSchema: z.object({
    studentId: z.string(),
    readiness: z.string(),
    primaryWeakness: z
      .object({
        topic: z.string(),
        accuracy: z.number().nullable(),
        severity: z.string(),
        topicId: z.string()
      })
      .nullable(),
    nextAction: z.object({
      code: z.string(),
      topicId: z.string().nullable(),
      reasonCodes: z.array(z.string())
    })
  }),
  validateConfig() {
    return { valid: true };
  },
  async execute(ctx: WorkflowExecutionContext) {
    const studentId = ctx.studentId;
    if (!studentId) {
      throw new Error('[GetStudentDecisionNode] Missing studentId in execution context.');
    }

    const decision = await studentDecisionService.getDecision(studentId);
    return {
      studentId,
      readiness: decision.readiness?.status || 'NOT_ENOUGH_EVIDENCE',
      primaryWeakness: decision.primaryWeakness
        ? {
            topic: decision.primaryWeakness.topicLabel || decision.primaryWeakness.topicId,
            accuracy: decision.primaryWeakness.accuracy,
            severity: decision.primaryWeakness.classification,
            topicId: decision.primaryWeakness.topicId
          }
        : null,
      nextAction: {
        code: decision.nextAction.code,
        topicId: decision.nextAction.topicId,
        reasonCodes: decision.nextAction.reasonCodes
      }
    };
  }
};
