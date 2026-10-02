/**
 * Selective student context for agents (Phase 7, brief §22–23).
 *
 * The chat path's StudentContextService loads everything about a student for every turn. An agent
 * asks for SLICES — only what the step in hand needs — and a model is given a short summary of
 * those slices, never the raw record. Three layers, as the brief puts them:
 *   - learning memory: profile, saved goal, performance, activity   (read here, per slice)
 *   - task memory:     what earlier agent runs produced              (the `plans` slice + run state)
 *   - session memory:  the conversation                              (not read by agents)
 *
 * Every read is a pure read. (UserStatsService.getUserStats seeds a stats document for a new user,
 * so the stats slice reads the document directly instead.) A slice that fails is null — unknown —
 * never a zero that would be a claim about the student.
 */

const profiles = () => require('../../services/userProfile.service').userProfileService;
const plannerRepo = () => new (require('../../repositories/planner.repository').PlannerRepository)();
const quizAttempts = () => require('../../services/tests/quizAttempts.service').quizAttemptsService;
const testsRepo = () => require('../../repositories/tests.repository').testsRepository;
const artifacts = () => require('../artifacts/artifacts.service').getArtifactsService();
const firestore = () => require('../../config/firebase').db;

export const CONTEXT_SLICES = ['profile', 'goal', 'history', 'weakTopics', 'plans'] as const;
export type ContextSlice = (typeof CONTEXT_SLICES)[number];

export interface StudentContextSlices {
  /** From onboarding: what the student said about themselves. */
  profile?: {
    targetExam?: string;
    targetYear?: string;
    dailyStudyHours?: number;
    preparationLevel?: string;
    selfReportedWeakAreas: string[];
  } | null;
  /** The study goal they saved in the planner (exam, date, hours a week). */
  goal?: { targetExam?: string; examDate?: string; weeklyHours?: number; subjects: string[] } | null;
  /** How much they have practised in Sadhya — counts only, no content. */
  history?: { quizzes: number; tests: number; questionsAnswered: number; averageAccuracy: number | null; lastAt?: string } | null;
  /** Weak topics the grader has recorded, per exam: topic, accuracy, how sure. */
  weakTopics?: Array<{ topic: string; examId?: string; accuracy: number; confidence: number; syllabusNodeId?: string }> | null;
  /** Task memory: the study plans Sadhya made for them before. */
  plans?: Array<{ artifactId: string; title: string; createdAt: number; examId?: string; horizonDays?: number }> | null;
}

const safe = async <T>(f: () => Promise<T>): Promise<T | null> => {
  try {
    return await f();
  } catch {
    return null;
  }
};

const strings = (v: unknown): string[] => (Array.isArray(v) ? v.map(String).filter(Boolean).slice(0, 20) : []);

