import { z } from 'zod';
import { ToolDefinition, ToolRegistry } from '../ToolRegistry';
import { ToolError } from '../toolErrors';
import { CONTEXT_SLICES, loadStudentContext } from '../../memory/studentContext';
import { refusalSummary, screenPastQuestions, sourceKey } from './pastPapers';
import { DEFAULT_DAILY_MINUTES, addDays, dailyMinutesFromGoal, todayIn } from './plan.adapter';
import { ExamStructure, UnitState, buildExamPrepPlan, horizonFromGoal, structureFromSyllabus } from './prepPlan';

/**
 * "Prepare me for X" (Phase 7) — the personal agent's tools. Each is one honest step a student
 * can see: who they are (selectively), which exam and how long, what the exam officially is, where
 * they stand in it, what real past papers exist, and the plan built from all of that by code.
 */

const examIndex = () => require('../../../services/pyq/examIndex');
const examMaster = () => require('../../../services/exam/examMaster.service').examMasterService;
const coverage = () => require('../../../services/learning/syllabusCoverage.service');
const pyqRepo = () => require('../../../repositories/pyq.repository').pyqRepository;

/** Default horizon when the student gives none: a four-week plan they can extend, said so plainly. */
export const DEFAULT_HORIZON_DAYS = 28;

const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s);

// Papers named in the student's own words ("…with Paper 2 Statistics", "for the B.Arch paper").
const PAPER_WORDS = /\b(paper[\s-]*(?:i{1,3}|[123]|[123][ab])|statistics|finance|economics|b\.?\s*arch|b\.?\s*plan(?:ning)?)\b/gi;
export function papersNamed(query: string): string[] {
  return [...new Set([...String(query ?? '').matchAll(PAPER_WORDS)].map((m) => m[1].toLowerCase().replace(/\s+/g, ' ')))];
}

const ROMAN: Record<string, string> = { i: '1', ii: '2', iii: '3' };
const paperNumber = (s: string) => {
  const m = s.toLowerCase().match(/paper[\s-]*(i{1,3}|\d)\s*([ab])?\b/);
  return m ? `${ROMAN[m[1]] ?? m[1]}${m[2] ?? ''}` : undefined;
};

/** Does a paper the syllabus lists ("Paper-II Statistics", "Paper 2A (B.Arch.)") match a word the student used? */
export function paperMatches(paperName: string, word: string): boolean {
  const name = paperName.toLowerCase();
  const w = word.toLowerCase();
  if (/^paper/.test(w)) {
    const want = paperNumber(w);
    const have = paperNumber(name);
    // "paper 2" covers 2A and 2B; "paper 2A" only 2A.
    return Boolean(want && have && (want === have || (want.length === 1 && have.startsWith(want))));
  }
  if (/arch/.test(w)) return /b\.?\s*arch/.test(name);
  if (/plan/.test(w)) return /b\.?\s*plan/.test(name);
  return name.includes(w.replace(/s$/, ''));
}

const goalSchema = z
  .object({
    examId: z.string(),
    examName: z.string(),
    shortName: z.string(),
    startDate: z.string(),
    horizon: z.object({ days: z.number(), endDate: z.string(), source: z.enum(['goal', 'saved_goal', 'default']) }),
    dailyMinutes: z.object({ value: z.number(), source: z.enum(['goal', 'profile', 'saved_goal', 'default']) }),
    papersNamed: z.array(z.string()),
  })
  .passthrough();

