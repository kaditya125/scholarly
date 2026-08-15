import { useState, useEffect, useRef } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { motion, AnimatePresence, useReducedMotion } from 'motion/react';
import {
  Play, Pause, RotateCcw, Volume2, VolumeX, Maximize2,
  Sparkles, Bot, Presentation, Headphones, NotebookPen,
  CheckCircle2, ArrowRight, BookOpen, Wallet, Users,
  SlidersHorizontal, Check, Zap, Video, FileText, Layers,
  BarChart3, ShieldCheck
} from 'lucide-react';
import SiteHeader from '../components/landing/SiteHeader';
import SiteFooter from '../components/landing/SiteFooter';

/** Video Chapters Definition */
interface VideoChapter {
  id: string;
  title: string;
  subtitle: string;
  duration: string;
  icon: any;
  badge: string;
}

const STUDENT_CHAPTERS: VideoChapter[] = [
  {
    id: 'ai-tutor',
    title: 'AI Tutor & Reasoning Trace',
    subtitle: 'Transparent 6-step thinking with NCERT citations',
    duration: '0:45',
    icon: Bot,
    badge: 'Step-by-Step AI',
  },
  {
    id: 'teacher-classes',
    title: 'Teacher Classrooms & Notes',
    subtitle: 'Live lectures, cohort batches & exclusive educator notes',
    duration: '0:50',
    icon: Presentation,
    badge: 'Educator Suite',
  },
  {
    id: 'notebooks',
    title: 'Smart PDF Notebooks',
    subtitle: 'Upload your syllabus, link concepts & query across files',
    duration: '0:40',
    icon: NotebookPen,
    badge: 'Curriculum Vault',
  },
  {
    id: 'podcasts-tests',
    title: 'Podcasts & Adaptive Tests',
    subtitle: 'Two-voice audio explainers & performance analytics',
    duration: '0:55',
    icon: Headphones,
    badge: 'Audio & Assessment',
  },
];

const TEACHER_CHAPTERS: VideoChapter[] = [
  {
    id: 'lesson-studio',
    title: 'AI Lesson Studio & Slides',
    subtitle: 'Generate lesson plans, slide decks & practice sheets',
    duration: '0:45',
    icon: Sparkles,
    badge: 'AI Lesson Studio',
  },
  {
    id: 'live-teaching',
    title: 'Interactive Live Classrooms',
    subtitle: 'Host video lectures, screen sharing & recorded archives',
    duration: '0:50',
    icon: Presentation,
    badge: 'Live Classroom',
  },
  {
    id: 'cohorts-grading',
    title: 'Cohorts & Automated Grading',
    subtitle: 'Manage batches, distribute assignments & auto-grade',
    duration: '0:45',
    icon: CheckCircle2,
    badge: 'Cohort Hub',
  },
  {
    id: 'earnings-payouts',
    title: 'Earnings & RazorpayX Payouts',
    subtitle: 'Direct automated weekly bank settlements & ledger',
    duration: '0:40',
    icon: Wallet,
    badge: 'Financial OS',
  },
];

/**
 * Real Video Configuration
 * Drop your AI-generated MP4 / WebM demo video files or URLs here.
 * When provided, the player streams the real video ad / walkthrough with custom transport controls.
 * If left empty, it automatically runs the rich interactive platform simulation.
 */
export const DEMO_VIDEOS = {
  student: {
    src: '', // e.g. '/videos/student-demo.mp4' or 'https://...'
    poster: '',
  },
  teacher: {
    src: '', // e.g. '/videos/teacher-demo.mp4' or 'https://...'
    poster: '',
  },
};

