import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { useNavigate } from 'react-router-dom';
import { useBriefing } from '../hooks/ai/useBriefing';
import { MorningBriefingCard } from '../components/welcome/MorningBriefingCard';
import { StudyStreakCard } from '../components/welcome/StudyStreakCard';
import { ActivityTimeline } from '../components/welcome/ActivityTimeline';
import { ContinueLearningCard } from '../components/welcome/ContinueLearningCard';
import { AIMemorySummary } from '../components/welcome/AIMemorySummary';
import { AIRecommendations } from '../components/welcome/AIRecommendations';
import { PlannerSnapshot, NotebookSnapshot } from '../components/welcome/PlannerAndNotebookSnapshot';
import { MotivationBanner } from '../components/welcome/MotivationBanner';
import { Bot, Loader2, LogOut } from 'lucide-react';
import { signOut, auth } from '../lib/firebase';

export default function WelcomeBriefing() {
  const { briefing, loading, error } = useBriefing();
  const navigate = useNavigate();
  const [showContent, setShowContent] = useState(false);

  useEffect(() => {
    if (!loading && briefing) {
      // Small delay before showing content to let the exit animation of loader finish
      setTimeout(() => setShowContent(true), 400);
    }
  }, [loading, briefing]);

  const handleLogout = async () => {
    await signOut(auth);
    navigate('/');
  };

  const handleSkip = () => {
    navigate('/dashboard');
  };

  if (error) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-[#131314] flex flex-col items-center justify-center p-6">
        <Bot className="w-16 h-16 text-slate-300 mb-4" />
        <h2 className="text-xl font-bold text-slate-800 dark:text-white mb-2">Could not load briefing</h2>
        <p className="text-slate-500 mb-6">{error}</p>
        <button onClick={handleSkip} className="bg-indigo-600 text-white px-6 py-2 rounded-lg font-bold">
          Go to Dashboard
        </button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-[#131314] text-slate-900 dark:text-white font-sans transition-colors duration-300 overflow-x-hidden">
      
      <AnimatePresence mode="wait">
        {loading && (
          <motion.div
            key="loader"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            transition={{ duration: 0.4 }}
            className="absolute inset-0 flex flex-col items-center justify-center bg-slate-50 dark:bg-[#131314] z-50"
          >
            <div className="relative">
              <div className="absolute inset-0 bg-indigo-500 blur-xl opacity-20 rounded-full animate-pulse"></div>
              <Bot className="w-20 h-20 text-indigo-500 relative z-10 animate-bounce" style={{ animationDuration: '2s' }} />
            </div>
            <h2 className="mt-8 text-2xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-indigo-500 to-teal-400">
              Scholarly AI is thinking...
            </h2>
            <p className="mt-3 text-slate-500 dark:text-slate-400 font-medium animate-pulse">
              Preparing your personalized daily briefing
            </p>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showContent && briefing && (
          <motion.div
            key="content"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.8 }}
            className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-12"
          >
            {/* Header Actions */}
            <div className="flex justify-between items-center mb-8">
              <div className="flex items-center gap-2">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M12 2L2 7L12 12L22 7L12 2Z" fill="#facc15"/>
                  <path d="M2 17L12 22L22 17M2 12L12 17L22 12" stroke="#facc15" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
                <span className="font-bold text-lg tracking-tight uppercase">Scholarly AI</span>
              </div>
              <div className="flex items-center gap-4">
                <button onClick={handleSkip} className="text-sm font-semibold text-slate-500 hover:text-slate-800 dark:hover:text-white transition-colors">
                  Skip to Dashboard
                </button>
                <button onClick={handleLogout} className="text-sm p-2 rounded-lg bg-slate-200 dark:bg-white/5 hover:bg-slate-300 dark:hover:bg-white/10 transition-colors">
                  <LogOut className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Grid Layout */}
            <div className="grid grid-cols-1 md:grid-cols-8 lg:grid-cols-12 gap-6 pb-20">
              <MorningBriefingCard briefing={briefing} />
              <StudyStreakCard streak={briefing.studyStreak} delay={0.1} />
              <ContinueLearningCard data={briefing.continueLearning} delay={0.2} />
              <ActivityTimeline progress={briefing.yesterdaysProgress} delay={0.3} />
              <AIMemorySummary memory={briefing.aiMemorySummary} delay={0.4} />
              <AIRecommendations recommendations={briefing.todayRecommendations} delay={0.5} />
              <PlannerSnapshot planner={briefing.plannerSummary} delay={0.6} />
              <NotebookSnapshot notebooks={briefing.notebookSummary} delay={0.7} />
              <MotivationBanner motivation={briefing.motivation} delay={0.8} />
            </div>

            {/* Fixed Bottom Action */}
            <motion.div 
              initial={{ opacity: 0, y: 50 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 1, duration: 0.5, type: 'spring' }}
              className="fixed bottom-0 left-0 right-0 p-6 bg-gradient-to-t from-slate-50 via-slate-50 dark:from-[#131314] dark:via-[#131314] to-transparent pointer-events-none flex justify-center z-40"
            >
              <button 
                onClick={handleSkip}
                className="pointer-events-auto shadow-2xl shadow-indigo-500/20 bg-indigo-600 hover:bg-indigo-500 text-white px-8 py-4 rounded-full font-bold text-lg flex items-center gap-3 transition-transform hover:scale-105 active:scale-95"
              >
                Go to Dashboard
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14"/><path d="m12 5 7 7-7 7"/></svg>
              </button>
            </motion.div>

          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
