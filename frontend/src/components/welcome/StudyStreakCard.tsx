import { motion } from 'motion/react';
import { BriefingResponse } from '../../../../backend-firestore/src/types/briefing.types';
import { Flame, Clock, Calendar, TrendingUp } from 'lucide-react';

interface Props {
  streak: BriefingResponse['studyStreak'];
  delay?: number;
}

export function StudyStreakCard({ streak, delay = 0.1 }: Props) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay }}
      className="col-span-full sm:col-span-1 md:col-span-4 lg:col-span-3 bg-white dark:bg-[#1f1f1f] border border-slate-200 dark:border-white/10 rounded-2xl p-6 shadow-sm flex flex-col justify-between"
    >
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-slate-800 dark:text-white font-bold text-lg flex items-center gap-2">
          <Flame className="w-5 h-5 text-orange-500" fill="currentColor" />
          Study Streak
        </h3>
        <span className="text-2xl font-black text-slate-900 dark:text-white">
          {streak.days} <span className="text-sm text-slate-500 font-medium">Days</span>
        </span>
      </div>

      <div className="space-y-4">
        <div className="flex justify-between items-center">
          <div className="flex items-center gap-2 text-slate-600 dark:text-slate-400">
            <Clock className="w-4 h-4" />
            <span className="text-sm font-medium">Yesterday</span>
          </div>
          <span className="text-slate-900 dark:text-white font-bold">{streak.yesterdayTime}</span>
        </div>
        
        <div className="flex justify-between items-center">
          <div className="flex items-center gap-2 text-slate-600 dark:text-slate-400">
            <Calendar className="w-4 h-4" />
            <span className="text-sm font-medium">This Week</span>
          </div>
          <span className="text-slate-900 dark:text-white font-bold">{streak.thisWeekTime}</span>
        </div>
        
        <div className="flex justify-between items-center pt-3 border-t border-slate-100 dark:border-white/5">
          <div className="flex items-center gap-2 text-slate-600 dark:text-slate-400">
            <TrendingUp className="w-4 h-4 text-teal-500" />
            <span className="text-sm font-medium">Consistency</span>
          </div>
          <span className="text-teal-600 dark:text-teal-400 font-bold">{streak.consistencyScore}%</span>
        </div>
      </div>
    </motion.div>
  );
}
