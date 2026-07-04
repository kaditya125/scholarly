import { useState, useEffect } from "react";
import { useLocation, Link, Navigate } from "react-router-dom";
import { CheckCircle2, ChevronRight, Check, Sparkles, Loader2 } from "lucide-react";
import { cn } from "../lib/utils";
import { useQuiz } from "../hooks/ai/useQuiz";

interface ReportState {
  score: number;
  total: number;
  answers: Record<string, number>;
  timeSpentSeconds: number;
}

export default function Report() {
  const location = useLocation();
  const state = location.state as ReportState | undefined;

  const [aiAnalysis, setAiAnalysis] = useState<string | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);

  const { questions: mockQuestions, isLoading } = useQuiz();

  useEffect(() => {
    if (!state || isLoading || mockQuestions.length === 0) return;

    async function fetchAnalysis() {
      setIsAnalyzing(true);
      
      const topics: Record<string, { correct: number, total: number }> = {};
      mockQuestions.forEach(q => {
        if (!topics[q.topic]) {
          topics[q.topic] = { correct: 0, total: 0 };
        }
        topics[q.topic].total++;
        if (state!.answers[q.id] === q.correctAnswerIndex) {
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
            score: state!.score,
            total: state!.total,
            timeSpent: state!.timeSpentSeconds,
            strongTopics,
            weakTopics
          })
        });
        const data = await res.json();
        setAiAnalysis(data.analysis);
      } catch (err) {
        console.error(err);
        setAiAnalysis("Failed to load AI Insights.");
      } finally {
        setIsAnalyzing(false);
      }
    }
    
    fetchAnalysis();
  }, [state, isLoading, mockQuestions]);

  if (!state) {
    return <Navigate to="/dashboard" replace />;
  }

  if (isLoading) {
    return (
      <div className="w-full h-full flex items-center justify-center bg-white dark:bg-[#131314]">
        <Loader2 className="w-8 h-8 animate-spin text-indigo-500" />
      </div>
    );
  }

  const { score, total, answers, timeSpentSeconds } = state;
  const gradePercentage = Math.round((score / total) * 100);
  const isPassed = gradePercentage >= 60;
  
  const today = new Date();
  const dateStr = today.toLocaleDateString('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true
  });

  const formatTime = (secs: number) => {
    const mins = Math.floor(secs / 60);
    const s = secs % 60;
    return `${mins} mins ${s} secs`;
  };

  return (
    <div className="w-full h-full overflow-y-auto px-8 pb-12 pt-4 bg-white dark:bg-[#131314] transition-colors duration-300 custom-scrollbar">
      <div className="max-w-[850px] mx-auto text-slate-800 dark:text-slate-100">
        
        {/* Breadcrumbs */}
        <div className="flex items-center gap-2 text-[13px] text-slate-500 dark:text-slate-400 mb-8 font-medium">
          <Link to="/dashboard" className="hover:text-slate-800 dark:hover:text-slate-200 transition-colors">Dashboard</Link>
          <ChevronRight className="w-3.5 h-3.5" />
          <Link to="/tests" className="hover:text-slate-800 dark:hover:text-slate-200 transition-colors">My courses</Link>
          <ChevronRight className="w-3.5 h-3.5" />
          <span className="truncate">Mock Test Series</span>
          <ChevronRight className="w-3.5 h-3.5 shrink-0" />
          <span className="text-slate-700 dark:text-slate-300">Detailed Report</span>
        </div>

        <h1 className="text-[28px] font-light text-[#aab3bc] dark:text-slate-500 mb-8 uppercase tracking-wide">
          TEST RESULTS
        </h1>

        {/* Summary Card */}
        <div className="bg-[#eef5f9] dark:bg-[#1f1f1f] border border-transparent dark:border-white/10 p-6 flex flex-wrap gap-12 mb-8 rounded-lg shadow-sm">
          <div className="flex items-start gap-3">
             <div className="mt-0.5">
               <CheckCircle2 className="w-6 h-6 text-green-500" />
             </div>
             <div>
               <div className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest mb-0.5">Status</div>
               <div className="font-bold text-sm text-slate-800 dark:text-slate-100 uppercase">{isPassed ? "PASSED" : "FAILED"}</div>
             </div>
          </div>
          <div>
            <div className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest mb-0.5">Completion Date</div>
            <div className="font-bold text-sm text-slate-800 dark:text-slate-100 uppercase">{today.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}</div>
          </div>
          <div>
            <div className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest mb-0.5">Requirement</div>
            <div className="font-bold text-sm text-slate-800 dark:text-slate-100 uppercase">Minimum grade 60%</div>
          </div>
        </div>

        {/* AI Key Takeaways */}
        <div className="mb-8 p-6 rounded-lg bg-gradient-to-r from-indigo-50 to-purple-50 dark:from-indigo-900/20 dark:to-purple-900/20 border border-indigo-100 dark:border-indigo-800/50 shadow-sm relative overflow-hidden">
           <div className="absolute top-0 right-0 p-4 opacity-10">
             <Sparkles className="w-24 h-24 text-indigo-500" />
           </div>
           <div className="flex items-center gap-3 mb-4 relative z-10">
             <div className="w-8 h-8 rounded bg-indigo-100 dark:bg-indigo-800/50 flex items-center justify-center text-indigo-600 dark:text-indigo-400">
               <Sparkles className="w-5 h-5" />
             </div>
             <h2 className="text-[18px] font-bold text-slate-900 dark:text-white">AI Key Takeaways</h2>
           </div>
           <div className="text-[15px] leading-relaxed text-slate-700 dark:text-slate-300 relative z-10 font-medium">
             {isAnalyzing ? (
               <div className="flex items-center gap-2 text-indigo-600 dark:text-indigo-400">
                 <Loader2 className="w-4 h-4 animate-spin" /> Analyzing your performance...
               </div>
             ) : (
               <p>{aiAnalysis}</p>
             )}
           </div>
        </div>

        {/* Details Table */}
        <div className="border-t border-b border-slate-200 dark:border-white/10 text-[14px]">
          <div className="flex px-4 py-3 border-b border-slate-100 dark:border-white/5 last:border-none hover:bg-slate-50 dark:hover:bg-white/5">
             <div className="w-40 font-bold text-slate-700 dark:text-slate-300 text-right pr-6">Started on</div>
             <div className="flex-1 text-slate-600 dark:text-slate-400">{dateStr}</div>
          </div>
          <div className="flex px-4 py-3 border-b border-slate-100 dark:border-white/5 last:border-none hover:bg-slate-50 dark:hover:bg-white/5">
             <div className="w-40 font-bold text-slate-700 dark:text-slate-300 text-right pr-6">State</div>
             <div className="flex-1 text-slate-600 dark:text-slate-400">Finished</div>
          </div>
          <div className="flex px-4 py-3 border-b border-slate-100 dark:border-white/5 last:border-none hover:bg-slate-50 dark:hover:bg-white/5">
             <div className="w-40 font-bold text-slate-700 dark:text-slate-300 text-right pr-6">Completed on</div>
             <div className="flex-1 text-slate-600 dark:text-slate-400">{dateStr}</div>
          </div>
          <div className="flex px-4 py-3 border-b border-slate-100 dark:border-white/5 last:border-none hover:bg-slate-50 dark:hover:bg-white/5">
             <div className="w-40 font-bold text-slate-700 dark:text-slate-300 text-right pr-6">Time taken</div>
             <div className="flex-1 text-slate-600 dark:text-slate-400">{formatTime(timeSpentSeconds)}</div>
          </div>
          <div className="flex px-4 py-3 border-b border-slate-100 dark:border-white/5 last:border-none hover:bg-slate-50 dark:hover:bg-white/5">
             <div className="w-40 font-bold text-slate-700 dark:text-slate-300 text-right pr-6">Marks</div>
             <div className="flex-1 text-slate-600 dark:text-slate-400">{score.toFixed(2)}/{total.toFixed(2)}</div>
          </div>
          <div className="flex px-4 py-3 border-b border-slate-100 dark:border-white/5 last:border-none hover:bg-slate-50 dark:hover:bg-white/5">
             <div className="w-40 font-bold text-slate-700 dark:text-slate-300 text-right pr-6">Grade</div>
             <div className="flex-1 text-slate-600 dark:text-slate-400 font-bold">{((score/total) * 10).toFixed(2)} out of 10.00 ({gradePercentage}%)</div>
          </div>
        </div>

        {/* Questions List */}
        <div className="mt-12 space-y-12">
          {mockQuestions.map((q, idx) => {
            const userAnswer = answers[q.id];
            const isCorrect = userAnswer === q.correctAnswerIndex;
            const isUnanswered = userAnswer === undefined;
            const statusLabel = isUnanswered ? "UNANSWERED" : (isCorrect ? "CORRECT" : "INCORRECT");
            
            let statusColor = "bg-slate-500 text-white dark:bg-slate-600"; // default for unanswered
            let borderColor = "border-slate-300 dark:border-slate-700";
            let tagColor = "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300";
            
            if (!isUnanswered) {
              if (isCorrect) {
                statusColor = "bg-green-500 text-white dark:bg-green-600";
                borderColor = "border-green-500 dark:border-green-600";
                tagColor = "bg-green-50 text-green-700 border border-green-200 dark:bg-green-900/30 dark:text-green-400 dark:border-green-800/50";
              } else {
                statusColor = "bg-red-500 text-white dark:bg-rose-600";
                borderColor = "border-red-500 dark:border-rose-600";
                tagColor = "bg-rose-50 text-rose-700 border border-rose-200 dark:bg-rose-900/30 dark:text-rose-400 dark:border-rose-800/50";
              }
            }

            return (
              <div key={q.id}>
                {/* Question Header */}
                <div className="mb-4">
                  <h3 className="text-xl font-light text-slate-600 dark:text-slate-400 mb-3 flex items-end gap-2">
                    Question <span className="text-2xl font-semibold text-slate-800 dark:text-slate-200 leading-none">{idx + 1}</span>
                  </h3>
                  <div className="flex items-center gap-4 text-[13px] font-medium">
                    <span className={cn("px-2 py-0.5 rounded text-[10px] font-bold tracking-wider", statusColor)}>
                      {statusLabel}
                    </span>
                    <span className="text-slate-600 dark:text-slate-400">
                      Mark {isCorrect ? "1.00" : "0.00"} out of 1.00
                    </span>
                  </div>
                </div>

                {/* Question Body */}
                <div className={cn("p-6 border-2 rounded bg-white dark:bg-[#1f1f1f] shadow-sm mb-1 transition-colors", borderColor)}>
                  <div className="font-bold text-[15px] text-slate-800 dark:text-slate-200 mb-6 font-sans">
                    {q.text}
                  </div>
                  
                  <div className="text-[13px] text-slate-600 dark:text-slate-400 mb-4">Select one:</div>
                  
                  <div className="space-y-4 text-[14px]">
                    {q.options.map((opt, optIdx) => {
                      const isSelected = optIdx === userAnswer;
                      const isThisCorrectOpt = optIdx === q.correctAnswerIndex;
                      
                      return (
                        <div key={optIdx} className="flex items-center group relative">
                           <input 
                              type="radio" 
                              disabled
                              checked={isSelected}
                              className="w-4 h-4 mt-0.5 shrink-0 accent-slate-600 dark:accent-slate-400 cursor-not-allowed"
                           />
                           <label className={cn("ml-3 text-slate-700 dark:text-slate-300 cursor-not-allowed", isThisCorrectOpt && "font-medium")}>
                             {String.fromCharCode(97 + optIdx)}. {opt}
                           </label>
                           {isThisCorrectOpt && (
                             <div className="absolute right-0 flex items-center justify-center">
                               <Check className="w-5 h-5 text-green-500 dark:text-green-400" />
                             </div>
                           )}
                        </div>
                      )
                    })}
                  </div>
                </div>

                {/* Feedback Section */}
                <div className="bg-[#fff9e6] dark:bg-yellow-900/10 rounded p-5 text-[14px] text-slate-800 dark:text-slate-200 border border-[#f5e6b3] dark:border-yellow-700/30 transition-colors">
                   <div className="font-bold mb-3 text-[15px]">
                     {isUnanswered 
                       ? "You did not answer this question."
                       : (isCorrect ? "Your answer is correct." : "Your answer is incorrect.")}
                   </div>
                   {userAnswer !== undefined && (
                     <div className="mb-3">
                       You have selected option {userAnswer + 1}.
                     </div>
                   )}
                   <p className="mb-4">{q.explanation}</p>
                   <p className="text-slate-600 dark:text-slate-400">The correct answer is: {q.options[q.correctAnswerIndex]}</p>
                </div>
              </div>
            );
          })}
        </div>

      </div>
    </div>
  );
}
