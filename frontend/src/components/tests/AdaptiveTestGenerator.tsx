import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Sparkles, Loader2, Crosshair, GraduationCap, Timer, BookOpen } from 'lucide-react';
import { cn } from '../../lib/utils';
import { useTheme } from '../../lib/ThemeContext';
import { useLaunchTest } from '../../hooks/ai/useLaunchTest';
import { getExamConfig } from '../../lib/examPersonalization';
import type { QuizMode } from '../../lib/api/quiz';

const COUNTS = [5, 10, 15, 20];

const SUBJECT_TOPIC_SUGGESTIONS: Record<string, string[]> = {
  'General Intelligence & Reasoning': [
    'Analogies & Similarities (Semantic, Symbolic & Number)',
    'Classification & Odd-One-Out',
    'Number & Alphabet Series',
    'Coding & Decoding (Letter, Number & Substitution)',
    'Blood Relations & Family Tree',
    'Syllogisms & Deductive Logic (Statements & Conclusions)',
    'Direction Sense & Spatial Orientation',
    'Arithmetical Reasoning & Mathematical Operations',
    'Puzzles & Seating Arrangements (Linear, Circular, Floor)',
    'Venn Diagrams & Set Relations',
    'Alphabet & Word Formation (Matrix & Dictionary Order)',
    'Paper Folding, Cutting & Embedded Figures',
  ],
  'General Intelligence and Reasoning': [
    'Analogies & Similarities (Semantic, Symbolic & Number)',
    'Classification & Odd-One-Out',
    'Number & Alphabet Series',
    'Coding & Decoding (Letter, Number & Substitution)',
    'Blood Relations & Family Tree',
    'Syllogisms & Deductive Logic (Statements & Conclusions)',
    'Direction Sense & Spatial Orientation',
    'Arithmetical Reasoning & Mathematical Operations',
    'Puzzles & Seating Arrangements (Linear, Circular, Floor)',
    'Venn Diagrams & Set Relations',
    'Alphabet & Word Formation (Matrix & Dictionary Order)',
    'Paper Folding, Cutting & Embedded Figures',
  ],
  'General Awareness': [
    'Everyday Science & Scientific Aspects (Physics, Chemistry, Biology)',
    'General Polity & Constitution of India (Articles, Amendments, Rights)',
    'Indian History & National Movement (Ancient, Medieval, Modern)',
    'Geography & Environment of India (Rivers, Climate, Ecology)',
    'Economic Scene, Financial Policy & Budget',
    'Current Events (National & International Affairs, Summits)',
    'Scientific Research & Space Technology (ISRO, DRDO, IMD)',
    'Static GK, Indian Heritage, Books & Authors',
  ],
  'General Awareness & Science': [
    'Everyday Science & Scientific Aspects (Physics, Chemistry, Biology)',
    'General Polity & Constitution of India (Articles, Amendments, Rights)',
    'Indian History & National Movement (Ancient, Medieval, Modern)',
    'Geography & Environment of India (Rivers, Climate, Ecology)',
    'Economic Scene, Financial Policy & Budget',
    'Current Events (National & International Affairs, Summits)',
    'Scientific Research & Space Technology (ISRO, DRDO, IMD)',
    'Static GK, Indian Heritage, Books & Authors',
  ],
  'Computer Science and Information Technology': [
    'Operating Systems',
    'Computer Networks',
    'Databases & SQL',
    'Programming & Data Structures (C Language)',
    'Algorithms & Complexity',
    'Computer Organization & Architecture',
    'Digital Logic',
    'Theory of Computation',
    'Compiler Design',
    'Engineering Mathematics',
  ],
  'Operating System': [
    'CPU Scheduling (FCFS, SJF, Round Robin, Priority)',
    'Process Synchronization, Semaphores & Mutex',
    'Deadlocks (Detection, Prevention, Avoidance, Banker Algorithm)',
    'Memory Management & Paging (Page Tables, TLB)',
    'Virtual Memory & Page Replacement (FIFO, LRU, Optimal)',
    'System Calls, Process States & Fork/Exec',
    'File Systems & Disk Scheduling (SCAN, C-SCAN, SSTF)',
    'Threads, Concurrency & Inter-Process Communication',
  ],
  'Computer Networks': [
    'OSI Reference Model & TCP/IP Architecture',
    'IP Addressing, Subnetting & CIDR Calculation',
    'Routing Protocols (OSPF, BGP, RIP, Distance Vector & Link State)',
    'TCP Flow Control, Congestion Control & 3-Way Handshake',
    'Transport Layer & UDP Ports',
    'Network Layer Protocols (ARP, RARP, ICMP, DHCP)',
    'Application Layer Protocols (DNS, HTTP, HTTPS, FTP, SMTP, Sockets)',
    'Data Link Layer Framing, CRC Error Detection & CSMA/CD',
    'Network Security, Firewalls & Cryptography Basics',
  ],
  'Databases': [
    'SQL Queries, Joins, Aggregations & Subqueries',
    'Database Normalization (1NF, 2NF, 3NF, BCNF & Functional Dependencies)',
    'Transactions & ACID Properties',
    'Concurrency Control, Serializability & 2-Phase Locking',
    'ER Modeling, Entities, Attributes & Cardinality',
    'Relational Algebra & Tuple Relational Calculus',
    'Indexing, B-Trees & B+ Trees',
    'Database Recovery Techniques & WAL',
  ],
  'Programming and Data Structures': [
    'C Pointers, Pointer Arithmetic & Dynamic Memory (malloc, free)',
    'Recursion, Stack Frames & Storage Classes',
    'Linear Data Structures (Arrays, Linked Lists, Stacks, Queues)',
    'Binary Trees, Binary Search Trees (BST) & Tree Traversals',
    'Heaps, Priority Queues & Heap Sort',
    'Graph Representation & Traversals (BFS, DFS)',
    'Hashing, Hash Functions & Collision Resolution',
  ],
  'Algorithms': [
    'Asymptotic Analysis (Big-O, Omega, Theta & Master Theorem)',
    'Sorting Algorithms (Quick Sort, Merge Sort, Heap Sort) & Lower Bounds',
    'Searching Algorithms (Binary Search, Divide and Conquer)',
    'Greedy Algorithms (Huffman Coding, Knapsack, Activity Selection)',
    'Dynamic Programming (0/1 Knapsack, LCS, Matrix Chain)',
    'Graph Algorithms (Dijkstra, Bellman-Ford, Kruskal, Prim)',
    'NP-Completeness & Complexity Classes',
  ],
  'Computer Organization and Architecture': [
    'CPU Pipelining, Pipeline Depth & Hazards (Data, Control, Structural)',
    'Cache Memory Organization (Direct, Associative, Set-Associative)',
    'Instruction Formats & Addressing Modes',
    'ALU, Computer Arithmetic, 2s Complement & Booth Algorithm',
    'Memory Hierarchy & Main Memory Interfacing',
    'Input/Output Organization, Interrupts & DMA Transfer',
  ],
  'Digital Logic': [
    'Boolean Algebra, Logic Gates & De Morgan Laws',
    'K-Maps & Boolean Expression Minimization',
    'Combinational Circuits (Multiplexers, Decoders, Adders, Subtractors)',
    'Sequential Circuits & Flip-Flops (SR, JK, D, T)',
    'Synchronous & Asynchronous Counters, Shift Registers',
    'Number Systems, Conversions & Floating Point Representation',
  ],
  'Theory of Computation': [
    'Finite Automata (DFA, NFA & Equivalence)',
    'Regular Expressions, Regular Languages & Pumping Lemma',
    'Context-Free Grammars (CFG), Ambiguity & PDA',
    'Turing Machines & Chomsky Hierarchy',
    'Decidability, Undecidability & Halting Problem',
  ],
  'Compiler Design': [
    'Lexical Analysis & Tokenization',
    'Top-Down Parsing & LL(1) Grammars',
    'Bottom-Up Parsing (LR(0), SLR, LALR, CLR)',
    'Syntax-Directed Translation (SDT) & Attribute Grammars',
    'Intermediate Code Generation (Three-Address Code)',
    'Code Optimization & Data Flow Analysis',
  ],
  'Engineering Mathematics': [
    'Discrete Mathematics (Sets, Relations, Functions, Lattices, Groups)',
    'Mathematical Logic (Propositional & Predicate Logic)',
    'Linear Algebra (Matrices, Determinants, Systems of Equations, Eigenvalues)',
    'Combinatorics & Counting Principles',
    'Probability, Random Variables, Distributions & Bayes Theorem',
    'Calculus (Limits, Continuity, Derivatives, Maxima/Minima, Integrals)',
    'Graph Theory (Trees, Cycles, Planarity, Coloring)',
  ],
  'Quantitative Aptitude': [
    'Percentage, Profit & Loss, Discount',
    'Ratio, Proportion, Partnership & Mixtures',
    'Time, Speed, Distance & Trains',
    'Time and Work & Pipes-Cisterns',
    'Simple & Compound Interest',
    'Basic Algebra, Surds & Indices',
    'Geometry, Mensuration (2D & 3D) & Trigonometry',
    'Data Interpretation (Bar, Pie, Table Charts)',
  ],
};

