import React from 'react';
import { Trophy, Flame, Zap, Award, CheckCircle2 } from 'lucide-react';
import { cn } from '../../lib/utils';
import { useUserStats } from '../../hooks/api/useUserStats';
import { useProfile } from '../../hooks/api/useProfile';
import { useTheme } from '../../lib/ThemeContext';

export function AchievementsMilestones() {
  const { theme } = useTheme();
  const isDarkMode = theme === 'dark';
  const { stats } = useUserStats();
  const { profile } = useProfile();

  const targetExam = profile?.goal || profile?.targetExam || 'Competitive Exams';

  // 1. Live Streak calculation
  const streak = stats?.gamification?.studyStreakDays ?? (stats?.totalTestsAttempted && stats.totalTestsAttempted > 0 ? 1 : 0);
  const streakProgress = Math.min(100, Math.round((streak / 7) * 100));
  const isStreakUnlocked = streak >= 7;

  // 2. Live Accuracy calculation
  const avgAccuracy = typeof stats?.averageAccuracy === 'number' && stats.averageAccuracy > 0
    ? Math.round(stats.averageAccuracy)
    : 0;
  const isAccuracyUnlocked = avgAccuracy >= 90;

  // 3. Live Tests Practiced calculation
  const totalTests = stats?.totalTestsAttempted ?? 0;
  const testsProgress = Math.min(100, Math.round((totalTests / 5) * 100));
  const isTestsUnlocked = totalTests >= 5;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-[13px] font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
          <Trophy className="w-3.5 h-3.5 text-amber-500" />
          <span>Achievements &amp; Milestones</span>
          <span className="text-[10px] font-normal text-slate-400">· Real-time tracking</span>
        </h2>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5">
        {/* Milestone 1: Top Accuracy */}
        <div
          className={cn(
            "p-4 rounded-2xl border transition-all flex items-start gap-3 shadow-2xs",
            isDarkMode ? "bg-[#1a1a1e] border-white/[0.08]" : "bg-white border-slate-200/90"
          )}
        >
          <div
            className={cn(
              "w-10 h-10 rounded-xl flex items-center justify-center shrink-0 border",
              isAccuracyUnlocked
                ? "bg-amber-500/15 text-amber-500 border-amber-500/30"
                : "bg-slate-100 dark:bg-white/5 text-slate-400 border-slate-200/80 dark:border-white/10"
            )}
          >
            <Trophy className="w-5 h-5" />
          </div>
          <div className="flex-1 min-w-0">
            <h4 className="text-[13px] font-bold text-slate-900 dark:text-white truncate">
              Top Accuracy
            </h4>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 leading-snug">
              {avgAccuracy > 0
                ? `Scored ${avgAccuracy}% average across ${totalTests} test${totalTests === 1 ? '' : 's'}.`
                : 'Score 90%+ in tests to unlock mastery.'}
            </p>
            <div className="mt-2.5 flex items-center gap-2">
              <div className="flex-1 h-1.5 bg-slate-100 dark:bg-white/5 rounded-full overflow-hidden">
                <div
                  className={cn(
                    "h-full rounded-full transition-all duration-500",
                    isAccuracyUnlocked ? "bg-amber-500" : "bg-amber-500/60"
                  )}
                  style={{ width: `${avgAccuracy}%` }}
                />
              </div>
              <span
                className={cn(
                  "text-[9.5px] font-bold shrink-0",
                  isAccuracyUnlocked ? "text-amber-500" : "text-slate-400"
                )}
              >
                {isAccuracyUnlocked ? 'Unlocked!' : `${avgAccuracy}% / 90%`}
              </span>
            </div>
          </div>
        </div>

        {/* Milestone 2: 7-Day Streak */}
        <div
          className={cn(
            "p-4 rounded-2xl border transition-all flex items-start gap-3 shadow-2xs",
            isDarkMode ? "bg-[#1a1a1e] border-white/[0.08]" : "bg-white border-slate-200/90"
          )}
        >
          <div
            className={cn(
              "w-10 h-10 rounded-xl flex items-center justify-center shrink-0 border",
              streak > 0
                ? "bg-[#8ba32b]/15 dark:bg-[#c8e558]/15 text-[#8ba32b] dark:text-[#c8e558] border-[#8ba32b]/30 dark:border-[#c8e558]/30"
                : "bg-slate-100 dark:bg-white/5 text-slate-400 border-slate-200/80 dark:border-white/10"
            )}
          >
            <Flame className="w-5 h-5" />
          </div>
          <div className="flex-1 min-w-0">
            <h4 className="text-[13px] font-bold text-slate-900 dark:text-white truncate">
              {streak > 0 ? `${streak}-Day Streak` : '7-Day Streak'}
            </h4>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 leading-snug">
              {streak > 0
                ? `Logged in and active ${streak} day${streak === 1 ? '' : 's'} straight.`
                : 'Practice daily to unlock your 7-day streak.'}
            </p>
            <div className="mt-2.5 flex items-center gap-2">
              <div className="flex-1 h-1.5 bg-slate-100 dark:bg-white/5 rounded-full overflow-hidden">
                <div
                  className="h-full bg-[#8ba32b] dark:bg-[#c8e558] rounded-full transition-all duration-500"
                  style={{ width: `${streakProgress}%` }}
                />
              </div>
              <span
                className={cn(
                  "text-[9.5px] font-bold shrink-0",
                  isStreakUnlocked
                    ? "text-[#8ba32b] dark:text-[#c8e558]"
                    : "text-slate-400 dark:text-slate-500"
                )}
              >
                {isStreakUnlocked ? 'Unlocked!' : `${streak}/7 Days`}
              </span>
            </div>
          </div>
        </div>

        {/* Milestone 3: Speedy Solver / Practice Master */}
        <div
          className={cn(
            "p-4 rounded-2xl border transition-all flex items-start gap-3 shadow-2xs",
            isDarkMode ? "bg-[#1a1a1e] border-white/[0.08]" : "bg-white border-slate-200/90"
          )}
        >
          <div
            className={cn(
              "w-10 h-10 rounded-xl flex items-center justify-center shrink-0 border",
              isTestsUnlocked
                ? "bg-indigo-500/15 text-indigo-500 border-indigo-500/30"
                : "bg-slate-100 dark:bg-white/5 text-slate-400 border-slate-200/80 dark:border-white/10"
            )}
          >
            <Zap className="w-5 h-5" />
          </div>
          <div className="flex-1 min-w-0">
            <h4 className="text-[13px] font-bold text-slate-900 dark:text-white truncate">
              Practice Master
            </h4>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 leading-snug">
              {totalTests > 0
                ? `Completed ${totalTests} test drill${totalTests === 1 ? '' : 's'} on ${targetExam}.`
                : `Complete 5 practice tests in your ${targetExam} course.`}
            </p>
            <div className="mt-2.5 flex items-center gap-2">
              <div className="flex-1 h-1.5 bg-slate-100 dark:bg-white/5 rounded-full overflow-hidden">
                <div
                  className={cn(
                    "h-full rounded-full transition-all duration-500",
                    isTestsUnlocked ? "bg-indigo-500" : "bg-slate-400 dark:bg-slate-500"
                  )}
                  style={{ width: `${testsProgress}%` }}
                />
              </div>
              <span
                className={cn(
                  "text-[9.5px] font-medium shrink-0",
                  isTestsUnlocked ? "text-indigo-500 font-bold" : "text-slate-400"
                )}
              >
                {isTestsUnlocked ? 'Unlocked!' : `${Math.min(totalTests, 5)}/5 Tests`}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
