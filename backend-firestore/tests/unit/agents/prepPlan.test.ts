/**
 * Phase 7 — the plan behind "Prepare me for X": built by code from the official syllabus, the
 * student's state and the time they have. Fixtures mirror the real SSC CGL 2026 syllabus graph's
 * shape (stages, papers, sections, subjects with recorded marks; topics as the notice words them).
 */
import { studyPlanSpecSchema } from '../../../src/agents/artifacts/artifact.types';
import {
  FIRST_PASS,
  MAX_UNITS_PER_SUBJECT,
  buildExamPrepPlan,
  disciplineOf,
  horizonFromGoal,
  leafLabel,
  phasesFor,
  sameTopic,
  structureFromSyllabus,
  unitsFromLeaf,
} from '../../../src/agents/tools/adapters/prepPlan';

let seq = 0;
const node = (type: string, name: string, extra: Record<string, unknown> = {}, children: any[] = []) => ({ id: `n${++seq}`, type, name, children, ...extra });
const SSC = {
  syllabusId: 'syl_ssc',
  sourceDocumentTitle: 'Notice of Combined Graduate Level Examination, 2026',
  sourceDocumentUrl: 'https://ssc.gov.in/notice.pdf',
  sourceDocumentHash: '54a01dda220cb8836f19983908e1f3fd',
  nodes: [
    node('STAGE', 'Tier-I', { marks: 200, questionCount: 100, durationMinutes: 60 }, [
      node('SUBJECT', 'General Intelligence and Reasoning', { marks: 50, questionCount: 25, durationMinutes: 15 }, [node('TOPIC', 'Semantic Analogy'), node('TOPIC', 'Number Series'), node('TOPIC', 'Venn Diagrams')]),
      node('SUBJECT', 'Quantitative Aptitude', { marks: 50, questionCount: 25, durationMinutes: 15 }, [
        node('TOPIC', 'The questions will be designed to test the ability of appropriate use of numbers and number sense of the candidate.'),
        node('TOPIC', 'The scope of the test will be computation of whole numbers, decimals, fractions and relationships between numbers, Percentage. Ratio & Proportion, Square roots, Averages.'),
      ]),
    ]),
    node('STAGE', 'Tier-II', {}, [
      node('PAPER', 'Paper-I', { marks: 450, questionCount: 150, durationMinutes: 150 }, [
        node('SECTION', 'Section-I', { marks: 180, questionCount: 60, durationMinutes: 60 }, [
          node('SUBJECT', 'A: Mathematical Abilities', { marks: 90, questionCount: 30, durationMinutes: 30 }, [
            node('TOPIC', 'Fundamental arithmetical operations', {}, [node('SUBTOPIC', 'Percentages, Ratio and Proportion, Square roots, Averages, Interest (Simple and Compound), Profit and Loss.')]),
          ]),
        ]),
        node('SECTION', 'Section-III', { marks: 60, questionCount: 20, durationMinutes: 15 }, [
          node('SUBJECT', 'Computer Knowledge Test', {}, [
            node('TOPIC', 'Basics of networking and cyber security', {}, [
              node('SUBTOPIC', 'Networking devices and protocols, Network and information security threats (like hacking, virus, worms, Trojan etc.) and preventive measures, Firewalls.'),
            ]),
          ]),
        ]),
        node('SECTION', 'Section-IV', { durationMinutes: 15 }, [
          node('SUBJECT', 'Data Entry Speed Test', {}, [node('TOPIC', 'The “Data Entry Speed Test” (DEST) Skill Test will be conducted for a passage of about 2000 key depressions for a duration of 15 minutes.')]),
        ]),
      ]),
      node('PAPER', 'Paper-II Statistics', { marks: 200, questionCount: 100, durationMinutes: 120 }, [node('TOPIC', 'Measures of Dispersion', {}, [node('SUBTOPIC', 'Range, quartile deviations, mean deviation and standard deviation.')])]),
      node('PAPER', 'Paper-III General Studies (Finance and Economics)', { marks: 200, questionCount: 100, durationMinutes: 120 }, [node('TOPIC', 'Finance Commission- Role and functions.')]),
    ]),
  ],
};