export function registerPrepTools(registry: ToolRegistry): ToolRegistry {
  const context: ToolDefinition<any, any> = {
    name: 'get_student_context',
    description:
      "Selective student memory: only the slices asked for — profile (onboarding target, hours a day), goal (saved exam and date), history (how much they've practised), weakTopics (what the grader recorded), plans (study plans Sadhya made before).",
    category: 'student',
    inputSchema: z.object({ slices: z.array(z.enum(CONTEXT_SLICES)).min(1).max(CONTEXT_SLICES.length) }),
    outputSchema: z
      .object({
        profile: z.any().optional(),
        goal: z.any().optional(),
        history: z.any().optional(),
        weakTopics: z.any().optional(),
        plans: z.any().optional(),
      })
      .passthrough(),
    permissions: ['read:own-history'],
    costClass: 'free',
    timeoutMs: 20_000,
    retry: { maxAttempts: 2, baseBackoffMs: 400 },
    idempotent: true,
    requiresApproval: false,
    provenance: 'STUDENT_UPLOAD',
    async execute(input, ctx) {
      return { data: await loadStudentContext(ctx.userId, input.slices), provenance: 'STUDENT_UPLOAD' };
    },
    summarize: (out: any) => ({ slices: Object.keys(out ?? {}), history: out?.history ? `${out.history.quizzes}q/${out.history.tests}t` : undefined }),
  };

  const goal: ToolDefinition<any, any> = {
    name: 'resolve_exam_goal',
    description:
      "Exam identification and time: which exam (from the request, else the student's saved goal or onboarding), how many days (the request's “in 90 days” or date, else the saved exam date, else a stated 4-week default) and minutes a day (the request, else onboarding hours, else the saved weekly hours, else 60).",
    category: 'student',
    inputSchema: z.object({ query: z.string().min(3).max(400), context: z.object({}).passthrough().optional() }),
    outputSchema: goalSchema,
    permissions: ['read:own-history'],
    costClass: 'free',
    timeoutMs: 15_000,
    retry: { maxAttempts: 2, baseBackoffMs: 400 },
    idempotent: true,
    requiresApproval: false,
    provenance: 'VERIFIED_CORPUS',
    async execute(input) {
      const c: any = input.context ?? {};
      const detect = async (text?: string): Promise<string | null> => (text ? examIndex().detectExamId(text).catch(() => null) : null);
      const examId = (await detect(input.query)) ?? (await detect(c.goal?.targetExam)) ?? (await detect(c.profile?.targetExam));
      if (!examId) throw new ToolError('validation', 'Which exam are you preparing for? For example: “Prepare me for SSC CGL in 90 days”.');
      const exam: any = await examMaster().getExam(examId).catch(() => null);
      const today = todayIn();

      const fromGoal = horizonFromGoal(input.query, today);
      const saved = typeof c.goal?.examDate === 'string' && c.goal.examDate > today && /^(\d{4})-(\d{2})-(\d{2})$/.test(c.goal.examDate) ? c.goal.examDate : undefined;
      const savedDays = saved ? Math.round((Date.parse(`${saved}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86_400_000) : 0;
      const horizon = fromGoal
        ? { ...fromGoal, source: 'goal' as const }
        : saved && savedDays >= 1 && savedDays <= 400
          ? { days: savedDays, endDate: addDays(saved, -1), source: 'saved_goal' as const }
          : { days: DEFAULT_HORIZON_DAYS, endDate: addDays(today, DEFAULT_HORIZON_DAYS - 1), source: 'default' as const };

      const said = dailyMinutesFromGoal(input.query);
      const profileHours = Number(c.profile?.dailyStudyHours);
      const weekly = Number(c.goal?.weeklyHours);
      const dailyMinutes = said
        ? { value: said, source: 'goal' as const }
        : profileHours > 0
          ? { value: Math.round(profileHours * 60), source: 'profile' as const }
          : weekly > 0
            ? { value: Math.round((weekly * 60) / 7), source: 'saved_goal' as const }
            : { value: DEFAULT_DAILY_MINUTES, source: 'default' as const };
      dailyMinutes.value = Math.max(15, Math.min(600, dailyMinutes.value));

      return {
        data: {
          examId,
          examName: String(exam?.name ?? examId.replace(/_/g, ' ')),
          shortName: String(exam?.shortName ?? examId.replace(/_/g, ' ')),
          startDate: today,
          horizon,
          dailyMinutes,
          papersNamed: papersNamed(input.query),
        },
        provenance: 'VERIFIED_CORPUS',
      };
    },
    summarize: (out: any) => ({ exam: out?.examId, days: out?.horizon?.days, daysFrom: out?.horizon?.source, minutes: out?.dailyMinutes?.value }),
  };

  const structure: ToolDefinition<any, any> = {
    name: 'get_exam_structure',
    description:
      "The exam's official structure from its current syllabus document: the stages and papers covered, each subject's recorded marks, question counts and times, and its study topics (worded as the syllabus words them). Papers the student didn't name are listed as not included.",
    category: 'knowledge',
    inputSchema: z.object({ examId: z.string().min(2).max(60), papersNamed: z.array(z.string().max(40)).max(6).default([]) }),
    outputSchema: z
      .object({
        examId: z.string(),
        syllabusId: z.string(),
        source: z.object({}).passthrough(),
        scope: z.array(z.object({ path: z.string() }).passthrough()),
        notIncluded: z.array(z.string()),
        subjects: z.array(z.object({ name: z.string(), units: z.array(z.object({ key: z.string(), label: z.string() }).passthrough()) }).passthrough()).min(1),
      })
      .passthrough(),
    permissions: ['read:shared-corpus'],
    costClass: 'free',
    timeoutMs: 30_000,
    retry: { maxAttempts: 2, baseBackoffMs: 500 },
    idempotent: true,
    requiresApproval: false,
    provenance: 'VERIFIED_CORPUS',
    async execute(input) {
      const [exam, syllabus]: any[] = await Promise.all([examMaster().getExam(input.examId).catch(() => null), examMaster().getCurrentSyllabus(input.examId).catch(() => null)]);
      if (!syllabus?.nodes?.length) throw new ToolError('not_found', `Sadhya doesn't have the official syllabus for ${exam?.name ?? input.examId} yet, so I can't plan against it.`);
      const words: string[] = input.papersNamed ?? [];
      const s = structureFromSyllabus(syllabus, {
        examId: input.examId,
        examName: String(exam?.name ?? input.examId),
        wantsPaper: (name) => words.some((w) => paperMatches(name, w)),
      });
      if (!s.subjects.length) throw new ToolError('not_found', `The official syllabus for ${exam?.name ?? input.examId} lists no subjects I can plan with.`);
      return { data: s, provenance: 'VERIFIED_CORPUS' };
    },
    summarize: (out: any) => ({ subjects: out?.subjects?.length ?? 0, units: (out?.subjects ?? []).reduce((n: number, s: any) => n + (s.units?.length ?? 0), 0), scope: (out?.scope ?? []).map((p: any) => p.path) }),
  };

  const readiness: ToolDefinition<any, any> = {
    name: 'get_exam_readiness',
    description:
      "Where the student stands in this exam: their coverage of its syllabus (topics untouched / learning / weak / strong / mastered, from their graded practice) and the weak topics the grader recorded for it.",
    category: 'student',
    inputSchema: z.object({ examId: z.string().min(2).max(60) }),
    outputSchema: z
      .object({
        examId: z.string(),
        practised: z.boolean(),
        totals: z.object({}).passthrough().nullable(),
        leafStates: z.record(z.string(), z.string()),
        weakTopics: z.array(z.object({ topic: z.string(), accuracy: z.number(), confidence: z.number() }).passthrough()),
      })
      .passthrough(),
    permissions: ['read:own-history'],
    costClass: 'free',
    timeoutMs: 30_000,
    retry: { maxAttempts: 2, baseBackoffMs: 500 },
    idempotent: true,
    requiresApproval: false,
    provenance: 'STUDENT_UPLOAD',
    async execute(input, ctx) {
      const [cov, mem]: any[] = await Promise.all([
        coverage().getSyllabusCoverage(ctx.userId, input.examId).catch(() => null),
        loadStudentContext(ctx.userId, ['weakTopics']),
      ]);
      const leafStates: Record<string, UnitState> = {};
      const walk = (nodes: any[]) =>
        (nodes ?? []).forEach((n) => {
          if (n.isLeaf && n.state && n.state !== 'UNTOUCHED') leafStates[String(n.nodeId)] = n.state;
          walk(n.children);
        });
      walk(cov?.subjects ?? []);
      const weakTopics = (mem.weakTopics ?? []).filter((w: any) => w.examId === input.examId).slice(0, 30);
      return {
        data: {
          examId: input.examId,
          practised: Object.keys(leafStates).length > 0 || weakTopics.length > 0,
          totals: cov?.totals ?? null,
          leafStates,
          weakTopics,
        },
        provenance: 'STUDENT_UPLOAD',
      };
    },
    summarize: (out: any) => ({ practised: out?.practised, touched: Object.keys(out?.leafStates ?? {}).length, weak: out?.weakTopics?.length ?? 0 }),
  };

  const papers: ToolDefinition<any, any> = {
    name: 'check_past_papers',
    description:
      "Which real past papers of the exam Sadhya can offer for practice — only papers that pass the past-paper screen (real source, official answers, a plausible answer key). Reports how many, which years, and why the rest were refused.",
    category: 'assessment',
    inputSchema: z.object({ examId: z.string().min(2).max(60), examName: z.string().max(200).optional() }),
    outputSchema: z.object({ available: z.boolean(), papers: z.number(), years: z.array(z.number()), note: z.string(), excluded: z.record(z.string(), z.number()) }).passthrough(),
    permissions: ['read:shared-corpus'],
    costClass: 'free',
    timeoutMs: 45_000,
    retry: { maxAttempts: 2, baseBackoffMs: 500 },
    idempotent: true,
    requiresApproval: false,
    provenance: 'VERIFIED_CORPUS',
    async execute(input) {
      const name = input.examName || input.examId.replace(/_/g, ' ');
      const confirmed: any[] = await pyqRepo().listQuestions({ examId: input.examId, verificationStatus: 'OFFICIAL_CONFIRMED', limit: 1000 }).catch(() => []);
      let screened = await screenPastQuestions(confirmed);
      if (!screened.usable.length) {
        const sample: any[] = await pyqRepo().listQuestions({ examId: input.examId, limit: 400 }).catch(() => []);
        screened = await screenPastQuestions(sample.length ? sample : confirmed);
      }
      const sources = new Set(screened.usable.map(sourceKey));
      const years = [...new Set(screened.usable.map((q: any) => Number(q.year)).filter((y: number) => y > 1900))].sort();
      const available = sources.size > 0;
      const refused = refusalSummary(screened.excluded);
      const note = available
        ? `Real ${name} papers are available: ${sources.size} ${sources.size === 1 ? 'sitting' : 'sittings'} from ${years.length === 1 ? years[0] : `${years[0]}–${years[years.length - 1]}`} in what I checked. Ask me “Make a ${name} mock test” for one paper, or “Give me ${name} PYQs” for questions by year and topic. The answers are the ones recorded from the official key.`
        : `Sadhya has no ${name} past papers I can offer as real papers yet${refused ? ` (not used: ${refused})` : ''}, so timed practice uses practice questions, not real papers.`;
      return { data: { available, papers: sources.size, years, note: clip(note, 700), excluded: screened.excluded }, provenance: 'VERIFIED_CORPUS' };
    },
    summarize: (out: any) => ({ available: out?.available, papers: out?.papers }),
  };

  const plan: ToolDefinition<any, any> = {
    name: 'build_exam_prep_plan',
    description:
      'Builds the preparation plan by code (no model): phases, weekly milestones, the first week day by day, time split by the official marks, weakest topics first, honest arithmetic about what fits, and a practice strategy.',
    category: 'planning',
    inputSchema: z.object({
      goal: goalSchema,
      structure: z.object({ subjects: z.array(z.any()).min(1) }).passthrough(),
      readiness: z.object({ leafStates: z.record(z.string(), z.string()), weakTopics: z.array(z.any()) }).passthrough().optional(),
      pastPapers: z.object({ available: z.boolean(), papers: z.number(), note: z.string() }).passthrough().optional(),
      context: z.object({}).passthrough().optional(),
    }),
    outputSchema: z
      .object({
        spec: z.object({ title: z.string(), days: z.array(z.any()), weeks: z.array(z.any()) }).passthrough(),
        unscheduled: z.array(z.object({ subject: z.string(), unit: z.string() })),
        phases: z.object({ learn: z.number(), practise: z.number(), revise: z.number() }),
        subjectShares: z.array(z.object({ subject: z.string(), share: z.number(), basis: z.string() })),
      })
      .passthrough(),
    permissions: ['read:own-history'],
    costClass: 'free',
    timeoutMs: 15_000,
    retry: { maxAttempts: 1, baseBackoffMs: 0 },
    idempotent: true,
    requiresApproval: false,
    provenance: 'VERIFIED_CORPUS',
    async execute(input) {
      const g = input.goal;
      const history = (input.context as any)?.history ?? null;
      const result = buildExamPrepPlan({
        exam: { examId: g.examId, name: g.examName, shortName: g.shortName },
        startDate: g.startDate,
        horizon: g.horizon,
        dailyMinutes: g.dailyMinutes,
        structure: input.structure as unknown as ExamStructure,
        leafStates: (input.readiness?.leafStates ?? {}) as Record<string, UnitState>,
        weakTopics: (input.readiness?.weakTopics ?? []) as any[],
        history: history && typeof history === 'object' ? history : null,
        pastPapers: input.pastPapers ?? null,
      });
      return { data: result, provenance: 'VERIFIED_CORPUS' };
    },
    summarize: (out: any) => ({ weeks: out?.spec?.weeks?.length ?? 0, topics: out?.spec?.outlook?.units, scheduled: out?.spec?.outlook?.scheduled }),
  };

  for (const tool of [context, goal, structure, readiness, papers, plan]) registry.register(tool);
  return registry;
}
