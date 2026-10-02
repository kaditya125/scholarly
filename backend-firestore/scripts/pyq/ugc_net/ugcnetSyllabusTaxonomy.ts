/**
 * Sadhya — UGC NET Computer Science & Applications (Subject Code 87)
 * Authoritative 10-Unit Syllabus Taxonomy & Deterministic Classification Engine
 *
 * Grounded in the official NTA / UGC NET Subject 87 Syllabus Specification:
 * - Unit 1: Discrete Structures and Optimization
 * - Unit 2: Computer System Architecture
 * - Unit 3: Programming Languages and Computer Graphics
 * - Unit 4: Database Management Systems
 * - Unit 5: System Software and Operating Systems
 * - Unit 6: Software Engineering
 * - Unit 7: Data Structures and Algorithms
 * - Unit 8: Theory of Computation and Compilers
 * - Unit 9: Data Communication and Computer Networks
 * - Unit 10: Artificial Intelligence
 */

export interface UGCNetUnitTaxonomy {
  unitNumber: number;
  unitTitle: string;
  subtopics: string[];
  keywords: string[];
}

export const UGC_NET_CS_TAXONOMY: Record<number, UGCNetUnitTaxonomy> = {
  1: {
    unitNumber: 1,
    unitTitle: 'Discrete Structures and Optimization',
    subtopics: [
      'Mathematical Logic (Propositional & Predicate Logic, Inference)',
      'Sets, Relations and Functions',
      'Group Theory and Algebraic Structures',
      'Combinatorics, Counting & Permutations',
      'Graph Theory (Trees, Connectivity, Planarity, Coloring)',
      'Linear Programming & Simplex Method',
      'Transportation and Assignment Problems',
      'Duality and Sensitivity Analysis',
    ],
    keywords: [
      'propositional logic', 'predicate', 'tautology', 'quantifier', 'equivalence relation',
      'partial order', 'lattice', 'group', 'monoid', 'semigroup', 'isomorphism',
      'pigeonhole', 'recurrence relation', 'generating function', 'eulerian',
      'hamiltonian', 'chromatic', 'planar graph', 'bipartite', 'simplex', 'linear programming',
      'lpp', 'dual', 'slack variable', 'transportation problem', 'assignment problem',
      'boolean algebra', 'poset', 'hasse diagram',
    ],
  },
  2: {
    unitNumber: 2,
    unitTitle: 'Computer System Architecture',
    subtopics: [
      'Digital Logic and Boolean Algebra',
      'Data Representation & Computer Arithmetic',
      'Register Transfer and Microoperations',
      'Basic Computer Organization & Design',
      'Microprogrammed Control Unit',
      'Central Processing Unit & Instruction Formats',
      'Pipeline and Vector Processing',
      'Input-Output Organization (DMA, Interrupts)',
      'Memory Hierarchy (Cache, Virtual Memory)',
      'Multiprocessors & Interconnection Structures',
    ],
    keywords: [
      'k-map', 'multiplexer', 'decoder', 'flip-flop', 'counter', 'alu', 'instruction format',
      'addressing mode', 'microoperation', 'control unit', 'hardwired', 'microprogrammed',
      'pipelining', 'hazard', 'speedup', 'branch prediction', 'cache memory', 'cache hit',
      'cache miss', 'direct mapping', 'associative mapping', 'set-associative', 'virtual memory',
      'page table', 'tlb', 'dma', 'interrupt', 'bus arbitration', 'simd', 'mimd',
      'little endian', 'big endian', 'ieee 754', 'floating point',
    ],
  },
  3: {
    unitNumber: 3,
    unitTitle: 'Programming Languages and Computer Graphics',
    subtopics: [
      'Language Design & Programming Paradigms',
      'Object-Oriented Programming Principles (C++, Java)',
      'Storage Management & Scope Rules',
      'Web Programming (HTML, XML, JavaScript, Servlets)',
      'Computer Graphics: 2D Transformations & Clipping',
      '3D Graphics: Projections, Viewing & Hidden Surfaces',
      'Raster Scan & Line Drawing Algorithms (Bresenham, DDA)',
    ],
    keywords: [
      'c++', 'java', 'inheritance', 'polymorphism', 'encapsulation', 'virtual function',
      'overloading', 'constructor', 'destructor', 'static scoping', 'dynamic scoping',
      'activation record', 'xml', 'dtd', 'javascript', 'html', 'css', 'servlet',
      'bresenham', 'dda', 'midpoint circle', 'cohen sutherland', 'clipping',
      'transformation matrix', 'rotation', 'scaling', 'translation', 'bezier curve',
      'projection', 'hidden surface', 'z-buffer', 'raster scan',
    ],
  },
  4: {
    unitNumber: 4,
    unitTitle: 'Database Management Systems',
    subtopics: [
      'Database Concepts & Architecture (Three-schema)',
      'Data Modeling using ER and EER Models',
      'Relational Model, Relational Algebra & Calculus',
      'SQL (DDL, DML, DCL, Subqueries, Triggers, Views)',
      'Normalization (1NF, 2NF, 3NF, BCNF, 4NF, 5NF)',
      'Transaction Management, ACID Properties & Serializability',
      'Concurrency Control (Locking, Timestamping, 2PL)',
      'Recovery System & Logging (WAL)',
      'NoSQL, Big Data & Distributed Databases',
    ],
    keywords: [
      'er diagram', 'relational algebra', 'tuple relational calculus', 'sql', 'foreign key',
      'primary key', 'candidate key', 'functional dependency', 'bcnf', '3nf', '2nf',
      'lossless join', 'dependency preserving', 'minimal cover', 'serializability',
      'conflict serializable', 'two phase locking', '2pl', 'acid', 'transaction',
      'deadlock prevention', 'checkpoint', 'write-ahead logging', 'b-tree', 'b+ tree',
      'nosql', 'mongodb', 'cap theorem', 'view serializable',
    ],
  },
  5: {
    unitNumber: 5,
    unitTitle: 'System Software and Operating Systems',
    subtopics: [
      'System Software (Assembler, Linker, Loader, Macro Processor)',
      'Operating System Basics & System Calls',
      'Process Management & Threads',
      'CPU Scheduling Algorithms (FCFS, SJF, Round Robin, Priority)',
      'Process Synchronization & Deadlocks (Banker\'s Algorithm)',
      'Memory Management (Paging, Segmentation, Demand Paging)',
      'Page Replacement Algorithms (FIFO, LRU, Optimal)',
      'Storage Management & Disk Scheduling (SCAN, C-SCAN, LOOK)',
      'File Systems & Security',
    ],
    keywords: [
      'assembler', 'linker', 'loader', 'relocation', 'macro processor', 'system call',
      'process control block', 'pcb', 'thread', 'cpu scheduling', 'round robin', 'sjf',
      'turnaround time', 'waiting time', 'semaphore', 'mutex', 'critical section',
      'peterson', 'deadlock', 'banker algorithm', 'resource allocation graph', 'safe state',
      'paging', 'segmentation', 'page fault', 'belady anomaly', 'lru', 'optimal page replacement',
      'thrashing', 'disk scheduling', 'c-scan', 'sstf', 'inode', 'fork',
    ],
  },
  6: {
    unitNumber: 6,
    unitTitle: 'Software Engineering',
    subtopics: [
      'Software Process Models (Waterfall, Agile, Scrum, Spiral, RAD)',
      'Software Requirements Engineering (SRS, Use Cases)',
      'Software Design (Architecture, Coupling & Cohesion)',
      'Software Quality & Metrics (Cyclomatic Complexity, Function Points)',
      'Software Testing (Black-box, White-box, Unit, Integration, Regression)',
      'Software Maintenance & Configuration Management',
      'Project Management (COCOMO Model, PERT/CPM, Risk Management)',
    ],
    keywords: [
      'agile', 'scrum', 'waterfall', 'spiral model', 'rad', 'srs', 'use case', 'dfd',
      'coupling', 'cohesion', 'cyclomatic complexity', 'basis path testing', 'cocomo',
      'function point', 'black box', 'white box', 'boundary value analysis',
      'equivalence partitioning', 'regression testing', 'pert', 'cpm', 'critical path',
      'cmm', 'iso 9000', 'software risk', 'cleanroom',
    ],
  },
  7: {
    unitNumber: 7,
    unitTitle: 'Data Structures and Algorithms',
    subtopics: [
      'Data Structures (Arrays, Stacks, Queues, Linked Lists)',
      'Trees (Binary Trees, BST, AVL Trees, B-Trees, Red-Black Trees)',
      'Heaps, Priority Queues & Hashing',
      'Asymptotic Analysis & Recurrences (Master Theorem)',
      'Divide and Conquer (Merge Sort, Quick Sort, Binary Search)',
      'Greedy Algorithms (Huffman Coding, Prim, Kruskal, Dijkstra)',
      'Dynamic Programming (LCS, Knapsack, Matrix Chain Multiplication)',
      'Backtracking and Branch & Bound',
      'Complexity Classes (P, NP, NP-Complete, NP-Hard)',
    ],
    keywords: [
      'array', 'stack', 'queue', 'linked list', 'binary search tree', 'bst', 'avl tree',
      'red-black tree', 'heap', 'hashing', 'hash table', 'asymptotic notation',
      'big-o', 'master theorem', 'quicksort', 'mergesort', 'dijkstra', 'bellman-ford',
      'floyd-warshall', 'kruskal', 'prim', 'knapsack', 'longest common subsequence', 'lcs',
      'matrix chain multiplication', 'travelling salesman', 'np-complete', 'np-hard',
      'satisfiability', 'clique', 'vertex cover',
    ],
  },
  8: {
    unitNumber: 8,
    unitTitle: 'Theory of Computation and Compilers',
    subtopics: [
      'Regular Languages and Finite Automata (DFA, NFA, Regular Expressions)',
      'Pumping Lemma for Regular Languages',
      'Context-Free Grammars and Pushdown Automata (PDA)',
      'Chomsky Hierarchy & Normal Forms (CNF, GNF)',
      'Turing Machines & Decidability (Halting Problem, Rice\'s Theorem)',
      'Compiler Design: Lexical Analysis & Syntax Analysis (LL, LR, LALR)',
      'Semantic Analysis & Intermediate Code Generation (Three-address code)',
      'Code Optimization & Target Code Generation',
    ],
    keywords: [
      'dfa', 'nfa', 'regular expression', 'pumping lemma', 'pda', 'pushdown automata',
      'context free grammar', 'cfg', 'chomsky normal form', 'cnf', 'greibach', 'gnf',
      'turing machine', 'decidability', 'undecidable', 'halting problem', 'post correspondence',
      'compiler', 'lexical analyzer', 'yacc', 'parser', 'll(1)', 'lr(0)', 'slr(1)', 'lr(1)',
      'lalr', 'three address code', 'dag', 'live variable', 'register allocation',
    ],
  },
  9: {
    unitNumber: 9,
    unitTitle: 'Data Communication and Computer Networks',
    subtopics: [
      'Network Architecture & Reference Models (OSI, TCP/IP)',
      'Transmission Media & Physical Layer (Modulation, Multiplexing)',
      'Data Link Layer (Framing, Error Detection/Correction, Flow Control)',
      'MAC Layer & Ethernet (CSMA/CD, CSMA/CA, Sliding Window)',
      'Network Layer (IPv4, IPv6, Subnetting, Routing Algorithms — OSPF, BGP, RIP)',
      'Transport Layer (TCP, UDP, Congestion Control, 3-Way Handshake)',
      'Application Layer (DNS, HTTP, FTP, SMTP, DHCP)',
      'Network Security & Cryptography (RSA, DES, AES, Diffie-Hellman, Firewalls)',
      'Mobile Computing & Cloud Infrastructure',
    ],
    keywords: [
      'osi model', 'tcp/ip', 'framing', 'crc', 'hamming code', 'flow control', 'sliding window',
      'stop and wait', 'go-back-n', 'selective repeat', 'csma/cd', 'csma/ca', 'ethernet',
      'ipv4', 'ipv6', 'subnetting', 'cidr', 'router', 'routing', 'dijkstra routing',
      'distance vector', 'link state', 'ospf', 'bgp', 'rip', 'tcp', 'udp', 'congestion window',
      'three-way handshake', 'dns', 'http', 'ftp', 'smtp', 'dhcp', 'rsa', 'aes', 'des',
      'diffie-hellman', 'public key', 'firewall', 'ipsec',
    ],
  },
  10: {
    unitNumber: 10,
    unitTitle: 'Artificial Intelligence',
    subtopics: [
      'AI Search Techniques (BFS, DFS, A*, AO*, Heuristic Search)',
      'Adversarial Search & Game Playing (Minimax, Alpha-Beta Pruning)',
      'Knowledge Representation & First-Order Predicate Logic (Resolution, Unification)',
      'Fuzzy Logic & Fuzzy Sets (Membership Functions, Fuzzy Operations)',
      'Genetic Algorithms (Crossover, Mutation, Selection)',
      'Artificial Neural Networks (Perceptron, Multilayer, Backpropagation)',
      'Expert Systems, Planning & Natural Language Processing',
    ],
    keywords: [
      'a* search', 'ao* search', 'heuristic search', 'bfs', 'dfs', 'minimax', 'alpha-beta pruning',
      'knowledge representation', 'resolution refutation', 'unification', 'first order logic',
      'fuzzy logic', 'fuzzy set', 'membership function', 'defuzzification', 'genetic algorithm',
      'crossover', 'mutation', 'artificial neural network', 'ann', 'perceptron', 'backpropagation',
      'expert system', 'nlp', 'parsing', 'expert system shell',
    ],
  },
};

