import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Search, Compass, BarChart2, History, ArrowRight } from 'lucide-react';
import { cn } from '../lib/utils';
import { useTheme } from '../lib/ThemeContext';
import { useAuth } from '../lib/AuthContext';
import { useProfile } from '../hooks/api/useProfile';
import { resolveExamFromGoal } from '../lib/examPersonalization';
import { HeroSection } from '../components/tests/HeroSection';
import { TestStatStrip } from '../components/tests/TestStatStrip';
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

type Tab = 'explore' | 'analytics' | 'history';

const TABS: { id: Tab; label: string; icon: typeof Compass }[] = [
  { id: 'explore', label: 'Practice & Mocks', icon: Compass },
  { id: 'analytics', label: 'Accuracy & Weak Areas', icon: BarChart2 },
  { id: 'history', label: 'Attempt History', icon: History },
];

const fade = {
  initial: { opacity: 0, y: 6 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -6 },
  transition: { duration: 0.18 },
};

export default function TestCenter() {
  const { theme } = useTheme();
  const isDarkMode = theme === 'dark';
  const { role } = useAuth();
  const isTeacher = role === 'teacher';
  const launch = useLaunchTest();
  const { profile } = useProfile();

  const [selectedExam, setSelectedExam] = useState<string>(isTeacher ? '' : 'SSC CGL');
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState<Tab>('explore');

  // Auto-scope to the student's declared exam goal once the profile loads. Only overrides the
  // default once, on first resolution — after that the student's own ExamSelector pick (a
  // session-scoped override) is left alone, so switching exams to browse doesn't get stomped by
  // a slow-arriving profile fetch or a later re-render.
  const appliedProfileExam = useRef(false);
  useEffect(() => {
    if (isTeacher || appliedProfileExam.current) return;
    const resolved = resolveExamFromGoal(profile?.goal || profile?.targetExam);
    if (resolved) {
      setSelectedExam(resolved);
      appliedProfileExam.current = true;
    }
  }, [isTeacher, profile?.goal, profile?.targetExam]);

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
      // chat-type opts this page out of the app-shell's global +1px font bump (index.css) so
      // every text-[Npx] value below renders at the exact size written, the same way Chat.tsx
      // does — instead of silently rendering ~1px larger than designed.
      "chat-type w-full h-full overflow-y-auto custom-scrollbar transition-colors duration-300",
      isDarkMode ? "bg-[#131315] text-slate-100" : "bg-[#fafbfc] text-slate-900"
    )}>
      <div className="max-w-[1320px] mx-auto px-4 sm:px-6 pt-6 pb-20 space-y-5">
        <HeroSection examTarget={selectedExam} />

        {/* The analytics tab renders its own, fuller metric grid — don't show the same numbers twice. */}
        {activeTab !== 'analytics' && <TestStatStrip />}

        {/* Toolbar: underline tabs on the left, generate-by-topic on the right */}
        <div className="flex flex-col-reverse xl:flex-row xl:items-end justify-between gap-x-4 gap-y-3 border-b border-slate-200/80 dark:border-white/[0.07]">
          <nav className="flex items-center gap-5 -mb-px overflow-x-auto shrink-0">
            {TABS.map(({ id, label, icon: Icon }) => {
              const active = activeTab === id;
              return (
                <button
                  key={id}
                  onClick={() => setActiveTab(id)}
                  className={cn(
                    "relative flex items-center gap-1.5 pb-2.5 pt-1 text-[13px] whitespace-nowrap transition-colors cursor-pointer",
                    active
                      ? "text-slate-900 dark:text-white font-semibold"
                      : "text-slate-500 dark:text-slate-400 font-medium hover:text-slate-800 dark:hover:text-slate-200"
                  )}
                >
                  <Icon className="w-3.5 h-3.5" />
                  {label}
                  {active && (
                    <motion.span
                      layoutId="testCenterTab"
                      className="absolute left-0 right-0 -bottom-px h-[2px] rounded-full bg-slate-900 dark:bg-[#c8e558]"
                      transition={{ type: 'spring', stiffness: 500, damping: 36 }}
                    />
                  )}
                </button>
              );
            })}
          </nav>

          <form onSubmit={handleSearchSubmit} className="xl:pb-2.5 w-full xl:w-[340px]">
            <div className={cn(
              "flex items-center gap-1.5 h-8 pl-2.5 pr-1 rounded-lg border transition-colors",
              isDarkMode
                ? "bg-white/[0.03] border-white/[0.08] focus-within:border-white/25"
                : "bg-white border-slate-200 focus-within:border-slate-400"
            )}>
              <Search className="w-3.5 h-3.5 text-slate-400 shrink-0" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={isTeacher ? "Topic, chapter or question bank…" : "Generate a test on any topic…"}
                className={cn(
                  "flex-1 min-w-0 bg-transparent outline-none text-[13px]",
                  isDarkMode ? "text-white placeholder:text-slate-500" : "text-slate-900 placeholder:text-slate-400"
                )}
              />
              <button
                type="submit"
                disabled={!searchQuery.trim()}
                className="h-6 px-2 rounded-md text-[12px] font-semibold flex items-center gap-1 bg-slate-900 text-white dark:bg-[#c8e558] dark:text-slate-900 disabled:opacity-40 transition-opacity cursor-pointer disabled:cursor-default"
              >
                Generate <ArrowRight className="w-3 h-3" />
              </button>
            </div>
          </form>
        </div>

        <AnimatePresence mode="wait">
          {activeTab === 'explore' && (
            <motion.div key="explore" {...fade} className="space-y-5">
              <div className="flex items-center justify-between gap-3">
                <span className="text-[12px] font-medium text-slate-500 dark:text-slate-400 shrink-0">Exam</span>
                <div className="flex-1 min-w-0 flex justify-end">
                  <ExamSelector selectedExam={selectedExam} onSelect={setSelectedExam} />
                </div>
              </div>

              <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_340px] gap-5 items-start">
                <div className="space-y-6 min-w-0">
                  <ContinueLearning />
                  <FeaturedTestSeries selectedExam={selectedExam} />
                  <CategoryGrid selectedExam={selectedExam} />
                </div>

                <aside className="space-y-5 xl:sticky xl:top-4">
                  <AdaptiveTestGenerator selectedExam={selectedExam} />
                  <AIRecommendedTests selectedExam={selectedExam} />
                </aside>
              </div>
            </motion.div>
          )}

          {activeTab === 'analytics' && (
            <motion.div key="analytics" {...fade} className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_380px] gap-5 items-start">
              <div className="min-w-0">
                <TestProgressOverview />
              </div>
              <WeakSectionsPanel />
            </motion.div>
          )}

          {activeTab === 'history' && (
            <motion.div key="history" {...fade}>
              <AttemptHistoryList />
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
