import { Layout, FileText, Bookmark, Calendar, Zap, List } from 'lucide-react';
import { cn } from '../../lib/utils';
import { useTheme } from '../../lib/ThemeContext';

const categories = [
  { icon: Layout, label: 'Full Length Tests', count: '150+', color: 'text-blue-500', bg: 'bg-blue-500/10' },
  { icon: FileText, label: 'Subject Tests', count: '320+', color: 'text-indigo-500', bg: 'bg-indigo-500/10' },
  { icon: List, label: 'Chapter Tests', count: '840+', color: 'text-purple-500', bg: 'bg-purple-500/10' },
  { icon: Bookmark, label: 'Previous Year', count: '45+', color: 'text-emerald-500', bg: 'bg-emerald-500/10' },
  { icon: Calendar, label: 'Daily Quiz', count: 'New', color: 'text-amber-500', bg: 'bg-amber-500/10' },
  { icon: Zap, label: 'Speed Tests', count: '120+', color: 'text-rose-500', bg: 'bg-rose-500/10' },
];

export function CategoryGrid() {
  const { theme } = useTheme();
  const isDarkMode = theme === 'dark';

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold flex items-center gap-2">
        Browse by Category
      </h2>
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        {categories.map((cat, i) => (
          <button
            key={i}
            className={cn(
              "p-6 rounded-2xl border flex flex-col items-center justify-center text-center gap-3 transition-all hover:scale-[1.02] active:scale-95 cursor-pointer group",
              isDarkMode ? "bg-slate-900 border-slate-800 hover:border-slate-700" : "bg-white border-slate-200 hover:border-slate-300 shadow-sm"
            )}
          >
            <div className={cn("w-12 h-12 rounded-xl flex items-center justify-center transition-transform group-hover:scale-110", cat.bg, cat.color)}>
              <cat.icon className="w-6 h-6" />
            </div>
            <div>
              <div className="font-bold text-sm mb-1">{cat.label}</div>
              <div className={cn("text-xs font-semibold", isDarkMode ? "text-slate-500" : "text-slate-400")}>{cat.count}</div>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