/**
 * Classifies a question text + options into the most appropriate official UGC NET CS Unit.
 */
export function classifyUGCNetCSQuestion(
  questionText: string,
  options: string[] = []
): { unitNumber: number; unitTitle: string; topic: string; confidence: number } {
  const fullText = `${questionText} ${options.join(' ')}`.toLowerCase();

  let bestUnit = 1;
  let maxScore = 0;

  for (const [unitNumStr, unit] of Object.entries(UGC_NET_CS_TAXONOMY)) {
    const unitNum = Number(unitNumStr);
    let score = 0;

    for (const kw of unit.keywords) {
      // Word boundary regex for accurate matching
      const escaped = kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const regex = new RegExp(`\\b${escaped}\\b`, 'gi');
      const matches = fullText.match(regex);
      if (matches) {
        score += matches.length * 2;
      }
    }

    if (score > maxScore) {
      maxScore = score;
      bestUnit = unitNum;
    }
  }

  const selectedUnit = UGC_NET_CS_TAXONOMY[bestUnit];
  const confidence = maxScore > 0 ? Math.min(1.0, 0.5 + maxScore * 0.08) : 0.4;

  // Derive finest topic from matched subtopics
  let bestSubtopic = selectedUnit.subtopics[0];
  for (const sub of selectedUnit.subtopics) {
    const words = sub.toLowerCase().split(/[\s,()&/-]+/).filter((w) => w.length > 3);
    for (const w of words) {
      if (fullText.includes(w)) {
        bestSubtopic = sub;
        break;
      }
    }
  }

  return {
    unitNumber: bestUnit,
    unitTitle: selectedUnit.unitTitle,
    topic: bestSubtopic,
    confidence: Number(confidence.toFixed(2)),
  };
}
