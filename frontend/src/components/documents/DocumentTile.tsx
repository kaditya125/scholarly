import React from 'react';
import { motion } from 'motion/react';
import { LucideIcon } from 'lucide-react';
import { cn } from '../../lib/utils';

/**
 * One tile, for any kind of document.
 *
 * Replaces the gradient book covers. Those rendered five different colour ramps side by side —
 * pink, blue, purple, orange, teal — which reads as decoration rather than information: the
 * colour carried no meaning, and with the accent already spent on lime it left the page with six
 * competing hues and nothing emphasised.
 *
 * Here the only colour is the accent, used once per tile on the glyph, and everything else is
 * carried by type, spacing and a hairline border. That also makes the tile reusable: a subject
 * collection, an uploaded PDF and an exam paper are the same object with different words in it,
 * so the page can mix document types in one grid without looking assembled from parts.
 */
export interface DocumentTileProps {
  icon: LucideIcon;
  title: string;
  /** One line under the title — subject, exam, file type. */
  subtitle?: string;
  /** Small facts shown as a dotted row: "12 chapters", "4.2 MB", "2025". */
  facts?: (string | number | undefined | null)[];
  /** Right-aligned status word, e.g. "Indexed", "Processing". */
  status?: { label: string; tone: 'ready' | 'pending' | 'muted' };
  onClick?: () => void;
  index?: number;
}

const EASE = [0.16, 1, 0.3, 1] as const;

export function DocumentTile({
  icon: Icon,
  title,
  subtitle,
  facts = [],
  status,
  onClick,
  index = 0,
}: DocumentTileProps) {
  const shown = facts.filter((f) => f !== undefined && f !== null && f !== '');

  return (
    <motion.button
      type="button"
      onClick={onClick}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      // Staggered, but capped: past a dozen tiles the delay stops reading as sequence and starts
      // reading as lag.
      transition={{ duration: 0.32, delay: Math.min(index, 12) * 0.022, ease: EASE }}
      className={cn(
        'group relative w-full text-left rounded-2xl p-4',
        'bg-white dark:bg-[#1a1a1e]',
        'border border-slate-200/90 dark:border-white/[0.08]',
        'hover:border-[#8ba32b]/45 dark:hover:border-[#c8e558]/35',
        'focus:outline-none focus-visible:ring-2 focus-visible:ring-[#8ba32b]/30 dark:focus-visible:ring-[#c8e558]/30',
        'transition-colors duration-200 cursor-pointer',
      )}
    >
      <div className="flex items-start gap-3">
        <div
          className={cn(
            'w-9 h-9 shrink-0 rounded-xl flex items-center justify-center',
            'bg-[#8ba32b]/10 dark:bg-[#c8e558]/10',
            'text-[#8ba32b] dark:text-[#c8e558]',
            'border border-[#8ba32b]/20 dark:border-[#c8e558]/20',
          )}
        >
          <Icon className="w-[18px] h-[18px]" />
        </div>

        <div className="min-w-0 flex-1">
          <h3 className="text-[13.5px] font-semibold text-slate-900 dark:text-white leading-snug line-clamp-2">
            {title}
          </h3>
          {subtitle && (
            <p className="mt-0.5 text-[12px] text-slate-500 dark:text-slate-400 truncate">{subtitle}</p>
          )}
        </div>

        {status && (
          <span
            className={cn(
              'shrink-0 text-[11px] font-medium px-2 py-0.5 rounded-md border',
              status.tone === 'ready' &&
                'text-[#6ca855] dark:text-[#c8e558] bg-[#8ba32b]/8 dark:bg-[#c8e558]/10 border-[#8ba32b]/20 dark:border-[#c8e558]/20',
              status.tone === 'pending' &&
                'text-amber-600 dark:text-amber-400 bg-amber-500/8 border-amber-500/20',
              status.tone === 'muted' &&
                'text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-white/5 border-slate-200 dark:border-white/10',
            )}
          >
            {status.label}
          </span>
        )}
      </div>

      {shown.length > 0 && (
        <div className="mt-3 flex items-center gap-1.5 text-[11.5px] text-slate-400 dark:text-slate-500">
          {shown.map((f, i) => (
            <React.Fragment key={i}>
              {i > 0 && <span className="opacity-50">·</span>}
              <span className="truncate">{f}</span>
            </React.Fragment>
          ))}
        </div>
      )}
    </motion.button>
  );
}
