import { ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '../../lib/utils';
import { useTheme } from '../../lib/ThemeContext';

interface PaginationProps {
  page: number;
  pageCount: number;
  onChange: (page: number) => void;
  /** Optional "X–Y of Z" label rendered on the left, e.g. "1–8 of 34". */
  rangeLabel?: string;
}

/** Compact numbered pager with a sliding window (current ±1) plus first/last, matching the
 *  dashboard's dense control sizing. Renders nothing when there's only one page. */
export function Pagination({ page, pageCount, onChange, rangeLabel }: PaginationProps) {
  const { theme } = useTheme();
  const isDarkMode = theme === 'dark';
  if (pageCount <= 1) return null;

  const pages = new Set<number>([1, pageCount, page, page - 1, page + 1].filter((p) => p >= 1 && p <= pageCount));
  const sorted = Array.from(pages).sort((a, b) => a - b);

  const pill = (active: boolean) => cn(
    "min-w-[26px] h-[26px] px-1.5 rounded-lg text-[12px] font-semibold transition-all cursor-pointer flex items-center justify-center",
    active
      ? "bg-slate-900 text-white dark:bg-[#c8e558] dark:text-slate-900"
      : isDarkMode
        ? "text-slate-400 hover:text-white hover:bg-white/[0.06]"
        : "text-slate-500 hover:text-slate-900 hover:bg-slate-100"
  );

  return (
    <div className="flex items-center justify-between gap-3 pt-1">
      {rangeLabel ? (
        <span className="text-[11.5px] font-medium text-slate-400 dark:text-slate-500 shrink-0">{rangeLabel}</span>
      ) : <span />}

      <div className="flex items-center gap-1">
        <button
          onClick={() => onChange(page - 1)}
          disabled={page <= 1}
          className={cn(pill(false), "disabled:opacity-30 disabled:cursor-not-allowed")}
          aria-label="Previous page"
        >
          <ChevronLeft className="w-3.5 h-3.5" />
        </button>

        {sorted.map((p, i) => (
          <span key={p} className="flex items-center gap-1">
            {i > 0 && p - sorted[i - 1] > 1 && (
              <span className="text-[11px] text-slate-300 dark:text-slate-600 px-0.5">…</span>
            )}
            <button onClick={() => onChange(p)} className={pill(p === page)}>{p}</button>
          </span>
        ))}

        <button
          onClick={() => onChange(page + 1)}
          disabled={page >= pageCount}
          className={cn(pill(false), "disabled:opacity-30 disabled:cursor-not-allowed")}
          aria-label="Next page"
        >
          <ChevronRight className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}
