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
    <div className="w-full overflow-x-auto custom-scrollbar pb-4 pt-2 -mx-6 px-6 lg:mx-0 lg:px-0">
      <div className="flex items-center gap-3 w-max">
        {EXAMS.map((exam) => {
          const isSelected = selectedExam === exam;
          return (
            <button
              key={exam}
              onClick={() => onSelect(exam)}
              className={cn(
                "relative px-6 py-3 rounded-full text-sm font-bold transition-all duration-300 whitespace-nowrap",
                isSelected 
                  ? "text-white" 
                  : isDarkMode 
                    ? "bg-slate-800/50 text-slate-400 hover:bg-slate-800 hover:text-slate-200" 
                    : "bg-white text-slate-600 hover:bg-slate-100 border border-slate-200"
              )}
            >
              {isSelected && (
                <motion.div
                  layoutId="activeExam"
                  className="absolute inset-0 bg-indigo-600 rounded-full z-0"
                  initial={false}
                  transition={{ type: "spring", stiffness: 500, damping: 30 }}
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
