import { Layout, FileText, Bookmark, Calendar, Zap, List, ArrowRight } from 'lucide-react';
import { cn } from '../../lib/utils';
import { useTheme } from '../../lib/ThemeContext';
import { useLaunchTest } from '../../hooks/ai/useLaunchTest';
import { getExamConfig, type CategoryConfig } from '../../lib/examPersonalization';

interface CategoryGridProps {
  selectedExam: string;
}

const ICONS: Record<CategoryConfig['icon'], typeof Layout> = {
  mocks: Layout,
  subject: FileText,
  chapter: List,
  pyq: Bookmark,
  daily: Calendar,
  speed: Zap,
};

export function CategoryGrid({ selectedExam }: CategoryGridProps) {
  const { theme } = useTheme();
  const isDarkMode = theme === 'dark';
  const launch = useLaunchTest();
  const { examId, categories } = getExamConfig(selectedExam);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-[14px] font-semibold text-slate-900 dark:text-white">Browse by practice type</h2>
        <span className="text-[11.5px] font-medium text-slate-400 dark:text-slate-500">{selectedExam}</span>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-2">
        {categories.map((cat, i) => {
          const Icon = ICONS[cat.icon];
          return (
            <button
              key={i}
              onClick={() => launch({ topic: cat.topic, count: cat.countNum, mode: 'exam', examId })}
              className={cn(
                "flex items-center gap-3 p-3 rounded-xl border text-left transition-colors cursor-pointer group",
                isDarkMode
                  ? "bg-white/[0.03] border-white/[0.07] hover:border-white/[0.16] hover:bg-white/[0.05]"
                  : "bg-white border-slate-200/80 hover:border-slate-300 hover:bg-slate-50/60"
              )}
            >
              <div className="w-8 h-8 rounded-lg bg-slate-100 dark:bg-white/[0.06] flex items-center justify-center text-slate-600 dark:text-slate-300 group-hover:text-[#8ba32b] dark:group-hover:text-[#c8e558] transition-colors shrink-0">
                <Icon className="w-4 h-4" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-[13px] font-semibold text-slate-900 dark:text-white truncate">{cat.label}</div>
                <div className="text-[11.5px] text-slate-400 dark:text-slate-500">{cat.count} · {cat.countNum} Qs</div>
              </div>
              <ArrowRight className="w-3.5 h-3.5 text-slate-300 dark:text-slate-600 group-hover:text-slate-500 dark:group-hover:text-slate-300 group-hover:translate-x-0.5 transition-all shrink-0" />
            </button>
          );
        })}
      </div>
    </div>
  );
}
