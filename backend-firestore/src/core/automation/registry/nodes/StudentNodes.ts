/**
 * @file StudentNodes.ts
 * @description Student data retrieval nodes for Scholarly Automation Studio.
 */

import { z } from 'zod';
import { WorkflowNodeHandler } from '../WorkflowNodeRegistry';
import { WorkflowExecutionContext } from '../../types/workflow.types';
import { userProfileService } from '../../../../services/userProfile.service';
import { studentContextService } from '../../../../services/studentContext.service';
import { db } from '../../../../config/firebase';

export const GetStudentProfileNode: WorkflowNodeHandler = {
  type: 'GET_STUDENT_PROFILE',
  category: 'Student',
  label: 'Get Student Profile',
  description: 'Retrieves verified profile data, target exam, target year, and preparation preferences.',
  icon: 'User',
  requiresStudent: true,
  configSchema: z.object({
    studentIdField: z.string().optional()
  }),
  inputSchema: z.record(z.unknown()),
  outputSchema: z.object({
    studentId: z.string(),
    targetExam: z.string().optional(),
    targetYear: z.string().optional(),
    preparationLevel: z.string().optional(),
    preferredLanguage: z.string().optional(),
    classLevel: z.string().optional(),
    stream: z.string().optional(),
    goal: z.string().optional()
  }),
  validateConfig() {
    return { valid: true };
  },
  async execute(ctx: WorkflowExecutionContext) {
    const studentId = ctx.studentId;
    if (!studentId) {
      throw new Error('[GetStudentProfileNode] Missing studentId in workflow execution context.');
    }

    const profile = await userProfileService.getProfile(studentId);
    if (!profile) {
      throw new Error(`[GetStudentProfileNode] Student profile not found for ID: ${studentId}`);
    }

    return {
      studentId,
      targetExam: profile.targetExam,
      targetYear: profile.targetYear,
      preparationLevel: profile.preparationLevel,
      preferredLanguage: profile.preferredLanguage,
      classLevel: profile.classLevel,
      stream: profile.stream,
      goal: profile.goal
    };
  }
};

export const GetStudentContextNode: WorkflowNodeHandler = {
  type: 'GET_STUDENT_CONTEXT',
  category: 'Student',
  label: 'Get Student Context',
  description: 'Aggregates educational context including exam countdowns, comprehension speed, and study analytics.',
  icon: 'Brain',
  requiresStudent: true,
  requiresExamContext: true,
  configSchema: z.object({}),
  inputSchema: z.record(z.unknown()),
  outputSchema: z.object({
    studentId: z.string(),
    examContext: z
      .object({
        examId: z.string(),
        examName: z.string(),
        conductingAuthority: z.string(),
        cycleId: z.string().optional()
      })
      .optional(),
    learningSpeed: z.string().optional(),
    comprehensionDepth: z.string().optional()
  }),
  validateConfig() {
    return { valid: true };
  },
  async execute(ctx: WorkflowExecutionContext) {
    const studentId = ctx.studentId;
    if (!studentId) {
      throw new Error('[GetStudentContextNode] Missing studentId in context.');
    }

    const studentCtx = await studentContextService.aggregateContext(studentId);
    return {
      studentId,
      examContext: studentCtx.examContext
        ? {
            examId: studentCtx.examContext.examId,
            examName: studentCtx.examContext.examName,
            conductingAuthority: studentCtx.examContext.conductingAuthority,
            cycleId: studentCtx.examContext.cycleId
          }
        : undefined,
      learningSpeed: studentCtx.memory?.learningSpeed,
      comprehensionDepth: studentCtx.memory?.comprehensionDepth
    };
  }
};

export const GetStudentStatsNode: WorkflowNodeHandler = {
  type: 'GET_STUDENT_STATS',
  category: 'Student',
  label: 'Get Student Stats',
  description: 'Retrieves historical quiz and test performance statistics for the student.',
  icon: 'BarChart',
  requiresStudent: true,
  configSchema: z.object({}),
  inputSchema: z.record(z.unknown()),
  outputSchema: z.object({
    studentId: z.string(),
    totalQuizzesTaken: z.number(),
    averageAccuracy: z.number(),
    lastActiveDate: z.string().optional()
  }),
  validateConfig() {
    return { valid: true };
  },
  async execute(ctx: WorkflowExecutionContext) {
    const studentId = ctx.studentId;
    if (!studentId) {
      throw new Error('[GetStudentStatsNode] Missing studentId in context.');
    }

    const snap = await db.collection('userStats').doc(studentId).get();
    if (!snap.exists) {
      return {
        studentId,
        totalQuizzesTaken: 0,
        averageAccuracy: 0,
        lastActiveDate: undefined
      };
    }

    const data = snap.data() || {};
    return {
      studentId,
      totalQuizzesTaken: data.totalQuizzes || data.totalTestsAttempted || 0,
      averageAccuracy: data.averageScore || data.averageAccuracy || 0,
      lastActiveDate: data.lastActiveDate || data.updatedAt
    };
  }
};
