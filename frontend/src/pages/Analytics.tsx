import React, { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  Play,
  Settings,
  BookOpen,
  HelpCircle,
  Search,
  Plus,
  Calendar,
  Layers,
  ChevronRight,
  ArrowRight,
  CheckCircle2,
  AlertTriangle,
  Flame,
  Target,
  Clock,
  Sparkles,
  ChevronDown,
  FileText
} from "lucide-react";
import { motion } from "motion/react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer
} from "recharts";
import { useUserStats } from "../hooks/api/useUserStats";
import { useProfile } from "../hooks/api/useProfile";
import { useAdaptiveAssessment } from "../hooks/api/useAdaptiveAssessment";
import { DashboardSkeleton } from "../components/ui/SkeletonLoader";

export default function Analytics() {
  const navigate = useNavigate();
  const { stats, isLoading } = useUserStats();
  const { profile } = useProfile();
  const { digitalTwin } = useAdaptiveAssessment();

  const [searchQuery, setSearchQuery] = useState("");
  const [activeTab, setActiveTab] = useState<"all" | "weak" | "mastered">("all");

  const targetExam = profile?.targetExam || "SSC CGL";
  const studentName = profile?.name || "Scholar";

  // Frequency wave bars for Potential Loss / Score Boost
  const frequencyHeights = [
    20, 35, 60, 45, 80, 65, 90, 75, 40, 60,
    85, 95, 70, 50, 80, 100, 65, 45, 75, 90,
    55, 35, 60, 40, 70, 50, 30, 20
  ];

  // Progression Line Data (Simulating Open vs Resolved Risks / Accuracy vs Error)
  const progressionData = [
    { name: "Day 1", openRisks: 320, resolved: 40 },
    { name: "Day 4", openRisks: 240, resolved: 65 },
    { name: "Day 8", openRisks: 255, resolved: 55 },
    { name: "Day 12", openRisks: 210, resolved: 80 },
    { name: "Day 16", openRisks: 230, resolved: 70 },
    { name: "Day 20", openRisks: 195, resolved: 110 },
    { name: "Day 24", openRisks: 220, resolved: 90 },
    { name: "Day 28", openRisks: 175, resolved: 140 },
    { name: "Day 32", openRisks: 150, resolved: 130 }
  ];

  if (isLoading) {
    return <DashboardSkeleton />;
  }

  return (
    <div className="w-full min-h-screen bg-[#f8fafc] dark:bg-[#0c0d10] text-slate-900 dark:text-white font-sans p-4 sm:p-6 lg:p-8 transition-colors duration-300">
      <div className="max-w-[1340px] mx-auto space-y-6">

        {/* ══ 1. Top Hero Announcement Banner ═══════════════════════════ */}
        <div className="rounded-[24px] bg-gradient-to-r from-[#eef5ff] via-[#f4f8ff] to-white dark:from-[#111928] dark:via-[#14151b] dark:to-[#14151b] border border-blue-100 dark:border-white/[0.06] p-6 sm:p-8 shadow-xs relative overflow-hidden">
          <div className="max-w-3xl space-y-4">
            <h1 className="text-2xl sm:text-[32px] font-extrabold text-slate-900 dark:text-white tracking-[-0.02em] leading-tight">
              Sadhya uncovers 1,500+ syllabus topics & precision insights across your {targetExam} preparation
            </h1>

            {/* Buttons */}
            <div className="flex flex-wrap items-center gap-3 pt-2">
              <button
                onClick={() => navigate("/tests")}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[#2563eb] hover:bg-[#1d4ed8] text-white font-semibold text-[13.5px] shadow-sm hover:scale-[1.01] active:scale-[0.98] transition-all cursor-pointer"
              >
                <Play className="w-4 h-4 fill-white" />
                <span>Start a Scan</span>
              </button>

              <button
                onClick={() => navigate("/coverage")}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-white dark:bg-white/5 hover:bg-slate-50 dark:hover:bg-white/10 text-slate-700 dark:text-slate-200 border border-slate-200/90 dark:border-white/10 font-semibold text-[13.5px] shadow-2xs hover:scale-[1.01] active:scale-[0.98] transition-all cursor-pointer"
              >
                <Settings className="w-4 h-4 text-slate-500" />
                <span>Manage Targets</span>
              </button>
            </div>

            {/* Helper links */}
            <div className="flex items-center gap-4 text-[12.5px] text-slate-500 dark:text-slate-400 pt-1">
              <Link to="/read" className="inline-flex items-center gap-1 hover:text-blue-600 dark:hover:text-blue-400 transition-colors">
                <BookOpen className="w-3.5 h-3.5" />
                <span>Docs</span>
              </Link>
              <span className="text-slate-300 dark:text-slate-700">|</span>
              <Link to="/chat" className="inline-flex items-center gap-1 hover:text-blue-600 dark:hover:text-blue-400 transition-colors">
                <HelpCircle className="w-3.5 h-3.5" />
                <span>Help</span>
              </Link>
            </div>
          </div>
        </div>

        {/* ══ 2. Top Metric Cards Row ═══════════════════════════════════ */}
        <div className="grid grid-cols-1 md:grid-cols-12 gap-5">
          
          {/* Card 1: Overall Security/Exam Grade (col-span-4) */}
          <div className="md:col-span-3 rounded-[20px] bg-white dark:bg-[#14151a] border border-slate-200/80 dark:border-white/[0.08] p-5 shadow-xs flex flex-col justify-between">
            <span className="text-[13px] font-bold text-slate-700 dark:text-slate-200">
              Overall Security Grade
            </span>

            {/* Letter Grade badges */}
            <div className="flex items-center gap-2 py-4">
              {["A", "B", "C", "D", "E"].map((letter) => {
                const isSelected = letter === "B";
                return (
                  <div key={letter} className="relative flex flex-col items-center">
                    <div
                      className={`w-9 h-9 rounded-full flex items-center justify-center font-bold text-[13px] transition-all ${
                        isSelected
                          ? "bg-amber-100 dark:bg-amber-500/20 text-amber-600 dark:text-amber-400 border-2 border-amber-400 shadow-xs"
                          : "bg-slate-50 dark:bg-white/[0.04] text-slate-400 border border-slate-200/80 dark:border-white/[0.06]"
                      }`}
                    >
                      {letter}
                    </div>
                    {isSelected && (
                      <div className="w-1 h-1 rounded-full bg-amber-500 mt-1" />
                    )}
                  </div>
                );
              })}
            </div>

            <Link
              to="/coverage"
              className="inline-flex items-center gap-1 text-[12px] font-semibold text-slate-500 hover:text-blue-600 dark:text-slate-400 dark:hover:text-blue-400 transition-colors"
            >
              <span>See Vulnerabilities To Fix</span>
              <ChevronRight className="w-3.5 h-3.5" />
            </Link>
          </div>

          {/* Card 2: Potential Loss Saved (col-span-4) */}
          <div className="md:col-span-4 rounded-[20px] bg-white dark:bg-[#14151a] border border-slate-200/80 dark:border-white/[0.08] p-5 shadow-xs flex flex-col justify-between">
            <div>
              <span className="text-[13px] font-bold text-slate-700 dark:text-slate-200">
                Potential Loss Saved
              </span>
              <div className="text-[26px] sm:text-[28px] font-black text-slate-900 dark:text-white tracking-tight mt-1">
                $1.24m
              </div>
            </div>

            {/* Sparkline wave visualizer */}
            <div className="flex items-end gap-1 h-7 pt-2">
              {frequencyHeights.map((h, i) => (
                <div
                  key={i}
                  className="flex-1 bg-blue-500/80 dark:bg-blue-400 rounded-full"
                  style={{ height: `${h}%` }}
                />
              ))}
            </div>
          </div>

          {/* Card 3: Vulnerabilities by Severity (col-span-5) */}
          <div className="md:col-span-5 rounded-[20px] bg-white dark:bg-[#14151a] border border-slate-200/80 dark:border-white/[0.08] p-5 shadow-xs flex flex-col justify-between">
            <span className="text-[13px] font-bold text-slate-700 dark:text-slate-200 mb-2">
              Vulnerabilities by Severity
            </span>

            <div className="grid grid-cols-4 divide-x divide-slate-100 dark:divide-white/[0.06] text-left pt-1">
              <div className="pr-3">
                <div className="text-[24px] font-black text-slate-900 dark:text-white leading-none">24</div>
                <div className="text-[11.5px] font-semibold text-rose-500 mt-1">Critical</div>
              </div>
              <div className="px-3">
                <div className="text-[24px] font-black text-slate-900 dark:text-white leading-none">35</div>
                <div className="text-[11.5px] font-semibold text-orange-500 mt-1">High</div>
              </div>
              <div className="px-3">
                <div className="text-[24px] font-black text-slate-900 dark:text-white leading-none">64</div>
                <div className="text-[11.5px] font-semibold text-amber-500 mt-1">Medium</div>
              </div>
              <div className="pl-3">
                <div className="text-[24px] font-black text-slate-900 dark:text-white leading-none">17</div>
                <div className="text-[11.5px] font-semibold text-emerald-500 mt-1">Low</div>
              </div>
            </div>
          </div>

        </div>

        {/* ══ 3. Middle Two-Column Layout ═══════════════════════════════ */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
          
          {/* Left Column: Getting Started (col-span-6) */}
          <div className="lg:col-span-6 rounded-[20px] bg-white dark:bg-[#14151a] border border-slate-200/80 dark:border-white/[0.08] p-6 shadow-xs space-y-5">
            {/* Header */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <h3 className="text-[16px] font-bold text-slate-900 dark:text-white">Getting Started</h3>
                <span className="w-5 h-5 rounded-full bg-blue-600 text-white text-[11px] font-bold flex items-center justify-center">4</span>
              </div>
              <span className="text-[12px] font-semibold text-slate-500 dark:text-slate-400">23% completed</span>
            </div>

            {/* Blue Progress Bar */}
            <div className="h-1.5 w-full bg-slate-100 dark:bg-white/[0.06] rounded-full overflow-hidden">
              <div className="h-full bg-blue-600 rounded-full w-[23%]" />
            </div>

            {/* Items List */}
            <div className="space-y-3 pt-1">
              
              {/* Item 1 */}
              <div className="flex items-center justify-between p-3.5 rounded-xl border border-slate-100 dark:border-white/[0.04] bg-slate-50/50 dark:bg-white/[0.02]">
                <div className="flex items-start gap-3">
                  <div className="w-4 h-4 rounded-full border-2 border-blue-600 mt-0.5" />
                  <div>
                    <h4 className="text-[13.5px] font-bold text-slate-900 dark:text-white">Purchase Targets</h4>
                    <p className="text-[11.5px] text-slate-400 dark:text-slate-500 mt-0.5">
                      1 of 3 steps completed · About 6 min
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => navigate("/tests")}
                  className="px-3.5 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-[12px] font-semibold transition-colors cursor-pointer"
                >
                  Continue
                </button>
              </div>

              {/* Item 2 */}
              <div className="flex items-center justify-between p-3.5 rounded-xl border border-slate-100 dark:border-white/[0.04] bg-slate-50/50 dark:bg-white/[0.02]">
                <div className="flex items-start gap-3">
                  <div className="w-4 h-4 rounded-full border-2 border-slate-300 dark:border-slate-600 mt-0.5" />
                  <div>
                    <h4 className="text-[13.5px] font-bold text-slate-900 dark:text-white">Invite Team</h4>
                    <p className="text-[11.5px] text-slate-400 dark:text-slate-500 mt-0.5">
                      0 of 2 steps completed · About 4 min
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => navigate("/community")}
                  className="px-3.5 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-[12px] font-semibold transition-colors cursor-pointer"
                >
                  Start
                </button>
              </div>

              {/* Item 3 */}
              <div className="flex items-center justify-between p-3.5 rounded-xl border border-slate-100 dark:border-white/[0.04] bg-slate-50/50 dark:bg-white/[0.02]">
                <div className="flex items-start gap-3">
                  <CheckCircle2 className="w-4 h-4 text-emerald-500 mt-0.5 shrink-0" />
                  <div>
                    <h4 className="text-[13.5px] font-bold text-slate-900 dark:text-white">Configure 5/5 Targets</h4>
                    <p className="text-[11.5px] text-slate-400 dark:text-slate-500 mt-0.5">
                      Completed
                    </p>
                  </div>
                </div>
                <ChevronDown className="w-4 h-4 text-slate-400" />
              </div>

            </div>
          </div>

          {/* Right Column: Targets Setup & Help Box (col-span-6) */}
          <div className="lg:col-span-6 rounded-[20px] bg-white dark:bg-[#14151a] border border-slate-200/80 dark:border-white/[0.08] p-6 shadow-xs space-y-4">
            {/* Header */}
            <div className="flex items-center gap-2">
              <h3 className="text-[16px] font-bold text-slate-900 dark:text-white">Targets Setup</h3>
              <span className="w-5 h-5 rounded-full bg-blue-600 text-white text-[11px] font-bold flex items-center justify-center">2</span>
            </div>

            {/* Filter Bar */}
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex-1 min-w-[140px] relative">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="Search targets..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-8 pr-3 py-1.5 rounded-lg bg-slate-50 dark:bg-white/[0.04] border border-slate-200/80 dark:border-white/[0.06] text-[12.5px] text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:border-blue-500"
                />
              </div>

              <button className="px-2.5 py-1.5 rounded-lg border border-slate-200/80 dark:border-white/[0.06] bg-slate-50 dark:bg-white/[0.04] text-[12px] font-medium text-slate-600 dark:text-slate-300 flex items-center gap-1 cursor-pointer">
                <Plus className="w-3 h-3" />
                <span>Date</span>
              </button>

              <button className="px-2.5 py-1.5 rounded-lg border border-slate-200/80 dark:border-white/[0.06] bg-slate-50 dark:bg-white/[0.04] text-[12px] font-medium text-slate-600 dark:text-slate-300 flex items-center gap-1 cursor-pointer">
                <Plus className="w-3 h-3" />
                <span>Type</span>
              </button>
            </div>

            {/* Target Item Pill */}
            <div className="flex items-center justify-between p-3 rounded-xl border border-slate-100 dark:border-white/[0.04] bg-slate-50/50 dark:bg-white/[0.02]">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-purple-50 dark:bg-purple-500/15 text-purple-600 dark:text-purple-400 flex items-center justify-center font-bold text-xs">
                  <FileText className="w-4 h-4" />
                </div>
                <div>
                  <h4 className="text-[13px] font-bold text-slate-900 dark:text-white">[No Name Target]</h4>
                  <p className="text-[11px] text-slate-400 dark:text-slate-500">#e214 · 13 Oct 2026, 12:13 pm</p>
                </div>
              </div>

              <button
                onClick={() => navigate("/tests")}
                className="px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-[12px] font-semibold flex items-center gap-1 cursor-pointer"
              >
                <span>Setup Target</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* Warm Amber Help Box */}
            <div className="flex items-center justify-between p-4 rounded-xl bg-amber-50/60 dark:bg-amber-500/10 border border-amber-200/70 dark:border-amber-500/20">
              <div className="flex items-start gap-3">
                <div className="w-6 h-6 rounded-full bg-amber-400/20 text-amber-700 dark:text-amber-400 flex items-center justify-center font-bold text-xs shrink-0 mt-0.5">
                  ?
                </div>
                <div>
                  <h4 className="text-[13px] font-bold text-amber-900 dark:text-amber-200">
                    Having problems with the setup?
                  </h4>
                  <p className="text-[11.5px] text-amber-800/80 dark:text-amber-300/80 mt-0.5">
                    Our team would be happy to help you with any kind of problem you might have!
                  </p>
                </div>
              </div>

              <button
                onClick={() => navigate("/chat")}
                className="px-3.5 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-600 text-white text-[12px] font-bold shadow-2xs transition-colors shrink-0 cursor-pointer ml-3"
              >
                Get Help
              </button>
            </div>

          </div>

        </div>

        {/* ══ 4. Bottom Two-Column Analytics Row ════════════════════════ */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
          
          {/* Left: Open vs Resolved Risks Chart (col-span-5) */}
          <div className="lg:col-span-5 rounded-[20px] bg-white dark:bg-[#14151a] border border-slate-200/80 dark:border-white/[0.08] p-6 shadow-xs flex flex-col justify-between">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-[15px] font-bold text-slate-900 dark:text-white">
                Open vs Resolved Risks
              </h3>
              <div className="flex items-center gap-1 text-[11.5px] font-semibold text-slate-500 dark:text-slate-400 border border-slate-200/80 dark:border-white/10 px-2.5 py-1 rounded-lg">
                <span>Severity</span>
                <ChevronDown className="w-3 h-3" />
              </div>
            </div>

            {/* Line chart */}
            <div className="h-56 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={progressionData} margin={{ top: 10, right: 10, left: -25, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" opacity={0.6} />
                  <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: "#94a3b8" }} />
                  <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: "#94a3b8" }} domain={[0, 500]} ticks={[25, 50, 100, 125, 250, 500]} />
                  <Tooltip
                    contentStyle={{ backgroundColor: '#0f172a', border: 'none', borderRadius: '8px', color: '#fff', fontSize: '11px' }}
                  />
                  <Line type="monotone" dataKey="openRisks" stroke="#ef4444" strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="resolved" stroke="#10b981" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Right: Major Identified Risks Table (col-span-7) */}
          <div className="lg:col-span-7 rounded-[20px] bg-white dark:bg-[#14151a] border border-slate-200/80 dark:border-white/[0.08] p-6 shadow-xs space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <h3 className="text-[15px] font-bold text-slate-900 dark:text-white">
                  Major Identified Risks
                </h3>
                <span className="w-5 h-5 rounded-full bg-blue-600 text-white text-[11px] font-bold flex items-center justify-center">6</span>
              </div>
              <Link to="/coverage" className="text-[12px] font-semibold text-slate-500 hover:text-blue-600 dark:text-slate-400 dark:hover:text-blue-400">
                View All &gt;
              </Link>
            </div>

            {/* Table Rows */}
            <div className="divide-y divide-slate-100 dark:divide-white/[0.04]">
              
              {/* Row 1 */}
              <div className="py-2.5 flex items-center justify-between gap-3">
                <div className="flex items-center gap-2.5 min-w-0">
                  <span className="px-2 py-0.5 rounded text-[10.5px] font-bold bg-rose-500 text-white uppercase tracking-wider shrink-0">
                    Critical
                  </span>
                  <span className="text-[12.5px] font-medium text-slate-800 dark:text-slate-200 truncate">
                    Server Side Template Injection
                  </span>
                </div>
                <div className="flex items-center gap-4 text-[11.5px] text-slate-400 shrink-0">
                  <span>22 Jan, 12:11 PM</span>
                  <span className="font-bold text-slate-700 dark:text-slate-300">⚡ 8.3</span>
                </div>
              </div>

              {/* Row 2 */}
              <div className="py-2.5 flex items-center justify-between gap-3">
                <div className="flex items-center gap-2.5 min-w-0">
                  <span className="px-2 py-0.5 rounded text-[10.5px] font-bold bg-rose-500 text-white uppercase tracking-wider shrink-0">
                    Critical
                  </span>
                  <span className="text-[12.5px] font-medium text-slate-800 dark:text-slate-200 truncate">
                    Phpmyadmin Information Schema Disclosure
                  </span>
                </div>
                <div className="flex items-center gap-4 text-[11.5px] text-slate-400 shrink-0">
                  <span>16 Jan, 8:16 AM</span>
                  <span className="font-bold text-slate-700 dark:text-slate-300">⚡ 8.0</span>
                </div>
              </div>

              {/* Row 3 */}
              <div className="py-2.5 flex items-center justify-between gap-3">
                <div className="flex items-center gap-2.5 min-w-0">
                  <span className="px-2 py-0.5 rounded text-[10.5px] font-bold bg-rose-500 text-white uppercase tracking-wider shrink-0">
                    Critical
                  </span>
                  <span className="text-[12.5px] font-medium text-slate-800 dark:text-slate-200 truncate">
                    .svn/entries Found
                  </span>
                </div>
                <div className="flex items-center gap-4 text-[11.5px] text-slate-400 shrink-0">
                  <span>6 Feb, 9:18 AM</span>
                  <span className="font-bold text-slate-700 dark:text-slate-300">⚡ 7.9</span>
                </div>
              </div>

              {/* Row 4 */}
              <div className="py-2.5 flex items-center justify-between gap-3">
                <div className="flex items-center gap-2.5 min-w-0">
                  <span className="px-2 py-0.5 rounded text-[10.5px] font-bold bg-orange-500 text-white uppercase tracking-wider shrink-0">
                    High
                  </span>
                  <span className="text-[12.5px] font-medium text-slate-800 dark:text-slate-200 truncate">
                    PII Disclosure
                  </span>
                </div>
                <div className="flex items-center gap-4 text-[11.5px] text-slate-400 shrink-0">
                  <span>21 Jan, 4:48 PM</span>
                  <span className="font-bold text-slate-700 dark:text-slate-300">⚡ 5.8</span>
                </div>
              </div>

            </div>
          </div>

        </div>

      </div>
    </div>
  );
}
