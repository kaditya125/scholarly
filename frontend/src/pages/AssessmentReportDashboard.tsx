import React, { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  BrainCircuit,
  Bot,
  Cpu,
  Workflow,
  Sparkles,
  Play,
  Pause,
  Volume2,
  VolumeX,
  ArrowRight,
  Zap,
  Command,
  CheckCircle2,
  Sliders,
  ChevronRight,
  Maximize2
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { useAdaptiveAssessment } from '../hooks/api/useAdaptiveAssessment';
import { useAuth } from '../lib/AuthContext';

export default function AssessmentReportDashboard() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { digitalTwin, isLoadingDigitalTwin } = useAdaptiveAssessment();

  const [autoTrain, setAutoTrain] = useState(true);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [progress, setProgress] = useState(65);
  const [audioDuration, setAudioDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);

  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Derive dynamic or calibrated metrics from digitalTwin
  const readiness = digitalTwin?.overallReadinessScore ?? 99.9;
  const accuracyText = typeof readiness === 'number' && readiness > 0 ? `${readiness.toFixed(1)}%` : '99.9%';
  const speedMultiplier = '100x';

  const togglePlay = () => {
    const el = audioRef.current;
    if (!el) return;
    if (isPlaying) {
      el.pause();
      setIsPlaying(false);
    } else {
      el.play()
        .then(() => setIsPlaying(true))
        .catch(() => setIsPlaying(false));
    }
  };

  const toggleMute = () => {
    const el = audioRef.current;
    if (!el) return;
    el.muted = !isMuted;
    setIsMuted(!isMuted);
  };

  const handleTimeUpdate = () => {
    const el = audioRef.current;
    if (!el || !el.duration) return;
    setCurrentTime(el.currentTime);
    setProgress((el.currentTime / el.duration) * 100);
  };

  const handleSeek = (e: React.MouseEvent<HTMLDivElement>) => {
    const el = audioRef.current;
    if (!el || !el.duration) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const pos = (e.clientX - rect.left) / rect.width;
    el.currentTime = pos * el.duration;
    setProgress(pos * 100);
  };

  const handleProceed = () => {
    sessionStorage.setItem('onboarding_completed', 'true');
    navigate('/dashboard');
  };

  return (
    <div className="min-h-screen w-full bg-[#f6f7fb] dark:bg-[#0c0d10] text-slate-900 dark:text-white font-sans flex flex-col justify-between p-4 sm:p-8 lg:p-12 relative overflow-x-hidden selection:bg-indigo-500 selection:text-white">
      
      {/* Background Subtle Gradient & Grid Texture */}
      <div className="absolute inset-0 pointer-events-none bg-[radial-gradient(#e2e8f0_1px,transparent_1px)] dark:bg-[radial-gradient(#1e293b_1px,transparent_1px)] [background-size:24px_24px] opacity-70" />
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[350px] bg-gradient-to-b from-indigo-100/40 via-purple-50/20 to-transparent dark:from-indigo-950/20 dark:via-purple-950/10 dark:to-transparent blur-3xl pointer-events-none" />

      {/* Main Container */}
      <div className="max-w-[1020px] w-full mx-auto relative z-10 space-y-10 my-auto pb-24">
        
        {/* ══ Header ═══════════════════════════════════════════════════════ */}
        <div className="text-center space-y-3 max-w-2xl mx-auto">
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
          >
            <h1 className="text-[34px] sm:text-[46px] font-extrabold tracking-[-0.03em] text-slate-950 dark:text-white leading-tight">
              AI Automation
            </h1>
            <p className="text-[14px] sm:text-[16px] text-slate-500 dark:text-slate-400 font-normal leading-relaxed mt-2">
              Deploy autonomous agents, optimize workflows, and scale your intelligence layer instantly.
            </p>
          </motion.div>
        </div>

        {/* ══ Bento Grid ═══════════════════════════════════════════════════ */}
        <div className="grid grid-cols-1 md:grid-cols-12 gap-5 items-stretch">
          
          {/* ── 1. Left Tall Card (Neural Agents) ── */}
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
                  Neural Agents
                </h3>
                <p className="text-[13.5px] text-slate-500 dark:text-slate-400 leading-relaxed mt-2.5">
                  Self-learning models that adapt to your data infrastructure. Automate complex decision-making.
                </p>
              </div>
            </div>

            {/* Bottom Auto-Train Pill */}
            <div className="relative z-10 pt-6">
              <div className="flex items-center justify-between px-4 py-2.5 rounded-2xl bg-slate-50 dark:bg-white/[0.04] border border-slate-200/70 dark:border-white/[0.06]">
                <div className="flex items-center gap-2 text-[12.5px] font-semibold text-slate-700 dark:text-slate-200">
                  <Zap className="w-3.5 h-3.5 text-indigo-500 fill-indigo-500" />
                  <span>Auto-Train</span>
                </div>
                
                {/* Switch button */}
                <button
                  type="button"
                  onClick={() => setAutoTrain(!autoTrain)}
                  className={`w-9 h-5 rounded-full transition-colors relative cursor-pointer p-0.5 ${
                    autoTrain ? 'bg-slate-300 dark:bg-slate-600' : 'bg-slate-200 dark:bg-slate-700'
                  }`}
                  aria-label="Toggle Auto-Train"
                >
                  <motion.div
                    className="w-4 h-4 rounded-full bg-white shadow-xs"
                    animate={{ x: autoTrain ? 16 : 0 }}
                    transition={{ type: 'spring', stiffness: 500, damping: 30 }}
                  />
                </button>
              </div>
            </div>
          </motion.div>

          {/* ── 2. Middle Column: Active Models & Confidence ── */}
          <div className="md:col-span-4 flex flex-col gap-5 justify-between">
            
            {/* Top: Active Models */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.2 }}
              className="rounded-[28px] bg-white dark:bg-[#14151a] border border-slate-200/80 dark:border-white/[0.08] p-6 shadow-xs flex items-center justify-between group hover:border-slate-300 dark:hover:border-white/20 transition-all"
            >
              <div>
                <h4 className="text-[16px] font-bold text-slate-900 dark:text-white tracking-tight">
                  Active Models
                </h4>
                <p className="text-[12.5px] text-slate-400 dark:text-slate-500 mt-0.5">
                  03 LLMs Connected
                </p>
              </div>

              {/* Triple Icon Pill Cluster */}
              <div className="flex items-center gap-1.5 text-indigo-600 dark:text-indigo-400 bg-indigo-50/70 dark:bg-indigo-500/10 px-3 py-1.5 rounded-xl border border-indigo-100 dark:border-indigo-500/20">
                <Bot className="w-4 h-4" />
                <Cpu className="w-4 h-4" />
                <Workflow className="w-4 h-4" />
              </div>
            </motion.div>

            {/* Bottom: Confidence & 99.9% Precision */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.3 }}
              className="flex-1 rounded-[28px] bg-white dark:bg-[#14151a] border border-slate-200/80 dark:border-white/[0.08] p-6 shadow-xs flex flex-col justify-between group hover:border-slate-300 dark:hover:border-white/20 transition-all"
            >
              <div className="flex items-start justify-between">
                <div>
                  <h4 className="text-[15px] font-bold text-slate-900 dark:text-white">
                    Confidence
                  </h4>
                  <p className="text-[11.5px] text-slate-400 dark:text-slate-500 mt-0.5">
                    Output Accuracy
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
                <span>Hallucination Rate</span>
                <span className="font-semibold text-slate-800 dark:text-slate-300">Model Reliability</span>
              </div>
            </motion.div>
          </div>

          {/* ── 3. Right Tall Card (100x Processing Speed) ── */}
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
                {speedMultiplier}
              </span>
            </div>

            <div className="relative z-10 space-y-2 pt-8">
              <h3 className="text-[19px] font-bold text-slate-900 dark:text-white tracking-tight">
                Processing Speed
              </h3>
              <p className="text-[13px] text-slate-500 dark:text-slate-400 leading-relaxed">
                Accelerate data ingestion and analysis with our optimized inference engine.
              </p>
            </div>
          </motion.div>

          {/* ── 4. Bottom Full-Width Card (Natural Language) ── */}
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
                  Natural Language
                </h4>
                <p className="text-[12.5px] text-slate-500 dark:text-slate-400">
                  Control your infrastructure using plain English commands.
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
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-slate-950 hover:bg-slate-800 text-white dark:bg-white dark:text-slate-950 dark:hover:bg-slate-100 text-[13px] font-bold shadow-xs hover:scale-[1.02] active:scale-[0.98] transition-all cursor-pointer"
              >
                <span>Proceed to Dashboard</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </motion.div>

        </div>

      </div>

      {/* ══ Bottom Floating Audio Player Bar ═══════════════════════════════ */}
      <motion.div
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, delay: 0.6 }}
        className="fixed bottom-6 left-1/2 -translate-x-1/2 w-[92%] max-w-[880px] z-50 flex items-center gap-3 sm:gap-4 p-2 sm:p-2.5 rounded-full bg-white/90 dark:bg-[#14151a]/90 backdrop-blur-xl border border-slate-200/80 dark:border-white/10 shadow-2xl"
      >
        {/* Play / Pause Circular Button */}
        <button
          type="button"
          onClick={togglePlay}
          className="w-11 h-11 sm:w-12 sm:h-12 rounded-full bg-white dark:bg-[#1e1f25] border border-slate-200/90 dark:border-white/10 flex items-center justify-center text-slate-900 dark:text-white shadow-xs hover:scale-105 active:scale-95 transition-all cursor-pointer shrink-0"
          aria-label={isPlaying ? 'Pause voice' : 'Play voice'}
        >
          {isPlaying ? <Pause className="w-4 h-4 fill-slate-900 dark:fill-white" /> : <Play className="w-4 h-4 fill-slate-900 dark:fill-white ml-0.5" />}
        </button>

        {/* Volume Button */}
        <button
          type="button"
          onClick={toggleMute}
          className="w-11 h-11 sm:w-12 sm:h-12 rounded-full bg-white dark:bg-[#1e1f25] border border-slate-200/90 dark:border-white/10 flex items-center justify-center text-slate-900 dark:text-white shadow-xs hover:scale-105 active:scale-95 transition-all cursor-pointer shrink-0"
          aria-label={isMuted ? 'Unmute' : 'Mute'}
        >
          {isMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
        </button>

        {/* Hot Pink / Violet Scrubber Track */}
        <div
          onClick={handleSeek}
          className="flex-1 h-3 rounded-full bg-slate-100 dark:bg-white/10 p-0.5 cursor-pointer relative overflow-hidden"
        >
          <div
            className="h-full rounded-full bg-gradient-to-r from-[#ec4899] via-[#f43f5e] to-[#ec4899] transition-all duration-150 relative"
            style={{ width: `${Math.max(5, progress)}%` }}
          >
            <div className="absolute right-0 top-1/2 -translate-y-1/2 w-2 h-2 rounded-full bg-white shadow-xs" />
          </div>
        </div>

        {/* Audio Element */}
        <audio
          ref={audioRef}
          src="/media/voice-sample-ssc-cgl.mp3"
          preload="auto"
          onTimeUpdate={handleTimeUpdate}
          onLoadedMetadata={() => setAudioDuration(audioRef.current?.duration || 0)}
          onEnded={() => {
            setIsPlaying(false);
            setProgress(100);
          }}
        />

        {/* Proceed Action Button inside Controller */}
        <button
          onClick={handleProceed}
          className="px-4 sm:px-6 py-2.5 rounded-full bg-indigo-600 hover:bg-indigo-500 text-white text-[12.5px] sm:text-[13px] font-bold shadow-xs hover:scale-[1.02] active:scale-[0.98] transition-transform flex items-center gap-1.5 shrink-0 cursor-pointer"
        >
          <span>Continue</span>
          <ArrowRight className="w-3.5 h-3.5" />
        </button>
      </motion.div>

    </div>
  );
}
