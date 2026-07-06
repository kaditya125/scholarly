import { useState } from 'react';
import { motion } from 'motion/react';
import { Search, Compass, BookOpen, Clock, Target, Play, BarChart2, Star, Zap, Activity } from 'lucide-react';
import { cn } from '../lib/utils';
import { useTheme } from '../lib/ThemeContext';
import { HeroSection } from '../components/tests/HeroSection';
import { ExamSelector } from '../components/tests/ExamSelector';
import { FeaturedTestSeries } from '../components/tests/FeaturedTestSeries';
import { AdaptiveTestGenerator } from '../components/tests/AdaptiveTestGenerator';
import { ContinueLearning } from '../components/tests/ContinueLearning';
import { CategoryGrid } from '../components/tests/CategoryGrid';
import { AIRecommendedTests } from '../components/tests/AIRecommendedTests';

export default function TestCenter() {
  const { theme } = useTheme();
  const isDarkMode = theme === 'dark';
  const [selectedExam, setSelectedExam] = useState<string>('SSC CGL');

  return (
    <div className={cn(
      "w-full h-full overflow-y-auto custom-scrollbar transition-colors duration-300",
      isDarkMode ? "bg-[#0A0A0A] text-slate-100" : "bg-slate-50 text-slate-900"
    )}>
      {/* 1. Hero Section (Welcome & Quick Resume) */}
      <HeroSection examTarget={selectedExam} />

      <div className="max-w-[1400px] mx-auto px-6 pb-24 space-y-12">
        {/* 2. Intelligent Search */}
        <div className="relative -mt-6 z-10 max-w-2xl mx-auto">
          <div className={cn(
            "flex items-center gap-3 p-2 rounded-2xl border shadow-xl backdrop-blur-xl transition-colors duration-300",
            isDarkMode ? "bg-slate-900/80 border-slate-700/50 shadow-black/50" : "bg-white/90 border-slate-200 shadow-slate-200/50"
          )}>
            <div className="pl-4">
              <Search className={cn("w-5 h-5", isDarkMode ? "text-slate-400" : "text-slate-400")} />
            </div>
            <input 
              type="text" 
              placeholder="Search tests, subjects, PYQs, current affairs..."
              className={cn(
                "w-full bg-transparent border-none outline-none text-[15px] font-medium h-12",
                isDarkMode ? "text-white placeholder:text-slate-500" : "text-slate-900 placeholder:text-slate-400"
              )}
            />
            <button className="px-6 py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold transition-colors">
              Search
            </button>
          </div>
        </div>

        {/* 3. Horizontal Exam Selector */}
        <ExamSelector selectedExam={selectedExam} onSelect={setSelectedExam} />

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2 space-y-10">
            {/* 6. Continue Learning (Incomplete Tests) */}
            <ContinueLearning />

            {/* 4. Featured Test Series */}
            <FeaturedTestSeries selectedExam={selectedExam} />
            
            {/* 5. Categories Grid */}
            <CategoryGrid />
          </div>

          <div className="space-y-8">
            {/* 8. AI Adaptive Test Generator */}
            <AdaptiveTestGenerator />

            {/* 9. AI Recommended Tests */}
            <AIRecommendedTests />
          </div>
        </div>
      </div>
    </div>
  );
}
