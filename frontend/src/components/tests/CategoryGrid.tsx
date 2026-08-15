import { Layout, FileText, Bookmark, Calendar, Zap, List } from 'lucide-react';
import { cn } from '../../lib/utils';
import { useTheme } from '../../lib/ThemeContext';
import { useLaunchTest } from '../../hooks/ai/useLaunchTest';

const categories = [
  { icon: Layout, label: 'Full Length Mocks', count: '50+ Sets', countNum: 20 },
  { icon: FileText, label: 'Subject Practice', count: '100+ Topics', countNum: 15 },
  { icon: List, label: 'Chapter Deep-Dives', count: '250+ Chapters', countNum: 10 },
  { icon: Bookmark, label: 'Previous Year Papers', count: '2018-2025', countNum: 15 },
  { icon: Calendar, label: 'Daily AI Quiz', count: 'Fresh Daily', countNum: 10 },
  { icon: Zap, label: 'Speed & Accuracy Sprints', count: '5 Min Sprints', countNum: 5 },
];

export function CategoryGrid() {
  const { theme } = useTheme();
  const isDarkMode = theme === 'dark';
  const launch = useLaunchTest();

  return (
    <div className="space-y-4 font-sans">
      <h2 className="text-[20px] font-semibold text-slate-900 dark:text-white flex items-center gap-2">
        Browse by Practice Type
      </h2>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {categories.map((cat, i) => (
          <button
            key={i}
            onClick={() => launch({ topic: cat.label, count: cat.countNum, mode: 'exam' })}
            className={cn(
              "p-4 rounded-2xl border flex flex-col items-center justify-center text-center gap-2.5 transition-all active:scale-98 cursor-pointer group",
              isDarkMode 
                ? "bg-white/[0.04] border-white/[0.07] shadow-xs hover:border-[#c8e558]/40 hover:bg-white/[0.06]" 
                : "bg-white border-slate-200/90 shadow-xs hover:border-[#8ba32b]/40 hover:bg-slate-50/70"
            )}
          >
            <div className="w-10 h-10 rounded-xl bg-slate-100 dark:bg-white/5 flex items-center justify-center text-slate-600 dark:text-slate-300 group-hover:text-[#8ba32b] dark:group-hover:text-[#c8e558] group-hover:scale-105 transition-all">
              <cat.icon className="w-5 h-5" />
            </div>
            <div>
              <div className="font-semibold text-[13px] text-slate-900 dark:text-white mb-0.5 leading-snug">{cat.label}</div>
              <div className="text-[11px] font-medium text-slate-400 dark:text-slate-500">{cat.count}</div>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
