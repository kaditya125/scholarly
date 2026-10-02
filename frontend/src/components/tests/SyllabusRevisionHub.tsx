import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Sparkles,
  BookOpen,
  ArrowRight,
  Flame,
  BrainCircuit,
  Compass,
  Cpu,
  Network,
  Database,
  Code2,
  Binary,
  Layers,
  FileCode,
  Calculator,
  ShieldCheck,
  CheckCircle2,
  Timer
} from 'lucide-react';
import { cn } from '../../lib/utils';
import { useLaunchTest } from '../../hooks/ai/useLaunchTest';

interface SyllabusRevisionHubProps {
  selectedExam: string;
}

interface SubjectRevisionItem {
  id: string;
  name: string;
  marks: string;
  yieldLevel: 'Tier-1 High Yield' | 'Tier-2 Core' | 'Conceptual';
  yieldColor: string;
  source: string;
  pyqFrequency: string;
  topics: string[];
  icon: any;
}

const PART_D_SUBJECTS: SubjectRevisionItem[] = [
  {
    id: 'os',
    name: 'Operating Systems',
    marks: '10–12 Marks',
    yieldLevel: 'Tier-1 High Yield',
    yieldColor: 'text-amber-700 bg-amber-50 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800/60',
    source: 'Silberschatz & Galvin / Tanenbaum Modern OS',
    pyqFrequency: 'FCFS/SJF/RR turnaround & waiting time, Deadlock 4 conditions & Banker\'s, Paging address translation & TLB hit ratios.',
    icon: Cpu,
    topics: [
      'CPU Scheduling (FCFS, SJF, Round Robin, Priority)',
      'Deadlocks (Detection, Prevention, Avoidance & Banker Algorithm)',
      'Memory Management (Paging, Page Tables, TLB Hit Ratio)',
      'Virtual Memory & Page Replacement (FIFO, LRU, Optimal)',
      'Process Synchronization & Semaphores (Critical Section)',
      'System Calls, Fork/Exec & Process States',
      'File Systems & Disk Scheduling (SCAN, C-SCAN, SSTF)',
    ],
  },
  {
    id: 'cn',
    name: 'Computer Networks',
    marks: '10–12 Marks',
    yieldLevel: 'Tier-1 High Yield',
    yieldColor: 'text-amber-700 bg-amber-50 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800/60',
    source: 'Kurose & Ross / Andrew Tanenbaum Computer Networks',
    pyqFrequency: 'Subnetting & CIDR slash notation, TCP flow control & 3-way handshake, Distance Vector vs Link State count-to-infinity.',
    icon: Network,
    topics: [
      'IP Addressing, Subnetting & CIDR Block Calculations',
      'OSI Reference Model vs TCP/IP Protocol Architecture',
      'Routing Protocols (OSPF, BGP, RIP & Distance Vector)',
      'TCP 3-Way Handshake, Flow Control & Congestion Control',
      'UDP & Port Numbers (DNS: 53, DHCP: 67/68, HTTP: 80)',
      'Data Link Layer Framing, CRC Error Detection & CSMA/CD',
      'Network Layer Protocols (ARP, RARP, ICMP, IPv4/IPv6)',
    ],
  },
  {
    id: 'dbms',
    name: 'Databases & SQL',
    marks: '10–12 Marks',
    yieldLevel: 'Tier-1 High Yield',
    yieldColor: 'text-amber-700 bg-amber-50 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800/60',
    source: 'Elmasri & Navathe / Korth & Silberschatz Database Concepts',
    pyqFrequency: 'Candidate key finding from FDs, 1NF/2NF/3NF/BCNF classification, SQL GROUP BY/HAVING & ACID isolation anomalies.',
    icon: Database,
    topics: [
      'Database Normalization (1NF, 2NF, 3NF, BCNF & Keys)',
      'SQL Queries, Joins, Aggregations & Subqueries',
      'Transactions & ACID Properties (Dirty Read, Phantom Read)',
      'Concurrency Control, Serializability & 2-Phase Locking',
      'ER Modeling, Entities, Attributes & Cardinality',
      'Relational Algebra (Select, Project, Join, Division)',
      'Indexing, B-Trees & B+ Tree Height/Order Calculations',
    ],
  },
  {
    id: 'ds_c',
    name: 'Programming & Data Structures',
    marks: '10–12 Marks',
    yieldLevel: 'Tier-1 High Yield',
    yieldColor: 'text-amber-700 bg-amber-50 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800/60',
    source: 'Kernighan & Ritchie (C) / Horowitz & Sahni Data Structures',
    pyqFrequency: 'C pointer arithmetic, recursion stack output, BST preorder/inorder reconstruction, min/max heap insertions.',
    icon: Code2,
    topics: [
      'C Pointers, Double Pointers & Dynamic Allocation (malloc/free)',
      'Recursion, Stack Execution Frames & Storage Classes',
      'Binary Trees, BST Insert/Delete & Inorder/Preorder Traversals',
      'Heaps, Priority Queues & Heap Sort (Build Heap O(n))',
      'Linear Data Structures (Arrays, Linked Lists, Stacks, Queues)',
      'Graph Representations (Adjacency Matrix & List, BFS, DFS)',
      'Hashing, Hash Tables & Collision Resolution (Chaining, Probing)',
    ],
  },
  {
    id: 'algo',
    name: 'Algorithms & Complexity',
    marks: '8–10 Marks',
    yieldLevel: 'Tier-2 Core',
    yieldColor: 'text-blue-700 bg-blue-50 border-blue-200 dark:bg-blue-950/40 dark:text-blue-300 dark:border-blue-800/60',
    source: 'Cormen, Leiserson, Rivest, Stein (CLRS)',
    pyqFrequency: 'Master Theorem for divide & conquer recurrences, QuickSort best/worst case, Dijkstra vs Bellman-Ford negative edge rules.',
    icon: Binary,
    topics: [
      'Asymptotic Notations (Big-O, Omega, Theta) & Master Theorem',
      'Sorting Algorithms (Quick, Merge, Heap) & Comparisons Lower Bound',
      'Dynamic Programming (0/1 Knapsack, LCS, Matrix Chain)',
      'Greedy Algorithms (Huffman Coding, Fractional Knapsack)',
      'Graph Algorithms (Dijkstra, Bellman-Ford, Kruskal, Prim)',
      'Searching Algorithms (Binary Search, Divide & Conquer)',
    ],
  },
  {
    id: 'coa',
    name: 'Computer Organization & Architecture',
    marks: '8–10 Marks',
    yieldLevel: 'Tier-2 Core',
    yieldColor: 'text-blue-700 bg-blue-50 border-blue-200 dark:bg-blue-950/40 dark:text-blue-300 dark:border-blue-800/60',
    source: 'Patterson & Hennessy / William Stallings Computer Architecture',
    pyqFrequency: 'Pipeline speedup & hazard stall cycles, Direct/Set-associative cache tag/index bits, 2\'s complement range overflow.',
    icon: Layers,
    topics: [
      'CPU Pipelining, Hazards (Data, Control, Structural) & Speedup',
      'Cache Memory Mapping (Direct, Associative, 2/4-Way Set-Associative)',
      'Addressing Modes (Immediate, Direct, Indirect, Indexed, Relative)',
      'ALU, Computer Arithmetic, 2\'s Complement & Booth Algorithm',
      'Memory Hierarchy & Main Memory Interfacing',
      'I/O Organization, Interrupts & Direct Memory Access (DMA)',
    ],
  },
  {
    id: 'digital',
    name: 'Digital Logic',
    marks: '8–10 Marks',
    yieldLevel: 'Tier-2 Core',
    yieldColor: 'text-blue-700 bg-blue-50 border-blue-200 dark:bg-blue-950/40 dark:text-blue-300 dark:border-blue-800/60',
    source: 'M. Morris Mano Digital Logic & Computer Design',
    pyqFrequency: 'K-Map minimization with don\'t care, Multiplexer implementation of boolean functions, Flip-flop excitation tables & counter mod.',
    icon: FileCode,
    topics: [
      'Boolean Algebra, De Morgan\'s Laws & Logic Gate Simplification',
      'K-Maps (2, 3, 4 Variable) & Don\'t Care Conditions',
      'Combinational Circuits (Adders, Subtractors, Multiplexers, Decoders)',
      'Sequential Circuits & Flip-Flops (SR, JK, D, T Characteristic Eq)',
      'Synchronous & Asynchronous Modulo Counters, Shift Registers',
      'Number System Conversions & IEEE 754 Floating Point Representation',
    ],
  },
  {
    id: 'toc',
    name: 'Theory of Computation',
    marks: '6–8 Marks',
    yieldLevel: 'Conceptual',
    yieldColor: 'text-emerald-700 bg-emerald-50 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800/60',
    source: 'Hopcroft, Motwani & Ullman Automata Theory',
    pyqFrequency: 'Minimum states in DFA for specific bit patterns, regular vs context-free closure properties, Decidability of halting problem.',
    icon: Binary,
    topics: [
      'DFA / NFA Construction, Minimal States & Equivalence',
      'Regular Expressions, Regular Languages & Pumping Lemma',
      'Context-Free Grammars (CFG), Ambiguity & Pushdown Automata (PDA)',
      'Turing Machines & Chomsky Hierarchy of Languages',
      'Decidability, Undecidability & Halting Problem Theorems',
    ],
  },
  {
    id: 'compiler',
    name: 'Compiler Design',
    marks: '6–8 Marks',
    yieldLevel: 'Conceptual',
    yieldColor: 'text-emerald-700 bg-emerald-50 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800/60',
    source: 'Aho, Lam, Sethi & Ullman (Compilers Dragon Book)',
    pyqFrequency: 'First and Follow sets computation, LL(1) parsing table conflicts, 3-address code quadruples & DAG optimization.',
    icon: Code2,
    topics: [
      'Lexical Analysis, Tokenization & Regular Expressions in Compilers',
      'Syntax Analysis: First & Follow Sets, LL(1) Parser Conflicts',
      'Bottom-Up Parsers: LR(0), SLR(1), LALR(1), CLR(1) Parsing',
      'Syntax-Directed Translation (SDT), S-Attributed vs L-Attributed',
      'Intermediate Code Generation (Three-Address Code, Quadruples)',
      'Code Optimization: Basic Blocks, Control Flow Graphs & Loop Unrolling',
    ],
  },
  {
    id: 'math',
    name: 'Engineering Mathematics',
    marks: '10–12 Marks',
    yieldLevel: 'Tier-1 High Yield',
    yieldColor: 'text-amber-700 bg-amber-50 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800/60',
    source: 'Kenneth Rosen Discrete Mathematics / Erwin Kreyszig Adv Engg Math',
    pyqFrequency: 'Matrix eigenvalues & determinants, Bayes theorem conditional probability, Propositional logic equivalence, Graph Euler/Hamiltonian.',
    icon: Calculator,
    topics: [
      'Linear Algebra: Matrices, Determinants, Systems of Equations & Eigenvalues',
      'Discrete Mathematics: Relations (Equivalence, Partial Order) & Lattices',
      'Mathematical Logic: Propositional & First-Order Predicate Logic',
      'Probability: Conditional Probability, Bayes Theorem & Distributions',
      'Graph Theory: Trees, Cycles, Planar Graphs & Handshaking Lemma',
      'Calculus: Limits, Continuity, Maxima/Minima & Definite Integrals',
    ],
  },
];

