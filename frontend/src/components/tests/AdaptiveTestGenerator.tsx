import { useEffect, useState } from 'react';
import { Sparkles, Loader2, Crosshair, GraduationCap, Timer } from 'lucide-react';
import { cn } from '../../lib/utils';
import { useTheme } from '../../lib/ThemeContext';
import { useLaunchTest } from '../../hooks/ai/useLaunchTest';
import { getExamConfig } from '../../lib/examPersonalization';
import type { QuizMode } from '../../lib/api/quiz';

const COUNTS = [5, 10, 15, 20];

const SUBJECT_TOPIC_SUGGESTIONS: Record<string, string[]> = {
  'General Intelligence & Reasoning': [
    'Analogies & Similarities',
    'Syllogisms & Deductive Logic',
    'Number & Alphabet Series',
    'Coding-Decoding',
    'Blood Relations',
    'Direction Sense',
    'Arithmetical Reasoning',
    'Classification & Odd-One-Out',
    'Puzzles & Seating Arrangements',
    'Venn Diagrams & Set Relations',
    'Word Formation & Dictionary Order',
  ],
  'General Intelligence and Reasoning': [
    'Analogies & Similarities',
    'Syllogisms & Deductive Logic',
    'Number & Alphabet Series',
    'Coding-Decoding',
    'Blood Relations',
    'Direction Sense',
    'Arithmetical Reasoning',
    'Classification & Odd-One-Out',
    'Puzzles & Seating Arrangements',
    'Venn Diagrams & Set Relations',
    'Word Formation & Dictionary Order',
  ],
  'Operating System': [
    'CPU Scheduling',
    'Deadlocks & Synchronization',
    'Virtual Memory & Paging',
    'System Calls & Processes',
    'File Systems & Disk Scheduling',
  ],
  'Computer Networks': [
    'OSI & TCP/IP Protocol Suite',
    'Subnetting & CIDR Addressing',
    'Routing Protocols (OSPF, BGP, RIP)',
    'TCP Flow & Congestion Control',
    'Sockets, DNS, HTTP & Application Layer',
  ],
  'Databases': [
    'SQL Queries & Joins',
    'Normalization (1NF, 2NF, 3NF, BCNF)',
    'Transactions & ACID Properties',
    'Concurrency Control & Serializability',
    'ER Modeling & Relational Algebra',
  ],
  'Programming and Data Structures': [
    'C Pointers & Dynamic Memory',
    'Binary Search Trees & Heaps',
    'Graphs (BFS, DFS, Shortest Paths)',
    'Stacks, Queues & Linked Lists',
    'Recursion & Complexity',
  ],
  'Algorithms': [
    'Asymptotic Analysis (Big-O)',
    'Dynamic Programming',
    'Greedy Algorithms',
    'Divide and Conquer & Sorting',
    'Graph Algorithms (Dijkstra, Kruskal)',
  ],
  'Computer Organization and Architecture': [
    'Pipelining & Branch Hazards',
    'Cache Memory & Cache Mapping',
    'Instruction Formats & Addressing Modes',
    'ALU & Number Representation',
  ],
  'Digital Logic': [
    'Boolean Algebra & K-Maps',
    'Combinational Circuits (Mux, Decoder)',
    'Sequential Circuits & Flip-Flops',
    'Counters & Shift Registers',
  ],
  'Theory of Computation': [
    'Finite Automata (DFA, NFA)',
    'Regular Expressions & Languages',
    'Context-Free Grammars & PDA',
    'Turing Machines & Decidability',
  ],
  'Compiler Design': [
    'Lexical Analysis & Tokenization',
    'Syntax Analysis (LL & LR Parsers)',
    'Intermediate Code Generation',
    'Code Optimization & Data Flow',
  ],
  'Engineering Mathematics': [
    'Discrete Mathematics & Graph Theory',
    'Linear Algebra (Matrices, Eigenvalues)',
    'Probability & Random Variables',
    'Calculus & Numerical Methods',
  ],
  'General Awareness': [
    'Indian Polity & Constitution',
    'Modern Indian History',
    'General Science (Physics, Chemistry, Biology)',
    'Geography & Environmental Science',
    'Current Affairs & Economic Concepts',
  ],
  'Quantitative Aptitude': [
    'Percentage, Profit & Loss',
    'Ratio, Proportion & Mixture',
    'Time, Speed, Distance & Work',
    'Simple & Compound Interest',
    'Algebra & Geometry',
  ],
};

