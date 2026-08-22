/**
 * @file AutomationEngineGoldenWorkflow.test.ts
 * @description Golden E2E integration test for Scholarly Automation Studio.
 * Tests the complete Weakness Recovery workflow:
 * QUIZ_COMPLETED -> GET_STUDENT_MASTERY -> IF accuracy < 60 -> GET_WEAK_TOPICS -> GENERATE_PRACTICE_QUIZ -> ASSIGN_QUIZ
 */

jest.mock('uuid', () => ({ v4: () => '00000000-0000-4000-8000-000000000000' }));
jest.mock('../../src/core/knowledge', () => ({ knowledgeService: { getSourceContext: async () => null } }));
jest.mock('../../src/core/notifications/EmailNotificationService', () => ({
  emailNotificationService: { sendCriticalAlert: async () => {}, sendDigest: async () => {} }
}));

// Mock Firestore for hermetic test execution
jest.mock('../../src/config/firebase', () => {
  const store = new Map<string, any>();
  const docRef = (path: string) => ({
    set: jest.fn(async (data: any) => { store.set(path, data); }),
    get: jest.fn(async () => ({
      exists: store.has(path),
      data: () => store.get(path)
    })),
    update: jest.fn(async (patch: any) => {
      const existing = store.get(path) || {};
      store.set(path, { ...existing, ...patch });
    }),
    collection: (sub: string) => ({
      doc: (subId: string) => docRef(`${path}/${sub}/${subId}`),
      get: jest.fn(async () => ({
        docs: Array.from(store.entries())
          .filter(([k]) => k.startsWith(`${path}/${sub}/`))
          .map(([_, v]) => ({ data: () => v }))
      }))
    })
  });

  return {
    db: {
      collection: (col: string) => ({
        doc: (id: string) => docRef(`${col}/${id}`),
        where: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        get: jest.fn(async () => ({ docs: [] }))
      }),
      batch: () => ({
        set: jest.fn(),
        delete: jest.fn(),
        commit: jest.fn()
      })
    }
  };
});

// Mock MasteryEngine and QuizGeneratorService for pure testing
jest.mock('../../src/core/intelligence/MasteryEngine', () => ({
  masteryEngine: {
    listConcepts: jest.fn(async () => [
      {
        conceptId: 'algebra_quadratics',
        title: 'Quadratic Equations',
        masteryScore: 0.42,
        confidence: 0.85,
        successRate: 0.42,
        attempts: 10,
        syllabusNodeId: 'topic:ssc_cgl_quant_algebra_quadratics'
      }
    ]),
    get: jest.fn(async () => null),
    recordEvent: jest.fn(async () => {})
  }
}));

jest.mock('../../src/services/tests/quizGenerator.service', () => ({
  QuizGeneratorService: jest.fn().mockImplementation(() => ({
    generateWeakAreaQuiz: jest.fn(async () => ({
      focus: 'Quadratic Equations',
      questions: [
        {
          id: 'q_gen_1',
          text: 'Solve for x: x^2 - 5x + 6 = 0',
          options: ['x = 2, 3', 'x = -2, -3', 'x = 1, 6', 'x = 0'],
          correctAnswerIndex: 0,
          explanation: 'Factorizing gives (x-2)(x-3) = 0, so x = 2 or x = 3.',
          syllabusNodeId: 'topic:ssc_cgl_quant_algebra_quadratics',
          identityStatus: 'CANONICAL'
        }
      ]
    }))
  }))
}));

jest.mock('../../src/services/tests/quizAttempts.service', () => ({
  QuizAttemptsService: jest.fn().mockImplementation(() => ({
    createFromQuestions: jest.fn(async () => ({
      id: 'attempt_golden_123',
      title: 'Automation Remedial Practice',
      totalQuestions: 1
    }))
  }))
}));

import { automationEngine } from '../../src/core/automation/engine/AutomationEngine';
import '../../src/core/automation/registry/nodes/index';
import { WorkflowDefinition } from '../../src/core/automation/types/workflow.types';
import { validateWorkflowGraph } from '../../src/core/automation/schemas/workflow.schema';

