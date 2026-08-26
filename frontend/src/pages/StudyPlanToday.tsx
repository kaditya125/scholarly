import { useNavigate } from 'react-router-dom';
import {
  BookOpen, Dumbbell, RotateCcw, ListChecks, FileText,
  Clock, Loader2, CalendarDays, Info,
} from 'lucide-react';
import { useTodayPlan } from '../hooks/api/useStudyPlan';
import type { ActivityType, PlanTask } from '../lib/api/studyPlan';

/**
 * Stage 4 — today's study plan.
 *
 * The action surface. The coverage map answers "where am I?"; this answers "what do I do now?".
 * Deliberately not another dashboard: no charts, no streaks, no hours-studied counter. Those are
 * outputs of studying, and showing them here would invite optimising for the wrong thing.
 *
 * Every task states WHY it was chosen, in words derived from the student's own record — "weak
 * after 6 attempts, 28% accurate" rather than "recommended for you". A plan a student cannot
 * interrogate is a plan they cannot trust, and one they will quietly stop following.
 */

const ACTIVITY_META: Record<ActivityType, {
  label: string; Icon: React.ComponentType<{ className?: string }>; blurb: string;
}> = {
  LEARN: { label: 'Learn', Icon: BookOpen, blurb: 'Work through the concept first' },
  PRACTICE: { label: 'Practice', Icon: Dumbbell, blurb: 'Apply it on questions' },
  REVISE: { label: 'Revise', Icon: RotateCcw, blurb: 'Go back over the concept' },
  QUIZ: { label: 'Quiz', Icon: ListChecks, blurb: 'Check where you stand' },
  TEST: { label: 'Test', Icon: FileText, blurb: 'Full-length attempt' },
};

export default function StudyPlanToday() {
  const navigate = useNavigate();
  const { data: plan, isLoading, isError, error } = useTodayPlan();

  if (isLoading) {
    return (
      <Shell>
        <div className="flex items-center justify-center gap-2 py-24 text-slate-500 dark:text-slate-400">
          <Loader2 className="w-4 h-4 animate-spin" /> Working out today&rsquo;s plan…
        </div>
      </Shell>
    );
  }

  const noExam = (error as any)?.response?.data?.error === 'no_target_exam';
  if (noExam) {
    return (
      <Shell>
        <div className="py-24 text-center">
          <h1 className="text-[24px] font-bold tracking-tight text-slate-900 dark:text-white">
            Tell us which exam you&rsquo;re preparing for
          </h1>
          <p className="mt-2 text-[15px] text-slate-600 dark:text-slate-300 max-w-md mx-auto">
            Your plan is built from that exam&rsquo;s official syllabus and your own results, so we
            need to know which one.
          </p>
          <button
            onClick={() => navigate('/onboarding')}
            className="mt-5 px-5 py-2.5 rounded-full bg-slate-900 text-white dark:bg-[#c8e558] dark:text-slate-950 text-[13.5px] font-bold"
          >
            Set my exam
          </button>
        </div>
      </Shell>
    );
  }

  if (isError || !plan) {
    return (
      <Shell>
        <div className="py-24 text-center">
          <h1 className="text-[22px] font-bold text-slate-900 dark:text-white">Couldn&rsquo;t build today&rsquo;s plan</h1>
          <p className="mt-2 text-[14.5px] text-slate-600 dark:text-slate-300">
            Your progress is safe. Try again in a moment.
          </p>
        </div>
      </Shell>
    );
  }

  const { outlook } = plan;

  return (
    <Shell>
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <p className="text-[12px] font-bold uppercase tracking-[0.14em] text-slate-400 dark:text-slate-500">
            {plan.examId.replace(/_/g, ' ')} · today
          </p>
          <h1 className="mt-1.5 text-[28px] font-bold tracking-tight text-slate-900 dark:text-white">
            {plan.tasks.length === 0 ? 'Nothing due today' : `${plan.plannedMinutes} minutes of study`}
          </h1>
        </div>
        {plan.daysUntilExam !== null && (
          <span className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-slate-500 dark:text-slate-400">
            <CalendarDays className="w-3.5 h-3.5" /> {plan.daysUntilExam} days to go
          </span>
        )}
      </div>

      {plan.tasks.length === 0 ? (
        <div className="mt-6 rounded-xl border border-slate-200 dark:border-white/10 p-6">
          <p className="text-[14.5px] text-slate-700 dark:text-slate-200">
            Everything you&rsquo;ve practised recently is still fresh, and there&rsquo;s nothing
            overdue for review. Come back tomorrow, or pick a topic yourself from your syllabus map.
          </p>
          <button
            onClick={() => navigate('/coverage')}
            className="mt-3 px-4 py-2 rounded-full border border-slate-200 dark:border-white/15 text-[13.5px] font-semibold text-slate-700 dark:text-slate-200"
          >
            Open my syllabus map
          </button>
        </div>
      ) : (
        <ol className="mt-6 space-y-2.5">
          {plan.tasks.map((task, i) => (
            <TaskRow key={task.id} task={task} index={i} examId={plan.examId} onGo={navigate} />
          ))}
        </ol>
      )}

      {/* Honest arithmetic, including when it does not fit. */}
      <section className="mt-10 rounded-xl border border-slate-200 dark:border-white/10 p-5">
        <h2 className="text-[12px] font-bold uppercase tracking-[0.14em] text-slate-400 dark:text-slate-500">
          Where this is going
        </h2>
        <dl className="mt-3 grid grid-cols-2 sm:grid-cols-4 gap-4 text-[13px]">
          <Fact label="Topics in syllabus" value={String(outlook.addressable)} />
          <Fact label="Not started" value={String(outlook.untouched)} />
          <Fact label="Needs work" value={String(outlook.weak)} />
          <Fact
            label="First pass in"
            value={outlook.estimatedDaysToCover !== null ? `~${outlook.estimatedDaysToCover} days` : '—'}
          />
        </dl>
        {outlook.note && (
          <p className="mt-4 flex items-start gap-2 text-[13px] text-amber-700 dark:text-amber-400">
            <Info className="w-3.5 h-3.5 mt-0.5 shrink-0" />
            {outlook.note}
          </p>
        )}
      </section>
    </Shell>
  );
}