describe('the official structure', () => {
  const s = structureFromSyllabus(SSC, { examId: 'SSC_CGL', examName: 'SSC CGL' });

  it('covers every stage and the first paper of each, and lists the rest as not included', () => {
    expect(s.scope).toEqual([
      { path: 'Tier-I', questionCount: 100, marks: 200, durationMinutes: 60 },
      { path: 'Tier-II › Paper-I', questionCount: 150, marks: 450, durationMinutes: 150 },
    ]);
    expect(s.notIncluded).toEqual(['Tier-II › Paper-II Statistics', 'Tier-II › Paper-III General Studies (Finance and Economics)']);
    const withStats = structureFromSyllabus(SSC, { examId: 'SSC_CGL', examName: 'SSC CGL', wantsPaper: (n) => /statistic/i.test(n) });
    expect(withStats.notIncluded).toEqual(['Tier-II › Paper-III General Studies (Finance and Economics)']);
    expect(withStats.subjects.map((x) => x.name)).toContain('Paper-II Statistics');
  });

  it('plans each discipline once across tiers, with the marks the syllabus records', () => {
    const quant = s.subjects.find((x) => x.name === 'Quantitative Aptitude')!;
    expect(quant.marks).toBe(140); // 50 (Tier-I) + 90 (Tier-II Mathematical Abilities)
    expect(quant.parts.map((p) => p.path)).toEqual(['Tier-I › Quantitative Aptitude', 'Tier-II › Paper-I › Section-I › A: Mathematical Abilities']);
    // Topics as the notice words them; "Percentages" (Tier-II) is Tier-I's "Percentage"; the sentence about the test is not a topic.
    expect(quant.units.map((u) => u.label)).toEqual([
      'Computation of whole numbers',
      'Decimals',
      'Fractions and relationships between numbers',
      'Percentage',
      'Ratio & Proportion',
      'Square roots',
      'Averages',
      'Interest (Simple and Compound)',
      'Profit and Loss',
    ]);
    expect(quant.units.find((u) => u.label === 'Percentage')!.nodeIds).toHaveLength(2);
    // A section with one subject lends it its marks.
    expect(s.subjects.find((x) => x.name === 'Computer Knowledge')!.marks).toBe(60);
  });

  it('keeps bracketed lists whole, and treats a skill test as practice, not topics', () => {
    const ckt = s.subjects.find((x) => x.name === 'Computer Knowledge')!;
    expect(ckt.units.map((u) => u.label)).toEqual([
      'Networking devices and protocols',
      'Network and information security threats (like hacking, virus, worms, Trojan) and preventive measures',
      'Firewalls',
    ]);
    const dest = s.subjects.find((x) => x.name === 'Data Entry Speed Test')!;
    expect(dest.units).toEqual([]);
    expect(dest.skillTest).toMatch(/2000 key depressions/);
    expect(s.source).toMatchObject({ title: 'Notice of Combined Graduate Level Examination, 2026', url: 'https://ssc.gov.in/notice.pdf' });
  });

  it('falls back to the syllabus leaves when splitting would make too many topics', () => {
    const many = Array.from({ length: 70 }, (_, i) => `Item ${i + 1}`).join(', ');
    const jee = { syllabusId: 's', nodes: [node('STAGE', 'JEE Main', {}, [node('SUBJECT', 'PHYSICS', {}, [node('TOPIC', 'UNIT 3: LAWS OF MOTION', {}, [node('SUBTOPIC', `Force and inertia, ${many}`), node('SUBTOPIC', 'Static and kinetic friction, laws of friction.')])])])] };
    const out = structureFromSyllabus(jee, { examId: 'JEE_MAIN', examName: 'JEE Main' });
    expect(out.subjects[0].name).toBe('Physics');
    expect(out.subjects[0].units.map((u) => u.label)).toEqual(['Laws of Motion: Force and inertia', 'Laws of Motion: Static and kinetic friction']);
    expect(out.subjects[0].units.every((u) => u.wholeLeaf)).toBe(true);
    expect(MAX_UNITS_PER_SUBJECT).toBe(60);
  });

  it('reads topics out of the notice’s sentences', () => {
    expect(unitsFromLeaf('Semantic Analogy')).toEqual({ labels: ['Semantic Analogy'], enumerated: false });
    expect(unitsFromLeaf('Questions of both verbal and non-verbal type. These will include questions on Semantic Analogy, Symbolic operations, Trends, other sub-topics, if any.').labels).toEqual([
      'Semantic Analogy',
      'Symbolic operations',
      'Trends',
    ]);
    expect(unitsFromLeaf('Questions will also be designed to test knowledge of current events and of such matters of every day observations.').labels).toEqual([
      'Knowledge of current events and of such matters of every day observations',
    ]);
    expect(leafLabel('Static and Kinetic friction, laws of friction.', 'UNIT 3: LAWS OF MOTION', 3)).toBe('Laws of Motion: Static and Kinetic friction');
    expect(leafLabel('Units of measurements, System of units.', 'UNIT 1: Units and Measurements', 1)).toBe('Units and Measurements');
    expect(disciplineOf('B: Reasoning and General Intelligence')).toBe('Reasoning');
    expect(disciplineOf('A: English Language and Comprehension')).toBe('English');
    expect(sameTopic('General awareness of the environment around him and its application to society', 'General awareness of the environment around them and its application to society')).toBe(true);
    expect(sameTopic('Percentage', 'Profit and Loss')).toBe(false);
  });
});

