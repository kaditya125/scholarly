import { motion } from 'motion/react';
import { Play, Clock, Target } from 'lucide-react';
import { cn } from '../../lib/utils';
import { useTheme } from '../../lib/ThemeContext';
import { useNavigate } from 'react-router-dom';

interface HeroSectionProps {
  examTarget: string;
}

export function HeroSection({ examTarget }: HeroSectionProps) {
  const { theme } = useTheme();
  const isDarkMode = theme === 'dark';
  const navigate = useNavigate();

  // In a real app, this would be fetched from the backend user context
  const activeTest = {
    id: 'mock-18',
    title: `${examTarget} Mock Test #18`,
    progress: 53,
    remainingMins: 25,
  };

  return (
    <div className={cn(
      "relative overflow-hidden pt-8 pb-16 px-6 transition-colors duration-300",
      isDarkMode ? "bg-[#131314]" : "bg-slate-900"
    )}>
      {/* Background Gradients */}
      <div className="absolute top-0 right-0 w-1/2 h-full bg-gradient-to-l from-indigo-500/20 to-transparent blur-3xl mix-blend-screen pointer-events-none" />
      <div className="absolute bottom-0 left-0 w-1/3 h-1/2 bg-gradient-to-t from-teal-500/20 to-transparent blur-3xl mix-blend-screen pointer-events-none" />

      <div className="max-w-[1400px] mx-auto relative z-10">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-8">
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="space-y-4 max-w-2xl text-white"
          >
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/10 border border-white/20 backdrop-blur-md text-xs font-medium">
              <Target className="w-3.5 h-3.5 text-teal-400" />
              Preparing for {examTarget} 2026
            </div>
            <h1 className="text-4xl md:text-5xl font-bold tracking-tight">
              Welcome Back, Aditya
            </h1>
            <p className="text-lg text-slate-300 font-medium">
              You are exactly 124 days away from your target. Ready for today's practice?
            </p>
          </motion.div>

          {/* Continue Last Test Card */}
          {activeTest && (
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.1 }}
              className={cn(
                "w-full md:w-[400px] p-6 rounded-2xl border backdrop-blur-xl shadow-2xl relative overflow-hidden group",
                isDarkMode ? "bg-slate-800/80 border-slate-700" : "bg-white/10 border-white/20"
              )}
            >
              <div className="absolute top-0 left-0 w-full h-1 bg-white/10">
                <div 
                  className="h-full bg-teal-400 transition-all duration-1000 ease-out" 
                  style={{ width: `${activeTest.progress}%` }} 
                />
              </div>
              
              <div className="flex justify-between items-start mb-4">
                <div>
                  <h3 className="text-sm font-bold text-slate-300 uppercase tracking-wider mb-1">
                    Continue Last Test
                  </h3>
                  <h2 className="text-xl font-bold text-white">
                    {activeTest.title}
                  </h2>
                </div>
                <div className="w-12 h-12 rounded-full bg-indigo-500/20 border border-indigo-500/30 flex items-center justify-center text-indigo-300 font-bold">
                  {activeTest.progress}%
                </div>
              </div>

              <div className="flex items-center gap-4 mb-6 text-sm text-slate-300 font-medium">
                <span className="flex items-center gap-1.5 bg-black/20 px-2 py-1 rounded-md">
                  <Clock className="w-4 h-4 text-amber-400" />
                  {activeTest.remainingMins} mins left
                </span>
                <span className="text-slate-400">Sectional</span>
              </div>

              <button 
                onClick={() => navigate('/test', { state: { mode: 'exam' } })}
                className="w-full py-3 bg-white hover:bg-slate-100 text-slate-900 rounded-xl font-bold flex items-center justify-center gap-2 transition-colors"
              >
                <Play className="w-4 h-4 fill-current" /> Resume Test
              </button>
            </motion.div>
          )}
        </div>
      </div>
    </div>
  );
}
