import type { ReactNode } from 'react';
import { motion } from 'motion/react';
import { cn } from '../../lib/utils';
import { fadeInUp } from './motion';

interface PanelProps {
  title?: ReactNode;
  subtitle?: ReactNode;
  icon?: ReactNode;
  actions?: ReactNode;
  /** Optional footer line (e.g. a mini-insight under a chart). */
  footer?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
  /** Removes body padding (useful for tables). */
  flush?: boolean;
  animate?: boolean;
}

/**
 * Rounded, bordered surface used for charts, tables and grouped content.
 * Matches the student app card language with a subtle executive lift.
 */
export function Panel({
  title,
  subtitle,
  icon,
  actions,
  footer,
  children,
  className,
  bodyClassName,
  flush = false,
  animate = true,
}: PanelProps) {
  const hasHeader = title || subtitle || actions || icon;
  const Wrapper: any = animate ? motion.div : 'div';
  const motionProps = animate ? { variants: fadeInUp, initial: 'hidden', animate: 'show' } : {};

  return (
    <Wrapper
      {...motionProps}
      className={cn(
        'rounded-2xl border border-slate-200 dark:border-white/5 bg-white dark:bg-[#1a1a1a] shadow-sm overflow-hidden flex flex-col',
        className
      )}
    >
      {hasHeader && (
        <div className="flex items-center justify-between gap-3 px-5 py-4 border-b border-slate-100 dark:border-white/5">
          <div className="flex items-center gap-3 min-w-0">
            {icon && <div className="text-slate-500 dark:text-gray-400 shrink-0">{icon}</div>}
            <div className="min-w-0">
              {title && <h3 className="text-[15px] font-semibold text-slate-900 dark:text-white truncate">{title}</h3>}
              {subtitle && <p className="text-xs text-slate-500 dark:text-gray-400 mt-0.5 truncate">{subtitle}</p>}
            </div>
          </div>
          {actions && <div className="flex items-center gap-2 shrink-0">{actions}</div>}
        </div>
      )}
      <div className={cn('flex-1 min-h-0', !flush && 'p-5', bodyClassName)}>{children}</div>
      {footer && (
        <div className="px-5 py-3 border-t border-slate-100 dark:border-white/5 text-xs text-slate-500 dark:text-gray-400">
          {footer}
        </div>
      )}
    </Wrapper>
  );
}
