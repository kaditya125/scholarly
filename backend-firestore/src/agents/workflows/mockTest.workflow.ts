import { AgentPlan, AgentRunResult } from '../runtime/agent.types';
import { refusalSummary } from '../tools/adapters/pastPapers';
import { PAPER_PACE_MINUTES } from '../tools/adapters/pyq.adapter';
import { WorkflowTemplate } from './WorkflowTemplate';
import { stepOutcomes } from './summaryText';

/**
 * Mock test (Phase 6): "Make a JEE Main mock test."
 *
 *   1. find_real_past_paper   one real paper the student has not taken, through the past-paper screen
 *   2. create_quiz_artifact   its multiple-choice part, in paper order, as a timed quiz
 *
 * A mock is a real paper, not an assembled imitation: Sadhya's exam data records no official
 * pattern (question counts, marking, duration), and the blueprint it can infer mixes papers and
 * tiers. So the paper's own questions set the structure, and the summary says plainly what the
 * quiz could not take (numerical answers, figures), that the timing is Sadhya's pacing and that the
 * marking is Sadhya's, not the exam's. An exam with no real paper that passes gets an honest no.
 */

export const mockTestWorkflow: WorkflowTemplate = {
  id: 'mock_test',
  title: 'Mock test from a real paper',
  description: 'The multiple-choice part of a real past paper the student has not taken, in paper order — only papers that pass the past-paper checks.',
  budget: { maxSteps: 3, maxToolCalls: 4, maxExecutionMs: 120_000 },

  buildPlan(goal: string): AgentPlan {
    const found = (path: string) => ({ $ref: 'find', path });
    return {
      goal,
      workflowId: 'mock_test',
      estimatedComplexity: 'low',
      requiresUserApproval: false,
      successCriteria: [
        { id: 'real_paper', description: 'Every question is from one real past paper, in its order, with the answer recorded from the official key' },
        { id: 'saved', description: 'The paper is saved as a timed quiz the student can take' },
      ],
      steps: [
        {
          id: 'find',
          objective: 'Find a real past paper the student has not taken',
          label: 'Finding a real past paper',
          type: 'retrieve',
          tool: 'find_real_past_paper',
          input: { query: goal.slice(0, 400) },
          dependsOn: [],
        },
        {
          id: 'save',
          objective: 'Save its multiple-choice part as a timed quiz',
          label: 'Setting up the mock test',
          type: 'export',
          tool: 'create_quiz_artifact',
          input: {
            title: found('title'),
            questions: found('questions'),
            topics: found('sections'),
            origin: found('origin'),
            durationMinutes: found('durationMinutes'),
            source: 'pyq-paper',
            sourceNote: 'The multiple-choice part of a real past paper, in paper order. Answers as recorded from the official key; timing and marking are Sadhya’s, not the exam’s.',
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
      return { outcome: 'no_result', summary: `I couldn't look for a past paper${failed.length ? `: ${failed.join('; ')}` : ''}.`, data: {}, completed, failed };
    }
    const exam = found.examShort ?? found.examName;
    if (!found.questions?.length) {
      const refused = refusalSummary(found.excluded);
      return {
        outcome: 'no_result',
        summary: [
          `I couldn't find a real ${exam} paper I can stand behind, so I won't build a mock test from it.`,
          found.checked
            ? `The question bank holds ${found.checked >= 1000 ? 'at least ' : ''}${found.checked} questions for ${exam}, but none passes the checks for a real past paper.${refused ? ` Not used: ${refused}.` : ''}`
            : `The question bank holds no questions for ${exam}.`,
          '',
          'What I can do instead: practice questions written from the NCERT chapter, every answer checked against its text — for example, “Create 30 NEET Biology questions from Cell Structure”.',
        ].join('\n'),
        data: { examId: found.examId, checked: found.checked, excluded: found.excluded },
        completed,
        failed,
      };
    }
    const quiz = outputs.get('save') as any;
    if (!quiz?.artifactId) {
      return { outcome: 'partial', summary: `I found a real ${exam} paper (${found.sitting?.label}) but couldn't set up the mock test${failed.length ? `: ${failed.join('; ')}` : ''}.`, data: {}, completed, failed };
    }
    const sections = (found.sections ?? []).map((s: any) => `${s.topic} ${s.count}`).join(' · ');
    const leftOut = refusalSummary(found.leftOut);
    const keyNames = (found.answerSources ?? []).map((s: string) => `“${s}”`);
    return {
      outcome: 'success',
      summary: [
        `## ${quiz.title}`,
        '',
        `The multiple-choice part of a real ${exam} paper${found.sitting?.paper ? ` (${found.sitting.paper})` : ''} — ${found.sitting?.label}, in paper order: ${sections}.`,
        leftOut ? `Left out of this paper: ${leftOut}.` : undefined,
        found.alreadySeen ? `Every real paper I found overlaps quizzes you've taken; this one repeats ${found.alreadySeen} question${found.alreadySeen === 1 ? '' : 's'} you've seen.` : undefined,
        `Timed at ${PAPER_PACE_MINUTES} minutes a question (${found.durationMinutes} minutes) — Sadhya's pacing, since the exam's own time limit isn't recorded in Sadhya. Scored with Sadhya's usual quiz marking, not the exam's.`,
        `The answers are the ones recorded with each question${keyNames.length ? ` (answer key as recorded: ${keyNames.join(', ')})` : ''}; Sadhya hasn't re-checked them against the key file.`,
        '',
        'Take it on the right, or on the full quiz page for the timer; it is scored when you submit.',
      ]
        .filter((line) => line !== undefined)
        .join('\n'),
      data: { artifactId: quiz.artifactId, attemptId: quiz.attemptId, questionCount: quiz.questionCount, examId: found.examId, sitting: found.sitting },
      completed,
      failed,
    };
  },
};
