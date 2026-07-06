import { motion } from 'motion/react';
import { BriefingResponse } from '../../../../backend-firestore/src/types/briefing.types';
import { PlayCircle, BookOpen, ChevronRight } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

interface Props {
  data: BriefingResponse['continueLearning'];
  delay?: number;
}

export function ContinueLearningCard({ data, delay = 0.2 }: Props) {
  const navigate = useNavigate();

  const handleContinue = () => {
    if (data.lastNotebookId) {
      navigate(`/notebooks/${data.lastNotebookId}`);
    } else {
      navigate('/dashboard');
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay }}
      className="col-span-full md:col-span-4 lg:col-span-3 bg-white dark:bg-[#1f1f1f] border border-slate-200 dark:border-white/10 rounded-2xl p-6 shadow-sm flex flex-col justify-between"
    >
      <div>
        <div className="flex items-center gap-2 mb-4">
          <PlayCircle className="w-5 h-5 text-teal-600 dark:text-teal-400" />
          <h3 className="text-slate-800 dark:text-white font-bold text-lg">Continue Learning</h3>
        </div>
        
        <div className="bg-slate-50 dark:bg-[#1a1a1b] rounded-xl p-4 mb-4 border border-slate-100 dark:border-white/5">
          <div className="flex items-start gap-3">
            <div className="bg-white dark:bg-[#2a2a2b] p-2 rounded-lg shadow-sm border border-slate-200 dark:border-white/5">
              <BookOpen className="w-5 h-5 text-indigo-500" />
            </div>
            <div>
              <p className="text-sm font-semibold text-slate-900 dark:text-white leading-tight mb-1">
                {data.lastNotebookName}
              </p>
              {data.chapter && (
                <p className="text-xs text-slate-500 dark:text-slate-400 font-medium line-clamp-1">
                  {data.chapter} {data.topic ? `• ${data.topic}` : ''}
                </p>
              )}
            </div>
          </div>
        </div>

        <p className="text-sm text-slate-600 dark:text-slate-400 font-medium mb-6 italic">
          "{data.suggestion}"
        </p>
      </div>

      <button
        onClick={handleContinue}
        className="w-full bg-teal-600 hover:bg-teal-700 text-white font-bold py-3 px-4 rounded-xl transition-colors flex items-center justify-between group"
      >
        <span>Resume Session</span>
        <ChevronRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
      </button>
    </motion.div>
  );
}
