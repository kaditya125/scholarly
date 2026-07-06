import { Clock, PlayCircle } from 'lucide-react';
import { cn } from '../../lib/utils';
import { useTheme } from '../../lib/ThemeContext';
import { useNavigate } from 'react-router-dom';

export function ContinueLearning() {
  const { theme } = useTheme();
  const isDarkMode = theme === 'dark';
  const navigate = useNavigate();

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold flex items-center gap-2">
        Continue Learning
      </h2>
      <div className={cn(
        "p-6 rounded-[24px] border flex flex-col sm:flex-row justify-between items-start sm:items-center gap-6",
        isDarkMode ? "bg-slate-900 border-slate-800" : "bg-white border-slate-200 shadow-sm"
      )}>
        <div className="flex-1 w-full">
          <div className="flex items-center gap-3 mb-2">
            <h3 className="text-lg font-bold">SSC CGL Mock Test #18</h3>
            <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-1 bg-amber-500/10 text-amber-600 rounded">
              Paused
            </span>
          </div>
          <div className="flex items-center gap-4 text-sm font-medium mb-4">
            <span className={isDarkMode ? "text-slate-400" : "text-slate-500"}>Full Length Test</span>
            <span className={cn("flex items-center gap-1.5", isDarkMode ? "text-slate-400" : "text-slate-500")}>
              <Clock className="w-4 h-4 text-amber-500" />
              25 mins remaining
            </span>
          </div>
          <div className="w-full h-2 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
            <div className="h-full bg-amber-500 w-[53%]" />
          </div>
          <div className="mt-2 text-xs font-bold text-amber-500">53% Completed</div>
        </div>
        
        <button 
          onClick={() => navigate('/test', { state: { mode: 'exam' } })}
          className="w-full sm:w-auto px-8 py-3 bg-slate-900 hover:bg-slate-800 dark:bg-slate-100 dark:hover:bg-white dark:text-slate-900 text-white rounded-xl font-bold flex items-center justify-center gap-2 transition-colors shrink-0"
        >
          <PlayCircle className="w-5 h-5" />
          Resume Now
        </button>
      </div>
    </div>
  );
}
