import { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Sparkles, Loader2, Settings, Crosshair } from 'lucide-react';
import { cn } from '../../lib/utils';
import { useTheme } from '../../lib/ThemeContext';
import { useNavigate } from 'react-router-dom';

export function AdaptiveTestGenerator() {
  const { theme } = useTheme();
  const isDarkMode = theme === 'dark';
  const navigate = useNavigate();
  
  const [isGenerating, setIsGenerating] = useState(false);
  const [subject, setSubject] = useState('Mathematics');
  const [difficulty, setDifficulty] = useState('Medium');
  
  const handleGenerate = () => {
    setIsGenerating(true);
    // Simulate AI Generation
    setTimeout(() => {
      setIsGenerating(false);
      navigate('/test', { state: { mode: 'study' } });
    }, 2500);
  };

  return (
    <div className={cn(
      "p-6 rounded-[24px] border relative overflow-hidden",
      isDarkMode ? "bg-slate-900 border-slate-800" : "bg-white border-slate-200 shadow-sm"
    )}>
      {/* Background Effect */}
      <div className="absolute -top-24 -right-24 w-48 h-48 bg-teal-500/20 blur-3xl rounded-full" />
      
      <div className="relative z-10">
        <div className="flex items-center gap-2 mb-2">
          <Sparkles className="w-5 h-5 text-teal-500" />
          <h3 className="text-xl font-bold">AI Adaptive Test</h3>
        </div>
        <p className={cn("text-sm mb-6", isDarkMode ? "text-slate-400" : "text-slate-500")}>
          Generate a custom test based on your weak topics and memory graph.
        </p>

        <div className="space-y-4 mb-6">
          <div>
            <label className={cn("block text-xs font-bold uppercase tracking-wider mb-2", isDarkMode ? "text-slate-500" : "text-slate-400")}>Subject Focus</label>
            <select 
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              className={cn(
                "w-full p-3 rounded-xl border text-sm font-medium outline-none",
                isDarkMode ? "bg-slate-950 border-slate-800 text-slate-200" : "bg-slate-50 border-slate-200 text-slate-800"
              )}
            >
              <option>Mathematics</option>
              <option>General Studies</option>
              <option>English Comprehension</option>
              <option>Reasoning</option>
            </select>
          </div>
          <div>
            <label className={cn("block text-xs font-bold uppercase tracking-wider mb-2", isDarkMode ? "text-slate-500" : "text-slate-400")}>Difficulty</label>
            <div className="flex gap-2">
              {['Easy', 'Medium', 'Hard'].map(lvl => (
                <button
                  key={lvl}
                  onClick={() => setDifficulty(lvl)}
                  className={cn(
                    "flex-1 py-2 text-sm font-bold rounded-lg border transition-colors",
                    difficulty === lvl 
                      ? "bg-teal-500/20 border-teal-500 text-teal-600 dark:text-teal-400" 
                      : (isDarkMode ? "bg-slate-950 border-slate-800 text-slate-400 hover:bg-slate-800" : "bg-white border-slate-200 text-slate-500 hover:bg-slate-50")
                  )}
                >
                  {lvl}
                </button>
              ))}
            </div>
          </div>
        </div>

        <button
          onClick={handleGenerate}
          disabled={isGenerating}
          className="w-full py-3.5 bg-gradient-to-r from-teal-500 to-indigo-500 hover:from-teal-400 hover:to-indigo-400 text-white rounded-xl font-bold flex items-center justify-center gap-2 transition-all shadow-lg shadow-teal-500/20"
        >
          {isGenerating ? (
            <AnimatePresence>
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex items-center gap-2">
                <Loader2 className="w-5 h-5 animate-spin" />
                <span>Crafting your test...</span>
              </motion.div>
            </AnimatePresence>
          ) : (
            <>
              <Crosshair className="w-5 h-5" /> Generate Test
            </>
          )}
        </button>
      </div>
    </div>
  );
}