export async function loadStudentContext(userId: string, slices: readonly ContextSlice[]): Promise<StudentContextSlices> {
  const want = new Set(slices);
  const out: StudentContextSlices = {};
  const jobs: Array<Promise<void>> = [];

  if (want.has('profile')) {
    jobs.push(
      safe(async () => profiles().getProfile(userId)).then((p: any) => {
        out.profile = p
          ? {
              ...(p.targetExam ? { targetExam: String(p.targetExam) } : {}),
              ...(p.targetYear ? { targetYear: String(p.targetYear) } : {}),
              ...(Number(p.dailyStudyHours) > 0 ? { dailyStudyHours: Number(p.dailyStudyHours) } : {}),
              ...(p.preparationLevel ? { preparationLevel: String(p.preparationLevel) } : {}),
              selfReportedWeakAreas: strings(p.weakAreas),
            }
          : null;
      }),
    );
  }

  if (want.has('goal')) {
    jobs.push(
      safe(async () => plannerRepo().getGoalByUserId(userId)).then((g: any) => {
        out.goal = g
          ? {
              ...(g.targetExam ? { targetExam: String(g.targetExam) } : {}),
              ...(g.examDate ? { examDate: String(g.examDate).slice(0, 10) } : {}),
              ...(Number(g.weeklyHours) > 0 ? { weeklyHours: Number(g.weeklyHours) } : {}),
              subjects: strings(g.subjects),
            }
          : null;
      }),
    );
  }

  if (want.has('history')) {
    jobs.push(
      safe(async () => {
        const quizzes: any[] = ((await quizAttempts().listAttempts(userId)) as any[]).filter((s) => s.status === 'completed');
        // Test-series attempts need a composite index; without it they are left out, not fatal.
        const tests: any[] = await testsRepo().getRecentAttempts(userId).catch(() => []);
        const answered = quizzes.reduce((n, s) => n + Number(s.totalQuestions ?? 0), 0);
        const accuracies = quizzes.map((s) => Number(s.accuracy)).filter((a) => Number.isFinite(a));
        const dates = [...quizzes.map((s) => String(s.completedAt ?? s.createdAt ?? '')), ...tests.map((t) => String(t.completedAt ?? t.startedAt ?? ''))].filter(Boolean).sort();
        return {
          quizzes: quizzes.length,
          tests: tests.length,
          questionsAnswered: answered,
          averageAccuracy: accuracies.length ? Math.round(accuracies.reduce((a, b) => a + b, 0) / accuracies.length) : null,
          ...(dates.length ? { lastAt: dates[dates.length - 1] } : {}),
        };
      }).then((h) => {
        out.history = h;
      }),
    );
  }

  if (want.has('weakTopics')) {
    jobs.push(
      safe(async () => {
        const doc = await firestore().collection('user_stats').doc(userId).get();
        const details: any[] = doc.exists && Array.isArray(doc.data()?.weakTopicDetails) ? doc.data().weakTopicDetails : [];
        // The grader's roll-up stores the name as `topicName` (quizAttempts.service WeakTopic).
        return details
          .filter((d) => (d?.topicName || d?.topic) && Number.isFinite(Number(d.accuracy)))
          .map((d) => ({
            topic: String(d.topicName ?? d.topic).slice(0, 200),
            ...(d.examId ? { examId: String(d.examId) } : {}),
            accuracy: Math.round(Number(d.accuracy)),
            confidence: Math.max(0, Math.min(1, Number(d.confidence ?? 0))),
            ...(d.syllabusNodeId ? { syllabusNodeId: String(d.syllabusNodeId) } : {}),
          }))
          .slice(0, 40);
      }).then((w) => {
        out.weakTopics = w;
      }),
    );
  }

  if (want.has('plans')) {
    jobs.push(
      safe(async () => {
        const mine: any[] = await artifacts().listForUser(userId, 30);
        return mine
          .filter((a) => a.kind === 'studyplan' && a.status === 'ready')
          .slice(0, 5)
          .map((a) => ({
            artifactId: a.artifactId,
            title: String(a.title),
            createdAt: Number(a.createdAt ?? 0),
            ...(a.spec?.exam?.examId ? { examId: a.spec.exam.examId } : {}),
            ...(a.spec?.horizon?.days ? { horizonDays: a.spec.horizon.days } : {}),
          }));
      }).then((p) => {
        out.plans = p;
      }),
    );
  }

  await Promise.all(jobs);
  return out;
}

/**
 * The few lines a model is shown about the student — never the record itself. Only what bears on
 * planning: the stated target and time, how much evidence exists, and the weakest topics.
 */
export function summarizeForModel(c: StudentContextSlices): string[] {
  const lines: string[] = [];
  if (c.profile?.targetExam) lines.push(`Onboarding target exam: ${c.profile.targetExam}${c.profile.targetYear ? ` (${c.profile.targetYear})` : ''}.`);
  if (c.profile?.dailyStudyHours) lines.push(`Said they can study ${c.profile.dailyStudyHours} hours a day.`);
  if (c.goal?.targetExam || c.goal?.examDate) lines.push(`Saved goal: ${c.goal.targetExam ?? 'no exam'}${c.goal.examDate ? `, exam date ${c.goal.examDate}` : ''}${c.goal.weeklyHours ? `, ${c.goal.weeklyHours} hours a week` : ''}.`);
  if (c.history) lines.push(`Practice in Sadhya: ${c.history.quizzes} quizzes, ${c.history.tests} tests${c.history.averageAccuracy !== null ? `, ${c.history.averageAccuracy}% average` : ''}.`);
  else if (c.history === null) lines.push('Practice history: unavailable.');
  const weak = (c.weakTopics ?? []).filter((w) => w.confidence >= 0.5).slice(0, 5);
  if (weak.length) lines.push(`Weakest topics: ${weak.map((w) => `${w.topic} (${w.accuracy}%)`).join(', ')}.`);
  if (c.plans?.length) lines.push(`Earlier study plans: ${c.plans.length} (latest: "${c.plans[0].title}").`);
  return lines.length ? lines : ['Nothing is known about the student yet.'];
}
