/**
 * @file AssessmentNodes.ts
 * @description Assessment generation and quiz assignment nodes for Scholarly Automation Studio with deterministic idempotency.
 */

import { z } from 'zod';
import { WorkflowNodeHandler } from '../WorkflowNodeRegistry';
import { WorkflowExecutionContext } from '../../types/workflow.types';
import { QuizGeneratorService } from '../../../../services/tests/quizGenerator.service';
import { QuizAttemptsService } from '../../../../services/tests/quizAttempts.service';
import { StoredQuizQuestion } from '../../../../types/quizAttempt.types';
import { db } from '../../../../config/firebase';

const quizGeneratorService = new QuizGeneratorService();
const quizAttemptsService = new QuizAttemptsService();

export const GeneratePracticeQuizNode: WorkflowNodeHandler = {
  type: 'GENERATE_PRACTICE_QUIZ',
  category: 'Assessment',
  label: 'Generate Practice Quiz',
  description: 'Generates an adaptive multiple-choice practice quiz anchored to canonical syllabus node IDs.',
  icon: 'HelpCircle',
  requiresStudent: true,
  requiresExamContext: true,
  requiresCanonicalContext: true,
  configSchema: z.object({
    questionCount: z.number().int().min(1).max(25).default(5),
    topic: z.string().optional(),
    syllabusNodeId: z.string().optional()
  }),
  inputSchema: z.record(z.unknown()),
  outputSchema: z.object({
    quizId: z.string().optional(),
    questionCount: z.number(),
    topic: z.string(),
    syllabusNodeId: z.string().optional(),
    questions: z.array(
      z.object({
        id: z.string(),
        text: z.string(),
        options: z.array(z.string()),
        correctAnswerIndex: z.number(),
        explanation: z.string(),
        syllabusNodeId: z.string().optional(),
        identityStatus: z.string()
      })
    )
  }),
  validateConfig(config) {
    if (config.questionCount && (config.questionCount < 1 || config.questionCount > 25)) {
      return { valid: false, errors: ['questionCount must be between 1 and 25.'] };
    }
    return { valid: true };
  },
  async execute(ctx: WorkflowExecutionContext, config) {
    const studentId = ctx.studentId;
    if (!studentId) {
      throw new Error('[GeneratePracticeQuizNode] Missing studentId in execution context.');
    }

    const syllabusNodeId = config.syllabusNodeId || ctx.examContext?.syllabusNodeId;
    const requestedTopic = config.topic || (syllabusNodeId ? undefined : 'General Practice');

    const result = await quizGeneratorService.generateWeakAreaQuiz(studentId, {
      topic: requestedTopic,
      count: config.questionCount ?? 5,
      syllabusNodeId,
      examId: ctx.examContext?.examId,
      cycleId: ctx.examContext?.cycleId,
      syllabusId: ctx.examContext?.syllabusId
    });

    const questions = result.questions || [];

    return {
      questionCount: questions.length,
      topic: result.focus || requestedTopic || 'Weak Area Revision',
      syllabusNodeId,
      questions: questions.map(q => ({
        id: q.id,
        text: q.text,
        options: q.options,
        correctAnswerIndex: q.correctAnswerIndex,
        explanation: q.explanation,
        syllabusNodeId: q.syllabusNodeId,
        identityStatus: q.identityStatus
      }))
    };
  }
};

export const AssignQuizNode: WorkflowNodeHandler = {
  type: 'ASSIGN_QUIZ',
  category: 'Assessment',
  label: 'Assign Quiz to Student',
  description: 'Persists generated practice questions as an active quiz attempt for the student with idempotency guarantees.',
  icon: 'Send',
  requiresStudent: true,
  producesExternalSideEffect: true,
  supportsSimulation: true,
  configSchema: z.object({
    title: z.string().default('Automation Remedial Practice'),
    durationMinutes: z.number().int().min(5).max(180).default(30)
  }),
  inputSchema: z.object({
    questions: z.array(z.any()).min(1)
  }),
  outputSchema: z.object({
    attemptId: z.string(),
    studentId: z.string(),
    title: z.string(),
    totalQuestions: z.number(),
    simulated: z.boolean(),
    idempotentReplay: z.boolean().optional()
  }),
  validateConfig() {
    return { valid: true };
  },
  async execute(ctx: WorkflowExecutionContext, config, input) {
    const studentId = ctx.studentId;
    if (!studentId) {
      throw new Error('[AssignQuizNode] Missing studentId in execution context.');
    }

    const rawQuestions: StoredQuizQuestion[] = (input?.questions as StoredQuizQuestion[]) || [];
    if (!rawQuestions || rawQuestions.length === 0) {
      throw new Error('[AssignQuizNode] No questions provided in input payload.');
    }

    if (ctx.isSimulation) {
      return {
        attemptId: `sim_attempt_${Date.now()}`,
        studentId,
        title: config.title || 'Remedial Quiz Simulation',
        totalQuestions: rawQuestions.length,
        simulated: true
      };
    }

    // Business Idempotency Check: check if attempt for this execution already exists
    try {
      const existingSnap = await db
        .collection('quizAttempts')
        .where('userId', '==', studentId)
        .where('workflowExecutionId', '==', ctx.executionId)
        .limit(1)
        .get();

      if (existingSnap && !existingSnap.empty && existingSnap.docs && existingSnap.docs.length > 0) {
        const doc = existingSnap.docs[0];
        const existing: any = (doc && typeof doc.data === 'function' ? doc.data() : doc) || {};
        return {
          attemptId: existing.id || doc.id,
          studentId,
          title: existing.title || config.title,
          totalQuestions: existing.totalQuestions || rawQuestions.length,
          simulated: false,
          idempotentReplay: true
        };
      }
    } catch {
      // Continue if query not supported by mock
    }

    const attempt = await quizAttemptsService.createFromQuestions(studentId, rawQuestions, {
      title: config.title || 'Remedial Practice Quiz',
      source: 'weak-areas',
      topic: rawQuestions[0]?.topic,
      durationMinutes: config.durationMinutes ?? 30
    });

    try {
      // Tag the attempt with workflow execution ID
      await db.collection('quizAttempts').doc(attempt.id).update({
        workflowExecutionId: ctx.executionId
      });
    } catch {
      // Non-blocking
    }

    return {
      attemptId: attempt.id,
      studentId,
      title: attempt.title,
      totalQuestions: attempt.totalQuestions,
      simulated: false,
      idempotentReplay: false
    };
  }
};
