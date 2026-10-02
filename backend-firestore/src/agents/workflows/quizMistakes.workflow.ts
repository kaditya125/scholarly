import { AgentPlan, AgentRunResult, AgentStep } from '../runtime/agent.types';
import { WANTS_REVISION_PLAN, dailyMinutesFromGoal, planDaysFromGoal } from '../tools/adapters/plan.adapter';
import { WorkflowTemplate } from './WorkflowTemplate';
import { describePlan } from './revisionPlan.workflow';
import { plainNotation, stepOutcomes } from './summaryText';

/**
 * Mistake analysis — the acceptance test's fourth step:
 * "Analyze my quiz mistakes and tell me what I should revise."
 *
 *   1. find_my_latest_quiz_result   the quiz Sadhya made them (or their latest), as scored
 *   2. analyze_performance          weak areas with their evidence, the questions missed, actions
 *   3. create_report_artifact       saved, so "a revision plan for those weak areas" can use it
 *   (+ build_revision_plan, create_studyplan_artifact when the goal also asks for a plan)
 *
 * A quiz that has not been submitted is never analysed: the run says to take it first.
 */

/** The two planning steps both analysis workflows append when a plan is asked for too. */
export function planningSteps(goal: string, reportStep: string, savedReportStep: string): AgentStep[] {
  const days = planDaysFromGoal(goal);
  const dailyMinutes = dailyMinutesFromGoal(goal);
  return [
    {
      id: 'plan',
      objective: 'Schedule revision of the weak areas',
      label: 'Building the revision plan',
      type: 'transform',
      tool: 'build_revision_plan',
      input: {
        report: { $ref: reportStep },
        reportArtifactId: { $ref: savedReportStep, path: 'artifactId' },
        ...(days ? { days: Math.min(30, Math.max(3, days)) } : {}),
        ...(dailyMinutes ? { dailyMinutes: Math.min(240, Math.max(30, dailyMinutes)) } : {}),
      },
      dependsOn: [reportStep, savedReportStep],
    },
    {
      id: 'save_plan',
      objective: 'Save the plan',
      label: 'Saving the plan',
      type: 'export',
      tool: 'create_studyplan_artifact',
      input: { plan: { $ref: 'plan' } },
      dependsOn: ['plan'],
    },
  ];
}

