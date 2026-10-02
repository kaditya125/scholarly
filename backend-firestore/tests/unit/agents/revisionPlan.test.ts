/**
 * Phase 6 — revision plans are schedules with rules, and the finished plan is re-checked against
 * them: every weak area is revised and reviewed, no day overruns, days are consecutive.
 */
import {
  WANTS_REVISION_PLAN,
  addDays,
  buildRevisionPlan,
  checkPlan,
  dailyMinutesFromGoal,
  planDaysFromGoal,
  todayIn,
} from '../../../src/agents/tools/adapters/plan.adapter';
import { ReportSpec, studyPlanSpecSchema } from '../../../src/agents/artifacts/artifact.types';

const area = (topic: string, correct: number, total: number, extra: Partial<ReportSpec['weakAreas'][number]> = {}) => ({
  topic,
  correct,
  total,
  accuracy: Math.round((correct / total) * 100),
  confidence: Math.min(1, total / 8),
  ...extra,
});
const report = (weakAreas: any[]): ReportSpec => ({
  title: 'Mistake analysis — Laws of Motion — Quiz',
  basis: { attempts: [{ attemptId: 'qa_1', title: 'Laws of Motion — Quiz', accuracy: 55, questions: 20 }], questionsAnswered: 20 },
  weakAreas,
  strongAreas: [],
  mistakes: [],
  recommendations: [],
});

const WEAK = [
  area('Circular motion', 1, 4, { refs: [{ label: '§4.10 Circular Motion', page: 15 }, { label: '§4.10 Circular Motion', page: 16 }] }),
  area('Common forces in mechanics', 2, 5, { refs: [{ label: '§4.9 Common Forces in Mechanics', page: 12 }] }),
  area('Symbols and SI units', 0, 2),
];

describe('buildRevisionPlan', () => {
  const plan = buildRevisionPlan({ report: report(WEAK), reportArtifactId: 'rep-1', startDate: '2026-09-28' });

  it('is a valid study plan: 7 consecutive days from the start date, 60 minutes a day by default', () => {
    expect(studyPlanSpecSchema.safeParse(plan).success).toBe(true);
    expect(plan.days).toHaveLength(7);
    expect(plan.days.map((d) => d.date)).toEqual(['2026-09-28', '2026-09-29', '2026-09-30', '2026-10-01', '2026-10-02', '2026-10-03', '2026-10-04']);
    expect(plan.dailyMinutes).toBe(60);
    for (const day of plan.days) expect(day.tasks.reduce((n, t) => n + t.minutes, 0)).toBeLessThanOrEqual(60);
    expect(plan.sourceArtifactId).toBe('rep-1');
  });

  it('revises each weak area once, the worst first, then reviews it on later days', () => {
    const all = plan.days.flatMap((d, i) => d.tasks.map((t) => ({ ...t, day: i })));
    const learnDay = (topic: string) => all.find((t) => t.topic === topic && t.kind === 'revise')!.day;
    expect(learnDay('Circular motion')).toBeLessThanOrEqual(learnDay('Common forces in mechanics'));
    for (const a of WEAK) {
      expect(all.filter((t) => t.topic === a.topic && t.kind === 'revise')).toHaveLength(1);
      const later = all.filter((t) => t.topic === a.topic && t.kind !== 'revise' && t.kind !== 'practice' && t.day > learnDay(a.topic));
      expect(later.length).toBeGreaterThanOrEqual(1);
    }
  });

  it('sends formula-chart topics to their pages and reviews them on flashcards', () => {
    const tasks = plan.days.flatMap((d) => d.tasks);
    expect(tasks.find((t) => t.topic === 'Circular motion' && t.kind === 'revise')?.ref).toBe('§4.10 Circular Motion, pp. 15, 16 of the chapter');
    expect(tasks.some((t) => t.topic === 'Circular motion' && t.kind === 'flashcards')).toBe(true);
    expect(tasks.some((t) => t.topic === 'Symbols and SI units' && t.kind === 'flashcards')).toBe(false);
  });

  it('ends with a check-quiz and explains each focus area, flagging thin evidence', () => {
    expect(plan.days[6].tasks.some((t) => t.kind === 'test')).toBe(true);
    expect(plan.focus.find((f) => f.topic === 'Symbols and SI units')?.reason).toBe('0/2 correct (0%) — only a few questions, so treat this as a hint');
    expect(plan.title).toBe('Revision plan — 3 weak areas in 7 days');
  });

  it('respects the student’s days and minutes, and says what did not fit instead of overrunning', () => {
    const many = Array.from({ length: 10 }, (_, i) => area(`Topic ${i + 1}`, 0, 4));
    const tight = buildRevisionPlan({ report: report(many), startDate: '2026-09-28', days: 3, dailyMinutes: 45 });
    expect(tight.days).toHaveLength(3);
    for (const day of tight.days) expect(day.tasks.reduce((n, t) => n + t.minutes, 0)).toBeLessThanOrEqual(45);
    expect(tight.unscheduled.length).toBeGreaterThan(0);
    expect(tight.focus.length + tight.unscheduled.length).toBe(10);
  });

  it('reviews each area three different ways, the last of them allowed on the check-quiz day', () => {
    const one = buildRevisionPlan({ report: report([WEAK[0]]), startDate: '2026-09-28' });
    const kinds = one.days.map((d) => d.tasks.filter((t) => t.topic === 'Circular motion').map((t) => t.kind));
    expect(kinds[0]).toEqual(['revise', 'practice']);
    expect(kinds[1]).toEqual(['flashcards']);
    expect(kinds[3]).toEqual(['practice']);
    expect(kinds[6]).toEqual(['review']);
    expect(one.days[6].tasks.map((t) => t.kind)).toEqual(['test', 'review']);
  });

  it('keeps strong topics warm on otherwise empty days, and varies the filler when there are none', () => {
    const withStrong = buildRevisionPlan({
      report: { ...report([WEAK[0]]), strongAreas: [{ topic: 'Friction', accuracy: 100, total: 5 }, { topic: 'Momentum', accuracy: 90, total: 10 }] },
      startDate: '2026-09-28',
    });
    const fillers = withStrong.days.flatMap((d) => d.tasks).filter((t) => /^Keep warm/.test(t.title));
    expect(fillers.map((t) => t.topic)).toEqual(['Friction', 'Momentum', 'Friction']);
    const without = buildRevisionPlan({ report: report([WEAK[0]]), startDate: '2026-09-28' });
    const spare = without.days.filter((d) => d.tasks.every((t) => t.kind === 'review' && !/Explain/.test(t.title))).map((d) => d.tasks[0].title);
    expect(new Set(spare).size).toBe(spare.length);
  });

  it('never lets reviews crowd the check-quiz off the last day', () => {
    const tight = buildRevisionPlan({ report: report(Array.from({ length: 4 }, (_, i) => area(`Topic ${i + 1}`, 0, 4))), startDate: '2026-09-28', dailyMinutes: 30 });
    expect(tight.days[tight.days.length - 1].tasks.some((t) => t.kind === 'test')).toBe(true);
    for (const day of tight.days) expect(day.tasks.reduce((n, t) => n + t.minutes, 0)).toBeLessThanOrEqual(30);
  });

  it('refuses to plan when there are no weak areas', () => {
    expect(() => buildRevisionPlan({ report: report([]), startDate: '2026-09-28' })).toThrow(/no weak areas/);
  });
});

