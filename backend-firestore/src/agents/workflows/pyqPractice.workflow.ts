import { AgentPlan, AgentRunResult } from '../runtime/agent.types';
import { refusalSummary } from '../tools/adapters/pastPapers';
import { questionCountFromGoal } from '../tools/adapters/quiz.adapter';
import { WorkflowTemplate } from './WorkflowTemplate';
import { stepOutcomes } from './summaryText';

/**
 * Past-year question practice (Phase 6): "Give me JEE Main 2023 Physics PYQs."
 *
 *   1. find_verified_past_year_questions   real papers only, through the shared past-paper screen
 *   2. create_quiz_artifact                 saved as a quiz attempt, marked as past-year questions
 *
 * When nothing in the bank passes, step 2 is skipped and the summary says why — and what the
 * student can do instead — rather than presenting practice as a past paper. The answers are
 * described as what they are: recorded from the official key, not re-checked by Sadhya.
 */

const listOf = (items: string[], max: number) => (items.length > max ? `${items.slice(0, max).join(', ')} and ${items.length - max} more` : items.join(', '));

export const pyqPracticeWorkflow: WorkflowTemplate = {
  id: 'pyq_practice',
  title: 'Past-year question practice',
  description: 'Questions from an exam’s real past papers — only those that pass the past-paper checks, with the answers recorded from the official key.',
  budget: { maxSteps: 3, maxToolCalls: 4, maxExecutionMs: 90_000 },

  buildPlan(goal: string): AgentPlan {
    const found = (path: string) => ({ $ref: 'find', path });
    return {
      goal,
      workflowId: 'pyq_practice',
      estimatedComplexity: 'low',
      requiresUserApproval: false,
      successCriteria: [
        { id: 'real', description: 'Every question comes from a real past paper, with the answer recorded from the official key' },
        { id: 'saved', description: 'The questions are saved as a quiz the student can take' },
      ],
      steps: [
        {
          id: 'find',
          objective: 'Find questions from real past papers',
          label: 'Finding real past-year questions',
          type: 'retrieve',
          tool: 'find_verified_past_year_questions',
          input: { query: goal.slice(0, 400), count: questionCountFromGoal(goal, 20) },
          dependsOn: [],
        },
        {
          id: 'save',
          objective: 'Save them as a quiz',
          label: 'Saving the quiz',
          type: 'export',
          tool: 'create_quiz_artifact',
          input: {
            title: found('title'),
            questions: found('questions'),
            topics: found('topics'),
            origin: found('origin'),
            source: 'pyq-paper',
            sourceNote: 'Questions from real past papers. The answers are the ones recorded with each question from the official answer key; Sadhya has not re-checked them against the key file.',
          },
          dependsOn: ['find'],
        },
      ],
    };
  },

  evaluate({ steps, outputs }): AgentRunResult {
    const { completed, failed } = stepOutcomes(steps);
    const found = outputs.get('find') as any;
    if (!found) {
      return { outcome: 'no_result', summary: `I couldn't look up past-year questions${failed.length ? `: ${failed.join('; ')}` : ''}.`, data: {}, completed, failed };
    }
    const refused = refusalSummary(found.excluded);
    const exam = found.examShort ?? found.examName;
    const asked = [exam, found.year, found.subject].filter(Boolean).join(' ') + (found.topicWords?.length ? ` on “${found.topicWords.join(' ')}”` : '');
    if (!found.questions?.length) {
      return {
        outcome: 'no_result',
        summary: [
          `I couldn't find past-year questions I can stand behind for **${asked}**.`,
          found.checked
            ? `The question bank holds ${found.checkedAtLeast ? 'at least ' : ''}${found.checked} for this request, but none passes the checks for a real past paper, so I won't present any of them as one. Not used: ${refused}.`
            : 'The question bank holds none for this request.',
          '',
          'I can write practice questions from the NCERT chapter instead, every answer checked against its text — for example, “Create 20 NEET Biology questions from Cell Structure”.',
        ].join('\n'),
        data: { examId: found.examId, checked: found.checked, excluded: found.excluded },
        completed,
        failed,
      };
    }
    const quiz = outputs.get('save') as any;
    if (!quiz?.artifactId) {
      return { outcome: 'partial', summary: `I found ${found.questions.length} past-year questions but couldn't save the quiz${failed.length ? `: ${failed.join('; ')}` : ''}.`, data: {}, completed, failed };
    }
    const keyNames = (found.answerSources ?? []).map((s: string) => `“${s}”`);
    return {
      outcome: 'success',
      summary: [
        `## ${quiz.title}`,
        '',
        `${quiz.questionCount} questions from real ${exam} papers — ${listOf(found.sittings ?? [], 3)}.`,
        `The answers are the ones recorded with each question${keyNames.length ? ` (answer key as recorded: ${keyNames.join(', ')})` : ''}; Sadhya hasn't re-checked them against the key file.`,
        refused ? `Not used: ${refused}.` : '',
        '',
        'Take it on the right; it is scored when you submit.',
      ]
        .filter((line, i, all) => line !== '' || all[i - 1] !== '')
        .join('\n'),
      data: { artifactId: quiz.artifactId, attemptId: quiz.attemptId, questionCount: quiz.questionCount, examId: found.examId },
      completed,
      failed,
    };
  },
};
