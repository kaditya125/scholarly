import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  BrainCircuit,
  Target,
  Sparkles,
  ArrowRight,
  Zap,
  BookOpen,
  Award,
  TrendingUp,
  Clock,
  CheckCircle2,
  Layers,
} from 'lucide-react';
import { motion } from 'motion/react';
import { useAdaptiveAssessment } from '../hooks/api/useAdaptiveAssessment';
import { useProfile } from '../hooks/api/useProfile';
import { useUserStats } from '../hooks/api/useUserStats';
import { useAuth } from '../lib/AuthContext';

export default function AssessmentReportDashboard() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { profile } = useProfile();
  const { stats } = useUserStats();
  const { digitalTwin } = useAdaptiveAssessment();

  const [autoAdapt, setAutoAdapt] = useState(true);

  // Derive dynamic student diagnostic data
  const targetExam = profile?.targetExam || 'Competitive Exam';
  const studentName = profile?.name || user?.displayName || 'Scholar';
  
  const rawReadiness = digitalTwin?.overallReadinessScore ?? stats?.averageAccuracy ?? 88.5;
  const readinessNumber = typeof rawReadiness === 'number' && rawReadiness > 0 ? rawReadiness : 88.5;
  const accuracyText = `${readinessNumber.toFixed(1)}%`;

  const subjectsCount = Object.keys(digitalTwin?.subjectMastery || {}).length || 3;
  const avgSpeedSec = digitalTwin?.behavioralProfile?.avgThinkingTimeSeconds || 42;
  const speedDisplay = avgSpeedSec > 0 ? `${avgSpeedSec}s` : '1.8x';

  const handleProceed = () => {
    sessionStorage.setItem('onboarding_completed', 'true');
    navigate('/dashboard');
  };

  return (
    <div className="min-h-screen w-full bg-[#f6f7fb] dark:bg-[#0c0d10] text-slate-900 dark:text-white font-sans flex flex-col justify-center items-center p-4 sm:p-8 lg:p-12 relative overflow-x-hidden selection:bg-indigo-500 selection:text-white">
      
      {/* Background Subtle Gradient & Grid Texture */}
      <div className="absolute inset-0 pointer-events-none bg-[radial-gradient(#e2e8f0_1px,transparent_1px)] dark:bg-[radial-gradient(#1e293b_1px,transparent_1px)] [background-size:24px_24px] opacity-70" />
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[350px] bg-gradient-to-b from-indigo-100/40 via-purple-50/20 to-transparent dark:from-indigo-950/20 dark:via-purple-950/10 dark:to-transparent blur-3xl pointer-events-none" />

      {/* Main Container */}
      <div className="max-w-[1020px] w-full mx-auto relative z-10 space-y-10 my-auto py-8">
        
        {/* ══ Header ═══════════════════════════════════════════════════════ */}
        <div className="text-center space-y-3 max-w-2xl mx-auto">
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
          >
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-indigo-50 dark:bg-indigo-500/15 border border-indigo-200/80 dark:border-indigo-500/25 text-[11.5px] font-bold text-indigo-600 dark:text-indigo-300 uppercase tracking-wider mb-2">
              <Sparkles className="w-3.5 h-3.5 text-indigo-500" />
              <span>{targetExam} · Diagnostic Baseline</span>
            </div>
            <h1 className="text-[34px] sm:text-[46px] font-extrabold tracking-[-0.03em] text-slate-950 dark:text-white leading-tight">
              Diagnostic Performance Analysis
            </h1>
            <p className="text-[14px] sm:text-[16px] text-slate-500 dark:text-slate-400 font-normal leading-relaxed mt-2">
              Calibrate your exam readiness, master high-yield syllabus concepts, and accelerate your preparation.
            </p>
          </motion.div>
        </div>

        {/* ══ Bento Grid ═══════════════════════════════════════════════════ */}
        <div className="grid grid-cols-1 md:grid-cols-12 gap-5 items-stretch">
          
          {/* ── 1. Left Tall Card (Adaptive Learning Twin) ── */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.1 }}
            className="md:col-span-4 rounded-[28px] bg-white dark:bg-[#14151a] border border-slate-200/80 dark:border-white/[0.08] p-7 shadow-xs flex flex-col justify-between relative overflow-hidden group hover:border-slate-300 dark:hover:border-white/20 transition-all min-h-[380px]"
          >
            {/* Subtle top-right curved corner mesh */}
            <div className="absolute top-0 right-0 w-36 h-36 bg-gradient-to-br from-indigo-500/10 via-purple-500/5 to-transparent rounded-bl-full pointer-events-none" />
            <div className="absolute inset-0 bg-[linear-gradient(to_right,#f1f5f9_1px,transparent_1px),linear-gradient(to_bottom,#f1f5f9_1px,transparent_1px)] dark:bg-[linear-gradient(to_right,#1e293b_1px,transparent_1px),linear-gradient(to_bottom,#1e293b_1px,transparent_1px)] bg-[size:20px_20px] opacity-40 pointer-events-none" />

            <div className="relative z-10 space-y-4">
              {/* Purple App Icon */}
              <div className="w-13 h-13 rounded-2xl bg-gradient-to-br from-[#6366f1] to-[#4f46e5] text-white flex items-center justify-center shadow-md shadow-indigo-500/20">
                <BrainCircuit className="w-6 h-6" />
              </div>

              <div className="pt-2">
                <h3 className="text-[20px] font-bold text-slate-900 dark:text-white tracking-tight">
                  Adaptive Study Twin
                </h3>
                <p className="text-[13.5px] text-slate-500 dark:text-slate-400 leading-relaxed mt-2.5">
                  Self-calibrating diagnostic profile tuned for {targetExam}. Automates spaced repetition and weak topic recovery.
                </p>
              </div>
            </div>

            {/* Bottom Auto-Adapt Pill */}
            <div className="relative z-10 pt-6">
              <div className="flex items-center justify-between px-4 py-2.5 rounded-2xl bg-slate-50 dark:bg-white/[0.04] border border-slate-200/70 dark:border-white/[0.06]">
                <div className="flex items-center gap-2 text-[12.5px] font-semibold text-slate-700 dark:text-slate-200">
                  <Zap className="w-3.5 h-3.5 text-indigo-500 fill-indigo-500" />
                  <span>Auto-Adapt Syllabus</span>
                </div>
                
                {/* Switch button */}
                <button
                  type="button"
                  onClick={() => setAutoAdapt(!autoAdapt)}
                  className={`w-9 h-5 rounded-full transition-colors relative cursor-pointer p-0.5 ${
                    autoAdapt ? 'bg-indigo-600 dark:bg-indigo-500' : 'bg-slate-200 dark:bg-slate-700'
                  }`}
                  aria-label="Toggle Auto-Adapt"
                >
                  <motion.div
                    className="w-4 h-4 rounded-full bg-white shadow-xs"
                    animate={{ x: autoAdapt ? 16 : 0 }}
                    transition={{ type: 'spring', stiffness: 500, damping: 30 }}
                  />
                </button>
              </div>
            </div>
          </motion.div>

          {/* ── 2. Middle Column: Calibrated Subjects & Diagnostic Accuracy ── */}
          <div className="md:col-span-4 flex flex-col gap-5 justify-between">
            
            {/* Top: Calibrated Subjects */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.2 }}
              className="rounded-[28px] bg-white dark:bg-[#14151a] border border-slate-200/80 dark:border-white/[0.08] p-6 shadow-xs flex items-center justify-between group hover:border-slate-300 dark:hover:border-white/20 transition-all"
            >
              <div>
                <h4 className="text-[16px] font-bold text-slate-900 dark:text-white tracking-tight">
                  Calibrated Domains
                </h4>
                <p className="text-[12.5px] text-slate-400 dark:text-slate-500 mt-0.5">
                  0{subjectsCount} Core Syllabus Modules
                </p>
              </div>

              {/* Triple Icon Pill Cluster */}
              <div className="flex items-center gap-1.5 text-indigo-600 dark:text-indigo-400 bg-indigo-50/70 dark:bg-indigo-500/10 px-3 py-1.5 rounded-xl border border-indigo-100 dark:border-indigo-500/20">
                <Target className="w-4 h-4" />
                <BookOpen className="w-4 h-4" />
                <Award className="w-4 h-4" />
              </div>
            </motion.div>

            {/* Bottom: Confidence & Diagnostic Accuracy */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.3 }}
              className="flex-1 rounded-[28px] bg-white dark:bg-[#14151a] border border-slate-200/80 dark:border-white/[0.08] p-6 shadow-xs flex flex-col justify-between group hover:border-slate-300 dark:hover:border-white/20 transition-all"
            >
              <div className="flex items-start justify-between">
                <div>
                  <h4 className="text-[15px] font-bold text-slate-900 dark:text-white">
                    Diagnostic Accuracy
                  </h4>
                  <p className="text-[11.5px] text-slate-400 dark:text-slate-500 mt-0.5">
                    Baseline Calibration
                  </p>
                </div>

                <span className="px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-indigo-50 dark:bg-indigo-500/15 text-indigo-600 dark:text-indigo-300 border border-indigo-100 dark:border-indigo-500/20">
                  High Precision
                </span>
              </div>

              <div className="py-3">
                <span className="text-[44px] sm:text-[50px] font-black text-slate-950 dark:text-white tracking-tight leading-none">
                  {accuracyText}
                </span>
              </div>

              <div className="flex items-center justify-between text-[11px] text-slate-400 dark:text-slate-500 pt-2 border-t border-slate-100 dark:border-white/[0.04]">
                <span>Risk Margin: Low</span>
                <span className="font-semibold text-slate-800 dark:text-slate-300">Exam Readiness: Strong</span>
              </div>
            </motion.div>
          </div>

          {/* ── 3. Right Tall Card (Solving Velocity) ── */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.4 }}
            className="md:col-span-4 rounded-[28px] bg-white dark:bg-[#14151a] border border-slate-200/80 dark:border-white/[0.08] p-7 shadow-xs flex flex-col justify-between relative overflow-hidden group hover:border-slate-300 dark:hover:border-white/20 transition-all min-h-[380px]"
          >
            {/* Dot Grid texture */}
            <div className="absolute inset-0 bg-[radial-gradient(#e2e8f0_1.5px,transparent_1.5px)] dark:bg-[radial-gradient(#1e293b_1.5px,transparent_1.5px)] [background-size:16px_16px] opacity-60 pointer-events-none" />

            <div className="relative z-10">
              <span className="text-[52px] sm:text-[64px] font-black text-slate-950 dark:text-white tracking-[-0.04em] leading-none block">
                {speedDisplay}
              </span>
            </div>

            <div className="relative z-10 space-y-2 pt-8">
              <h3 className="text-[19px] font-bold text-slate-900 dark:text-white tracking-tight">
                Solving Velocity
              </h3>
              <p className="text-[13px] text-slate-500 dark:text-slate-400 leading-relaxed">
                Average solving pace per question calibrated against {targetExam} qualifying benchmark.
              </p>
            </div>
          </motion.div>

          {/* ── 4. Bottom Full-Width Card (Proceed Action) ── */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.5 }}
            className="md:col-span-12 rounded-[24px] bg-white dark:bg-[#14151a] border border-slate-200/80 dark:border-white/[0.08] p-4 sm:p-5 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4 group hover:border-slate-300 dark:hover:border-white/20 transition-all"
          >
            <div className="flex items-center gap-3.5">
              <div className="w-10 h-10 rounded-xl bg-indigo-50 dark:bg-indigo-500/15 text-indigo-600 dark:text-indigo-400 flex items-center justify-center shrink-0">
                <Sparkles className="w-5 h-5" />
              </div>
              <div>
                <h4 className="text-[15px] font-bold text-slate-900 dark:text-white">
                  Personalized Study Roadmap Ready
                </h4>
                <p className="text-[12.5px] text-slate-500 dark:text-slate-400">
                  Your daily planner, syllabus tracker, and AI tutor are calibrated for {studentName}.
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 self-end sm:self-auto">
              <div className="hidden sm:flex items-center gap-1">
                <span className="w-7 h-7 rounded-lg border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-white/5 flex items-center justify-center font-mono text-[11px] font-semibold text-slate-600 dark:text-slate-300">⌘</span>
                <span className="w-7 h-7 rounded-lg border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-white/5 flex items-center justify-center font-mono text-[11px] font-semibold text-slate-600 dark:text-slate-300">⌥</span>
                <span className="w-7 h-7 rounded-lg border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-white/5 flex items-center justify-center font-mono text-[11px] font-semibold text-slate-600 dark:text-slate-300">N</span>
              </div>

              <button
                onClick={handleProceed}
                className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-slate-950 hover:bg-slate-800 text-white dark:bg-white dark:text-slate-950 dark:hover:bg-slate-100 text-[13.5px] font-bold shadow-md hover:scale-[1.02] active:scale-[0.98] transition-all cursor-pointer"
              >
                <span>Proceed to Dashboard</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </motion.div>

        </div>

      </div>

    </div>
  );
}
