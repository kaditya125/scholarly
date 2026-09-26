import { useState } from 'react';
import { motion } from 'motion/react';
import { MoreHorizontal, X } from 'lucide-react';
import { cn } from '../../lib/utils';
import { useTheme } from '../../lib/ThemeContext';
import { EXAMS, getSiblingExams } from '../../lib/examPersonalization';

interface ExamSelectorProps {
  selectedExam: string;
  onSelect: (exam: string) => void;
}

export function ExamSelector({ selectedExam, onSelect }: ExamSelectorProps) {
  const { theme } = useTheme();
  const isDarkMode = theme === 'dark';
  const [showAll, setShowAll] = useState(false);

  // Sibling group first (selected exam first within it) so a student never has to hunt for their
  // own exam among 9 unrelated ones — "All Exams" is the deliberate overflow for browsing others.
  const siblingExams = getSiblingExams(selectedExam);
  const visibleExams = showAll ? EXAMS : siblingExams;
  const hasOverflow = siblingExams.length < EXAMS.length;

  const renderPill = (exam: string) => {
    const isSelected = selectedExam === exam;
    return (
      <button
        key={exam}
        onClick={() => {
          onSelect(exam);
          setShowAll(false);
        }}
        className={cn(
          "relative px-3.5 py-1.5 rounded-full text-[12px] font-medium transition-all duration-200 whitespace-nowrap cursor-pointer",
          isSelected
            ? "text-white dark:text-slate-900 shadow-xs font-semibold"
            : "bg-white dark:bg-white/[0.04] text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-50 dark:hover:bg-white/[0.08] border border-slate-200/80 dark:border-white/10"
        )}
      >
        {isSelected && (
          <motion.div
            layoutId="activeExam"
            className="absolute inset-0 bg-slate-900 dark:bg-[#c8e558] rounded-full z-0"
            initial={false}
            transition={{ type: "spring", stiffness: 500, damping: 32 }}
          />
        )}
        <span className="relative z-10">{exam}</span>
      </button>
    );
  };

  return (
    <div className="w-full overflow-x-auto custom-scrollbar pb-2 pt-1 -mx-6 px-6 lg:mx-0 lg:px-0">
      <div className="flex items-center gap-2 w-max">
        {visibleExams.map(renderPill)}
        {hasOverflow && (
          <button
            onClick={() => setShowAll((v) => !v)}
            className={cn(
              "flex items-center gap-1 px-3 py-1.5 rounded-full text-[12px] font-medium transition-all whitespace-nowrap cursor-pointer border",
              isDarkMode
                ? "bg-white/[0.02] border-white/10 text-slate-400 hover:text-white hover:bg-white/[0.06]"
                : "bg-slate-50/60 border-slate-200/80 text-slate-500 hover:text-slate-900 hover:bg-slate-100"
            )}
          >
            {showAll ? <X className="w-3.5 h-3.5" /> : <MoreHorizontal className="w-3.5 h-3.5" />}
            {showAll ? 'Close' : 'All Exams'}
          </button>
        )}
      </div>
    </div>
  );
}
