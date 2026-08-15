import { Brain, ArrowRight, Lightbulb, Sparkles, CheckCircle2 } from 'lucide-react';
import { cn } from '../../lib/utils';
import { useTheme } from '../../lib/ThemeContext';
import { useProgressReport } from '../../hooks/api/useQuizAttempts';
import { useLaunchTest } from '../../hooks/ai/useLaunchTest';

export function AIRecommendedTests() {
  const { theme } = useTheme();
  const isDarkMode = theme === 'dark';
  const launch = useLaunchTest();
  const { report } = useProgressReport();

  const weakSections = report?.weakSections || [];

  const recommendations = weakSections.length > 0
    ? weakSections.slice(0, 2).map(ws => ({
        title: `${ws.topic} Remedial Set`,
        topic: ws.topic,
        reason: `Accuracy is at ${Math.round(ws.accuracy)}% across your past attempts. Recommended 10-question drill.`,
        type: 'Weak Area Booster',
        count: 10,
      }))
    : [
        {
          title: 'Speed & Quantitative Diagnostic',
          topic: 'Quantitative Aptitude',
          reason: 'Calibrated to test your mental math calculation speed and time management.',
          type: 'Speed Drill',
          count: 10,
        },
        {
          title: 'High-Yield Reasoning Patterns',
          topic: 'Logical Reasoning',
          reason: 'Targeting high-frequency syllogisms, series, and puzzle arrangements.',
          type: 'Concept Focus',
          count: 10,
        }
      ];

  return (
    <div className="space-y-4 font-sans">
      <div className="flex items-center gap-2">
        <div className="w-6 h-6 rounded-lg bg-slate-900 dark:bg-white flex items-center justify-center text-[#c8e558] dark:text-slate-900 shadow-2xs">
          <Brain className="w-3.5 h-3.5" />
        </div>
        <h2 className="text-[17px] font-semibold text-slate-900 dark:text-white">
          AI Coach Recommendations
        </h2>
      </div>

      <div className="space-y-3">
        {recommendations.map((rec, i) => (
          <div 
            key={i}
            className={cn(
              "p-4 rounded-2xl border transition-all group",
              isDarkMode 
                ? "bg-white/[0.04] border-white/[0.07] shadow-xs hover:border-white/[0.14] hover:bg-white/[0.06]" 
                : "bg-white border-slate-200/90 shadow-xs hover:border-slate-300"
            )}
          >
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 rounded-xl bg-slate-100 dark:bg-white/5 flex items-center justify-center text-[#8ba32b] dark:text-[#c8e558] shrink-0 mt-0.5">
                <Lightbulb className="w-4 h-4" />
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="font-semibold text-[14px] text-slate-900 dark:text-white mb-1 group-hover:text-[#8ba32b] dark:group-hover:text-[#c8e558] transition-colors truncate">
                  {rec.title}
                </h3>
                <p className="text-[12px] text-slate-500 dark:text-slate-400 mb-3 leading-relaxed">
                  {rec.reason}
                </p>
                <div className="flex items-center justify-between pt-2 border-t border-slate-100 dark:border-white/5">
                  <span className="text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-md bg-slate-100 dark:bg-white/5 text-slate-600 dark:text-slate-300 border border-slate-200/80 dark:border-white/10">
                    {rec.type}
                  </span>
                  <button 
                    onClick={() => launch({ topic: rec.topic, count: rec.count, mode: 'exam' })}
                    className="text-[12px] font-semibold text-slate-900 dark:text-[#c8e558] flex items-center gap-1 hover:gap-1.5 transition-all cursor-pointer"
                  >
                    Start Test <ArrowRight className="w-3.5 h-3.5" />
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
