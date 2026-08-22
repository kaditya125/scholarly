/**
 * @file SyllabusNodes.ts
 * @description Canonical syllabus resolution and curriculum navigation nodes for Scholarly Automation Studio.
 */

import { z } from 'zod';
import { WorkflowNodeHandler } from '../WorkflowNodeRegistry';
import { WorkflowExecutionContext } from '../../types/workflow.types';
import { canonicalSyllabusResolver } from '../../../../services/exam/canonicalSyllabusResolver';
import { syllabusGraphService } from '../../../../services/exam/syllabusGraph.service';
import { masteryEngine, ConceptMastery } from '../../../intelligence/MasteryEngine';

export const ResolveSyllabusNode: WorkflowNodeHandler = {
  type: 'RESOLVE_SYLLABUS',
  category: 'Syllabus',
  label: 'Resolve Current Syllabus',
  description: 'Resolves verified CURRENT canonical syllabus and graph structure for target exam and cycle.',
  icon: 'BookOpen',
  requiresExamContext: true,
  requiresCanonicalContext: true,
  configSchema: z.object({
    examId: z.string().optional(),
    cycleId: z.string().optional()
  }),
  inputSchema: z.record(z.unknown()),
  outputSchema: z.object({
    status: z.enum(['RESOLVED', 'NO_CANONICAL_SYLLABUS']),
    examId: z.string(),
    cycleId: z.string(),
    syllabusId: z.string().optional(),
    version: z.string().optional(),
    nodeCount: z.number().optional(),
    reason: z.string().optional()
  }),
  validateConfig() {
    return { valid: true };
  },
  async execute(ctx: WorkflowExecutionContext, config) {
    const examId = config.examId || ctx.examContext?.examId;
    const cycleId = config.cycleId || ctx.examContext?.cycleId || String(new Date().getFullYear());

    if (!examId) {
      throw new Error('[ResolveSyllabusNode] Missing examId in config or execution context.');
    }

    const resolution = await canonicalSyllabusResolver.resolve(examId, cycleId);
    if (resolution.outcome === 'NO_CANONICAL_SYLLABUS') {
      return {
        status: 'NO_CANONICAL_SYLLABUS',
        examId,
        cycleId,
        reason: resolution.reason
      };
    }

    return {
      status: 'RESOLVED',
      examId,
      cycleId,
      syllabusId: resolution.syllabusId,
      version: resolution.version,
      nodeCount: resolution.nodes.length
    };
  }
};

export const GetCanonicalNode: WorkflowNodeHandler = {
  type: 'GET_CANONICAL_NODE',
  category: 'Syllabus',
  label: 'Get Canonical Node',
  description: 'Retrieves metadata, hierarchy path, and parent information for a specific canonical syllabus node.',
  icon: 'FileText',
  requiresCanonicalContext: true,
  configSchema: z.object({
    examId: z.string().optional(),
    cycleId: z.string().optional(),
    syllabusId: z.string().optional(),
    nodeId: z.string().min(1)
  }),
  inputSchema: z.record(z.unknown()),
  outputSchema: z.object({
    nodeId: z.string(),
    label: z.string(),
    type: z.string(),
    examId: z.string(),
    cycleId: z.string(),
    syllabusId: z.string()
  }),
  validateConfig(config) {
    if (!config.nodeId) {
      return { valid: false, errors: ['nodeId is required.'] };
    }
    return { valid: true };
  },
  async execute(ctx: WorkflowExecutionContext, config) {
    const examId = config.examId || ctx.examContext?.examId;
    const cycleId = config.cycleId || ctx.examContext?.cycleId;
    const syllabusId = config.syllabusId || ctx.examContext?.syllabusId;

    if (!examId) {
      throw new Error('[GetCanonicalNode] Missing examId in context.');
    }

    const node = await syllabusGraphService.getSyllabusNode({
      examId,
      nodeId: config.nodeId,
      cycleId,
      syllabusId
    });

    if (!node) {
      throw new Error(`[GetCanonicalNode] Node "${config.nodeId}" not found in syllabus graph.`);
    }

    return {
      nodeId: node.id,
      label: node.label,
      type: node.type,
      examId: node.examId,
      cycleId: node.cycleId,
      syllabusId: node.syllabusId
    };
  }
};

export const GetWeakTopicsNode: WorkflowNodeHandler = {
  type: 'GET_WEAK_TOPICS',
  category: 'Syllabus',
  label: 'Get Weak Canonical Topics',
  description: 'Extracts student weak topics anchored strictly to verified canonical syllabus node IDs.',
  icon: 'AlertCircle',
  requiresStudent: true,
  configSchema: z.object({
    maxCount: z.number().int().positive().default(5),
    thresholdAccuracy: z.number().min(0).max(1).default(0.6)
  }),
  inputSchema: z.record(z.unknown()),
  outputSchema: z.object({
    studentId: z.string(),
    weakTopics: z.array(
      z.object({
        topic: z.string(),
        accuracy: z.number(),
        masteryScore: z.number(),
        syllabusNodeId: z.string().optional()
      })
    )
  }),
  validateConfig() {
    return { valid: true };
  },
  async execute(ctx: WorkflowExecutionContext, config) {
    const studentId = ctx.studentId;
    if (!studentId) {
      throw new Error('[GetWeakTopicsNode] Missing studentId in execution context.');
    }

    const allConcepts = (await masteryEngine.listConcepts(studentId)) as ConceptMastery[];
    const weak = allConcepts
      .filter((c: ConceptMastery) => c.masteryScore < (config.thresholdAccuracy ?? 0.6) && c.attempts > 0)
      .sort((a: ConceptMastery, b: ConceptMastery) => a.masteryScore - b.masteryScore)
      .slice(0, config.maxCount ?? 5);

    return {
      studentId,
      weakTopics: weak.map((c: ConceptMastery) => ({
        topic: c.title,
        accuracy: c.successRate,
        masteryScore: c.masteryScore,
        syllabusNodeId: c.syllabusNodeId
      }))
    };
  }
};
