import React, { useMemo, useState, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { 
  UploadCloud,
  Film,
  Layers,
  Search,
  Mic,
  ArrowUp,
  MessageSquare,
  BookOpen,
  Headphones,
  Lightbulb,
  FileText,
  FileImage,
  Map,
  Image as ImageIcon,
  CheckSquare,
  FileAudio,
  FolderOpen,
  Plus,
  Paperclip,
  Sparkles,
  Zap,
  Brain,
  ChevronRight,
  BrainCircuit,
  Activity,
  Trophy,
  Flame,
  Clock,
  HelpCircle,
  Radio,
  Target,
  Compass,
  ArrowRight
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { OpenAI, Groq, Nvidia } from '@lobehub/icons';
import { cn } from "../lib/utils";
import { useAuth } from "../lib/AuthContext";
import { useProfile } from "../hooks/api/useProfile";
import { useUserStats } from "../hooks/api/useUserStats";
import { useLaunchTest } from "../hooks/ai/useLaunchTest";
import { useTheme } from "../lib/ThemeContext";
import { api } from "../lib/api/client";
import { useAdaptiveAssessment } from "../hooks/api/useAdaptiveAssessment";
import { OnboardingChecklist } from "../components/dashboard/OnboardingChecklist";
import { LearningVelocityWidget } from "../components/dashboard/LearningVelocityWidget";
import { FocusAreasWidget } from "../components/dashboard/FocusAreasWidget";
import { AiRecommendedDrills } from "../components/dashboard/AiRecommendedDrills";
import { AchievementsMilestones } from "../components/dashboard/AchievementsMilestones";

const GeminiIcon = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 24 24" className={className}>
    <defs>
      <linearGradient id="gemini-grad" x1="15%" y1="15%" x2="85%" y2="85%">
        <stop offset="0%" stopColor="#F95454" />
        <stop offset="50%" stopColor="#4285F4" />
        <stop offset="100%" stopColor="#34A853" />
      </linearGradient>
    </defs>
    <path d="M12 2C12 7.523 16.477 12 22 12C16.477 12 12 16.477 12 22C12 16.477 7.523 12 2 12C7.523 12 12 7.523 12 2Z" fill="url(#gemini-grad)" />
  </svg>
);

const SHORTCUTS = [
  { label: "AI Chat", icon: MessageSquare, path: "/chat" },
  { label: "Study Guide", icon: BookOpen, path: "/chat?type=study-guide" },
  { label: "AI Podcast", icon: Headphones, path: "/podcasts" },
  { label: "Deep Research", icon: Lightbulb, path: "/research" },
  { label: "AI Slides", icon: Layers, path: "/chat?type=slides" },
  { label: "Worksheet", icon: FileText, path: "/chat?type=worksheet" },
  { label: "Mind Map", icon: Map, path: "/chat?type=mindmap" },
  { label: "Flashcards", icon: Layers, path: "/flashcards" },
  { label: "Practice Exam", icon: CheckSquare, path: "/tests" },
  { label: "Meeting Notes", icon: FileAudio, path: "/chat?type=meeting-notes" },
];

const MODELS = [
  { id: 'gemini-2.5-flash', name: 'Gemini 2.5 Flash', icon: GeminiIcon, badge: 'Fastest' },
  { id: 'gemini-2.5-pro', name: 'Gemini 2.5 Pro', icon: GeminiIcon, badge: 'Deep Reasoning' },
  { id: 'llama-3.3-70b-versatile', name: 'Llama 3.3 70B', icon: Groq, badge: 'Groq Speed' },
  { id: 'nvidia/nemotron-4-340b-instruct', name: 'Nemotron 340B', icon: Nvidia.Color, badge: 'NVIDIA' },
  { id: 'openai/gpt-oss-120b', name: 'GPT OSS 120B', icon: OpenAI, badge: 'OpenAI' },
];



function getGreeting(): string {
  const h = new Date().getHours();
  if (h < 12) return 'Good Morning';
  if (h < 17) return 'Good Afternoon';
  return 'Good Evening';
}

export default function StudentDashboard() {
  const { theme } = useTheme();
  const isDarkMode = theme === 'dark';
  const [isModelSelectorOpen, setIsModelSelectorOpen] = useState(false);
  const [selectedModel, setSelectedModel] = useState(MODELS[0]);
  const [prompt, setPrompt] = useState("");
  
  const navigate = useNavigate();
  const { user } = useAuth();
  const { profile } = useProfile();
  const { stats } = useUserStats();
  const launch = useLaunchTest();

  const firstName = useMemo(() => {
    return (user?.displayName || '').trim().split(' ')[0] || 'Scholar';
  }, [user?.displayName]);

  const targetExam = profile?.targetExam || 'Competitive Exams';

  const { digitalTwin } = useAdaptiveAssessment();

  const [recentSessions, setRecentSessions] = useState<any[]>([]);
  useEffect(() => {
    if (!user?.uid) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await api.get(`/chat/sessions?userId=${user.uid}`);
        if (!cancelled) setRecentSessions(Array.isArray(res.data) ? res.data : []);
      } catch {
        if (!cancelled) setRecentSessions([]);
      }
    })();
    return () => { cancelled = true; };
  }, [user?.uid]);

  const latestSession = recentSessions.length > 0 ? recentSessions[0] : null;

  // Real assessment readiness & level
  const realReadiness = digitalTwin?.overallReadinessScore != null
    ? Math.round(digitalTwin.overallReadinessScore)
    : (typeof stats?.examReadiness === 'number' && stats.examReadiness > 0)
    ? Math.round(stats.examReadiness)
    : (typeof stats?.averageAccuracy === 'number' && stats.averageAccuracy > 0)
    ? Math.round(stats.averageAccuracy)
    : null;

  const realPrepLevel = realReadiness != null
    ? (realReadiness >= 75 ? 'Advanced Mastery' : realReadiness >= 45 ? 'Intermediate' : 'Foundation Level')
    : (stats?.totalTestsAttempted && stats.totalTestsAttempted > 0)
    ? `${stats.totalTestsAttempted} Test${stats.totalTestsAttempted > 1 ? 's' : ''} Practiced`
    : null;

  const handleGlobalChatSubmit = () => {
    if (prompt.trim()) {
      navigate(`/chat?prompt=${encodeURIComponent(prompt.trim())}&model=${selectedModel.id}`);
    }
  };

  const handleGlobalChatKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      handleGlobalChatSubmit();
    }
  };

  return (
    <div className={cn(
      "w-full h-full overflow-y-auto custom-scrollbar font-sans transition-colors duration-300",
      isDarkMode ? "bg-[#131315] text-slate-100" : "bg-[#fafbfc] text-slate-900"
    )}>
      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8 space-y-8">

        {/* 1. Header & Welcome Section */}
        <motion.div 
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
          className="space-y-2.5"
        >
          <div className="flex flex-wrap items-center gap-2">
            <div className={cn(
              "inline-flex items-center gap-2 px-3.5 py-1 rounded-full text-[12px] font-medium border transition-colors shadow-2xs",
              isDarkMode
                ? "bg-white/[0.04] border-white/10 text-slate-200"
                : "bg-white border-slate-200/90 text-slate-700"
            )}>
              <span className="w-1.5 h-1.5 rounded-full bg-[#6ca855] dark:bg-[#c8e558] animate-pulse" />
              <span>Preparing for <strong className="font-semibold text-slate-900 dark:text-white">{targetExam} 2026</strong></span>
            </div>
          </div>

          <h1 className="text-[28px] sm:text-[34px] font-semibold tracking-[-0.035em] leading-[1.1] text-slate-900 dark:text-white">
            {getGreeting()},{' '}
            <span className="text-[#6ca855] dark:text-[#c8e558]">
              {firstName}
            </span>
          </h1>

          {/* Sleek Minimalist Briefing Line (100% Real Live Data) */}
          <motion.div
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.05, duration: 0.25 }}
            className="flex flex-wrap items-center gap-x-3 gap-y-1.5 pt-0.5 text-[13.5px] text-slate-500 dark:text-gray-400 font-normal leading-relaxed antialiased"
          >
            {latestSession ? (
              <div className="inline-flex items-center gap-1.5">
                <span>Recently worked on</span>
                <Link
                  to={`/chat?session=${latestSession.sessionId}`}
                  className="font-medium text-slate-900 dark:text-white hover:text-[#6ca855] dark:hover:text-[#c8e558] hover:underline inline-flex items-center gap-1 transition-colors"
                >
                  <span className="truncate max-w-[240px] sm:max-w-[340px]">{latestSession.title || (latestSession.topicType ? `${latestSession.topicType} session` : 'Study Session')}</span>
                  <ArrowRight className="w-3.5 h-3.5 text-[#6ca855] dark:text-[#c8e558] shrink-0 inline" />
                </Link>
              </div>
            ) : (
              <span>Ready for today&rsquo;s <strong className="font-semibold text-slate-800 dark:text-slate-200">{targetExam}</strong> preparation session</span>
            )}

            <span className="text-slate-300 dark:text-gray-700 hidden sm:inline">•</span>

            <div className="inline-flex items-center gap-1.5">
              <span>Preparation:</span>
              {realReadiness != null ? (
                <>
                  <span className="font-medium text-slate-800 dark:text-slate-200">
                    {realPrepLevel || (realReadiness >= 75 ? 'Advanced' : realReadiness >= 45 ? 'Intermediate' : 'Foundation')}
                  </span>
                  <span className="text-slate-400 dark:text-gray-500 font-normal">
                    ({realReadiness}% Readiness)
                  </span>
                </>
              ) : (
                <Link
                  to="/baseline-assessment"
                  className="text-slate-700 dark:text-slate-300 hover:text-[#6ca855] dark:hover:text-[#c8e558] hover:underline inline-flex items-center gap-1"
                >
                  <span>Diagnostic pending</span>
                  <span className="text-[12px] text-[#6ca855] dark:text-[#c8e558] font-semibold">(Take Assessment &rarr;)</span>
                </Link>
              )}
            </div>

            {stats?.gamification?.studyStreakDays && stats.gamification.studyStreakDays > 0 ? (
              <>
                <span className="text-slate-300 dark:text-gray-700 hidden md:inline">•</span>
                <span className="inline-flex items-center gap-1 text-slate-700 dark:text-gray-300 font-medium">
                  🔥 {stats.gamification.studyStreakDays}-day streak
                </span>
              </>
            ) : null}
          </motion.div>
        </motion.div>

        {/* 2. Onboarding Checklist (Hides when 5/5 done) */}
        <OnboardingChecklist />

        {/* 3. Global AI Omnibar (Prompt & Command Input) */}
        <motion.div 
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.05, duration: 0.3 }}
          className="relative z-30"
        >
          <div className={cn(
            "w-full rounded-2xl pl-4 pr-2 py-2 flex items-center gap-3 border transition-all duration-200 shadow-2xs",
            isDarkMode 
              ? "bg-[#161619] border-white/[0.08] focus-within:border-[#c8e558]/40 focus-within:ring-2 focus-within:ring-[#c8e558]/10" 
              : "bg-white border-slate-200/90 focus-within:border-[#6ca855]/50 focus-within:ring-2 focus-within:ring-[#6ca855]/10"
          )}>
            <Sparkles className="w-4 h-4 text-[#6ca855] dark:text-[#c8e558] shrink-0" />
            
            <input 
              type="text" 
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              onKeyDown={handleGlobalChatKeyDown}
              placeholder="Ask Sadhya AI: Solve homework, generate notes, explain concepts, build practice tests..." 
              className={cn(
                "flex-1 bg-transparent border-none outline-none text-[13.5px] font-normal h-9 px-1 min-w-0 tracking-tight",
                isDarkMode ? "text-white placeholder:text-gray-500" : "text-slate-900 placeholder:text-slate-400"
              )}
            />

            <div className="flex items-center gap-2 shrink-0 relative">
              {/* Model Selector Pill */}
              <div className="relative">
                <button 
                  type="button"
                  onClick={() => setIsModelSelectorOpen(!isModelSelectorOpen)}
                  className={cn(
                    "flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[12px] font-medium border transition-colors cursor-pointer",
                    isDarkMode 
                      ? "bg-white/[0.04] hover:bg-white/[0.08] border-white/10 text-slate-200" 
                      : "bg-slate-50 hover:bg-slate-100 border-slate-200/80 text-slate-700"
                  )}
                >
                  <selectedModel.icon className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">{selectedModel.name}</span>
                </button>

                {/* Model Selector Dropdown */}
                <AnimatePresence>
                  {isModelSelectorOpen && (
                    <>
                      <div className="fixed inset-0 z-40" onClick={() => setIsModelSelectorOpen(false)} />
                      <motion.div 
                        initial={{ opacity: 0, y: 8, scale: 0.96 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: 8, scale: 0.96 }}
                        transition={{ duration: 0.15 }}
                        className={cn(
                          "absolute top-full right-0 mt-2 z-50 w-64 rounded-2xl border shadow-xl overflow-hidden py-1.5 backdrop-blur-xl",
                          isDarkMode 
                            ? "bg-[#1f1f24] border-white/10 shadow-black/60" 
                            : "bg-white border-slate-200/90 shadow-slate-200/50"
                        )}
                      >
                        <div className="px-3 py-1">
                          <h4 className="text-[10.5px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 mb-1">
                            Select AI Engine
                          </h4>
                          <div className="space-y-0.5">
                            {MODELS.map((model) => (
                              <button 
                                key={model.id}
                                onClick={() => { setSelectedModel(model); setIsModelSelectorOpen(false); }}
                                className={cn(
                                  "w-full flex items-center justify-between px-2.5 py-2 rounded-xl text-left transition-colors cursor-pointer text-[12px]",
                                  selectedModel.id === model.id 
                                    ? (isDarkMode ? "bg-white/10 text-[#c8e558] font-semibold" : "bg-slate-100 text-slate-900 font-semibold")
                                    : "hover:bg-slate-50 dark:hover:bg-white/5 text-slate-700 dark:text-slate-300"
                                )}
                              >
                                <div className="flex items-center gap-2">
                                  <model.icon className="w-3.5 h-3.5" />
                                  <span>{model.name}</span>
                                </div>
                                <span className="text-[10px] opacity-60">{model.badge}</span>
                              </button>
                            ))}
                          </div>
                        </div>
                      </motion.div>
                    </>
                  )}
                </AnimatePresence>
              </div>

              {/* Submit CTA */}
              <button 
                onClick={handleGlobalChatSubmit} 
                className={cn(
                  "w-9 h-9 rounded-xl flex items-center justify-center transition-all cursor-pointer shadow-xs active:scale-95",
                  isDarkMode 
                    ? "bg-[#c8e558] hover:bg-[#bcd94c] text-slate-900" 
                    : "bg-slate-900 hover:bg-slate-800 text-white"
                )}
                aria-label="Send prompt"
              >
                <ArrowUp className="w-4 h-4" />
              </button>
            </div>
          </div>
        </motion.div>

        {/* 4. Quick Launch Cards (4 Grid) */}
        <motion.div 
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1, duration: 0.3 }}
          className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5"
        >
          <div 
            onClick={() => navigate('/notebooks')} 
            className={cn(
              "p-5 rounded-2xl border transition-all cursor-pointer group flex flex-col justify-between shadow-2xs",
              isDarkMode 
                ? "bg-[#161619] border-white/[0.08] hover:border-white/20 hover:bg-white/[0.03]" 
                : "bg-white border-slate-200/90 hover:border-slate-300 hover:shadow-xs"
            )}
          >
            <div className="flex items-center justify-between mb-4">
              <div className="w-10 h-10 rounded-xl bg-slate-100 dark:bg-white/[0.06] border border-slate-200/80 dark:border-white/10 flex items-center justify-center text-slate-700 dark:text-slate-300 group-hover:text-[#6ca855] dark:group-hover:text-[#c8e558] group-hover:border-[#6ca855]/30 dark:group-hover:border-[#c8e558]/30 transition-colors">
                <UploadCloud className="w-4.5 h-4.5" />
              </div>
              <ChevronRight className="w-4 h-4 text-slate-400 opacity-0 group-hover:opacity-100 group-hover:translate-x-0.5 transition-all" />
            </div>
            <div>
              <h3 className="font-semibold text-[14px] text-slate-900 dark:text-white tracking-tight">Upload &amp; Analyze</h3>
              <p className="text-[12.5px] text-slate-500 dark:text-gray-400 mt-1 leading-relaxed">PDF, notes, syllabus &amp; web</p>
            </div>
          </div>

          <div 
            onClick={() => navigate('/podcasts')} 
            className={cn(
              "p-5 rounded-2xl border transition-all cursor-pointer group flex flex-col justify-between shadow-2xs",
              isDarkMode 
                ? "bg-[#161619] border-white/[0.08] hover:border-white/20 hover:bg-white/[0.03]" 
                : "bg-white border-slate-200/90 hover:border-slate-300 hover:shadow-xs"
            )}
          >
            <div className="flex items-center justify-between mb-4">
              <div className="w-10 h-10 rounded-xl bg-slate-100 dark:bg-white/[0.06] border border-slate-200/80 dark:border-white/10 flex items-center justify-center text-slate-700 dark:text-slate-300 group-hover:text-[#6ca855] dark:group-hover:text-[#c8e558] group-hover:border-[#6ca855]/30 dark:group-hover:border-[#c8e558]/30 transition-colors">
                <Headphones className="w-4.5 h-4.5" />
              </div>
              <ChevronRight className="w-4 h-4 text-slate-400 opacity-0 group-hover:opacity-100 group-hover:translate-x-0.5 transition-all" />
            </div>
            <div>
              <h3 className="font-semibold text-[14px] text-slate-900 dark:text-white tracking-tight">AI Podcasts</h3>
              <p className="text-[12.5px] text-slate-500 dark:text-gray-400 mt-1 leading-relaxed">Audio overview &amp; discussions</p>
            </div>
          </div>

          <div 
            onClick={() => navigate('/tests')} 
            className={cn(
              "p-5 rounded-2xl border transition-all cursor-pointer group flex flex-col justify-between shadow-2xs",
              isDarkMode 
                ? "bg-[#161619] border-white/[0.08] hover:border-white/20 hover:bg-white/[0.03]" 
                : "bg-white border-slate-200/90 hover:border-slate-300 hover:shadow-xs"
            )}
          >
            <div className="flex items-center justify-between mb-4">
              <div className="w-10 h-10 rounded-xl bg-slate-100 dark:bg-white/[0.06] border border-slate-200/80 dark:border-white/10 flex items-center justify-center text-slate-700 dark:text-slate-300 group-hover:text-[#6ca855] dark:group-hover:text-[#c8e558] group-hover:border-[#6ca855]/30 dark:group-hover:border-[#c8e558]/30 transition-colors">
                <Zap className="w-4.5 h-4.5" />
              </div>
              <ChevronRight className="w-4 h-4 text-slate-400 opacity-0 group-hover:opacity-100 group-hover:translate-x-0.5 transition-all" />
            </div>
            <div>
              <h3 className="font-semibold text-[14px] text-slate-900 dark:text-white tracking-tight">Adaptive Tests</h3>
              <p className="text-[12.5px] text-slate-500 dark:text-gray-400 mt-1 leading-relaxed">Mock papers &amp; AI diagnostics</p>
            </div>
          </div>

          <div 
            onClick={() => navigate('/my-classes')} 
            className={cn(
              "p-5 rounded-2xl border transition-all cursor-pointer group flex flex-col justify-between shadow-2xs",
              isDarkMode 
                ? "bg-[#161619] border-white/[0.08] hover:border-white/20 hover:bg-white/[0.03]" 
                : "bg-white border-slate-200/90 hover:border-slate-300 hover:shadow-xs"
            )}
          >
            <div className="flex items-center justify-between mb-4">
              <div className="w-10 h-10 rounded-xl bg-slate-100 dark:bg-white/[0.06] border border-slate-200/80 dark:border-white/10 flex items-center justify-center text-slate-700 dark:text-slate-300 group-hover:text-[#6ca855] dark:group-hover:text-[#c8e558] group-hover:border-[#6ca855]/30 dark:group-hover:border-[#c8e558]/30 transition-colors">
                <Radio className="w-4.5 h-4.5" />
              </div>
              <ChevronRight className="w-4 h-4 text-slate-400 opacity-0 group-hover:opacity-100 group-hover:translate-x-0.5 transition-all" />
            </div>
            <div>
              <h3 className="font-semibold text-[14px] text-slate-900 dark:text-white tracking-tight">Live Classes</h3>
              <p className="text-[12.5px] text-slate-500 dark:text-gray-400 mt-1 leading-relaxed">Interactive &amp; recordings</p>
            </div>
          </div>
        </motion.div>

        {/* 5. Study Tools & Content Shortcuts */}
        <motion.div 
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15, duration: 0.3 }}
          className="space-y-3.5"
        >
          <div className="flex items-center justify-between">
            <h2 className="text-[14px] font-semibold text-slate-900 dark:text-white tracking-tight flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-[#6ca855] dark:text-[#c8e558]" />
              Study Tools &amp; Actions
            </h2>
          </div>

          <div className="flex flex-wrap gap-2">
            {SHORTCUTS.map((shortcut, idx) => (
              <button 
                key={idx} 
                onClick={() => navigate(shortcut.path)}
                className={cn(
                  "flex items-center gap-2 px-3.5 py-2 rounded-xl border text-[12.5px] font-medium transition-all cursor-pointer shadow-2xs group",
                  isDarkMode 
                    ? "bg-[#161619] border-white/[0.08] text-slate-300 hover:bg-white/[0.05] hover:text-white hover:border-white/20" 
                    : "bg-white border-slate-200/90 text-slate-700 hover:bg-slate-50 hover:text-slate-900 hover:border-slate-300"
                )}
              >
                <shortcut.icon className="w-4 h-4 text-slate-400 dark:text-gray-500 group-hover:text-[#6ca855] dark:group-hover:text-[#c8e558] transition-colors" />
                <span>{shortcut.label}</span>
              </button>
            ))}
          </div>
        </motion.div>

        {/* 6. Activity & Learning Velocity Widget (Interactive Month Calendar) */}
        <motion.div 
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2, duration: 0.3 }}
        >
          <LearningVelocityWidget />
        </motion.div>

        {/* 6b. Focus Areas — evidence-graded from MasteryEngine + quiz history, distinct from the
             heuristic recommendations below: nothing here appears without enough graded evidence. */}
        <FocusAreasWidget />

        {/* 7. AI-Recommended Tests (Dynamic & Adaptive to Student Course & Subjects) */}
        <motion.div 
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.25, duration: 0.3 }}
        >
          <AiRecommendedDrills />
        </motion.div>

        {/* 8. Recent Achievements & Milestones (Live Telemetry & Activity Tracking) */}
        <motion.div 
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3, duration: 0.3 }}
        >
          <AchievementsMilestones />
        </motion.div>

      </div>
    </div>
  );
}
