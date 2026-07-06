import { motion } from 'motion/react';
import { BriefingResponse } from '../../../../backend-firestore/src/types/briefing.types';
import { Brain, AlertCircle, ArrowUpCircle } from 'lucide-react';

interface Props {
  memory: BriefingResponse['aiMemorySummary'];
  delay?: number;
}

export function AIMemorySummary({ memory, delay = 0.4 }: Props) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay }}
      className="col-span-full md:col-span-4 lg:col-span-5 bg-white dark:bg-[#1f1f1f] border border-slate-200 dark:border-white/10 rounded-2xl p-6 shadow-sm"
    >
      <div className="flex items-center gap-2 mb-4 text-slate-800 dark:text-white font-bold text-lg">
        <Brain className="w-5 h-5 text-indigo-500" />
        <h3>I Remembered That...</h3>
      </div>

      <div className="space-y-4">
        {memory.struggles.length > 0 && (
          <div className="flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-orange-500 mt-0.5 shrink-0" />
            <p className="text-sm text-slate-600 dark:text-slate-300">
              You've been finding <span className="font-semibold text-slate-800 dark:text-white">{memory.struggles.join(', ')}</span> challenging recently.
            </p>
          </div>
        )}

        {memory.improvements.length > 0 && (
          <div className="flex items-start gap-3">
            <ArrowUpCircle className="w-5 h-5 text-teal-500 mt-0.5 shrink-0" />
            <p className="text-sm text-slate-600 dark:text-slate-300">
              You showed solid improvement in <span className="font-semibold text-slate-800 dark:text-white">{memory.improvements.join(', ')}</span>!
            </p>
          </div>
        )}

        {memory.overdueRevisions.length > 0 && (
          <div className="flex items-start gap-3">
            <ClockIcon className="w-5 h-5 text-indigo-400 mt-0.5 shrink-0" />
            <p className="text-sm text-slate-600 dark:text-slate-300">
              It's been a while since you revised <span className="font-semibold text-slate-800 dark:text-white">{memory.overdueRevisions.join(', ')}</span>.
            </p>
          </div>
        )}
        
        {memory.struggles.length === 0 && memory.improvements.length === 0 && memory.overdueRevisions.length === 0 && (
           <p className="text-sm text-slate-500 italic">I am still gathering insights on your learning patterns. Keep studying!</p>
        )}
      </div>
    </motion.div>
  );
}

function ClockIcon(props: any) {
  return (
    <svg {...props} xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
  );
}