const REASONING_SUBJECT: SubjectRevisionItem = {
  id: 'reasoning',
  name: 'General Intelligence & Reasoning (Paper-I)',
  marks: '50 Marks · 50 Qs',
  yieldLevel: 'Tier-1 High Yield',
  yieldColor: 'text-amber-700 bg-amber-50 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800/60',
  source: 'S. Chand (R.S. Aggarwal) & Rakesh Yadav Reasoning Corpus',
  pyqFrequency: 'Analogies (10 Qs), Syllogisms Venn deduction (4-5 Qs), Missing Number & Series (6-8 Qs), Coding-Decoding (5 Qs), Blood Relations (3-4 Qs).',
  icon: BrainCircuit,
  topics: [
    'Analogies & Similarities (Semantic, Symbolic & Number)',
    'Classification & Odd-One-Out (Letter, Word, Number Patterns)',
    'Number & Alphabet Series (Arithmetic, Geometric, Interleaved)',
    'Coding & Decoding (Letter Shifting, Substitution, Matrix)',
    'Blood Relations & Family Tree (Direct & Coded Relations)',
    'Syllogisms & Deductive Logic (Statements, Assumptions, Venn Conclusions)',
    'Direction Sense & Spatial Orientation (Cardinal Angles & Displacement)',
    'Arithmetical Reasoning & Mathematical Operators Interchange',
    'Puzzles & Seating Arrangements (Linear, Circular, Floor, Ranking)',
    'Venn Diagrams & Set Relations (Intersecting Geometric Classes)',
    'Alphabet & Word Formation (Matrix & Dictionary Ordering)',
  ],
};

