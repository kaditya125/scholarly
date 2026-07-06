import { useState } from "react";
import { 
  Calendar, CheckCircle, Circle, Play, RefreshCw, 
  Sparkles, BookOpen, Brain, Clock, ChevronRight, AlertTriangle,
  Coffee, HeartPulse
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { usePlanner } from "../hooks/api/usePlanner";

export default function Planner() {
  const { timetable, isLoading, generateTimetable, isGenerating, markCompleted, adaptTimetable, isAdapting } = usePlanner();
  const [showWizard, setShowWizard] = useState(false);

  // Wizard state
  const [targetExam, setTargetExam] = useState("UPSC CSE 2026");
  const [weeklyHours, setWeeklyHours] = useState(15);
  const [planningMode, setPlanningMode] = useState("Balanced");
  const [preferredStudyHours, setPreferredStudyHours] = useState("Flexible");

  const handleGenerate = async () => {
    await generateTimetable({
      targetExam,
      examDate: new Date(Date.now() + 86400000 * 90).toISOString(), // +90 days
      subjects: ["General Studies", "History", "Polity"],
      weeklyHours,
      // @ts-ignore
      planningMode,
      // @ts-ignore
      preferredStudyHours
    });
    setShowWizard(false);
  };

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center bg-slate-50 dark:bg-[#131314]">
        <RefreshCw className="w-8 h-8 animate-spin text-teal-500" />
      </div>
    );
  }

  return (
    <div className="w-full h-full overflow-y-auto custom-scrollbar p-6 bg-slate-50 dark:bg-[#131314] text-slate-900 dark:text-white transition-colors duration-300">
      <div className="max-w-[1000px] mx-auto space-y-8">
        
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold">AI Adaptive Planner</h1>
            <p className="text-slate-500 mt-1">Your personalized, chapter-level study schedule.</p>
          </div>
          <div className="flex gap-3">
            {timetable && (
              <>
                <button 
                  onClick={() => adaptTimetable()}
                  className="flex items-center gap-2 px-4 py-2 bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-400 hover:bg-emerald-200 dark:hover:bg-emerald-500/30 rounded-full font-medium transition-colors"
                >
                  <HeartPulse className="w-4 h-4" />
                  Intelligent Recovery
                </button>
                <button 
                  onClick={() => adaptTimetable()}
                  disabled={isAdapting}
                  className="flex items-center gap-2 px-4 py-2 bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-400 hover:bg-amber-200 dark:hover:bg-amber-500/30 rounded-full font-medium transition-colors"
                >
                  {isAdapting ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                  Rebalance Plan
                </button>
              </>
            )}
            <button 
              onClick={() => setShowWizard(true)}
              className="flex items-center gap-2 px-4 py-2 bg-teal-500 hover:bg-teal-600 text-white rounded-full font-medium transition-colors"
            >
              <Calendar className="w-4 h-4" />
              New Goal
            </button>
          </div>
        </div>

        {/* Wizard Modal */}
        <AnimatePresence>
          {showWizard && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
              <motion.div 
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="bg-white dark:bg-slate-900 rounded-[32px] p-8 max-w-md w-full shadow-2xl border border-slate-200 dark:border-slate-800"
              >
                <div className="flex items-center gap-3 mb-6">
                  <div className="p-3 bg-teal-100 dark:bg-teal-500/20 text-teal-600 dark:text-teal-400 rounded-xl">
                    <Sparkles className="w-6 h-6" />
                  </div>
                  <h2 className="text-2xl font-bold">Generate AI Schedule</h2>
                </div>
                
                <div className="space-y-4 mb-8">
                  <div>
                    <label className="block text-sm font-medium mb-1">Target Exam</label>
                    <input 
                      type="text" 
                      value={targetExam}
                      onChange={e => setTargetExam(e.target.value)}
                      className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-3"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1">Weekly Commitment (Hours)</label>
                    <input 
                      type="number" 
                      value={weeklyHours}
                      onChange={e => setWeeklyHours(Number(e.target.value))}
                      className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-3"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1">Planning Mode</label>
                    <div className="relative">
                      <select 
                        value={planningMode}
                        onChange={e => setPlanningMode(e.target.value)}
                        className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-3 appearance-none focus:outline-none focus:ring-2 focus:ring-teal-500/50"
                      >
                        <option value="Crash Course">Crash Course</option>
                        <option value="Balanced">Balanced</option>
                        <option value="Weekend Only">Weekend Only</option>
                        <option value="Working Professional">Working Professional</option>
                      </select>
                      <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-4 text-slate-500">
                        <ChevronRight className="w-4 h-4 rotate-90" />
                      </div>
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1">Preferred Study Hours</label>
                    <div className="relative">
                      <select 
                        value={preferredStudyHours}
                        onChange={e => setPreferredStudyHours(e.target.value)}
                        className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-3 appearance-none focus:outline-none focus:ring-2 focus:ring-teal-500/50"
                      >
                        <option value="Morning">Morning</option>
                        <option value="Night">Night</option>
                        <option value="Flexible">Flexible</option>
                      </select>
                      <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-4 text-slate-500">
                        <ChevronRight className="w-4 h-4 rotate-90" />
                      </div>
                    </div>
                  </div>
                </div>

                <div className="flex gap-3 justify-end">
                  <button 
                    onClick={() => setShowWizard(false)}
                    className="px-6 py-3 rounded-xl font-medium text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
                  >
                    Cancel
                  </button>
                  <button 
                    onClick={handleGenerate}
                    disabled={isGenerating}
                    className="flex items-center gap-2 px-6 py-3 bg-teal-500 hover:bg-teal-600 text-white rounded-xl font-medium shadow-md shadow-teal-500/20"
                  >
                    {isGenerating ? <RefreshCw className="w-5 h-5 animate-spin" /> : 'Generate'}
                  </button>
                </div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>

        {/* Timetable View */}
        {!timetable ? (
          <div className="p-12 text-center bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-[32px] shadow-sm">
            <Calendar className="w-16 h-16 text-slate-300 dark:text-slate-700 mx-auto mb-4" />
            <h2 className="text-xl font-bold mb-2">No active study plan</h2>
            <p className="text-slate-500 mb-6">Create a goal to generate an AI-driven daily timetable.</p>
            <button 
              onClick={() => setShowWizard(true)}
              className="px-6 py-3 bg-teal-500 hover:bg-teal-600 text-white rounded-full font-medium"
            >
              Create Study Plan
            </button>
          </div>
        ) : (
          <div className="space-y-8">
            {Object.entries(timetable.schedule).map(([date, tasks]) => {
              const isToday = new Date().toISOString().split('T')[0] === date;
              
              return (
                <div key={date} className={`p-6 rounded-[24px] border ${isToday ? 'bg-teal-50/50 dark:bg-teal-900/10 border-teal-200 dark:border-teal-900/50' : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800'}`}>
                  <h3 className="text-lg font-bold mb-4 flex items-center gap-2">
                    {new Date(date).toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })}
                    {isToday && <span className="text-xs px-2 py-1 bg-teal-100 text-teal-700 dark:bg-teal-500/20 dark:text-teal-400 rounded-md">Today</span>}
                  </h3>
                  
                  <div className="space-y-3">
                    {tasks.map(task => (
                      <div 
                        key={task.id} 
                        className={`flex items-center gap-4 p-4 rounded-xl border transition-colors ${
                          task.completed 
                            ? 'bg-slate-50 dark:bg-slate-800/50 border-slate-200 dark:border-slate-800 opacity-60' 
                            : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 hover:border-teal-500/50'
                        }`}
                      >
                        <button 
                          onClick={() => !task.completed && markCompleted({ date, taskId: task.id })}
                          className="flex-shrink-0"
                        >
                          {task.completed ? (
                            <CheckCircle className="w-6 h-6 text-teal-500" />
                          ) : (
                            <Circle className="w-6 h-6 text-slate-300 dark:text-slate-600 hover:text-teal-500" />
                          )}
                        </button>
                        
                        <div className="flex-1 min-w-0">
                          <h4 className={`font-bold truncate ${task.completed ? 'line-through text-slate-500' : ''}`}>
                            {task.title}
                          </h4>
                          <p className="text-sm text-slate-500 flex items-center gap-2 mt-1">
                            {task.type === 'break' ? <Coffee className="w-4 h-4 text-amber-600 dark:text-amber-400 bg-amber-100 dark:bg-amber-900/30 p-0.5 rounded" /> :
                             task.type === 'read' ? <BookOpen className="w-4 h-4 text-blue-600 dark:text-blue-400 bg-blue-100 dark:bg-blue-900/30 p-0.5 rounded" /> :
                             task.type === 'quiz' ? <AlertTriangle className="w-4 h-4 text-rose-600 dark:text-rose-400 bg-rose-100 dark:bg-rose-900/30 p-0.5 rounded" /> :
                             <Brain className="w-4 h-4 text-purple-600 dark:text-purple-400 bg-purple-100 dark:bg-purple-900/30 p-0.5 rounded" />}
                            <span className={task.type === 'break' ? 'font-medium text-amber-700 dark:text-amber-500' : ''}>
                              {task.type === 'break' ? task.topic : `${task.chapter} • ${task.topic}`}
                            </span>
                          </p>
                        </div>
                        
                        <div className="flex items-center gap-2 text-sm font-medium text-slate-500">
                          <Clock className="w-4 h-4" />
                          {task.estimatedMinutes}m
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
