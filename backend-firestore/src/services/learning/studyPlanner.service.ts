import { getSyllabusCoverage, type CoverageNode, type CoverageState } from './syllabusCoverage.service';
import { logger } from '../../utils/logger';

/**
 * Stage 4 — the deterministic, syllabus-aware study planner.
 *
 * Answers "what should this student study next, and why?" — where the unit of planning is a
 * validated canonical syllabus node, and the activity is chosen for that node afterwards.
 *
 * ── Deterministic on purpose ────────────────────────────────────────────────────────────────
 * The existing PlannerAgent asks a language model to write a timetable and parses whatever comes
 * back. That is left alone for the legacy goal flow, but nothing here calls it. A plan a student
 * organises months of preparation around has to be auditable, repeatable and testable: the same
 * inputs must always produce the same plan, every recommendation must be explainable from the
 * evidence that produced it, and a regression must be catchable by a test rather than noticed by
 * a student. "The AI chose this" is not a reason.
 *
 * ── What is deliberately NOT an input ───────────────────────────────────────────────────────
 * Marks weightage. Only 9 of 1,701 topics carry marks, so "study this, it's worth 40 marks" would
 * be an invention for 99.5% of the syllabus. Coverage, mastery, recency and exam proximity are
 * the v1 signals, and they are all measured rather than assumed.
 */

export type ActivityType = 'LEARN' | 'PRACTICE' | 'REVISE' | 'QUIZ' | 'TEST';

/**
 * Scoring weights. One place, summing to 1.0, every coefficient argued for.
 *
 * These are ratios of importance, not tuned magic numbers — each is defensible in a sentence,
 * which is the property that matters when a student asks why a topic was chosen.
 */
export const PLANNER_WEIGHTS = {
  /** Never-seen syllabus is the largest single signal: unopened ground is the biggest risk. */
  COVERAGE: 0.35,
  /** Demonstrated difficulty. Slightly below coverage — a known weakness is at least known. */
  WEAKNESS: 0.30,
  /** Overdue review. Real but smaller: forgetting is slower than never having learned. */
  RECENCY: 0.20,
  /** Exam proximity. Deliberately the smallest, so urgency shifts emphasis without erasing basics. */
  URGENCY: 0.10,
  /** Finishing a subject already begun, rather than scattering across the whole syllabus. */
  CONTINUITY: 0.05,
} as const;

/**
 * How long before a node is due to come back, per state, in days.
 *
 * A deliberately simple deterministic schedule rather than a full spaced-repetition algorithm —
 * there was no existing SRS to extend, and inventing one in the same stage as the planner would
 * make both harder to trust. Weak material returns in two days because that is roughly the point
 * at which re-practice still repairs rather than re-teaches; mastered material returns after
 * three weeks purely as maintenance.
 */
export const REVIEW_INTERVAL_DAYS: Record<CoverageState, number> = {
  WEAK: 2,
  LEARNING: 4,
  STRONG: 10,
  MASTERED: 21,
  UNTOUCHED: 0,   // never seen — handled by coverage need, not recency
};

/** Minutes per activity. Used to fit the plan inside the student's real budget. */
export const ACTIVITY_MINUTES: Record<ActivityType, number> = {
  LEARN: 25, PRACTICE: 20, REVISE: 15, QUIZ: 15, TEST: 30,
};

/**
 * The activity ladder per state.
 *
 * A node the student has never opened needs teaching before testing; a weak node needs the
 * concept revisited before more practice, or they simply repeat the same mistake faster.
 */
const ACTIVITIES_FOR: Record<CoverageState, ActivityType[]> = {
  UNTOUCHED: ['LEARN', 'PRACTICE'],
  LEARNING: ['PRACTICE', 'QUIZ'],
  WEAK: ['REVISE', 'PRACTICE', 'QUIZ'],
  STRONG: ['QUIZ'],
  MASTERED: ['REVISE'],
};

export interface PlannerInputs {
  userId: string;
  examId: string;
  /** ISO date. Absent is normal — no exam date must not become an invented one. */
  examDate?: string | null;
  dailyMinutes: number;
  today?: Date;
  /**
   * Coverage source. Defaults to the real one; injectable so a plan can be produced from a known
   * syllabus state without reaching Firestore. Static imports bind at module load, so patching
   * the module afterwards does not take — an example script tried exactly that and silently
   * produced the same plan for three different students.
   */
  loadCoverage?: (userId: string, examId: string) => Promise<Awaited<ReturnType<typeof getSyllabusCoverage>>>;
}

export interface PlanTask {
  /** Deterministic: same student, day, node and activity always yields the same id. */
  id: string;
  syllabusNodeId: string;
  label: string;
  activity: ActivityType;
  estimatedMinutes: number;
  priority: 'high' | 'medium' | 'low';
  /** Human-readable, derived from the signals that actually produced the score. */
  reasons: string[];
  score: number;
  state: CoverageState;
}