describe('checkPlan', () => {
  const base = buildRevisionPlan({ report: report(WEAK), startDate: '2026-09-28' });
  const { unscheduled: _u, ...plan } = base;
  const topics = WEAK.map((w) => w.topic);

  it('accepts the plan the builder made', () => {
    expect(() => checkPlan(plan, topics)).not.toThrow();
  });

  it('rejects an overrunning day, a gap in the dates, and an area never revised', () => {
    const over = structuredClone(plan);
    over.days[0].tasks.push({ kind: 'review', title: 'Extra', minutes: 60 });
    expect(() => checkPlan(over, topics)).toThrow(/needs \d+ minutes/);
    const gap = structuredClone(plan);
    gap.days[2].date = '2026-10-15';
    expect(() => checkPlan(gap, topics)).toThrow(/not consecutive/);
    expect(() => checkPlan(plan, [...topics, 'Work, Energy and Power'])).toThrow(/has no revision session/);
  });
});

describe('goal parsing', () => {
  it.each([
    ['Create a revision plan for those weak areas.', undefined],
    ['Make a 7-day revision plan', 7],
    ['a revision plan for the next 10 days', 10],
    ['plan my revision over two weeks', 14],
    ['revise in a week', 7],
    ['Starting today, make a 5 day plan', 5],
    ['every day this sunday', undefined],
  ])('days: %s → %s', (goal, days) => {
    expect(planDaysFromGoal(goal)).toBe(days);
  });

  it.each([
    ['30 minutes a day', 30],
    ['1 hour daily', 60],
    ['2 hours per day', 120],
    ['45 min every day', 45],
    ['a revision plan', undefined],
  ])('minutes: %s → %s', (goal, minutes) => {
    expect(dailyMinutesFromGoal(goal)).toBe(minutes);
  });

  it('knows when a request also asks for a plan', () => {
    expect(WANTS_REVISION_PLAN.test('Analyze my last 5 tests and create a revision plan.')).toBe(true);
    expect(WANTS_REVISION_PLAN.test('Analyze my quiz mistakes and tell me what I should revise.')).toBe(false);
    expect(WANTS_REVISION_PLAN.test('plan my revision')).toBe(true);
  });
});

describe('dates', () => {
  it('uses the student’s date in India, and adds days across months', () => {
    expect(todayIn('Asia/Kolkata', new Date('2026-09-26T20:00:00Z'))).toBe('2026-09-27');
    expect(addDays('2026-09-29', 3)).toBe('2026-10-02');
  });
});
