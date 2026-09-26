import { CheckCircle2, Target, ListChecks, Flame } from 'lucide-react';
import { cn } from '../../lib/utils';
import { useProgressReport } from '../../hooks/api/useQuizAttempts';
import { useUserStats } from '../../hooks/api/useUserStats';

function Kpi({ icon, label, value, hint, accent }: { icon: React.ReactNode; label: string; value: string; hint?: string; accent: string }) {
  return (
    <div className="flex items-center gap-3 px-4 py-3 min-w-0 bg-white dark:bg-[#18181b]">
      <div className={cn('w-8 h-8 rounded-lg flex items-center justify-center shrink-0', accent)}>{icon}</div>
      <div className="min-w-0">
        <div className="text-[11px] font-medium text-slate-500 dark:text-slate-400 truncate">{label}</div>
        <div className="flex items-baseline gap-1.5">
          <span className="text-[17px] font-semibold text-slate-900 dark:text-white leading-tight tabular-nums">{value}</span>
          {hint && <span className="text-[11px] text-slate-400 dark:text-slate-500 truncate">{hint}</span>}
        </div>
      </div>
    </div>
  );
}

/** One-row KPI summary across the top of the Test Center, divided like a real app's metric bar. */
export function TestStatStrip() {
  const { report, isLoading } = useProgressReport();
  const { stats } = useUserStats();

  if (isLoading) {
    return <div className="h-[62px] rounded-xl border border-slate-200/80 dark:border-white/[0.07] bg-white dark:bg-white/[0.03] animate-pulse" />;
  }

  const totalTests = report?.totalTests ?? 0;
  const avgAccuracy = Math.round(report?.averageAccuracy ?? 0);
  const bestAccuracy = Math.round(report?.bestAccuracy ?? 0);
  const questions = report?.totalQuestionsAnswered ?? 0;
  const streak = stats?.gamification?.studyStreakDays ?? 0;

  return (
    // gap-px over a tinted background draws the dividers — correct in both the 2- and 4-column
    // layouts, unlike divide-x/divide-y which misplace borders once the grid wraps.
    <div className="grid grid-cols-2 xl:grid-cols-4 gap-px rounded-xl border border-slate-200/80 dark:border-white/[0.07] bg-slate-100 dark:bg-white/[0.06] overflow-hidden">
      <Kpi label="Tests completed" value={String(totalTests)} accent="bg-emerald-500/10" icon={<CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />} />
      <Kpi label="Avg. accuracy" value={`${avgAccuracy}%`} hint={bestAccuracy ? `best ${bestAccuracy}%` : undefined} accent="bg-[#c8e558]/15" icon={<Target className="w-4 h-4 text-[#8ba32b] dark:text-[#c8e558]" />} />
      <Kpi label="Questions solved" value={questions.toLocaleString()} accent="bg-sky-500/10" icon={<ListChecks className="w-4 h-4 text-sky-600 dark:text-sky-400" />} />
      <Kpi label="Day streak" value={String(streak)} hint={streak === 1 ? 'day' : 'days'} accent="bg-orange-500/10" icon={<Flame className="w-4 h-4 text-orange-600 dark:text-orange-400" />} />
    </div>
  );
}
