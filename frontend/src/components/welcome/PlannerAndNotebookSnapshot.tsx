import { motion } from 'motion/react';
import { BriefingResponse } from '../../../../backend-firestore/src/types/briefing.types';
import { CalendarCheck, BookMarked } from 'lucide-react';

interface PlannerProps {
  planner: BriefingResponse['plannerSummary'];
  delay?: number;
}

export function PlannerSnapshot({ planner, delay = 0.4 }: PlannerProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay }}
      className="col-span-full md:col-span-4 lg:col-span-3 bg-white dark:bg-[#1f1f1f] border border-slate-200 dark:border-white/10 rounded-2xl p-6 shadow-sm flex flex-col justify-between"
    >
      <div className="flex items-center gap-2 mb-4">
        <CalendarCheck className="w-5 h-5 text-indigo-500" />
        <h3 className="text-slate-800 dark:text-white font-bold text-lg">Today's Planner</h3>
      </div>
      
      <div className="space-y-3">
        <div className="flex justify-between items-center bg-slate-50 dark:bg-white/5 p-3 rounded-xl border border-slate-100 dark:border-white/5">
           <span className="text-sm font-medium text-slate-700 dark:text-slate-300">Study Sessions</span>
           <span className="font-bold text-slate-900 dark:text-white">{planner.sessionsCount}</span>
        </div>
        <div className="flex justify-between items-center bg-slate-50 dark:bg-white/5 p-3 rounded-xl border border-slate-100 dark:border-white/5">
           <span className="text-sm font-medium text-slate-700 dark:text-slate-300">Quizzes</span>
           <span className="font-bold text-slate-900 dark:text-white">{planner.quizCount}</span>
        </div>
        <div className="flex justify-between items-center bg-slate-50 dark:bg-white/5 p-3 rounded-xl border border-slate-100 dark:border-white/5">
           <span className="text-sm font-medium text-slate-700 dark:text-slate-300">Revisions</span>
           <span className="font-bold text-slate-900 dark:text-white">{planner.revisionCount}</span>
        </div>
      </div>
      
      <p className="text-center text-xs text-slate-500 dark:text-slate-400 mt-4 font-medium uppercase tracking-wider">
        Est. Time: {planner.totalEstimatedMinutes} Mins
      </p>
    </motion.div>
  );
}

interface NotebookProps {
  notebooks: BriefingResponse['notebookSummary'];
  delay?: number;
}

export function NotebookSnapshot({ notebooks, delay = 0.5 }: NotebookProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay }}
      className="col-span-full md:col-span-4 lg:col-span-4 bg-white dark:bg-[#1f1f1f] border border-slate-200 dark:border-white/10 rounded-2xl p-6 shadow-sm flex flex-col"
    >
      <div className="flex items-center gap-2 mb-4">
        <BookMarked className="w-5 h-5 text-indigo-500" />
        <h3 className="text-slate-800 dark:text-white font-bold text-lg">Active Notebooks</h3>
      </div>

      <div className="space-y-4 flex-grow">
        {notebooks.activeNotebooks.length > 0 ? (
          notebooks.activeNotebooks.slice(0, 3).map((nb, i) => (
            <div key={i}>
              <div className="flex justify-between items-end mb-1.5">
                <span className="text-sm font-semibold text-slate-800 dark:text-slate-200 line-clamp-1">{nb.name}</span>
                <span className="text-xs font-bold text-teal-600 dark:text-teal-400">{nb.completionPercentage}%</span>
              </div>
              <div className="w-full bg-slate-100 dark:bg-white/5 rounded-full h-2">
                <div 
                  className="bg-teal-500 h-2 rounded-full" 
                  style={{ width: `${Math.max(5, nb.completionPercentage)}%` }}
                ></div>
              </div>
            </div>
          ))
        ) : (
          <p className="text-sm text-slate-500 italic flex items-center justify-center h-full">No active notebooks.</p>
        )}
      </div>
    </motion.div>
  );
}