const GA_SUBJECT: SubjectRevisionItem = {
  id: 'ga',
  name: 'General Awareness & Scientific Aspects (Paper-I)',
  marks: '50 Marks · 50 Qs',
  yieldLevel: 'Tier-1 High Yield',
  yieldColor: 'text-amber-700 bg-amber-50 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800/60',
  source: 'Lucent\'s General Knowledge & NCERT Everyday Science',
  pyqFrequency: 'Everyday Science (18–20 Qs · Physics, Chem, Bio, Space research), Indian Constitution & Polity (8–10 Qs), Geography & Climate (6–8 Qs), History & Freedom Struggle (6–8 Qs).',
  icon: Compass,
  topics: [
    'Everyday Science & Scientific Aspects (Physics, Chemistry, Biology)',
    'General Polity & Constitution of India (Articles, Amendments, Rights)',
    'Indian History & National Freedom Struggle (Ancient, Medieval, Modern)',
    'Geography & Environment of India (Rivers, Climate, Soil, Ecology)',
    'Economic Scene, Financial Policy & Annual Union Budget',
    'Current Events (National & International Affairs, Summits, Awards)',
    'Scientific Research & Space Technology (ISRO, DRDO, IMD Missions)',
    'Static GK, Indian Heritage, Culture, Books & Notable Authors',
  ],
};

