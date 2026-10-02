import { examOverviewWorkflow } from '../../../src/agents/workflows/examOverview.workflow';
import { StepState } from '../../../src/agents/runtime/agent.types';

function states(status: Record<string, StepState['status']>): Map<string, StepState> {
  const labels: Record<string, string> = {
    resolve_exam: 'Identifying the exam',
    syllabus: 'Reading the official syllabus',
    pattern: 'Analysing past-paper patterns',
  };
  return new Map(
    Object.entries(status).map(([id, s]) => [id, { id, label: labels[id], tool: 't', status: s, attempts: 1 } as StepState]),
  );
}

const plan = examOverviewWorkflow.buildPlan('overview of ssc cgl');

describe('exam overview workflow', () => {
  it('builds a three-step plan where syllabus and pattern depend only on the exam lookup', () => {
    expect(plan.steps.map((s) => s.id)).toEqual(['resolve_exam', 'syllabus', 'pattern']);
    expect(plan.steps[1].dependsOn).toEqual(['resolve_exam']);
    expect(plan.steps[2].dependsOn).toEqual(['resolve_exam']);
    expect(plan.steps[1].input.examId).toEqual({ $ref: 'resolve_exam', path: 'examId' });
  });

  it('summarises syllabus and past-paper evidence when both are available', () => {
    const outputs = new Map<string, unknown>([
      ['resolve_exam', { examId: 'SSC_CGL' }],
      [
        'syllabus',
        {
          available: true,
          version: '2024',
          authority: 'SSC',
          nodeCount: 4,
          nodes: [
            { nodeId: 'root', type: 'exam', name: 'SSC CGL', order: 0, parentPath: [] },
            { nodeId: 't1', type: 'stage', name: 'Tier I', order: 1, parentPath: ['root'] },
            { nodeId: 't2', type: 'stage', name: 'Tier II', order: 2, parentPath: ['root'] },
            { nodeId: 'q', type: 'subject', name: 'Quant', order: 1, parentPath: ['root', 't1'] },
          ],
        },
      ],
      [
        'pattern',
        {
          totalQuestionsAnalyzed: 1399,
          yearsCovered: [2022],
          subjectDistribution: { Quant: 400, English: 380 },
          highYieldTopics: [{ topic: 'Percentage', subject: 'Quant', percentageWeight: 6 }],
        },
      ],
    ]);
    const r = examOverviewWorkflow.evaluate({
      goal: 'overview of ssc cgl',
      plan,
      steps: states({ resolve_exam: 'completed', syllabus: 'completed', pattern: 'completed' }),
      outputs,
    });
    expect(r.outcome).toBe('success');
    expect(r.summary).toMatch(/Tier I, Tier II/);
    expect(r.summary).toMatch(/1399 questions in Sadhya's corpus/);
    expect(r.summary).toMatch(/Percentage \(Quant\) ~6%/);
    expect(r.summary).toMatch(/not an official weighting/);
    // The PYQ corpus holds entries whose official provenance is not established, so the summary
    // must never call these "verified past questions".
    expect(r.summary).not.toMatch(/verified past questions/);
  });

  it('states absence plainly when the exam is not in the corpus', () => {
    const r = examOverviewWorkflow.evaluate({
      goal: 'overview of the Martian civil services exam',
      plan,
      steps: states({ resolve_exam: 'completed', syllabus: 'skipped', pattern: 'skipped' }),
      outputs: new Map([['resolve_exam', { examId: null }]]),
    });
    expect(r.outcome).toBe('no_result');
    expect(r.summary).toMatch(/couldn't find that exam in Sadhya's verified corpus/);
    expect(r.summary).toMatch(/won't describe it from general knowledge/);
  });

  it('reports a partial result when only one source had data', () => {
    const r = examOverviewWorkflow.evaluate({
      goal: 'g',
      plan,
      steps: states({ resolve_exam: 'completed', syllabus: 'completed', pattern: 'failed' }),
      outputs: new Map<string, unknown>([
        ['resolve_exam', { examId: 'GATE_CS' }],
        ['syllabus', { available: true, version: '1', nodeCount: 2, nodes: [] }],
      ]),
    });
    expect(r.outcome).toBe('partial');
    expect(r.failed.length).toBe(1);
  });
});
