import { AgentPlan, AgentRunResult } from '../runtime/agent.types';
import { questionCountFromGoal } from '../tools/adapters/quiz.adapter';
import { WorkflowTemplate } from './WorkflowTemplate';
import { stepOutcomes } from './summaryText';

/**
 * A quiz from something the student already made — the acceptance test's third step:
 * "Create a 20-question quiz from it."
 *
 *   1. find_my_study_material        their latest chart (a deck made from a chart leads back to it)
 *   2. compose_quiz_from_document    questions from its verified content, each one validated
 *   3. create_quiz_artifact          saved as their quiz attempt + a quiz artifact
 *
 * No retrieval and no model call: the chart is reused, and the quiz is scored by the same
 * server-side grader as every other quiz in Sadhya when the student submits it.
 */

export const quizFromArtifactWorkflow: WorkflowTemplate = {
  id: 'quiz_from_artifact',
  title: 'Quiz from your document',
  description: 'Turns a formula chart you already made into a multiple-choice quiz, reusing its verified content.',
  budget: { maxSteps: 4, maxToolCalls: 5, maxExecutionMs: 60_000 },

  buildPlan(goal: string): AgentPlan {
    const titleContains = /formula\s+chart/i.test(goal) ? 'Formula Chart' : undefined;
    const found = (path: string) => ({ $ref: 'find', path });
    const composed = (path: string) => ({ $ref: 'compose', path });
    return {
      goal,
      workflowId: 'quiz_from_artifact',
      estimatedComplexity: 'low',
      requiresUserApproval: false,
      successCriteria: [
        { id: 'source_found', description: 'The student’s own chart is found' },
        { id: 'validated', description: 'Every question has four distinct options, none equivalent to the answer' },
        { id: 'saved', description: 'The quiz is saved as an attempt the student can take and have scored' },
      ],
      steps: [
        {
          id: 'find',
          objective: 'Find the material the student means',
          label: titleContains ? 'Finding your formula chart' : 'Finding your latest chart',
          type: 'retrieve',
          tool: 'find_my_study_material',
          input: titleContains ? { titleContains } : {},
          dependsOn: [],
        },
        {
          id: 'compose',
          objective: 'Write and validate questions from its verified content',
          label: 'Writing and checking the questions',
          type: 'transform',
          tool: 'compose_quiz_from_document',
          input: { artifactId: found('artifactId'), title: found('title'), spec: found('spec'), count: questionCountFromGoal(goal) },
          dependsOn: ['find'],
        },
        {
          id: 'save',
          objective: 'Save the quiz for the student to take',
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
            source: 'topic',
          },
          dependsOn: ['compose'],
        },
      ],
    };
  },

  evaluate({ steps, outputs, plan }): AgentRunResult {
    const { completed, failed } = stepOutcomes(steps);
    const source = outputs.get('find') as any;
    if (!source?.found) {
      return {
        outcome: 'no_result',
        summary:
          "I couldn't find a formula chart of yours to make a quiz from. Ask me to make one first — for example, “Prepare a formula chart for Class 11 Physics Laws of Motion”.",
        data: { reused: false },
        completed,
        failed,
      };
    }
    const composed = outputs.get('compose') as any;
    const quiz = outputs.get('save') as any;
    if (!quiz?.artifactId) {
      return {
        outcome: 'partial',
        summary: `I found **${source.title}**, but couldn't finish the quiz${failed.length ? `: ${failed.join('; ')}` : ''}.`,
        data: { sourceArtifactId: source.artifactId },
        completed,
        failed,
      };
    }

    const asked = Number((plan.steps.find((s) => s.id === 'compose')?.input as any)?.count ?? quiz.questionCount);
    const topics: Array<{ topic: string; count: number }> = composed?.topics ?? [];
    const rejected = Object.entries(composed?.validation?.rejected ?? {}) as Array<[string, number]>;
    const reasons: Record<string, string> = {
      not_enough_distinct_options: 'too few distinct wrong options',
      duplicate_question: 'repeats',
    };
    return {
      outcome: 'success',
      summary: [
        `## ${quiz.title}`,
        '',
        `I made a ${quiz.questionCount}-question quiz from your **${source.title}**${source.via ? ` (the chart behind your ${source.via})` : ''}. ` +
          'Every correct answer is the chart’s own verified entry and every wrong option is another real entry from the same chapter, so the key cannot be wrong where the chart is not.',
        quiz.questionCount < asked ? `\nYou asked for ${asked}; the chart supports ${quiz.questionCount} distinct questions, so that is how many it has.` : '',
        topics.length ? `\nIt covers ${topics.map((t) => `${t.topic} (${t.count})`).join(', ')}.` : '',
        composed?.validation
          ? `\nI checked ${composed.validation.checked} candidate questions${rejected.length ? ` and set aside ${rejected.map(([r, n]) => `${n} for ${reasons[r] ?? r}`).join(', ')}` : ''}.`
          : '',
        '',
        'Take it on the right; it is scored when you submit. Then ask me to “analyse my quiz mistakes”.',
      ].join('\n'),
      data: { artifactId: quiz.artifactId, attemptId: quiz.attemptId, sourceArtifactId: source.artifactId, questionCount: quiz.questionCount, reused: true },
      completed,
      failed,
    };
  },
};
