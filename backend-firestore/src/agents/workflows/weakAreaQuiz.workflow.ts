import { AgentPlan, AgentRunResult } from '../runtime/agent.types';
import { questionCountFromGoal } from '../tools/adapters/quiz.adapter';
import { WorkflowTemplate } from './WorkflowTemplate';
import { stepOutcomes } from './summaryText';

/**
 * "Quiz me on my weak areas" — the check-quiz a revision plan ends with.
 *
 *   1. find_my_latest_analysis       the weak areas
 *   2. find_my_study_material        the chart the analysed quiz was built from
 *   3. compose_quiz_from_document    questions on just those topics (wrong options from the whole chart)
 *   4. create_quiz_artifact          saved and scored like any quiz
 *
 * Only analyses of a chart-built quiz carry a chart to quiz from; otherwise the run says so rather
 * than inventing questions.
 */

export const weakAreaQuizWorkflow: WorkflowTemplate = {
  id: 'weak_area_quiz',
  title: 'Weak-area quiz',
  description: 'A quiz on just the weak areas of your latest analysis, from the verified chart they came from.',
  budget: { maxSteps: 5, maxToolCalls: 6, maxExecutionMs: 60_000 },

  buildPlan(goal: string): AgentPlan {
    const analysis = (path: string) => ({ $ref: 'find_analysis', path });
    const material = (path: string) => ({ $ref: 'find_material', path });
    const composed = (path: string) => ({ $ref: 'compose', path });
    return {
      goal,
      workflowId: 'weak_area_quiz',
      estimatedComplexity: 'low',
      requiresUserApproval: false,
      successCriteria: [
        { id: 'weak_areas', description: 'The weak areas come from the student’s latest analysis' },
        { id: 'grounded', description: 'Questions come from the verified chart, on those topics only' },
      ],
      steps: [
        {
          id: 'find_analysis',
          objective: 'Find the weak areas',
          label: 'Finding your weak areas',
          type: 'retrieve',
          tool: 'find_my_latest_analysis',
          input: {},
          dependsOn: [],
        },
        {
          id: 'find_material',
          objective: 'Find the chart the analysed quiz came from',
          label: 'Finding the chart behind them',
          type: 'retrieve',
          tool: 'find_my_study_material',
          input: { artifactId: analysis('spec.sourceArtifactIds.0') },
          dependsOn: ['find_analysis'],
        },
        {
          id: 'compose',
          objective: 'Write questions on the weak topics only',
          label: 'Writing and checking the questions',
          type: 'transform',
          tool: 'compose_quiz_from_document',
          input: {
            artifactId: material('artifactId'),
            title: material('title'),
            spec: material('spec'),
            focusTopics: analysis('spec.weakAreas'),
            count: questionCountFromGoal(goal, 10),
          },
          dependsOn: ['find_analysis', 'find_material'],
        },
        {
          id: 'save',
          objective: 'Save the quiz',
          label: 'Saving the quiz',
          type: 'export',
          tool: 'create_quiz_artifact',
          input: {
            title: composed('title'),
            questions: composed('questions'),
            topics: composed('topics'),
            origin: composed('origin'),
            durationMinutes: composed('durationMinutes'),
            validation: composed('validation'),
            sourceArtifactId: composed('sourceArtifactId'),
            sourceNote: composed('sourceNote'),
            source: 'weak-areas',
          },
          dependsOn: ['compose'],
        },
      ],
    };
  },

  evaluate({ steps, outputs }): AgentRunResult {
    const { completed, failed } = stepOutcomes(steps);
    const analysis = outputs.get('find_analysis') as any;
    if (!analysis?.found) {
      return {
        outcome: 'no_result',
        summary: 'I need to know your weak areas first. Ask me to “analyse my quiz mistakes” (or “analyse my last 5 tests”), then ask for a weak-area quiz.',
        data: {},
        completed,
        failed,
      };
    }
    const weak: any[] = analysis.spec?.weakAreas ?? [];
    if (weak.length === 0) {
      return { outcome: 'no_result', summary: `Your latest analysis (**${analysis.title}**) found no weak areas, so there is nothing to drill.`, data: {}, completed, failed };
    }
    const material = outputs.get('find_material') as any;
    if (!material?.found) {
      return {
        outcome: 'no_result',
        summary: `Your weak areas (${weak.map((w) => w.topic).slice(0, 4).join(', ')}) don't come from one of your formula charts, and a weak-area quiz is built from a chart's verified content. Make a chart for that chapter first, or ask for a quiz on it.`,
        data: {},
        completed,
        failed,
      };
    }
    const quiz = outputs.get('save') as any;
    const composed = outputs.get('compose') as any;
    if (!quiz?.artifactId) {
      return { outcome: 'partial', summary: `I couldn't make the weak-area quiz${failed.length ? `: ${failed.join('; ')}` : ''}.`, data: {}, completed, failed };
    }
    return {
      outcome: 'success',
      summary: [
        `## ${quiz.title}`,
        '',
        `${quiz.questionCount} questions on ${(composed?.topics ?? []).map((t: any) => `${t.topic} (${t.count})`).join(', ')} — the weak areas from **${analysis.title}**, from your **${material.title}**.`,
        '',
        'Take it on the right. When you submit, ask me to analyse it again to see whether these areas have moved.',
      ].join('\n'),
      data: { artifactId: quiz.artifactId, attemptId: quiz.attemptId, questionCount: quiz.questionCount },
      completed,
      failed,
    };
  },
};