describe('the time the student has', () => {
  const today = '2026-09-30';
  it.each([
    ['Prepare me for SSC CGL in 90 days', 90, '2026-12-28'],
    ['Study with me for the next 30 days', 30, '2026-10-29'],
    ['a 12-week preparation plan for JEE Main', 84, '2026-12-22'],
    ['Prepare me for NEET in three months', 91, '2026-12-29'],
    ['Prepare me for SSC CGL, exam on 2026-12-10', 71, '2026-12-09'],
    ['Get me ready for CUET by 15 May', 227, '2027-05-14'],
  ])('%s', (goal, days, endDate) => {
    expect(horizonFromGoal(goal, today)).toEqual({ days, endDate });
  });

  it('assumes nothing when there is no span or date', () => {
    expect(horizonFromGoal('Prepare me for SSC CGL', today)).toBeUndefined();
    expect(horizonFromGoal('I can study 2 hours a day', today)).toBeUndefined();
    expect(horizonFromGoal('Prepare me in 900 days', today)).toBeUndefined();
  });

  it('splits the days into learning, timed practice and full tests', () => {
    expect(phasesFor(90)).toEqual({ learn: 54, practise: 22, revise: 14 });
    expect(phasesFor(14)).toEqual({ learn: 9, practise: 0, revise: 5 });
    expect(phasesFor(5)).toEqual({ learn: 5, practise: 0, revise: 0 });
  });
});

