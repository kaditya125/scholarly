/**
 * examPersonalization.ts - Single source of truth for per-exam UI personalisation.
 * Consumed by: ExamSelector, CategoryGrid, AdaptiveTestGenerator, AIRecommendedTests.
 */
export type ExamGroup = 'ssc'|'upsc'|'banking'|'railway'|'medical'|'engineering'|'state-psc'|'teaching'|'school'|'other';
export interface CategoryConfig {
  label: string; count: string; countNum: number; topic: string;
  icon: 'mocks'|'subject'|'chapter'|'pyq'|'daily'|'speed';
}
export interface SubjectOption { value: string; label: string; }
export interface FallbackRecommendation { title: string; topic: string; reason: string; type: string; count: number; }
export interface ExamPersonalization {
  displayName: string; examId: string; group: ExamGroup; siblings: string[];
  subjectOptions: SubjectOption[]; categories: CategoryConfig[];
  fallbackRecommendations: FallbackRecommendation[]; tagline: string;
}

export const EXAM_CATALOG: Record<string, ExamPersonalization> = {
  "SSC CGL": {
    "displayName": "SSC CGL",
    "examId": "SSC_CGL",
    "group": "ssc",
    "tagline": "SSC CGL Tier 1",
    "siblings": [
      "SSC CGL",
      "SSC IMD",
      "SSC JE",
      "SSC CHSL",
      "SSC MTS",
      "SSC GD",
      "SSC CPO",
      "SSC Steno"
    ],
    "subjectOptions": [
      {
        "value": "Quantitative Aptitude",
        "label": "Quantitative Aptitude"
      },
      {
        "value": "General Intelligence & Reasoning",
        "label": "General Intelligence & Reasoning"
      },
      {
        "value": "English Comprehension",
        "label": "English Comprehension"
      },
      {
        "value": "General Awareness",
        "label": "General Awareness"
      }
    ],
    "categories": [
      {
        "label": "Full Mocks (100 Qs)",
        "count": "60 Min · 200 Marks",
        "countNum": 100,
        "topic": "SSC CGL Tier 1 Full Mock",
        "icon": "mocks"
      },
      {
        "label": "Quantitative Aptitude",
        "count": "25 Qs · Speed Drill",
        "countNum": 25,
        "topic": "Quantitative Aptitude",
        "icon": "subject"
      },
      {
        "label": "Reasoning & Logic",
        "count": "Patterns & Puzzles",
        "countNum": 25,
        "topic": "General Intelligence & Reasoning",
        "icon": "subject"
      },
      {
        "label": "English Comprehension",
        "count": "Vocab & Grammar",
        "countNum": 25,
        "topic": "English Comprehension",
        "icon": "subject"
      },
      {
        "label": "General Awareness",
        "count": "GK & Current Affairs",
        "countNum": 25,
        "topic": "General Awareness",
        "icon": "subject"
      },
      {
        "label": "Previous Year Papers",
        "count": "2020–2024 PYQs",
        "countNum": 100,
        "topic": "SSC CGL Previous Year Questions",
        "icon": "pyq"
      }
    ],
    "fallbackRecommendations": [
      {
        "title": "Quantitative Aptitude Speed Drill",
        "topic": "Quantitative Aptitude",
        "reason": "High-frequency Percentage, Profit & Loss, and Time-Work questions calibrated to SSC CGL Tier 1 pattern.",
        "type": "Speed Drill",
        "count": 25
      },
      {
        "title": "Reasoning Patterns Booster",
        "topic": "General Intelligence & Reasoning",
        "reason": "Syllogisms, Number Series, and Odd One Out — the highest-scoring section in SSC CGL.",
        "type": "Concept Focus",
        "count": 25
      }
    ]
  },
  "SSC IMD": {
    "displayName": "SSC IMD (Scientific Assistant)",
    "examId": "SSC_IMD_CS",
    "group": "ssc",
    "tagline": "SSC Scientific Assistant in IMD — CS & IT (Paper-I + Part-D)",
    "siblings": [
      "SSC CGL",
      "SSC IMD",
      "SSC JE",
      "SSC CHSL",
      "SSC MTS",
      "SSC GD",
      "SSC CPO",
      "SSC Steno"
    ],
    "subjectOptions": [
      {
        "value": "Computer Science and Information Technology",
        "label": "All Part-D: Computer Science & IT (Full Section)"
      },
      {
        "value": "Operating System",
        "label": "Operating System (System Calls, Scheduling, Memory, Concurrency, Deadlocks)"
      },
      {
        "value": "Computer Networks",
        "label": "Computer Networks (OSI/TCP-IP, Routing, IP/CIDR, Sockets, Protocols)"
      },
      {
        "value": "Databases",
        "label": "Databases (ER-Model, Relational Algebra, SQL, Normal Forms, Transactions)"
      },
      {
        "value": "Programming and Data Structures",
        "label": "Programming & Data Structures (C Language, Trees, Heaps, Graphs, Recursion)"
      },
      {
        "value": "Algorithms",
        "label": "Algorithms (Searching, Sorting, Complexity, Greedy, Dynamic Programming, Graphs)"
      },
      {
        "value": "Computer Organization and Architecture",
        "label": "Computer Organization & Architecture (ALU, Pipelining, Hazards, Cache, Memory)"
      },
      {
        "value": "Digital Logic",
        "label": "Digital Logic (Boolean Algebra, Combinational/Sequential Circuits, Minimization)"
      },
      {
        "value": "Theory of Computation",
        "label": "Theory of Computation (Automata, Regular Languages, CFG, Pumping Lemma, Turing)"
      },
      {
        "value": "Compiler Design",
        "label": "Compiler Design (Lexical Analysis, Parsing, SDT, Intermediate Code, Optimization)"
      },
      {
        "value": "Engineering Mathematics",
        "label": "Engineering Mathematics (Discrete Math, Linear Algebra, Calculus, Probability)"
      },
      {
        "value": "General Intelligence & Reasoning",
        "label": "Paper-I: General Intelligence & Reasoning (50 Marks · Verbal/Non-Verbal)"
      },
      {
        "value": "General Awareness",
        "label": "Paper-I: General Awareness & Scientific Aspects (50 Marks · Science & Polity)"
      }
    ],
    "categories": [
      {
        "label": "Full 200-Q CBT Paper",
        "count": "120 Min · 200 Marks",
        "countNum": 200,
        "topic": "SSC IMD 2022 Official CBT Paper (200 Questions)",
        "icon": "mocks"
      },
      {
        "label": "Part-D Technical CS (100 Qs)",
        "count": "60 Min · 100 Marks",
        "countNum": 100,
        "topic": "SSC Scientific Assistant Part-D: 100-Question CS & IT CBT Paper",
        "icon": "mocks"
      },
      {
        "label": "Paper-I Non-Tech (100 Qs)",
        "count": "60 Min · 100 Marks",
        "countNum": 100,
        "topic": "SSC Scientific Assistant Paper-I: 100-Question Non-Tech CBT Paper",
        "icon": "mocks"
      },
      {
        "label": "Operating Systems Drill",
        "count": "25 Qs · Concurrency & Deadlocks",
        "countNum": 25,
        "topic": "Operating System",
        "icon": "subject"
      },
      {
        "label": "Computer Networks Drill",
        "count": "25 Qs · TCP/IP & Protocols",
        "countNum": 25,
        "topic": "Computer Networks",
        "icon": "subject"
      },
      {
        "label": "Databases & SQL Drill",
        "count": "25 Qs · Queries & Normal Forms",
        "countNum": 25,
        "topic": "Databases",
        "icon": "subject"
      },
      {
        "label": "Data Structures & C",
        "count": "25 Qs · Trees, Graphs & Heaps",
        "countNum": 25,
        "topic": "Programming and Data Structures",
        "icon": "subject"
      },
      {
        "label": "Algorithms & Complexity",
        "count": "25 Qs · Sorting, DP & Graphs",
        "countNum": 25,
        "topic": "Algorithms",
        "icon": "subject"
      },
      {
        "label": "COA & Digital Logic",
        "count": "25 Qs · Pipelining & Circuits",
        "countNum": 25,
        "topic": "Computer Organization and Architecture",
        "icon": "subject"
      },
      {
        "label": "TOC & Compiler Design",
        "count": "25 Qs · Automata & Parsing",
        "countNum": 25,
        "topic": "Theory of Computation",
        "icon": "subject"
      },
      {
        "label": "Engineering Mathematics",
        "count": "25 Qs · Discrete Math & Linear Algebra",
        "countNum": 25,
        "topic": "Engineering Mathematics",
        "icon": "subject"
      },
      {
        "label": "General Intelligence",
        "count": "50 Qs · 50 Marks Speed Sprint",
        "countNum": 50,
        "topic": "General Intelligence & Reasoning",
        "icon": "speed"
      },
      {
        "label": "Analogies & Similarities",
        "count": "30 Qs · S. Chand & Rakesh Yadav",
        "countNum": 30,
        "topic": "Analogy & Similarities",
        "icon": "subject"
      },
      {
        "label": "Syllogisms & Logic",
        "count": "30 Qs · Deductive Reasoning",
        "countNum": 30,
        "topic": "Syllogism & Deductive Logic",
        "icon": "subject"
      },
      {
        "label": "Series & Number Patterns",
        "count": "30 Qs · Progression & Logic",
        "countNum": 30,
        "topic": "Number & Alphabet Series",
        "icon": "speed"
      },
      {
        "label": "Coding-Decoding Drill",
        "count": "30 Qs · Substitution & Shifting",
        "countNum": 30,
        "topic": "Coding-Decoding",
        "icon": "subject"
      },
      {
        "label": "General Awareness & Science",
        "count": "50 Qs · 50 Marks Everyday Science",
        "countNum": 50,
        "topic": "General Awareness",
        "icon": "subject"
      },
      {
        "label": "2017 Official CBT Paper",
        "count": "Official 200-Q CBT Shift",
        "countNum": 200,
        "topic": "SSC IMD 2017 Official CBT Paper (200 Questions)",
        "icon": "pyq"
      }
    ],
    "fallbackRecommendations": [
      {
        "title": "Operating Systems: Concurrency, Deadlocks & Virtual Memory",
        "topic": "Operating System",
        "reason": "14.3.4 Part-D: System calls, processes, threads, IPC, semaphore/mutex, deadlocks and paging.",
        "type": "High Yield Drill",
        "count": 25
      },
      {
        "title": "Computer Networks: IP Addressing, TCP/UDP & Routing Protocols",
        "topic": "Computer Networks",
        "reason": "14.3.4 Part-D: CIDR, IPv4 fragmentation, distance vector, link state and sockets.",
        "type": "Concept Mastery",
        "count": 25
      },
      {
        "title": "Databases: SQL Queries, Normal Forms & Concurrency Control",
        "topic": "Databases",
        "reason": "14.3.4 Part-D: Relational algebra, B/B+ trees, 1NF to BCNF, ACID transactions.",
        "type": "High Yield Drill",
        "count": 25
      },
      {
        "title": "Programming & Data Structures: Trees, Heaps & Recursion in C",
        "topic": "Programming and Data Structures",
        "reason": "14.3.4 Part-D: C pointers, recursion, BST, binary heaps and graph representations.",
        "type": "Speed Sprint",
        "count": 25
      },
      {
        "title": "Algorithms: Greedy, Dynamic Programming & Graph Traversals",
        "topic": "Algorithms",
        "reason": "14.3.4 Part-D: Asymptotic complexity, shortest paths, MST, divide-and-conquer.",
        "type": "Concept Mastery",
        "count": 25
      },
      {
        "title": "Computer Architecture: Cache, Pipelining & Hazards",
        "topic": "Computer Organization and Architecture",
        "reason": "14.3.4 Part-D: Structural/data/control hazards, cache mapping and DMA I/O.",
        "type": "Core Architecture",
        "count": 20
      },
      {
        "title": "Theory of Computation: Automata, Grammars & Decidability",
        "topic": "Theory of Computation",
        "reason": "14.3.4 Part-D: DFA/NFA minimization, regular expressions, CFG, PDA and Turing machines.",
        "type": "Theory Mastery",
        "count": 20
      },
      {
        "title": "Compiler Design: Lexical Analysis, Parsing & Optimization",
        "topic": "Compiler Design",
        "reason": "14.3.4 Part-D: Top-down/bottom-up parsing, SDT, liveness analysis, dead code elimination.",
        "type": "High Yield Drill",
        "count": 20
      },
      {
        "title": "Digital Logic: Boolean Minimization & Sequential Circuits",
        "topic": "Digital Logic",
        "reason": "14.3.4 Part-D: K-maps, flip-flops, counters, multiplexers and number representation.",
        "type": "Logic Sprint",
        "count": 20
      },
      {
        "title": "Engineering Mathematics: Discrete Math, Linear Algebra & Probability",
        "topic": "Engineering Mathematics",
        "reason": "14.3.4 Part-D: Propositional logic, recurrence relations, eigenvalues and Bayes theorem.",
        "type": "Math Benchmark",
        "count": 25
      },
      {
        "title": "Paper-I Reasoning: Syllogisms, Series & Spatial Patterns",
        "topic": "General Intelligence & Reasoning",
        "reason": "14.2.1 Paper-I: 50 Marks verbal/non-verbal reasoning speed drill.",
        "type": "Speed Sprint",
        "count": 50
      },
      {
        "title": "Paper-I General Awareness: Scientific Aspects & Current Affairs",
        "topic": "General Awareness",
        "reason": "14.2.2 Paper-I: 50 Marks everyday observations, science research and general polity.",
        "type": "High Yield Drill",
        "count": 50
      }
    ]
  },
  "SSC JE": {
    "displayName": "SSC JE (Junior Engineer)",
    "examId": "SSC_IMD_CS",
    "group": "ssc",
    "tagline": "SSC Junior Engineer & IMD Scientific Assistant — CS & IT / Paper-I",
    "siblings": [
      "SSC CGL",
      "SSC IMD",
      "SSC JE",
      "SSC CHSL",
      "SSC MTS",
      "SSC GD",
      "SSC CPO",
      "SSC Steno"
    ],
    "subjectOptions": [
      {
        "value": "Computer Science and Information Technology",
        "label": "Part-D: Computer Science & IT (100 Marks)"
      },
      {
        "value": "General Intelligence & Reasoning",
        "label": "General Intelligence & Reasoning (50 Marks)"
      },
      {
        "value": "General Awareness",
        "label": "General Awareness & Science (50 Marks)"
      },
      {
        "value": "Operating System",
        "label": "Operating System (System Calls, Scheduling, Memory, Deadlocks)"
      },
      {
        "value": "Computer Networks",
        "label": "Computer Networks (OSI/TCP-IP, Routing, Sockets, Protocols)"
      },
      {
        "value": "Databases",
        "label": "Databases (ER-Model, Relational Algebra, SQL, Normal Forms)"
      },
      {
        "value": "Programming and Data Structures",
        "label": "Programming & Data Structures (C Language, Trees, Heaps, Graphs)"
      },
      {
        "value": "Algorithms",
        "label": "Algorithms (Searching, Sorting, Complexity, Greedy, DP)"
      },
      {
        "value": "Computer Organization and Architecture",
        "label": "Computer Organization & Architecture (ALU, Pipelining, Cache)"
      },
      {
        "value": "Digital Logic",
        "label": "Digital Logic (Boolean Algebra, Circuits, Minimization)"
      },
      {
        "value": "Engineering Mathematics",
        "label": "Engineering Mathematics (Discrete Math, Linear Algebra, Probability)"
      }
    ],
    "categories": [
      {
        "label": "Full 200-Q CBT Paper",
        "count": "120 Min · 200 Marks",
        "countNum": 200,
        "topic": "SSC IMD 2022 Official CBT Paper (200 Questions)",
        "icon": "mocks"
      },
      {
        "label": "Part-D Technical CS (100 Qs)",
        "count": "60 Min · 100 Marks",
        "countNum": 100,
        "topic": "SSC Scientific Assistant Part-D: 100-Question CS & IT CBT Paper",
        "icon": "mocks"
      },
      {
        "label": "Paper-I Non-Tech (100 Qs)",
        "count": "60 Min · 100 Marks",
        "countNum": 100,
        "topic": "SSC Scientific Assistant Paper-I: 100-Question Non-Tech CBT Paper",
        "icon": "mocks"
      },
      {
        "label": "Reasoning Drill",
        "count": "50 Qs · 50 Marks",
        "countNum": 50,
        "topic": "General Intelligence & Reasoning",
        "icon": "subject"
      },
      {
        "label": "General Awareness Drill",
        "count": "50 Qs · 50 Marks",
        "countNum": 50,
        "topic": "General Awareness",
        "icon": "subject"
      },
      {
        "label": "Previous Year Papers",
        "count": "Official 200-Q CBT Pattern",
        "countNum": 200,
        "topic": "SSC IMD 2017 Official CBT Paper (200 Questions)",
        "icon": "pyq"
      }
    ],
    "fallbackRecommendations": [
      {
        "title": "General Intelligence & Reasoning Master Drill",
        "topic": "General Intelligence & Reasoning",
        "reason": "50 marks in Paper-I determines qualification threshold.",
        "type": "Speed Drill",
        "count": 50
      },
      {
        "title": "Part-D Computer Science & IT Full Technical Drill",
        "topic": "Computer Science and Information Technology",
        "reason": "100 marks technical section under Syllabus 14.3.4 Part-D.",
        "type": "Technical Core",
        "count": 25
      }
    ]
  },
  "SSC CHSL": {
    "displayName": "SSC CHSL",
    "examId": "SSC_CHSL",
    "group": "ssc",
    "tagline": "SSC CHSL Tier 1",
    "siblings": [
      "SSC CGL",
      "SSC IMD",
      "SSC JE",
      "SSC CHSL",
      "SSC MTS",
      "SSC GD",
      "SSC CPO",
      "SSC Steno"
    ],
    "subjectOptions": [
      {
        "value": "Quantitative Aptitude",
        "label": "Quantitative Aptitude"
      },
      {
        "value": "General Intelligence & Reasoning",
        "label": "General Intelligence & Reasoning"
      },
      {
        "value": "English Language",
        "label": "English Language"
      },
      {
        "value": "General Awareness",
        "label": "General Awareness"
      }
    ],
    "categories": [
      {
        "label": "Full Mocks (100 Qs)",
        "count": "60 Min · 200 Marks",
        "countNum": 100,
        "topic": "SSC CHSL Tier 1 Full Mock",
        "icon": "mocks"
      },
      {
        "label": "Quantitative Aptitude",
        "count": "25 Qs · Speed Drill",
        "countNum": 25,
        "topic": "Quantitative Aptitude",
        "icon": "subject"
      },
      {
        "label": "Reasoning & Logic",
        "count": "Patterns & Puzzles",
        "countNum": 25,
        "topic": "General Intelligence & Reasoning",
        "icon": "subject"
      },
      {
        "label": "English Language",
        "count": "Grammar & Comprehension",
        "countNum": 25,
        "topic": "English Language",
        "icon": "subject"
      },
      {
        "label": "General Awareness",
        "count": "GK & Current Affairs",
        "countNum": 25,
        "topic": "General Awareness",
        "icon": "subject"
      },
      {
        "label": "Previous Year Papers",
        "count": "2020–2024 PYQs",
        "countNum": 100,
        "topic": "SSC CHSL Previous Year Questions",
        "icon": "pyq"
      }
    ],
    "fallbackRecommendations": [
      {
        "title": "CHSL Quant Rapid Fire",
        "topic": "Quantitative Aptitude",
        "reason": "SSC CHSL Tier 1 Quant focuses on basic arithmetic — build speed and accuracy.",
        "type": "Speed Drill",
        "count": 25
      },
      {
        "title": "English Language Fundamentals",
        "topic": "English Language",
        "reason": "Spot the Error, Fill in the Blanks, and One Word Substitution — CHSL staples.",
        "type": "Concept Focus",
        "count": 25
      }
    ]
  },
  "SSC MTS": {
    "displayName": "SSC MTS",
    "examId": "SSC_MTS",
    "group": "ssc",
    "tagline": "SSC MTS",
    "siblings": [
      "SSC CGL",
      "SSC IMD",
      "SSC JE",
      "SSC CHSL",
      "SSC MTS",
      "SSC GD",
      "SSC CPO",
      "SSC Steno"
    ],
    "subjectOptions": [
      {
        "value": "Numerical Aptitude",
        "label": "Numerical Aptitude"
      },
      {
        "value": "General Intelligence & Reasoning",
        "label": "General Intelligence & Reasoning"
      },
      {
        "value": "English Language",
        "label": "English Language"
      },
      {
        "value": "General Awareness",
        "label": "General Awareness"
      }
    ],
    "categories": [
      {
        "label": "Full Mocks (90 Qs)",
        "count": "90 Min · 150 Marks",
        "countNum": 90,
        "topic": "SSC MTS Full Mock",
        "icon": "mocks"
      },
      {
        "label": "Numerical Aptitude",
        "count": "Basic Arithmetic",
        "countNum": 20,
        "topic": "Numerical Aptitude",
        "icon": "subject"
      },
      {
        "label": "Reasoning Practice",
        "count": "Non-Verbal & Verbal",
        "countNum": 20,
        "topic": "General Intelligence & Reasoning",
        "icon": "subject"
      },
      {
        "label": "English Language",
        "count": "Grammar & Reading",
        "countNum": 20,
        "topic": "English Language",
        "icon": "subject"
      },
      {
        "label": "General Awareness",
        "count": "GK & Static GK",
        "countNum": 20,
        "topic": "General Awareness",
        "icon": "subject"
      },
      {
        "label": "Previous Year Papers",
        "count": "2020–2024 PYQs",
        "countNum": 90,
        "topic": "SSC MTS Previous Year Questions",
        "icon": "pyq"
      }
    ],
    "fallbackRecommendations": [
      {
        "title": "MTS Reasoning Drill",
        "topic": "General Intelligence & Reasoning",
        "reason": "Non-verbal reasoning dominates MTS Reasoning section.",
        "type": "Concept Focus",
        "count": 20
      },
      {
        "title": "GK & Current Affairs Quiz",
        "topic": "General Awareness",
        "reason": "Static GK on Indian History, Polity, and Science are high frequency in MTS.",
        "type": "Speed Drill",
        "count": 20
      }
    ]
  },
  "SSC GD": {
    "displayName": "SSC GD",
    "examId": "SSC_GD",
    "group": "ssc",
    "tagline": "SSC GD Constable",
    "siblings": [
      "SSC CGL",
      "SSC IMD",
      "SSC JE",
      "SSC CHSL",
      "SSC MTS",
      "SSC GD",
      "SSC CPO",
      "SSC Steno"
    ],
    "subjectOptions": [
      {
        "value": "Elementary Mathematics",
        "label": "Elementary Mathematics"
      },
      {
        "value": "General Intelligence & Reasoning",
        "label": "General Intelligence & Reasoning"
      },
      {
        "value": "English / Hindi",
        "label": "English / Hindi"
      },
      {
        "value": "General Awareness",
        "label": "General Awareness"
      }
    ],
    "categories": [
      {
        "label": "Full Mocks (80 Qs)",
        "count": "60 Min · 160 Marks",
        "countNum": 80,
        "topic": "SSC GD Full Mock",
        "icon": "mocks"
      },
      {
        "label": "Elementary Maths",
        "count": "20 Qs · Basic Level",
        "countNum": 20,
        "topic": "Elementary Mathematics",
        "icon": "subject"
      },
      {
        "label": "Reasoning Practice",
        "count": "Series, Analogy",
        "countNum": 20,
        "topic": "General Intelligence & Reasoning",
        "icon": "subject"
      },
      {
        "label": "English / Hindi",
        "count": "Grammar & Vocab",
        "countNum": 20,
        "topic": "English / Hindi",
        "icon": "subject"
      },
      {
        "label": "General Awareness",
        "count": "GK & Current Affairs",
        "countNum": 20,
        "topic": "General Awareness",
        "icon": "subject"
      },
      {
        "label": "Previous Year Papers",
        "count": "GD PYQ Sets",
        "countNum": 80,
        "topic": "SSC GD Previous Year Questions",
        "icon": "pyq"
      }
    ],
    "fallbackRecommendations": [
      {
        "title": "GD Reasoning Drill",
        "topic": "General Intelligence & Reasoning",
        "reason": "Analogy, Series, and Non-Verbal Reasoning dominate SSC GD.",
        "type": "Speed Drill",
        "count": 20
      },
      {
        "title": "GD General Awareness",
        "topic": "General Awareness",
        "reason": "Current Affairs and Basic GK carry high marks in SSC GD.",
        "type": "Concept Focus",
        "count": 20
      }
    ]
  },
  "SSC CPO": {
    "displayName": "SSC CPO",
    "examId": "SSC_CPO",
    "group": "ssc",
    "tagline": "SSC CPO SI",
    "siblings": [
      "SSC CGL",
      "SSC IMD",
      "SSC JE",
      "SSC CHSL",
      "SSC MTS",
      "SSC GD",
      "SSC CPO",
      "SSC Steno"
    ],
    "subjectOptions": [
      {
        "value": "Quantitative Aptitude",
        "label": "Quantitative Aptitude"
      },
      {
        "value": "General Intelligence & Reasoning",
        "label": "General Intelligence & Reasoning"
      },
      {
        "value": "English Language",
        "label": "English Language"
      },
      {
        "value": "General Awareness",
        "label": "General Awareness"
      }
    ],
    "categories": [
      {
        "label": "Full Mocks (200 Qs)",
        "count": "2 Hours · 200 Marks",
        "countNum": 200,
        "topic": "SSC CPO Full Mock",
        "icon": "mocks"
      },
      {
        "label": "Quantitative Aptitude",
        "count": "50 Qs · Speed Drill",
        "countNum": 50,
        "topic": "Quantitative Aptitude",
        "icon": "subject"
      },
      {
        "label": "Reasoning",
        "count": "50 Qs · Puzzles & Series",
        "countNum": 50,
        "topic": "General Intelligence & Reasoning",
        "icon": "subject"
      },
      {
        "label": "English Language",
        "count": "50 Qs · Comprehension",
        "countNum": 50,
        "topic": "English Language",
        "icon": "subject"
      },
      {
        "label": "General Knowledge",
        "count": "50 Qs · GK & Current",
        "countNum": 50,
        "topic": "General Awareness",
        "icon": "subject"
      },
      {
        "label": "Previous Year Papers",
        "count": "CPO PYQ Sets",
        "countNum": 200,
        "topic": "SSC CPO Previous Year Questions",
        "icon": "pyq"
      }
    ],
    "fallbackRecommendations": [
      {
        "title": "CPO Quantitative Drill",
        "topic": "Quantitative Aptitude",
        "reason": "DI and Arithmetic dominate SSC CPO Quant.",
        "type": "Speed Drill",
        "count": 50
      },
      {
        "title": "English Comprehension",
        "topic": "English Language",
        "reason": "Reading Comprehension and Error Detection are key CPO English topics.",
        "type": "Concept Focus",
        "count": 30
      }
    ]
  },
  "SSC Steno": {
    "displayName": "SSC Steno",
    "examId": "SSC_STENO",
    "group": "ssc",
    "tagline": "SSC Stenographer",
    "siblings": [
      "SSC CGL",
      "SSC IMD",
      "SSC JE",
      "SSC CHSL",
      "SSC MTS",
      "SSC GD",
      "SSC CPO",
      "SSC Steno"
    ],
    "subjectOptions": [
      {
        "value": "General Intelligence & Reasoning",
        "label": "General Intelligence & Reasoning"
      },
      {
        "value": "English Language",
        "label": "English Language & Literary"
      },
      {
        "value": "General Awareness",
        "label": "General Awareness"
      }
    ],
    "categories": [
      {
        "label": "Full Mocks (200 Qs)",
        "count": "2 Hours · 200 Marks",
        "countNum": 200,
        "topic": "SSC Steno Full Mock",
        "icon": "mocks"
      },
      {
        "label": "Reasoning",
        "count": "50 Qs · Series & Analogy",
        "countNum": 50,
        "topic": "General Intelligence & Reasoning",
        "icon": "subject"
      },
      {
        "label": "English Language",
        "count": "100 Qs · Vocab & Grammar",
        "countNum": 100,
        "topic": "English Language",
        "icon": "subject"
      },
      {
        "label": "General Awareness",
        "count": "50 Qs · GK",
        "countNum": 50,
        "topic": "General Awareness",
        "icon": "subject"
      },
      {
        "label": "Speed Vocabulary",
        "count": "20 Qs · 5 Min Sprint",
        "countNum": 20,
        "topic": "English Vocabulary",
        "icon": "speed"
      },
      {
        "label": "Previous Year Papers",
        "count": "Steno PYQ Sets",
        "countNum": 200,
        "topic": "SSC Steno Previous Year Questions",
        "icon": "pyq"
      }
    ],
    "fallbackRecommendations": [
      {
        "title": "English Vocabulary Drill",
        "topic": "English Language",
        "reason": "English carries 100 marks in Steno — vocabulary and one-word substitution are key.",
        "type": "Concept Focus",
        "count": 50
      },
      {
        "title": "General Awareness Quiz",
        "topic": "General Awareness",
        "reason": "Current affairs and static GK make up the GK section of SSC Steno.",
        "type": "Speed Drill",
        "count": 30
      }
    ]
  },
  "UPSC": {
    "displayName": "UPSC",
    "examId": "UPSC_CSE",
    "group": "upsc",
    "tagline": "UPSC CSE Prelims",
    "siblings": [
      "UPSC",
      "BPSC",
      "State PSC"
    ],
    "subjectOptions": [
      {
        "value": "GS Paper I - History & Geography",
        "label": "GS Paper I — History & Geography"
      },
      {
        "value": "GS Paper II - Polity & Governance",
        "label": "GS Paper II — Polity & Governance"
      },
      {
        "value": "GS Paper III - Economy & Environment",
        "label": "GS Paper III — Economy & Environment"
      },
      {
        "value": "Current Affairs",
        "label": "Current Affairs"
      },
      {
        "value": "CSAT - Reasoning",
        "label": "CSAT — Reasoning & Math"
      }
    ],
    "categories": [
      {
        "label": "GS Prelims Full Mocks",
        "count": "100 Qs · 2 Hours",
        "countNum": 100,
        "topic": "UPSC Prelims GS Paper I",
        "icon": "mocks"
      },
      {
        "label": "History & Geography",
        "count": "Art, Culture & Maps",
        "countNum": 30,
        "topic": "GS Paper I - History & Geography",
        "icon": "subject"
      },
      {
        "label": "Polity & Governance",
        "count": "Constitution & IR",
        "countNum": 30,
        "topic": "GS Paper II - Polity & Governance",
        "icon": "subject"
      },
      {
        "label": "Economy & Environment",
        "count": "Budget, Ecology & Sci",
        "countNum": 30,
        "topic": "GS Paper III - Economy & Environment",
        "icon": "subject"
      },
      {
        "label": "Current Affairs",
        "count": "Last 6 Months",
        "countNum": 20,
        "topic": "Current Affairs",
        "icon": "daily"
      },
      {
        "label": "CSAT Practice",
        "count": "80 Qs · 2 Hours",
        "countNum": 80,
        "topic": "CSAT - Reasoning",
        "icon": "subject"
      }
    ],
    "fallbackRecommendations": [
      {
        "title": "UPSC Polity & Constitution",
        "topic": "GS Paper II - Polity & Governance",
        "reason": "Constitutional articles and landmark SC judgments are consistent prelims features.",
        "type": "Concept Focus",
        "count": 30
      },
      {
        "title": "CSAT Reasoning Speed Test",
        "topic": "CSAT - Reasoning",
        "reason": "Reading comprehension and logical reasoning are make-or-break for UPSC Prelims Paper II.",
        "type": "Speed Drill",
        "count": 20
      }
    ]
  },
  "BPSC": {
    "displayName": "BPSC",
    "examId": "BPSC",
    "group": "state-psc",
    "tagline": "BPSC Prelims",
    "siblings": [
      "BPSC",
      "UPSC",
      "TRE Bihar",
      "State PSC"
    ],
    "subjectOptions": [
      {
        "value": "General Studies - Bihar",
        "label": "General Studies (Bihar Special)"
      },
      {
        "value": "General Studies - India",
        "label": "General Studies (National)"
      },
      {
        "value": "History & Culture",
        "label": "History & Culture"
      },
      {
        "value": "Current Affairs",
        "label": "Current Affairs"
      }
    ],
    "categories": [
      {
        "label": "BPSC Full Mocks",
        "count": "150 Qs · 2 Hours",
        "countNum": 150,
        "topic": "BPSC Prelims Full Mock",
        "icon": "mocks"
      },
      {
        "label": "Bihar Special GK",
        "count": "Bihar History & Culture",
        "countNum": 30,
        "topic": "General Studies - Bihar",
        "icon": "subject"
      },
      {
        "label": "National GS Practice",
        "count": "Polity, Economy, Science",
        "countNum": 30,
        "topic": "General Studies - India",
        "icon": "subject"
      },
      {
        "label": "History & Culture",
        "count": "Ancient to Modern",
        "countNum": 25,
        "topic": "History & Culture",
        "icon": "subject"
      },
      {
        "label": "Current Affairs",
        "count": "Last 6 Months",
        "countNum": 20,
        "topic": "Current Affairs",
        "icon": "daily"
      },
      {
        "label": "Previous Year Papers",
        "count": "BPSC PYQ Sets",
        "countNum": 150,
        "topic": "BPSC Previous Year Questions",
        "icon": "pyq"
      }
    ],
    "fallbackRecommendations": [
      {
        "title": "Bihar GK Special",
        "topic": "General Studies - Bihar",
        "reason": "BPSC puts heavy weight on Bihar History, Art, Culture, and Economy.",
        "type": "Concept Focus",
        "count": 30
      },
      {
        "title": "National GS Mixed Quiz",
        "topic": "General Studies - India",
        "reason": "Polity, economy, and science make up the national GS section of BPSC Prelims.",
        "type": "Speed Drill",
        "count": 30
      }
    ]
  },
  "TRE Bihar": {
    "displayName": "TRE Bihar",
    "examId": "BPSC_TRE",
    "group": "teaching",
    "tagline": "BPSC TRE",
    "siblings": [
      "TRE Bihar",
      "BPSC"
    ],
    "subjectOptions": [
      {
        "value": "Child Development & Pedagogy",
        "label": "Child Development & Pedagogy"
      },
      {
        "value": "Language - Hindi",
        "label": "Hindi Language"
      },
      {
        "value": "Language - English",
        "label": "English Language"
      },
      {
        "value": "Environmental Studies",
        "label": "Environmental Studies"
      },
      {
        "value": "Mathematics",
        "label": "Mathematics"
      }
    ],
    "categories": [
      {
        "label": "TRE Full Mocks",
        "count": "150 Qs · 2.5 Hours",
        "countNum": 150,
        "topic": "BPSC TRE Full Mock",
        "icon": "mocks"
      },
      {
        "label": "Child Development",
        "count": "CDP & Psychology",
        "countNum": 30,
        "topic": "Child Development & Pedagogy",
        "icon": "subject"
      },
      {
        "label": "Hindi Language",
        "count": "Grammar & Comprehension",
        "countNum": 30,
        "topic": "Language - Hindi",
        "icon": "subject"
      },
      {
        "label": "English Language",
        "count": "Grammar & Reading",
        "countNum": 30,
        "topic": "Language - English",
        "icon": "subject"
      },
      {
        "label": "Environmental Studies",
        "count": "EVS Practice",
        "countNum": 30,
        "topic": "Environmental Studies",
        "icon": "subject"
      },
      {
        "label": "Mathematics",
        "count": "Primary Math",
        "countNum": 30,
        "topic": "Mathematics",
        "icon": "subject"
      }
    ],
    "fallbackRecommendations": [
      {
        "title": "Child Development & Pedagogy",
        "topic": "Child Development & Pedagogy",
        "reason": "CDP carries the highest weightage in TRE Bihar and is often the differentiator.",
        "type": "Concept Focus",
        "count": 30
      },
      {
        "title": "Hindi Grammar Drill",
        "topic": "Language - Hindi",
        "reason": "Hindi Vyakaran and comprehension passages are key scoring areas in TRE.",
        "type": "Speed Drill",
        "count": 30
      }
    ]
  },
  "Railway NTPC": {
    "displayName": "Railway NTPC",
    "examId": "RRB_NTPC",
    "group": "railway",
    "tagline": "RRB NTPC CBT 1",
    "siblings": [
      "Railway NTPC",
      "Railway Group D"
    ],
    "subjectOptions": [
      {
        "value": "Mathematics",
        "label": "Mathematics"
      },
      {
        "value": "General Intelligence & Reasoning",
        "label": "General Intelligence & Reasoning"
      },
      {
        "value": "General Awareness",
        "label": "General Awareness"
      }
    ],
    "categories": [
      {
        "label": "NTPC Full Mocks (100 Qs)",
        "count": "90 Min · 100 Marks",
        "countNum": 100,
        "topic": "Railway NTPC CBT 1 Full Mock",
        "icon": "mocks"
      },
      {
        "label": "Mathematics Practice",
        "count": "Arithmetic & Algebra",
        "countNum": 30,
        "topic": "Mathematics",
        "icon": "subject"
      },
      {
        "label": "Reasoning Practice",
        "count": "Coding, Analogy, Series",
        "countNum": 30,
        "topic": "General Intelligence & Reasoning",
        "icon": "subject"
      },
      {
        "label": "General Awareness",
        "count": "GK, Science & Railway",
        "countNum": 40,
        "topic": "General Awareness",
        "icon": "subject"
      },
      {
        "label": "Railway GK Special",
        "count": "Railway History & Facts",
        "countNum": 20,
        "topic": "Railway General Knowledge",
        "icon": "daily"
      },
      {
        "label": "Previous Year Papers",
        "count": "CBT 1 PYQ Sets",
        "countNum": 100,
        "topic": "Railway NTPC Previous Year Questions",
        "icon": "pyq"
      }
    ],
    "fallbackRecommendations": [
      {
        "title": "NTPC Mathematics Drill",
        "topic": "Mathematics",
        "reason": "Percentage, Ratio & Proportion, and Time & Work are highest-frequency NTPC math topics.",
        "type": "Speed Drill",
        "count": 30
      },
      {
        "title": "Railway GK & Awareness",
        "topic": "General Awareness",
        "reason": "Current affairs and Railway-specific GK regularly appear in NTPC CBT 1.",
        "type": "Concept Focus",
        "count": 30
      }
    ]
  },
  "JEE Main": {
    "displayName": "JEE Main",
    "examId": "JEE_MAIN",
    "group": "engineering",
    "tagline": "JEE Main",
    "siblings": [
      "JEE Main",
      "JEE Advanced",
      "GATE"
    ],
    "subjectOptions": [
      {
        "value": "Physics",
        "label": "Physics"
      },
      {
        "value": "Chemistry",
        "label": "Chemistry"
      },
      {
        "value": "Mathematics",
        "label": "Mathematics"
      }
    ],
    "categories": [
      {
        "label": "JEE Main Full Mocks",
        "count": "90 Qs · 3 Hours",
        "countNum": 90,
        "topic": "JEE Main Full Mock",
        "icon": "mocks"
      },
      {
        "label": "Physics Practice",
        "count": "Mechanics, Optics, Modern",
        "countNum": 30,
        "topic": "Physics",
        "icon": "subject"
      },
      {
        "label": "Chemistry Practice",
        "count": "Organic, Inorganic, Physical",
        "countNum": 30,
        "topic": "Chemistry",
        "icon": "subject"
      },
      {
        "label": "Mathematics Practice",
        "count": "Calculus, Algebra, Coord Geo",
        "countNum": 30,
        "topic": "Mathematics",
        "icon": "subject"
      },
      {
        "label": "Chapter-wise Drills",
        "count": "Topic Deep Dives",
        "countNum": 20,
        "topic": "JEE Main Chapter Practice",
        "icon": "chapter"
      },
      {
        "label": "Previous Year Papers",
        "count": "2020–2024 PYQs",
        "countNum": 90,
        "topic": "JEE Main Previous Year Questions",
        "icon": "pyq"
      }
    ],
    "fallbackRecommendations": [
      {
        "title": "Physics — Mechanics & Electrostatics",
        "topic": "Physics",
        "reason": "Mechanics and Electrostatics have the highest weightage in JEE Main Physics.",
        "type": "Concept Focus",
        "count": 30
      },
      {
        "title": "Mathematics — Calculus Speed Test",
        "topic": "Mathematics",
        "reason": "Calculus is the backbone of JEE Math.",
        "type": "Speed Drill",
        "count": 30
      }
    ]
  },
  "NEET": {
    "displayName": "NEET",
    "examId": "NEET_UG",
    "group": "medical",
    "tagline": "NEET UG",
    "siblings": [
      "NEET"
    ],
    "subjectOptions": [
      {
        "value": "Biology - Botany",
        "label": "Biology — Botany"
      },
      {
        "value": "Biology - Zoology",
        "label": "Biology — Zoology"
      },
      {
        "value": "Physics",
        "label": "Physics"
      },
      {
        "value": "Chemistry",
        "label": "Chemistry"
      }
    ],
    "categories": [
      {
        "label": "NEET Full Mocks (200 Qs)",
        "count": "200 Qs · 3h 20m",
        "countNum": 200,
        "topic": "NEET Full Mock",
        "icon": "mocks"
      },
      {
        "label": "Biology — Botany",
        "count": "Plant Kingdom, Genetics",
        "countNum": 50,
        "topic": "Biology - Botany",
        "icon": "subject"
      },
      {
        "label": "Biology — Zoology",
        "count": "Animal Kingdom, Physiology",
        "countNum": 50,
        "topic": "Biology - Zoology",
        "icon": "subject"
      },
      {
        "label": "Physics Numericals",
        "count": "Mechanics, Optics, Modern",
        "countNum": 45,
        "topic": "Physics",
        "icon": "subject"
      },
      {
        "label": "Chemistry MCQs",
        "count": "Organic, Inorganic, Physical",
        "countNum": 45,
        "topic": "Chemistry",
        "icon": "subject"
      },
      {
        "label": "Previous Year Papers",
        "count": "2018–2024 PYQs",
        "countNum": 200,
        "topic": "NEET Previous Year Questions",
        "icon": "pyq"
      }
    ],
    "fallbackRecommendations": [
      {
        "title": "Biology — Human Physiology Drill",
        "topic": "Biology - Zoology",
        "reason": "Human Physiology is the highest-scoring NEET topic.",
        "type": "Concept Focus",
        "count": 50
      },
      {
        "title": "Organic Chemistry Reactions",
        "topic": "Chemistry",
        "reason": "Organic chemistry makes up ~40% of NEET Chemistry.",
        "type": "Speed Drill",
        "count": 30
      }
    ]
  },
  "Banking PO": {
    "displayName": "Banking PO",
    "examId": "IBPS_PO",
    "group": "banking",
    "tagline": "IBPS PO",
    "siblings": [
      "Banking PO",
      "Banking Clerk",
      "SBI PO",
      "SBI Clerk",
      "RBI Grade B"
    ],
    "subjectOptions": [
      {
        "value": "Quantitative Aptitude",
        "label": "Quantitative Aptitude"
      },
      {
        "value": "Reasoning Ability",
        "label": "Reasoning Ability"
      },
      {
        "value": "English Language",
        "label": "English Language"
      },
      {
        "value": "General & Financial Awareness",
        "label": "General & Financial Awareness"
      },
      {
        "value": "Computer Aptitude",
        "label": "Computer Aptitude"
      }
    ],
    "categories": [
      {
        "label": "Prelims Full Mocks",
        "count": "60 Min · 100 Marks",
        "countNum": 100,
        "topic": "Banking PO Prelims Full Mock",
        "icon": "mocks"
      },
      {
        "label": "Quantitative Aptitude",
        "count": "DI, Arithmetic, Algebra",
        "countNum": 35,
        "topic": "Quantitative Aptitude",
        "icon": "subject"
      },
      {
        "label": "Reasoning Ability",
        "count": "Puzzles, Seating, Coding",
        "countNum": 35,
        "topic": "Reasoning Ability",
        "icon": "subject"
      },
      {
        "label": "English Language",
        "count": "RC, Error Detection",
        "countNum": 30,
        "topic": "English Language",
        "icon": "subject"
      },
      {
        "label": "Financial Awareness",
        "count": "Banking & Economy GK",
        "countNum": 40,
        "topic": "General & Financial Awareness",
        "icon": "daily"
      },
      {
        "label": "Previous Year Papers",
        "count": "IBPS PO PYQ Sets",
        "countNum": 100,
        "topic": "Banking PO Previous Year Questions",
        "icon": "pyq"
      }
    ],
    "fallbackRecommendations": [
      {
        "title": "Banking Reasoning Puzzles",
        "topic": "Reasoning Ability",
        "reason": "Seating arrangements and puzzles are highest-scoring in Banking Prelims.",
        "type": "Concept Focus",
        "count": 35
      },
      {
        "title": "Data Interpretation Sprint",
        "topic": "Quantitative Aptitude",
        "reason": "DI sets appear in every Banking PO Prelims exam.",
        "type": "Speed Drill",
        "count": 20
      }
    ]
  },
  "State PSC": {
    "displayName": "State PSC",
    "examId": "STATE_PSC",
    "group": "state-psc",
    "tagline": "State PSC",
    "siblings": [
      "BPSC",
      "UPSC",
      "TRE Bihar",
      "State PSC"
    ],
    "subjectOptions": [
      {
        "value": "General Studies",
        "label": "General Studies"
      },
      {
        "value": "Current Affairs",
        "label": "Current Affairs"
      },
      {
        "value": "Reasoning",
        "label": "Reasoning"
      },
      {
        "value": "Mathematics",
        "label": "Mathematics"
      }
    ],
    "categories": [
      {
        "label": "State PSC Full Mocks",
        "count": "150 Qs · 2 Hours",
        "countNum": 150,
        "topic": "State PSC Full Mock",
        "icon": "mocks"
      },
      {
        "label": "General Studies",
        "count": "History, Polity, Economy",
        "countNum": 60,
        "topic": "General Studies",
        "icon": "subject"
      },
      {
        "label": "Current Affairs",
        "count": "Last 6 Months",
        "countNum": 30,
        "topic": "Current Affairs",
        "icon": "daily"
      },
      {
        "label": "Reasoning",
        "count": "Series, Analogy, Coding",
        "countNum": 30,
        "topic": "Reasoning",
        "icon": "subject"
      },
      {
        "label": "Mathematics",
        "count": "Basic Arithmetic & Data",
        "countNum": 30,
        "topic": "Mathematics",
        "icon": "subject"
      },
      {
        "label": "Previous Year Papers",
        "count": "State PSC PYQs",
        "countNum": 150,
        "topic": "State PSC Previous Year Questions",
        "icon": "pyq"
      }
    ],
    "fallbackRecommendations": [
      {
        "title": "State GS Practice",
        "topic": "General Studies",
        "reason": "History, Polity, and Economy form the backbone of most State PSC general studies sections.",
        "type": "Concept Focus",
        "count": 40
      },
      {
        "title": "Current Affairs Weekly Quiz",
        "topic": "Current Affairs",
        "reason": "State PSC exams frequently test last 6 months national and state current affairs.",
        "type": "Speed Drill",
        "count": 20
      }
    ]
  }
};


