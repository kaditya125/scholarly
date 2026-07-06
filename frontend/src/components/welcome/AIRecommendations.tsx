import { motion } from 'motion/react';
import { BriefingResponse } from '../../../../backend-firestore/src/types/briefing.types';
import { ListTodo, CheckCircle2, Circle } from 'lucide-react';
import { useState } from 'react';

interface Props {
  recommendations: BriefingResponse['todayRecommendations'];
  delay?: number;
}

export function AIRecommendations({ recommendations, delay = 0.3 }: Props) {
  const [checked, setChecked] = useState<Record<string, boolean>>({});

  const toggleCheck = (id: string) => {
    setChecked(prev => ({ ...prev, [id]: !prev[id] }));
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay }}
      className="col-span-full lg:col-span-4 bg-white dark:bg-[#1f1f1f] border border-slate-200 dark:border-white/10 rounded-2xl p-6 shadow-sm"
    >
      <div className="flex items-center gap-2 mb-6">
        <ListTodo className="w-5 h-5 text-indigo-500" />
        <h3 className="text-slate-800 dark:text-white font-bold text-lg">Today's Focus</h3>
      </div>

      <div className="space-y-3">
        {recommendations.length > 0 ? (
          recommendations.map((rec, i) => (
            <motion.div
              key={rec.id || i}
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: delay + 0.1 + (i * 0.1) }}
              onClick={() => toggleCheck(rec.id)}
              className={`flex items-start gap-3 p-3 rounded-xl cursor-pointer transition-colors ${
                checked[rec.id] 
                  ? 'bg-slate-50 dark:bg-white/5 opacity-60' 
                  : 'bg-white dark:bg-[#252526] hover:bg-slate-50 dark:hover:bg-white/5 border border-slate-100 dark:border-white/5 shadow-sm'
              }`}
            >
              <div className="mt-0.5">
                {checked[rec.id] ? (
                  <CheckCircle2 className="w-5 h-5 text-teal-500" />
                ) : (
                  <Circle className="w-5 h-5 text-slate-300 dark:text-slate-600" />
                )}
              </div>
              <div className="flex-1">
                <p className={`font-semibold text-sm ${checked[rec.id] ? 'line-through text-slate-500 dark:text-slate-500' : 'text-slate-800 dark:text-slate-200'}`}>
                  {rec.title}
                </p>
                <div className="flex items-center gap-2 mt-1">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-indigo-500 bg-indigo-50 dark:bg-indigo-500/10 px-2 py-0.5 rounded-full">
                    {rec.type.replace('_', ' ')}
                  </span>
                  <span className="text-xs text-slate-500 dark:text-slate-400 font-medium">
                    ~{rec.estimatedMinutes} mins
                  </span>
                </div>
              </div>
            </motion.div>
          ))
        ) : (
          <p className="text-sm text-slate-500 dark:text-slate-400">No specific recommendations for today. Free study!</p>
        )}
      </div>
    </motion.div>
  );
}
