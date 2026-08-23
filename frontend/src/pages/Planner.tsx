import React, { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { 
  Calendar, CheckCircle, Circle, Play, RefreshCw, 
  Sparkles, BookOpen, Brain, Clock, ChevronRight, AlertTriangle,
  Coffee, HeartPulse, Target, ArrowRight, Zap, Flame,
  CheckCircle2, Plus, Sliders, Award, Layers
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { usePlanner } from "../hooks/api/usePlanner";
import { useLaunchTest } from "../hooks/ai/useLaunchTest";
import { useAuth } from "../lib/AuthContext";
import { sendRealNotification } from "../lib/api/realtimeNotifications";
import { useTheme } from "../lib/ThemeContext";
import { cn } from "../lib/utils";

export default function Planner() {
  const { theme } = useTheme();
  const isDarkMode = theme === 'dark';
  const { user } = useAuth();
  const navigate = useNavigate();
  const launch = useLaunchTest();

  const { timetable, isLoading, generateTimetable, isGenerating, markCompleted, adaptTimetable, isAdapting } = usePlanner();
  const [showWizard, setShowWizard] = useState(false);

  // Wizard state
  const [targetExam, setTargetExam] = useState("UPSC CSE 2026");
  const [weeklyHours, setWeeklyHours] = useState(15);
  const [planningMode, setPlanningMode] = useState<"Balanced" | "Crash Course" | "Weekend Only" | "Working Professional">("Balanced");
  const [preferredStudyHours, setPreferredStudyHours] = useState<"Morning" | "Night" | "Flexible">("Flexible");
  const [targetDaysOffset, setTargetDaysOffset] = useState(90);

  // Today string
  const todayStr = useMemo(() => {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }, []);

  // Sorted list of all scheduled dates in timetable
  const scheduledDates = useMemo(() => {
    if (!timetable?.schedule) return [];
    return Object.keys(timetable.schedule).sort();
  }, [timetable?.schedule]);

  // Selected date for viewing tasks (defaults to today or first scheduled date)
  const [selectedDate, setSelectedDate] = useState<string>(todayStr);

  // Ensure selectedDate defaults to today or first valid date if not found
  const activeDate = useMemo(() => {
    if (scheduledDates.includes(selectedDate)) return selectedDate;
    if (scheduledDates.includes(todayStr)) return todayStr;
    return scheduledDates[0] || todayStr;
  }, [scheduledDates, selectedDate, todayStr]);

  const activeTasks = useMemo(() => {
    if (!timetable?.schedule || !timetable.schedule[activeDate]) return [];
    return timetable.schedule[activeDate];
  }, [timetable?.schedule, activeDate]);

  // Stats for the active date
  const activeDayStats = useMemo(() => {
    if (!activeTasks.length) return { completed: 0, total: 0, percent: 0, minutes: 0 };
    const completed = activeTasks.filter(t => t.completed).length;
    const total = activeTasks.length;
    const percent = Math.round((completed / total) * 100);
    const minutes = activeTasks.reduce((sum, t) => sum + (t.estimatedMinutes || 30), 0);
    return { completed, total, percent, minutes };
  }, [activeTasks]);

  // Overall Timetable Goal Stats
  const overallStats = useMemo(() => {
    if (!timetable?.schedule) return { totalTasks: 0, completedTasks: 0, percent: 0 };
    let total = 0;
    let completed = 0;
    Object.values(timetable.schedule).forEach(taskList => {
      taskList.forEach(t => {
        total++;
        if (t.completed) completed++;
      });
    });
    return {
      totalTasks: total,
      completedTasks: completed,
      percent: total > 0 ? Math.round((completed / total) * 100) : 0
    };
  }, [timetable?.schedule]);

  const handleGenerate = async () => {
    await generateTimetable({
      targetExam,
      examDate: new Date(Date.now() + 86400000 * targetDaysOffset).toISOString(),
      subjects: ["General Studies", "History", "Polity", "Geography", "Economy"],
      weeklyHours,
      planningMode: planningMode as any,
      preferredStudyHours: preferredStudyHours as any
    });
    setShowWizard(false);
    if (user?.uid) {
      sendRealNotification({
        userId: user.uid,
        type: 'test_scheduled',
        category: 'learning',
        title: `📅 Study Schedule Generated: ${targetExam}`,
        body: `Your daily revision timetable and milestone roadmaps for ${targetExam} have been prepared.`,
        actionUrl: '/planner',
        actions: ['View Schedule'],
        priority: 'medium',
      }).catch(() => {});
    }
  };

  // Launch task action based on task type
  const handleLaunchTask = (task: any) => {
    if (task.type === 'quiz' || task.type === 'practice_test') {
      launch({ topic: task.topic || task.chapter, count: 10, mode: 'exam' });
    } else if (task.type === 'read') {
      navigate('/notebooks');
    } else if (task.type === 'revision') {
      launch({ topic: task.topic || task.chapter, count: 5, mode: 'study' });
    }
  };

  if (isLoading) {
    return (
      <div className="flex h-full min-h-[500px] items-center justify-center bg-[#fafbfc] dark:bg-[#0b0b0c]">
        <div className="flex flex-col items-center gap-3">
          <RefreshCw className="w-7 h-7 animate-spin text-[#8ba32b] dark:text-[#c8e558]" />
          <span className="text-[12.5px] font-medium text-slate-500 dark:text-slate-400">
            Loading adaptive study schedule...
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full h-full overflow-y-auto custom-scrollbar p-4 sm:p-6 md:p-8 bg-[#fafbfc] dark:bg-[#131315] text-slate-900 dark:text-white transition-colors duration-300 font-sans">
      <div className="max-w-[1040px] mx-auto space-y-6">
        
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl sm:text-[28px] font-bold text-slate-900 dark:text-white tracking-tight">
                AI Adaptive Planner
              </h1>
              <span className="text-[11px] font-semibold px-2.5 py-0.5 rounded-full bg-[#8ba32b]/10 text-[#8ba32b] dark:bg-[#c8e558]/10 dark:text-[#c8e558] border border-[#8ba32b]/20 dark:border-[#c8e558]/20">
                Live Dynamic
              </span>
            </div>
            <p className="text-[13px] text-slate-500 dark:text-slate-400 mt-1">
              Your personalized, chapter-level intelligent study schedule.
            </p>
          </div>

          {/* Action Buttons */}
          <div className="flex flex-wrap items-center gap-2">
            {timetable && (
              <>
                <button 
                  onClick={() => adaptTimetable()}
                  disabled={isAdapting}
                  className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-[12px] font-medium transition-all bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-500/20 border border-emerald-500/20 cursor-pointer"
                >
                  <HeartPulse className="w-3.5 h-3.5" />
                  <span>Intelligent Recovery</span>
                </button>
                <button 
                  onClick={() => adaptTimetable()}
                  disabled={isAdapting}
                  className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-[12px] font-medium transition-all bg-amber-500/10 text-amber-700 dark:text-amber-400 hover:bg-amber-500/20 border border-amber-500/20 cursor-pointer"
                >
                  {isAdapting ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
                  <span>Rebalance Plan</span>
                </button>
              </>
            )}
            <button 
              onClick={() => setShowWizard(true)}
              className={cn(
                "flex items-center gap-1.5 px-4 py-1.5 rounded-full text-[12px] font-semibold transition-all cursor-pointer shadow-xs active:scale-98",
                isDarkMode 
                  ? "bg-[#c8e558] hover:bg-[#bcd94c] text-slate-900" 
                  : "bg-slate-900 hover:bg-slate-800 text-white"
              )}
            >
              <Calendar className="w-3.5 h-3.5" />
              <span>{timetable ? "Adjust Goal" : "Create Study Plan"}</span>
            </button>
          </div>
        </div>

        {/* Timetable View */}
        {!timetable ? (
          /* Empty State */
          <motion.div 
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            className={cn(
              "p-8 sm:p-12 text-center rounded-2xl border transition-all space-y-6",
              isDarkMode ? "bg-[#141416] border-white/10 shadow-xs" : "bg-white border-slate-200/90 shadow-2xs"
            )}
          >
            <div className="w-16 h-16 rounded-2xl bg-[#8ba32b]/10 dark:bg-[#c8e558]/10 text-[#8ba32b] dark:text-[#c8e558] flex items-center justify-center mx-auto border border-[#8ba32b]/20 dark:border-[#c8e558]/20">
              <Calendar className="w-8 h-8" />
            </div>

            <div className="max-w-md mx-auto space-y-2">
              <h2 className="text-xl font-bold text-slate-900 dark:text-white">
                No active study plan yet
              </h2>
              <p className="text-[13px] text-slate-500 dark:text-slate-400">
                Let our AI create a custom, chapter-by-chapter roadmap tailored to your target exam date, study pace, and daily availability.
              </p>
            </div>

            {/* Feature Highlights Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 max-w-2xl mx-auto text-left pt-2">
              <div className={cn(
                "p-3.5 rounded-xl border text-[12px]",
                isDarkMode ? "bg-white/[0.02] border-white/5" : "bg-slate-50 border-slate-200/60"
              )}>
                <div className="flex items-center gap-2 font-semibold text-slate-900 dark:text-white mb-1">
                  <Zap className="w-3.5 h-3.5 text-[#8ba32b] dark:text-[#c8e558]" />
                  Adaptive Pacing
                </div>
                <p className="text-[11px] text-slate-500 dark:text-slate-400">
                  Automatically redistributes study load when you miss days or advance faster.
                </p>
              </div>

              <div className={cn(
                "p-3.5 rounded-xl border text-[12px]",
                isDarkMode ? "bg-white/[0.02] border-white/5" : "bg-slate-50 border-slate-200/60"
              )}>
                <div className="flex items-center gap-2 font-semibold text-slate-900 dark:text-white mb-1">
                  <Brain className="w-3.5 h-3.5 text-purple-400" />
                  Spaced Repetition
                </div>
                <p className="text-[11px] text-slate-500 dark:text-slate-400">
                  Schedules timely revision drills to maximize retention before exam day.
                </p>
              </div>

              <div className={cn(
                "p-3.5 rounded-xl border text-[12px]",
                isDarkMode ? "bg-white/[0.02] border-white/5" : "bg-slate-50 border-slate-200/60"
              )}>
                <div className="flex items-center gap-2 font-semibold text-slate-900 dark:text-white mb-1">
                  <BookOpen className="w-3.5 h-3.5 text-blue-400" />
                  Chapter Breakdown
                </div>
                <p className="text-[11px] text-slate-500 dark:text-slate-400">
                  Breaks full curriculums down into 30-minute bite-sized daily milestones.
                </p>
              </div>
            </div>

            <button 
              onClick={() => setShowWizard(true)}
              className={cn(
                "inline-flex items-center gap-2 px-6 py-2.5 rounded-xl text-[13px] font-semibold transition-all cursor-pointer shadow-md active:scale-98",
                isDarkMode 
                  ? "bg-[#c8e558] hover:bg-[#bcd94c] text-slate-900" 
                  : "bg-slate-900 hover:bg-slate-800 text-white"
              )}
            >
              <Sparkles className="w-4 h-4 fill-current" />
              <span>Generate AI Study Schedule</span>
            </button>
          </motion.div>
        ) : (
          /* Active Schedule View */
          <div className="space-y-6">
            
            {/* Goal Overview Banner */}
            <div className={cn(
              "p-5 rounded-2xl border transition-all",
              isDarkMode ? "bg-[#141416] border-white/10 shadow-xs" : "bg-white border-slate-200/90 shadow-2xs"
            )}>
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-100 dark:border-white/5">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-[#8ba32b]/10 dark:bg-[#c8e558]/10 text-[#8ba32b] dark:text-[#c8e558] flex items-center justify-center shrink-0">
                    <Target className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-[14px] font-bold text-slate-900 dark:text-white">
                      Target Exam: {targetExam}
                    </h3>
                    <p className="text-[11.5px] text-slate-500 dark:text-slate-400">
                      {scheduledDates.length} Days Planned • {overallStats.completedTasks}/{overallStats.totalTasks} Tasks Completed ({overallStats.percent}%)
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <div className="w-32 sm:w-40 bg-slate-100 dark:bg-white/10 rounded-full h-2 overflow-hidden">
                    <div 
                      className="bg-[#8ba32b] dark:bg-[#c8e558] h-full transition-all duration-500 rounded-full"
                      style={{ width: `${overallStats.percent}%` }}
                    />
                  </div>
                  <span className="text-[12px] font-bold text-slate-700 dark:text-slate-300">
                    {overallStats.percent}%
                  </span>
                </div>
              </div>

              {/* Date Selector Strip */}
              <div className="pt-4 space-y-2">
                <div className="flex items-center justify-between text-[11px] font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wider">
                  <span>Schedule Timeline</span>
                  <button 
                    onClick={() => setSelectedDate(todayStr)}
                    className="text-[#8ba32b] dark:text-[#c8e558] hover:underline cursor-pointer"
                  >
                    Jump to Today
                  </button>
                </div>

                <div className="flex items-center gap-2 overflow-x-auto pb-2 custom-scrollbar">
                  {scheduledDates.map((dateStr) => {
                    const isSelected = dateStr === activeDate;
                    const isToday = dateStr === todayStr;
                    const dateObj = new Date(dateStr);
                    const dayName = dateObj.toLocaleDateString('en-US', { weekday: 'short' });
                    const dayNum = dateObj.getDate();
                    const tasksForDay = timetable.schedule[dateStr] || [];
                    const allDone = tasksForDay.length > 0 && tasksForDay.every(t => t.completed);

                    return (
                      <button
                        key={dateStr}
                        onClick={() => setSelectedDate(dateStr)}
                        className={cn(
                          "flex-shrink-0 px-3.5 py-2 rounded-xl border text-center transition-all cursor-pointer min-w-18",
                          isSelected
                            ? (isDarkMode 
                                ? "bg-[#c8e558] text-slate-900 border-[#c8e558] font-bold shadow-xs" 
                                : "bg-slate-900 text-white border-slate-900 font-bold shadow-xs")
                            : (isDarkMode
                                ? "bg-white/[0.02] border-white/10 text-slate-300 hover:bg-white/[0.06]"
                                : "bg-slate-50 border-slate-200/80 text-slate-700 hover:bg-slate-100"),
                          allDone && !isSelected && "border-emerald-500/40 bg-emerald-500/5 text-emerald-600 dark:text-emerald-400"
                        )}
                      >
                        <div className="text-[10px] uppercase font-semibold opacity-75">
                          {isToday ? "Today" : dayName}
                        </div>
                        <div className="text-base font-bold my-0.5">
                          {dayNum}
                        </div>
                        <div className="text-[9.5px] font-medium opacity-80 flex items-center justify-center gap-0.5">
                          {allDone ? (
                            <CheckCircle2 className="w-2.5 h-2.5 text-emerald-500 fill-emerald-500" />
                          ) : (
                            `${tasksForDay.length} tasks`
                          )}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Daily Tasks List Container */}
            <div className={cn(
              "p-5 rounded-2xl border transition-all space-y-4",
              isDarkMode ? "bg-[#141416] border-white/10 shadow-xs" : "bg-white border-slate-200/90 shadow-2xs"
            )}>
              {/* Day Header */}
              <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-white/5">
                <div>
                  <h3 className="text-[15px] font-bold text-slate-900 dark:text-white flex items-center gap-2">
                    {new Date(activeDate).toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric', year: 'numeric' })}
                    {activeDate === todayStr && (
                      <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-amber-400/15 text-amber-600 dark:text-amber-400 border border-amber-400/30">
                        Today
                      </span>
                    )}
                  </h3>
                  <p className="text-[11.5px] text-slate-500 dark:text-slate-400 mt-0.5">
                    {activeDayStats.completed}/{activeDayStats.total} completed • Total Estimated Time: {activeDayStats.minutes} mins
                  </p>
                </div>

                <span className="text-[12px] font-bold px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-white/5 text-slate-700 dark:text-slate-300">
                  {activeDayStats.percent}% Done
                </span>
              </div>

              {/* Task Items */}
              {activeTasks.length > 0 ? (
                <div className="space-y-2.5">
                  {activeTasks.map((task) => {
                    const isRead = task.type === 'read';
                    const isQuiz = task.type === 'quiz' || task.type === 'practice_test';
                    const isRevision = task.type === 'revision';
                    const isBreak = task.type === 'break';

                    return (
                      <div 
                        key={task.id}
                        className={cn(
                          "p-3.5 rounded-xl border flex flex-col sm:flex-row sm:items-center justify-between gap-3 transition-all",
                          task.completed 
                            ? (isDarkMode ? "bg-white/[0.01] border-white/5 opacity-60" : "bg-slate-50/70 border-slate-200/50 opacity-60")
                            : (isDarkMode ? "bg-[#18181b] border-white/10 hover:border-white/20" : "bg-white border-slate-200/80 hover:border-slate-300 shadow-2xs")
                        )}
                      >
                        {/* Left: Checkbox + Title & Metadata */}
                        <div className="flex items-start gap-3">
                          <button
                            onClick={() => !task.completed && markCompleted({ date: activeDate, taskId: task.id })}
                            className="mt-0.5 cursor-pointer text-slate-400 hover:text-[#8ba32b] dark:hover:text-[#c8e558] transition-colors"
                            aria-label="Toggle task completion"
                          >
                            {task.completed ? (
                              <CheckCircle2 className="w-5 h-5 text-emerald-500 fill-emerald-500" />
                            ) : (
                              <Circle className="w-5 h-5" />
                            )}
                          </button>

                          <div>
                            <div className="flex flex-wrap items-center gap-2">
                              <h4 className={cn(
                                "text-[13px] font-semibold",
                                task.completed ? "line-through text-slate-400" : "text-slate-900 dark:text-white"
                              )}>
                                {task.title}
                              </h4>

                              {/* Type Badge */}
                              <span className={cn(
                                "text-[10px] font-semibold px-2 py-0.5 rounded-md uppercase tracking-wider",
                                isRead && "bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20",
                                isQuiz && "bg-[#8ba32b]/15 text-[#8ba32b] dark:bg-[#c8e558]/15 dark:text-[#c8e558] border border-[#8ba32b]/25 dark:border-[#c8e558]/25",
                                isRevision && "bg-purple-500/10 text-purple-600 dark:text-purple-400 border border-purple-500/20",
                                isBreak && "bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20"
                              )}>
                                {task.type}
                              </span>

                              {task.priority === 'high' && !task.completed && (
                                <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-sm bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20">
                                  High Priority
                                </span>
                              )}
                            </div>

                            <p className="text-[11.5px] text-slate-500 dark:text-slate-400 mt-1 flex items-center gap-1.5">
                              <span>{task.chapter}</span>
                              <span>•</span>
                              <span>{task.topic}</span>
                            </p>
                          </div>
                        </div>

                        {/* Right: Duration & Launch Button */}
                        <div className="flex items-center gap-2.5 self-end sm:self-center shrink-0">
                          <div className="flex items-center gap-1 text-[11px] font-medium text-slate-500 dark:text-slate-400">
                            <Clock className="w-3.5 h-3.5" />
                            <span>{task.estimatedMinutes}m</span>
                          </div>

                          {!isBreak && !task.completed && (
                            <button
                              onClick={() => handleLaunchTask(task)}
                              className={cn(
                                "flex items-center gap-1 px-3 py-1 rounded-lg text-[11.5px] font-semibold transition-all cursor-pointer",
                                isDarkMode 
                                  ? "bg-white/10 hover:bg-white/20 text-white" 
                                  : "bg-slate-100 hover:bg-slate-200 text-slate-900"
                              )}
                            >
                              <span>Launch</span>
                              <ChevronRight className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="text-center py-8 text-slate-500 dark:text-slate-400 text-[12.5px]">
                  No tasks scheduled for this date.
                </div>
              )}
            </div>
          </div>
        )}

        {/* Wizard Modal */}
        <AnimatePresence>
          {showWizard && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
              <motion.div 
                initial={{ opacity: 0, scale: 0.96 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.96 }}
                className={cn(
                  "p-6 sm:p-7 rounded-2xl max-w-lg w-full border shadow-2xl space-y-5",
                  isDarkMode ? "bg-[#141416] border-white/15 text-white" : "bg-white border-slate-200 text-slate-900"
                )}
              >
                <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-white/10">
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-xl bg-[#8ba32b]/15 dark:bg-[#c8e558]/15 text-[#8ba32b] dark:text-[#c8e558] flex items-center justify-center">
                      <Sparkles className="w-4 h-4" />
                    </div>
                    <div>
                      <h2 className="text-[15px] font-bold">Generate AI Study Schedule</h2>
                      <p className="text-[11.5px] text-slate-500 dark:text-slate-400">Configure your target exam and study availability</p>
                    </div>
                  </div>
                  <button 
                    onClick={() => setShowWizard(false)}
                    className="text-slate-400 hover:text-slate-600 dark:hover:text-white text-[14px] cursor-pointer"
                  >
                    ✕
                  </button>
                </div>
                
                <div className="space-y-4">
                  <div>
                    <label className="block text-[11.5px] font-semibold text-slate-700 dark:text-slate-300 mb-1">
                      Target Exam / Focus Goal
                    </label>
                    <input 
                      type="text" 
                      value={targetExam}
                      onChange={e => setTargetExam(e.target.value)}
                      placeholder="e.g. UPSC CSE 2026, GATE CSE, JEE Advanced"
                      className={cn(
                        "w-full px-3 py-2 rounded-xl text-[12.5px] border outline-none transition-all",
                        isDarkMode ? "bg-white/5 border-white/10 text-white focus:border-[#c8e558]" : "bg-slate-50 border-slate-200 text-slate-900 focus:border-slate-400"
                      )}
                    />
                  </div>

                  <div>
                    <label className="block text-[11.5px] font-semibold text-slate-700 dark:text-slate-300 mb-1">
                      Target Horizon
                    </label>
                    <div className="grid grid-cols-4 gap-2">
                      {[30, 60, 90, 180].map((days) => (
                        <button
                          key={days}
                          type="button"
                          onClick={() => setTargetDaysOffset(days)}
                          className={cn(
                            "py-1.5 rounded-lg text-[11px] font-semibold border transition-all cursor-pointer",
                            targetDaysOffset === days
                              ? (isDarkMode ? "bg-[#c8e558] text-slate-900 border-[#c8e558]" : "bg-slate-900 text-white border-slate-900")
                              : (isDarkMode ? "bg-white/5 border-white/10 text-slate-300" : "bg-slate-100 border-slate-200 text-slate-700")
                          )}
                        >
                          {days} Days
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="text-[11.5px] font-semibold text-slate-700 dark:text-slate-300">
                        Weekly Commitment
                      </label>
                      <span className="text-[11.5px] font-bold text-[#8ba32b] dark:text-[#c8e558]">
                        {weeklyHours} Hours / Week
                      </span>
                    </div>
                    <input 
                      type="range"
                      min={5}
                      max={40}
                      step={1}
                      value={weeklyHours}
                      onChange={e => setWeeklyHours(Number(e.target.value))}
                      className="w-full accent-[#8ba32b] dark:accent-[#c8e558] cursor-pointer"
                    />
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[11.5px] font-semibold text-slate-700 dark:text-slate-300 mb-1">
                        Planning Mode
                      </label>
                      <select 
                        value={planningMode}
                        onChange={e => setPlanningMode(e.target.value as any)}
                        className={cn(
                          "w-full px-3 py-2 rounded-xl text-[12px] border outline-none transition-all",
                          isDarkMode ? "bg-[#18181b] border-white/10 text-white" : "bg-slate-50 border-slate-200 text-slate-900"
                        )}
                      >
                        <option value="Balanced">Balanced</option>
                        <option value="Crash Course">Crash Course</option>
                        <option value="Weekend Only">Weekend Only</option>
                        <option value="Working Professional">Working Professional</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-[11.5px] font-semibold text-slate-700 dark:text-slate-300 mb-1">
                        Study Style
                      </label>
                      <select 
                        value={preferredStudyHours}
                        onChange={e => setPreferredStudyHours(e.target.value as any)}
                        className={cn(
                          "w-full px-3 py-2 rounded-xl text-[12px] border outline-none transition-all",
                          isDarkMode ? "bg-[#18181b] border-white/10 text-white" : "bg-slate-50 border-slate-200 text-slate-900"
                        )}
                      >
                        <option value="Flexible">Flexible Pacing</option>
                        <option value="Morning">Morning Focus</option>
                        <option value="Night">Night Owl</option>
                      </select>
                    </div>
                  </div>
                </div>

                <div className="flex gap-2 justify-end pt-3 border-t border-slate-100 dark:border-white/10">
                  <button 
                    onClick={() => setShowWizard(false)}
                    className="px-4 py-1.5 rounded-xl text-[12px] font-semibold text-slate-500 hover:bg-slate-100 dark:hover:bg-white/10 transition-colors cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button 
                    onClick={handleGenerate}
                    disabled={isGenerating}
                    className={cn(
                      "flex items-center gap-1.5 px-5 py-1.5 rounded-xl text-[12px] font-semibold transition-all cursor-pointer shadow-xs active:scale-98",
                      isDarkMode 
                        ? "bg-[#c8e558] hover:bg-[#bcd94c] text-slate-900" 
                        : "bg-slate-900 hover:bg-slate-800 text-white"
                    )}
                  >
                    {isGenerating ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
                    <span>Generate Schedule</span>
                  </button>
                </div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