interface AdaptiveTestGeneratorProps {
  selectedExam: string;
}

export function AdaptiveTestGenerator({ selectedExam }: AdaptiveTestGeneratorProps) {
  const { theme } = useTheme();
  const isDarkMode = theme === 'dark';
  const navigate = useNavigate();
  const launch = useLaunchTest();
  const { examId, subjectOptions } = getExamConfig(selectedExam);

  const [isGenerating, setIsGenerating] = useState(false);
  const [subject, setSubject] = useState(subjectOptions[0]?.value || 'Mathematics');
  const [customTopic, setCustomTopic] = useState('');
  const [isCustomMode, setIsCustomMode] = useState(false);
  const [count, setCount] = useState(10);
  const [mode, setMode] = useState<QuizMode>('exam');

  // Re-anchor the subject dropdown when the exam changes so it never shows a stale, off-exam
  // subject (e.g. "Biology" left selected after switching from NEET to SSC CGL).
  useEffect(() => {
    setSubject(subjectOptions[0]?.value || 'Mathematics');
    setCustomTopic('');
    setIsCustomMode(false);
  }, [selectedExam]);

  const handleSubjectChange = (newSubject: string) => {
    setSubject(newSubject);
    setCustomTopic('');
    setIsCustomMode(false);
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

  const handleReviseWithTutor = () => {
    const focusTopic = customTopic.trim() || subject;
    const promptText = `Target Exam: SSC Scientific Assistant in IMD / SSC JE CS & IT (CBT Exam Window: Nov 2 - Nov 6).
Subject: ${subject}
Topic: ${focusTopic}

Role: Act as my Senior Subject Expert & 1-on-1 Exam Revision Tutor for this examination.

Please structure our fast, high-yield revision in conversational, relatable language:
1. EXAM WEIGHTAGE & HISTORICAL PYQ PATTERN:
   - What is the exact marks weightage and frequency for "${focusTopic}" in SSC IMD (2022/2017), ISRO/NIELIT CS, and SSC JE?
   - What recurring question styles appear (e.g. numerical calculation, definition trap, formula substitution)?

2. CORE CONCEPTS & INTUITIVE EXPLANATION:
   - Ground your explanations strictly in authoritative reference texts (e.g. Silberschatz/Galvin for OS, Kurose-Ross for Networks, Navathe for DBMS, Cormen for Algorithms, Lucent for GA, Rakesh Yadav for Reasoning). Do NOT hallucinate concepts.
   - Explain the core mechanism in clear, friendly, and relatable terms with intuitive real-world analogies so I can quickly master it for the upcoming Nov 2–6 exam.
   - Summarize key formulas, state transitions, algorithms, or truth tables in clean markdown.

3. COMMON SSC EXAM TRAPS & PITFALLS:
   - What are the top 2-3 specific confusions or trick options examiners use to cause negative marking (-0.25)?

4. AUTHENTIC PYQ WALKTHROUGH:
   - Provide 1 authentic previous year question on this exact topic and walk me through the step-by-step solution showing how to solve it in under 45 seconds.

5. RAPID-FIRE CONCEPT CHECK:
   - End with 1 high-yield practice question for me to answer right now in our chat to confirm my understanding.

Let's begin!`;

    const params = new URLSearchParams({
      exam: 'SSC IMD',
      topic: `${subject} - ${focusTopic}`,
      prompt: promptText,
    });

    navigate(`/chat?${params.toString()}`);
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
              Topic or subtopic <span className="text-slate-400 dark:text-slate-500 font-normal">· syllabus-aligned</span>
            </label>
            {(customTopic || isCustomMode) && (
              <button
                type="button"
                onClick={() => { setCustomTopic(''); setIsCustomMode(false); }}
                className="text-[10.5px] text-[#8ba32b] dark:text-[#c8e558] hover:underline transition-colors cursor-pointer"
              >
                Reset to All
              </button>
            )}
          </div>

          {topicSuggestions.length > 0 ? (
            <select
              value={isCustomMode ? '__custom__' : customTopic}
              onChange={(e) => {
                if (e.target.value === '__custom__') {
                  setIsCustomMode(true);
                  setCustomTopic('');
                } else {
                  setIsCustomMode(false);
                  setCustomTopic(e.target.value);
                }
              }}
              className={field}
            >
              <option value="" className="dark:bg-[#1a1a1b]">All Topics (Full Subject / Mixed Syllabus)</option>
              <optgroup label="Official Syllabus Topics" className="dark:bg-[#1a1a1b]">
                {topicSuggestions.map((t) => (
                  <option key={t} value={t} className="dark:bg-[#1a1a1b]">{t}</option>
                ))}
              </optgroup>
              <option value="__custom__" className="dark:bg-[#1a1a1b]">Custom subtopic (type your own)…</option>
            </select>
          ) : (
            <input
              type="text"
              value={customTopic}
              onChange={(e) => setCustomTopic(e.target.value)}
              placeholder="e.g. Percentage, Optics, Constitution"
              className={field}
            />
          )}

          {isCustomMode && (
            <input
              type="text"
              autoFocus
              value={customTopic}
              onChange={(e) => setCustomTopic(e.target.value)}
              placeholder="Type specific subtopic or chapter…"
              className={cn(field, "mt-1.5")}
            />
          )}

          {topicSuggestions.length > 0 && (
            <div className="mt-2">
              <span className="block text-[10px] font-medium uppercase tracking-wider text-slate-400 dark:text-slate-500 mb-1.5">
                Quick topic selection:
              </span>
              <div className="flex flex-wrap gap-1 max-h-36 overflow-y-auto pr-0.5">
                {topicSuggestions.map((suggestion) => {
                  const isSelected = !isCustomMode && customTopic.trim().toLowerCase() === suggestion.toLowerCase();
                  return (
                    <button
                      key={suggestion}
                      type="button"
                      onClick={() => {
                        if (isSelected) {
                          setCustomTopic('');
                          setIsCustomMode(false);
                        } else {
                          setCustomTopic(suggestion);
                          setIsCustomMode(false);
                        }
                      }}
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

        <div className="flex gap-2 mt-1">
          <button
            onClick={handleGenerate}
            disabled={isGenerating}
            className="flex-1 h-9 bg-slate-900 hover:bg-slate-800 text-white dark:bg-[#c8e558] dark:hover:bg-[#bcd94c] dark:text-slate-900 rounded-lg text-[13px] font-semibold flex items-center justify-center gap-1.5 transition-colors cursor-pointer disabled:opacity-60"
          >
            {isGenerating ? (
              <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Generating…</>
            ) : (
              <><Crosshair className="w-3.5 h-3.5" /> Practice test</>
            )}
          </button>
          <button
            type="button"
            onClick={handleReviseWithTutor}
            className="px-3 h-9 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 dark:bg-indigo-950/40 dark:hover:bg-indigo-900/50 dark:text-indigo-300 rounded-lg text-[12px] font-semibold flex items-center justify-center gap-1.5 border border-indigo-200/80 dark:border-indigo-800/50 transition-colors cursor-pointer"
            title="Launch 1-on-1 AI Tutor revision for this topic"
          >
            <BookOpen className="w-3.5 h-3.5 text-indigo-500" />
            <span>AI Tutor</span>
          </button>
        </div>
      </div>
    </div>
  );
}