export const quizMistakesWorkflow: WorkflowTemplate = {
  id: 'quiz_mistake_analysis',
  title: 'Quiz mistake analysis',
  description: 'Analyses what you got wrong in your latest quiz and tells you what to revise, with the pages to go back to.',
  budget: { maxSteps: 6, maxToolCalls: 7, maxExecutionMs: 60_000 },

  buildPlan(goal: string): AgentPlan {
    const found = (path: string) => ({ $ref: 'find', path });
    const wantsPlan = WANTS_REVISION_PLAN.test(goal);
    return {
      goal,
      workflowId: 'quiz_mistake_analysis',
      estimatedComplexity: 'low',
      requiresUserApproval: false,
      successCriteria: [
        { id: 'scored', description: 'A quiz the student has actually submitted is found' },
        { id: 'analysed', description: 'Weak areas, missed questions and revision actions come from their real answers' },
        ...(wantsPlan ? [{ id: 'plan', description: 'A valid revision plan covers the weak areas' }] : []),
      ],
      steps: [
        {
          id: 'find',
          objective: 'Find the student’s latest scored quiz',
          label: 'Finding your quiz result',
          type: 'retrieve',
          tool: 'find_my_latest_quiz_result',
          input: {},
          dependsOn: [],
        },
        {
          id: 'analyze',
          objective: 'Find the weak areas and the questions missed',
          label: 'Analysing your answers',
          type: 'analyze',
          tool: 'analyze_performance',
          input: { evidence: found('evidence'), charts: found('charts') },
          dependsOn: ['find'],
        },
        {
          id: 'save',
          objective: 'Save the analysis',
          label: 'Saving the analysis',
          type: 'export',
          tool: 'create_report_artifact',
          input: { report: { $ref: 'analyze' } },
          dependsOn: ['analyze'],
        },
        ...(wantsPlan ? planningSteps(goal, 'analyze', 'save') : []),
      ],
    };
  },

  evaluate({ steps, outputs, plan: agentPlan }): AgentRunResult {
    const { completed, failed } = stepOutcomes(steps);
    const found = outputs.get('find') as any;
    if (found?.pending) {
      return {
        outcome: 'no_result',
        summary: `You haven't submitted **${found.pending.title}** yet. Take it (it's in your workspace), submit it, and ask me again — I analyse what you actually answered.`,
        data: { pendingAttemptId: found.pending.attemptId },
        completed,
        failed,
      };
    }
    if (!found?.found) {
      return {
        outcome: 'no_result',
        summary: "I couldn't find a quiz you've completed yet. Ask me for one — for example, “Create a 20-question quiz from my formula chart” — take it, then ask me to analyse it.",
        data: {},
        completed,
        failed,
      };
    }
    const report = outputs.get('analyze') as any;
    const saved = outputs.get('save') as any;
    if (!report) {
      return { outcome: 'partial', summary: `I found your quiz but couldn't analyse it${failed.length ? `: ${failed.join('; ')}` : ''}.`, data: {}, completed, failed };
    }

    const attempt = report.basis.attempts[0];
    const mistakes: any[] = report.mistakes ?? [];
    const weak: any[] = report.weakAreas ?? [];
    const strong: any[] = report.strongAreas ?? [];
    const lines = [
      `## ${report.title}`,
      '',
      `You scored **${attempt.accuracy}%** on ${attempt.questions} questions and missed ${mistakes.length}.`,
    ];
    if (weak.length) {
      lines.push('', '**Revise these first:**');
      (report.recommendations as any[])
        .filter((r) => r.topic)
        .slice(0, 5)
        .forEach((r, i) => {
          const area = weak.find((w) => w.topic === r.topic);
          lines.push(`${i + 1}. **${r.topic}** — ${area ? `${area.correct}/${area.total} correct. ` : ''}${plainNotation(r.action)}`);
        });
      const thin = weak.filter((w) => w.confidence < 0.5).map((w) => w.topic);
      if (thin.length) lines.push('', `_${thin.join(', ')} rest${thin.length === 1 ? 's' : ''} on only a few questions, so treat ${thin.length === 1 ? 'it' : 'them'} as a hint rather than a verdict._`);
    } else {
      lines.push('', 'No topic fell below 60%, so there is nothing urgent to revise.');
    }
    if (strong.length) lines.push('', `**Strong:** ${strong.slice(0, 4).map((s) => `${s.topic} (${s.accuracy}%)`).join(', ')}.`);

    const wantsPlan = agentPlan.steps.some((s) => s.id === 'plan');
    const revisionPlan = outputs.get('plan') as any;
    const savedPlan = outputs.get('save_plan') as any;
    if (wantsPlan && revisionPlan && savedPlan?.artifactId) {
      lines.push('', `**${revisionPlan.title}** — ${revisionPlan.dailyMinutes} minutes a day from ${revisionPlan.startDate}:`, ...describePlan(revisionPlan));
    } else if (wantsPlan && weak.length) {
      lines.push('', `I couldn't build the revision plan${failed.length ? `: ${failed.join('; ')}` : ''}.`);
    } else {
      lines.push(
        '',
        saved?.artifactId
          ? 'Every missed question, your answer and the correct one are in the analysis on the right. When you are ready, ask me to “create a revision plan for those weak areas”.'
          : 'I could not save the analysis, but everything above is from your submitted answers.',
      );
    }
    const ok = Boolean(saved?.artifactId) && (!wantsPlan || !weak.length || Boolean(savedPlan?.artifactId));
    return {
      outcome: ok ? 'success' : 'partial',
      summary: lines.join('\n'),
      data: { artifactId: savedPlan?.artifactId ?? saved?.artifactId, reportArtifactId: saved?.artifactId, attemptId: attempt.attemptId, weakAreas: weak.length, mistakes: mistakes.length },
      completed,
      failed,
    };
  },
};
