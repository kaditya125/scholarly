import { motion } from 'motion/react';
import { Play, Clock, Target, Sparkles, ArrowRight, Zap, CheckCircle2 } from 'lucide-react';
import { cn } from '../../lib/utils';
import { useTheme } from '../../lib/ThemeContext';
import { useAuth } from '../../lib/AuthContext';
import { useQuizAttempts } from '../../hooks/api/useQuizAttempts';
import { useLaunchTest } from '../../hooks/ai/useLaunchTest';

interface HeroSectionProps {
  examTarget: string;
}

export function HeroSection({ examTarget }: HeroSectionProps) {
  const { theme } = useTheme();
  const isDarkMode = theme === 'dark';
  const { user } = useAuth();
  const launch = useLaunchTest();
  const { attempts } = useQuizAttempts();

  // Find the latest in-progress attempt if one exists
  const activeAttempt = attempts.find(a => a.status === 'in-progress');

  const displayName = user?.displayName?.split(' ')[0] || user?.email?.split('@')[0] || 'Scholar';
  const targetLabel = examTarget || 'Competitive Exams';

  return (
    <div className={cn(
      "relative overflow-hidden pt-7 pb-12 px-4 sm:px-6 transition-colors duration-300 border-b",
      isDarkMode 
        ? "bg-gradient-to-b from-white/[0.02] via-transparent to-transparent border-white/[0.06]" 
        : "bg-gradient-to-b from-slate-50/90 via-white to-white border-slate-200/80"
    )}>
      {/* Subtle Ambient Brand Glow */}
      <div className="absolute top-0 right-1/4 w-80 h-80 bg-[#c8e558]/5 dark:bg-[#c8e558]/10 blur-3xl rounded-full pointer-events-none" />
      <div className="absolute bottom-0 left-10 w-64 h-64 bg-emerald-500/[0.03] dark:bg-emerald-500/5 blur-3xl rounded-full pointer-events-none" />

      <div className="max-w-[1400px] mx-auto relative z-10">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6 md:gap-8">
          <motion.div 
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35 }}
            className="space-y-2.5 max-w-xl"
          >
            <div className={cn(
              "inline-flex items-center gap-2 px-3 py-1 rounded-full text-[11.5px] font-medium border transition-colors",
              isDarkMode
                ? "bg-white/[0.06] border-white/10 text-slate-200"
                : "bg-white border-slate-200/90 text-slate-700 shadow-2xs"
            )}>
              <Target className="w-3.5 h-3.5 text-[#8ba32b] dark:text-[#c8e558]" />
              Preparing for {targetLabel} 2026
            </div>
            
            <h1 className="text-2xl sm:text-[28px] md:text-[32px] font-semibold tracking-[-0.025em] leading-[1.2] text-slate-900 dark:text-white">
              Welcome Back,{' '}
              <span className="text-[#8ba32b] dark:text-[#c8e558]">
                {displayName}
              </span>
            </h1>
            
            <p className="text-[13.5px] text-slate-500 dark:text-slate-400 leading-relaxed max-w-lg">
              Sharpen your speed and accuracy with AI-generated mock tests calibrated to your syllabus and weak areas.
            </p>
          </motion.div>

          {/* Dynamic Card: In-Progress Attempt OR Quick AI Diagnostic */}
          {activeAttempt ? (
            <motion.div 
              initial={{ opacity: 0, scale: 0.97 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.08, duration: 0.3 }}
              className={cn(
                "w-full md:w-[360px] p-4 sm:p-5 rounded-2xl border transition-all relative overflow-hidden",
                isDarkMode
                  ? "bg-white/[0.03] border-white/10 shadow-xs"
                  : "bg-white border-slate-200/90 shadow-[0_4px_20px_-4px_rgba(0,0,0,0.05)]"
              )}
            >
              <div className="absolute top-0 left-0 w-full h-1 bg-slate-100 dark:bg-white/10">
                <div 
                  className="h-full bg-[#8ba32b] dark:bg-[#c8e558] transition-all duration-700 ease-out" 
                  style={{ width: `${Math.round(((activeAttempt.answeredCount ?? activeAttempt.correctCount ?? 0) / (activeAttempt.totalQuestions || 1)) * 100)}%` }} 
                />
              </div>
              
              <div className="flex justify-between items-start mb-2.5 pt-1">
                <div>
                  <div className="flex items-center gap-1.5 mb-1">
                    <span className="text-[10.5px] font-semibold uppercase tracking-wider text-[#8ba32b] dark:text-[#c8e558]">
                      In-Progress Test
                    </span>
                    <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
                  </div>
                  <h2 className="text-[15px] font-semibold text-slate-900 dark:text-white truncate max-w-[220px]">
                    {activeAttempt.title}
                  </h2>
                </div>
                <div className={cn(
                  "w-9 h-9 rounded-xl flex items-center justify-center text-[12.5px] font-bold border",
                  isDarkMode
                    ? "bg-white/10 border-white/15 text-[#c8e558]"
                    : "bg-slate-100 border-slate-200 text-slate-900"
                )}>
                  {Math.round(((activeAttempt.answeredCount ?? activeAttempt.correctCount ?? 0) / (activeAttempt.totalQuestions || 1)) * 100)}%
                </div>
              </div>

              <div className="flex items-center gap-3 mb-4 text-[11.5px] text-slate-500 dark:text-slate-400 font-medium">
                <span className={cn(
                  "flex items-center gap-1.5 px-2 py-0.5 rounded-md border",
                  isDarkMode ? "bg-black/30 border-white/5" : "bg-slate-50 border-slate-200/70"
                )}>
                  <Clock className="w-3 h-3 text-amber-500" />
                  {activeAttempt.answeredCount ?? activeAttempt.correctCount ?? 0}/{activeAttempt.totalQuestions} Questions
                </span>
                <span className="capitalize">
                  {activeAttempt.mode} Mode
                </span>
              </div>

              <button 
                onClick={() => launch({ resumeAttemptId: activeAttempt.id, mode: activeAttempt.mode })}
                className={cn(
                  "w-full py-2 px-4 rounded-xl text-[12.5px] font-semibold flex items-center justify-center gap-1.5 transition-all cursor-pointer shadow-xs active:scale-[0.98]",
                  isDarkMode
                    ? "bg-[#c8e558] hover:bg-[#bcd94c] text-slate-900"
                    : "bg-slate-900 hover:bg-slate-800 text-white"
                )}
              >
                <Play className="w-3.5 h-3.5 fill-current" /> Resume Test
              </button>
            </motion.div>
          ) : (
            <motion.div 
              initial={{ opacity: 0, scale: 0.97 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.08, duration: 0.3 }}
              className={cn(
                "w-full md:w-[360px] p-4 sm:p-5 rounded-2xl border transition-all relative overflow-hidden flex flex-col justify-between",
                isDarkMode
                  ? "bg-white/[0.03] border-white/10 shadow-xs"
                  : "bg-white border-slate-200/90 shadow-[0_4px_20px_-4px_rgba(0,0,0,0.05)]"
              )}
            >
              <div>
                <div className="flex items-center gap-1.5 mb-1.5">
                  <div className={cn(
                    "w-5 h-5 rounded-md flex items-center justify-center",
                    isDarkMode ? "bg-[#c8e558]/20 text-[#c8e558]" : "bg-slate-100 text-slate-800"
                  )}>
                    <Sparkles className="w-3 h-3" />
                  </div>
                  <span className="text-[10.5px] font-semibold uppercase tracking-wider text-[#8ba32b] dark:text-[#c8e558]">
                    Daily AI Diagnostic
                  </span>
                </div>
                <h2 className="text-[15px] font-semibold text-slate-900 dark:text-white mb-1">
                  10-Question Smart Test
                </h2>
                <p className="text-[12px] text-slate-500 dark:text-slate-400 mb-4 leading-relaxed">
                  Quick diagnostic targeting your high-yield concepts and common exam traps.
                </p>
              </div>

              <button 
                onClick={() => launch({ count: 10, mode: 'exam', topic: examTarget || 'General Aptitude' })}
                className={cn(
                  "w-full py-2 px-4 rounded-xl text-[12.5px] font-semibold flex items-center justify-center gap-1.5 transition-all cursor-pointer shadow-xs active:scale-[0.98]",
                  isDarkMode
                    ? "bg-[#c8e558] hover:bg-[#bcd94c] text-slate-900"
                    : "bg-slate-900 hover:bg-slate-800 text-white"
                )}
              >
                <Zap className="w-3.5 h-3.5 fill-current" /> Start Practice Test
              </button>
            </motion.div>
          )}
        </div>
      </div>
    </div>
  );
}
