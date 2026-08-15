import { Users, Clock, Award, Bookmark, ArrowRight, Zap } from 'lucide-react';
import { cn } from '../../lib/utils';
import { useTheme } from '../../lib/ThemeContext';
import { useLaunchTest } from '../../hooks/ai/useLaunchTest';

interface FeaturedTestSeriesProps {
  selectedExam: string;
}

export function FeaturedTestSeries({ selectedExam }: FeaturedTestSeriesProps) {
  const { theme } = useTheme();
  const isDarkMode = theme === 'dark';
  const launch = useLaunchTest();

  const examName = selectedExam || 'General Aptitude';

  const seriesList = [
    {
      id: 'ts-1',
      title: `${examName} Full-Length AI Mock Series`,
      description: `Complete syllabus practice paper adhering to the latest 2026 exam pattern and marking scheme.`,
      totalTests: 15,
      enrollment: '124k',
      difficulty: 'Medium-Hard',
      tags: ['Latest Pattern', 'AI Recommended']
    },
    {
      id: 'ts-2',
      title: `${examName} High-Yield Concept Booster`,
      description: `Targeted sectional tests focusing on high-frequency questions, critical theorems, and time-saving shortcuts.`,
      totalTests: 20,
      enrollment: '89k',
      difficulty: 'Hard',
      tags: ['Speed Booster']
    }
  ];

  return (
    <div className="space-y-4 font-sans">
      <div className="flex items-center justify-between">
        <h2 className="text-[17px] font-semibold text-slate-900 dark:text-white flex items-center gap-2">
          Featured Test Series
          {selectedExam && (
            <span className="text-[11px] font-medium px-2 py-0.5 bg-slate-100 dark:bg-white/10 text-slate-600 dark:text-slate-300 rounded-full border border-slate-200/80 dark:border-white/10">
              {selectedExam}
            </span>
          )}
        </h2>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {seriesList.map((series) => (
          <div 
            key={series.id}
            className={cn(
              "p-5 rounded-2xl border transition-all flex flex-col justify-between group",
              isDarkMode 
                ? "bg-white/[0.04] border-white/[0.07] shadow-xs hover:border-white/[0.14] hover:bg-white/[0.06]" 
                : "bg-white border-slate-200/90 shadow-xs hover:border-slate-300"
            )}
          >
            <div>
              <div className="flex justify-between items-start mb-3">
                <div className="flex flex-wrap gap-1.5">
                  {series.tags.map(tag => (
                    <span key={tag} className={cn(
                      "text-[10.5px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-md",
                      tag === 'AI Recommended' 
                        ? "bg-[#c8e558]/15 text-slate-900 dark:text-[#c8e558] border border-[#c8e558]/30"
                        : "bg-slate-100 dark:bg-white/5 text-slate-600 dark:text-slate-300 border border-slate-200/80 dark:border-white/10"
                    )}>
                      {tag}
                    </span>
                  ))}
                </div>
              </div>

              <h3 className="text-[15.5px] font-semibold text-slate-900 dark:text-white mb-1.5 leading-snug">
                {series.title}
              </h3>
              <p className="text-[13px] text-slate-500 dark:text-slate-400 mb-5 leading-relaxed">
                {series.description}
              </p>
            </div>

            <div>
              <div className="flex items-center gap-4 text-[12px] font-medium text-slate-500 dark:text-slate-400 mb-4 pt-3 border-t border-slate-100 dark:border-white/5">
                <div className="flex items-center gap-1.5">
                  <Award className="w-3.5 h-3.5 text-amber-500" />
                  {series.totalTests} Mock Papers
                </div>
                <div className="flex items-center gap-1.5">
                  <Users className="w-3.5 h-3.5 text-slate-400" />
                  {series.enrollment} Students
                </div>
              </div>

              <button 
                onClick={() => launch({ topic: series.title, count: 15, mode: 'exam' })}
                className="w-full py-2.5 bg-slate-900 hover:bg-slate-800 text-white dark:bg-[#c8e558] dark:hover:bg-[#bcd94c] dark:text-slate-900 rounded-xl text-[13px] font-semibold flex items-center justify-center gap-2 transition-all shadow-xs active:scale-[0.98] cursor-pointer"
              >
                <Zap className="w-4 h-4 fill-current" /> Start AI Mock Paper
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