/* ────────────────────────────────────────────────────────────────────────────────────────── */

const Shell: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className="min-h-full bg-white dark:bg-[#0b0b0c]">
    <div className="max-w-3xl mx-auto px-5 sm:px-8 py-10">{children}</div>
  </div>
);

const Fact: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <div>
    <dt className="text-slate-500 dark:text-slate-400">{label}</dt>
    <dd className="mt-0.5 text-[18px] font-bold tabular-nums text-slate-900 dark:text-white">{value}</dd>
  </div>
);

const TaskRow: React.FC<{
  task: PlanTask; index: number; examId: string; onGo: (to: string) => void;
}> = ({ task, index, examId, onGo }) => {
  const meta = ACTIVITY_META[task.activity];

  /*
   * Both destinations carry the canonical nodeId, never the label. The plan, the practice session
   * and the resulting attempt all address the same syllabus coordinate, which is what closes the
   * loop back into mastery.
   */
  const go = () => {
    const q = `examId=${encodeURIComponent(examId)}&nodeId=${encodeURIComponent(task.syllabusNodeId)}`;
    onGo(task.activity === 'LEARN' || task.activity === 'REVISE' ? `/chat?${q}` : `/tests?${q}`);
  };

  return (
    <li>
      <div className="rounded-xl border border-slate-200 dark:border-white/10 p-4 hover:bg-slate-50 dark:hover:bg-white/[0.03] transition-colors">
        <div className="flex items-start gap-3">
          <span className="mt-0.5 w-6 h-6 shrink-0 rounded-full bg-slate-100 dark:bg-white/10 text-[12px] font-bold tabular-nums flex items-center justify-center text-slate-600 dark:text-slate-300">
            {index + 1}
          </span>

          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <span className="inline-flex items-center gap-1.5 text-[12.5px] font-bold text-slate-900 dark:text-white">
                <meta.Icon className="w-3.5 h-3.5" aria-hidden="true" />
                {meta.label}
              </span>
              <span className="inline-flex items-center gap-1 text-[12px] text-slate-400 dark:text-slate-500">
                <Clock className="w-3 h-3" /> {task.estimatedMinutes} min
              </span>
              {task.priority === 'high' && (
                <span className="text-[11px] font-bold uppercase tracking-wide text-rose-600 dark:text-rose-400">
                  Priority
                </span>
              )}
            </div>

            <p className="mt-1 text-[15px] font-semibold text-slate-900 dark:text-white break-words">
              {task.label}
            </p>

            {/* The "why". Never hidden behind a tooltip — it is the reason to trust the plan. */}
            <ul className="mt-1.5 space-y-0.5">
              {task.reasons.map((r) => (
                <li key={r} className="text-[12.5px] text-slate-500 dark:text-slate-400">· {r}</li>
              ))}
            </ul>
          </div>

          <button
            onClick={go}
            className="shrink-0 px-3.5 py-2 rounded-full bg-slate-900 text-white dark:bg-[#c8e558] dark:text-slate-950 text-[12.5px] font-bold"
          >
            Start
          </button>
        </div>
      </div>
    </li>
  );
};
