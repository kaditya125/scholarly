import { useState, useEffect } from "react";
import { useLocation, Link, Navigate, useNavigate } from "react-router-dom";
import { CheckCircle2, ChevronRight, Check, Sparkles, Loader2, ArrowLeft, RotateCcw, Clock, Award, Target, HelpCircle } from "lucide-react";
import { cn } from "../lib/utils";
import { useQuiz } from "../hooks/ai/useQuiz";
import { useQuizAttempt } from "../hooks/api/useQuizAttempts";
import { useLaunchTest } from "../hooks/ai/useLaunchTest";

interface ReportState {
  score?: number;
  total?: number;
  answers?: Record<string, number>;
  timeSpentSeconds?: number;
  attemptId?: string;
  questions?: Array<{
    id: string;
    text: string;
    topic: string;
    options: string[];
    correctAnswerIndex: number;
    explanation: string;
  }>;
}

export default function Report() {
  const location = useLocation();
  const navigate = useNavigate();
  const launch = useLaunchTest();
  const state = location.state as ReportState | undefined;

  // Support direct state OR fetching completed attempt by attemptId
  const { attempt: fetchedAttempt, isLoading: isAttemptLoading } = useQuizAttempt(state?.attemptId);

  const [aiAnalysis, setAiAnalysis] = useState<string | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);

  const { questions: legacyQuestions, isLoading: isLegacyLoading } = useQuiz();

  const questions = state?.questions || fetchedAttempt?.questions || legacyQuestions || [];
  const score = state?.score ?? fetchedAttempt?.score ?? 0;
  const total = state?.total ?? fetchedAttempt?.totalQuestions ?? (questions.length || 1);
  const answers = state?.answers ?? fetchedAttempt?.answers ?? {};
  const timeSpentSeconds = state?.timeSpentSeconds ?? fetchedAttempt?.timeSpentSeconds ?? 0;

  const isLoading = isAttemptLoading || (isLegacyLoading && !state?.questions && !fetchedAttempt);

  useEffect(() => {
    if (!state && !fetchedAttempt) return;
    if (isLoading || questions.length === 0) return;

    async function fetchAnalysis() {
      setIsAnalyzing(true);
      
      const topics: Record<string, { correct: number, total: number }> = {};
      questions.forEach(q => {
        if (!topics[q.topic]) {
          topics[q.topic] = { correct: 0, total: 0 };
        }
        topics[q.topic].total++;
        if (answers[q.id] === q.correctAnswerIndex) {
          topics[q.topic].correct++;
        }
      });
      
      const strongTopics = Object.keys(topics).filter(t => topics[t].correct / topics[t].total >= 0.7);
      const weakTopics = Object.keys(topics).filter(t => topics[t].correct / topics[t].total < 0.5);

      try {
        const res = await fetch("/api/analyze-test", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            score,
            total,
            timeSpent: timeSpentSeconds,
            strongTopics,
            weakTopics
          })
        });
        if (res.ok) {
          const data = await res.json();
          setAiAnalysis(data.analysis);
        } else {
          setAiAnalysis("Solid practice session. Review your incorrect answers below to master the underlying concepts.");
        }
      } catch (err) {
        setAiAnalysis("Solid practice session. Review your incorrect answers below to master the underlying concepts.");
      } finally {
        setIsAnalyzing(false);
      }
    }
    
    fetchAnalysis();
  }, [state, fetchedAttempt, isLoading, questions.length]);

  if (!state && !fetchedAttempt && !isLoading) {
    return <Navigate to="/tests" replace />;
  }

  if (isLoading) {
    return (
      <div className="w-full h-full flex items-center justify-center bg-[#fafbfc] dark:bg-[#0b0b0c]">
        <Loader2 className="w-8 h-8 animate-spin text-[#8ba32b] dark:text-[#c8e558]" />
      </div>
    );
  }

  const gradePercentage = Math.round((score / (total || 1)) * 100);
  const isPassed = gradePercentage >= 60;

  const formatTime = (secs: number) => {
    const mins = Math.floor(secs / 60);
    const s = secs % 60;
    return `${mins}m ${s}s`;
  };

  return (
    <div className="w-full h-full overflow-y-auto px-4 sm:px-8 pb-16 pt-6 bg-[#fafbfc] dark:bg-[#0b0b0c] transition-colors duration-300 custom-scrollbar font-sans">
      <div className="max-w-4xl mx-auto text-slate-800 dark:text-slate-100">
        
        {/* Breadcrumbs & Navigation */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-2 text-[13px] text-slate-500 dark:text-slate-400 font-medium">
            <Link to="/tests" className="hover:text-slate-800 dark:hover:text-white transition-colors flex items-center gap-1">
              <ArrowLeft className="w-3.5 h-3.5" /> Test Center
            </Link>
            <ChevronRight className="w-3.5 h-3.5 text-slate-400" />
            <span className="text-slate-900 dark:text-white font-semibold">Test Performance Report</span>
          </div>

          <button
            onClick={() => launch({ count: total, mode: 'exam', topic: fetchedAttempt?.topic || 'Practice Retake' })}
            className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white dark:bg-[#c8e558] dark:hover:bg-[#bcd94c] dark:text-slate-900 rounded-xl text-[12.5px] font-semibold flex items-center gap-1.5 transition-all cursor-pointer shadow-xs active:scale-98"
          >
            <RotateCcw className="w-3.5 h-3.5" /> Retake Test
          </button>
        </div>

        {/* Hero Scorecard Card */}
        <div className="p-6 sm:p-8 rounded-2xl border border-slate-200/90 dark:border-white/10 bg-white dark:bg-[#111113] shadow-xs mb-6">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6 pb-6 border-b border-slate-100 dark:border-white/5">
            <div>
              <span className={cn(
                "inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold uppercase tracking-wider mb-2",
                isPassed 
                  ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20" 
                  : "bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20"
              )}>
                <CheckCircle2 className="w-3.5 h-3.5" />
                {isPassed ? "Target Achieved" : "Needs Review"}
              </span>
              <h1 className="text-2xl sm:text-[28px] font-semibold text-slate-900 dark:text-white tracking-[-0.02em]">
                {fetchedAttempt?.title || "AI Practice Assessment"}
              </h1>
              <p className="text-[13.5px] text-slate-500 dark:text-slate-400 mt-1">
                Completed in {formatTime(timeSpentSeconds)} • Evaluated against latest marking scheme
              </p>
            </div>

            <div className="flex items-center gap-3">
              <div className="w-20 h-20 rounded-2xl bg-slate-900 text-[#c8e558] dark:bg-white dark:text-slate-900 flex flex-col items-center justify-center shadow-xs">
                <span className="text-[26px] font-bold leading-none">{gradePercentage}%</span>
                <span className="text-[10px] uppercase font-semibold tracking-wider mt-1 opacity-80">Score</span>
              </div>
            </div>
          </div>

          {/* Quick Metrics Bar */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 pt-6">
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500 mb-1">Score</div>
              <div className="text-[18px] font-semibold text-slate-900 dark:text-white">{score} / {total}</div>
            </div>
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500 mb-1">Accuracy</div>
              <div className="text-[18px] font-semibold text-emerald-600 dark:text-emerald-400">{gradePercentage}%</div>
            </div>
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500 mb-1">Time Spent</div>
              <div className="text-[18px] font-semibold text-slate-900 dark:text-white">{formatTime(timeSpentSeconds)}</div>
            </div>
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500 mb-1">Avg Speed</div>
              <div className="text-[18px] font-semibold text-slate-900 dark:text-white">{Math.round(timeSpentSeconds / (total || 1))}s / Q</div>
            </div>
          </div>
        </div>

        {/* AI Key Insights */}
        <div className="mb-8 p-5 rounded-2xl bg-white dark:bg-[#111113] border border-slate-200/90 dark:border-white/10 shadow-xs relative overflow-hidden">
          <div className="flex items-center gap-2.5 mb-2.5">
            <div className="w-7 h-7 rounded-lg bg-slate-900 dark:bg-white flex items-center justify-center text-[#c8e558] dark:text-slate-900 shadow-2xs">
              <Sparkles className="w-4 h-4" />
            </div>
            <h2 className="text-[15px] font-semibold text-slate-900 dark:text-white">AI Coach Insights & Recommendations</h2>
          </div>
          <div className="text-[13.5px] leading-relaxed text-slate-600 dark:text-slate-300 font-normal">
            {isAnalyzing ? (
              <div className="flex items-center gap-2 text-slate-500">
                <Loader2 className="w-4 h-4 animate-spin text-[#8ba32b] dark:text-[#c8e558]" /> Generating detailed diagnostic insights...
              </div>
            ) : (
              <p>{aiAnalysis}</p>
            )}
          </div>
        </div>

        {/* Question by Question Review */}
        <div className="space-y-4">
          <h2 className="text-[18px] font-semibold text-slate-900 dark:text-white mb-2">
            Detailed Solution & Question Breakdown ({questions.length})
          </h2>

          {questions.map((q, idx) => {
            const userAnswer = answers[q.id];
            const isCorrect = userAnswer === q.correctAnswerIndex;
            const isUnanswered = userAnswer === undefined;
            
            return (
              <div 
                key={q.id || idx}
                className={cn(
                  "p-5 rounded-2xl border transition-all bg-white dark:bg-[#111113] shadow-xs",
                  isUnanswered 
                    ? "border-slate-200/80 dark:border-white/10" 
                    : isCorrect 
                      ? "border-emerald-500/30 dark:border-emerald-500/20" 
                      : "border-rose-500/30 dark:border-rose-500/20"
                )}
              >
                {/* Header */}
                <div className="flex items-center justify-between gap-3 mb-3">
                  <div className="flex items-center gap-2">
                    <span className="text-[13px] font-semibold text-slate-900 dark:text-white">
                      Question {idx + 1}
                    </span>
                    {q.topic && (
                      <span className="text-[11px] font-medium px-2 py-0.5 rounded-md bg-slate-100 dark:bg-white/5 text-slate-600 dark:text-slate-400">
                        {q.topic}
                      </span>
                    )}
                  </div>
                  <span className={cn(
                    "text-[11px] font-semibold px-2.5 py-0.5 rounded-md",
                    isUnanswered 
                      ? "bg-slate-100 text-slate-600 dark:bg-white/5 dark:text-slate-400" 
                      : isCorrect 
                        ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20" 
                        : "bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20"
                  )}>
                    {isUnanswered ? "Unanswered" : isCorrect ? "Correct (+1.0)" : "Incorrect (-0.25)"}
                  </span>
                </div>

                {/* Question Stem */}
                <p className="text-[14.5px] font-medium text-slate-900 dark:text-white mb-4 leading-relaxed">
                  {q.text}
                </p>

                {/* Options */}
                <div className="space-y-2 mb-4">
                  {q.options.map((opt, optIdx) => {
                    const isSelected = optIdx === userAnswer;
                    const isThisCorrect = optIdx === q.correctAnswerIndex;
                    
                    return (
                      <div 
                        key={optIdx}
                        className={cn(
                          "flex items-center justify-between p-3 rounded-xl border text-[13.5px] font-medium transition-colors",
                          isThisCorrect
                            ? "bg-emerald-500/10 border-emerald-500/40 text-emerald-900 dark:text-emerald-300 font-semibold"
                            : isSelected
                              ? "bg-rose-500/10 border-rose-500/40 text-rose-900 dark:text-rose-300"
                              : "bg-slate-50/70 dark:bg-white/[0.02] border-slate-200/70 dark:border-white/5 text-slate-700 dark:text-slate-300"
                        )}
                      >
                        <div className="flex items-center gap-3">
                          <span className="w-5 h-5 rounded-full bg-black/5 dark:bg-white/10 flex items-center justify-center text-[11px] font-bold shrink-0">
                            {String.fromCharCode(65 + optIdx)}
                          </span>
                          <span>{opt}</span>
                        </div>
                        {isThisCorrect && (
                          <Check className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                        )}
                      </div>
                    );
                  })}
                </div>

                {/* Explanation Drawer */}
                {q.explanation && (
                  <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-white/[0.03] border border-slate-200/80 dark:border-white/10 text-[13px] text-slate-600 dark:text-slate-300 leading-relaxed">
                    <span className="font-semibold text-slate-900 dark:text-white block mb-1">Explanation:</span>
                    {q.explanation}
                  </div>
                )}
              </div>
            );
          })}
        </div>

      </div>
    </div>
  );
}
