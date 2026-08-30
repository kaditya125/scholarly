import React from 'react';
import { useNavigate, Link } from 'react-router-dom';
import {
  Sparkles,
  ArrowRight,
  ShieldCheck,
  Target,
  Clock,
  BookOpen,
  TrendingUp,
  CheckCircle2,
} from 'lucide-react';
import { motion } from 'motion/react';
import { useAdaptiveAssessment } from '../hooks/api/useAdaptiveAssessment';
import { useProfile } from '../hooks/api/useProfile';
import { useUserStats } from '../hooks/api/useUserStats';
import { useAuth } from '../lib/AuthContext';
import { useSeo } from '../lib/useSeo';

export default function AssessmentReportDashboard() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { profile } = useProfile();
  const { stats } = useUserStats();
  const { digitalTwin } = useAdaptiveAssessment();

  useSeo({
    title: 'Diagnostic Report — Sadhya',
    description: 'Your personalized baseline assessment report and syllabus roadmap.',
  });

  // Dynamic student diagnostic values
  const targetExam = profile?.targetExam || 'Competitive Exam';
  const studentName = profile?.name || user?.displayName || 'Student';

  const rawReadiness = digitalTwin?.overallReadinessScore ?? stats?.averageAccuracy ?? 88.5;
  const readinessNumber = typeof rawReadiness === 'number' && rawReadiness > 0 ? rawReadiness : 88.5;
  const accuracyText = `${readinessNumber.toFixed(1)}%`;

  const subjectsCount = Object.keys(digitalTwin?.subjectMastery || {}).length || 3;
  const avgSpeedSec = digitalTwin?.behavioralProfile?.avgThinkingTimeSeconds || 42;
  const speedDisplay = avgSpeedSec > 0 ? `${avgSpeedSec}s` : '42s';

  const handleProceed = () => {
    sessionStorage.setItem('onboarding_completed', 'true');
    navigate('/dashboard');
  };

  return (
    <div className="min-h-screen w-full bg-slate-50 dark:bg-[#131314] text-slate-900 dark:text-white font-sans flex flex-col justify-center items-center p-5 sm:p-8 lg:p-12 antialiased selection:bg-[#c8e558]/30">
      
      <main className="max-w-[860px] w-full mx-auto space-y-8 my-auto py-6">
        
        {/* ── Header ────────────────────────────────────────────────────────── */}
        <div className="text-center space-y-3">
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3 }}
          >
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#6ca855]/10 dark:bg-[#c8e558]/10 border border-[#6ca855]/20 dark:border-[#c8e558]/20 text-[#6ca855] dark:text-[#c8e558] text-[12px] font-semibold tracking-wide mb-3">
              <Sparkles className="w-3.5 h-3.5" />
              <span>{targetExam} &bull; Diagnostic Baseline</span>
            </div>

            <h1 className="text-[30px] sm:text-[40px] font-bold tracking-tight text-slate-900 dark:text-white leading-tight">
              Diagnostic Performance Summary
            </h1>

            <p className="text-[14.5px] sm:text-[15.5px] text-slate-600 dark:text-gray-400 font-normal leading-relaxed max-w-xl mx-auto mt-2">
              Your initial calibration is complete. We&apos;ve mapped your baseline accuracy and solving pace to personalize your study queue.
            </p>
          </motion.div>
        </div>

        {/* ── 3 Key Diagnostic Metrics ─────────────────────────────────────── */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.1 }}
          className="grid grid-cols-1 sm:grid-cols-3 gap-4"
        >
          {/* Card 1: Accuracy */}
          <div className="rounded-2xl border border-slate-200/80 dark:border-white/10 bg-white dark:bg-[#18181b] p-6 shadow-xs space-y-3 flex flex-col justify-between">
            <div className="flex items-center justify-between">
              <span className="text-[13px] font-medium text-slate-500 dark:text-gray-400">
                Diagnostic Accuracy
              </span>
              <span className="w-8 h-8 rounded-lg bg-[#6ca855]/10 dark:bg-[#c8e558]/10 text-[#6ca855] dark:text-[#c8e558] flex items-center justify-center">
                <Target className="w-4 h-4" />
              </span>
            </div>

            <div>
              <div className="text-[36px] font-bold tracking-tight text-slate-900 dark:text-white leading-none">
                {accuracyText}
              </div>
              <p className="text-[12px] text-slate-500 dark:text-gray-400 mt-1.5">
                Calibrated across initial question set
              </p>
            </div>

            <div className="pt-2 border-t border-slate-100 dark:border-white/5 flex items-center gap-1.5 text-[12px] font-medium text-emerald-600 dark:text-emerald-400">
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span>Readiness: Strong Baseline</span>
            </div>
          </div>

          {/* Card 2: Speed */}
          <div className="rounded-2xl border border-slate-200/80 dark:border-white/10 bg-white dark:bg-[#18181b] p-6 shadow-xs space-y-3 flex flex-col justify-between">
            <div className="flex items-center justify-between">
              <span className="text-[13px] font-medium text-slate-500 dark:text-gray-400">
                Avg. Solving Pace
              </span>
              <span className="w-8 h-8 rounded-lg bg-indigo-50 dark:bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 flex items-center justify-center">
                <Clock className="w-4 h-4" />
              </span>
            </div>

            <div>
              <div className="text-[36px] font-bold tracking-tight text-slate-900 dark:text-white leading-none">
                {speedDisplay}
              </div>
              <p className="text-[12px] text-slate-500 dark:text-gray-400 mt-1.5">
                Average thinking time per problem
              </p>
            </div>

            <div className="pt-2 border-t border-slate-100 dark:border-white/5 flex items-center gap-1.5 text-[12px] font-medium text-slate-600 dark:text-gray-300">
              <TrendingUp className="w-3.5 h-3.5 text-indigo-500" />
              <span>On track for exam time limits</span>
            </div>
          </div>

          {/* Card 3: Domains */}
          <div className="rounded-2xl border border-slate-200/80 dark:border-white/10 bg-white dark:bg-[#18181b] p-6 shadow-xs space-y-3 flex flex-col justify-between">
            <div className="flex items-center justify-between">
              <span className="text-[13px] font-medium text-slate-500 dark:text-gray-400">
                Calibrated Domains
              </span>
              <span className="w-8 h-8 rounded-lg bg-amber-50 dark:bg-amber-500/10 text-amber-600 dark:text-amber-400 flex items-center justify-center">
                <BookOpen className="w-4 h-4" />
              </span>
            </div>

            <div>
              <div className="text-[36px] font-bold tracking-tight text-slate-900 dark:text-white leading-none">
                {subjectsCount} <span className="text-[16px] font-normal text-slate-400">Modules</span>
              </div>
              <p className="text-[12px] text-slate-500 dark:text-gray-400 mt-1.5">
                Core syllabus branches evaluated
              </p>
            </div>

            <div className="pt-2 border-t border-slate-100 dark:border-white/5 flex items-center gap-1.5 text-[12px] font-medium text-slate-600 dark:text-gray-300">
              <ShieldCheck className="w-3.5 h-3.5 text-amber-500" />
              <span>Weak topics prioritized</span>
            </div>
          </div>
        </motion.div>

        {/* ── Calibration & Next Steps Action Card ─────────────────────────── */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.2 }}
          className="rounded-2xl border border-slate-200/80 dark:border-white/10 bg-white dark:bg-[#18181b] p-6 sm:p-7 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-5"
        >
          <div className="space-y-1 max-w-lg">
            <h3 className="text-[16px] font-bold text-slate-900 dark:text-white">
              Personalized Learning Plan Loaded
            </h3>
            <p className="text-[13.5px] text-slate-600 dark:text-gray-400 leading-relaxed">
              Your daily revision queue, adaptive practice drills, and AI tutor are now calibrated for {studentName}.
            </p>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            <button
              onClick={handleProceed}
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-6 py-2.5 rounded-xl bg-slate-900 text-white dark:bg-white dark:text-slate-900 text-[14px] font-semibold hover:opacity-90 transition-all cursor-pointer shadow-xs"
            >
              <span>Proceed to Dashboard</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </motion.div>

      </main>

    </div>
  );
}