describe('Golden Workflow E2E Execution: Weakness Recovery', () => {
  const goldenWorkflow: WorkflowDefinition = {
    id: 'wf_golden_weakness_recovery',
    scope: 'ORGANIZATION',
    organizationId: 'org_scholarly_prod',
    name: 'Weakness Recovery Automation',
    version: 1,
    status: 'ACTIVE',
    trigger: {
      type: 'EVENT',
      eventType: 'learning.quiz_completed'
    },
    nodes: [
      {
        id: 'node_trigger',
        type: 'TRIGGER_EVENT',
        label: 'Quiz Completed',
        category: 'Trigger',
        position: { x: 100, y: 100 },
        config: { eventType: 'learning.quiz_completed' }
      },
      {
        id: 'node_mastery',
        type: 'GET_STUDENT_MASTERY',
        label: 'Get Student Mastery',
        category: 'Mastery',
        position: { x: 100, y: 200 },
        config: { minConfidence: 0.3 }
      },
      {
        id: 'node_if',
        type: 'CONDITION_IF',
        label: 'Average Mastery < 60%',
        category: 'Logic',
        position: { x: 100, y: 300 },
        config: { field: 'averageMastery', operator: 'less_than', value: 0.6 }
      },
      {
        id: 'node_weak_topics',
        type: 'GET_WEAK_TOPICS',
        label: 'Get Weak Canonical Topics',
        category: 'Syllabus',
        position: { x: 100, y: 400 },
        config: { maxCount: 3, thresholdAccuracy: 0.6 }
      },
      {
        id: 'node_gen_quiz',
        type: 'GENERATE_PRACTICE_QUIZ',
        label: 'Generate Practice Quiz',
        category: 'Assessment',
        position: { x: 100, y: 500 },
        config: { questionCount: 5 }
      },
      {
        id: 'node_assign',
        type: 'ASSIGN_QUIZ',
        label: 'Assign Remedial Quiz',
        category: 'Assessment',
        position: { x: 100, y: 600 },
        config: { title: 'Remedial Quiz: Quadratic Equations', durationMinutes: 20 }
      }
    ],
    edges: [
      { id: 'e1', sourceNodeId: 'node_trigger', targetNodeId: 'node_mastery' },
      { id: 'e2', sourceNodeId: 'node_mastery', targetNodeId: 'node_if' },
      { id: 'e3', sourceNodeId: 'node_if', targetNodeId: 'node_weak_topics', sourceHandle: 'true' },
      { id: 'e4', sourceNodeId: 'node_weak_topics', targetNodeId: 'node_gen_quiz' },
      { id: 'e5', sourceNodeId: 'node_gen_quiz', targetNodeId: 'node_assign' }
    ],
    variables: {},
    createdBy: 'admin_user',
    updatedBy: 'admin_user',
    createdAt: Date.now(),
    updatedAt: Date.now()
  };

  it('should pass structural DAG validation for Golden Workflow', () => {
    const validation = validateWorkflowGraph(goldenWorkflow);
    expect(validation.valid).toBe(true);
    expect(validation.errors).toHaveLength(0);
  });

  it('should execute the Golden Workflow end-to-end and successfully assign a remedial quiz', async () => {
    const sampleEvent = {
      userId: 'student_rahul_123',
      attemptId: 'attempt_prev_001',
      totalQuestions: 10,
      correctCount: 4,
      accuracy: 40,
      occurredAt: Date.now()
    };

    const execution = await automationEngine.startExecution(
      goldenWorkflow,
      sampleEvent,
      {
        studentId: 'student_rahul_123',
        organizationId: 'org_scholarly_prod',
        isSimulation: true,
        triggeredBy: 'event:learning.quiz_completed'
      }
    );

    expect(execution.status).toBe('COMPLETED');
    expect(execution.nodeStatuses['node_trigger']).toBe('COMPLETED');
    expect(execution.nodeStatuses['node_mastery']).toBe('COMPLETED');
    expect(execution.nodeStatuses['node_if']).toBe('COMPLETED');
    expect(execution.nodeStatuses['node_weak_topics']).toBe('COMPLETED');
    expect(execution.nodeStatuses['node_gen_quiz']).toBe('COMPLETED');
    expect(execution.nodeStatuses['node_assign']).toBe('COMPLETED');
    expect(execution.error).toBeUndefined();
  });
});