interface AdaptiveTestGeneratorProps {
  selectedExam: string;
}

export function AdaptiveTestGenerator({ selectedExam }: AdaptiveTestGeneratorProps) {
  const { theme } = useTheme();
  const isDarkMode = theme === 'dark';
  const launch = useLaunchTest();
  const { examId, subjectOptions } = getExamConfig(selectedExam);

  const [isGenerating, setIsGenerating] = useState(false);
  const [subject, setSubject] = useState(subjectOptions[0]?.value || 'Mathematics');
  const [customTopic, setCustomTopic] = useState('');
  const [count, setCount] = useState(10);
  const [mode, setMode] = useState<QuizMode>('exam');

  // Re-anchor the subject dropdown when the exam changes so it never shows a stale, off-exam
  // subject (e.g. "Biology" left selected after switching from NEET to SSC CGL).
  useEffect(() => {
    setSubject(subjectOptions[0]?.value || 'Mathematics');
    setCustomTopic('');
  }, [selectedExam]);

  const handleSubjectChange = (newSubject: string) => {
    setSubject(newSubject);
    setCustomTopic('');
  };

  const topicSuggestions = SUBJECT_TOPIC_SUGGESTIONS[subject] || [];

  const handleGenerate = async () => {
    setIsGenerating(true);
    const targetTopic = customTopic.trim() ? `${subject} - ${customTopic.trim()}` : subject;
    try {
      await launch({ topic: targetTopic, subject, count, mode, examId });
    } finally {
      setIsGenerating(false);
    }
  };

  const field = cn(
    "w-full h-8 px-2.5 rounded-lg border text-[13px] outline-none transition-colors",
    isDarkMode
      ? "bg-white/[0.03] border-white/[0.08] text-slate-200 placeholder:text-slate-500 focus:border-white/25"
      : "bg-white border-slate-200 text-slate-900 placeholder:text-slate-400 focus:border-slate-400"
  );
  const label = "block text-[11px] font-medium text-slate-500 dark:text-slate-400 mb-1";

  const modeBtn = (active: boolean) => cn(
    "flex items-center gap-2 px-2.5 py-2 rounded-lg border text-left transition-colors cursor-pointer",
    active
      ? "bg-slate-900/[0.04] dark:bg-white/[0.07] border-slate-900/20 dark:border-white/20 text-slate-900 dark:text-white"
      : "bg-white dark:bg-white/[0.02] border-slate-200 dark:border-white/[0.08] text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-white/[0.05]"
  );

  return (
    <div className="rounded-xl border border-slate-200/80 dark:border-white/[0.07] bg-white dark:bg-white/[0.03]">
      <div className="px-4 pt-4 pb-3 border-b border-slate-100 dark:border-white/[0.06]">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-md bg-slate-900 dark:bg-white flex items-center justify-center text-[#c8e558] dark:text-slate-900">
            <Sparkles className="w-3.5 h-3.5" />
          </div>
          <h3 className="text-[14px] font-semibold text-slate-900 dark:text-white">AI adaptive test</h3>
        </div>
        <p className="text-[12px] text-slate-500 dark:text-slate-400 mt-1.5 leading-relaxed">
          A Gemini-calibrated test on the subject and topic you choose.
        </p>
      </div>

      <div className="p-4 space-y-3">
        <div>
          <label className={label}>Subject</label>
          <select value={subject} onChange={(e) => handleSubjectChange(e.target.value)} className={field}>
            {subjectOptions.map((opt) => (
              <option key={opt.value} value={opt.value} className="dark:bg-[#1a1a1b]">{opt.label}</option>
            ))}
          </select>
        </div>

        <div>
          <div className="flex items-center justify-between mb-1">
            <label className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
              Topic or chapter <span className="text-slate-400 dark:text-slate-500 font-normal">· optional</span>
            </label>
            {customTopic && (
              <button
                type="button"
                onClick={() => setCustomTopic('')}
                className="text-[10.5px] text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 transition-colors cursor-pointer"
              >
                Clear
              </button>
            )}
          </div>
          <input
            type="text"
            value={customTopic}
            onChange={(e) => setCustomTopic(e.target.value)}
            placeholder={
              subject.includes('Reasoning')
                ? 'e.g. Syllogisms, Analogies, Blood Relations'
                : 'e.g. Paging, Normalization, Routing'
            }
            className={field}
          />
          {topicSuggestions.length > 0 && (
            <div className="mt-2">
              <span className="block text-[10px] font-medium uppercase tracking-wider text-slate-400 dark:text-slate-500 mb-1.5">
                Popular topic drills:
              </span>
              <div className="flex flex-wrap gap-1 max-h-36 overflow-y-auto pr-0.5">
                {topicSuggestions.map((suggestion) => {
                  const isSelected = customTopic.trim().toLowerCase() === suggestion.toLowerCase();
                  return (
                    <button
                      key={suggestion}
                      type="button"
                      onClick={() => setCustomTopic(isSelected ? '' : suggestion)}
                      className={cn(
                        "px-2 py-0.5 rounded-md text-[11px] font-medium transition-colors cursor-pointer border text-left",
                        isSelected
                          ? "bg-slate-900 text-white dark:bg-[#c8e558] dark:text-slate-900 border-transparent shadow-xs"
                          : "bg-slate-50 dark:bg-white/[0.04] border-slate-200/80 dark:border-white/[0.07] text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-white/[0.08]"
                      )}
                    >
                      {suggestion}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        <div>
          <label className={label}>Questions</label>
          <div className={cn("grid grid-cols-4 p-0.5 rounded-lg border", isDarkMode ? "border-white/[0.08] bg-white/[0.02]" : "border-slate-200 bg-slate-50")}>
            {COUNTS.map(c => (
              <button
                key={c}
                type="button"
                onClick={() => setCount(c)}
                className={cn(
                  "h-7 text-[12.5px] font-semibold rounded-md transition-colors cursor-pointer tabular-nums",
                  count === c
                    ? "bg-white dark:bg-white/10 text-slate-900 dark:text-white shadow-2xs"
                    : "text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
                )}
              >
                {c}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className={label}>Mode</label>
          <div className="grid grid-cols-2 gap-2">
            <button type="button" onClick={() => setMode('exam')} className={modeBtn(mode === 'exam')}>
              <Timer className={cn("w-3.5 h-3.5 shrink-0", mode === 'exam' ? "text-[#8ba32b] dark:text-[#c8e558]" : "text-slate-400")} />
              <div className="min-w-0">
                <div className="text-[12.5px] font-semibold leading-tight">Timed exam</div>
                <div className="text-[11px] text-slate-400 leading-tight">CBT timer</div>
              </div>
            </button>
            <button type="button" onClick={() => setMode('study')} className={modeBtn(mode === 'study')}>
              <GraduationCap className={cn("w-3.5 h-3.5 shrink-0", mode === 'study' ? "text-[#8ba32b] dark:text-[#c8e558]" : "text-slate-400")} />
              <div className="min-w-0">
                <div className="text-[12.5px] font-semibold leading-tight">Study mode</div>
                <div className="text-[11px] text-slate-400 leading-tight">AI hints</div>
              </div>
            </button>
          </div>
        </div>

        <button
          onClick={handleGenerate}
          disabled={isGenerating}
          className="w-full h-9 mt-1 bg-slate-900 hover:bg-slate-800 text-white dark:bg-[#c8e558] dark:hover:bg-[#bcd94c] dark:text-slate-900 rounded-lg text-[13px] font-semibold flex items-center justify-center gap-1.5 transition-colors cursor-pointer disabled:opacity-60"
        >
          {isGenerating ? (
            <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Generating…</>
          ) : (
            <><Crosshair className="w-3.5 h-3.5" /> Generate practice test</>
          )}
        </button>
      </div>
    </div>
  );
}
