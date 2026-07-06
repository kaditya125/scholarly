import { Brain, ArrowRight, Lightbulb } from 'lucide-react';
import { cn } from '../../lib/utils';
import { useTheme } from '../../lib/ThemeContext';
import { useNavigate } from 'react-router-dom';

const recommendations = [
  {
    title: 'Geometry Basics Revision',
    reason: 'You struggled with Triangle properties in your last 3 attempts.',
    type: 'Revision Test',
    color: 'text-purple-500',
    bg: 'bg-purple-500/10'
  },
  {
    title: 'SSC CGL Previous Year (Shift 1)',
    reason: 'Your exam readiness score is 85%. Time for a full check.',
    type: 'Full Mock',
    color: 'text-emerald-500',
    bg: 'bg-emerald-500/10'
  }
];

export function AIRecommendedTests() {
  const { theme } = useTheme();
  const isDarkMode = theme === 'dark';
  const navigate = useNavigate();

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <Brain className="w-6 h-6 text-indigo-500" />
        <h2 className="text-2xl font-bold">AI Coach Recommendations</h2>
      </div>

      <div className="space-y-4">
        {recommendations.map((rec, i) => (
          <div 
            key={i}
            className={cn(
              "p-5 rounded-2xl border transition-all duration-300 hover:shadow-lg group",
              isDarkMode ? "bg-slate-900 border-slate-800" : "bg-white border-slate-200 shadow-sm"
            )}
          >
            <div className="flex items-start gap-4">
              <div className={cn("p-2.5 rounded-xl shrink-0 mt-1", rec.bg, rec.color)}>
                <Lightbulb className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-bold text-sm mb-1 group-hover:text-indigo-500 transition-colors">
                  {rec.title}
                </h3>
                <p className={cn("text-xs font-medium mb-3", isDarkMode ? "text-slate-400" : "text-slate-500")}>
                  {rec.reason}
                </p>
                <div className="flex items-center justify-between">
                  <span className={cn(
                    "text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded",
                    isDarkMode ? "bg-slate-800 text-slate-300" : "bg-slate-100 text-slate-600"
                  )}>
                    {rec.type}
                  </span>
                  <button 
                    onClick={() => navigate('/test', { state: { mode: 'exam' } })}
                    className="text-xs font-bold text-indigo-500 flex items-center gap-1 group-hover:gap-2 transition-all"
                  >
                    Start <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
