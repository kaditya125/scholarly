import type { LucideIcon } from 'lucide-react';
import { ArrowDownRight, ArrowUpRight } from 'lucide-react';
import { motion } from 'motion/react';
import { cn } from '../../lib/utils';
import { AnimatedNumber } from './AnimatedNumber';
import { Sparkline } from './Sparkline';
import { SkeletonMetric } from './Skeleton';
import { cardItem } from './motion';
import { Badge, type BadgeTone } from './Badge';

export type Accent = 'indigo' | 'blue' | 'emerald' | 'sky' | 'fuchsia' | 'amber' | 'rose' | 'violet' | 'teal' | 'slate';

const ACCENTS: Record<Accent, { icon: string; spark: string }> = {
  indigo: { icon: 'bg-indigo-500/10 text-indigo-600 dark:text-indigo-400', spark: '#6366f1' },
  blue: { icon: 'bg-blue-500/10 text-blue-600 dark:text-blue-400', spark: '#3b82f6' },
  emerald: { icon: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400', spark: '#10b981' },
  sky: { icon: 'bg-sky-500/10 text-sky-600 dark:text-sky-400', spark: '#0ea5e9' },
  fuchsia: { icon: 'bg-fuchsia-500/10 text-fuchsia-600 dark:text-fuchsia-400', spark: '#d946ef' },
  amber: { icon: 'bg-amber-500/10 text-amber-600 dark:text-amber-400', spark: '#f59e0b' },
  rose: { icon: 'bg-rose-500/10 text-rose-600 dark:text-rose-400', spark: '#f43f5e' },
  violet: { icon: 'bg-violet-500/10 text-violet-600 dark:text-violet-400', spark: '#8b5cf6' },
  teal: { icon: 'bg-teal-500/10 text-teal-600 dark:text-teal-400', spark: '#14b8a6' },
  slate: { icon: 'bg-slate-500/10 text-slate-600 dark:text-slate-300', spark: '#64748b' },
};

interface MetricCardProps {
  label: string;
  /** Numbers animate (count-up); strings render as-is (e.g. "Healthy"). */
  value: number | string;
  icon: LucideIcon;
  accent?: Accent;
  decimals?: number;
  prefix?: string;
  suffix?: string;
  trend?: { value: number; label?: string };
  sparkline?: number[];
  status?: { label: string; tone: BadgeTone };
  loading?: boolean;
  className?: string;
}

export function MetricCard({
  label,
  value,
  icon: Icon,
  accent = 'indigo',
  decimals = 0,
  prefix = '',
  suffix = '',
  trend,
  sparkline,
  status,
  loading = false,
  className,
}: MetricCardProps) {
  if (loading) return <SkeletonMetric />;

  const a = ACCENTS[accent];
  const trendUp = trend ? trend.value >= 0 : false;

  return (
    <motion.div
      variants={cardItem}
      whileHover={{ y: -3 }}
      className={cn(
        'gradient-ring group relative rounded-2xl border border-slate-200 dark:border-white/5 bg-white dark:bg-[#1a1a1a] p-5 shadow-sm hover:shadow-md transition-shadow',
        className
      )}
    >
      <div className="flex items-start justify-between mb-4">
        <div className={cn('w-11 h-11 rounded-xl flex items-center justify-center', a.icon)}>
          <Icon className="w-[22px] h-[22px]" />
        </div>
        {trend && (
          <span
            className={cn(
              'inline-flex items-center gap-0.5 text-xs font-semibold px-2 py-0.5 rounded-full',
              trendUp
                ? 'text-emerald-700 bg-emerald-100 dark:text-emerald-400 dark:bg-emerald-500/10'
                : 'text-rose-700 bg-rose-100 dark:text-rose-400 dark:bg-rose-500/10'
            )}
          >
            {trendUp ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
            {Math.abs(trend.value)}%
          </span>
        )}
        {!trend && status && <Badge tone={status.tone}>{status.label}</Badge>}
      </div>

      <div className="text-sm font-medium text-slate-500 dark:text-gray-400">{label}</div>
      <div className="text-3xl font-bold text-slate-900 dark:text-white mt-1 tracking-tight">
        {typeof value === 'number' ? (
          <AnimatedNumber value={value} decimals={decimals} prefix={prefix} suffix={suffix} />
        ) : (
          <>{prefix}{value}{suffix}</>
        )}
      </div>

      {trend?.label && <div className="text-xs text-slate-400 mt-1">{trend.label}</div>}

      {sparkline && sparkline.length > 1 && (
        <div className="mt-3 -mx-1">
          <Sparkline data={sparkline} color={a.spark} height={40} />
        </div>
      )}
    </motion.div>
  );
}
