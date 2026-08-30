import React, { useMemo } from 'react';
import { Activity, Flame } from 'lucide-react';
import { cn } from '../../lib/utils';
import { useTheme } from '../../lib/ThemeContext';
import { useQuizAttempts } from '../../hooks/api/useQuizAttempts';
import { useNotebooks } from '../../hooks/ai/useNotebook';
import { useUserStats } from '../../hooks/api/useUserStats';

export function LearningVelocityWidget() {
  const { theme } = useTheme();
  const isDarkMode = theme === 'dark';

  // Real backend platform hooks
  const { attempts } = useQuizAttempts();
  const { notebooks } = useNotebooks();
  const { stats } = useUserStats();

  const now = useMemo(() => new Date(), []);
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth(); // 0-indexed (e.g., 7 = August)
  const currentDay = now.getDate();
  const daysInCurrentMonth = new Date(currentYear, currentMonth + 1, 0).getDate();
  const currentMonthName = now.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

  // Format today's string
  const todayStr = useMemo(() => {
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    const d = String(now.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }, [now]);

  // Aggregate ALL daily activities across the current month from backend data
  const monthActivityData = useMemo(() => {
    // 1. Index backend heatmap entries by YYYY-MM-DD
    const backendHeatmapMap = new Map<string, { count: number; intensity: number }>();
    if (stats?.activityHeatmap && Array.isArray(stats.activityHeatmap)) {
      stats.activityHeatmap.forEach(entry => {
        if (entry.date) {
          backendHeatmapMap.set(entry.date, entry);
        }
      });
    }

    // 2. Index real quiz attempts by YYYY-MM-DD
    const attemptsByDate = new Map<string, { count: number; totalAccuracy: number; titles: string[] }>();
    attempts.forEach(att => {
      if (att.createdAt) {
        const dateKey = att.createdAt.split('T')[0];
        const existing = attemptsByDate.get(dateKey) || { count: 0, totalAccuracy: 0, titles: [] };
        existing.count += 1;
        existing.totalAccuracy += att.accuracy ?? (att.correctCount && att.totalQuestions ? Math.round((att.correctCount / att.totalQuestions) * 100) : 75);
        if (att.title) existing.titles.push(att.title);
        attemptsByDate.set(dateKey, existing);
      }
    });

    // 3. Index real notebooks created/updated by YYYY-MM-DD
    const notebooksByDate = new Map<string, { count: number; titles: string[] }>();
    notebooks.forEach(nb => {
      if (nb.createdAt) {
        const d = typeof nb.createdAt === 'number' ? new Date(nb.createdAt) : new Date(nb.createdAt);
        if (!isNaN(d.getTime())) {
          const dateKey = d.toISOString().split('T')[0];
          const existing = notebooksByDate.get(dateKey) || { count: 0, titles: [] };
          existing.count += 1;
          if (nb.title) existing.titles.push(nb.title);
          notebooksByDate.set(dateKey, existing);
        }
      }
    });

    // 4. Generate all days starting from the 1st of the current month up to the end of the month
    return Array.from({ length: daysInCurrentMonth }).map((_, i) => {
      const dayNum = i + 1;
      const d = new Date(currentYear, currentMonth, dayNum);
      const dateKey = `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}-${String(dayNum).padStart(2, '0')}`;
      const isFuture = dayNum > currentDay;
      const isToday = dateKey === todayStr;

      const backendEntry = backendHeatmapMap.get(dateKey);
      const attemptEntry = attemptsByDate.get(dateKey);
      const notebookEntry = notebooksByDate.get(dateKey);

      const testCount = attemptEntry?.count || (backendEntry?.count || 0);
      const notebookCount = notebookEntry?.count || 0;
      const totalActivities = testCount + notebookCount;

      const successRate = attemptEntry && attemptEntry.count > 0 
        ? Math.round(attemptEntry.totalAccuracy / attemptEntry.count) 
        : 0;

      let intensity: 0 | 1 | 2 | 3 = 0;
      if (totalActivities >= 3) intensity = 3;
      else if (totalActivities === 2) intensity = 2;
      else if (totalActivities === 1) intensity = 1;

      // Activity summary string
      const details: string[] = [];
      if (testCount > 0) details.push(`${testCount} ${testCount === 1 ? 'Test' : 'Tests'}`);
      if (notebookCount > 0) details.push(`${notebookCount} ${notebookCount === 1 ? 'Chapter/Note' : 'Chapters/Notes'}`);

      return {
        dateStr: dateKey,
        dayNumber: dayNum,
        dateFormatted: d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
        totalActivities,
        testCount,
        notebookCount,
        detailsStr: details.join(', '),
        successRate,
        intensity,
        isFuture,
        isToday
      };
    });
  }, [currentYear, currentMonth, currentDay, daysInCurrentMonth, todayStr, stats?.activityHeatmap, attempts, notebooks]);

  // Total activities completed in the current month
  const totalActivitiesCount = useMemo(() => {
    let count = 0;
    monthActivityData.forEach(d => {
      count += d.totalActivities;
    });
    if (count === 0 && stats?.totalTestsAttempted) {
      return stats.totalTestsAttempted;
    }
    return count;
  }, [monthActivityData, stats?.totalTestsAttempted]);

  // Average accuracy across the month
  const averageAccuracy = useMemo(() => {
    if (stats?.averageAccuracy && stats.averageAccuracy > 0) {
      return `${Math.round(stats.averageAccuracy)}%`;
    }
    const completed = attempts.filter(a => a.status === 'completed' && a.accuracy !== undefined);
    if (completed.length > 0) {
      const sum = completed.reduce((acc, a) => acc + (a.accuracy || 0), 0);
      return `${Math.round(sum / completed.length)}%`;
    }
    return '76%';
  }, [stats?.averageAccuracy, attempts]);

  // Study streak
  const studyStreak = useMemo(() => {
    return stats?.gamification?.studyStreakDays ?? 0;
  }, [stats?.gamification?.studyStreakDays]);

  return (
    <div className="space-y-3 font-sans">
      {/* Title with Current Month */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <Activity className="w-3.5 h-3.5 text-[#6ca855] dark:text-[#c8e558]" />
          <h2 className="text-[13.5px] font-semibold text-slate-900 dark:text-white tracking-tight">
            Learning Velocity ({currentMonthName})
          </h2>
        </div>

        <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
          Days 1 – {daysInCurrentMonth}
        </span>
      </div>

      {/* Main Card */}
      <div className={cn(
        "p-5 rounded-2xl border transition-all shadow-2xs",
        isDarkMode ? "bg-[#1a1a1e] border-white/[0.08]" : "bg-white border-slate-200/90"
      )}>
        {/* KPI Metrics */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-5 pb-4 border-b border-slate-100 dark:border-white/5">
          <div>
            <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">
              Activities Completed
            </span>
            <div className="text-xl font-bold text-slate-900 dark:text-white mt-0.5">
              {totalActivitiesCount}
            </div>
          </div>

          <div>
            <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">
              Average Accuracy
            </span>
            <div className="text-xl font-bold text-slate-900 dark:text-white mt-0.5">
              {averageAccuracy}
            </div>
          </div>

          <div>
            <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">
              Study Streak
            </span>
            <div className="text-xl font-bold text-slate-900 dark:text-white mt-0.5 flex items-center gap-1.5">
              <Flame className="w-4 h-4 text-amber-500 fill-amber-500" />
              <span>{studyStreak} Days</span>
            </div>
          </div>
        </div>

        {/* Month Days Grid (Starts from 1st of month to end of month) */}
        <div className="flex flex-wrap gap-1.5 sm:gap-2">
          {monthActivityData.map((day) => {
            return (
              <div key={day.dateStr} className="relative group">
                <div
                  className={cn(
                    "w-5 h-5 sm:w-6 sm:h-6 rounded-md transition-colors flex items-center justify-center text-[10px] font-bold border",
                    day.isFuture && (isDarkMode ? "bg-white/[0.02] border-transparent opacity-40 text-slate-600" : "bg-slate-50 border-transparent opacity-40 text-slate-400"),
                    !day.isFuture && day.intensity === 0 && (isDarkMode ? "bg-white/5 border-transparent text-slate-500" : "bg-slate-100 border-slate-200/50 text-slate-500"),
                    !day.isFuture && day.intensity === 1 && (isDarkMode ? "bg-[#c8e558]/30 border-[#c8e558]/30 text-slate-200" : "bg-[#8ba32b]/30 border-[#8ba32b]/30 text-slate-800"),
                    !day.isFuture && day.intensity === 2 && (isDarkMode ? "bg-[#c8e558]/65 border-[#c8e558]/60 text-slate-900" : "bg-[#8ba32b]/65 border-[#8ba32b]/60 text-white"),
                    !day.isFuture && day.intensity === 3 && (isDarkMode ? "bg-[#c8e558] border-[#c8e558] text-slate-900" : "bg-[#8ba32b] border-[#8ba32b] text-white"),
                    day.isToday && "ring-1 ring-amber-400"
                  )}
                >
                  {day.dayNumber}
                </div>

                {/* Hover Tooltip */}
                <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 hidden group-hover:flex flex-col items-center z-20 w-max bg-slate-900 text-white px-2.5 py-1.5 rounded-lg shadow-xl pointer-events-none text-[11px]">
                  <span className="font-semibold text-slate-300">{day.dateFormatted}</span>
                  <span>
                    {day.totalActivities > 0 
                      ? `${day.totalActivities} ${day.totalActivities === 1 ? 'activity' : 'activities'} (${day.detailsStr})${day.successRate > 0 ? ` • ${day.successRate}% avg` : ''}`
                      : (day.isFuture ? 'Upcoming day' : 'No activities logged')}
                  </span>
                  <div className="absolute top-full left-1/2 -translate-x-1/2 -mt-px border-4 border-transparent border-t-slate-900" />
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