describe('the plan', () => {
  const structure = structureFromSyllabus(SSC, { examId: 'SSC_CGL', examName: 'Combined Graduate Level Examination' });
  const base = {
    exam: { examId: 'SSC_CGL', name: 'Combined Graduate Level Examination', shortName: 'SSC CGL' },
    startDate: '2026-09-30',
    horizon: { days: 90, endDate: '2026-12-28', source: 'goal' as const },
    dailyMinutes: { value: 60, source: 'default' as const },
    structure,
    leafStates: {},
    weakTopics: [],
    history: { quizzes: 0, tests: 0, questionsAnswered: 0, averageAccuracy: null },
    pastPapers: { available: false, papers: 0, note: 'Sadhya has no SSC CGL past papers I can offer as real papers yet.' },
  };

  it('is a valid study plan: 13 weeks, the first day by day, time by the official marks', () => {
    const r = buildExamPrepPlan(base);
    expect(studyPlanSpecSchema.parse(r.spec)).toBeTruthy();
    expect(r.spec.title).toBe('SSC CGL — 90-day plan');
    expect(r.spec.weeks).toHaveLength(13);
    expect(r.spec.weeks!.map((w) => w.phase)).toEqual([...Array(8).fill('learn'), ...Array(3).fill('practise'), ...Array(2).fill('revise')]);
    expect(r.spec.days).toHaveLength(7);
    for (const d of r.spec.days) expect(d.tasks.reduce((n, t) => n + t.minutes, 0)).toBeLessThanOrEqual(60);
    // 140 + 140 + 60 (Reasoning is 50 here) — every subject's share is its marks over the total.
    const total = structure.subjects.filter((s) => s.units.length).reduce((n, s) => n + (s.marks ?? 0), 0);
    for (const share of r.subjectShares) {
      expect(share.basis).toBe('marks');
      expect(share.share).toBeCloseTo((structure.subjects.find((s) => s.name === share.subject)!.marks ?? 0) / total, 5);
    }
    expect(r.spec.exam).toMatchObject({ examId: 'SSC_CGL', scope: ['Tier-I', 'Tier-II › Paper-I'] });
    expect(r.spec.sources![0]).toMatchObject({ url: 'https://ssc.gov.in/notice.pdf' });
  });

  it('uses the recorded pattern in its milestones and strategy', () => {
    const r = buildExamPrepPlan(base);
    const practise = r.spec.weeks!.find((w) => w.phase === 'practise')!;
    expect(practise.milestone).toContain('25 questions in 15 minutes per subject, as in Tier-I');
    const revise = r.spec.weeks!.find((w) => w.phase === 'revise')!;
    expect(revise.milestone).toContain('Tier-I pattern: 100 questions in 60 minutes');
    expect(r.spec.strategy!.map((s) => s.title)).toEqual(['Every day', 'Every week', 'Timed practice', 'Full-length tests', 'Past papers', 'Data Entry Speed Test', 'Falling behind']);
  });

  it('says plainly when the syllabus will not fit, and how much time would', () => {
    const tight = buildExamPrepPlan({ ...base, horizon: { days: 10, endDate: '2026-10-09', source: 'goal' }, dailyMinutes: { value: 30, source: 'goal' } });
    expect(tight.spec.outlook!.fitsInTime).toBe(false);
    expect(tight.spec.outlook!.note).toMatch(/^At 30 minutes a day, the learning weeks cover \d+ of the \d+ topics, weakest and highest-marks subjects first\. About \d+ minutes a day would cover all of them\.$/);
    expect(tight.unscheduled.length).toBe(tight.spec.outlook!.units - tight.spec.outlook!.scheduled);
    const roomy = buildExamPrepPlan({ ...base, dailyMinutes: { value: 180, source: 'goal' } });
    expect(roomy.spec.outlook!.fitsInTime).toBe(true);
    expect(roomy.unscheduled).toEqual([]);
  });

  it('puts the student’s weak topics first, and says why', () => {
    const r = buildExamPrepPlan({ ...base, weakTopics: [{ topic: 'Percentage', accuracy: 35, confidence: 0.9 }] });
    const firstQuant = r.spec.weeks![0].focus.find((f) => f.subject === 'Quantitative Aptitude')!;
    expect(firstQuant.units[0]).toBe('Percentage');
    expect(r.spec.focus[0]).toEqual({ topic: 'Percentage', reason: 'Weak in your quizzes (35%) — first in Quantitative Aptitude' });
    const day = r.spec.days.flatMap((d) => d.tasks).find((t) => t.topic === 'Percentage');
    expect(day?.title).toBe('Revise: Percentage (35% so far)');
  });

  it('shares time equally when the syllabus records no marks, and says so', () => {
    const noMarks = structureFromSyllabus({ syllabusId: 's', nodes: [node('STAGE', 'JEE Main', {}, [node('SUBJECT', 'Physics', {}, [node('TOPIC', 'Kinematics')]), node('SUBJECT', 'Chemistry', {}, [node('TOPIC', 'Atomic Structure')])])] }, { examId: 'JEE_MAIN', examName: 'JEE Main' });
    const r = buildExamPrepPlan({ ...base, exam: { examId: 'JEE_MAIN', name: 'JEE Main', shortName: 'JEE Main' }, structure: noMarks });
    expect(r.subjectShares).toEqual([
      { subject: 'Physics', share: 0.5, basis: 'equal' },
      { subject: 'Chemistry', share: 0.5, basis: 'equal' },
    ]);
    expect(r.spec.focus.find((f) => f.topic === 'Physics')!.reason).toMatch(/records no marks/);
    expect(FIRST_PASS).toBe(45);
  });
});
