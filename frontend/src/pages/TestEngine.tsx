import { useState, useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Clock, Info, CheckSquare, List, BookmarkPlus, Bookmark, ChevronRight, ChevronLeft, Target, Moon, Sun, Bot, X, Send, Loader2, Play } from "lucide-react";
import { motion } from "motion/react";
import { cn } from "../lib/utils";
import { useTheme } from "../lib/ThemeContext";
import { useQuiz } from "../hooks/ai/useQuiz";
import { useAuth } from "../lib/AuthContext";

export default function TestEngine() {
  const location = useLocation();
  const navigate = useNavigate();
  const { theme, toggleTheme } = useTheme();
  const { user } = useAuth();
  const isDarkMode = theme === 'dark';
  
  // Mode: "exam" or "study"
  const mode = location.state?.mode || 'exam';
  const testTitle = location.state?.topic || location.state?.notebookTitle || 'AI Mock Practice Exam';
  const isStudyMode = mode === 'study';
  const { questions: mockQuestions, isLoading, submitQuiz } = useQuiz();
  
  const [currentQIndex, setCurrentQIndex] = useState(() => {
    const saved = sessionStorage.getItem('testEngine_currentQIndex');
    return saved ? parseInt(saved, 10) : 0;
  });
  const [answers, setAnswers] = useState<Record<string, number>>(() => {
    const saved = sessionStorage.getItem('testEngine_answers');
    return saved ? JSON.parse(saved) : {};
  });
  const [markedForReview, setMarkedForReview] = useState<Set<string>>(() => {
    const saved = sessionStorage.getItem('testEngine_marked');
    return saved ? new Set(JSON.parse(saved)) : new Set();
  });
  const [bookmarked, setBookmarked] = useState<Set<string>>(() => {
    const saved = sessionStorage.getItem('testEngine_bookmarked');
    return saved ? new Set(JSON.parse(saved)) : new Set();
  });
  const [timeLeft, setTimeLeft] = useState(() => {
    const savedEndDate = sessionStorage.getItem('testEngine_endDate');
    if (savedEndDate) {
      const remaining = Math.floor((parseInt(savedEndDate, 10) - Date.now()) / 1000);
      return remaining > 0 ? remaining : 0;
    }
    return 30 * 60;
  }); // 30 minutes
  const [isPaletteOpen, setIsPaletteOpen] = useState(true);
  const [showSubmitModal, setShowSubmitModal] = useState(false);
  const [isAiHelperOpen, setIsAiHelperOpen] = useState(false);
  const [showWarning, setShowWarning] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const studentName = user?.displayName || user?.email?.split('@')[0] || 'Scholar';

  useEffect(() => {
    const savedEndDate = sessionStorage.getItem('testEngine_endDate');
    if (!savedEndDate && timeLeft > 0) {
      sessionStorage.setItem('testEngine_endDate', (Date.now() + timeLeft * 1000).toString());
    }

    const timer = setInterval(() => {
      setTimeLeft(prev => {
        if (prev === 5 * 60 + 1) { // Will become 5 minutes exactly
          setShowWarning(true);
          setTimeout(() => setShowWarning(false), 5000);
        }
        if (prev <= 1) {
          clearInterval(timer);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    sessionStorage.setItem('testEngine_currentQIndex', currentQIndex.toString());
  }, [currentQIndex]);

  useEffect(() => {
    sessionStorage.setItem('testEngine_answers', JSON.stringify(answers));
  }, [answers]);

  useEffect(() => {
    sessionStorage.setItem('testEngine_marked', JSON.stringify(Array.from(markedForReview)));
  }, [markedForReview]);

  useEffect(() => {
    sessionStorage.setItem('testEngine_bookmarked', JSON.stringify(Array.from(bookmarked)));
  }, [bookmarked]);

  const handleSubmit = async () => {
    setIsSubmitting(true);
    sessionStorage.removeItem('testEngine_currentQIndex');
    sessionStorage.removeItem('testEngine_answers');
    sessionStorage.removeItem('testEngine_marked');
    sessionStorage.removeItem('testEngine_bookmarked');
    sessionStorage.removeItem('testEngine_endDate');
    
    let score = 0;
    mockQuestions.forEach(q => {
      if (answers[q.id] === q.correctAnswerIndex) {
        score++;
      }
    });

    const timeSpentSeconds = Math.max(1, (30 * 60) - timeLeft);

    try {
      await submitQuiz({ answers, timeSpent: timeSpentSeconds });
    } catch (err) {
      console.warn("Quiz submission sync fallback:", err);
    }

    navigate("/report", { 
      state: { 
        score, 
        total: mockQuestions.length, 
        answers,
        timeSpentSeconds,
        questions: mockQuestions
      } 
    });
  };

  useEffect(() => {
    if (timeLeft === 0) {
      handleSubmit();
    }
  }, [timeLeft]);

  if (isLoading) {
    return (
      <div className="w-full h-screen flex flex-col items-center justify-center bg-[#fafbfc] dark:bg-[#0b0b0c] font-sans">
        <Loader2 className="w-8 h-8 animate-spin text-[#8ba32b] dark:text-[#c8e558] mb-3" />
        <p className="text-[14px] text-slate-500 font-medium">Generating calibrated exam questions with Gemini AI...</p>
      </div>
    );
  }

  if (!mockQuestions || mockQuestions.length === 0) {
    return (
      <div className="w-full h-screen flex flex-col items-center justify-center bg-[#fafbfc] dark:bg-[#0b0b0c] text-slate-500 font-sans p-6 text-center">
        <h2 className="text-[18px] font-semibold text-slate-900 dark:text-white mb-1.5">No Active Practice Test</h2>
        <p className="text-[13.5px] max-w-sm mb-4">Please return to the Test Center to start or generate a mock test.</p>
        <button 
          onClick={() => navigate('/tests')} 
          className="px-5 py-2.5 bg-slate-900 hover:bg-slate-800 text-white dark:bg-[#c8e558] dark:hover:bg-[#bcd94c] dark:text-slate-900 rounded-xl text-[13px] font-semibold transition-all shadow-xs"
        >
          Go to Test Center
        </button>
      </div>
    );
  }

  const currentQ = mockQuestions[currentQIndex] || mockQuestions[0];

  const formatTime = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  const handleOptionSelect = (optionIndex: number) => {
    setAnswers(prev => ({ ...prev, [currentQ.id]: optionIndex }));
  };

  const handleNext = () => {
    if (currentQIndex < mockQuestions.length - 1) {
      setCurrentQIndex(currentQIndex + 1);
    }
  };

  const handlePrev = () => {
    if (currentQIndex > 0) {
      setCurrentQIndex(currentQIndex - 1);
    }
  };

  const toggleReview = () => {
    setMarkedForReview(prev => {
      const newMap = new Set(prev);
      if (newMap.has(currentQ.id)) newMap.delete(currentQ.id);
      else newMap.add(currentQ.id);
      return newMap;
    });
  };

  const toggleBookmark = () => {
    setBookmarked(prev => {
      const newMap = new Set(prev);
      if (newMap.has(currentQ.id)) newMap.delete(currentQ.id);
      else newMap.add(currentQ.id);
      return newMap;
    });
  };

  // Prevent accidental exits
  useEffect(() => {
    const blockExit = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', blockExit);
    return () => window.removeEventListener('beforeunload', blockExit);
  }, []);

  return (
    <motion.div 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className={cn("fixed inset-0 z-50 flex flex-col font-sans transition-colors duration-300", isDarkMode ? "bg-[#0b0b0c] text-slate-100" : "bg-[#fafbfc] text-slate-900")}
    >
      {/* 5-minute Warning Toast */}
      {showWarning && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 z-[100] animate-in fade-in slide-in-from-top-4 duration-300">
          <div className="bg-rose-600 text-white px-5 py-2.5 rounded-xl shadow-lg text-[13px] font-semibold flex items-center gap-2.5">
            <Clock className="w-4 h-4" />
            Warning: Only 5 minutes remaining in this test!
          </div>
        </div>
      )}

      {/* Header - Modern Minimal CBT Style */}
      <header className={cn(
        "h-16 border-b flex items-center justify-between px-4 sm:px-6 shrink-0 relative transition-colors duration-300",
        isDarkMode ? "bg-[#111113] border-white/10" : "bg-white border-slate-200/80"
      )}>
        {/* Progress Bar Top */}
        <div className="absolute bottom-0 left-0 h-0.5 bg-slate-100 dark:bg-white/5 w-full overflow-hidden z-10">
          <div 
            className="h-full bg-[#c8e558] transition-all duration-300 ease-out" 
            style={{ width: `${(Object.keys(answers).length / mockQuestions.length) * 100}%` }}
          />
        </div>

        <div className="flex items-center gap-3 min-w-0">
          <button 
            className="md:hidden p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-white/5"
            onClick={() => setIsPaletteOpen(!isPaletteOpen)}
            aria-label="Toggle Question Palette"
          >
            <List className="w-4.5 h-4.5" />
          </button>
          
          <div className="w-8 h-8 rounded-lg bg-slate-900 dark:bg-white flex items-center justify-center text-[#c8e558] dark:text-slate-900 shrink-0 shadow-2xs">
            <Target className="w-4 h-4" />
          </div>

          <div className="min-w-0">
            <div className="font-semibold text-[14.5px] text-slate-900 dark:text-white truncate">
              {testTitle}
            </div>
            <div className="text-[11.5px] text-slate-400 dark:text-slate-500 font-medium truncate">
              Candidate: {studentName} • {isStudyMode ? 'Interactive Study' : 'Timed Assessment'}
            </div>
          </div>
        </div>
        
        <div className="flex items-center gap-3">
          {/* Timer Capsule */}
          <div className={cn(
            "flex items-center gap-1.5 px-3 py-1.5 rounded-xl font-mono text-[13px] font-semibold border",
            timeLeft < 300 
              ? "bg-rose-500/10 border-rose-500/30 text-rose-600 dark:text-rose-400" 
              : "bg-slate-100 dark:bg-white/[0.04] border-slate-200/80 dark:border-white/10 text-slate-700 dark:text-slate-200"
          )}>
            <Clock className="w-3.5 h-3.5 text-slate-400" />
            <span>{formatTime(timeLeft)}</span>
          </div>

          <button 
            onClick={toggleTheme}
            className="p-2 rounded-xl border border-slate-200/80 dark:border-white/10 bg-slate-50 dark:bg-white/[0.04] text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-white/[0.08] transition-colors cursor-pointer"
            title="Toggle theme"
          >
            {isDarkMode ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
          </button>

          <button 
            onClick={() => setShowSubmitModal(true)}
            className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white dark:bg-[#c8e558] dark:hover:bg-[#bcd94c] dark:text-slate-900 rounded-xl text-[12.5px] font-semibold transition-all shadow-xs active:scale-98 cursor-pointer"
          >
            Submit Test
          </button>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        {/* Main Question Area */}
        <div className={cn(
          "flex-1 flex flex-col overflow-y-auto m-4 sm:m-6 rounded-2xl border shadow-xs relative transition-colors duration-300",
          isDarkMode ? "bg-[#111113] border-white/10" : "bg-white border-slate-200/90"
        )}>
          
          {/* Question Sub-header */}
          <div className="p-4 sm:p-5 border-b border-slate-100 dark:border-white/5 flex justify-between items-center bg-slate-50/50 dark:bg-white/[0.02] rounded-t-2xl">
            <div className="flex items-center gap-3">
              <span className="text-[13.5px] font-semibold text-slate-900 dark:text-white">
                Question {currentQIndex + 1} of {mockQuestions.length}
              </span>
              <button 
                onClick={toggleBookmark}
                className={cn(
                  "flex items-center justify-center p-1.5 rounded-lg border transition-all cursor-pointer shadow-2xs",
                  bookmarked.has(currentQ.id)
                    ? "bg-amber-500/10 border-amber-500/30 text-amber-500"
                    : "bg-white dark:bg-white/5 border-slate-200/80 dark:border-white/10 text-slate-400 hover:text-slate-600"
                )}
                title="Bookmark question"
              >
                <Bookmark className={cn("w-3.5 h-3.5", bookmarked.has(currentQ.id) && "fill-current")} />
              </button>
            </div>
            <div className="flex items-center gap-3 text-[12px] font-medium text-slate-500 dark:text-slate-400">
              <span className="text-emerald-600 dark:text-emerald-400 flex items-center gap-1">+1.0 Mark</span>
              <span>-0.25 Mark</span>
            </div>
          </div>
          
          {/* Question Stem & Options */}
          <div className="p-6 sm:p-8 flex-1 overflow-y-auto">
            <div className="max-w-3xl mx-auto">
              <h2 className="text-[16px] sm:text-[17px] font-medium leading-relaxed text-slate-900 dark:text-slate-100 mb-6">
                {currentQ.text}
              </h2>
              
              <div className="space-y-3">
                {currentQ.options.map((opt, i) => {
                  const isSelected = answers[currentQ.id] === i;
                  return (
                    <button
                      key={i}
                      onClick={() => handleOptionSelect(i)}
                      className={cn(
                        "w-full text-left p-3.5 sm:p-4 rounded-xl border text-[14px] transition-all flex items-start gap-3.5 cursor-pointer",
                        isSelected 
                          ? "border-[#8ba32b] dark:border-[#c8e558] bg-[#c8e558]/10 text-slate-900 dark:text-white font-medium shadow-2xs"
                          : "border-slate-200/80 dark:border-white/10 bg-white dark:bg-white/[0.02] text-slate-700 dark:text-slate-300 hover:bg-slate-50/80 dark:hover:bg-white/[0.04]"
                      )}
                    >
                      <div className={cn(
                        "w-5 h-5 rounded-full border flex-shrink-0 flex items-center justify-center mt-0.5 text-[11px] font-bold transition-colors",
                        isSelected 
                          ? "border-slate-900 bg-slate-900 text-white dark:border-[#c8e558] dark:bg-[#c8e558] dark:text-slate-900" 
                          : "border-slate-300 dark:border-white/20 text-slate-500"
                      )}>
                        {String.fromCharCode(65 + i)}
                      </div>
                      <span className="leading-relaxed">{opt}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Action Bar Bottom */}
          <div className="p-4 border-t border-slate-100 dark:border-white/5 flex flex-col sm:flex-row items-center justify-between gap-3 bg-slate-50/50 dark:bg-white/[0.02] rounded-b-2xl">
            <div className="flex items-center gap-2 w-full sm:w-auto">
              <button 
                onClick={toggleReview}
                className={cn(
                  "px-3 py-2 rounded-xl text-[12.5px] font-semibold border transition-all cursor-pointer shadow-2xs",
                  markedForReview.has(currentQ.id) 
                    ? "bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/30" 
                    : "bg-white dark:bg-white/5 text-slate-600 dark:text-slate-300 border-slate-200/80 dark:border-white/10 hover:bg-slate-50"
                )}
              >
                <BookmarkPlus className="w-3.5 h-3.5 inline mr-1" />
                {markedForReview.has(currentQ.id) ? 'Marked for Review' : 'Mark for Review'}
              </button>
              
              {answers[currentQ.id] !== undefined && (
                <button 
                  onClick={() => {
                    setAnswers(prev => {
                      const newAns = { ...prev };
                      delete newAns[currentQ.id];
                      return newAns;
                    });
                  }}
                  className="px-3 py-2 rounded-xl text-[12px] font-medium text-slate-500 hover:text-slate-800 dark:hover:text-white transition-colors"
                >
                  Clear Selection
                </button>
              )}
            </div>
            
            <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
              <button 
                onClick={handlePrev}
                disabled={currentQIndex === 0}
                className="px-4 py-2 rounded-xl text-[12.5px] font-semibold border border-slate-200/80 dark:border-white/10 bg-white dark:bg-white/5 text-slate-700 dark:text-slate-300 hover:bg-slate-50 disabled:opacity-40 cursor-pointer shadow-2xs transition-all"
              >
                <ChevronLeft className="w-3.5 h-3.5 inline mr-1" /> Previous
              </button>
              
              <button 
                onClick={currentQIndex === mockQuestions.length - 1 ? () => setShowSubmitModal(true) : handleNext}
                className="px-5 py-2 rounded-xl text-[12.5px] font-semibold bg-slate-900 hover:bg-slate-800 text-white dark:bg-[#c8e558] dark:hover:bg-[#bcd94c] dark:text-slate-900 transition-all shadow-xs cursor-pointer active:scale-98"
              >
                {currentQIndex === mockQuestions.length - 1 ? 'Review & Submit' : 'Next Question'}
                {currentQIndex !== mockQuestions.length - 1 && <ChevronRight className="w-3.5 h-3.5 inline ml-1" />}
              </button>
            </div>
          </div>
        </div>

        {/* Right Question Palette Drawer */}
        <div className={cn(
          "transition-all duration-300 shrink-0 z-40 bg-white dark:bg-[#111113] fixed md:relative right-0 bottom-0 top-16 md:top-auto h-[calc(100vh-4rem)] md:h-auto border-l border-slate-200/80 dark:border-white/10 shadow-xl md:shadow-none flex flex-col",
          isPaletteOpen ? "w-[300px] translate-x-0" : "w-[300px] md:w-0 translate-x-full md:translate-x-0 overflow-hidden"
        )}>
          {/* Palette Status Overview */}
          <div className="p-5 border-b border-slate-100 dark:border-white/5">
            <div className="flex items-center justify-between mb-3">
              <span className="text-[13px] font-semibold text-slate-900 dark:text-white">Question Palette</span>
              <button onClick={() => setIsPaletteOpen(false)} className="md:hidden text-slate-400 hover:text-slate-600">
                <X className="w-4 h-4" />
              </button>
            </div>
            
            <div className="grid grid-cols-2 gap-2 text-[11px] font-medium text-slate-600 dark:text-slate-400">
              <div className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-[#c8e558]" />
                <span>Answered ({Object.keys(answers).length})</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-purple-500" />
                <span>Marked ({markedForReview.size})</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-amber-400" />
                <span>Bookmarked ({bookmarked.size})</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-slate-300 dark:bg-white/20" />
                <span>Unattempted ({mockQuestions.length - Object.keys(answers).length})</span>
              </div>
            </div>
          </div>

          {/* Palette Grid Buttons */}
          <div className="flex-1 overflow-y-auto p-4 custom-scrollbar">
            <div className="grid grid-cols-5 gap-2">
              {mockQuestions.map((_, i) => {
                const qId = mockQuestions[i].id;
                const isAnswered = answers[qId] !== undefined;
                const isMarked = markedForReview.has(qId);
                const isBookmarked = bookmarked.has(qId);
                const isActive = currentQIndex === i;
                
                let bgClasses = isDarkMode ? "bg-white/[0.04] text-slate-400 border border-white/10" : "bg-slate-50 text-slate-600 border border-slate-200/80";
                if (isAnswered && !isMarked) bgClasses = isDarkMode ? "bg-[#c8e558]/20 border-[#c8e558]/50 text-[#c8e558] font-bold" : "bg-emerald-50 border-emerald-300 text-emerald-700 font-bold";
                if (isMarked) bgClasses = isDarkMode ? "bg-purple-500/20 border-purple-500/50 text-purple-400 font-bold" : "bg-purple-50 border-purple-300 text-purple-700 font-bold";
                
                return (
                  <button
                    key={i}
                    onClick={() => setCurrentQIndex(i)}
                    className={cn(
                      "w-full aspect-square rounded-xl flex items-center justify-center text-[12px] font-semibold transition-all cursor-pointer relative shadow-2xs",
                      bgClasses,
                      isActive && "ring-2 ring-slate-900 dark:ring-[#c8e558] ring-offset-2 ring-offset-white dark:ring-offset-[#111113]"
                    )}
                  >
                    {isBookmarked && (
                      <span className="absolute top-1 right-1 w-1.5 h-1.5 rounded-full bg-amber-400" />
                    )}
                    {i + 1}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* Submit Confirmation Modal */}
      {showSubmitModal && (
        <div className="fixed inset-0 z-[60] bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white dark:bg-[#141416] border border-slate-200/90 dark:border-white/10 rounded-2xl shadow-2xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            <div className="p-6 border-b border-slate-100 dark:border-white/5">
              <h3 className="text-[17px] font-semibold text-slate-900 dark:text-white">Submit Practice Assessment</h3>
              <p className="text-[13px] text-slate-500 dark:text-slate-400 mt-1">Review your question attempt breakdown before final scoring.</p>
            </div>
            
            <div className="p-6 space-y-3">
              <div className="flex items-center justify-between p-3 rounded-xl bg-slate-50 dark:bg-white/[0.03] border border-slate-200/80 dark:border-white/10">
                <span className="text-[13px] font-medium text-slate-700 dark:text-slate-300">Total Questions</span>
                <span className="text-[14px] font-bold text-slate-900 dark:text-white">{mockQuestions.length}</span>
              </div>
              
              <div className="flex items-center justify-between p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-700 dark:text-emerald-300">
                <span className="text-[13px] font-medium">Answered Questions</span>
                <span className="text-[14px] font-bold">{Object.keys(answers).length}</span>
              </div>
              
              <div className="flex items-center justify-between p-3 rounded-xl bg-purple-500/10 border border-purple-500/20 text-purple-700 dark:text-purple-300">
                <span className="text-[13px] font-medium">Marked for Review</span>
                <span className="text-[14px] font-bold">{markedForReview.size}</span>
              </div>
              
              <div className="flex items-center justify-between p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-700 dark:text-amber-300">
                <span className="text-[13px] font-medium">Unattempted</span>
                <span className="text-[14px] font-bold">{mockQuestions.length - Object.keys(answers).length}</span>
              </div>
            </div>
            
            <div className="p-5 border-t border-slate-100 dark:border-white/5 flex items-center gap-3 bg-slate-50/50 dark:bg-white/[0.02]">
              <button 
                onClick={() => setShowSubmitModal(false)}
                className="flex-1 py-2.5 border border-slate-200/90 dark:border-white/10 rounded-xl text-[13px] font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-white/5 transition-all cursor-pointer shadow-2xs"
              >
                Back to Test
              </button>
              <button 
                onClick={handleSubmit}
                disabled={isSubmitting}
                className="flex-1 py-2.5 bg-slate-900 hover:bg-slate-800 text-white dark:bg-[#c8e558] dark:hover:bg-[#bcd94c] dark:text-slate-900 rounded-xl text-[13px] font-semibold transition-all shadow-xs cursor-pointer active:scale-98"
              >
                {isSubmitting ? "Scoring..." : "Confirm & Submit"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Floating Ask AI Button (Study Mode Only) */}
      {!isAiHelperOpen && isStudyMode && (
        <button
          onClick={() => setIsAiHelperOpen(true)}
          className="fixed bottom-6 right-6 z-40 bg-slate-900 text-[#c8e558] dark:bg-white dark:text-slate-900 rounded-full p-3.5 shadow-xl flex items-center justify-center cursor-pointer transition-transform hover:scale-105"
          title="Ask AI for Conceptual Help"
        >
          <Bot className="w-5 h-5" />
        </button>
      )}

      {/* Ask AI Contextual Modal */}
      {isAiHelperOpen && isStudyMode && (
        <div className="fixed bottom-6 right-6 w-80 md:w-[350px] border border-slate-200/90 dark:border-white/10 rounded-2xl shadow-2xl z-[100] overflow-hidden flex flex-col bg-white dark:bg-[#141416]">
          <div className="p-3.5 bg-slate-900 text-white flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Bot className="w-4 h-4 text-[#c8e558]" />
              <span className="font-semibold text-[13px]">AI Concept Assistant</span>
            </div>
            <button onClick={() => setIsAiHelperOpen(false)} className="text-white/70 hover:text-white">
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="p-4 h-[220px] overflow-y-auto space-y-3 text-[13px] bg-slate-50/50 dark:bg-white/[0.02]">
            <div className="p-3 rounded-xl bg-white dark:bg-[#1e1e20] border border-slate-200/80 dark:border-white/10 text-slate-700 dark:text-slate-200">
              Need assistance with Question {currentQIndex + 1}? I can give you a guiding hint without spoiling the correct answer.
            </div>
          </div>

          <div className="p-3 border-t border-slate-100 dark:border-white/5 bg-white dark:bg-[#141416]">
            <form className="relative flex items-center" onSubmit={(e) => e.preventDefault()}>
              <input 
                type="text" 
                placeholder="Ask for a concept hint..." 
                className="w-full rounded-xl pl-3.5 pr-10 py-2 text-[13px] outline-none border border-slate-200/80 dark:border-white/10 bg-slate-50 dark:bg-white/5 text-slate-900 dark:text-white"
              />
              <button type="submit" className="absolute right-2 w-7 h-7 rounded-lg bg-slate-900 text-white dark:bg-[#c8e558] dark:text-slate-900 flex items-center justify-center">
                <Send className="w-3.5 h-3.5" />
              </button>
            </form>
          </div>
        </div>
      )}
    </motion.div>
  );
}
