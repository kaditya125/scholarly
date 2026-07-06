import { useState } from "react";
import { Link } from "react-router-dom";
import { 
  Activity, Award, TrendingUp, Brain, Zap, Target,
  BookOpen, ChevronRight, Loader2, Sparkles, AlertTriangle, Calendar, Bell, Coffee
} from "lucide-react";
import { motion } from "motion/react";
import { useUserStats } from "../hooks/api/useUserStats";

import { DashboardSkeleton } from "../components/ui/SkeletonLoader";

import { CostAnalyticsWidget } from '../components/dashboard/CostAnalyticsWidget';

export default function Dashboard() {
  const { stats, isLoading, isError } = useUserStats();
  const [isReviewModalOpen, setIsReviewModalOpen] = useState(false);

  if (isLoading) {
    return <DashboardSkeleton />;
  }

  if (isError || !stats) {
    return (
      <div className="flex flex-col h-full items-center justify-center bg-slate-50 dark:bg-[#131314] text-slate-500">
        <AlertTriangle className="w-12 h-12 mb-4 text-rose-500" />
        <h2 className="text-xl font-medium text-slate-900 dark:text-white">Unable to load dashboard</h2>
        <p>Please try refreshing the page.</p>
      </div>
    );
  }

  const { gamification, aiRecommendations } = stats;

  return (
    <div className="w-full h-full overflow-y-auto custom-scrollbar p-6 bg-slate-50 dark:bg-[#131314] text-slate-900 dark:text-white transition-colors duration-300">
      <div className="max-w-[1400px] mx-auto space-y-8">
        
        {/* Top Section: Daily AI Coach (Morning Briefing) */}
        <div className="bg-gradient-to-r from-teal-500 to-emerald-500 dark:from-teal-600 dark:to-emerald-700 rounded-[32px] p-8 text-white shadow-lg relative overflow-hidden">
          <div className="absolute top-0 right-0 p-8 opacity-10">
            <Sparkles className="w-48 h-48" />
          </div>
          <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-8">
            <div className="max-w-2xl">
              <div className="inline-flex items-center gap-2 px-3 py-1 bg-white/20 backdrop-blur-md rounded-full text-sm font-medium mb-4">
                <Brain className="w-4 h-4" /> Daily AI Coach Briefing
              </div>
              <h1 className="text-3xl md:text-4xl font-bold mb-3">Good Morning, Scholar!</h1>
              <p className="text-teal-50 text-lg opacity-90 leading-relaxed">
                You have 15 days left until UPSC CSE. Yesterday, you missed 2 tasks. Let's make up for it today. Your learning velocity is excellent.
              </p>
              <div className="mt-6 flex flex-wrap gap-3">
                <button className="px-6 py-3 bg-white text-teal-700 dark:bg-slate-900 dark:text-teal-400 rounded-full font-bold hover:bg-teal-50 dark:hover:bg-slate-800 transition-colors shadow-sm">
                  Start Today's Plan
                </button>
                <button className="px-6 py-3 bg-teal-600/50 hover:bg-teal-600/70 text-white rounded-full font-medium transition-colors backdrop-blur-sm">
                  View missed tasks
                </button>
              </div>
            </div>
            
            {/* Exam Countdown block */}
            <div className="bg-black/20 backdrop-blur-md rounded-3xl p-6 border border-white/20 min-w-[260px] shadow-inner">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2 text-teal-100 text-sm font-medium uppercase tracking-wider">
                  <Calendar className="w-4 h-4" />
                  UPSC CSE 2026
                </div>
              </div>
              <div className="flex items-baseline gap-2 mb-2">
                <span className="text-5xl font-black tracking-tight">15</span>
                <span className="text-xl font-medium opacity-80">Days</span>
              </div>
              <div className="text-teal-100 text-sm mb-4">
                Pace: <strong className="text-white">4 chapters/day</strong> needed
              </div>
              <div className="h-2.5 bg-black/30 rounded-full overflow-hidden">
                <motion.div 
                  initial={{ width: 0 }}
                  animate={{ width: '85%' }}
                  transition={{ duration: 1, ease: "easeOut" }}
                  className="h-full bg-white rounded-full" 
                />
              </div>
              <div className="flex justify-between text-xs mt-2 text-teal-100">
                <span>Start</span>
                <span>85% completed</span>
              </div>
            </div>
          </div>
        </div>

        {/* Cost Analytics & Core Metrics Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="md:col-span-1">
            <CostAnalyticsWidget isAdminMode={false} />
          </div>
          
          <div className="md:col-span-2 grid grid-cols-1 md:grid-cols-2 gap-6">
            <MetricCard 
              icon={<Target className="w-6 h-6 text-blue-500" />}
              title="Overall Mastery"
              value={`${stats.averageAccuracy}%`}
              trend="+2.5% this week"
              trendUp={true}
            />
            <MetricCard 
            icon={<Zap className="w-6 h-6 text-amber-500" />}
            title="Study Streak"
            value={`${gamification.studyStreakDays} Days`}
            trend={`Best: ${gamification.longestStreak} Days`}
            trendUp={gamification.studyStreakDays >= gamification.longestStreak}
          />
          <MetricCard 
            icon={<Brain className="w-6 h-6 text-purple-500" />}
            title="Retention Score"
            value={`${stats.retentionScore}/100`}
            trend="Based on spaced repetition"
            trendUp={stats.retentionScore > 75}
          />
          <MetricCard 
            icon={<Activity className="w-6 h-6 text-teal-500" />}
            title="Learning Velocity"
            value={`${stats.learningVelocity}`}
            trend="Concepts / week"
            trendUp={true}
          />
          </div>
        </div>

        {/* Phase 5 New Widgets */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          
          {/* Daily Learning Health */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-[32px] p-8 shadow-sm flex flex-col items-center justify-center relative overflow-hidden group">
            <div className="absolute inset-0 bg-gradient-to-br from-indigo-500/5 to-purple-500/5 opacity-0 group-hover:opacity-100 transition-opacity" />
            <h3 className="text-lg font-bold mb-6 w-full text-left flex items-center gap-2">
              <Activity className="w-5 h-5 text-indigo-500" /> Daily Learning Health
            </h3>
            <div className="relative w-40 h-40 flex items-center justify-center">
              <svg className="w-full h-full transform -rotate-90" viewBox="0 0 100 100">
                <circle cx="50" cy="50" r="40" className="stroke-slate-100 dark:stroke-slate-800" strokeWidth="10" fill="none" />
                <motion.circle 
                  cx="50" cy="50" r="40" 
                  className="stroke-indigo-500" 
                  strokeWidth="10" 
                  fill="none" 
                  strokeLinecap="round"
                  initial={{ strokeDasharray: "251.2", strokeDashoffset: "251.2" }}
                  animate={{ strokeDashoffset: 251.2 - (251.2 * 0.85) }}
                  transition={{ duration: 1.5, ease: "easeOut" }}
                />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-3xl font-black text-indigo-600 dark:text-indigo-400">85%</span>
                <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Health</span>
              </div>
            </div>
          </div>

          {/* Exam Readiness Predictor */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-[32px] p-8 shadow-sm relative overflow-hidden group">
            <div className="absolute inset-0 bg-gradient-to-br from-emerald-500/5 to-teal-500/5 opacity-0 group-hover:opacity-100 transition-opacity" />
            <h3 className="text-lg font-bold mb-6 w-full text-left flex items-center gap-2">
              <Target className="w-5 h-5 text-emerald-500" /> Exam Readiness Predictor
            </h3>
            <div className="space-y-4">
              <div className="flex justify-between items-center p-4 bg-slate-50 dark:bg-slate-800/50 rounded-2xl border border-slate-100 dark:border-slate-700/50">
                <span className="text-slate-500 dark:text-slate-400 font-medium">Estimated Score</span>
                <span className="text-xl font-bold text-slate-900 dark:text-white">112<span className="text-sm font-medium text-slate-400">/200</span></span>
              </div>
              <div className="flex justify-between items-center p-4 bg-slate-50 dark:bg-slate-800/50 rounded-2xl border border-slate-100 dark:border-slate-700/50">
                <span className="text-slate-500 dark:text-slate-400 font-medium">Projected Percentile</span>
                <span className="text-xl font-bold text-emerald-600 dark:text-emerald-400">92nd</span>
              </div>
              <div className="flex justify-between items-center p-4 bg-slate-50 dark:bg-slate-800/50 rounded-2xl border border-slate-100 dark:border-slate-700/50">
                <span className="text-slate-500 dark:text-slate-400 font-medium">Confidence Level</span>
                <span className="px-3 py-1 bg-emerald-100 dark:bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 rounded-full text-sm font-bold">High</span>
              </div>
            </div>
          </div>

          {/* AI Weekly Review */}
          <div 
            onClick={() => setIsReviewModalOpen(true)}
            className="bg-gradient-to-br from-violet-600 to-fuchsia-600 rounded-[32px] p-8 text-white shadow-lg relative overflow-hidden group cursor-pointer"
          >
            <div className="absolute top-0 right-0 p-6 opacity-20 transform group-hover:scale-110 transition-transform duration-500">
              <Sparkles className="w-32 h-32" />
            </div>
            <div className="relative z-10 h-full flex flex-col justify-between">
              <div>
                <div className="inline-flex items-center gap-2 px-3 py-1 bg-white/20 backdrop-blur-md rounded-full text-sm font-medium mb-4">
                  <Calendar className="w-4 h-4" /> Weekly Insight
                </div>
                <h3 className="text-2xl font-bold mb-2">AI Weekly Review</h3>
                <p className="text-violet-100 opacity-90 text-sm leading-relaxed">
                  Your personalized breakdown of this week's progress, strengths, and areas to focus on next.
                </p>
              </div>
              <div className="mt-6">
                <button className="w-full py-3 bg-white text-violet-700 rounded-xl font-bold hover:bg-violet-50 transition-colors shadow-sm flex items-center justify-center gap-2">
                  Open Review <ChevronRight className="w-5 h-5" />
                </button>
              </div>
            </div>
          </div>

        </div>

        {/* Two-Column Layout */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          
          {/* Main Column: AI Recommendations */}
          <div className="lg:col-span-2 space-y-8">
            <section>
              <div className="flex items-center gap-2 mb-6">
                <Sparkles className="w-6 h-6 text-teal-500" />
                <h2 className="text-2xl font-bold">AI Coach Recommendations</h2>
              </div>
              
              <div className="space-y-4">
                {aiRecommendations.length > 0 ? (
                  aiRecommendations.map((rec, i) => (
                    <motion.div 
                      key={i}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: i * 0.1 }}
                      className="p-6 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-[24px] shadow-sm hover:border-teal-500/30 transition-colors flex items-start gap-4"
                    >
                      <div className={`p-3 rounded-xl ${
                        rec.type === 'review' ? 'bg-rose-100 text-rose-600 dark:bg-rose-500/20 dark:text-rose-400' :
                        rec.type === 'quiz' ? 'bg-amber-100 text-amber-600 dark:bg-amber-500/20 dark:text-amber-400' :
                        'bg-teal-100 text-teal-600 dark:bg-teal-500/20 dark:text-teal-400'
                      }`}>
                        {rec.type === 'review' ? <AlertTriangle className="w-6 h-6" /> : 
                         rec.type === 'quiz' ? <HelpCircle className="w-6 h-6" /> : 
                         <Award className="w-6 h-6" />}
                      </div>
                      <div className="flex-1">
                        <h3 className="text-lg font-bold mb-1">{rec.title}</h3>
                        <p className="text-slate-700 dark:text-slate-300 mb-3">{rec.message}</p>
                        <div className="p-3 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-100 dark:border-slate-700/50 flex gap-2">
                          <Brain className="w-4 h-4 text-purple-500 shrink-0 mt-0.5" />
                          <p className="text-sm text-slate-600 dark:text-slate-400">
                            <span className="font-semibold text-purple-600 dark:text-purple-400">AI Reasoning: </span> 
                            {(rec as any).reasoning || "Recommended because your Geometry accuracy dropped, affecting your overall mastery trend."}
                          </p>
                        </div>
                      </div>
                      <button className="px-4 py-2 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 rounded-full font-medium transition-colors text-sm">
                        Action
                      </button>
                    </motion.div>
                  ))
                ) : (
                  <div className="p-8 text-center bg-white dark:bg-slate-900 rounded-[24px] border border-slate-200 dark:border-slate-800">
                    <p className="text-slate-500">No active recommendations. Keep studying!</p>
                  </div>
                )}
              </div>
            </section>
          </div>

          {/* Sidebar Column: Weak & Strong Topics */}
          <div className="space-y-8">
            <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-[32px] p-8 relative overflow-hidden shadow-sm">
              <div className="absolute top-0 left-0 w-1.5 h-full bg-amber-500"></div>
              <h3 className="text-xl font-bold mb-6 flex items-center gap-2">
                <Bell className="w-5 h-5 text-amber-500" />
                Coach Notifications
              </h3>
              <div className="space-y-4">
                <motion.div 
                  whileHover={{ scale: 1.02 }}
                  className="p-4 bg-amber-50 dark:bg-amber-500/10 border border-amber-100 dark:border-amber-500/20 rounded-2xl cursor-pointer"
                >
                  <h4 className="font-bold text-amber-800 dark:text-amber-300 text-sm mb-1">Geometry mastery dropped</h4>
                  <p className="text-sm text-amber-900/80 dark:text-amber-100/80 mb-2">Your recent test scores indicate a 12% drop.</p>
                  <div className="p-2 bg-amber-100/50 dark:bg-amber-900/30 rounded-lg flex gap-1.5 items-start">
                    <Brain className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                    <p className="text-xs text-amber-800 dark:text-amber-300">
                      <span className="font-semibold">Reasoning:</span> Recommended because your Geometry accuracy dropped, affecting your projected percentile.
                    </p>
                  </div>
                </motion.div>
                <motion.div 
                  whileHover={{ scale: 1.02 }}
                  className="p-4 bg-rose-50 dark:bg-rose-500/10 border border-rose-100 dark:border-rose-500/20 rounded-2xl cursor-pointer"
                >
                  <h4 className="font-bold text-rose-800 dark:text-rose-300 text-sm mb-1">Overdue Revision</h4>
                  <p className="text-xs text-rose-700/70 dark:text-rose-400/70">You have 3 topics from History that are past their spaced repetition date.</p>
                </motion.div>
                <motion.div 
                  whileHover={{ scale: 1.02 }}
                  className="p-4 bg-blue-50 dark:bg-blue-500/10 border border-blue-100 dark:border-blue-500/20 rounded-2xl cursor-pointer"
                >
                  <h4 className="font-bold text-blue-800 dark:text-blue-300 text-sm mb-1">Peak Focus Time</h4>
                  <p className="text-xs text-blue-700/70 dark:text-blue-400/70">Based on your history, you study best at 9 AM. Schedule hard tasks then.</p>
                </motion.div>
              </div>
            </section>

            <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-[32px] p-8 shadow-sm">
              <h3 className="text-xl font-bold mb-6 flex items-center gap-2">
                <Target className="w-5 h-5 text-emerald-500" />
                Strong Topics
              </h3>
              <div className="space-y-3">
                {stats.strongTopics.length > 0 ? (
                  stats.strongTopics.map((topic, i) => (
                    <div key={i} className="flex items-center justify-between p-3 bg-slate-50 dark:bg-[#131314] rounded-xl border border-slate-100 dark:border-slate-800/50">
                      <span className="font-medium text-sm">{topic}</span>
                      <Award className="w-4 h-4 text-emerald-500" />
                    </div>
                  ))
                ) : (
                  <p className="text-sm text-slate-500">Keep testing to discover strengths.</p>
                )}
              </div>
            </section>

            <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-[32px] p-8">
              <h3 className="text-xl font-bold mb-6 flex items-center gap-2">
                <AlertTriangle className="w-5 h-5 text-rose-500" />
                Weak Topics
              </h3>
              <div className="space-y-3">
                {stats.weakTopics.length > 0 ? (
                  stats.weakTopics.map((topic, i) => (
                    <div key={i} className="flex items-center justify-between p-3 bg-slate-50 dark:bg-[#131314] rounded-xl border border-slate-100 dark:border-slate-800/50">
                      <span className="font-medium text-sm">{topic}</span>
                      <TrendingUp className="w-4 h-4 text-rose-500 rotate-180" />
                    </div>
                  ))
                ) : (
                  <p className="text-sm text-slate-500">No weak topics identified yet.</p>
                )}
              </div>
            </section>
          </div>

        </div>
      </div>

      {/* AI Weekly Review Modal */}
      {isReviewModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm" onClick={() => setIsReviewModalOpen(false)}>
          <motion.div 
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            onClick={(e) => e.stopPropagation()}
            className="bg-white dark:bg-slate-900 rounded-[32px] p-8 max-w-md w-full shadow-2xl border border-slate-200 dark:border-slate-800 relative overflow-hidden"
          >
            <div className="absolute top-0 right-0 p-6 opacity-10">
              <Sparkles className="w-32 h-32 text-violet-500" />
            </div>
            <div className="relative z-10 text-center">
              <div className="w-16 h-16 bg-violet-100 dark:bg-violet-500/20 text-violet-600 dark:text-violet-400 rounded-full flex items-center justify-center mx-auto mb-6">
                <Brain className="w-8 h-8" />
              </div>
              <h2 className="text-2xl font-bold mb-4">Your Weekly Review</h2>
              <p className="text-slate-500 dark:text-slate-400 mb-8">
                Your Weekly Review will appear here. The AI is currently generating your personalized insights based on your learning patterns.
              </p>
              <button 
                onClick={() => setIsReviewModalOpen(false)}
                className="w-full py-3 bg-slate-900 dark:bg-white text-white dark:text-slate-900 rounded-xl font-bold hover:bg-slate-800 dark:hover:bg-slate-100 transition-colors"
              >
                Close
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </div>
  );
}

// Helper Components

import { LucideIcon, HelpCircle } from "lucide-react";

function MetricCard({ icon, title, value, trend, trendUp }: { icon: any, title: string, value: string | number, trend: string, trendUp: boolean }) {
  return (
    <div className="bg-white dark:bg-slate-900 p-6 rounded-[24px] border border-slate-200 dark:border-slate-800 shadow-sm relative overflow-hidden group">
      <div className="flex justify-between items-start mb-4 relative z-10">
        <div className="p-3 bg-slate-50 dark:bg-[#131314] rounded-2xl">
          {icon}
        </div>
        {trendUp ? (
          <span className="flex items-center text-xs font-medium text-emerald-600 bg-emerald-100 dark:bg-emerald-500/20 dark:text-emerald-400 px-2 py-1 rounded-full">
            <TrendingUp className="w-3 h-3 mr-1" /> {trend}
          </span>
        ) : (
          <span className="flex items-center text-xs font-medium text-slate-600 bg-slate-100 dark:bg-slate-800 dark:text-slate-400 px-2 py-1 rounded-full">
            {trend}
          </span>
        )}
      </div>
      <div className="relative z-10">
        <h3 className="text-slate-500 dark:text-slate-400 text-sm font-medium mb-1">{title}</h3>
        <p className="text-3xl font-bold">{value}</p>
      </div>
    </div>
  );
}
