import { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Sparkles, Loader2, Crosshair, BookOpen, GraduationCap, Timer } from 'lucide-react';
import { cn } from '../../lib/utils';
import { useTheme } from '../../lib/ThemeContext';
import { useLaunchTest } from '../../hooks/ai/useLaunchTest';
import type { QuizMode } from '../../lib/api/quiz';

const COUNTS = [5, 10, 15, 20];

export function AdaptiveTestGenerator() {
  const { theme } = useTheme();
  const isDarkMode = theme === 'dark';
  const launch = useLaunchTest();
  
  const [isGenerating, setIsGenerating] = useState(false);
  const [subject, setSubject] = useState('Mathematics');
  const [customTopic, setCustomTopic] = useState('');
  const [difficulty, setDifficulty] = useState('Medium');
  const [count, setCount] = useState(10);
  const [mode, setMode] = useState<QuizMode>('exam');

  const handleGenerate = async () => {
    setIsGenerating(true);
    const targetTopic = customTopic.trim() ? `${subject} - ${customTopic.trim()}` : subject;
    try {
      await launch({
        topic: targetTopic,
        count,
        mode,
      });
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div className={cn(
      "p-6 rounded-2xl border relative overflow-hidden transition-all font-sans",
      isDarkMode ? "bg-white/[0.04] border-white/[0.07] shadow-xs" : "bg-white border-slate-200/90 shadow-xs"
    )}>
      {/* Subtle Ambient Brand Glow */}
      <div className="absolute -top-24 -right-24 w-48 h-48 bg-[#c8e558]/10 blur-3xl rounded-full pointer-events-none" />
      
      <div className="relative z-10">
        <div className="flex items-center gap-2 mb-1.5">
          <div className="w-7 h-7 rounded-lg bg-slate-900 dark:bg-white flex items-center justify-center text-[#c8e558] dark:text-slate-900 shadow-2xs">
            <Sparkles className="w-4 h-4" />
          </div>
          <h3 className="text-[17px] font-semibold text-slate-900 dark:text-white">AI Adaptive Test</h3>
        </div>
        <p className="text-[13px] text-slate-500 dark:text-slate-400 mb-5 leading-relaxed">
          Generate an intelligent, Gemini-calibrated practice test customized to your focus and difficulty.
        </p>

        <div className="space-y-4 mb-5">
          <div>
            <label className="block text-[11px] font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500 mb-1.5">
              Subject Focus
            </label>
            <select 
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              className={cn(
                "w-full p-2 rounded-xl border text-[12.5px] font-medium outline-none transition-colors",
                isDarkMode 
                  ? "bg-white/[0.04] border-white/10 text-slate-200 focus:border-[#c8e558]" 
                  : "bg-slate-50 border-slate-200 text-slate-900 focus:border-slate-400"
              )}
            >
              <option value="Mathematics" className="dark:bg-[#1a1a1b]">Mathematics & Quantitative</option>
              <option value="General Studies" className="dark:bg-[#1a1a1b]">General Studies & Current Affairs</option>
              <option value="English Comprehension" className="dark:bg-[#1a1a1b]">English Comprehension & Verbal</option>
              <option value="Reasoning & Logic" className="dark:bg-[#1a1a1b]">Reasoning & Logical Ability</option>
              <option value="Science & Tech" className="dark:bg-[#1a1a1b]">Science & Technology</option>
            </select>
          </div>

          <div>
            <label className="block text-[11px] font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500 mb-1.5">
              Topic / Chapter (Optional)
            </label>
            <input
              type="text"
              value={customTopic}
              onChange={(e) => setCustomTopic(e.target.value)}
              placeholder="e.g. Percentage, Optics, Indian Constitution..."
              className={cn(
                "w-full p-2 rounded-xl border text-[12.5px] font-medium outline-none transition-colors",
                isDarkMode 
                  ? "bg-white/[0.04] border-white/10 text-slate-200 placeholder:text-slate-500 focus:border-[#c8e558]" 
                  : "bg-slate-50 border-slate-200 text-slate-900 placeholder:text-slate-400 focus:border-slate-400"
              )}
            />
          </div>

          <div>
            <label className="block text-[11px] font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500 mb-1.5">
              Questions
            </label>
            <div className="flex gap-2">
              {COUNTS.map(c => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setCount(c)}
                  className={cn(
                    "flex-1 py-1.5 text-[12.5px] font-semibold rounded-lg border transition-all cursor-pointer",
                    count === c 
                      ? "bg-slate-900 text-white dark:bg-[#c8e558] dark:text-slate-900 border-transparent shadow-2xs" 
                      : (isDarkMode ? "bg-white/[0.03] border-white/10 text-slate-400 hover:bg-white/[0.08]" : "bg-white border-slate-200 text-slate-600 hover:bg-slate-50")
                  )}
                >
                  {c}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-[11px] font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500 mb-1.5">
              Mode
            </label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setMode('exam')}
                className={cn(
                  "flex items-center gap-2 p-2.5 rounded-xl border text-left transition-all cursor-pointer",
                  mode === 'exam'
                    ? "bg-slate-100 dark:bg-white/[0.08] border-slate-300 dark:border-white/20 text-slate-900 dark:text-white"
                    : "bg-white dark:bg-white/[0.02] border-slate-200/80 dark:border-white/10 text-slate-500 dark:text-slate-400 hover:bg-slate-50"
                )}
              >
                <Timer className={cn("w-4 h-4 shrink-0", mode === 'exam' ? "text-[#8ba32b] dark:text-[#c8e558]" : "text-slate-400")} />
                <div>
                  <div className="text-[12px] font-semibold">Timed Exam</div>
                  <div className="text-[10.5px] text-slate-400 leading-tight">CBT timer</div>
                </div>
              </button>

              <button
                type="button"
                onClick={() => setMode('study')}
                className={cn(
                  "flex items-center gap-2 p-2.5 rounded-xl border text-left transition-all cursor-pointer",
                  mode === 'study'
                    ? "bg-slate-100 dark:bg-white/[0.08] border-slate-300 dark:border-white/20 text-slate-900 dark:text-white"
                    : "bg-white dark:bg-white/[0.02] border-slate-200/80 dark:border-white/10 text-slate-500 dark:text-slate-400 hover:bg-slate-50"
                )}
              >
                <GraduationCap className={cn("w-4 h-4 shrink-0", mode === 'study' ? "text-[#8ba32b] dark:text-[#c8e558]" : "text-slate-400")} />
                <div>
                  <div className="text-[12px] font-semibold">Study Mode</div>
                  <div className="text-[10.5px] text-slate-400 leading-tight">AI hints</div>
                </div>
              </button>
            </div>
          </div>
        </div>

        <button
          onClick={handleGenerate}
          disabled={isGenerating}
          className="w-full py-2.5 bg-slate-900 hover:bg-slate-800 text-white dark:bg-[#c8e558] dark:hover:bg-[#bcd94c] dark:text-slate-900 rounded-xl text-[13px] font-semibold flex items-center justify-center gap-2 transition-all shadow-xs active:scale-[0.98] cursor-pointer disabled:opacity-50"
        >
          {isGenerating ? (
            <div className="flex items-center gap-2">
              <Loader2 className="w-4 h-4 animate-spin text-[#c8e558] dark:text-slate-900" />
              <span>Generating Questions with Gemini...</span>
            </div>
          ) : (
            <>
              <Crosshair className="w-4 h-4" /> Generate Practice Test
            </>
          )}
        </button>
      </div>
    </div>
  );
}