export interface DailyPlan {
  date: string;
  examId: string;
  examDate: string | null;
  daysUntilExam: number | null;
  plannedMinutes: number;
  budgetMinutes: number;
  tasks: PlanTask[];
  /** Honest arithmetic about what remains — see estimateRemaining. */
  outlook: {
    addressable: number;
    untouched: number;
    weak: number;
    estimatedDaysToCover: number | null;
    achievableBeforeExam: boolean | null;
    note?: string;
  };
  generatedAt: number;
}

const DAY_MS = 86_400_000;
const clamp01 = (n: number) => Math.max(0, Math.min(1, n));
const isoDay = (d: Date) => d.toISOString().slice(0, 10);

/** Every component of the score, kept so a reason can be written from real numbers. */
interface Scored {
  node: CoverageNode;
  score: number;
  coverageNeed: number;
  weakness: number;
  recencyNeed: number;
  urgency: number;
  continuity: number;
  daysSinceSeen: number | null;
}

/**
 * Score one node. Pure — no I/O, no clock beyond the injected `now`, so it is trivially testable.
 *
 * Exam urgency AMPLIFIES coverage and weakness rather than being a flat bonus on everything. A
 * flat term would raise every node equally and change no ordering at all; worse, an urgency term
 * strong enough to matter would start outranking fundamentals, which is precisely what §6 warns
 * against. Applied this way, a near exam sharpens the focus on gaps and weaknesses without ever
 * promoting a mastered topic above an untouched one.
 */
export function scoreNode(
  node: CoverageNode, now: number, daysUntilExam: number | null, siblingsWithEvidence: number,
): Scored {
  const W = PLANNER_WEIGHTS;
  const state = node.state;

  const coverageNeed = state === 'UNTOUCHED' ? 1 : state === 'LEARNING' ? 0.45 : 0;

  // No evidence means no demonstrated weakness. An untouched node is unknown, not weak.
  const weakness = node.attempts > 0 && node.masteryScore !== null ? 1 - node.masteryScore : 0;

  const daysSinceSeen = node.lastSeenAt ? (now - node.lastSeenAt) / DAY_MS : null;
  const interval = REVIEW_INTERVAL_DAYS[state];
  const recencyNeed = daysSinceSeen !== null && interval > 0 ? clamp01(daysSinceSeen / interval) : 0;

  /*
   * Urgency ramps over the last 90 days and is 0 beyond that. Without an exam date it stays 0 —
   * a stable default planning mode, rather than an invented deadline driving recommendations.
   */
  const urgency = daysUntilExam === null ? 0 : clamp01((90 - daysUntilExam) / 90);

  // Small nudge toward a subject already underway; scattered study is harder to sustain.
  const continuity = siblingsWithEvidence > 0 ? clamp01(siblingsWithEvidence / 5) : 0;

  const base =
    W.COVERAGE * coverageNeed +
    W.WEAKNESS * weakness +
    W.RECENCY * recencyNeed +
    W.CONTINUITY * continuity;

  // Amplifies the two signals urgency should sharpen; never applied to mastered material.
  const urgencyLift = W.URGENCY * urgency * (coverageNeed + weakness);

  return {
    node, score: base + urgencyLift,
    coverageNeed, weakness, recencyNeed, urgency, continuity, daysSinceSeen,
  };
}

/** Explain the score in the student's terms, from the numbers that produced it. */
function reasonsFor(s: Scored, daysUntilExam: number | null): string[] {
  const out: string[] = [];
  const n = s.node;

  if (n.state === 'UNTOUCHED') out.push('Not started yet');
  if (n.state === 'WEAK') {
    out.push(`Weak after ${n.attempts} attempt${n.attempts === 1 ? '' : 's'} — ${Math.round((n.accuracy ?? 0) * 100)}% accurate`);
  }
  if (n.state === 'LEARNING' && n.attempts > 0) out.push(`Only ${n.attempts} attempt${n.attempts === 1 ? '' : 's'} so far`);
  if (s.daysSinceSeen !== null && s.recencyNeed >= 1) {
    out.push(`Not practised in ${Math.floor(s.daysSinceSeen)} days`);
  }
  if (n.state === 'MASTERED' && s.recencyNeed >= 1) out.push('Due for a maintenance review');
  if (daysUntilExam !== null && daysUntilExam <= 60 && (s.coverageNeed > 0 || s.weakness > 0.5)) {
    out.push(`Exam in ${daysUntilExam} days`);
  }
  if (s.continuity > 0) out.push('Continues a subject you have already started');
  return out.length ? out : ['Keeps your coverage moving'];
}

/**
 * Build today's plan.
 *
 * One coverage call — which is itself two Firestore reads — regardless of syllabus size. Nothing
 * here reads per node.
 */
