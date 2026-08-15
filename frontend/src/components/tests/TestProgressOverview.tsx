import { motion } from 'motion/react';
import { Target, TrendingUp, CheckCircle2, Flame, ListChecks, Clock } from 'lucide-react';
import { cn } from '../../lib/utils';
import { useProgressReport } from '../../hooks/api/useQuizAttempts';
import { useUserStats } from '../../hooks/api/useUserStats';
import type { ProgressTrendPoint } from '../../lib/api/quiz';

function StatCard({ icon, label, value, accent, delay }: { icon: React.ReactNode; label: string; value: string; accent: string; delay: number }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay }}
      className="p-4 rounded-2xl border bg-white border-slate-200/90 dark:bg-white/[0.04] dark:border-white/[0.07] shadow-xs"
    >
      <div className={cn('w-8 h-8 rounded-xl flex items-center justify-center mb-2.5', accent)}>{icon}</div>
      <div className="text-[20px] font-semibold text-slate-900 dark:text-white leading-none">{value}</div>
      <div className="text-[12px] font-medium text-slate-500 dark:text-slate-400 mt-1.5">{label}</div>
    </motion.div>
  );
}

/** Compact accuracy-over-time area sparkline, hand-drawn. */
function TrendSparkline({ trend }: { trend: ProgressTrendPoint[] }) {
  if (trend.length < 2) {
    return (
      <div className="h-[100px] flex items-center justify-center text-[13px] text-slate-400 dark:text-slate-500">
        Complete 2 or more tests to visualize your accuracy trajectory.
      </div>
    );
  }
  const W = 600;
  const H = 100;
  const pad = 8;
  const pts = trend.map((t, i) => {
    const x = pad + (i / (trend.length - 1)) * (W - pad * 2);
    const y = H - pad - (Math.max(0, Math.min(100, t.accuracy)) / 100) * (H - pad * 2);
    return { x, y, t };
  });
  const line = pts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ');
  const area = `${line} L ${pts[pts.length - 1].x.toFixed(1)} ${H - pad} L ${pts[0].x.toFixed(1)} ${H - pad} Z`;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-[100px]" preserveAspectRatio="none">
      <defs>
        <linearGradient id="accTrendLime" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#c8e558" stopOpacity="0.4" />
          <stop offset="100%" stopColor="#c8e558" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={area} fill="url(#accTrendLime)" />
      <path d={line} fill="none" stroke="#8ba32b" className="dark:stroke-[#c8e558]" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
      {pts.map((p, i) => (
        <circle key={i} cx={p.x} cy={p.y} r={3} className="fill-slate-900 dark:fill-[#c8e558]" />
      ))}
    </svg>
  );
}

export function TestProgressOverview() {
  const { report, isLoading } = useProgressReport();
  const { stats } = useUserStats();

  const totalTests = report?.totalTests ?? 0;
  const avgAccuracy = Math.round(report?.averageAccuracy ?? 0);
  const bestAccuracy = Math.round(report?.bestAccuracy ?? 0);
  const questionsAnswered = report?.totalQuestionsAnswered ?? 0;
  const streak = stats?.gamification?.studyStreakDays ?? 0;
  const minutesSpent = Math.round((report?.totalTimeSpentSeconds ?? 0) / 60);

  if (isLoading) {
    return (
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="h-[96px] rounded-2xl border border-slate-200/80 dark:border-white/10 bg-slate-100/60 dark:bg-white/5 animate-pulse" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-4 font-sans">
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <StatCard delay={0.02} label="Tests Completed" value={String(totalTests)} icon={<CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />} accent="bg-emerald-500/10" />
        <StatCard delay={0.06} label="Average Accuracy" value={`${avgAccuracy}%`} icon={<Target className="w-4 h-4 text-[#8ba32b] dark:text-[#c8e558]" />} accent="bg-[#c8e558]/15" />
        <StatCard delay={0.1} label="Best Score" value={`${bestAccuracy}%`} icon={<TrendingUp className="w-4 h-4 text-sky-600 dark:text-sky-400" />} accent="bg-sky-500/10" />
        <StatCard delay={0.14} label="Questions Solved" value={String(questionsAnswered)} icon={<ListChecks className="w-4 h-4 text-amber-600 dark:text-amber-400" />} accent="bg-amber-500/10" />
        <StatCard delay={0.18} label="Day Streak" value={String(streak)} icon={<Flame className="w-4 h-4 text-orange-600 dark:text-orange-400" />} accent="bg-orange-500/10" />
        <StatCard delay={0.22} label="Practice Time" value={`${minutesSpent}m`} icon={<Clock className="w-4 h-4 text-slate-600 dark:text-slate-300" />} accent="bg-slate-500/10" />
      </div>

      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, delay: 0.24 }}
        className="p-5 rounded-2xl border bg-white border-slate-200/90 dark:bg-white/[0.04] dark:border-white/[0.07] shadow-xs"
      >
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-[14.5px] font-semibold text-slate-900 dark:text-white">Accuracy Trajectory</h3>
          <span className="text-[11.5px] font-medium text-slate-400 dark:text-slate-500">last {report?.trend.length ?? 0} tests</span>
        </div>
        <TrendSparkline trend={report?.trend ?? []} />
      </motion.div>
    </div>
  );
}
