import { useState } from "react";
import { Link } from "react-router-dom";
import { Activity, ArrowRight, ChevronRight, BarChart2, BookOpen, Clock, Brain } from "lucide-react";
import { motion } from "motion/react";
import { 
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  BarChart, Bar, AreaChart, Area
} from "recharts";
import { useUserStats } from "../hooks/api/useUserStats";
import { Loader2, AlertTriangle } from "lucide-react";
import { DashboardSkeleton } from "../components/ui/SkeletonLoader";
import { CostAnalyticsWidget } from "../components/dashboard/CostAnalyticsWidget";

export default function Analytics() {
  const { stats, isLoading, isError } = useUserStats();

  if (isLoading) {
    return <DashboardSkeleton />;
  }

  if (isError || !stats) {
    return (
      <div className="flex h-full items-center justify-center bg-slate-50 dark:bg-[#131314] text-slate-500">
        <AlertTriangle className="w-12 h-12 mb-4 text-rose-500" />
        <p>Failed to load analytics</p>
      </div>
    );
  }

  return (
    <div className="w-full h-full overflow-y-auto custom-scrollbar p-6 bg-slate-50 dark:bg-[#131314] text-slate-900 dark:text-white transition-colors duration-300">
      <div className="max-w-[1400px] mx-auto space-y-8">
        
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold">Analytics & Growth</h1>
            <p className="text-slate-500 mt-1">Deep dive into your learning habits and retention.</p>
          </div>
          <div className="flex items-center gap-2">
            <span className="px-4 py-2 bg-white dark:bg-slate-900 rounded-full text-sm font-medium border border-slate-200 dark:border-slate-800 shadow-sm">
              Last 6 Months
            </span>
          </div>
        </div>

        {/* Cost Analytics */}
        <section>
          <CostAnalyticsWidget isAdminMode={false} />
        </section>

        {/* Activity Heatmap */}
        <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-[32px] p-8 shadow-sm">
          <div className="flex items-center justify-between mb-8">
            <h3 className="text-xl font-bold flex items-center gap-2">
              <Activity className="w-5 h-5 text-teal-500" />
              Activity Heatmap
            </h3>
            <span className="text-sm text-slate-500">{stats.activityHeatmap.length} days active</span>
          </div>
          
          <div className="flex gap-2 flex-wrap">
            {stats.activityHeatmap.length > 0 ? (
              stats.activityHeatmap.map((day, i) => (
                <div 
                  key={i} 
                  className={`w-4 h-4 rounded-sm ${
                    day.intensity === 0 ? 'bg-slate-100 dark:bg-slate-800' :
                    day.intensity === 1 ? 'bg-teal-200 dark:bg-teal-900/40' :
                    day.intensity === 2 ? 'bg-teal-300 dark:bg-teal-700/60' :
                    day.intensity === 3 ? 'bg-teal-400 dark:bg-teal-500/80' :
                    'bg-teal-500 dark:bg-teal-400'
                  }`}
                  title={`${day.date}: ${day.count} actions`}
                />
              ))
            ) : (
              <div className="text-slate-500 py-4">No recent activity. Start studying to build your heatmap!</div>
            )}
          </div>
        </section>

        {/* Performance Charts */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          
          {/* Topic Performance */}
          <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-[32px] p-8 shadow-sm">
            <h3 className="text-xl font-bold mb-6 flex items-center gap-2">
              <BarChart2 className="w-5 h-5 text-blue-500" />
              Historical Quiz Performance
            </h3>
            <div className="h-72">
              {stats.performanceHistory.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={stats.performanceHistory}>
                    <defs>
                      <linearGradient id="colorScore" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#0ea5e9" stopOpacity={0.3}/>
                        <stop offset="95%" stopColor="#0ea5e9" stopOpacity={0}/>
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#334155" opacity={0.2} />
                    <XAxis dataKey="topic" axisLine={false} tickLine={false} />
                    <YAxis axisLine={false} tickLine={false} domain={[0, 100]} />
                    <Tooltip 
                      contentStyle={{ backgroundColor: '#0f172a', border: 'none', borderRadius: '12px', color: '#fff' }}
                      itemStyle={{ color: '#38bdf8' }}
                    />
                    <Area type="monotone" dataKey="score" stroke="#0ea5e9" strokeWidth={3} fillOpacity={1} fill="url(#colorScore)" />
                  </AreaChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex h-full items-center justify-center text-slate-500">
                  Take some quizzes to see your historical performance.
                </div>
              )}
            </div>
          </section>

          {/* Deep Metrics */}
          <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-[32px] p-8 shadow-sm">
            <h3 className="text-xl font-bold mb-6 flex items-center gap-2">
              <Brain className="w-5 h-5 text-purple-500" />
              Learning Breakdown
            </h3>
            
            <div className="space-y-6">
              <div>
                <div className="flex justify-between mb-2">
                  <span className="text-sm font-medium">Syllabus Completion</span>
                  <span className="text-sm font-bold text-purple-500">{stats.completionPercentage}%</span>
                </div>
                <div className="h-3 w-full bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                  <motion.div 
                    initial={{ width: 0 }}
                    animate={{ width: `${stats.completionPercentage}%` }}
                    className="h-full bg-purple-500 rounded-full"
                  />
                </div>
              </div>

              <div>
                <div className="flex justify-between mb-2">
                  <span className="text-sm font-medium">Exam Readiness</span>
                  <span className="text-sm font-bold text-amber-500">{stats.examReadiness}%</span>
                </div>
                <div className="h-3 w-full bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                  <motion.div 
                    initial={{ width: 0 }}
                    animate={{ width: `${stats.examReadiness}%` }}
                    className="h-full bg-amber-500 rounded-full"
                  />
                </div>
              </div>

              <div className="pt-4 border-t border-slate-100 dark:border-slate-800 flex justify-between items-center">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-blue-100 text-blue-600 dark:bg-blue-500/20 dark:text-blue-400 rounded-lg">
                    <BookOpen className="w-5 h-5" />
                  </div>
                  <div>
                    <p className="text-xs text-slate-500 uppercase tracking-wider font-semibold">Total Tests</p>
                    <p className="text-lg font-bold">{stats.totalTestsAttempted}</p>
                  </div>
                </div>
                
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-emerald-100 text-emerald-600 dark:bg-emerald-500/20 dark:text-emerald-400 rounded-lg">
                    <Clock className="w-5 h-5" />
                  </div>
                  <div>
                    <p className="text-xs text-slate-500 uppercase tracking-wider font-semibold">Study Streak</p>
                    <p className="text-lg font-bold">{stats.gamification.studyStreakDays} Days</p>
                  </div>
                </div>
              </div>
            </div>

          </section>

        </div>
      </div>
    </div>
  );
}
