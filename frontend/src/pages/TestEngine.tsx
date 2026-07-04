import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Clock, Info, CheckSquare, List, BookmarkPlus, Bookmark, ChevronRight, ChevronLeft, Target, Moon, Sun, Bot, X, Send, Loader2 } from "lucide-react";
import { motion } from "motion/react";
import { cn } from "../lib/utils";
import { useTheme } from "../lib/ThemeContext";
import { useQuiz } from "../hooks/ai/useQuiz";

export default function TestEngine() {
  const navigate = useNavigate();
  const { theme, toggleTheme } = useTheme();
  const isDarkMode = theme === 'dark';
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
  }); // 30 minutes mock
  const [isPaletteOpen, setIsPaletteOpen] = useState(true);
  const [showSubmitModal, setShowSubmitModal] = useState(false);
  const [isAiHelperOpen, setIsAiHelperOpen] = useState(false);
  const [showWarning, setShowWarning] = useState(false);

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

    const timeSpentSeconds = 1800 - timeLeft;

    await submitQuiz({ answers, timeSpent: timeSpentSeconds });

    navigate("/report", { 
      state: { 
        score, 
        total: mockQuestions.length, 
        answers,
        timeSpentSeconds
      } 
    });
  };

  useEffect(() => {
    if (timeLeft === 0) {
      handleSubmit();
    }
  }, [timeLeft, answers]); // Include answers to capture the latest state

  const answeredCount = Object.keys(answers).length;
  const unansweredCount = mockQuestions.length - answeredCount;

  if (isLoading) {
    return (
      <div className="w-full h-screen flex items-center justify-center bg-slate-50 dark:bg-[#131314]">
        <Loader2 className="w-8 h-8 animate-spin text-indigo-500" />
      </div>
    );
  }

  if (!mockQuestions || mockQuestions.length === 0) {
    return (
      <div className="w-full h-screen flex flex-col items-center justify-center bg-slate-50 dark:bg-[#131314] text-slate-500">
        <h2 className="text-xl font-bold mb-2">No Quiz Found</h2>
        <p>Return to dashboard and generate a quiz first.</p>
        <button onClick={() => navigate('/')} className="mt-4 px-4 py-2 bg-indigo-600 text-white rounded-lg">Go to Dashboard</button>
      </div>
    );
  }

  const currentQ = mockQuestions[currentQIndex];

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
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      transition={{ duration: 0.3 }}
      className={cn("fixed inset-0 z-50 flex flex-col font-sans transition-colors duration-300", isDarkMode ? "bg-slate-950 text-slate-100" : "bg-[#fafbfc] text-slate-900")}>
      {/* 5-minute Warning Toast */}
      {showWarning && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 z-[100] animate-in fade-in slide-in-from-top-4 duration-300">
          <div className="bg-red-500 text-white px-6 py-3 rounded-lg shadow-lg font-bold flex items-center gap-3">
            <Clock className="w-5 h-5" />
            Warning: Only 5 minutes remaining!
          </div>
        </div>
      )}

      {/* Header - CBT Style */}
      <header className={cn("h-auto md:h-16 py-3 md:py-0 border-b flex flex-col md:flex-row items-center justify-between px-4 md:px-6 gap-3 shrink-0 shadow-sm relative transition-colors duration-300", isDarkMode ? "bg-slate-900 border-slate-800" : "bg-white border-slate-200")}>
        <div className="absolute bottom-0 left-0 h-1 bg-slate-100 w-full overflow-hidden z-10">
           <div 
             className="h-full bg-teal-500 transition-all duration-300 ease-out" 
             style={{ width: `${(Object.keys(answers).length / mockQuestions.length) * 100}%` }}
           />
        </div>
        <div className="flex items-center gap-2 mt-1 md:mt-0 md:gap-4 w-full md:w-auto overflow-hidden">
          <button 
             className="md:hidden p-2 rounded-md hover:bg-slate-100 dark:hover:bg-slate-800 mr-1"
             onClick={() => setIsPaletteOpen(!isPaletteOpen)}
             aria-label={isPaletteOpen ? "Close Palette" : "Open Palette"}
             aria-expanded={isPaletteOpen}
          >
             <List className="w-5 h-5" aria-hidden="true" />
          </button>
          <div className={cn("hidden md:flex items-center justify-center p-2 rounded shrink-0 border", isDarkMode ? "bg-slate-800 border-slate-700" : "bg-slate-100 border-slate-200")}>
             <Target className={cn("w-5 h-5", isDarkMode ? "text-slate-300" : "text-slate-800")} aria-hidden="true" />
          </div>
          <div className="flex-1 min-w-0">
            <div className={cn("font-bold text-sm md:text-[15px] truncate", isDarkMode ? "text-slate-100" : "text-slate-900")}>BPSC TRE 3.0 PRT (1-5) (Language & GS)</div>
            <div className={cn("text-[11px] md:text-xs font-medium truncate", isDarkMode ? "text-slate-400" : "text-slate-500")}>Child Development & Pedagogy</div>
          </div>
        </div>
        
        <div className="flex items-center justify-between w-full md:w-auto gap-4 md:gap-6">
          <button 
            onClick={toggleTheme}
            className={cn("p-2 rounded-full border transition-colors shadow-sm cursor-pointer", isDarkMode ? "bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-700" : "bg-white border-slate-200 text-slate-500 hover:bg-slate-50")}
            title={isDarkMode ? "Switch to Day Mode" : "Switch to Night Mode"}
            aria-label={isDarkMode ? "Switch to Day Mode" : "Switch to Night Mode"}
          >
            {isDarkMode ? <Sun className="w-4 h-4" aria-hidden="true" /> : <Moon className="w-4 h-4" aria-hidden="true" />}
          </button>
          <div className={cn("flex-1 text-center justify-center flex items-center gap-1.5 md:gap-2 px-3 md:px-4 py-1.5 md:py-2 rounded-full font-mono font-medium text-xs md:text-sm border", isDarkMode ? "bg-red-900/20 border-red-900/50 text-red-400" : "bg-red-50 border-red-100 text-red-600")} role="timer" aria-live="polite">
            <Clock className="w-3.5 h-3.5 md:w-4 md:h-4" aria-hidden="true" />
            <span className="hidden sm:inline">Time Left:</span> {formatTime(timeLeft)}
          </div>
          <button 
            onClick={() => setShowSubmitModal(true)}
            className="px-4 md:px-6 py-1.5 md:py-2.5 bg-green-500 hover:bg-green-600 text-white rounded font-bold text-xs md:text-sm transition-colors shadow-sm cursor-pointer"
            aria-label="Submit Test"
          >
            Submit
          </button>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        {/* Main Question Area */}
        <div className={cn("flex-1 flex flex-col overflow-y-auto m-6 rounded-2xl border shadow-sm relative transition-colors duration-300", isDarkMode ? "bg-slate-900 border-slate-800" : "bg-white border-slate-200")}>
          
          <div className={cn("p-5 border-b flex justify-between items-center rounded-t-2xl transition-colors duration-300", isDarkMode ? "bg-slate-800/50 border-slate-800" : "bg-slate-50 border-slate-100")}>
            <div className="flex items-center gap-4">
              <div className={cn("font-bold", isDarkMode ? "text-slate-200" : "text-slate-800")} aria-live="polite">Question {currentQIndex + 1} of {mockQuestions.length}</div>
              <button 
                onClick={toggleBookmark}
                className={cn(
                  "flex items-center justify-center p-1.5 rounded-md transition-colors cursor-pointer border shadow-sm",
                  bookmarked.has(currentQ.id)
                    ? (isDarkMode ? 'bg-yellow-900/30 border-yellow-700/50 text-yellow-500' : 'bg-yellow-50 border-yellow-200 text-yellow-600')
                    : (isDarkMode ? 'bg-slate-800 border-slate-700 text-slate-400 hover:bg-slate-700 hover:text-slate-300' : 'bg-white border-slate-200 text-slate-400 hover:bg-slate-50 hover:text-slate-600')
                )}
                title={bookmarked.has(currentQ.id) ? "Remove Bookmark" : "Save for later review"}
                aria-label={bookmarked.has(currentQ.id) ? "Remove Bookmark" : "Save for later review"}
                aria-pressed={bookmarked.has(currentQ.id)}
              >
                <Bookmark className={cn("w-4 h-4", bookmarked.has(currentQ.id) && "fill-current")} />
              </button>
            </div>
            <div className="flex items-center gap-4 text-sm font-medium">
              <span className="text-green-600 flex items-center gap-1"><CheckSquare className="w-4 h-4"/> +1 Marks</span>
              <span className="text-red-500 flex items-center gap-1"><Info className="w-4 h-4"/> -0.25 Marks</span>
            </div>
          </div>
          
          <div className="p-8 flex-1 overflow-y-auto">
            <div className="max-w-4xl mx-auto">
              <h2 className={cn("text-[17px] font-medium leading-relaxed mb-8", isDarkMode ? "text-slate-200" : "text-slate-900")}>
                {currentQ.text}
              </h2>
              
              <div className="space-y-4" role="radiogroup" aria-label="Question options">
                {currentQ.options.map((opt, i) => {
                  const isSelected = answers[currentQ.id] === i;
                  return (
                    <button
                      key={i}
                      role="radio"
                      aria-checked={isSelected}
                      onClick={() => handleOptionSelect(i)}
                      className={cn(
                        "w-full text-left p-4 rounded-xl border-2 transition-all duration-200 flex items-start gap-4 cursor-pointer",
                        isSelected 
                          ? (isDarkMode ? 'border-teal-500 bg-teal-900/20' : 'border-teal-500 bg-teal-50/50')
                          : (isDarkMode ? 'border-slate-800 bg-slate-900 hover:bg-slate-800 hover:border-slate-700' : 'border-slate-100 bg-white hover:bg-slate-50 hover:border-slate-200')
                      )}
                    >
                      <div className={cn(
                        "w-6 h-6 rounded-full border-2 flex-shrink-0 flex items-center justify-center mt-0.5 transition-colors",
                         isSelected ? 'border-teal-500' : (isDarkMode ? 'border-slate-600' : 'border-slate-300')
                      )}>
                        {isSelected && <div className="w-3 h-3 bg-teal-500 rounded-full" />}
                      </div>
                      <span className={cn("text-[15px]", isSelected ? (isDarkMode ? 'text-slate-100 font-medium' : 'text-slate-900 font-medium') : (isDarkMode ? 'text-slate-400' : 'text-slate-700'))}>
                        {opt}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Action Bar */}
          <div className={cn("h-auto md:h-20 py-3 md:py-0 border-t flex flex-col md:flex-row items-center justify-between px-4 md:px-8 shrink-0 rounded-b-2xl transition-colors duration-300 gap-3 md:gap-0", isDarkMode ? "bg-slate-800/50 border-slate-800" : "bg-slate-50 border-slate-200")}>
            <div className="flex w-full md:w-auto gap-2 md:gap-4 justify-between md:justify-start">
              <button 
                onClick={toggleReview}
                aria-pressed={markedForReview.has(currentQ.id)}
                className={cn(
                  "flex-1 md:flex-none flex items-center justify-center gap-1.5 md:gap-2 px-3 md:px-5 py-2 md:py-2.5 rounded font-bold transition-colors cursor-pointer text-xs md:text-sm shadow-sm",
                  markedForReview.has(currentQ.id) 
                    ? (isDarkMode ? 'bg-purple-900/30 text-purple-400 border border-purple-800/50 hover:bg-purple-900/50' : 'bg-purple-100 text-purple-700 border border-purple-200 hover:bg-purple-200')
                    : (isDarkMode ? 'bg-slate-800 text-slate-300 border border-slate-700 hover:bg-slate-700' : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50')
                )}
              >
                <BookmarkPlus className="w-4 h-4 md:w-5 md:h-5" />
                <span>Mark<span className="hidden sm:inline"> for Review</span></span>
              </button>
              <button 
                onClick={() => {
                  setAnswers(prev => {
                    const newAns = { ...prev };
                    delete newAns[currentQ.id];
                    return newAns;
                  });
                }}
                className={cn("flex-1 md:flex-none px-3 md:px-5 py-2 md:py-2.5 border rounded text-xs md:text-sm font-bold shadow-sm transition-colors cursor-pointer", isDarkMode ? "bg-slate-800 hover:bg-slate-700 border-slate-700 text-slate-300" : "bg-white hover:bg-slate-50 border-slate-200 text-slate-600")}
              >
                Clear<span className="hidden sm:inline"> Response</span>
              </button>
            </div>
            
            <div className="flex w-full md:w-auto gap-2 md:gap-4 justify-between md:justify-start">
              <button 
                onClick={handlePrev}
                disabled={currentQIndex === 0}
                className={cn("flex-1 md:flex-none flex items-center justify-center gap-1 px-4 md:px-6 py-2 md:py-2.5 border disabled:opacity-50 rounded text-xs md:text-sm font-bold shadow-sm transition-colors cursor-pointer", isDarkMode ? "bg-slate-800 hover:bg-slate-700 border-slate-700 text-slate-300" : "bg-white hover:bg-slate-50 border-slate-200 text-slate-700")}
              >
                <ChevronLeft className="w-4 h-4 md:w-5 md:h-5" /> Prev<span className="hidden sm:inline">ious</span>
              </button>
              <button 
                onClick={handleNext}
                className="flex-1 md:flex-none flex items-center justify-center gap-1 px-6 md:px-8 py-2 md:py-2.5 bg-teal-600 text-white hover:bg-teal-700 rounded text-xs md:text-sm font-bold shadow-sm transition-colors cursor-pointer"
              >
                {currentQIndex === mockQuestions.length - 1 ? 'Finish' : 'Save & Next'} 
                {currentQIndex !== mockQuestions.length - 1 && <ChevronRight className="w-4 h-4 md:w-5 md:h-5" />}
              </button>
            </div>
          </div>
        </div>

        {/* Right Palette */}
        <div className={cn("transition-all duration-300 shrink-0 z-40 bg-white dark:bg-slate-900 md:bg-transparent fixed top-auto md:relative right-0 bottom-0 top-[auto] md:top-auto h-[calc(100vh-auto)] md:h-auto border-l md:border-none shadow-2xl md:shadow-none", isPaletteOpen ? "w-[320px] translate-x-0" : "w-[320px] md:w-0 translate-x-full md:translate-x-0")}>
          <button 
            onClick={() => setIsPaletteOpen(!isPaletteOpen)}
            className={cn("hidden md:flex absolute top-1/2 -left-[24px] -translate-y-1/2 z-10 w-6 h-16 border-y border-l items-center justify-center cursor-pointer shadow-[-4px_0_6px_-1px_rgba(0,0,0,0.1)] rounded-l-lg transition-colors", isDarkMode ? "bg-slate-900 border-slate-800 hover:bg-slate-800 text-slate-400" : "bg-white border-slate-200 hover:bg-slate-50 text-slate-500")}
            title={isPaletteOpen ? "Collapse Palette" : "Expand Palette"}
            aria-label={isPaletteOpen ? "Collapse Palette" : "Expand Palette"}
            aria-expanded={isPaletteOpen}
          >
            {isPaletteOpen ? <ChevronRight className="w-5 h-5" aria-hidden="true" /> : <ChevronLeft className="w-5 h-5" aria-hidden="true" />}
          </button>

          {/* Mobile Closer */}
          {isPaletteOpen && (
             <div className="fixed inset-0 z-[-1] bg-black/20 md:hidden" onClick={() => setIsPaletteOpen(false)} aria-hidden="true" />
          )}

          <div className={cn("absolute inset-0 md:border-l flex flex-col overflow-hidden transition-colors duration-300", isDarkMode ? "bg-slate-900 border-slate-800" : "bg-white border-slate-200")}>
            <div className="flex items-center justify-between p-4 border-b md:hidden dark:border-slate-800">
               <span className="font-bold">Palette</span>
               <button onClick={() => setIsPaletteOpen(false)} aria-label="Close Palette"><X className="w-5 h-5" aria-hidden="true" /></button>
            </div>
            <div className="w-[320px] flex flex-col h-full shrink-0">
              <div className={cn("p-6 border-b flex items-center gap-4 transition-colors duration-300", isDarkMode ? "border-slate-800" : "border-slate-100")}>
                <div className={cn("w-12 h-12 rounded-full flex items-center justify-center overflow-hidden border", isDarkMode ? "bg-slate-800 border-slate-700" : "bg-slate-100 border-slate-200")}>
                   <img src="https://i.pravatar.cc/150?img=11" alt="User" />
                </div>
                <div>
                  <div className={cn("text-sm font-bold", isDarkMode ? "text-slate-200" : "text-slate-900")}>Rohan Kumar</div>
                  <div className={cn("text-xs font-medium", isDarkMode ? "text-slate-400" : "text-slate-500")}>Roll No: 204918</div>
                </div>
              </div>

              <div className={cn("p-6 grid grid-cols-2 gap-4 text-xs font-bold border-b shrink-0 transition-colors duration-300", isDarkMode ? "border-slate-800" : "border-slate-100")}>
                <div className="flex items-center gap-2">
                  <div className={cn("w-8 h-8 rounded-full border flex items-center justify-center", isDarkMode ? "bg-teal-900/30 border-teal-800/50 text-teal-400" : "bg-green-100 border-green-200 text-green-700")}>
                    {Object.keys(answers).length}
                  </div>
                  <span className={isDarkMode ? "text-slate-400" : "text-slate-600"}>Answered</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className={cn("w-8 h-8 rounded-full border flex items-center justify-center", isDarkMode ? "bg-purple-900/30 border-purple-800/50 text-purple-400" : "bg-purple-100 border-purple-200 text-purple-700")}>
                    {markedForReview.size}
                  </div>
                  <span className={isDarkMode ? "text-slate-400" : "text-slate-600"}>Marked</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className={cn("w-8 h-8 rounded-full border flex items-center justify-center", isDarkMode ? "bg-yellow-900/30 border-yellow-800/50 text-yellow-500" : "bg-yellow-100 border-yellow-200 text-yellow-700")}>
                    {bookmarked.size}
                  </div>
                  <span className={isDarkMode ? "text-slate-400" : "text-slate-600"}>Bookmarked</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className={cn("w-8 h-8 rounded-full border flex items-center justify-center", isDarkMode ? "bg-slate-800 border-slate-700 text-slate-400" : "bg-slate-100 border-slate-200 text-slate-500")}>
                    {mockQuestions.length - Object.keys(answers).length}
                  </div>
                  <span className={isDarkMode ? "text-slate-400" : "text-slate-600"}>Not Visited</span>
                </div>
              </div>

              <div className="flex-1 overflow-y-auto p-6 custom-scrollbar">
                <div className={cn("text-sm font-bold mb-4 pb-2 border-b", isDarkMode ? "text-slate-300 border-slate-800" : "text-slate-800 border-slate-100")}>Question Palette</div>
                <div className="grid grid-cols-5 gap-3">
                  {mockQuestions.map((_, i) => {
                    const qId = mockQuestions[i].id;
                    const isAnswered = answers[qId] !== undefined;
                    const isMarked = markedForReview.has(qId);
                    const isBookmarked = bookmarked.has(qId);
                    const isActive = currentQIndex === i;
                    
                    let bgClasses = isDarkMode ? "bg-slate-800 text-slate-400 border border-slate-700 hover:bg-slate-700" : "bg-white text-slate-600 border border-slate-200 hover:bg-slate-50";
                    if (isAnswered && !isMarked) bgClasses = isDarkMode ? "bg-teal-900/40 border border-teal-800 text-teal-400 font-bold" : "bg-green-50 border border-green-200 text-green-700 font-bold";
                    if (isMarked) bgClasses = isDarkMode ? "bg-purple-900/40 border border-purple-800 text-purple-400 font-bold" : "bg-purple-50 border border-purple-200 text-purple-700 font-bold";
                    
                    return (
                      <button
                        key={i}
                        onClick={() => setCurrentQIndex(i)}
                        className={cn(
                          "w-full aspect-square rounded-[10px] flex items-center justify-center text-sm transition-all cursor-pointer shadow-sm relative overflow-hidden",
                          bgClasses,
                          isActive && (isDarkMode ? 'ring-2 ring-slate-400 ring-offset-2 ring-offset-slate-900' : 'ring-2 ring-[#111827] ring-offset-2')
                        )}
                      >
                        {isBookmarked && (
                          <div className="absolute -top-1 -right-1 w-4 h-4 bg-yellow-400 rotate-45 transform flex items-center justify-center shadow-sm" />
                        )}
                        {i + 1}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Submit Modal */}
      {showSubmitModal && (
        <div className="fixed inset-0 z-[60] bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4">
          <div role="dialog" aria-modal="true" aria-labelledby="submit-modal-title" className={cn("rounded-2xl shadow-xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in-95 duration-200 transition-colors", isDarkMode ? "bg-slate-900 border border-slate-800" : "bg-white")}>
            <div className={cn("p-6 border-b", isDarkMode ? "border-slate-800" : "border-slate-100")}>
              <h3 id="submit-modal-title" className={cn("text-xl font-bold", isDarkMode ? "text-slate-100" : "text-slate-900")}>Submit Test</h3>
              <p className={cn("text-sm mt-1", isDarkMode ? "text-slate-400" : "text-slate-500")}>Please review your progress before final submission.</p>
            </div>
            
            <div className="p-6 space-y-4">
              <div className={cn("flex items-center justify-between p-4 rounded-xl border", isDarkMode ? "bg-slate-800/50 border-slate-700" : "bg-slate-50 border-slate-100")}>
                <div className="flex items-center gap-3">
                  <div className={cn("w-10 h-10 rounded-full flex items-center justify-center font-bold", isDarkMode ? "bg-slate-700 text-slate-300" : "bg-slate-200 text-slate-600")}>
                    {mockQuestions.length}
                  </div>
                  <span className={cn("font-semibold", isDarkMode ? "text-slate-200" : "text-slate-700")}>Total Questions</span>
                </div>
              </div>
              
              <div className={cn("flex items-center justify-between p-4 rounded-xl border", isDarkMode ? "bg-green-900/20 border-green-900/50" : "bg-green-50 border-green-100")}>
                <div className="flex items-center gap-3">
                  <div className={cn("w-10 h-10 rounded-full flex items-center justify-center font-bold", isDarkMode ? "bg-green-900/50 text-green-400" : "bg-green-200 text-green-700")}>
                    {Object.keys(answers).length}
                  </div>
                  <span className={cn("font-semibold", isDarkMode ? "text-slate-200" : "text-slate-700")}>Answered</span>
                </div>
              </div>
              
              <div className={cn("flex items-center justify-between p-4 rounded-xl border", isDarkMode ? "bg-purple-900/20 border-purple-900/50" : "bg-purple-50 border-purple-100")}>
                <div className="flex items-center gap-3">
                  <div className={cn("w-10 h-10 rounded-full flex items-center justify-center font-bold", isDarkMode ? "bg-purple-900/50 text-purple-400" : "bg-purple-200 text-purple-700")}>
                    {markedForReview.size}
                  </div>
                  <span className={cn("font-semibold", isDarkMode ? "text-slate-200" : "text-slate-700")}>Marked for Review</span>
                </div>
              </div>
              
              <div className={cn("flex items-center justify-between p-4 rounded-xl border", isDarkMode ? "bg-orange-900/20 border-orange-900/50" : "bg-orange-50 border-orange-100")}>
                <div className="flex items-center gap-3">
                  <div className={cn("w-10 h-10 rounded-full flex items-center justify-center font-bold", isDarkMode ? "bg-orange-900/50 text-orange-400" : "bg-orange-200 text-orange-700")}>
                    {mockQuestions.length - Object.keys(answers).length}
                  </div>
                  <span className={cn("font-semibold", isDarkMode ? "text-slate-200" : "text-slate-700")}>Unanswered</span>
                </div>
              </div>
            </div>
            
            <div className={cn("p-6 border-t flex items-center gap-4", isDarkMode ? "bg-slate-800/30 border-slate-800" : "bg-slate-50 border-slate-100")}>
              <button 
                onClick={() => setShowSubmitModal(false)}
                className={cn("flex-1 px-4 py-2.5 border rounded-lg font-bold shadow-sm transition-colors cursor-pointer", isDarkMode ? "bg-slate-800 border-slate-700 hover:border-slate-600 text-slate-300" : "bg-white border-slate-200 hover:border-slate-300 text-slate-700")}
              >
                Continue Test
              </button>
              <button 
                onClick={handleSubmit}
                className="flex-1 px-4 py-2.5 bg-teal-600 hover:bg-teal-700 text-white rounded-lg font-bold shadow-sm transition-colors cursor-pointer"
              >
                Confirm Submit
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Floating Ask AI Button */}
      {!isAiHelperOpen && (
        <button
          onClick={() => setIsAiHelperOpen(true)}
          className="fixed bottom-6 right-6 z-40 bg-indigo-600 hover:bg-indigo-700 text-white rounded-full p-4 shadow-[0_4px_14px_rgba(79,70,229,0.4)] flex items-center justify-center cursor-pointer transition-transform hover:scale-110"
          title="Ask AI for Conceptual Help"
          aria-label="Ask AI for Conceptual Help"
          aria-expanded={isAiHelperOpen}
        >
          <Bot className="w-6 h-6" aria-hidden="true" />
        </button>
      )}

      {/* Ask AI Contextual Modal */}
      {isAiHelperOpen && (
        <div className={cn(
          "fixed bottom-6 right-6 w-80 md:w-[360px] border rounded-2xl shadow-[0_8px_30px_rgb(0,0,0,0.12)] z-[100] overflow-hidden flex flex-col transition-colors duration-300",
          isDarkMode ? "bg-slate-900 border-slate-800" : "bg-white border-slate-200"
        )}>
          {/* Header */}
          <div className="bg-indigo-600 p-4 flex items-center justify-between">
            <div className="flex items-center gap-2 text-white">
              <div className="w-7 h-7 bg-white/20 rounded flex items-center justify-center">
                <Bot className="w-4 h-4 text-white" />
              </div>
              <div>
                <span className="font-bold text-[14px] leading-tight block">Ask AI</span>
                <span className="text-[11px] text-indigo-200 font-medium leading-tight">Conceptual Assistant</span>
              </div>
            </div>
            <button 
              onClick={() => setIsAiHelperOpen(false)} 
              className="w-7 h-7 flex items-center justify-center rounded-full hover:bg-white/10 text-white/80 hover:text-white transition-colors cursor-pointer"
              aria-label="Close AI helper"
            >
               <X className="w-4 h-4" aria-hidden="true" />
            </button>
          </div>

          {/* Body */}
          <div className={cn("p-4 h-[300px] overflow-y-auto space-y-4", isDarkMode ? "bg-slate-950 text-slate-300" : "bg-slate-50 text-slate-700")}>
             <div className="flex flex-col gap-1 items-center justify-center text-center h-full opacity-50" style={{ display: 'none' }}>
                <Bot className="w-10 h-10 mb-2" aria-hidden="true" />
                <p className="text-sm">I can help clarify concepts related to Question {currentQIndex + 1}.</p>
             </div>
             
             {/* Stubbed message from bot */}
             <div className={cn("inline-block p-3.5 rounded-2xl rounded-tl-sm max-w-[90%] text-[14px] shadow-sm", isDarkMode ? "bg-indigo-900/30 text-indigo-300 border border-indigo-800/50" : "bg-indigo-50 text-indigo-900 border border-indigo-100")}>
               Hi! Need help with Question {currentQIndex + 1}? I can clarify concepts without giving away the direct answer.
             </div>
          </div>

          {/* Input */}
          <div className={cn("p-3 border-t", isDarkMode ? "border-slate-800 bg-slate-900" : "border-slate-200 bg-white")}>
             <form className="relative flex items-center" onSubmit={(e) => e.preventDefault()}>
                <input 
                  type="text" 
                  aria-label="Ask for a hint or concept explanation"
                  placeholder="Ask for a hint or concept explanation..." 
                  className={cn(
                    "w-full rounded-full pl-4 pr-[44px] py-2.5 text-[14px] outline-none border focus:border-indigo-500 transition-colors shadow-sm", 
                    isDarkMode ? "bg-slate-800 text-slate-100 border-slate-700 placeholder-slate-500 focus:bg-slate-900" : "bg-slate-100 text-slate-900 border-transparent placeholder-slate-500 focus:bg-white focus:border-indigo-300"
                  )} 
                />
                <button type="submit" aria-label="Send message" className="absolute right-[4px] w-[32px] h-[32px] rounded-full bg-indigo-600 flex items-center justify-center text-white cursor-pointer hover:bg-indigo-700 shadow-sm transition-transform hover:scale-105 active:scale-95">
                  <Send className="w-3.5 h-3.5 -ml-0.5" aria-hidden="true" />
                </button>
             </form>
          </div>
        </div>
      )}
    </motion.div>
  );
}