export function SyllabusRevisionHub({ selectedExam }: SyllabusRevisionHubProps) {
  const navigate = useNavigate();
  const launch = useLaunchTest();
  const [activeSection, setActiveSection] = useState<'cs' | 'reasoning' | 'ga'>('cs');
  const [selectedSubjectId, setSelectedSubjectId] = useState<string>(PART_D_SUBJECTS[0].id);

  const isRelevantExam =
    selectedExam === 'SSC IMD' ||
    selectedExam === 'SSC JE' ||
    selectedExam?.toLowerCase().includes('imd') ||
    selectedExam?.toLowerCase().includes('scientific assistant') ||
    selectedExam?.toLowerCase().includes('je');

  if (!isRelevantExam) return null;

  const currentSubjectList =
    activeSection === 'cs'
      ? PART_D_SUBJECTS
      : activeSection === 'reasoning'
      ? [REASONING_SUBJECT]
      : [GA_SUBJECT];

  const currentSubject =
    currentSubjectList.find((s) => s.id === selectedSubjectId) || currentSubjectList[0];

  const handleLaunchTutor = (subjectName: string, topicName?: string) => {
    const focusTopic = topicName ? topicName : subjectName;
    const promptText = `Target Exam: SSC Scientific Assistant in IMD / SSC JE CS & IT (CBT Exam Window: Nov 2 - Nov 6).
Subject: ${subjectName}
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
      topic: `${subjectName} - ${focusTopic}`,
      prompt: promptText,
    });

    navigate(`/chat?${params.toString()}`);
  };

  const handlePracticeSubject = (subjectName: string, topicName?: string) => {
    launch({
      topic: topicName ? `${subjectName} - ${topicName}` : subjectName,
      subject: subjectName,
      count: 10,
      mode: 'exam',
      examId: 'SSC_IMD_CS',
    });
  };

  return (
    <div className="rounded-2xl border border-slate-200/90 dark:border-white/[0.08] bg-white dark:bg-white/[0.02] p-5 shadow-xs overflow-hidden">
      {/* Header Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-100 dark:border-white/[0.06]">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300 border border-rose-200/60 dark:border-rose-800/50">
              <Flame className="w-3 h-3 text-rose-500 animate-pulse" />
              CBT Window: Nov 2 – Nov 6 (30 Days Left)
            </span>
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10.5px] font-medium bg-indigo-50 text-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-300 border border-indigo-200/60 dark:border-indigo-800/50">
              <Sparkles className="w-3 h-3 text-indigo-500" />
              Authentic Syllabus Tutor
            </span>
          </div>
          <h2 className="text-[17px] font-bold text-slate-900 dark:text-white tracking-tight">
            High-Yield Syllabus Revision & 1-on-1 AI Tutor Hub
          </h2>
          <p className="text-[12.5px] text-slate-500 dark:text-slate-400 mt-0.5">
            PYQ pattern-analyzed crash revision grounded in Galvin, Tanenbaum, Korth, Cormen, Lucent & S. Chand.
          </p>
        </div>

        {/* Section Navigation Pills */}
        <div className="flex items-center gap-1.5 p-1 rounded-xl bg-slate-100/80 dark:bg-white/[0.04] border border-slate-200/70 dark:border-white/[0.06] shrink-0 self-start sm:self-auto">
          <button
            type="button"
            onClick={() => {
              setActiveSection('cs');
              setSelectedSubjectId(PART_D_SUBJECTS[0].id);
            }}
            className={cn(
              "px-3 py-1.5 rounded-lg text-[12px] font-semibold transition-all cursor-pointer",
              activeSection === 'cs'
                ? "bg-white dark:bg-white/10 text-slate-900 dark:text-white shadow-2xs"
                : "text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
            )}
          >
            Part-D: CS & IT (100M)
          </button>
          <button
            type="button"
            onClick={() => {
              setActiveSection('reasoning');
              setSelectedSubjectId(REASONING_SUBJECT.id);
            }}
            className={cn(
              "px-3 py-1.5 rounded-lg text-[12px] font-semibold transition-all cursor-pointer",
              activeSection === 'reasoning'
                ? "bg-white dark:bg-white/10 text-slate-900 dark:text-white shadow-2xs"
                : "text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
            )}
          >
            Reasoning (50M)
          </button>
          <button
            type="button"
            onClick={() => {
              setActiveSection('ga');
              setSelectedSubjectId(GA_SUBJECT.id);
            }}
            className={cn(
              "px-3 py-1.5 rounded-lg text-[12px] font-semibold transition-all cursor-pointer",
              activeSection === 'ga'
                ? "bg-white dark:bg-white/10 text-slate-900 dark:text-white shadow-2xs"
                : "text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
            )}
          >
            General Awareness (50M)
          </button>
        </div>
      </div>

      {/* Main Body: Subject Picker Sidebar + Revision Detail Panel */}
      <div className="mt-4 grid grid-cols-1 lg:grid-cols-[260px_minmax(0,1fr)] gap-4 items-start">
        {/* Subject Navigation Menu */}
        <div className="space-y-1 max-h-[360px] overflow-y-auto pr-1">
          {currentSubjectList.map((subj) => {
            const Icon = subj.icon;
            const isSelected = subj.id === currentSubject.id;
            return (
              <button
                key={subj.id}
                type="button"
                onClick={() => setSelectedSubjectId(subj.id)}
                className={cn(
                  "w-full text-left px-3 py-2 rounded-xl transition-all flex items-center justify-between gap-2 border cursor-pointer",
                  isSelected
                    ? "bg-slate-900 text-white dark:bg-[#c8e558] dark:text-slate-900 border-transparent shadow-xs"
                    : "bg-slate-50/70 dark:bg-white/[0.02] border-slate-200/60 dark:border-white/[0.06] text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-white/[0.05]"
                )}
              >
                <div className="flex items-center gap-2 min-w-0">
                  <Icon className={cn("w-4 h-4 shrink-0", isSelected ? "text-[#c8e558] dark:text-slate-900" : "text-slate-400")} />
                  <span className="text-[12.5px] font-semibold truncate leading-tight">{subj.name}</span>
                </div>
                <span
                  className={cn(
                    "text-[10px] px-1.5 py-0.5 rounded font-medium shrink-0",
                    isSelected
                      ? "bg-white/20 dark:bg-slate-900/20 text-white dark:text-slate-900"
                      : "bg-slate-200/60 dark:bg-white/[0.06] text-slate-600 dark:text-slate-400"
                  )}
                >
                  {subj.marks}
                </span>
              </button>
            );
          })}
        </div>

        {/* Selected Subject Active Card */}
        <div className="rounded-xl border border-slate-200/80 dark:border-white/[0.07] bg-slate-50/50 dark:bg-white/[0.015] p-4 flex flex-col justify-between">
          <div>
            {/* Header badges */}
            <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
              <div className="flex items-center gap-2">
                <span className={cn("text-[11px] font-semibold px-2.5 py-0.5 rounded-full border", currentSubject.yieldColor)}>
                  {currentSubject.yieldLevel}
                </span>
                <span className="text-[12px] font-bold text-slate-900 dark:text-white">
                  Weightage: {currentSubject.marks}
                </span>
              </div>
              <span className="text-[11px] text-slate-400 dark:text-slate-500 font-mono">
                {currentSubject.source}
              </span>
            </div>

            {/* PYQ Pattern insight */}
            <div className="mb-3.5 p-2.5 rounded-lg bg-indigo-50/60 dark:bg-indigo-950/20 border border-indigo-100 dark:border-indigo-900/30 text-[12px] text-indigo-900 dark:text-indigo-200">
              <div className="flex items-center gap-1.5 font-semibold text-[11px] text-indigo-700 dark:text-indigo-400 uppercase tracking-wider mb-1">
                <ShieldCheck className="w-3.5 h-3.5" />
                Official PYQ Frequency & Pattern Analysis:
              </div>
              <p className="leading-relaxed">{currentSubject.pyqFrequency}</p>
            </div>

            {/* Syllabus Topics Tray */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  Official Syllabus Subtopics · Click to Revise 1-on-1:
                </span>
                <span className="text-[10.5px] text-slate-400 dark:text-slate-500">
                  {currentSubject.topics.length} topics
                </span>
              </div>

              <div className="flex flex-wrap gap-1.5 max-h-40 overflow-y-auto pr-1">
                {currentSubject.topics.map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => handleLaunchTutor(currentSubject.name, t)}
                    className="px-2.5 py-1 rounded-lg text-[11.5px] font-medium bg-white dark:bg-white/[0.04] border border-slate-200/80 dark:border-white/[0.08] text-slate-700 dark:text-slate-300 hover:border-indigo-400 hover:text-indigo-600 dark:hover:border-indigo-500 dark:hover:text-indigo-300 transition-colors cursor-pointer text-left flex items-center gap-1.5 group"
                    title={`Launch 1-on-1 AI Tutor for ${t}`}
                  >
                    <BookOpen className="w-3 h-3 text-slate-400 group-hover:text-indigo-500 shrink-0" />
                    <span>{t}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Action CTAs */}
          <div className="mt-4 pt-3.5 border-t border-slate-200/70 dark:border-white/[0.06] flex flex-wrap items-center justify-between gap-2.5">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => handleLaunchTutor(currentSubject.name)}
                className="px-3.5 py-2 rounded-lg text-[12.5px] font-semibold bg-indigo-600 hover:bg-indigo-700 text-white shadow-2xs flex items-center gap-1.5 transition-colors cursor-pointer"
              >
                <Sparkles className="w-3.5 h-3.5 text-indigo-200" />
                Revise Full Subject with AI Tutor
              </button>
              <button
                type="button"
                onClick={() => handlePracticeSubject(currentSubject.name)}
                className="px-3.5 py-2 rounded-lg text-[12.5px] font-semibold bg-white dark:bg-white/[0.04] border border-slate-200 dark:border-white/[0.08] text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-white/[0.08] flex items-center gap-1.5 transition-colors cursor-pointer"
              >
                <Timer className="w-3.5 h-3.5 text-slate-400" />
                Practice Topic Test
              </button>
            </div>

            <span className="text-[11px] text-slate-400 dark:text-slate-500 italic">
              1-on-1 Socratic tutor grounded in authentic exam papers
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
