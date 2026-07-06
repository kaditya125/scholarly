import { motion } from 'motion/react';
import { BriefingResponse } from '../../../../backend-firestore/src/types/briefing.types';
import { Activity } from 'lucide-react';

interface Props {
  progress: BriefingResponse['yesterdaysProgress'];
  delay?: number;
}

export function ActivityTimeline({ progress, delay = 0.2 }: Props) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay }}
      className="col-span-full md:col-span-4 lg:col-span-3 bg-white dark:bg-[#1f1f1f] border border-slate-200 dark:border-white/10 rounded-2xl p-6 shadow-sm"
    >
      <div className="flex items-center gap-2 mb-4 text-slate-800 dark:text-white font-bold text-lg">
        <Activity className="w-5 h-5 text-indigo-500" />
        <h3>Recent Activity</h3>
      </div>
      
      <p className="text-sm text-slate-600 dark:text-slate-400 mb-4 font-medium">
        {progress.summary}
      </p>

      <div className="space-y-4 relative before:absolute before:inset-0 before:ml-2 before:-translate-x-px md:before:mx-auto md:before:translate-x-0 before:h-full before:w-0.5 before:bg-gradient-to-b before:from-transparent before:via-slate-200 dark:before:via-white/10 before:to-transparent">
        {progress.completedItems.length > 0 ? (
          progress.completedItems.map((item, i) => (
            <div key={i} className="relative flex items-center justify-between md:justify-normal md:odd:flex-row-reverse group is-active">
              <div className="flex items-center justify-center w-4 h-4 rounded-full border-2 border-white dark:border-[#1f1f1f] bg-indigo-500 shadow shrink-0 md:order-1 md:group-odd:-translate-x-1/2 md:group-even:translate-x-1/2 ml-0 mr-3 md:mx-auto z-10"></div>
              <div className="w-[calc(100%-2rem)] md:w-[calc(50%-1.5rem)] bg-slate-50 dark:bg-white/5 p-3 rounded-xl border border-slate-100 dark:border-white/5 shadow-sm">
                <p className="text-sm font-semibold text-slate-700 dark:text-slate-300">{item}</p>
              </div>
            </div>
          ))
        ) : (
          <p className="text-sm text-slate-500 italic pl-6">No recent activity found. Time to start studying!</p>
        )}
      </div>
    </motion.div>
  );
}
