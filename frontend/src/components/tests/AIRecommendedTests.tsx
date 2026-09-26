import { Brain, ArrowRight, Lightbulb, Sparkles, CheckCircle2 } from 'lucide-react';
import { cn } from '../../lib/utils';
import { useTheme } from '../../lib/ThemeContext';
import { useProgressReport } from '../../hooks/api/useQuizAttempts';
import { useLaunchTest } from '../../hooks/ai/useLaunchTest';
import { getExamConfig } from '../../lib/examPersonalization';

interface AIRecommendedTestsProps {
  selectedExam: string;
}

export function AIRecommendedTests({ selectedExam }: AIRecommendedTestsProps) {
  const { theme } = useTheme();
  const isDarkMode = theme === 'dark';
  const launch = useLaunchTest();
  const { report } = useProgressReport();
  const { examId, fallbackRecommendations } = getExamConfig(selectedExam);

  const weakSections = report?.weakSections || [];

  const recommendations = weakSections.length > 0
    ? weakSections.slice(0, 2).map(ws => ({
        title: `${ws.topic} Remedial Set`,
        topic: ws.topic,
        syllabusNodeId: ws.syllabusNodeId,
        examId: ws.examId,
        reason: `Accuracy is at ${Math.round(ws.accuracy)}% across your past attempts. Recommended 10-question drill.`,
        type: 'Weak Area Booster',
        count: 10,
      }))
    : fallbackRecommendations.map(rec => ({
        ...rec,
        syllabusNodeId: undefined as string | undefined,
        examId,
      }));

  return (
    <div className={cn(
      "rounded-xl border",
      isDarkMode ? "bg-white/[0.03] border-white/[0.07]" : "bg-white border-slate-200/80"
    )}>
      <div className="flex items-center gap-2 px-4 pt-4 pb-3 border-b border-slate-100 dark:border-white/[0.06]">
        <div className="w-6 h-6 rounded-md bg-slate-900 dark:bg-white flex items-center justify-center text-[#c8e558] dark:text-slate-900">
          <Brain className="w-3.5 h-3.5" />
        </div>
        <h2 className="text-[14px] font-semibold text-slate-900 dark:text-white">AI coach</h2>
        <span className="ml-auto text-[11px] font-medium text-slate-400 dark:text-slate-500">
          {weakSections.length > 0 ? 'From your weak areas' : `For ${selectedExam}`}
        </span>
      </div>

      <div className="divide-y divide-slate-100 dark:divide-white/[0.06]">
        {recommendations.map((rec, i) => (
          <div key={i} className="px-4 py-3.5 group">
            <div className="flex items-start gap-2.5">
              <Lightbulb className="w-3.5 h-3.5 mt-0.5 text-[#8ba32b] dark:text-[#c8e558] shrink-0" />
              <div className="flex-1 min-w-0">
                <h3 className="text-[13px] font-semibold text-slate-900 dark:text-white truncate">{rec.title}</h3>
                <p className="text-[12px] text-slate-500 dark:text-slate-400 mt-0.5 leading-relaxed">{rec.reason}</p>
                <div className="flex items-center justify-between mt-2.5">
                  <span className="text-[10.5px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded bg-slate-100 dark:bg-white/[0.06] text-slate-600 dark:text-slate-300">
                    {rec.type}
                  </span>
                  <button
                    onClick={() => launch({
                      topic: rec.topic, count: rec.count, mode: 'exam',
                      syllabusNodeId: rec.syllabusNodeId, examId: rec.examId,
                      isWeakAreaDrill: weakSections.length > 0,
                    })}
                    className="h-7 px-2.5 rounded-md text-[12px] font-semibold flex items-center gap-1 text-slate-900 dark:text-[#c8e558] hover:bg-slate-100 dark:hover:bg-white/[0.06] transition-colors cursor-pointer"
                  >
                    Start <ArrowRight className="w-3 h-3" />
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
