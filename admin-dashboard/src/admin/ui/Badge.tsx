import type { ReactNode } from 'react';
import { cn } from '../../lib/utils';

export type BadgeTone = 'neutral' | 'success' | 'warning' | 'danger' | 'info' | 'accent';

const TONES: Record<BadgeTone, string> = {
  neutral: 'bg-slate-100 text-slate-700 dark:bg-white/10 dark:text-gray-300',
  success: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400',
  warning: 'bg-amber-100 text-amber-700 dark:bg-amber-500/10 dark:text-amber-400',
  danger: 'bg-rose-100 text-rose-700 dark:bg-rose-500/10 dark:text-rose-400',
  info: 'bg-sky-100 text-sky-700 dark:bg-sky-500/10 dark:text-sky-400',
  accent: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-500/10 dark:text-indigo-400',
};

interface BadgeProps {
  children: ReactNode;
  tone?: BadgeTone;
  dot?: boolean;
  className?: string;
}

export function Badge({ children, tone = 'neutral', dot = false, className }: BadgeProps) {
  return (
    <span className={cn('inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium', TONES[tone], className)}>
      {dot && <span className="w-1.5 h-1.5 rounded-full bg-current opacity-80" />}
      {children}
    </span>
  );
}

/** Maps common status strings to a badge tone. */
export function statusTone(status: string): BadgeTone {
  const s = (status || '').toLowerCase();
  if (['operational', 'healthy', 'active', 'ready', 'published', 'strong', 'resolved', 'enabled', 'completed'].includes(s)) return 'success';
  if (['degraded', 'warning', 'pending', 'processing', 'developing', 'investigating', 'testing'].includes(s)) return 'warning';
  if (['critical', 'failed', 'suspended', 'weak', 'error', 'disabled'].includes(s)) return 'danger';
  if (['not_configured', 'unknown', 'archived'].includes(s)) return 'neutral';
  return 'info';
}
