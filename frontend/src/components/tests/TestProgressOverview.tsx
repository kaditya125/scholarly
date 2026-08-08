import { motion } from 'motion/react';
import { Target, TrendingUp, CheckCircle2, Flame, ListChecks, Clock } from 'lucide-react';
import { cn } from '../../lib/utils';
import { useProgressReport } from '../../hooks/api/useQuizAttempts';
import { useUserStats } from '../../hooks/api/useUserStats';
import type { ProgressTrendPoint } from '../../lib/api/quiz';

function StatCard({ icon, label, value, accent, delay }: { icon: React.ReactNode; label: string; value: string; accent: string; delay: number }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, delay }}
      className="p-5 rounded-2xl border bg-white border-slate-200 dark:bg-[#1e1e1f] dark:border-white/10 shadow-[0_4px_20px_rgb(0,0,0,0.03)]"
    >
      <div className={cn('w-9 h-9 rounded-xl flex items-center justify-center mb-3', accent)}>{icon}</div>
      <div className="text-2xl font-bold text-slate-900 dark:text-white leading-none">{value}</div>
      <div className="text-[12px] font-medium text-slate-500 dark:text-gray-400 mt-1.5">{label}</div>
    </motion.div>
  );
}

/** Compact accuracy-over-time area sparkline, hand-drawn (no chart dependency). */
function TrendSparkline({ trend }: { trend: ProgressTrendPoint[] }) {
  if (trend.length < 2) {
    return (
      <div className="h-[120px] flex items-center justify-center text-[13px] text-slate-400 dark:text-gray-500">
        Complete a few tests to see your accuracy trend.
      </div>
    );
  }
  const W = 600;
  const H = 120;
  const pad = 6;
  const pts = trend.map((t, i) => {
    const x = pad + (i / (trend.length - 1)) * (W - pad * 2);
    const y = H - pad - (Math.max(0, Math.min(100, t.accuracy)) / 100) * (H - pad * 2);
    return { x, y, t };
  });
  const line = pts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ');
  const area = `${line} L ${pts[pts.length - 1].x.toFixed(1)} ${H - pad} L ${pts[0].x.toFixed(1)} ${H - pad} Z`;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-[120px]" preserveAspectRatio="none">
      <defs>
        <linearGradient id="accTrend" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="rgb(99,102,241)" stopOpacity="0.35" />
          <stop offset="100%" stopColor="rgb(99,102,241)" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={area} fill="url(#accTrend)" />
      <path d={line} fill="none" stroke="rgb(99,102,241)" strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round" />
      {pts.map((p, i) => (
        <circle key={i} cx={p.x} cy={p.y} r={3} className="fill-indigo-500" />
      ))}
    </svg>
  );
}

export function TestProgressOverview() {
  const { report, isLoading } = useProgressReport();
  const { stats } = useUserStats();

  const totalTests = report?.totalTests ?? 0;
  const avgAccuracy = report?.averageAccuracy ?? 0;
  const bestAccuracy = report?.bestAccuracy ?? 0;
  const questionsAnswered = report?.totalQuestionsAnswered ?? 0;
  const streak = stats?.gamification?.studyStreakDays ?? 0;
  const minutesSpent = Math.round((report?.totalTimeSpentSeconds ?? 0) / 60);

  if (isLoading) {
    return (
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="h-[104px] rounded-2xl border border-slate-200 dark:border-white/10 bg-slate-100/60 dark:bg-white/5 animate-pulse" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        <StatCard delay={0.02} label="Tests completed" value={String(totalTests)} icon={<CheckCircle2 className="w-5 h-5 text-green-600 dark:text-green-400" />} accent="bg-green-100 dark:bg-green-900/30" />
        <StatCard delay={0.06} label="Average accuracy" value={`${avgAccuracy}%`} icon={<Target className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />} accent="bg-indigo-100 dark:bg-indigo-900/30" />
        <StatCard delay={0.1} label="Best accuracy" value={`${bestAccuracy}%`} icon={<TrendingUp className="w-5 h-5 text-teal-600 dark:text-teal-400" />} accent="bg-teal-100 dark:bg-teal-900/30" />
        <StatCard delay={0.14} label="Questions answered" value={String(questionsAnswered)} icon={<ListChecks className="w-5 h-5 text-amber-600 dark:text-amber-400" />} accent="bg-amber-100 dark:bg-amber-900/30" />
        <StatCard delay={0.18} label="Day streak" value={String(streak)} icon={<Flame className="w-5 h-5 text-orange-600 dark:text-orange-400" />} accent="bg-orange-100 dark:bg-orange-900/30" />
        <StatCard delay={0.22} label="Minutes practised" value={String(minutesSpent)} icon={<Clock className="w-5 h-5 text-sky-600 dark:text-sky-400" />} accent="bg-sky-100 dark:bg-sky-900/30" />
      </div>

      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, delay: 0.24 }}
        className="p-6 rounded-[24px] border bg-white border-slate-200 dark:bg-[#1e1e1f] dark:border-white/10 shadow-[0_4px_20px_rgb(0,0,0,0.03)]"
      >
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-[15px] font-bold text-slate-900 dark:text-white">Accuracy trend</h3>
          <span className="text-[12px] font-medium text-slate-400 dark:text-gray-500">last {report?.trend.length ?? 0} tests</span>
        </div>
        <TrendSparkline trend={report?.trend ?? []} />
      </motion.div>
    </div>
  );
}