export default function HowItWorks() {
  const [searchParams, setSearchParams] = useSearchParams();
  const roleParam = searchParams.get('role');
  const [activeRole, setActiveRole] = useState<'student' | 'teacher'>(
    roleParam === 'teacher' ? 'teacher' : 'student'
  );

  const reduced = useReducedMotion();
  const [activeChapterIndex, setActiveChapterIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(true);
  const [progress, setProgress] = useState(25);
  const [isMuted, setIsMuted] = useState(false);
  const [playbackSpeed, setPlaybackSpeed] = useState<number>(1);
  const videoContainerRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);

  const activeVideoConfig = DEMO_VIDEOS[activeRole];
  const hasRealVideo = Boolean(activeVideoConfig?.src);

  // Sync role with URL query parameter
  useEffect(() => {
    if (roleParam === 'teacher') {
      setActiveRole('teacher');
    } else if (roleParam === 'student') {
      setActiveRole('student');
    }
  }, [roleParam]);

  const chapters = activeRole === 'teacher' ? TEACHER_CHAPTERS : STUDENT_CHAPTERS;
  const currentChapter = chapters[activeChapterIndex] || chapters[0];

  // Reset chapter index when switching role
  const handleRoleSwitch = (newRole: 'student' | 'teacher') => {
    setActiveRole(newRole);
    setActiveChapterIndex(0);
    setProgress(0);
    setSearchParams({ role: newRole });
  };

  // Video time tracking and simulated progress fallback
  useEffect(() => {
    if (hasRealVideo && videoRef.current) {
      if (isPlaying) {
        videoRef.current.play().catch(() => {});
      } else {
        videoRef.current.pause();
      }
      videoRef.current.playbackRate = playbackSpeed;
      videoRef.current.muted = isMuted;
    }
  }, [isPlaying, playbackSpeed, isMuted, hasRealVideo]);

  // Auto-advance simulated video progress when real video is not loaded
  useEffect(() => {
    if (hasRealVideo || !isPlaying) return;
    const interval = setInterval(() => {
      setProgress((prev) => {
        if (prev >= 100) {
          setActiveChapterIndex((idx) => (idx + 1) % chapters.length);
          return 0;
        }
        return prev + 1.25 * playbackSpeed;
      });
    }, 120);

    return () => clearInterval(interval);
  }, [isPlaying, playbackSpeed, activeChapterIndex, chapters.length, hasRealVideo]);

  const toggleFullscreen = () => {
    if (!videoContainerRef.current) return;
    if (!document.fullscreenElement) {
      videoContainerRef.current.requestFullscreen?.().catch(() => {});
    } else {
      document.exitFullscreen?.().catch(() => {});
    }
  };

  return (
    <div className="min-h-screen bg-white dark:bg-[#0b0b0c] text-slate-900 dark:text-gray-100 font-sans antialiased selection:bg-[#c8e558] selection:text-slate-900">
      <SiteHeader />

      <main>
        {/* ══ Hero Section ══════════════════════════════════════════════════ */}
        <section className="relative pt-12 sm:pt-20 pb-8 sm:pb-12 overflow-hidden">
          {/* Subtle Ambient Background Gradients */}
          <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[350px] bg-gradient-to-tr from-[#c8e558]/15 via-emerald-500/10 to-transparent blur-[120px] pointer-events-none rounded-full" />

          <div className="max-w-[1160px] mx-auto px-5 sm:px-8 relative z-10 text-center">
            {/* Perspective Switcher Capsule */}
            <motion.div
              initial={reduced ? false : { opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              className="inline-flex items-center p-1 rounded-full border border-slate-200 dark:border-white/10 bg-slate-100/90 dark:bg-white/[0.04] backdrop-blur-md mb-6 shadow-xs"
            >
              <button
                onClick={() => handleRoleSwitch('student')}
                className={`flex items-center gap-1.5 px-4 py-1.5 rounded-full text-[13px] font-semibold transition-all ${
                  activeRole === 'student'
                    ? 'bg-white dark:bg-[#18181b] text-slate-900 dark:text-white shadow-xs'
                    : 'text-slate-600 dark:text-gray-400 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                <Bot className="w-3.5 h-3.5 text-[#8ba32b] dark:text-[#c8e558]" />
                For Students
              </button>
              <button
                onClick={() => handleRoleSwitch('teacher')}
                className={`flex items-center gap-1.5 px-4 py-1.5 rounded-full text-[13px] font-semibold transition-all ${
                  activeRole === 'teacher'
                    ? 'bg-white dark:bg-[#18181b] text-slate-900 dark:text-white shadow-xs'
                    : 'text-slate-600 dark:text-gray-400 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                <Presentation className="w-3.5 h-3.5 text-[#8ba32b] dark:text-[#c8e558]" />
                For Teachers & Educators
              </button>
            </motion.div>

            {/* Dynamic Headline Based on Role */}
            <motion.h1
              key={activeRole}
              initial={reduced ? false : { opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4 }}
              className="text-[28px] sm:text-[40px] lg:text-[48px] font-semibold tracking-[-0.03em] max-w-[42rem] mx-auto text-slate-900 dark:text-white leading-[1.14]"
            >
              {activeRole === 'student' ? (
                <>
                  See how Scholarly <br className="hidden sm:block" />
                  <span className="relative inline-block">
                    transforms
                    <svg
                      className="absolute -bottom-1 sm:-bottom-1.5 left-0 w-full text-[#c8e558]/80 dark:text-[#c8e558]"
                      viewBox="0 0 100 12"
                      preserveAspectRatio="none"
                      height="6"
                    >
                      <path d="M0 7 Q 50 12 100 7" stroke="currentColor" strokeWidth="3" fill="none" strokeLinecap="round" />
                    </svg>
                  </span>{' '}
                  your exam preparation.
                </>
              ) : (
                <>
                  Less time preparing. <br className="hidden sm:block" />
                  <span className="relative inline-block">
                    More time teaching.
                    <svg
                      className="absolute -bottom-1 sm:-bottom-1.5 left-0 w-full text-[#c8e558]/80 dark:text-[#c8e558]"
                      viewBox="0 0 100 12"
                      preserveAspectRatio="none"
                      height="6"
                    >
                      <path d="M0 7 Q 50 12 100 7" stroke="currentColor" strokeWidth="3" fill="none" strokeLinecap="round" />
                    </svg>
                  </span>
                </>
              )}
            </motion.h1>

            <motion.p
              key={`${activeRole}-sub`}
              initial={reduced ? false : { opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: 0.05 }}
              className="mt-4 sm:mt-5 text-[15px] sm:text-[16px] text-slate-500 dark:text-gray-400 max-w-[34rem] mx-auto leading-relaxed"
            >
              {activeRole === 'student'
                ? 'Watch the interactive platform demo below to see how our curriculum-tuned AI, smart notebooks, verified teacher classrooms, and audio podcasts unite in one seamless flow.'
                : 'See how the Scholarly Educator OS cuts preparation time by 80%, runs crystal-clear interactive live classes, auto-grades assignments, and delivers automated weekly RazorpayX bank payouts.'}
            </motion.p>
          </div>
        </section>

        {/* ══ Video Player Showcase ═════════════════════════════════════════ */}
        <section className="max-w-[1100px] mx-auto px-5 sm:px-8 pb-20 sm:pb-28">
          {/* Video Container Shell */}
          <div
            ref={videoContainerRef}
            className="relative rounded-2xl sm:rounded-3xl border border-slate-200/90 dark:border-white/10 bg-slate-950 dark:bg-[#111113] text-white shadow-[0_16px_50px_-15px_rgba(0,0,0,0.25)] dark:shadow-[0_20px_60px_-15px_rgba(0,0,0,0.7)] overflow-hidden"
          >
            {/* Top Minimalist Window Bar */}
            <div className="h-9 px-4 sm:px-5 bg-slate-900/60 dark:bg-white/[0.02] border-b border-white/[0.06] flex items-center justify-between text-[11px] text-slate-400">
              <div className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-white/20" />
                <span className="w-2 h-2 rounded-full bg-white/20" />
                <span className="w-2 h-2 rounded-full bg-white/20" />
                <span className="ml-2 font-mono text-[10.5px] text-slate-500 hidden sm:inline">
                  scholarly.app · {activeRole === 'teacher' ? 'educator OS' : 'platform tour'}
                </span>
              </div>
              <div className="flex items-center gap-1.5 font-medium text-[11px] text-slate-400">
                <span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                <span>Interactive Simulation</span>
              </div>
            </div>

            {/* Video Screen Viewport */}
            <div className="relative min-h-[340px] sm:min-h-[420px] lg:min-h-[460px] bg-gradient-to-b from-[#141417] to-[#0c0c0e] flex items-center justify-center p-4 sm:p-6 overflow-hidden">
              {hasRealVideo ? (
                <div className="relative w-full h-full flex items-center justify-center">
                  <video
                    ref={videoRef}
                    src={activeVideoConfig.src}
                    poster={activeVideoConfig.poster}
                    playsInline
                    onTimeUpdate={() => {
                      if (videoRef.current && videoRef.current.duration) {
                        setProgress((videoRef.current.currentTime / videoRef.current.duration) * 100);
                      }
                    }}
                    onEnded={() => {
                      setActiveChapterIndex((idx) => (idx + 1) % chapters.length);
                      setProgress(0);
                    }}
                    className="w-full h-full max-h-[460px] object-contain rounded-xl shadow-xl"
                  />
                  {!isPlaying && (
                    <button
                      onClick={() => setIsPlaying(true)}
                      className="absolute inset-0 m-auto w-14 h-14 rounded-full bg-white/90 text-slate-900 flex items-center justify-center hover:scale-105 active:scale-95 transition-all shadow-xl backdrop-blur-md"
                      aria-label="Play video"
                    >
                      <Play className="w-6 h-6 ml-0.5 fill-current" />
                    </button>
                  )}
                </div>
              ) : (
                <AnimatePresence mode="wait">
                  {/* ───────────────────────────────────────────────────────────── */}
                  {/* STUDENT SCENES                                                */}
                  {/* ───────────────────────────────────────────────────────────── */}
                  {activeRole === 'student' && activeChapterIndex === 0 && (
                    <motion.div
                      key="student-scene-0"
                      initial={{ opacity: 0, scale: 0.98 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.98 }}
                      transition={{ duration: 0.2 }}
                      className="w-full max-w-[38rem] bg-white/[0.04] border border-white/[0.08] backdrop-blur-xl rounded-xl p-4 sm:p-5 space-y-3 shadow-xl"
                    >
                      <div className="flex justify-end">
                        <div className="px-3.5 py-1.5 rounded-xl rounded-tr-xs bg-white text-slate-900 font-medium text-[12.5px] sm:text-[13px] shadow-xs">
                          Why does resistance of a conductor increase with temperature? (NEET Physics)
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5 text-[11px] text-slate-400 bg-white/[0.03] border border-white/[0.05] px-2.5 py-1 rounded-md w-fit">
                        <span className="w-1.5 h-1.5 rounded-full bg-[#c8e558]" />
                        <span className="font-medium text-slate-200">Reasoning trace:</span>
                        <span>Thermal amplitude ↑ → Relaxation time τ ↓ → ρ = m/(n e² τ)</span>
                      </div>
                      <div className="bg-white/[0.02] border border-white/[0.06] rounded-lg p-3.5 text-[12.5px] sm:text-[13px] leading-relaxed text-slate-200 space-y-2.5">
                        <p>
                          Higher temperature increases lattice vibration amplitude. Electrons collide more frequently, reducing average relaxation time (<code className="text-[#c8e558] font-mono">τ</code>), which raises resistivity.
                        </p>
                        <div className="p-2.5 rounded-md bg-amber-500/10 border border-amber-500/20 text-amber-200 text-[11.5px]">
                          <strong>Common Exam Mistake:</strong> Semiconductor resistance decreases with heat due to extra carrier generation across bandgap.
                        </div>
                        <div className="flex items-center gap-2 text-[11px] text-slate-400 pt-1">
                          <span className="text-slate-500">Sources:</span>
                          <span className="px-2 py-0.5 rounded bg-white/5 text-slate-300">📖 NCERT Physics XII · Ch 3</span>
                          <span className="px-2 py-0.5 rounded bg-white/5 text-[#c8e558]">✦ Verified Notes</span>
                        </div>
                      </div>
                    </motion.div>
                  )}

                  {activeRole === 'student' && activeChapterIndex === 1 && (
                    <motion.div
                      key="student-scene-1"
                      initial={{ opacity: 0, scale: 0.98 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.98 }}
                      transition={{ duration: 0.2 }}
                      className="w-full max-w-[40rem] bg-white/[0.04] border border-white/[0.08] backdrop-blur-xl rounded-xl p-4 sm:p-5 space-y-3 shadow-xl"
                    >
                      <div className="flex items-center justify-between border-b border-white/[0.06] pb-2.5">
                        <div className="flex items-center gap-2.5">
                          <div className="w-7 h-7 rounded-full bg-indigo-500/20 border border-indigo-400/30 flex items-center justify-center font-semibold text-indigo-300 text-xs">
                            VS
                          </div>
                          <div>
                            <h4 className="text-[12.5px] font-semibold text-white">Advanced Organic Chemistry (Batch 2026)</h4>
                            <p className="text-[10.5px] text-slate-400">Taught by Prof. Vikram Sen · Verified Faculty</p>
                          </div>
                        </div>
                        <span className="px-2 py-0.5 rounded-full bg-red-500/15 text-red-400 text-[10px] font-semibold flex items-center gap-1">
                          <span className="w-1.5 h-1.5 rounded-full bg-red-400 animate-pulse" /> LIVE (142 Students)
                        </span>
                      </div>

                      <div className="grid sm:grid-cols-2 gap-2.5">
                        <div className="bg-white/[0.02] border border-white/[0.05] rounded-lg p-3 space-y-1">
                          <div className="flex items-center gap-1.5 text-[#c8e558] text-[11.5px] font-semibold">
                            <Presentation className="w-3.5 h-3.5" />
                            <span>Interactive Video Class</span>
                          </div>
                          <p className="text-[11.5px] text-slate-300 leading-snug">
                            Digital board, live doubt queuing, and instant auto-archived cloud HD recordings.
                          </p>
                        </div>

                        <div className="bg-white/[0.02] border border-white/[0.05] rounded-lg p-3 space-y-1">
                          <div className="flex items-center gap-1.5 text-indigo-300 text-[11.5px] font-semibold">
                            <BookOpen className="w-3.5 h-3.5" />
                            <span>Exclusive Teacher Notes</span>
                          </div>
                          <p className="text-[11.5px] text-slate-300 leading-snug">
                            Direct access to curated revision sheets, handwritten mechanisms, and graded tests.
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center justify-between px-3 py-1.5 rounded-md bg-emerald-500/10 text-emerald-300 text-[11px]">
                        <span>✓ Enrolled students receive automated class updates & feedback.</span>
                        <span className="font-semibold text-white">Join Cohort →</span>
                      </div>
                    </motion.div>
                  )}

                  {activeRole === 'student' && activeChapterIndex === 2 && (
                    <motion.div
                      key="student-scene-2"
                      initial={{ opacity: 0, scale: 0.98 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.98 }}
                      transition={{ duration: 0.2 }}
                      className="w-full max-w-[38rem] bg-white/[0.04] border border-white/[0.08] backdrop-blur-xl rounded-xl p-4 sm:p-5 space-y-3 shadow-xl"
                    >
                      <div className="flex items-center justify-between border-b border-white/[0.06] pb-2.5">
                        <div className="flex items-center gap-2 text-[#c8e558]">
                          <NotebookPen className="w-3.5 h-3.5" />
                          <span className="text-[12.5px] font-semibold text-white">NEET Biology Term 2 Mastery</span>
                        </div>
                        <span className="text-[10.5px] text-slate-400">3 PDFs & 14 Notes indexed</span>
                      </div>

                      <div className="grid grid-cols-3 gap-2 text-center text-[11.5px]">
                        <div className="p-2 rounded-lg bg-white/[0.03] border border-white/[0.06]">
                          <span className="block font-medium text-slate-200 truncate">Cell Biology.pdf</span>
                          <span className="text-[10px] text-emerald-400">Indexed</span>
                        </div>
                        <div className="p-2 rounded-lg bg-white/[0.03] border border-white/[0.06]">
                          <span className="block font-medium text-slate-200 truncate">Genetics_Notes.pdf</span>
                          <span className="text-[10px] text-emerald-400">Indexed</span>
                        </div>
                        <div className="p-2 rounded-lg bg-white/[0.03] border border-white/[0.06]">
                          <span className="block font-medium text-slate-200 truncate">Teacher_QBank.pdf</span>
                          <span className="text-[10px] text-emerald-400">Indexed</span>
                        </div>
                      </div>

                      <div className="p-3 rounded-lg bg-white/[0.02] border border-white/[0.05] text-[12px] text-slate-300 space-y-1">
                        <div className="font-semibold text-white flex items-center gap-1.5 text-[12px]">
                          <Bot className="w-3.5 h-3.5 text-[#c8e558]" />
                          Cross-Document Intelligence
                        </div>
                        <p className="text-[11.5px] leading-relaxed text-slate-400">
                          Answers synthesized strictly from your uploaded materials, citing exact page numbers and paragraphs.
                        </p>
                      </div>
                    </motion.div>
                  )}

                  {activeRole === 'student' && activeChapterIndex === 3 && (
                    <motion.div
                      key="student-scene-3"
                      initial={{ opacity: 0, scale: 0.98 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.98 }}
                      transition={{ duration: 0.2 }}
                      className="w-full max-w-[38rem] bg-white/[0.04] border border-white/[0.08] backdrop-blur-xl rounded-xl p-4 sm:p-5 space-y-3 shadow-xl"
                    >
                      <div className="p-3 rounded-lg bg-white/[0.02] border border-white/[0.06] flex items-center justify-between">
                        <div className="flex items-center gap-2.5">
                          <div className="w-8 h-8 rounded-full bg-[#c8e558]/20 flex items-center justify-center text-[#c8e558]">
                            <Headphones className="w-4 h-4" />
                          </div>
                          <div>
                            <h4 className="text-[12.5px] font-semibold text-white">Rotational Dynamics Explainer</h4>
                            <p className="text-[10.5px] text-slate-400">Two-Voice Audio · Arjun & Riya</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-1">
                          <span className="w-1 h-3 bg-[#c8e558] rounded-full animate-bounce" />
                          <span className="w-1 h-5 bg-[#c8e558] rounded-full animate-bounce [animation-delay:0.15s]" />
                          <span className="w-1 h-3.5 bg-[#c8e558] rounded-full animate-bounce [animation-delay:0.3s]" />
                          <span className="w-1 h-2 bg-[#c8e558] rounded-full animate-bounce [animation-delay:0.2s]" />
                        </div>
                      </div>

                      <div className="p-3 rounded-lg bg-white/[0.02] border border-white/[0.06] flex items-center justify-between">
                        <div>
                          <span className="text-[10px] font-semibold uppercase tracking-wider text-emerald-400">Adaptive Mock Test</span>
                          <p className="text-[12.5px] font-medium text-white">Accuracy: 88% · +24% speed gain</p>
                        </div>
                        <Link
                          to="/tests"
                          className="px-2.5 py-1 rounded-md bg-white/10 hover:bg-white/15 text-[11.5px] font-medium text-white transition-colors"
                        >
                          Take Test →
                        </Link>
                      </div>
                    </motion.div>
                  )}

                  {/* ───────────────────────────────────────────────────────────── */}
                  {/* TEACHER SCENES                                                */}
                  {/* ───────────────────────────────────────────────────────────── */}
                  {activeRole === 'teacher' && activeChapterIndex === 0 && (
                    <motion.div
                      key="teacher-scene-0"
                      initial={{ opacity: 0, scale: 0.98 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.98 }}
                      transition={{ duration: 0.2 }}
                      className="w-full max-w-[40rem] bg-white/[0.04] border border-white/[0.08] backdrop-blur-xl rounded-xl p-4 sm:p-5 space-y-3 shadow-xl"
                    >
                      <div className="flex items-center justify-between border-b border-white/[0.06] pb-2">
                        <div className="flex items-center gap-1.5">
                          <Sparkles className="w-3.5 h-3.5 text-[#c8e558]" />
                          <span className="text-[12.5px] font-semibold text-white">AI Lesson Preparation Studio</span>
                        </div>
                        <span className="px-2 py-0.5 rounded text-[10.5px] font-mono bg-white/10 text-slate-300">CBSE Class 12 · Physics</span>
                      </div>

                      <div className="p-2.5 rounded-lg bg-white/[0.03] border border-white/[0.05] text-[12px] text-slate-300">
                        <span className="font-semibold text-white">Prompt: </span>
                        &ldquo;Draft a 45-min lesson on Electromagnetic Induction with 3 concept checks and homework set.&rdquo;
                      </div>

                      <div className="grid grid-cols-3 gap-2">
                        <div className="p-2.5 rounded-lg bg-white/[0.02] border border-white/[0.05] space-y-0.5">
                          <span className="text-[10.5px] font-semibold text-[#c8e558]">1. Slide Deck</span>
                          <p className="text-[10.5px] text-slate-400">12 Slides with Faraday & Lenz derivations.</p>
                        </div>
                        <div className="p-2.5 rounded-lg bg-white/[0.02] border border-white/[0.05] space-y-0.5">
                          <span className="text-[10.5px] font-semibold text-[#c8e558]">2. Handout Notes</span>
                          <p className="text-[10.5px] text-slate-400">PDF formula sheets & common traps.</p>
                        </div>
                        <div className="p-2.5 rounded-lg bg-white/[0.02] border border-white/[0.05] space-y-0.5">
                          <span className="text-[10.5px] font-semibold text-[#c8e558]">3. Auto Quiz</span>
                          <p className="text-[10.5px] text-slate-400">5 multiple choice exam pattern checks.</p>
                        </div>
                      </div>

                      <div className="flex items-center justify-between text-[11px] pt-0.5">
                        <span className="text-slate-400">Saved ~3.5 hours of manual preparation.</span>
                        <button className="px-2.5 py-1 rounded-md bg-[#c8e558] text-slate-900 font-semibold text-[11.5px] hover:bg-[#bcd94c] transition-colors">
                          Export to Class →
                        </button>
                      </div>
                    </motion.div>
                  )}

                  {activeRole === 'teacher' && activeChapterIndex === 1 && (
                    <motion.div
                      key="teacher-scene-1"
                      initial={{ opacity: 0, scale: 0.98 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.98 }}
                      transition={{ duration: 0.2 }}
                      className="w-full max-w-[40rem] bg-white/[0.04] border border-white/[0.08] backdrop-blur-xl rounded-xl p-4 sm:p-5 space-y-3 shadow-xl"
                    >
                      <div className="flex items-center justify-between border-b border-white/[0.06] pb-2">
                        <div className="flex items-center gap-2">
                          <div className="w-2.5 h-2.5 rounded-full bg-red-500 animate-ping" />
                          <span className="font-semibold text-white text-[12.5px]">Live Class Session · Wave Optics</span>
                        </div>
                        <div className="flex items-center gap-1.5 text-[10.5px] text-slate-300">
                          <span className="px-1.5 py-0.5 rounded bg-white/10">1080p HD</span>
                          <span className="px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300">Recording</span>
                        </div>
                      </div>

                      <div className="grid sm:grid-cols-3 gap-2.5">
                        <div className="sm:col-span-2 rounded-lg bg-black/60 border border-white/[0.06] p-3 flex flex-col justify-between min-h-[130px]">
                          <div className="text-[10px] font-mono text-emerald-400">● Whiteboard Screen Sharing</div>
                          <div className="text-center py-3 text-slate-300 font-serif italic text-[14px]">
                            &beta; = &lambda; D / d (Fringe Width)
                          </div>
                          <div className="flex items-center justify-between text-[10px] text-slate-500">
                            <span>Audio: Noise-Cancelled</span>
                            <span>Latency: 38ms</span>
                          </div>
                        </div>

                        <div className="rounded-lg bg-white/[0.02] border border-white/[0.06] p-2.5 space-y-1.5">
                          <div className="text-[10.5px] font-semibold text-white flex items-center justify-between">
                            <span>Live Doubts (2)</span>
                            <span className="text-[9.5px] text-[#c8e558]">Priority</span>
                          </div>
                          <div className="p-1.5 rounded bg-white/5 text-[10.5px] text-slate-300 leading-snug">
                            <span className="font-semibold text-white">Aditya:</span> Why doesn&rsquo;t central maxima shift?
                          </div>
                          <div className="p-1.5 rounded bg-white/5 text-[10.5px] text-slate-300 leading-snug">
                            <span className="font-semibold text-white">Sneha:</span> Path difference &delta; query.
                          </div>
                        </div>
                      </div>
                    </motion.div>
                  )}

                  {activeRole === 'teacher' && activeChapterIndex === 2 && (
                    <motion.div
                      key="teacher-scene-2"
                      initial={{ opacity: 0, scale: 0.98 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.98 }}
                      transition={{ duration: 0.2 }}
                      className="w-full max-w-[40rem] bg-white/[0.04] border border-white/[0.08] backdrop-blur-xl rounded-xl p-4 sm:p-5 space-y-2.5 shadow-xl"
                    >
                      <div className="flex items-center justify-between border-b border-white/[0.06] pb-2">
                        <div className="flex items-center gap-1.5">
                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                          <span className="text-[12.5px] font-semibold text-white">Batch Assignments & Auto-Grading</span>
                        </div>
                        <span className="text-[10.5px] text-slate-400">Target JEE 2026 (48 Students)</span>
                      </div>

                      <div className="space-y-1.5">
                        {[
                          { name: 'Kavya Sharma', score: '28 / 30', status: 'Auto-Graded' },
                          { name: 'Rahul Verma', score: '25 / 30', status: 'Auto-Graded' },
                          { name: 'Pooja Iyer', score: '30 / 30 (Top)', status: 'Auto-Graded' },
                        ].map((st) => (
                          <div key={st.name} className="p-2 rounded-lg bg-white/[0.02] border border-white/[0.05] flex items-center justify-between text-[11.5px]">
                            <div className="flex items-center gap-2">
                              <span className="w-5 h-5 rounded-full bg-white/10 flex items-center justify-center font-bold text-[10px]">
                                {st.name[0]}
                              </span>
                              <span className="font-medium text-white">{st.name}</span>
                            </div>
                            <div className="flex items-center gap-3">
                              <span className="font-mono text-emerald-400 font-medium">{st.score}</span>
                              <span className="px-1.5 py-0.5 rounded text-[10px] bg-emerald-500/10 text-emerald-300">
                                {st.status}
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>

                      <div className="flex items-center justify-between pt-1 text-[11px] text-slate-400">
                        <span>1-click release to students & parents.</span>
                        <button className="px-2 py-0.5 rounded bg-white/10 hover:bg-white/20 text-white transition-colors">
                          Publish Reports →
                        </button>
                      </div>
                    </motion.div>
                  )}

                  {activeRole === 'teacher' && activeChapterIndex === 3 && (
                    <motion.div
                      key="teacher-scene-3"
                      initial={{ opacity: 0, scale: 0.98 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.98 }}
                      transition={{ duration: 0.2 }}
                      className="w-full max-w-[40rem] bg-white/[0.04] border border-white/[0.08] backdrop-blur-xl rounded-xl p-4 sm:p-5 space-y-3 shadow-xl"
                    >
                      <div className="flex items-center justify-between border-b border-white/[0.06] pb-2">
                        <div className="flex items-center gap-1.5">
                          <Wallet className="w-3.5 h-3.5 text-[#c8e558]" />
                          <span className="text-[12.5px] font-semibold text-white">Revenue Ledger & RazorpayX</span>
                        </div>
                        <span className="text-[10.5px] text-emerald-300 font-medium">● Weekly Bank Settlement</span>
                      </div>

                      <div className="grid grid-cols-3 gap-2 text-center">
                        <div className="p-2.5 rounded-lg bg-white/[0.02] border border-white/[0.06]">
                          <span className="text-[10px] text-slate-400 uppercase">This Week</span>
                          <div className="text-lg font-bold text-white mt-0.5">₹42,800</div>
                          <span className="text-[9.5px] text-emerald-400">RazorpayX</span>
                        </div>
                        <div className="p-2.5 rounded-lg bg-white/[0.02] border border-white/[0.06]">
                          <span className="text-[10px] text-slate-400 uppercase">Paid Students</span>
                          <div className="text-lg font-bold text-white mt-0.5">86</div>
                          <span className="text-[9.5px] text-slate-400">3 Batches</span>
                        </div>
                        <div className="p-2.5 rounded-lg bg-white/[0.02] border border-white/[0.06]">
                          <span className="text-[10px] text-slate-400 uppercase">Referrals</span>
                          <div className="text-lg font-bold text-[#c8e558] mt-0.5">₹8,400</div>
                          <span className="text-[9.5px] text-slate-400">4 Invites</span>
                        </div>
                      </div>

                      <div className="p-2 rounded bg-emerald-500/10 text-emerald-300 text-[11px] flex items-center justify-between">
                        <span>✓ Automated settlements to verified bank account.</span>
                        <Link to="/teach/earnings" className="font-semibold text-white hover:underline">
                          Ledger →
                        </Link>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              )}
            </div>

            {/* Minimalist Controls Bar */}
            <div className="py-2.5 px-4 sm:px-5 bg-slate-900/90 dark:bg-black/60 border-t border-white/[0.06] flex flex-col gap-2">
              {/* Sleek Scrub Bar */}
              <div
                onClick={(e) => {
                  const rect = e.currentTarget.getBoundingClientRect();
                  const clickX = e.clientX - rect.left;
                  const newProgress = Math.min(100, Math.max(0, (clickX / rect.width) * 100));
                  setProgress(newProgress);
                  if (hasRealVideo && videoRef.current && videoRef.current.duration) {
                    videoRef.current.currentTime = (newProgress / 100) * videoRef.current.duration;
                  }
                }}
                className="relative w-full h-1 hover:h-1.5 bg-white/10 rounded-full cursor-pointer overflow-hidden transition-all group"
              >
                <div
                  className="h-full bg-[#c8e558] rounded-full transition-all duration-100 shadow-[0_0_8px_#c8e558]"
                  style={{ width: `${progress}%` }}
                />
              </div>

              {/* Action Buttons Row */}
              <div className="flex items-center justify-between text-[11.5px] text-slate-400">
                <div className="flex items-center gap-2.5">
                  <button
                    onClick={() => setIsPlaying(!isPlaying)}
                    className="w-6 h-6 rounded flex items-center justify-center bg-white/10 hover:bg-white/20 text-white transition-colors"
                    aria-label={isPlaying ? 'Pause' : 'Play'}
                  >
                    {isPlaying ? <Pause className="w-3 h-3" /> : <Play className="w-3 h-3 ml-0.5" />}
                  </button>

                  <button
                    onClick={() => {
                      setProgress(0);
                      if (hasRealVideo && videoRef.current) {
                        videoRef.current.currentTime = 0;
                      }
                    }}
                    className="p-1 rounded hover:bg-white/10 text-slate-400 hover:text-white transition-colors"
                    title="Replay Chapter"
                  >
                    <RotateCcw className="w-3 h-3" />
                  </button>

                  <div className="hidden sm:flex items-center gap-1.5 text-[11px]">
                    <span className="font-semibold text-slate-200">{currentChapter.badge}:</span>
                    <span className="text-slate-400">{currentChapter.title}</span>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setPlaybackSpeed((s) => (s === 1 ? 1.5 : s === 1.5 ? 2 : 1))}
                    className="px-1.5 py-0.5 rounded bg-white/5 hover:bg-white/10 text-[10.5px] font-mono text-slate-300 hover:text-white transition-colors"
                  >
                    {playbackSpeed}x
                  </button>

                  <button
                    onClick={() => setIsMuted(!isMuted)}
                    className="p-1 rounded hover:bg-white/10 text-slate-400 hover:text-white transition-colors"
                  >
                    {isMuted ? <VolumeX className="w-3.5 h-3.5" /> : <Volume2 className="w-3.5 h-3.5" />}
                  </button>

                  <button
                    onClick={toggleFullscreen}
                    className="p-1 rounded hover:bg-white/10 text-slate-400 hover:text-white transition-colors"
                    title="Fullscreen"
                  >
                    <Maximize2 className="w-3 h-3" />
                  </button>
                </div>
              </div>
            </div>

            {/* Minimalist Chapter Strip */}
            <div className="grid grid-cols-2 lg:grid-cols-4 border-t border-white/[0.06] bg-slate-950/80 dark:bg-[#0c0c0e]">
              {chapters.map((ch, idx) => {
                const isActive = idx === activeChapterIndex;
                const Icon = ch.icon;
                return (
                  <button
                    key={ch.id}
                    onClick={() => {
                      setActiveChapterIndex(idx);
                      setProgress(0);
                      setIsPlaying(true);
                      if (hasRealVideo && videoRef.current) {
                        videoRef.current.currentTime = 0;
                      }
                    }}
                    className={`p-3 text-left transition-all border-b sm:border-b-0 border-r last:border-r-0 border-white/[0.06] relative ${
                      isActive ? 'bg-white/[0.04]' : 'hover:bg-white/[0.02] opacity-70 hover:opacity-100'
                    }`}
                  >
                    {isActive && (
                      <div className="absolute top-0 left-0 right-0 h-0.5 bg-[#c8e558] shadow-[0_0_6px_#c8e558]" />
                    )}
                    <div className="flex items-center gap-1.5 mb-0.5">
                      <Icon className={`w-3 h-3 ${isActive ? 'text-[#c8e558]' : 'text-slate-400'}`} />
                      <span className="text-[9.5px] font-semibold uppercase tracking-wider text-slate-400">
                        0{idx + 1}
                      </span>
                    </div>
                    <div className="text-[12px] font-semibold text-white line-clamp-1">
                      {ch.title}
                    </div>
                    <div className="text-[11px] text-slate-400 line-clamp-1 mt-0.5">
                      {ch.subtitle}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </section>

        {/* ══ 4 Core Pillars Detailed Breakdown ════════════════════════════ */}
        <section className="border-t border-slate-100 dark:border-white/[0.07] bg-slate-50/60 dark:bg-white/[0.02] py-20 sm:py-28">
          <div className="max-w-[1160px] mx-auto px-5 sm:px-8">
            <div className="max-w-[34rem] mb-14 sm:mb-16">
              <span className="text-[12px] font-semibold uppercase tracking-[0.13em] text-slate-500 dark:text-gray-400">
                {activeRole === 'teacher' ? 'Educator Operating System' : 'System Architecture'}
              </span>
              <h2 className="text-[26px] sm:text-[34px] lg:text-[38px] font-semibold tracking-[-0.03em] text-slate-900 dark:text-white mt-2 leading-[1.15]">
                {activeRole === 'teacher'
                  ? 'Everything around teaching, automated.'
                  : 'Built specifically for high-stakes exams.'}
              </h2>
              <p className="text-[15px] text-slate-500 dark:text-gray-400 mt-2.5 leading-relaxed">
                {activeRole === 'teacher'
                  ? 'Stop juggling Zoom, Google Drive, WhatsApp groups, and manual spreadsheet grading. Scholarly connects your entire teaching business in one unified dashboard.'
                  : 'Generic chatbots hallucinate and give surface-level answers. Scholarly anchors every response to verified syllabus standards and your actual teachers.'}
              </p>
            </div>

            <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
              {(activeRole === 'teacher'
                ? [
                    {
                      icon: Sparkles,
                      title: '1. AI Preparation Studio',
                      desc: 'Draft comprehensive lecture slides, board notes, and problem sets from curriculum blueprints in under 3 minutes.',
                      points: ['Automated slides', 'Curriculum blueprints', 'Common pitfalls'],
                    },
                    {
                      icon: Presentation,
                      title: '2. Integrated Live Sessions',
                      desc: 'Host interactive video classes with digital whiteboard, student doubt queuing, and instant cloud recordings.',
                      points: ['1080p HD video', 'Digital whiteboard', 'Automatic archiving'],
                    },
                    {
                      icon: CheckCircle2,
                      title: '3. Automated Grading',
                      desc: 'Distribute homework and mock tests. AI pre-evaluates student answers against your custom grading rubric.',
                      points: ['Rubric-based grading', 'Batch performance', 'Parent PDF reports'],
                    },
                    {
                      icon: Wallet,
                      title: '4. RazorpayX Payouts',
                      desc: 'Collect cohort course fees seamlessly with automated, transparent weekly bank settlements via RazorpayX.',
                      points: ['Automated payouts', 'Affiliate referral revenue', 'Detailed tax invoices'],
                    },
                  ]
                : [
                    {
                      icon: Bot,
                      title: '1. Transparent Reasoning',
                      desc: 'Every problem displays its step-by-step logic and formula references before producing the final answer, so you learn how to solve it independently.',
                      points: ['6-step reasoning trace', 'Formula derivations', 'Common mistake alerts'],
                    },
                    {
                      icon: Presentation,
                      title: '2. Teacher Ecosystem',
                      desc: 'Enroll in verified teacher classrooms, access exclusive lecture recordings, and download curated revision sheets directly.',
                      points: ['Live screen sharing', 'Exclusive notes vault', 'Auto-graded assignments'],
                    },
                    {
                      icon: NotebookPen,
                      title: '3. Vectorized Notebooks',
                      desc: 'Upload class PDFs and handwritten notes. The AI indexes every paragraph and cites the exact page when solving queries.',
                      points: ['Exact page citations', 'Cross-PDF search', 'No hallucinated data'],
                    },
                    {
                      icon: Headphones,
                      title: '4. Audio & Mock Tests',
                      desc: 'Convert any chapter into a 2-voice discussion podcast for commute learning, followed by full-pattern timed mock tests.',
                      points: ['Conversational audio', 'Real pattern exams', 'Weakness pinpointing'],
                    },
                  ]
              ).map((card) => {
                const Icon = card.icon;
                return (
                  <div
                    key={card.title}
                    className="p-6 rounded-2xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#141416] shadow-xs flex flex-col justify-between"
                  >
                    <div>
                      <div className="w-10 h-10 rounded-xl bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/10 flex items-center justify-center text-slate-900 dark:text-white mb-4">
                        <Icon className="w-5 h-5 text-[#8ba32b] dark:text-[#c8e558]" />
                      </div>
                      <h3 className="text-[16px] font-semibold text-slate-900 dark:text-white">{card.title}</h3>
                      <p className="text-[13px] text-slate-500 dark:text-gray-400 mt-2 leading-relaxed">{card.desc}</p>
                    </div>

                    <ul className="mt-5 pt-4 border-t border-slate-100 dark:border-white/[0.06] space-y-1.5">
                      {card.points.map((p) => (
                        <li key={p} className="flex items-center gap-2 text-[12px] text-slate-600 dark:text-slate-300">
                          <CheckCircle2 className="w-3.5 h-3.5 text-[#8ba32b] dark:text-[#c8e558] shrink-0" />
                          <span>{p}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        {/* ══ Comparison Matrix ══════════════════════════════════════════════ */}
        <section className="max-w-[1160px] mx-auto px-5 sm:px-8 py-20 sm:py-28">
          <div className="text-center max-w-[32rem] mx-auto mb-12 sm:mb-16">
            <span className="text-[12px] font-semibold uppercase tracking-[0.13em] text-slate-500 dark:text-gray-400">
              The Difference
            </span>
            <h2 className="text-[26px] sm:text-[34px] lg:text-[38px] font-semibold tracking-[-0.03em] text-slate-900 dark:text-white mt-2 leading-[1.15]">
              {activeRole === 'teacher' ? 'Why educators choose Scholarly.' : 'Why students switch to Scholarly.'}
            </h2>
          </div>

          <div className="border border-slate-200 dark:border-white/10 rounded-2xl overflow-x-auto bg-white dark:bg-[#141416] shadow-xs">
            <table className="w-full text-left border-collapse text-[13.5px]">
              <thead>
                <tr className="border-b border-slate-200 dark:border-white/10 bg-slate-50/70 dark:bg-white/[0.03]">
                  <th className="p-4 sm:p-5 font-semibold text-slate-700 dark:text-gray-300">Capability</th>
                  <th className="p-4 sm:p-5 font-semibold text-slate-400 dark:text-gray-500">
                    {activeRole === 'teacher' ? 'Fragmented Tools (Zoom + WhatsApp)' : 'Generic AI (ChatGPT)'}
                  </th>
                  <th className="p-4 sm:p-5 font-bold text-slate-900 dark:text-[#c8e558] bg-[#c8e558]/10 dark:bg-[#c8e558]/5">
                    Scholarly
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-white/[0.06]">
                {(activeRole === 'teacher'
                  ? [
                      { feature: 'Lesson & Slide Preparation', traditional: 'Manual PowerPoint building (3-4 hrs)', scholarly: 'AI Lesson Studio generates decks in 2 mins' },
                      { feature: 'Live Class & Recordings', traditional: 'Separate Zoom link & manual Drive uploads', scholarly: 'Integrated live lectures with auto-archived cloud HD' },
                      { feature: 'Homework & Assignment Grading', traditional: 'Manual PDF checking & message replies', scholarly: 'Automated rubric grading with 1-click publishing' },
                      { feature: 'Revenue Collection & Payouts', traditional: 'Manual UPI screenshots & followups', scholarly: 'Automated weekly bank settlements via RazorpayX' },
                      { feature: 'Student Doubt Resolution', traditional: 'Overwhelmed WhatsApp chat groups', scholarly: 'Dedicated doubt queue & 24/7 AI tutor copilot' },
                    ]
                  : [
                      { feature: 'Curriculum-Aligned Reasoning', traditional: 'Generic web summaries', scholarly: 'Strict NCERT, NEET & JEE syllabus alignment' },
                      { feature: 'Source Citations', traditional: 'Unverified or missing links', scholarly: 'Page-level citations from official textbooks' },
                      { feature: 'Live Teacher Classrooms', traditional: 'No human educators', scholarly: 'Interactive classes & exclusive teacher notes' },
                      { feature: 'Audio Explainer Generation', traditional: 'Text-to-speech robot monotone', scholarly: 'Dynamic 2-voice conversational podcasts' },
                      { feature: 'Adaptive Mock Tests', traditional: 'Static text prompts', scholarly: 'Real pattern timer, ranking & marks breakdown' },
                    ]
                ).map((row) => (
                  <tr key={row.feature} className="hover:bg-slate-50/50 dark:hover:bg-white/[0.01]">
                    <td className="p-4 sm:p-5 font-medium text-slate-900 dark:text-white">{row.feature}</td>
                    <td className="p-4 sm:p-5 text-slate-500 dark:text-gray-400">
                      {'traditional' in row ? row.traditional : (row as any).generic}
                    </td>
                    <td className="p-4 sm:p-5 font-semibold text-slate-900 dark:text-white bg-[#c8e558]/10 dark:bg-[#c8e558]/5 flex items-center gap-2">
                      <CheckCircle2 className="w-4 h-4 text-[#8ba32b] dark:text-[#c8e558] shrink-0" />
                      <span>{row.scholarly}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* ══ CTA Conversion Box ═════════════════════════════════════════════ */}
        <section className="w-full border-t border-slate-200/80 dark:border-white/[0.08] bg-gradient-to-b from-slate-50 via-white to-slate-50 dark:from-[#121215] dark:via-[#0e0e10] dark:to-[#0b0b0c] py-20 sm:py-28 relative overflow-hidden">
          {/* Subtle Ambient Radial Glow */}
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[700px] h-[300px] bg-gradient-to-r from-[#c8e558]/15 via-emerald-500/10 to-transparent blur-[100px] pointer-events-none rounded-full" />

          <div className="max-w-[1160px] mx-auto px-5 sm:px-8 text-center relative z-10">
            <h2 className="text-[26px] sm:text-[34px] lg:text-[38px] font-semibold tracking-[-0.03em] text-slate-900 dark:text-white max-w-[34rem] mx-auto leading-[1.15]">
              {activeRole === 'teacher'
                ? 'Ready to scale your teaching with AI?'
                : 'Ready to experience clarity in your studies?'}
            </h2>
            <p className="text-slate-500 dark:text-gray-400 text-[14.5px] sm:text-[15.5px] max-w-[28rem] mx-auto mt-3 leading-relaxed">
              {activeRole === 'teacher'
                ? 'Create your educator profile in under three minutes and set up your first class.'
                : 'Set up takes less than two minutes. Create your account and begin learning right away.'}
            </p>

            <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-3.5">
              <Link
                to="/signup"
                state={activeRole === 'teacher' ? { role: 'teacher' } : undefined}
                className="w-full sm:w-auto inline-flex items-center justify-center h-12 px-7 rounded-xl bg-slate-900 hover:bg-slate-800 text-white dark:bg-white dark:hover:bg-slate-100 dark:text-slate-900 font-semibold text-[14.5px] active:scale-95 transition-all shadow-md"
              >
                {activeRole === 'teacher' ? 'Create a teacher account' : 'Start learning free'}
                <ArrowRight className="w-4 h-4 ml-2" />
              </Link>
              <Link
                to="/help"
                className="w-full sm:w-auto inline-flex items-center justify-center h-12 px-6 rounded-xl border border-slate-200 dark:border-white/20 bg-white/90 dark:bg-white/[0.04] hover:bg-slate-50 dark:hover:bg-white/10 text-slate-700 dark:text-white font-semibold text-[14px] transition-colors shadow-xs"
              >
                <Bot className="w-4 h-4 mr-2 text-[#8ba32b] dark:text-[#c8e558]" />
                {activeRole === 'teacher' ? 'Ask Educator Support' : 'Ask Scholarly AI Guide'}
              </Link>
            </div>
          </div>
        </section>
      </main>

      <SiteFooter />
    </div>
  );
}
