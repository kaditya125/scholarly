import { z } from 'zod';
import { featureFlags } from '../../../config/featureFlags';
import { ReportSpec, StudyPlanSpec, reportSpecSchema, studyPlanSpecSchema } from '../../artifacts/artifact.types';
import { ToolDefinition, ToolRegistry } from '../ToolRegistry';
import { ToolError } from '../toolErrors';

/**
 * Revision plans (Phase 6): "Create a revision plan for those weak areas."
 *
 * Built by a schedule, not a model. The existing planner asks an LLM for raw JSON with no schema;
 * this one places each weak area on a learning day, then reviews it at +1, +3 and +6 days (spaced
 * repetition), keeps every day inside the student's daily minutes, and ends with a check-quiz.
 * `checkPlan` re-validates the result, so a plan that breaks its own rules is never saved.
 */

const artifacts = () => require('../../artifacts/artifacts.service').getArtifactsService();

export const DEFAULT_PLAN_DAYS = 7;
export const DEFAULT_DAILY_MINUTES = 60;

/** A request that also wants revision planned: "…and create a revision plan", "plan my revision". */
export const WANTS_REVISION_PLAN = /\b(revision|revise|study)\b[^.?!]*\bplan\b|\bplan\b[^.?!]*\b(revision|revise)\b|\brevision\s+(schedule|timetable)\b/i;

const WORD_NUMBERS: Record<string, number> = {
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, fourteen: 14, fifteen: 15, twenty: 20, thirty: 30,
};
const num = (s: string) => (/^\d+$/.test(s) ? Number(s) : WORD_NUMBERS[s.toLowerCase()] ?? NaN);

/** "a 7-day plan", "in 5 days", "over two weeks", "for a week" → days. */
export function planDaysFromGoal(goal: string): number | undefined {
  const g = String(goal ?? '').toLowerCase();
  // Every "<n> day(s)" candidate, not just the first: "today" and "Sunday" also end in "day".
  for (const m of g.matchAll(/\b(\d{1,2}|[a-z]+)[\s-]+days?\b|\b(\d{1,2})-?days?\b/g)) {
    const n = num(m[1] ?? m[2]);
    if (Number.isFinite(n) && n > 0) return n;
  }
  for (const m of g.matchAll(/\b(\d{1,2}|[a-z]+)[\s-]+weeks?\b/g)) {
    const n = m[1] === 'a' ? 1 : num(m[1]);
    if (Number.isFinite(n) && n > 0) return n * 7;
  }
  return undefined;
}

/** "30 minutes a day", "1 hour daily", "2 hours per day" → minutes. */
export function dailyMinutesFromGoal(goal: string): number | undefined {
  const m = String(goal ?? '')
    .toLowerCase()
    .match(/\b(\d{1,3}(?:\.\d)?)\s*(minutes?|mins?|hours?|hrs?)\s*(?:a|per|each|every)?\s*(?:day|daily)\b/);
  if (!m) return undefined;
  const n = Number(m[1]);
  return /^h/.test(m[2]) ? Math.round(n * 60) : Math.round(n);
}

/** Today's date where the student is (Sadhya's students are in India). */
export function todayIn(timeZone = 'Asia/Kolkata', now = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}