export async function generateDailyPlan(inputs: PlannerInputs): Promise<DailyPlan> {
  const started = Date.now();
  const today = inputs.today ?? new Date();
  const now = today.getTime();

  const daysUntilExam = inputs.examDate
    ? Math.max(0, Math.ceil((new Date(inputs.examDate).getTime() - now) / DAY_MS))
    : null;

  const load = inputs.loadCoverage ?? getSyllabusCoverage;
  const coverage = await load(inputs.userId, inputs.examId);

  /*
   * Only addressable leaves are schedulable. A container like "Physics" is navigation, not
   * something a student can sit down and do — "Study Physics" is not a task, it is a shrug.
   */
  const leaves: CoverageNode[] = [];
  const evidenceByParent = new Map<string, number>();
  const walk = (ns: CoverageNode[]) => ns.forEach((n) => {
    if (n.isLeaf) leaves.push(n);
    if (n.attempts > 0 && n.parentId) evidenceByParent.set(n.parentId, (evidenceByParent.get(n.parentId) ?? 0) + 1);
    walk(n.children);
  });
  walk(coverage.subjects);

  const scored = leaves
    .map((n) => scoreNode(n, now, daysUntilExam, evidenceByParent.get(n.parentId ?? '') ?? 0))
    .filter((s) => {
      // A node seen recently enough is not due; scheduling it again is busywork.
      if (s.node.state === 'UNTOUCHED') return true;
      return s.recencyNeed > 0.25 || s.node.state === 'WEAK';
    })
    .sort((a, b) => b.score - a.score || a.node.label.localeCompare(b.node.label));

  // ── fill the budget, never exceed it ──────────────────────────────────────────────────
  const tasks: PlanTask[] = [];
  let used = 0;
  const dateStr = isoDay(today);

  for (const s of scored) {
    const ladder = ACTIVITIES_FOR[s.node.state];
    for (const activity of ladder) {
      const mins = ACTIVITY_MINUTES[activity];
      if (used + mins > inputs.dailyMinutes) continue;   // try a shorter activity rather than stopping
      used += mins;
      tasks.push({
        id: `${inputs.userId}:${dateStr}:${s.node.nodeId}:${activity}`,
        syllabusNodeId: s.node.nodeId,
        label: s.node.label,
        activity,
        estimatedMinutes: mins,
        priority: s.score >= 0.5 ? 'high' : s.score >= 0.25 ? 'medium' : 'low',
        reasons: reasonsFor(s, daysUntilExam),
        score: Number(s.score.toFixed(4)),
        state: s.node.state,
      });
    }
    if (used >= inputs.dailyMinutes) break;
  }

  const outlook = estimateRemaining(coverage.totals, inputs.dailyMinutes, daysUntilExam);

  logger.info('[Planner] generated', {
    userId: inputs.userId, examId: coverage.examId, tasks: tasks.length,
    plannedMinutes: used, budget: inputs.dailyMinutes, leaves: leaves.length, ms: Date.now() - started,
  });

  return {
    date: dateStr,
    examId: coverage.examId,
    examDate: inputs.examDate ?? null,
    daysUntilExam,
    plannedMinutes: used,
    budgetMinutes: inputs.dailyMinutes,
    tasks,
    outlook,
    generatedAt: now,
  };
}

/**
 * Honest arithmetic about what is left.
 *
 * Never promises a finish date it cannot support. When the remaining syllabus does not fit the
 * time available, it says so plainly and the planner keeps prioritising — telling a student they
 * will finish 800 topics in 20 days at an hour a day is not encouragement, it is a lie they will
 * discover the week before the exam.
 */
export function estimateRemaining(
  totals: { addressable: number; untouched: number; weak: number },
  dailyMinutes: number,
  daysUntilExam: number | null,
): DailyPlan['outlook'] {
  const firstPassMinutes = ACTIVITY_MINUTES.LEARN + ACTIVITY_MINUTES.PRACTICE;
  if (!dailyMinutes || dailyMinutes <= 0) {
    return {
      addressable: totals.addressable, untouched: totals.untouched, weak: totals.weak,
      estimatedDaysToCover: null, achievableBeforeExam: null,
      note: 'No daily study time set, so no estimate can be made.',
    };
  }

  const perDay = Math.max(1, Math.floor(dailyMinutes / firstPassMinutes));
  const estimatedDaysToCover = Math.ceil(totals.untouched / perDay);
  const achievableBeforeExam = daysUntilExam === null ? null : estimatedDaysToCover <= daysUntilExam;

  let note: string | undefined;
  if (achievableBeforeExam === false) {
    const canCover = perDay * (daysUntilExam ?? 0);
    note = `At ${dailyMinutes} minutes a day you can reach about ${canCover} of the ${totals.untouched} `
         + `topics you have not started before the exam. The plan prioritises the highest-need ones.`;
  }

  return {
    addressable: totals.addressable, untouched: totals.untouched, weak: totals.weak,
    estimatedDaysToCover, achievableBeforeExam, note,
  };
}
