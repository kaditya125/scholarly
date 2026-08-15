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
          className="space-y-2"
        >
          <div className="flex flex-wrap items-center gap-2">
            <div className={cn(
              "inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11.5px] font-medium border transition-colors",
              isDarkMode
                ? "bg-white/[0.06] border-white/10 text-slate-200"
                : "bg-white border-slate-200/90 text-slate-700 shadow-2xs"
            )}>
              <Target className="w-3.5 h-3.5 text-[#8ba32b] dark:text-[#c8e558]" />
              Preparing for {targetExam} 2026
            </div>
          </div>

          <h1 className="text-2xl sm:text-[28px] md:text-[32px] font-semibold tracking-[-0.025em] text-slate-900 dark:text-white">
            {getGreeting()},{' '}
            <span className="text-[#8ba32b] dark:text-[#c8e558]">
              {firstName}
            </span>
          </h1>

          {/* Sleek Minimalist Briefing Line (100% Real Live Data) */}
          <motion.div
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.05, duration: 0.25 }}
            className="flex flex-wrap items-center gap-x-3 gap-y-1.5 pt-0.5 text-[13px] text-slate-500 dark:text-gray-400 font-normal antialiased"
          >
            {latestSession ? (
              <div className="inline-flex items-center gap-1.5">
                <span>Recently worked on</span>
                <Link
                  to={`/chat?session=${latestSession.sessionId}`}
                  className="font-medium text-slate-800 dark:text-slate-200 hover:text-slate-900 dark:hover:text-[#c8e558] hover:underline inline-flex items-center gap-1 transition-colors"
                >
                  <span className="truncate max-w-[240px] sm:max-w-[340px]">{latestSession.title || (latestSession.topicType ? `${latestSession.topicType} session` : 'Study Session')}</span>
                  <ArrowRight className="w-3 h-3 text-[#8ba32b] dark:text-[#c8e558] shrink-0 inline" />
                </Link>
              </div>
            ) : (
              <span>Ready for today's {targetExam} preparation session</span>
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
                  className="text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-[#c8e558] hover:underline inline-flex items-center gap-1"
                >
                  <span>Diagnostic pending</span>
                  <span className="text-[11px] text-[#8ba32b] dark:text-[#c8e558] font-medium">(Take Assessment →)</span>
                </Link>
              )}
            </div>

            {stats?.gamification?.studyStreakDays && stats.gamification.studyStreakDays > 0 ? (
              <>
                <span className="text-slate-300 dark:text-gray-700 hidden md:inline">•</span>
                <span className="inline-flex items-center gap-1 text-slate-600 dark:text-gray-300 font-medium">
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
            "w-full rounded-full pl-4 pr-1.5 py-1.5 flex items-center gap-2.5 border transition-all duration-200",
            isDarkMode 
              ? "bg-[#1a1a1e]/95 border-white/[0.08] shadow-[0_4px_24px_-4px_rgba(0,0,0,0.25)] focus-within:border-white/20 focus-within:ring-2 focus-within:ring-[#c8e558]/10" 
              : "bg-white border-slate-200/90 shadow-[0_4px_20px_-4px_rgba(0,0,0,0.06)] focus-within:border-slate-400 focus-within:ring-2 focus-within:ring-slate-900/5"
          )}>
            <Sparkles className="w-4 h-4 text-[#8ba32b] dark:text-[#c8e558] shrink-0" />
            
            <input 
              type="text" 
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              onKeyDown={handleGlobalChatKeyDown}
              placeholder="Ask Scholarly AI: Solve homework, generate notes, explain concepts, build practice tests..." 
              className={cn(
                "flex-1 bg-transparent border-none outline-none text-[12.5px] font-normal h-8.5 px-1 min-w-0",
                isDarkMode ? "text-white placeholder:text-slate-500" : "text-slate-900 placeholder:text-slate-400"
              )}
            />

            <div className="flex items-center gap-1.5 shrink-0 relative">
              {/* Model Selector Pill */}
              <div className="relative">
                <button 
                  type="button"
                  onClick={() => setIsModelSelectorOpen(!isModelSelectorOpen)}
                  className={cn(
                    "flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium border transition-colors cursor-pointer",
                    isDarkMode 
                      ? "bg-white/5 hover:bg-white/10 border-white/10 text-slate-200" 
                      : "bg-slate-100 hover:bg-slate-200/70 border-slate-200/80 text-slate-700"
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
                  "w-8 h-8 rounded-full flex items-center justify-center transition-all cursor-pointer shadow-xs active:scale-95",
                  isDarkMode 
                    ? "bg-[#c8e558] hover:bg-[#bcd94c] text-slate-900" 
                    : "bg-slate-900 hover:bg-slate-800 text-white"
                )}
                aria-label="Send prompt"
              >
                <ArrowUp className="w-3.5 h-3.5" />
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
              "p-4 rounded-2xl border transition-all cursor-pointer group flex flex-col justify-between shadow-2xs",
              isDarkMode 
                ? "bg-[#1a1a1e] border-white/[0.08] hover:border-white/20 hover:bg-[#202025]" 
                : "bg-white border-slate-200/90 hover:border-slate-300 hover:shadow-xs"
            )}
          >
            <div className="flex items-center justify-between mb-3">
              <div className="w-9 h-9 rounded-xl bg-slate-100 dark:bg-white/[0.06] border border-slate-200/80 dark:border-white/10 flex items-center justify-center text-slate-700 dark:text-slate-300 group-hover:text-slate-900 dark:group-hover:text-[#c8e558] group-hover:border-[#c8e558]/30 transition-colors">
                <UploadCloud className="w-4 h-4" />
              </div>
              <ChevronRight className="w-3.5 h-3.5 text-slate-400 opacity-0 group-hover:opacity-100 transition-opacity" />
            </div>
            <div>
              <h3 className="font-semibold text-[13.5px] text-slate-900 dark:text-white">Upload & Analyze</h3>
              <p className="text-[11.5px] text-slate-500 dark:text-slate-400 mt-0.5">PDF, notes, syllabus &amp; web</p>
            </div>
          </div>

          <div 
            onClick={() => navigate('/podcasts')} 
            className={cn(
              "p-4 rounded-2xl border transition-all cursor-pointer group flex flex-col justify-between shadow-2xs",
              isDarkMode 
                ? "bg-[#1a1a1e] border-white/[0.08] hover:border-white/20 hover:bg-[#202025]" 
                : "bg-white border-slate-200/90 hover:border-slate-300 hover:shadow-xs"
            )}
          >
            <div className="flex items-center justify-between mb-3">
              <div className="w-9 h-9 rounded-xl bg-slate-100 dark:bg-white/[0.06] border border-slate-200/80 dark:border-white/10 flex items-center justify-center text-slate-700 dark:text-slate-300 group-hover:text-slate-900 dark:group-hover:text-[#c8e558] group-hover:border-[#c8e558]/30 transition-colors">
                <Headphones className="w-4 h-4" />
              </div>
              <ChevronRight className="w-3.5 h-3.5 text-slate-400 opacity-0 group-hover:opacity-100 transition-opacity" />
            </div>
            <div>
              <h3 className="font-semibold text-[13.5px] text-slate-900 dark:text-white">AI Podcasts</h3>
              <p className="text-[11.5px] text-slate-500 dark:text-slate-400 mt-0.5">Audio overview &amp; discussions</p>
            </div>
          </div>

          <div 
            onClick={() => navigate('/tests')} 
            className={cn(
              "p-4 rounded-2xl border transition-all cursor-pointer group flex flex-col justify-between shadow-2xs",
              isDarkMode 
                ? "bg-[#1a1a1e] border-white/[0.08] hover:border-white/20 hover:bg-[#202025]" 
                : "bg-white border-slate-200/90 hover:border-slate-300 hover:shadow-xs"
            )}
          >
            <div className="flex items-center justify-between mb-3">
              <div className="w-9 h-9 rounded-xl bg-slate-100 dark:bg-white/[0.06] border border-slate-200/80 dark:border-white/10 flex items-center justify-center text-slate-700 dark:text-slate-300 group-hover:text-slate-900 dark:group-hover:text-[#c8e558] group-hover:border-[#c8e558]/30 transition-colors">
                <Zap className="w-4 h-4" />
              </div>
              <ChevronRight className="w-3.5 h-3.5 text-slate-400 opacity-0 group-hover:opacity-100 transition-opacity" />
            </div>
            <div>
              <h3 className="font-semibold text-[13.5px] text-slate-900 dark:text-white">Adaptive Tests</h3>
              <p className="text-[11.5px] text-slate-500 dark:text-slate-400 mt-0.5">Mock papers &amp; AI diagnostics</p>
            </div>
          </div>

          <div 
            onClick={() => navigate('/my-classes')} 
            className={cn(
              "p-4 rounded-2xl border transition-all cursor-pointer group flex flex-col justify-between shadow-2xs",
              isDarkMode 
                ? "bg-[#1a1a1e] border-white/[0.08] hover:border-white/20 hover:bg-[#202025]" 
                : "bg-white border-slate-200/90 hover:border-slate-300 hover:shadow-xs"
            )}
          >
            <div className="flex items-center justify-between mb-3">
              <div className="w-9 h-9 rounded-xl bg-slate-100 dark:bg-white/[0.06] border border-slate-200/80 dark:border-white/10 flex items-center justify-center text-slate-700 dark:text-slate-300 group-hover:text-slate-900 dark:group-hover:text-[#c8e558] group-hover:border-[#c8e558]/30 transition-colors">
                <Radio className="w-4 h-4" />
              </div>
              <ChevronRight className="w-3.5 h-3.5 text-slate-400 opacity-0 group-hover:opacity-100 transition-opacity" />
            </div>
            <div>
              <h3 className="font-semibold text-[13.5px] text-slate-900 dark:text-white">Live Classes</h3>
              <p className="text-[11.5px] text-slate-500 dark:text-slate-400 mt-0.5">Interactive &amp; recordings</p>
            </div>
          </div>
        </motion.div>

        {/* 5. Study Tools & Content Shortcuts */}
        <motion.div 
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15, duration: 0.3 }}
          className="space-y-3"
        >
          <div className="flex items-center justify-between">
            <h2 className="text-[13px] font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-[#8ba32b] dark:text-[#c8e558]" />
              Study Tools &amp; Actions
            </h2>
          </div>

          <div className="flex flex-wrap gap-2">
            {SHORTCUTS.map((shortcut, idx) => (
              <button 
                key={idx} 
                onClick={() => navigate(shortcut.path)}
                className={cn(
                  "flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-[12px] font-medium transition-all cursor-pointer shadow-2xs",
                  isDarkMode 
                    ? "bg-[#1a1a1e] border-white/[0.08] text-slate-300 hover:bg-[#232328] hover:text-white hover:border-white/20" 
                    : "bg-white border-slate-200/80 text-slate-700 hover:bg-slate-50 hover:text-slate-900 hover:border-slate-300"
                )}
              >
                <shortcut.icon className="w-3.5 h-3.5 text-slate-500 dark:text-slate-400" />
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

        {/* 7. AI-Recommended Tests (Direct Launch) */}
        <motion.div 
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.25, duration: 0.3 }}
          className="space-y-3"
        >
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-[13px] font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                <Brain className="w-3.5 h-3.5 text-[#8ba32b] dark:text-[#c8e558]" />
                AI-Recommended Weak Area Drills
              </h2>
            </div>
            <button 
              onClick={() => navigate('/tests')}
              className="text-[11.5px] font-semibold text-[#8ba32b] dark:text-[#c8e558] hover:underline cursor-pointer flex items-center gap-0.5"
            >
              All Tests <ChevronRight className="w-3 h-3" />
            </button>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
            <div className={cn(
              "p-4 rounded-2xl border transition-all flex flex-col justify-between shadow-2xs",
              isDarkMode ? "bg-[#1a1a1e] border-white/[0.08]" : "bg-white border-slate-200/90"
            )}>
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <h3 className="text-[13.5px] font-semibold text-slate-900 dark:text-white">Modern Indian History - 1857 Revolt</h3>
                  <span className="text-[10px] font-semibold px-2 py-0.5 bg-amber-500/10 text-amber-600 dark:text-amber-400 rounded-full border border-amber-500/20">
                    High Yield
                  </span>
                </div>
                <p className="text-[11.5px] text-slate-500 dark:text-slate-400 mb-3">
                  Calibrated to address your recent 45% accuracy in freedom movement questions.
                </p>
                <div className="flex items-center gap-3 text-[11px] text-slate-500 dark:text-slate-400 mb-4">
                  <span className="flex items-center gap-1"><Clock className="w-3 h-3 text-amber-500" /> 15 Mins</span>
                  <span className="flex items-center gap-1"><HelpCircle className="w-3 h-3 text-emerald-500" /> 10 Questions</span>
                </div>
              </div>
              
              <button 
                onClick={() => launch({ topic: 'Modern Indian History - 1857 Revolt', count: 10, mode: 'exam' })}
                className={cn(
                  "w-full py-2 rounded-xl text-[12px] font-semibold flex items-center justify-center gap-1.5 transition-all cursor-pointer shadow-xs active:scale-98",
                  isDarkMode 
                    ? "bg-[#c8e558] hover:bg-[#bcd94c] text-slate-900" 
                    : "bg-slate-900 hover:bg-slate-800 text-white"
                )}
              >
                <Zap className="w-3.5 h-3.5 fill-current" /> Start Practice Drill
              </button>
            </div>

            <div className={cn(
              "p-4 rounded-2xl border transition-all flex flex-col justify-between shadow-2xs",
              isDarkMode ? "bg-[#1a1a1e] border-white/[0.08]" : "bg-white border-slate-200/90"
            )}>
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <h3 className="text-[13.5px] font-semibold text-slate-900 dark:text-white">Quantitative Aptitude - Linear Equations</h3>
                  <span className="text-[10px] font-semibold px-2 py-0.5 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 rounded-full border border-emerald-500/20">
                    Speed Booster
                  </span>
                </div>
                <p className="text-[11.5px] text-slate-500 dark:text-slate-400 mb-3">
                  Reinforce elimination shortcuts and algebraic substitution speed.
                </p>
                <div className="flex items-center gap-3 text-[11px] text-slate-500 dark:text-slate-400 mb-4">
                  <span className="flex items-center gap-1"><Clock className="w-3 h-3 text-amber-500" /> 15 Mins</span>
                  <span className="flex items-center gap-1"><HelpCircle className="w-3 h-3 text-emerald-500" /> 10 Questions</span>
                </div>
              </div>
              
              <button 
                onClick={() => launch({ topic: 'Quantitative Aptitude - Linear Equations', count: 10, mode: 'exam' })}
                className={cn(
                  "w-full py-2 rounded-xl text-[12px] font-semibold flex items-center justify-center gap-1.5 transition-all cursor-pointer shadow-xs active:scale-98",
                  isDarkMode 
                    ? "bg-[#c8e558] hover:bg-[#bcd94c] text-slate-900" 
                    : "bg-slate-900 hover:bg-slate-800 text-white"
                )}
              >
                <Zap className="w-3.5 h-3.5 fill-current" /> Start Practice Drill
              </button>
            </div>
          </div>
        </motion.div>

        {/* 8. Recent Achievements */}
        <motion.div 
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3, duration: 0.3 }}
          className="space-y-3"
        >
          <div className="flex items-center justify-between">
            <h2 className="text-[13px] font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
              <Trophy className="w-3.5 h-3.5 text-amber-500" />
              Achievements &amp; Milestones
            </h2>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5">
            <div className={cn(
              "p-4 rounded-2xl border transition-all flex items-start gap-3 shadow-2xs",
              isDarkMode ? "bg-[#1a1a1e] border-white/[0.08]" : "bg-white border-slate-200/90"
            )}>
              <div className="w-10 h-10 rounded-xl bg-amber-500/10 text-amber-500 flex items-center justify-center shrink-0 border border-amber-500/20">
                <Trophy className="w-5 h-5" />
              </div>
              <div className="flex-1">
                <h4 className="text-[13px] font-semibold text-slate-900 dark:text-white">Top Accuracy</h4>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">Scored 90%+ in 5 consecutive tests.</p>
                <div className="mt-2.5 flex items-center gap-2">
                  <div className="flex-1 h-1.5 bg-slate-100 dark:bg-white/5 rounded-full overflow-hidden">
                    <div className="h-full bg-amber-500 rounded-full" style={{ width: '100%' }} />
                  </div>
                  <span className="text-[9.5px] font-bold text-amber-500">Unlocked!</span>
                </div>
              </div>
            </div>

            <div className={cn(
              "p-4 rounded-2xl border transition-all flex items-start gap-3 shadow-2xs",
              isDarkMode ? "bg-[#1a1a1e] border-white/[0.08]" : "bg-white border-slate-200/90"
            )}>
              <div className="w-10 h-10 rounded-xl bg-[#8ba32b]/10 dark:bg-[#c8e558]/10 text-[#8ba32b] dark:text-[#c8e558] flex items-center justify-center shrink-0 border border-[#8ba32b]/20 dark:border-[#c8e558]/20">
                <Flame className="w-5 h-5" />
              </div>
              <div className="flex-1">
                <h4 className="text-[13px] font-semibold text-slate-900 dark:text-white">7-Day Streak</h4>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">Logged in and solved quizzes 7 days straight.</p>
                <div className="mt-2.5 flex items-center gap-2">
                  <div className="flex-1 h-1.5 bg-slate-100 dark:bg-white/5 rounded-full overflow-hidden">
                    <div className="h-full bg-[#8ba32b] dark:bg-[#c8e558] rounded-full" style={{ width: '100%' }} />
                  </div>
                  <span className="text-[9.5px] font-bold text-[#8ba32b] dark:text-[#c8e558]">Unlocked!</span>
                </div>
              </div>
            </div>

            <div className={cn(
              "p-4 rounded-2xl border transition-all flex items-start gap-3 shadow-2xs",
              isDarkMode ? "bg-[#1a1a1e] border-white/[0.08]" : "bg-white border-slate-200/90"
            )}>
              <div className="w-10 h-10 rounded-xl bg-slate-100 dark:bg-white/5 text-slate-400 flex items-center justify-center shrink-0 border border-slate-200/80 dark:border-white/10">
                <Zap className="w-5 h-5" />
              </div>
              <div className="flex-1">
                <h4 className="text-[13px] font-semibold text-slate-900 dark:text-white">Speedy Solver</h4>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">Complete a test in under 60% of allotted time.</p>
                <div className="mt-2.5 flex items-center gap-2">
                  <div className="flex-1 h-1.5 bg-slate-100 dark:bg-white/5 rounded-full overflow-hidden">
                    <div className="h-full bg-slate-400 dark:bg-slate-500 rounded-full" style={{ width: '40%' }} />
                  </div>
                  <span className="text-[9.5px] font-medium text-slate-400">2/5 Tests</span>
                </div>
              </div>
            </div>
          </div>
        </motion.div>

      </div>
    </div>
  );
}