export function addDays(isoDate: string, n: number): string {
  const d = new Date(`${isoDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

type Task = StudyPlanSpec['days'][number]['tasks'][number];
type Area = ReportSpec['weakAreas'][number];

const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s);

/** Where to revise an area: the chart's pages, else its syllabus location. */
function whereToRevise(area: Area): string | undefined {
  if (area.refs?.length) {
    const pages = [...new Set(area.refs.map((r) => r.page).filter((p): p is number => Boolean(p)))].sort((a, b) => a - b);
    const label = area.refs[0].label;
    return clip(`${label}${pages.length ? `, ${pages.length === 1 ? 'p.' : 'pp.'} ${pages.slice(0, 4).join(', ')} of the chapter` : ''}`, 240);
  }
  if (area.syllabusPath?.length) return clip(`Syllabus: ${area.syllabusPath.join(' › ')}`, 240);
  return undefined;
}

/** Worst first, discounted when there is little evidence behind a row. */
const priority = (a: Area) => (100 - a.accuracy) * (0.5 + 0.5 * a.confidence);

export interface PlanOptions {
  report: ReportSpec;
  reportArtifactId?: string;
  days?: number;
  dailyMinutes?: number;
  startDate: string;
}

export function buildRevisionPlan(opts: PlanOptions): StudyPlanSpec & { unscheduled: string[] } {
  const ranked = [...(opts.report.weakAreas ?? [])].sort((a, b) => priority(b) - priority(a));
  if (ranked.length === 0) {
    throw new ToolError('not_found', 'The analysis found no weak areas, so there is nothing to plan revision for.');
  }
  const D = Math.min(30, Math.max(3, Math.round(opts.days ?? DEFAULT_PLAN_DAYS)));
  const M = Math.min(240, Math.max(30, Math.round(opts.dailyMinutes ?? DEFAULT_DAILY_MINUTES)));
  const days: Task[][] = Array.from({ length: D }, () => []);
  const used = (d: number) => days[d].reduce((n, t) => n + t.minutes, 0);
  const place = (from: number, task: Task, until = D - 1): number => {
    for (let d = Math.max(0, from); d <= until; d++) {
      if (used(d) + task.minutes <= M) {
        days[d].push(task);
        return d;
      }
    }
    return -1;
  };

  // The check-quiz is reserved on the last day first, so late reviews fit around it; its title is
  // filled in once the scheduled areas are known.
  const checkQuiz: Task = { kind: 'test', title: 'Check-quiz', minutes: 20, ref: 'Ask Sadhya: “Quiz me on my weak areas”' };
  days[D - 1].push(checkQuiz);

  // Learning is spread over all but the last two days, which are for review and the check-quiz.
  const learnSpan = Math.max(1, D - 2);
  const scheduled: Area[] = [];
  const unscheduled: string[] = [];
  ranked.forEach((area, i) => {
    const target = Math.min(learnSpan - 1, Math.floor((i * learnSpan) / ranked.length));
    const where = whereToRevise(area);
    const learnDay = place(target, { kind: 'revise', title: clip(`Revise ${area.topic}`, 240), minutes: 25, topic: clip(area.topic, 200), ...(where ? { ref: where } : {}) }, D - 2);
    if (learnDay < 0) {
      unscheduled.push(area.topic);
      return;
    }
    scheduled.push(area);
    const missed = area.total - area.correct;
    place(learnDay, {
      kind: 'practice',
      title: clip(`Redo the ${missed} question${missed === 1 ? '' : 's'} you missed on ${area.topic}`, 240),
      minutes: 15,
      topic: clip(area.topic, 200),
      ref: 'The questions are listed in your analysis',
    });
    // Spaced reviews, each a different kind of retrieval: recall (flashcards for a formula-chart
    // topic) the next day, the missed questions again without notes after three, and explaining it
    // back after six — which may share the last day with the check-quiz.
    const reviews: Array<{ gap: number; task: Task }> = [
      {
        gap: 1,
        task: area.refs?.length
          ? { kind: 'flashcards', title: clip(`Flashcards: the formulae of ${area.topic}`, 240), minutes: 10, topic: clip(area.topic, 200) }
          : { kind: 'review', title: clip(`Recall ${area.topic}: write the key points from memory, then check them`, 240), minutes: 10, topic: clip(area.topic, 200) },
      },
      { gap: 3, task: { kind: 'practice', title: clip(`Redo the questions you missed on ${area.topic}, without notes`, 240), minutes: 10, topic: clip(area.topic, 200) } },
      { gap: 6, task: { kind: 'review', title: clip(`Explain ${area.topic} aloud in your own words, then check it against the chapter`, 240), minutes: 10, topic: clip(area.topic, 200) } },
    ];
    for (const { gap, task } of reviews) {
      if (learnDay + gap > D - 1) break;
      place(learnDay + gap, task);
    }
  });
  if (scheduled.length === 0) {
    throw new ToolError('validation', `Nothing fits in ${D} days at ${M} minutes a day. Try more days or more time each day.`);
  }

  const names = scheduled.map((a) => a.topic);
  checkQuiz.title = clip(`Check-quiz on ${names.slice(0, 3).join(', ')}${names.length > 3 ? ` and ${names.length - 3} more` : ''}`, 240);
  // No empty days. Strong topics are kept warm in turn; with none, the weakest area gets a short,
  // different retrieval task rather than the same line repeated.
  const strong = (opts.report.strongAreas ?? []).map((s) => s.topic);
  const fallback = [
    (t: string) => `Five-minute self-test: jot down everything you remember about ${t}`,
    (t: string) => `Make one worked example on ${t} and solve it from scratch`,
    (t: string) => `Recall ${t}: write the key points from memory, then check them`,
  ];
  let spare = 0;
  for (let d = 0; d < D; d++) {
    if (days[d].length > 0) continue;
    const task: Task = strong.length
      ? { kind: 'review', title: clip(`Keep warm: a 10-minute review of ${strong[spare % strong.length]}`, 240), minutes: 10, topic: clip(strong[spare % strong.length], 200) }
      : { kind: 'review', title: clip(fallback[spare % fallback.length](scheduled[0].topic), 240), minutes: 10, topic: clip(scheduled[0].topic, 200) };
    days[d].push(task);
    spare++;
  }

  const plan: StudyPlanSpec = {
    title: clip(`Revision plan — ${scheduled.length} weak area${scheduled.length === 1 ? '' : 's'} in ${D} days`, 120),
    startDate: opts.startDate,
    dailyMinutes: M,
    days: days.map((tasks, d) => ({ date: addDays(opts.startDate, d), tasks })),
    focus: scheduled.map((a) => ({
      topic: clip(a.topic, 200),
      reason: clip(`${a.correct}/${a.total} correct (${a.accuracy}%)${a.confidence < 0.5 ? ' — only a few questions, so treat this as a hint' : ''}`, 300),
    })),
    ...(opts.reportArtifactId ? { sourceArtifactId: opts.reportArtifactId } : {}),
  };
  checkPlan(plan, scheduled.map((a) => a.topic));
  return { ...plan, unscheduled };
}

/** The plan's own rules, re-checked on the finished plan. */
export function checkPlan(plan: StudyPlanSpec, topics: string[]): void {
  studyPlanSpecSchema.parse(plan);
  plan.days.forEach((day, i) => {
    if (i > 0 && day.date !== addDays(plan.days[i - 1].date, 1)) throw new ToolError('validation', 'The plan’s days are not consecutive.');
    const minutes = day.tasks.reduce((n, t) => n + t.minutes, 0);
    if (minutes > plan.dailyMinutes) throw new ToolError('validation', `Day ${i + 1} needs ${minutes} minutes, more than ${plan.dailyMinutes}.`);
  });
  for (const topic of topics) {
    const tasks = plan.days.flatMap((d) => d.tasks).filter((t) => t.topic === clip(topic, 200));
    if (!tasks.some((t) => t.kind === 'revise')) throw new ToolError('validation', `“${topic}” has no revision session.`);
    if (plan.days.length >= 4 && !tasks.some((t) => t.kind !== 'revise')) throw new ToolError('validation', `“${topic}” is never reviewed or practised.`);
  }
}

// ── Tools ──────────────────────────────────────────────────────────────────────────────────

export function registerPlanTools(registry: ToolRegistry): ToolRegistry {
  const latestReport: ToolDefinition<any, any> = {
    name: 'find_my_latest_analysis',
    description: "Finds the student's most recent performance analysis, so a revision plan is built from exactly the weak areas it found.",
    category: 'artifact',
    inputSchema: z.object({}),
    outputSchema: z.object({ found: z.boolean(), artifactId: z.string().optional(), title: z.string().optional(), spec: z.any().optional() }).passthrough(),
    permissions: ['read:own-artifact'],
    costClass: 'free',
    timeoutMs: 15_000,
    retry: { maxAttempts: 2, baseBackoffMs: 400 },
    idempotent: true,
    requiresApproval: false,
    provenance: 'STUDENT_UPLOAD',
    isEnabled: () => featureFlags.agentArtifacts,
    async execute(_input, ctx) {
      const mine: any[] = await artifacts().listForUser(ctx.userId, 30);
      const report = mine.find((a) => a.kind === 'report' && a.status === 'ready');
      if (!report) return { data: { found: false }, provenance: 'STUDENT_UPLOAD' };
      return { data: { found: true, artifactId: report.artifactId, title: report.title, spec: report.spec }, provenance: 'STUDENT_UPLOAD' };
    },
    summarize: (out: any) => (out?.found ? { found: true, title: out.title } : { found: false }),
  };

  const build: ToolDefinition<any, any> = {
    name: 'build_revision_plan',
    description:
      'Schedules revision for the weak areas of an analysis: one learning session each, spaced reviews at +1, +3 and +6 days, a check-quiz at the end, ' +
      'every day within the student’s daily minutes. Deterministic and re-validated; no model call.',
    category: 'student',
    inputSchema: z.object({
      report: z.object({ weakAreas: z.array(z.any()) }).passthrough(),
      reportArtifactId: z.string().optional(),
      days: z.number().int().min(3).max(30).optional(),
      dailyMinutes: z.number().int().min(30).max(240).optional(),
    }),
    outputSchema: studyPlanSpecSchema.extend({ unscheduled: z.array(z.string()) }),
    permissions: ['read:own-history'],
    costClass: 'free',
    timeoutMs: 5_000,
    retry: { maxAttempts: 1, baseBackoffMs: 0 },
    idempotent: true,
    requiresApproval: false,
    provenance: 'STUDENT_UPLOAD',
    async execute(input) {
      const report = reportSpecSchema.parse(input.report);
      return {
        data: buildRevisionPlan({ report, reportArtifactId: input.reportArtifactId, days: input.days, dailyMinutes: input.dailyMinutes, startDate: todayIn() }),
        provenance: 'STUDENT_UPLOAD',
      };
    },
    summarize: (out: any) => ({ days: out?.days?.length ?? 0, focus: out?.focus?.length ?? 0 }),
  };

  const create: ToolDefinition<any, any> = {
    name: 'create_studyplan_artifact',
    description: 'Saves a revision plan the student owns and can open in the workspace.',
    category: 'artifact',
    inputSchema: z.object({ plan: z.object({ title: z.string(), days: z.array(z.any()) }).passthrough() }),
    outputSchema: z.object({ artifactId: z.string(), title: z.string(), dayCount: z.number() }).passthrough(),
    permissions: ['write:own-artifact'],
    costClass: 'free',
    timeoutMs: 15_000,
    retry: { maxAttempts: 1, baseBackoffMs: 0 },
    idempotent: false,
    requiresApproval: false,
    provenance: 'STUDENT_UPLOAD',
    isEnabled: () => featureFlags.agentArtifacts,
    async execute(input, ctx) {
      const spec = studyPlanSpecSchema.parse(input.plan);
      const doc = await artifacts().createStructured('studyplan', { userId: ctx.userId, runId: ctx.runId, spec, provenance: 'STUDENT_UPLOAD' });
      return {
        data: { artifactId: doc.artifactId, title: doc.title, dayCount: spec.days.length, ...(spec.weeks?.length ? { weekCount: spec.weeks.length } : {}), kind: 'studyplan' },
        provenance: 'STUDENT_UPLOAD',
      };
    },
    summarize: (out: any) => ({ artifactId: out?.artifactId, days: out?.dayCount }),
  };

  for (const tool of [latestReport, build, create]) registry.register(tool);
  return registry;
}
