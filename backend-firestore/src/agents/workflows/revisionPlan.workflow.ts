import { AgentPlan, AgentRunResult } from '../runtime/agent.types';
import { dailyMinutesFromGoal, planDaysFromGoal } from '../tools/adapters/plan.adapter';
import { WorkflowTemplate } from './WorkflowTemplate';
import { stepOutcomes } from './summaryText';

/**
 * A revision plan for the weak areas an analysis found — the acceptance test's last step:
 * "Create a revision plan for those weak areas."
 *
 *   1. find_my_latest_analysis     the analysis "those weak areas" refers to
 *   2. build_revision_plan         a deterministic spaced schedule, re-validated
 *   3. create_studyplan_artifact   saved for the student
 */

export function describePlan(plan: any): string[] {
  const lines: string[] = [];
  for (const [i, day] of (plan.days ?? []).slice(0, 7).entries()) {
    const tasks = (day.tasks as any[]).map((t) => `${t.title} (${t.minutes} min)`).join(' · ');
    lines.push(`- **Day ${i + 1}** (${day.date}): ${tasks}`);
  }
  if ((plan.days ?? []).length > 7) lines.push(`- …and ${plan.days.length - 7} more days in the plan on the right.`);
  return lines;
}

export const revisionPlanWorkflow: WorkflowTemplate = {
  id: 'revision_plan',
  title: 'Revision plan',
  description: 'Turns the weak areas of your latest analysis into a day-by-day revision plan with spaced reviews.',
  budget: { maxSteps: 4, maxToolCalls: 5, maxExecutionMs: 60_000 },

  buildPlan(goal: string): AgentPlan {
    const found = (path: string) => ({ $ref: 'find', path });
    const days = planDaysFromGoal(goal);
    const dailyMinutes = dailyMinutesFromGoal(goal);
    return {
      goal,
      workflowId: 'revision_plan',
      estimatedComplexity: 'low',
      requiresUserApproval: false,
      successCriteria: [
        { id: 'analysis_found', description: 'The analysis whose weak areas are to be planned is found' },
        { id: 'plan_valid', description: 'Every weak area gets a session and a review; no day exceeds the daily minutes' },
      ],
      steps: [
        {
          id: 'find',
          objective: 'Find the analysis with the weak areas',
          label: 'Finding your analysis',
          type: 'retrieve',
          tool: 'find_my_latest_analysis',
          input: {},
          dependsOn: [],
        },
        {
          id: 'plan',
          objective: 'Schedule revision with spaced reviews',
          label: 'Building the plan',
          type: 'transform',
          tool: 'build_revision_plan',
          input: {
            report: found('spec'),
            reportArtifactId: found('artifactId'),
            ...(days ? { days: Math.min(30, Math.max(3, days)) } : {}),
            ...(dailyMinutes ? { dailyMinutes: Math.min(240, Math.max(30, dailyMinutes)) } : {}),
          },
          dependsOn: ['find'],
        },
        {
          id: 'save',
          objective: 'Save the plan',
          label: 'Saving the plan',
          type: 'export',
          tool: 'create_studyplan_artifact',
          input: { plan: { $ref: 'plan' } },
          dependsOn: ['plan'],
        },
      ],
    };
  },

  evaluate({ steps, outputs }): AgentRunResult {
    const { completed, failed } = stepOutcomes(steps);
    const found = outputs.get('find') as any;
    if (!found?.found) {
      return {
        outcome: 'no_result',
        summary: 'I need an analysis first. Ask me to “analyse my quiz mistakes” (or “analyse my last 5 tests”), then ask for a revision plan.',
        data: {},
        completed,
        failed,
      };
    }
    const plan = outputs.get('plan') as any;
    const saved = outputs.get('save') as any;
    if (!plan || !saved?.artifactId) {
      return {
        outcome: 'partial',
        summary: `I found **${found.title}**, but couldn't build the plan${failed.length ? `: ${failed.join('; ')}` : ''}.`,
        data: { sourceArtifactId: found.artifactId },
        completed,
        failed,
      };
    }
    return {
      outcome: 'success',
      summary: [
        `## ${plan.title}`,
        '',
        `From **${found.title}**: ${plan.dailyMinutes} minutes a day, starting ${plan.startDate}. Each weak area gets a revision session, then spaced reviews a day, three days and six days later, and the plan ends with a check-quiz.`,
        plan.unscheduled?.length ? `\n${plan.unscheduled.join(', ')} did not fit — ask for more days or more time a day to include ${plan.unscheduled.length === 1 ? 'it' : 'them'}.` : '',
        '',
        ...describePlan(plan),
      ].join('\n'),
      data: { artifactId: saved.artifactId, sourceArtifactId: found.artifactId, days: plan.days.length },
      completed,
      failed,
    };
  },
};