export const ALL_EXAMS = Object.keys(EXAM_CATALOG);
export const EXAMS = ALL_EXAMS;
export const GOAL_TO_EXAM: Record<string, string> = {
  SSC: 'SSC CGL', 'SSC IMD': 'SSC IMD', 'SSC Scientific Assistant': 'SSC IMD',
  'SSC JE': 'SSC JE', 'SSC JE CS': 'SSC IMD', 'SSC JEE CS': 'SSC IMD', 'SSC JE (CS)': 'SSC IMD',
  'SSC JE IT': 'SSC IMD', 'GATE CS': 'SSC IMD', 'ISRO CS': 'SSC IMD', UPSC: 'UPSC',
  NEET: 'NEET', 'JEE Main': 'JEE Main', 'JEE Advanced': 'JEE Main', GATE: 'JEE Main',
  Banking: 'Banking PO', Railway: 'Railway NTPC', BPSC: 'BPSC', 'State PSC': 'State PSC',
  College: 'UPSC',
};
export function resolveExamFromGoal(goal?: string): string {
  if (!goal) return 'SSC CGL';
  if (EXAM_CATALOG[goal]) return goal;
  if (GOAL_TO_EXAM[goal]) return GOAL_TO_EXAM[goal];
  const upper = goal.toUpperCase();
  for (const key of Object.keys(EXAM_CATALOG)) {
    if (upper.includes(key.toUpperCase()) || key.toUpperCase().includes(upper)) return key;
  }
  return 'SSC CGL';
}
export function getExamConfig(exam: string): ExamPersonalization {
  return EXAM_CATALOG[exam] ?? EXAM_CATALOG['SSC CGL'];
}
export function getExamSiblings(exam: string): string[] { return getExamConfig(exam).siblings; }
export function getSiblingExams(exam: string): string[] { return getExamSiblings(exam); }
