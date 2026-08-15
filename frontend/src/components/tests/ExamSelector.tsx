import { motion } from 'motion/react';
import { cn } from '../../lib/utils';
import { useTheme } from '../../lib/ThemeContext';

interface ExamSelectorProps {
  selectedExam: string;
  onSelect: (exam: string) => void;
}

const EXAMS = [
  'SSC CGL', 'SSC CHSL', 'UPSC', 'TRE Bihar', 'Railway NTPC', 'BPSC', 'JEE Main', 'NEET', 'Banking PO'
];

export function ExamSelector({ selectedExam, onSelect }: ExamSelectorProps) {
  const { theme } = useTheme();
  const isDarkMode = theme === 'dark';

  return (
    <div className="w-full overflow-x-auto custom-scrollbar pb-2 pt-1 -mx-6 px-6 lg:mx-0 lg:px-0">
      <div className="flex items-center gap-2 w-max">
        {EXAMS.map((exam) => {
          const isSelected = selectedExam === exam;
          return (
            <button
              key={exam}
              onClick={() => onSelect(exam)}
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
        })}
      </div>
    </div>
  );
}
