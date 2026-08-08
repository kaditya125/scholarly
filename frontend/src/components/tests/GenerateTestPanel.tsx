import { useState } from 'react';
import { motion } from 'motion/react';
import { Sparkles, GraduationCap, Timer, Zap } from 'lucide-react';
import { cn } from '../../lib/utils';
import { useLaunchTest } from '../../hooks/ai/useLaunchTest';
import { useUserStats } from '../../hooks/api/useUserStats';
import type { QuizMode } from '../../lib/api/quiz';

const COUNTS = [5, 10, 15, 20];

export function GenerateTestPanel() {
  const launch = useLaunchTest();
  const { stats } = useUserStats();
  const [topic, setTopic] = useState('');
  const [count, setCount] = useState(10);
  const [mode, setMode] = useState<QuizMode>('exam');

  const suggestions = (stats?.weakTopics || []).slice(0, 4);

  const handleGenerate = () => {
    const trimmed = topic.trim();
    launch({ mode, topic: trimmed || undefined, count });
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35 }}
      className="p-6 rounded-[24px] border bg-white border-slate-200 dark:bg-[#1e1e1f] dark:border-white/10 shadow-[0_4px_20px_rgb(0,0,0,0.03)] relative overflow-hidden"
    >
      <div className="absolute -top-20 -right-20 w-48 h-48 bg-indigo-500/10 blur-3xl rounded-full pointer-events-none" />

      <div className="relative z-10">
        <div className="flex items-center gap-2 mb-1">
          <div className="w-8 h-8 rounded-xl bg-indigo-100 dark:bg-indigo-900/30 flex items-center justify-center">
            <Sparkles className="w-4.5 h-4.5 text-indigo-600 dark:text-indigo-400" />
          </div>
          <h3 className="text-[17px] font-bold text-slate-900 dark:text-white">Generate a test</h3>
        </div>
        <p className="text-[13px] text-slate-500 dark:text-gray-400 mb-5">
          Our AI builds a fresh test from your syllabus and weak areas. Leave the topic blank to target your weak areas automatically.
        </p>

        {/* Topic */}
        <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-400 dark:text-gray-500 mb-2">Focus topic (optional)</label>
        <input
          value={topic}
          onChange={(e) => setTopic(e.target.value)}
          placeholder="e.g. Indian Polity, Thermodynamics, Percentages…"
          className="w-full px-4 py-3 rounded-xl border text-[14px] outline-none transition-colors bg-slate-50 border-slate-200 text-slate-800 placeholder:text-slate-400 focus:border-indigo-400 dark:bg-[#141415] dark:border-white/10 dark:text-slate-100 dark:placeholder:text-gray-500"
        />

        {suggestions.length > 0 && (
          <div className="flex flex-wrap gap-2 mt-3">
            {suggestions.map((s) => (
              <button
                key={s}
                onClick={() => setTopic(s)}
                className={cn(
                  'px-2.5 py-1 rounded-full text-[11.5px] font-medium border transition-colors',
                  topic === s
                    ? 'bg-indigo-600 border-indigo-600 text-white'
                    : 'bg-slate-50 border-slate-200 text-slate-600 hover:border-indigo-300 dark:bg-white/5 dark:border-white/10 dark:text-gray-300'
                )}
              >
                {s}
              </button>
            ))}
          </div>
        )}

        {/* Count */}
        <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-400 dark:text-gray-500 mb-2 mt-5">Questions</label>
        <div className="flex gap-2">
          {COUNTS.map((c) => (
            <button
              key={c}
              onClick={() => setCount(c)}
              className={cn(
                'flex-1 py-2 rounded-lg text-[13px] font-bold border transition-colors',
                count === c
                  ? 'bg-indigo-600 border-indigo-600 text-white'
                  : 'bg-slate-50 border-slate-200 text-slate-500 hover:bg-slate-100 dark:bg-white/5 dark:border-white/10 dark:text-gray-400'
              )}
            >
              {c}
            </button>
          ))}
        </div>

        {/* Mode */}
        <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-400 dark:text-gray-500 mb-2 mt-5">Mode</label>
        <div className="grid grid-cols-2 gap-2">
          <button
            onClick={() => setMode('exam')}
            className={cn(
              'flex items-center gap-2 p-3 rounded-xl border text-left transition-colors',
              mode === 'exam'
                ? 'bg-indigo-50 border-indigo-300 dark:bg-indigo-900/20 dark:border-indigo-500/40'
                : 'bg-slate-50 border-slate-200 hover:bg-slate-100 dark:bg-white/5 dark:border-white/10'
            )}
          >
            <Timer className={cn('w-4 h-4 shrink-0', mode === 'exam' ? 'text-indigo-600 dark:text-indigo-400' : 'text-slate-400')} />
            <div>
              <div className="text-[13px] font-bold text-slate-800 dark:text-slate-100">Exam</div>
              <div className="text-[11px] text-slate-500 dark:text-gray-400">Timed, no help</div>
            </div>
          </button>
          <button
            onClick={() => setMode('study')}
            className={cn(
              'flex items-center gap-2 p-3 rounded-xl border text-left transition-colors',
              mode === 'study'
                ? 'bg-indigo-50 border-indigo-300 dark:bg-indigo-900/20 dark:border-indigo-500/40'
                : 'bg-slate-50 border-slate-200 hover:bg-slate-100 dark:bg-white/5 dark:border-white/10'
            )}
          >
            <GraduationCap className={cn('w-4 h-4 shrink-0', mode === 'study' ? 'text-indigo-600 dark:text-indigo-400' : 'text-slate-400')} />
            <div>
              <div className="text-[13px] font-bold text-slate-800 dark:text-slate-100">Study</div>
              <div className="text-[11px] text-slate-500 dark:text-gray-400">Ask AI for hints</div>
            </div>
          </button>
        </div>

        <button
          onClick={handleGenerate}
          className="w-full mt-6 flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-[14px] transition-colors shadow-sm"
        >
          <Zap className="w-4 h-4" /> Generate Test
        </button>
      </div>
    </motion.div>
  );
}
