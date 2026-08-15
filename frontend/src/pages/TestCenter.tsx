import { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Search, Compass, BookOpen, Clock, Target, Play, BarChart2, Star, Zap, Activity, Brain, History, Sparkles } from 'lucide-react';
import { cn } from '../lib/utils';
import { useTheme } from '../lib/ThemeContext';
import { useAuth } from '../lib/AuthContext';
import { HeroSection } from '../components/tests/HeroSection';
import { ExamSelector } from '../components/tests/ExamSelector';
import { FeaturedTestSeries } from '../components/tests/FeaturedTestSeries';
import { AdaptiveTestGenerator } from '../components/tests/AdaptiveTestGenerator';
import { ContinueLearning } from '../components/tests/ContinueLearning';
import { CategoryGrid } from '../components/tests/CategoryGrid';
import { AIRecommendedTests } from '../components/tests/AIRecommendedTests';
import { TestProgressOverview } from '../components/tests/TestProgressOverview';
import { WeakSectionsPanel } from '../components/tests/WeakSectionsPanel';
import { AttemptHistoryList } from '../components/tests/AttemptHistoryList';
import { useLaunchTest } from '../hooks/ai/useLaunchTest';

export default function TestCenter() {
  const { theme } = useTheme();
  const isDarkMode = theme === 'dark';
  const { role } = useAuth();
  const isTeacher = role === 'teacher';
  const launch = useLaunchTest();

  const [selectedExam, setSelectedExam] = useState<string>(isTeacher ? '' : 'SSC CGL');
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState<'explore' | 'analytics' | 'history'>('explore');

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchQuery.trim()) return;
    launch({
      topic: `${selectedExam ? selectedExam + ' - ' : ''}${searchQuery.trim()}`,
      count: 10,
      mode: 'exam'
    });
  };

  return (
    <div className={cn(
      "w-full h-full overflow-y-auto custom-scrollbar font-sans transition-colors duration-300 relative",
      isDarkMode ? "bg-[#131315] text-slate-100" : "bg-[#fafbfc] text-slate-900"
    )}>
      {/* Subtle ambient light glow */}
      {isDarkMode && (
        <div className="absolute top-1/4 right-10 w-96 h-96 bg-[#c8e558]/[0.03] blur-[120px] rounded-full pointer-events-none" />
      )}

      {/* 1. Hero Section (Welcome & Quick Resume) */}
      <HeroSection examTarget={selectedExam} />

      <div className="max-w-[1400px] mx-auto px-4 sm:px-6 pb-24 space-y-6 -mt-5 relative z-20">
        {/* 2. Intelligent AI Search Bar - Sleek Minimalist Capsule */}
        <form onSubmit={handleSearchSubmit} className="max-w-xl mx-auto">
          <div className={cn(
            "flex items-center gap-2 p-1 pl-3.5 rounded-full border transition-all duration-200",
            isDarkMode 
              ? "bg-[#18181c]/95 border-white/[0.08] shadow-[0_4px_24px_-4px_rgba(0,0,0,0.25)] focus-within:border-white/20 focus-within:ring-2 focus-within:ring-[#c8e558]/10" 
              : "bg-white border-slate-200/90 shadow-[0_4px_20px_-4px_rgba(0,0,0,0.06)] focus-within:border-slate-400 focus-within:ring-2 focus-within:ring-slate-900/5"
          )}>
            <div className="text-slate-400 dark:text-slate-500 shrink-0">
              <Search className="w-4 h-4" />
            </div>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={isTeacher ? "Search topics, syllabus chapters, question bank..." : "Search topics, subjects, PYQs (e.g. Percentage, Optics)..."}
              className={cn(
                "w-full bg-transparent border-none outline-none text-[12.5px] font-normal h-8.5 px-1.5",
                isDarkMode ? "text-white placeholder:text-slate-500" : "text-slate-900 placeholder:text-slate-400"
              )}
            />
            <button 
              type="submit"
              className="px-3.5 py-1.5 bg-slate-900 hover:bg-slate-800 text-white dark:bg-[#c8e558] dark:hover:bg-[#bcd94c] dark:text-slate-900 rounded-full text-[12px] font-semibold transition-all shrink-0 cursor-pointer shadow-2xs active:scale-98"
            >
              Generate Test
            </button>
          </div>
        </form>

        {/* 3. View Switcher & Exam Selector */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 pt-1">
          {/* Main Tabs */}
          <div className="flex items-center p-0.5 rounded-full bg-slate-100/90 dark:bg-white/[0.04] border border-slate-200/80 dark:border-white/10 shrink-0">
            <button
              onClick={() => setActiveTab('explore')}
              className={cn(
                "flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[12px] font-medium transition-all cursor-pointer",
                activeTab === 'explore'
                  ? "bg-white dark:bg-white/10 text-slate-900 dark:text-white shadow-2xs font-semibold"
                  : "text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
              )}
            >
              <Compass className="w-3.5 h-3.5" />
              Practice & Mocks
            </button>
            <button
              onClick={() => setActiveTab('analytics')}
              className={cn(
                "flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[12px] font-medium transition-all cursor-pointer",
                activeTab === 'analytics'
                  ? "bg-white dark:bg-white/10 text-slate-900 dark:text-white shadow-2xs font-semibold"
                  : "text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
              )}
            >
              <BarChart2 className="w-3.5 h-3.5" />
              Accuracy & Weak Areas
            </button>
            <button
              onClick={() => setActiveTab('history')}
              className={cn(
                "flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[12px] font-medium transition-all cursor-pointer",
                activeTab === 'history'
                  ? "bg-white dark:bg-white/10 text-slate-900 dark:text-white shadow-2xs font-semibold"
                  : "text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
              )}
            >
              <History className="w-3.5 h-3.5" />
              Attempt History
            </button>
          </div>

          {/* Exam Selector Pill Strip */}
          {activeTab === 'explore' && (
            <div className="w-full sm:w-auto overflow-hidden">
              <ExamSelector selectedExam={selectedExam} onSelect={setSelectedExam} />
            </div>
          )}
        </div>

        {/* Dynamic Tab Content */}
        <AnimatePresence mode="wait">
          {activeTab === 'explore' && (
            <motion.div
              key="explore"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.25 }}
              className="grid grid-cols-1 lg:grid-cols-3 gap-8"
            >
              <div className="lg:col-span-2 space-y-8">
                {/* Continue Incomplete Tests */}
                <ContinueLearning />

                {/* Featured Test Series */}
                <FeaturedTestSeries selectedExam={selectedExam} />
                
                {/* Categories Grid */}
                <CategoryGrid />
              </div>

              <div className="space-y-6">
                {/* AI Adaptive Test Generator */}
                <AdaptiveTestGenerator />

                {/* AI Coach Recommendations */}
                <AIRecommendedTests />
              </div>
            </motion.div>
          )}

          {activeTab === 'analytics' && (
            <motion.div
              key="analytics"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.25 }}
              className="grid grid-cols-1 lg:grid-cols-3 gap-8"
            >
              <div className="lg:col-span-2 space-y-6">
                <TestProgressOverview />
              </div>
              <div className="space-y-6">
                <WeakSectionsPanel />
              </div>
            </motion.div>
          )}

          {activeTab === 'history' && (
            <motion.div
              key="history"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.25 }}
            >
              <AttemptHistoryList />
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
