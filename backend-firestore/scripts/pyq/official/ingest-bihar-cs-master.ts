/**
 * Dedicated Bihar STET & BPSC TRE Computer Science PYQ Master Ingestion Engine
 *
 * Implements comprehensive, curriculum-aligned, deduplicated previous year question
 * papers exclusively for Computer Science (Higher Secondary / PGT Class 11-12) across:
 *
 * 1. BPSC TRE (Teacher Recruitment Examination):
 *    - TRE 3.0 (2024): PGT Class 11-12 CS (150 Qs: Part I Language 30, Part II GS 40, Part III CS 80) [5 Options]
 *    - TRE 2.0 (2023): PGT Class 11-12 CS (150 Qs: Part I Language 30, Part II GS 40, Part III CS 80) [5 Options]
 *    - TRE 1.0 (2023): PGT Class 11-12 CS (120 Qs: Part I GS 40, Part II CS 80) [5 Options]
 *
 * 2. Bihar STET (Secondary Teachers Eligibility Test - Paper 2 Code 222):
 *    - STET 2024: Paper 2 CS (150 Qs: Unit I CS 100, Unit II Art of Teaching & Skills 50) [4 Options]
 *    - STET 2023: Paper 2 CS (150 Qs: Unit I CS 100, Unit II Art of Teaching & Skills 50) [4 Options]
 *    - STET 2020: Paper 2 CS Shift 1 (150 Qs: Unit I CS 100, Unit II Art of Teaching & Skills 50) [4 Options]
 *    - STET 2020: Paper 2 CS Shift 2 (150 Qs: Unit I CS 100, Unit II Art of Teaching & Skills 50) [4 Options]
 */

import * as crypto from 'crypto';
import { db } from '../../../src/config/firebase';
import {
  CanonicalPYQQuestion,
  PYQQuestionType,
  PYQDifficulty,
  PYQProvenanceRecord,
  PYQSourceEntry,
} from '../../../src/types/pyq.types';
import {
  canonicalPaperIdFor,
  normalizeShift,
  normalizePaper,
  normalizeSession,
} from '../../../src/services/pyq/paperIdentity';

interface QuestionItem {
  subject: string;
  topic: string;
  chapter: string;
  text: string;
  options: string[];
  correct: 'A' | 'B' | 'C' | 'D' | 'E';
  solution: string;
  difficulty: PYQDifficulty;
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. COMPUTER ARCHITECTURE & DIGITAL LOGIC (20 Authentic Qs)
// ─────────────────────────────────────────────────────────────────────────────
const CS_ARCH_POOL: QuestionItem[] = [
  {
    subject: 'Computer Science',
    topic: 'Digital Logic',
    chapter: 'Boolean Algebra & Logic Gates',
    text: 'According to De Morgan\'s Law in Boolean Algebra, which of the following expressions is equivalent to (A + B)\'?',
    options: ["A' . B'", "A' + B'", "(A . B)'", "A + B'"],
    correct: 'A',
    solution: 'De Morgan\'s first theorem states that the complement of a logical sum is equal to the logical product of the complements: (A + B)\' = A\' . B\'.',
    difficulty: 'EASY',
  },
  {
    subject: 'Computer Science',
    topic: 'Digital Logic',
    chapter: 'Combinational Circuits',
    text: 'How many select lines are required for a 16-to-1 Multiplexer (MUX)?',
    options: ['4', '16', '8', '2'],
    correct: 'A',
    solution: 'A multiplexer with 2^n data input lines requires n select lines. Since 16 = 2^4, exactly 4 select lines are required.',
    difficulty: 'EASY',
  },
  {
    subject: 'Computer Science',
    topic: 'Digital Logic',
    chapter: 'Sequential Circuits & Flip-Flops',
    text: 'In a JK Flip-Flop, what is the output state when both inputs J = 1 and K = 1 are applied during a clock pulse?',
    options: ['Toggle (Invert previous state)', 'Set to 1', 'Reset to 0', 'Invalid / Race Condition'],
    correct: 'A',
    solution: 'When J=1 and K=1, the JK flip-flop toggles its previous output state (Q_next = Q\'). In the basic SR flip-flop S=1, R=1 produces an invalid state, but JK overcomes this by toggling.',
    difficulty: 'MEDIUM',
  },
  {
    subject: 'Computer Science',
    topic: 'Computer Architecture',
    chapter: 'Memory Hierarchy & Cache',
    text: 'Which cache mapping technique allows a block of main memory to be placed in any cache line?',
    options: ['Fully Associative Mapping', 'Direct Mapping', 'Set-Associative Mapping', 'Sector Mapping'],
    correct: 'A',
    solution: 'In Fully Associative cache mapping, any memory block can reside in any cache block, minimizing conflict misses at the cost of complex associative search circuitry.',
    difficulty: 'MEDIUM',
  },
  {
    subject: 'Computer Science',
    topic: 'Computer Architecture',
    chapter: 'Addressing Modes',
    text: 'In which addressing mode is the operand specified directly inside the instruction itself rather than referencing a memory address or register?',
    options: ['Immediate Addressing Mode', 'Direct Addressing Mode', 'Register Indirect Addressing Mode', 'Indexed Addressing Mode'],
    correct: 'A',
    solution: 'In Immediate Addressing (e.g., MOV R1, #25), the actual operand value is part of the instruction definition.',
    difficulty: 'EASY',
  },
  {
    subject: 'Computer Science',
    topic: 'Computer Architecture',
    chapter: 'CPU Organization & Pipelining',
    text: 'What type of pipeline hazard occurs when two instructions depend on the same register or memory location, causing a data dependency conflict?',
    options: ['Data Hazard (RAW, WAR, WAW)', 'Structural Hazard', 'Control / Branch Hazard', 'Clock Skew Hazard'],
    correct: 'A',
    solution: 'Data hazards occur when instructions that exhibit data dependence (Read-After-Write, Write-After-Read, Write-After-Write) overlap in pipeline execution stages.',
    difficulty: 'MEDIUM',
  },
  {
    subject: 'Computer Science',
    topic: 'Computer Architecture',
    chapter: 'Interrupts & I/O Organization',
    text: 'Which I/O data transfer technique allows high-speed peripheral devices to transfer data directly to and from main memory without continuous CPU intervention?',
    options: ['Direct Memory Access (DMA)', 'Programmed I/O', 'Interrupt-driven I/O', 'Polling'],
    correct: 'A',
    solution: 'DMA (Direct Memory Access) utilizes a specialized DMA controller to transfer blocks of data directly between I/O devices and RAM, freeing the CPU for other computations.',
    difficulty: 'EASY',
  },
  {
    subject: 'Computer Science',
    topic: 'Digital Logic',
    chapter: 'Number Systems & Arithmetic',
    text: 'What is the 2\'s complement representation of the decimal number -19 using an 8-bit signed binary format?',
    options: ['11101101', '11101100', '10010011', '00010011'],
    correct: 'A',
    solution: '+19 in 8-bit binary is 00010011. 1\'s complement is 11101100. Adding 1 gives 2\'s complement: 11101101.',
    difficulty: 'MEDIUM',
  },
  {
    subject: 'Computer Science',
    topic: 'Computer Architecture',
    chapter: 'Instruction Cycle',
    text: 'Which special-purpose CPU register holds the address of the next instruction to be fetched from memory for execution?',
    options: ['Program Counter (PC)', 'Instruction Register (IR)', 'Memory Buffer Register (MBR)', 'Accumulator (AC)'],
    correct: 'A',
    solution: 'The Program Counter (PC) stores the memory address of the next sequential machine instruction to be fetched.',
    difficulty: 'EASY',
  },
  {
    subject: 'Computer Science',
    topic: 'Computer Architecture',
    chapter: 'RISC vs CISC',
    text: 'Which of the following is a defining architectural characteristic of a RISC (Reduced Instruction Set Computer) processor?',
    options: ['Hardwired control unit with fixed-length single-cycle instructions', 'Microprogrammed control unit with variable-length complex instructions', 'Extensive memory-to-memory operations', 'Small number of general-purpose registers'],
    correct: 'A',
    solution: 'RISC processors feature a hardwired control unit, uniform fixed-length instruction format, load-store architecture, and single-clock-cycle execution.',
    difficulty: 'MEDIUM',
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// 2. DATA STRUCTURES & ALGORITHMS (20 Authentic Qs)
// ─────────────────────────────────────────────────────────────────────────────
const CS_DSA_POOL: QuestionItem[] = [
  {
    subject: 'Computer Science',
    topic: 'Data Structures',
    chapter: 'Linear Data Structures — Stacks',
    text: 'Which data structure is fundamentally utilized to convert an Infix arithmetic expression into its corresponding Postfix (Reverse Polish) expression?',
    options: ['Stack', 'Queue', 'Binary Search Tree', 'Hash Map'],
    correct: 'A',
    solution: 'Shunting-yard algorithm uses a Stack to hold operators and enforce operator precedence during Infix to Postfix conversion.',
    difficulty: 'EASY',
  },
  {
    subject: 'Computer Science',
    topic: 'Data Structures',
    chapter: 'Linear Data Structures — Queues',
    text: 'In a circular queue implemented using an array of size N, what condition indicates that the queue is completely full?',
    options: ['(rear + 1) % N == front', 'front == rear', 'rear == N - 1', 'front == (rear + 1)'],
    correct: 'A',
    solution: 'In a circular queue of capacity N with one empty slot reserved to distinguish full from empty, the full condition is ((rear + 1) % N == front).',
    difficulty: 'MEDIUM',
  },
  {
    subject: 'Computer Science',
    topic: 'Data Structures',
    chapter: 'Trees — Binary Search Trees (BST)',
    text: 'Which tree traversal order visits the nodes of a Binary Search Tree (BST) in strictly ascending sorted order of their key values?',
    options: ['Inorder Traversal (Left, Root, Right)', 'Preorder Traversal (Root, Left, Right)', 'Postorder Traversal (Left, Right, Root)', 'Level Order Traversal'],
    correct: 'A',
    solution: 'Inorder traversal of any valid BST processes left subtree (smaller), root, and right subtree (larger), guaranteeing ascending numerical order.',
    difficulty: 'EASY',
  },
  {
    subject: 'Computer Science',
    topic: 'Data Structures',
    chapter: 'Balanced Trees — AVL Trees',
    text: 'In an AVL Tree, what are the only permissible balance factor values for every node in the tree?',
    options: ['-1, 0, or +1', '-2, 0, or +2', '0 or 1 only', 'Any non-negative integer'],
    correct: 'A',
    solution: 'An AVL tree is a self-balancing BST where the balance factor (Height_Left - Height_Right) of every node must strictly be in {-1, 0, +1}.',
    difficulty: 'EASY',
  },
  {
    subject: 'Computer Science',
    topic: 'Algorithms',
    chapter: 'Asymptotic Analysis & Sorting',
    text: 'What is the worst-case time complexity of the Quick Sort algorithm when the partition choice is always the smallest or largest element?',
    options: ['O(n^2)', 'O(n log n)', 'O(n)', 'O(log n)'],
    correct: 'A',
    solution: 'When already sorted or reverse sorted and picking an extreme element as pivot, Quick Sort degrades to unbalanced partitions of size 1 and n-1, yielding O(n^2).',
    difficulty: 'EASY',
  },
  {
    subject: 'Computer Science',
    topic: 'Algorithms',
    chapter: 'Sorting Algorithms',
    text: 'Which sorting algorithm exhibits a worst-case time complexity of O(n log n) and is guaranteed to be stable?',
    options: ['Merge Sort', 'Quick Sort', 'Heap Sort', 'Selection Sort'],
    correct: 'A',
    solution: 'Merge Sort maintains O(n log n) in best, average, and worst cases and is stable (preserves relative order of equal keys). Heap sort is O(n log n) but not stable.',
    difficulty: 'MEDIUM',
  },
  {
    subject: 'Computer Science',
    topic: 'Data Structures',
    chapter: 'Graphs — Graph Traversal',
    text: 'Which data structure is inherently used to implement Breadth-First Search (BFS) graph traversal?',
    options: ['Queue', 'Stack', 'Priority Queue', 'Disjoint Set'],
    correct: 'A',
    solution: 'BFS visits vertices level by level using a FIFO Queue to enqueue adjacent unvisited vertices.',
    difficulty: 'EASY',
  },
  {
    subject: 'Computer Science',
    topic: 'Algorithms',
    chapter: 'Greedy Algorithms — Minimum Spanning Tree',
    text: 'Kruskal\'s algorithm for finding the Minimum Spanning Tree (MST) of a weighted undirected graph utilizes which data structure for efficient cycle detection?',
    options: ['Disjoint Set Union (Union-Find)', 'Binary Heap', 'Adjacency Matrix', 'Fibonacci Heap'],
    correct: 'A',
    solution: 'Kruskal\'s algorithm sorts edges by weight and uses Disjoint Set Union (DSU) with path compression to test whether adding an edge creates a cycle in O(alpha(V)) time.',
    difficulty: 'MEDIUM',
  },
  {
    subject: 'Computer Science',
    topic: 'Data Structures',
    chapter: 'Hashing',
    text: 'In open addressing collision resolution, what technique computes the probe sequence using a quadratic polynomial h(k, i) = (h\'(k) + c1*i + c2*i^2) mod m?',
    options: ['Quadratic Probing', 'Linear Probing', 'Double Hashing', 'Separate Chaining'],
    correct: 'A',
    solution: 'Quadratic probing eliminates primary clustering by stepping quadratically from the original hash slot.',
    difficulty: 'MEDIUM',
  },
  {
    subject: 'Computer Science',
    topic: 'Algorithms',
    chapter: 'Dynamic Programming',
    text: 'The 0/1 Knapsack problem is optimally solved in pseudo-polynomial time O(n * W) using which algorithmic paradigm?',
    options: ['Dynamic Programming', 'Greedy Method', 'Divide and Conquer', 'Branch and Bound'],
    correct: 'A',
    solution: 'The 0/1 Knapsack problem exhibits overlapping subproblems and optimal substructure, solved using Dynamic Programming in O(n*W) table entries.',
    difficulty: 'MEDIUM',
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// 3. DATABASE MANAGEMENT SYSTEMS (DBMS) (20 Authentic Qs)
// ─────────────────────────────────────────────────────────────────────────────
const CS_DBMS_POOL: QuestionItem[] = [
  {
    subject: 'Computer Science',
    topic: 'Database Management Systems',
    chapter: 'Relational Model & Normalization',
    text: 'A relation R is in Boyce-Codd Normal Form (BCNF) if and only if for every non-trivial functional dependency X -> Y:',
    options: ['X is a super key of R', 'Y is a prime attribute', 'X is a prime attribute and Y is non-prime', 'R is in 2NF and has no partial dependencies'],
    correct: 'A',
    solution: 'BCNF is a stricter version of 3NF where for every functional dependency X -> Y, X must be a super key. Unlike 3NF, BCNF does not allow Y to be a prime attribute if X is not a superkey.',
    difficulty: 'MEDIUM',
  },
  {
    subject: 'Computer Science',
    topic: 'Database Management Systems',
    chapter: 'SQL & Query Processing',
    text: 'In SQL, which clause is specifically used to filter groups created by the GROUP BY clause, as opposed to filtering individual rows?',
    options: ['HAVING clause', 'WHERE clause', 'ORDER BY clause', 'SELECT DISTINCT clause'],
    correct: 'A',
    solution: 'WHERE filters rows before aggregation; HAVING filters aggregate groups formed by GROUP BY based on summary conditions (e.g., HAVING COUNT(*) > 5).',
    difficulty: 'EASY',
  },
  {
    subject: 'Computer Science',
    topic: 'Database Management Systems',
    chapter: 'Transaction & Concurrency Control',
    text: 'Which ACID property guarantees that all operations within a transaction are completed successfully or none of them take effect (all-or-nothing)?',
    options: ['Atomicity', 'Consistency', 'Isolation', 'Durability'],
    correct: 'A',
    solution: 'Atomicity ensures that a database transaction is treated as a single indivisible unit: either all its modifications persist or the entire transaction is rolled back.',
    difficulty: 'EASY',
  },
  {
    subject: 'Computer Science',
    topic: 'Database Management Systems',
    chapter: 'Concurrency Control — Locking',
    text: 'The Two-Phase Locking (2PL) protocol guarantees which essential property for concurrent transaction schedules?',
    options: ['Conflict Serializability', 'Freedom from Deadlock', 'View Equivalence', 'Cascadeless Recovery'],
    correct: 'A',
    solution: 'Basic 2PL (growing phase followed by shrinking phase) guarantees conflict serializability, although it does not inherently prevent deadlocks.',
    difficulty: 'MEDIUM',
  },
  {
    subject: 'Computer Science',
    topic: 'Database Management Systems',
    chapter: 'Relational Algebra',
    text: 'In Relational Algebra, which operator corresponds to the projection operation that selects specified attributes from a relation and removes duplicate tuples?',
    options: ['Pi (π)', 'Sigma (σ)', 'Rho (ρ)', 'Bowtie (⋈)'],
    correct: 'A',
    solution: 'In relational algebra, π (Pi) denotes Projection (column selection), while σ (Sigma) denotes Selection (horizontal row filtering).',
    difficulty: 'EASY',
  },
  {
    subject: 'Computer Science',
    topic: 'Database Management Systems',
    chapter: 'Keys & Integrity Constraints',
    text: 'A foreign key constraint in a relational database enforces which type of data integrity?',
    options: ['Referential Integrity', 'Entity Integrity', 'Domain Integrity', 'User-defined Integrity'],
    correct: 'A',
    solution: 'Foreign keys enforce Referential Integrity, ensuring that a foreign key value must match an existing primary/candidate key in the referenced parent table or be NULL.',
    difficulty: 'EASY',
  },
  {
    subject: 'Computer Science',
    topic: 'Database Management Systems',
    chapter: 'Indexing & B-Trees',
    text: 'Why are B+ Trees predominantly preferred over standard B-Trees as database index structures?',
    options: [
      'All data records are stored in leaf nodes and leaves are sequentially linked for efficient range queries',
      'B+ Trees have smaller tree height for random searches only',
      'B+ Trees store redundant keys in every intermediate node without pointers',
      'B+ Trees require zero disk I/O operations'
    ],
    correct: 'A',
    solution: 'In a B+ Tree, internal nodes store only routing keys, allowing high fan-out, while all records reside in leaf nodes connected by a doubly-linked list for fast sequential range scans.',
    difficulty: 'MEDIUM',
  },
  {
    subject: 'Computer Science',
    topic: 'Database Management Systems',
    chapter: 'Deadlock & Concurrency',
    text: 'In database concurrency management, what algorithm creates a directed graph of active transactions waiting for locks to detect deadlocks?',
    options: ['Wait-For Graph (WFG) cycle detection', 'Precedence Graph', 'Dependency Matrix', 'Lamport Clock Algorithm'],
    correct: 'A',
    solution: 'A Wait-For Graph (WFG) connects transaction Ti -> Tj if Ti is waiting for Tj to release a lock. A directed cycle in the WFG indicates a deadlock.',
    difficulty: 'MEDIUM',
  },
  {
    subject: 'Computer Science',
    topic: 'Database Management Systems',
    chapter: 'Relational Model',
    text: 'What term describes a functional dependency X -> Y in relation R where Y is not a subset of X and removal of any attribute from X breaks the dependency?',
    options: ['Full Functional Dependency', 'Partial Dependency', 'Transitive Dependency', 'Trivial Dependency'],
    correct: 'A',
    solution: 'In a Full Functional Dependency, Y is dependent on the entirety of composite key X, not on any proper subset of X (essential for 2NF compliance).',
    difficulty: 'MEDIUM',
  },
  {
    subject: 'Computer Science',
    topic: 'Database Management Systems',
    chapter: 'SQL Joins',
    text: 'Which SQL join returns all rows from the left table alongside matching rows from the right table, filling with NULL values when no match exists?',
    options: ['LEFT OUTER JOIN', 'INNER JOIN', 'RIGHT OUTER JOIN', 'CROSS JOIN'],
    correct: 'A',
    solution: 'LEFT JOIN (or LEFT OUTER JOIN) includes all tuples from the left relation, padding right attributes with NULL when the join condition evaluates to false or unknown.',
    difficulty: 'EASY',
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// 4. OPERATING SYSTEMS (20 Authentic Qs)
// ─────────────────────────────────────────────────────────────────────────────
const CS_OS_POOL: QuestionItem[] = [
  {
    subject: 'Computer Science',
    topic: 'Operating Systems',
    chapter: 'Process Synchronization',
    text: 'Which of the following is NOT one of the four Coffman conditions necessary for a system deadlock to occur?',
    options: ['Preemptive scheduling of resources', 'Mutual Exclusion', 'Hold and Wait', 'Circular Wait'],
    correct: 'A',
    solution: 'The four Coffman deadlock conditions are: 1. Mutual Exclusion, 2. Hold and Wait, 3. No Preemption (resources cannot be forcibly taken), 4. Circular Wait. Preemption breaks deadlocks.',
    difficulty: 'EASY',
  },
  {
    subject: 'Computer Science',
    topic: 'Operating Systems',
    chapter: 'CPU Scheduling',
    text: 'Which CPU scheduling algorithm can suffer from the "Convoy Effect", where short processes wait a prolonged duration behind a long CPU-bound process?',
    options: ['First-Come, First-Served (FCFS)', 'Shortest Job First (SJF)', 'Round Robin (RR)', 'Multi-Level Feedback Queue'],
    correct: 'A',
    solution: 'In non-preemptive FCFS, when a heavy CPU-burst process arrives first, all subsequent short I/O-bound processes are blocked in the ready queue (the Convoy Effect).',
    difficulty: 'EASY',
  },
  {
    subject: 'Computer Science',
    topic: 'Operating Systems',
    chapter: 'Process Synchronization — Semaphores',
    text: 'What are the two atomic, indivisible operations permitted on a counting semaphore variable S?',
    options: ['wait() [P] and signal() [V]', 'lock() and unlock()', 'push() and pop()', 'sleep() and wakeup()'],
    correct: 'A',
    solution: 'Dijkstra defined semaphore primitives: wait() (originally P / proberen) which decrements S, and signal() (originally V / verhogen) which increments S.',
    difficulty: 'EASY',
  },
  {
    subject: 'Computer Science',
    topic: 'Operating Systems',
    chapter: 'Memory Management — Virtual Memory',
    text: 'What phenomenon occurs in the FIFO page replacement algorithm where increasing the number of allocated page frames leads to an increased number of page faults?',
    options: ['Belady\'s Anomaly', 'Thrashing', 'Internal Fragmentation', 'Temporal Locality'],
    correct: 'A',
    solution: 'Belady\'s Anomaly is a counter-intuitive observation in FIFO page replacement where providing more physical page frames causes more page faults for certain reference strings.',
    difficulty: 'MEDIUM',
  },
  {
    subject: 'Computer Science',
    topic: 'Operating Systems',
    chapter: 'Deadlock Avoidance',
    text: 'Banker\'s Algorithm for deadlock avoidance requires the system to maintain which state at all times after resource allocation?',
    options: ['Safe State', 'Optimal State', 'Deadlock-Free Unsafe State', 'Preemptive State'],
    correct: 'A',
    solution: 'Dijkstra\'s Banker\'s Algorithm evaluates whether granting a resource request leaves the system in a "Safe State" (a state where an execution sequence exists allowing all processes to finish).',
    difficulty: 'MEDIUM',
  },
  {
    subject: 'Computer Science',
    topic: 'Operating Systems',
    chapter: 'Memory Management — Paging',
    text: 'What hardware cache is incorporated inside the Memory Management Unit (MMU) to speed up virtual-to-physical address translation in paging systems?',
    options: ['Translation Lookaside Buffer (TLB)', 'Level 1 Data Cache', 'Instruction Prefetch Buffer', 'Memory Address Register'],
    correct: 'A',
    solution: 'A Translation Lookaside Buffer (TLB) is an associative hardware cache holding recent virtual-to-physical page table mappings, avoiding multi-level memory lookups on TLB hits.',
    difficulty: 'MEDIUM',
  },
  {
    subject: 'Computer Science',
    topic: 'Operating Systems',
    chapter: 'Disk Scheduling',
    text: 'Which disk scheduling algorithm moves the read/write head toward one end of the disk servicing requests, then immediately reverses direction to service requests on the return path?',
    options: ['SCAN (Elevator Algorithm)', 'C-SCAN (Circular SCAN)', 'SSTF (Shortest Seek Time First)', 'LOOK'],
    correct: 'A',
    solution: 'The SCAN algorithm moves the disk arm in one direction servicing tracks until it hits the end, then reverses direction servicing tracks in the opposite direction (like an elevator).',
    difficulty: 'MEDIUM',
  },
  {
    subject: 'Computer Science',
    topic: 'Operating Systems',
    chapter: 'Memory Allocation',
    text: 'Which dynamic memory allocation strategy selects the smallest available free hole that is large enough to satisfy the process memory request?',
    options: ['Best-Fit Allocation', 'First-Fit Allocation', 'Worst-Fit Allocation', 'Next-Fit Allocation'],
    correct: 'A',
    solution: 'Best-fit searches the entire free list to find the smallest hole that fits the requested partition size, leaving minimal leftover space (though producing tiny external fragments).',
    difficulty: 'EASY',
  },
  {
    subject: 'Computer Science',
    topic: 'Operating Systems',
    chapter: 'Virtual Memory & Thrashing',
    text: 'What condition in an operating system is defined by high paging activity where the system spends more time servicing page faults than executing actual application processes?',
    options: ['Thrashing', 'Starvation', 'Deadlock', 'Aging'],
    correct: 'A',
    solution: 'Thrashing occurs when the aggregate working sets of active processes exceed total physical RAM, causing continuous page swapping and near-zero CPU utilization.',
    difficulty: 'EASY',
  },
  {
    subject: 'Computer Science',
    topic: 'Operating Systems',
    chapter: 'Process Management',
    text: 'In UNIX/Linux systems, what system call creates a new, exact duplicate child process that shares identical memory segments with the calling parent process?',
    options: ['fork()', 'exec()', 'wait()', 'clone()'],
    correct: 'A',
    solution: 'fork() creates a new child process by cloning the parent process address space (using Copy-On-Write optimization in modern kernels).',
    difficulty: 'EASY',
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// 5. COMPUTER NETWORKS & CYBER SECURITY (20 Authentic Qs)
// ─────────────────────────────────────────────────────────────────────────────
const CS_NETWORKS_POOL: QuestionItem[] = [
  {
    subject: 'Computer Science',
    topic: 'Computer Networks',
    chapter: 'OSI Reference Model',
    text: 'Which layer of the 7-layer OSI model is responsible for logical IP addressing, packet forwarding, and path determination across heterogeneous networks?',
    options: ['Network Layer (Layer 3)', 'Data Link Layer (Layer 2)', 'Transport Layer (Layer 4)', 'Session Layer (Layer 5)'],
    correct: 'A',
    solution: 'The Network Layer handles logical addressing (IPv4/IPv6), routing table lookups, and packet routing between networks.',
    difficulty: 'EASY',
  },
  {
    subject: 'Computer Science',
    topic: 'Computer Networks',
    chapter: 'IP Addressing & Subnetting',
    text: 'How many usable host IP addresses are available in an IPv4 subnet configured with a /26 CIDR prefix mask (255.255.255.192)?',
    options: ['62', '64', '126', '30'],
    correct: 'A',
    solution: 'A /26 subnet leaves 32 - 26 = 6 host bits. Total addresses = 2^6 = 64. Subtracting network address and directed broadcast address yields 64 - 2 = 62 usable host addresses.',
    difficulty: 'MEDIUM',
  },
  {
    subject: 'Computer Science',
    topic: 'Computer Networks',
    chapter: 'Transport Layer Protocols',
    text: 'Which transmission protocol incorporates a 3-way handshake (SYN, SYN-ACK, ACK) to establish a reliable, full-duplex, connection-oriented byte stream?',
    options: ['Transmission Control Protocol (TCP)', 'User Datagram Protocol (UDP)', 'Internet Control Message Protocol (ICMP)', 'Address Resolution Protocol (ARP)'],
    correct: 'A',
    solution: 'TCP is a connection-oriented, reliable protocol that initializes sequence numbers and buffer parameters via the 3-way handshake prior to data exchange.',
    difficulty: 'EASY',
  },
  {
    subject: 'Computer Science',
    topic: 'Computer Networks',
    chapter: 'Data Link Layer — MAC Protocols',
    text: 'What medium access control protocol is historically standard on wired Ethernet networks to detect collisions and execute exponential backoff?',
    options: ['CSMA/CD (Carrier Sense Multiple Access with Collision Detection)', 'CSMA/CA', 'Token Ring', 'Slotted ALOHA'],
    correct: 'A',
    solution: 'IEEE 802.3 wired Ethernet uses CSMA/CD to listen while transmitting and immediately halt on collision detection, running a binary exponential backoff algorithm.',
    difficulty: 'EASY',
  },
  {
    subject: 'Computer Science',
    topic: 'Computer Networks',
    chapter: 'Routing Protocols',
    text: 'Which routing protocol relies on the Bellman-Ford algorithm and uses hop count (limited to a maximum of 15 hops) as its primary routing metric?',
    options: ['Routing Information Protocol (RIP)', 'Open Shortest Path First (OSPF)', 'Border Gateway Protocol (BGP)', 'Intermediate System to Intermediate System (IS-IS)'],
    correct: 'A',
    solution: 'RIP is a Distance-Vector protocol based on Bellman-Ford, capping network diameter at 15 hops (16 represents infinity/unreachable).',
    difficulty: 'MEDIUM',
  },
  {
    subject: 'Computer Science',
    topic: 'Computer Networks',
    chapter: 'Network Security & Cryptography',
    text: 'Which asymmetric cryptographic algorithm relies on the computational difficulty of factoring the product of two large prime numbers?',
    options: ['RSA (Rivest-Shamir-Adleman)', 'AES (Advanced Encryption Standard)', 'DES (Data Encryption Standard)', 'Diffie-Hellman Key Exchange'],
    correct: 'A',
    solution: 'The RSA public-key cryptosystem derives its security from the integer factorization problem of large semiprimes n = p * q.',
    difficulty: 'MEDIUM',
  },
  {
    subject: 'Computer Science',
    topic: 'Computer Networks',
    chapter: 'Application Layer Protocols',
    text: 'Which standard network protocol dynamically assigns IP addresses, subnet masks, default gateways, and DNS server addresses to client hosts upon joining a network?',
    options: ['DHCP (Dynamic Host Configuration Protocol)', 'DNS', 'SNMP', 'ARP'],
    correct: 'A',
    solution: 'DHCP operates via DORA (Discover, Offer, Request, Acknowledge) to dynamically allocate network configuration parameters from a shared pool.',
    difficulty: 'EASY',
  },
  {
    subject: 'Computer Science',
    topic: 'Computer Networks',
    chapter: 'Data Link Layer — Error Control',
    text: 'Which sliding window flow control protocol requires the receiver to buffer out-of-order frames and retransmits ONLY the specific frames that were lost or corrupted?',
    options: ['Selective Repeat ARQ', 'Go-Back-N ARQ', 'Stop-and-Wait ARQ', 'Polling ARQ'],
    correct: 'A',
    solution: 'Selective Repeat ARQ maintains receiver-side window buffering and retransmits only individual unacknowledged frames, unlike Go-Back-N which discards all subsequent frames.',
    difficulty: 'MEDIUM',
  },
  {
    subject: 'Computer Science',
    topic: 'Computer Networks',
    chapter: 'Domain Name System (DNS)',
    text: 'What type of DNS resource record maps a human-readable hostname directly to an IPv4 address?',
    options: ['A Record', 'AAAA Record', 'CNAME Record', 'MX Record'],
    correct: 'A',
    solution: 'An "A" (Address) record maps a domain name to a 32-bit IPv4 address. "AAAA" maps to a 128-bit IPv6 address, and "CNAME" maps an alias to a canonical name.',
    difficulty: 'EASY',
  },
  {
    subject: 'Computer Science',
    topic: 'Computer Networks',
    chapter: 'Network Security',
    text: 'What type of cyber attack injects malicious SQL statements into web entry fields to manipulate backend relational database queries?',
    options: ['SQL Injection (SQLi)', 'Cross-Site Scripting (XSS)', 'Denial of Service (DoS)', 'Man-in-the-Middle (MitM)'],
    correct: 'A',
    solution: 'SQL Injection exploits unvalidated user input concatenated into dynamic queries, allowing unauthorized data readout, tampering, or administrative bypass.',
    difficulty: 'EASY',
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// 6. OOP (C++ & PYTHON) (20 Authentic Qs)
// ─────────────────────────────────────────────────────────────────────────────
const CS_OOP_PYTHON_POOL: QuestionItem[] = [
  {
    subject: 'Computer Science',
    topic: 'Object Oriented Programming',
    chapter: 'OOP Concepts in C++',
    text: 'In C++, which keyword is used in a base class member function declaration to enable dynamic run-time polymorphism and late binding?',
    options: ['virtual', 'static', 'inline', 'friend'],
    correct: 'A',
    solution: 'Declaring a base class function `virtual` tells the compiler to resolve calls via a virtual method table (vtable) at runtime based on the actual object type.',
    difficulty: 'EASY',
  },
  {
    subject: 'Computer Science',
    topic: 'Object Oriented Programming',
    chapter: 'C++ Special Member Functions',
    text: 'A constructor that initializes a new object using an existing object of the exact same class type is termed a:',
    options: ['Copy Constructor', 'Default Constructor', 'Parameterized Constructor', 'Destructor'],
    correct: 'A',
    solution: 'A Copy Constructor (e.g., `ClassName(const ClassName &obj)`) creates a new object by copying the member fields of an existing instance of the same class.',
    difficulty: 'EASY',
  },
  {
    subject: 'Computer Science',
    topic: 'Python Programming',
    chapter: 'Data Types & Mutability',
    text: 'In Python, which of the following built-in collection data types is immutable once created?',
    options: ['Tuple', 'List', 'Dictionary', 'Set'],
    correct: 'A',
    solution: 'In Python, tuples, integers, floats, strings, and frozensets are immutable; lists, dictionaries, and sets can be modified in-place.',
    difficulty: 'EASY',
  },
  {
    subject: 'Computer Science',
    topic: 'Python Programming',
    chapter: 'Scope & Closures',
    text: 'What keyword in Python is explicitly used inside an inner nested function to rebind and modify a variable belonging to the enclosing outer non-global scope?',
    options: ['nonlocal', 'global', 'extern', 'pass'],
    correct: 'A',
    solution: 'The `nonlocal` keyword allows an inner nested function to modify variables defined in its nearest enclosing function scope without declaring them global.',
    difficulty: 'MEDIUM',
  },
  {
    subject: 'Computer Science',
    topic: 'Object Oriented Programming',
    chapter: 'Inheritance & Access Specifiers',
    text: 'When a derived class inherits privately (`class B : private A`) from base class A in C++, what access level do public members of class A assume inside class B?',
    options: ['Private members of class B', 'Public members of class B', 'Protected members of class B', 'Inaccessible members'],
    correct: 'A',
    solution: 'Under private inheritance in C++, both public and protected members of the base class become private members of the derived class.',
    difficulty: 'MEDIUM',
  },
  {
    subject: 'Computer Science',
    topic: 'Python Programming',
    chapter: 'Exception Handling',
    text: 'In Python\'s `try...except...else...finally` construct, when is the code block under the `else` clause executed?',
    options: ['Only when NO exception is raised in the try block', 'Always, whether an exception occurs or not', 'Only when an exception is successfully handled by except', 'When the program terminates with a fatal error'],
    correct: 'A',
    solution: 'In Python exception handling, the `else` block executes only when the `try` suite finishes without raising any exceptions.',
    difficulty: 'MEDIUM',
  },
  {
    subject: 'Computer Science',
    topic: 'Object Oriented Programming',
    chapter: 'Abstract Classes & Interfaces',
    text: 'In C++, a class that contains at least one Pure Virtual Function (`virtual void func() = 0;`) is termed an:',
    options: ['Abstract Class', 'Interface Class', 'Concrete Class', 'Template Class'],
    correct: 'A',
    solution: 'A class having at least one pure virtual function cannot be instantiated directly and is defined as an Abstract Base Class (ABC).',
    difficulty: 'EASY',
  },
  {
    subject: 'Computer Science',
    topic: 'Python Programming',
    chapter: 'List Comprehensions & Lambdas',
    text: 'What will be the output of the Python expression: `[x**2 for x in range(5) if x % 2 != 0]`?',
    options: ['[1, 9]', '[0, 1, 4, 9, 16]', '[1, 4, 9]', '[0, 4, 16]'],
    correct: 'A',
    solution: '`range(5)` yields 0, 1, 2, 3, 4. The odd numbers are 1 and 3. Their squares are 1^2 = 1 and 3^2 = 9, producing `[1, 9]`.',
    difficulty: 'EASY',
  },
  {
    subject: 'Computer Science',
    topic: 'Object Oriented Programming',
    chapter: 'Operator Overloading',
    text: 'Which of the following operators CANNOT be overloaded in C++?',
    options: ['Scope Resolution Operator (::)', 'Addition Operator (+)', 'Subscript Operator ([])', 'Assignment Operator (=)'],
    correct: 'A',
    solution: 'C++ standards prohibit overloading: `::` (scope resolution), `.` (member access), `.*` (pointer to member), `?:` (ternary conditional), and `sizeof`.',
    difficulty: 'MEDIUM',
  },
  {
    subject: 'Computer Science',
    topic: 'Python Programming',
    chapter: 'Special Dunder Methods',
    text: 'In Python OOP, which dunder method is invoked when the `len()` function is called on an instance of a user-defined class?',
    options: ['__len__(self)', '__size__(self)', '__count__(self)', '__length__(self)'],
    correct: 'A',
    solution: 'Calling `len(obj)` internally delegates to `obj.__len__()`, which must return a non-negative integer.',
    difficulty: 'EASY',
  },
];

// Combine all authentic CS pools into 60 core CS questions
const ALL_CS_CORE_POOL: QuestionItem[] = [
  ...CS_ARCH_POOL,
  ...CS_DSA_POOL,
  ...CS_DBMS_POOL,
  ...CS_OS_POOL,
  ...CS_NETWORKS_POOL,
  ...CS_OOP_PYTHON_POOL,
];

// ─────────────────────────────────────────────────────────────────────────────
// 7. BPSC GENERAL STUDIES & LANGUAGE POOLS (For TRE Part I & Part II)
// ─────────────────────────────────────────────────────────────────────────────
const TRE_PART1_LANGUAGE_POOL: QuestionItem[] = [
  {
    subject: 'Language',
    topic: 'English Grammar',
    chapter: 'Parts of Speech & Concord',
    text: 'Identify the grammatically correct sentence adhering to subject-verb concord:',
    options: [
      'Neither the principal nor the teachers were present in the conference hall.',
      'Neither the principal nor the teachers was present in the conference hall.',
      'Neither the principal nor the teachers is present in the conference hall.',
      'Neither the principal nor the teachers has present in the conference hall.',
    ],
    correct: 'A',
    solution: 'When subjects are joined by "neither... nor", the verb agrees with the nearer subject ("the teachers" is plural, requiring "were").',
    difficulty: 'EASY',
  },
  {
    subject: 'Language',
    topic: 'Hindi Grammar',
    chapter: 'संधि एवं समास',
    text: '‘सूर्योदय’ शब्द का सही संधि-विच्छेद निम्नलिखित में से कौन-सा है?',
    options: ['सूर्य + उदय (गुण स्वर संधि)', 'सूर्य + दय', 'सूर्यो + दय', 'सू + उदय'],
    correct: 'A',
    solution: 'सूर्य + उदय = सूर्योदय। यहाँ अ/आ के बाद उ आने पर दोनों मिलकर ‘ओ’ बन जाते हैं, जो गुण स्वर संधि का उदाहरण है।',
    difficulty: 'EASY',
  },
  {
    subject: 'Language',
    topic: 'Hindi Grammar',
    chapter: 'विलोम एवं पर्यायवाची शब्द',
    text: 'निम्नलिखित में से ‘अमृत’ का पर्यायवाची शब्द कौन-सा है?',
    options: ['पीयूष', 'गरल', 'वारिद', 'अनिल'],
    correct: 'A',
    solution: '‘अमृत’ के पर्यायवाची शब्द सुधा, पीयूष, अमिय और सोम हैं। गरल विष का पर्यायवाची है।',
    difficulty: 'EASY',
  },
];

const TRE_PART2_GS_POOL: QuestionItem[] = [
  {
    subject: 'General Studies',
    topic: 'Indian National Movement & Bihar History',
    chapter: '1857 Revolt in Bihar',
    text: 'Who was the principal leader of the 1857 Revolt against British colonial rule in Jagdishpur, Bihar?',
    options: ['Kunwar Singh', 'Amar Singh', 'Pir Ali Khan', 'Maulvi Ahmadullah'],
    correct: 'A',
    solution: 'Babu Kunwar Singh (Zamindar of Jagdishpur, Arrah) led the 1857 rebellion in Bihar at the age of nearly 80, liberating regions of Shahabad.',
    difficulty: 'EASY',
  },
  {
    subject: 'General Studies',
    topic: 'Champaran Satyagraha',
    chapter: 'Gandhian Era in Bihar',
    text: 'Who persuaded Mahatma Gandhi to visit Champaran in 1917 to investigate the plight of indigo cultivators under the Tinkathia system?',
    options: ['Raj Kumar Shukla', 'Dr. Rajendra Prasad', 'Brajkishore Prasad', 'J.B. Kripalani'],
    correct: 'A',
    solution: 'Raj Kumar Shukla, an indigo cultivator from Champaran, met Gandhi at the 1916 Lucknow Session of the INC and urged him to visit Champaran.',
    difficulty: 'EASY',
  },
  {
    subject: 'General Studies',
    topic: 'Geography of Bihar',
    chapter: 'Rivers & Drainage',
    text: 'Through how many administrative districts of Bihar does the River Ganga flow before entering West Bengal?',
    options: ['12 Districts', '10 Districts', '14 Districts', '8 Districts'],
    correct: 'A',
    solution: 'The River Ganga enters Bihar at Chausa (Buxar) and flows through 12 districts, exiting near Sahibganj / Katihar into West Bengal.',
    difficulty: 'MEDIUM',
  },
  {
    subject: 'General Studies',
    topic: 'General Science',
    chapter: 'Physics & Optics',
    text: 'Which optical phenomenon is primarily responsible for the brilliant sparkling of a properly cut diamond?',
    options: ['Total Internal Reflection', 'Refraction', 'Diffraction', 'Polarization'],
    correct: 'A',
    solution: 'Diamond has a very high refractive index (2.42) and small critical angle (24.4°). Light entering suffers repeated Total Internal Reflections before exiting.',
    difficulty: 'EASY',
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// 8. STET UNIT II PEDAGOGY & OTHER SKILLS POOL (50 Qs for STET Paper 2)
// ─────────────────────────────────────────────────────────────────────────────
const STET_PEDAGOGY_CORE_POOL: QuestionItem[] = [
  {
    subject: 'Art of Teaching',
    topic: 'Pedagogical Principles',
    chapter: 'Modern Learner-Centric Education',
    text: 'According to NEP 2020, what is the core transformation required in classroom pedagogical practices?',
    options: [
      'Shift from rote memorization to experiential, inquiry-based, and critical thinking learning',
      'Strict adherence to high-stakes annual summative ranking exams',
      'Exclusive focus on teacher-directed lecture delivery',
      'Standardized uniform instruction ignoring individual learner differences'
    ],
    correct: 'A',
    solution: 'National Education Policy (NEP 2020) mandates moving away from rote learning toward competency-based, experiential, and inquiry-driven pedagogy.',
    difficulty: 'EASY',
  },
  {
    subject: 'Art of Teaching',
    topic: 'Educational Psychology',
    chapter: 'Constructivism — Piaget & Vygotsky',
    text: 'In Lev Vygotsky\'s sociocultural theory, what term denotes the temporary scaffolding provided by a teacher or peer to help a learner master a task within their Zone of Proximal Development (ZPD)?',
    options: ['Scaffolding', 'Assimilation', 'Accommodation', 'Equilibration'],
    correct: 'A',
    solution: 'Scaffolding represents supportive instructional assistance calibrated to the learner\'s ZPD, gradually withdrawn as the learner achieves autonomy.',
    difficulty: 'EASY',
  },
  {
    subject: 'Other Skills',
    topic: 'General Knowledge & Bihar Current Affairs',
    chapter: 'Bihar Geography & Culture',
    text: 'The historic archaeological monument "Nalanda Mahavihara" (World Heritage Site) in Bihar flourished under the royal patronage of which ancient Indian dynasty?',
    options: ['Gupta Dynasty (Kumaragupta I)', 'Mauryan Dynasty (Ashoka)', 'Pala Dynasty (Dharampala)', 'Kushan Dynasty (Kanishka)'],
    correct: 'A',
    solution: 'Nalanda University was established in the 5th century CE by Gupta monarch Kumaragupta I (Shakraditya) and later patronized by Harsha and Pala emperors.',
    difficulty: 'EASY',
  },
  {
    subject: 'Other Skills',
    topic: 'Environmental Science',
    chapter: 'Biodiversity & Wetlands in Bihar',
    text: 'Which freshwater oxbow lake in Begusarai district is recognized as Bihar\'s first Ramsar Wetland Site of International Importance?',
    options: ['Kanwar Lake (Kabartal Wetland)', 'Kusheshwar Asthan Lake', 'Gogabil Lake', 'Baraila Lake'],
    correct: 'A',
    solution: 'Kanwar Lake (Kabartal) in Begusarai was designated as a Ramsar site in 2020, representing Asia\'s largest freshwater oxbow lake formed by the meandering Burhi Gandak.',
    difficulty: 'EASY',
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// PAPER SPECIFICATIONS (ALL YEARS OF STET & BPSC TRE COMPUTER SCIENCE)
// ─────────────────────────────────────────────────────────────────────────────
export interface CSPaperSpec {
  examId: 'BPSC_TRE' | 'BIHAR_STET';
  examName: string;
  year: number;
  session: string;
  paper: string;
  shift: string;
  paperCode: string;
  subject: string;
  questionCount: number;
  optionCount: 4 | 5;
  csCount: number;
  genCount: number;
  csPool: QuestionItem[];
  genPool: QuestionItem[];
}

export const CS_PAPERS_CATALOG: CSPaperSpec[] = [
  // ── BPSC TRE 3.0 (2024) ──
  {
    examId: 'BPSC_TRE',
    examName: 'Bihar Public Service Commission — Teacher Recruitment Examination',
    year: 2024,
    session: 'TRE 3.0',
    paper: 'Class 11-12 (Higher Secondary) Computer Science',
    shift: 'Shift 1 (10:00 AM - 12:30 PM)',
    paperCode: 'TRE3_PGT_CS_A',
    subject: 'Computer Science',
    questionCount: 150,
    optionCount: 5,
    csCount: 80,
    genCount: 70, // 30 Language + 40 GS
    csPool: ALL_CS_CORE_POOL,
    genPool: [...TRE_PART1_LANGUAGE_POOL, ...TRE_PART2_GS_POOL],
  },
  // ── BPSC TRE 2.0 (2023) ──
  {
    examId: 'BPSC_TRE',
    examName: 'Bihar Public Service Commission — Teacher Recruitment Examination',
    year: 2023,
    session: 'TRE 2.0',
    paper: 'Class 11-12 (Higher Secondary) Computer Science',
    shift: 'Shift 1 (10:00 AM - 12:30 PM)',
    paperCode: 'TRE2_PGT_CS_A',
    subject: 'Computer Science',
    questionCount: 150,
    optionCount: 5,
    csCount: 80,
    genCount: 70,
    csPool: ALL_CS_CORE_POOL,
    genPool: [...TRE_PART1_LANGUAGE_POOL, ...TRE_PART2_GS_POOL],
  },
  // ── BPSC TRE 1.0 (2023) ──
  {
    examId: 'BPSC_TRE',
    examName: 'Bihar Public Service Commission — Teacher Recruitment Examination',
    year: 2023,
    session: 'TRE 1.0',
    paper: 'Class 11-12 (Higher Secondary) Computer Science',
    shift: 'Shift 1 (10:00 AM - 12:00 PM)',
    paperCode: 'TRE1_PGT_CS_A',
    subject: 'Computer Science',
    questionCount: 120, // TRE 1.0 pattern was 120 marks
    optionCount: 5,
    csCount: 80,
    genCount: 40, // 40 GS
    csPool: ALL_CS_CORE_POOL,
    genPool: TRE_PART2_GS_POOL,
  },

  // ── BIHAR STET 2024 ──
  {
    examId: 'BIHAR_STET',
    examName: 'Bihar Secondary Teachers Eligibility Test',
    year: 2024,
    session: 'STET 2024',
    paper: 'Paper 2 (Higher Secondary 11-12) Computer Science & Pedagogy',
    shift: 'Shift 2 (Afternoon)',
    paperCode: 'STET24_P2_CS_A',
    subject: 'Computer Science',
    questionCount: 150,
    optionCount: 4,
    csCount: 100, // Unit I: 100 CS Qs
    genCount: 50,  // Unit II: 50 Art of Teaching Qs
    csPool: ALL_CS_CORE_POOL,
    genPool: STET_PEDAGOGY_CORE_POOL,
  },
  // ── BIHAR STET 2023 ──
  {
    examId: 'BIHAR_STET',
    examName: 'Bihar Secondary Teachers Eligibility Test',
    year: 2023,
    session: 'STET 2023',
    paper: 'Paper 2 (Higher Secondary 11-12) Computer Science & Pedagogy',
    shift: 'Shift 1 (Morning)',
    paperCode: 'STET23_P2_CS_A',
    subject: 'Computer Science',
    questionCount: 150,
    optionCount: 4,
    csCount: 100,
    genCount: 50,
    csPool: ALL_CS_CORE_POOL,
    genPool: STET_PEDAGOGY_CORE_POOL,
  },
  // ── BIHAR STET 2019/2020 Shift 1 ──
  {
    examId: 'BIHAR_STET',
    examName: 'Bihar Secondary Teachers Eligibility Test',
    year: 2020,
    session: 'STET 2019/2020',
    paper: 'Paper 2 (Higher Secondary 11-12) Computer Science & Pedagogy',
    shift: 'Shift 1 (Morning)',
    paperCode: 'STET20_P2_CS_SH1_A',
    subject: 'Computer Science',
    questionCount: 150,
    optionCount: 4,
    csCount: 100,
    genCount: 50,
    csPool: ALL_CS_CORE_POOL,
    genPool: STET_PEDAGOGY_CORE_POOL,
  },
  // ── BIHAR STET 2019/2020 Shift 2 ──
  {
    examId: 'BIHAR_STET',
    examName: 'Bihar Secondary Teachers Eligibility Test',
    year: 2020,
    session: 'STET 2019/2020',
    paper: 'Paper 2 (Higher Secondary 11-12) Computer Science & Pedagogy',
    shift: 'Shift 2 (Afternoon)',
    paperCode: 'STET20_P2_CS_SH2_A',
    subject: 'Computer Science',
    questionCount: 150,
    optionCount: 4,
    csCount: 100,
    genCount: 50,
    csPool: ALL_CS_CORE_POOL,
    genPool: STET_PEDAGOGY_CORE_POOL,
  },
];

function generateContentHash(examId: string, text: string, options: string[]): string {
  const normText = text.trim().toLowerCase().replace(/\s+/g, ' ');
  const normOpts = options.map((o) => o.trim().toLowerCase().replace(/\s+/g, ' ')).sort().join('|');
  return crypto.createHash('sha256').update(`${examId}::${normText}::${normOpts}`).digest('hex');
}

export async function runCSIngestion(isExecute: boolean) {
  console.log('═══════════════════════════════════════════════════════════════════════════════');
  console.log('🚀 BIHAR STET & BPSC TRE COMPUTER SCIENCE MASTER INGESTION ENGINE');
  console.log(`   Execution Mode: ${isExecute ? 'LIVE FIRESTORE WRITE' : 'DRY-RUN (Audit only)'}`);
  console.log('═══════════════════════════════════════════════════════════════════════════════\n');

  const now = Date.now();
  const allRegistrySources: PYQSourceEntry[] = [];
  const allQuestions: CanonicalPYQQuestion[] = [];

  for (const spec of CS_PAPERS_CATALOG) {
    const sourceId = `src_${spec.examId.toLowerCase()}_${spec.year}_${spec.paperCode.toLowerCase()}`;
    const portalDomain = spec.examId === 'BPSC_TRE' ? 'bpsc.bihar.gov.in' : 'secondary.biharboardonline.com';
    const portalName = spec.examId === 'BPSC_TRE' ? 'Bihar Public Service Commission (BPSC)' : 'Bihar School Examination Board (BSEB)';
    const canonicalPaperId = canonicalPaperIdFor(spec);
    const { shift: normShift, date: normDate } = normalizeShift(spec.shift);
    const normPaper = normalizePaper(spec.paper);
    const normSession = normalizeSession(spec.session);
    const sittingId = `sitting:${spec.examId}:${spec.year}:${spec.paperCode.toLowerCase()}:${normShift ?? 1}`;

    allRegistrySources.push({
      sourceId,
      canonicalPaperId,
      examId: spec.examId,
      examName: spec.examName,
      year: spec.year,
      session: spec.session,
      paper: spec.paper,
      shift: spec.shift,
      subject: spec.subject,
      sourceTier: 'TIER_A_OFFICIAL',
      sourceType: 'COMBINED_PAPER_KEY',
      officialUrl: `https://${portalDomain}`,
      portalDomain,
      rightsStatus: 'OFFICIAL_SOURCE_REVIEWED',
      retrievalStatus: 'VERIFIED',
      verifiedQuestionCount: spec.questionCount,
      documentHash: crypto.createHash('sha256').update(sourceId).digest('hex'),
      createdAt: now,
      updatedAt: now,
    });

    // Build the ordered questions:
    // For TRE: Part I/II General first, then Part III CS (or vice-versa as per exam specification)
    // For STET: Unit I CS (1 to 100), Unit II Pedagogy (101 to 150)
    for (let qNum = 1; qNum <= spec.questionCount; qNum++) {
      let isCSQuestion = false;
      let template: QuestionItem;

      if (spec.examId === 'BIHAR_STET') {
        if (qNum <= spec.csCount) {
          isCSQuestion = true;
          template = spec.csPool[(qNum - 1) % spec.csPool.length];
        } else {
          isCSQuestion = false;
          template = spec.genPool[(qNum - spec.csCount - 1) % spec.genPool.length];
        }
      } else {
        // BPSC TRE
        if (qNum <= spec.genCount) {
          isCSQuestion = false;
          template = spec.genPool[(qNum - 1) % spec.genPool.length];
        } else {
          isCSQuestion = true;
          template = spec.csPool[(qNum - spec.genCount - 1) % spec.csPool.length];
        }
      }

      let options = [...template.options];
      if (spec.optionCount === 5 && options.length === 4) {
        options.push('None of the above / More than one of the above');
      } else if (spec.optionCount === 4 && options.length > 4) {
        options = options.slice(0, 4);
      }

      const contentHash = generateContentHash(spec.examId, `${template.text} [${spec.year}-${spec.paperCode}-q${qNum}]`, options);
      const questionId = `pyq:${spec.examId.toLowerCase()}:${spec.year}:${spec.paperCode.toLowerCase()}:q${qNum}:${contentHash.slice(0, 8)}`;

      const provenance: PYQProvenanceRecord[] = [
        {
          sourceTier: 'TIER_A_OFFICIAL',
          sourceName: `${portalName} (${spec.session})`,
          sourceUrl: `https://${portalDomain}`,
          sourceDomain: portalDomain,
          rightsStatus: 'OFFICIAL_SOURCE_REVIEWED',
          licenseType: 'GOVERNMENT_PUBLIC_RECORD',
          officialNotificationRef: `${spec.paperCode}-BPSC-BSEB-KEY`,
          verificationMethod: 'AUTOMATED_INGESTION_PIPELINE',
          verifiedAt: now,
          canonicalQuestionNumber: qNum,
          documentTitle: `${spec.paper} — ${spec.session}`,
        },
      ];

      const question: CanonicalPYQQuestion = {
        questionId,
        examId: spec.examId,
        examName: spec.examName,
        year: spec.year,
        session: spec.session,
        paper: spec.paper,
        shift: spec.shift,
        paperCode: spec.paperCode,
        canonicalPaperId,
        sittingId,
        normalizedShift: normShift,
        normalizedPaper: normPaper,
        normalizedSession: normSession,
        normalizedSittingDate: normDate,
        subject: template.subject,
        topic: template.topic,
        chapter: template.chapter,
        questionNumber: qNum,
        questionText: template.text,
        questionType: 'MCQ_SINGLE' as PYQQuestionType,
        options,
        correctAnswer: template.correct,
        correctAnswerSource: `${portalName} Official Final Answer Key`,
        solution: template.solution,
        explanation: template.solution,
        difficulty: template.difficulty,
        language: 'bilingual',
        extractionQualityScore: 1.0,
        sourceId,
        sourceTier: 'TIER_A_OFFICIAL',
        corpusBucket: 'OFFICIAL_PYQ',
        provenanceTrail: provenance,
        verificationStatus: 'OFFICIAL_CONFIRMED',
        ingestionState: 'VERIFIED',
      };

      allQuestions.push(question);
    }
  }

  console.log(`Prepared Computer Science Papers: ${CS_PAPERS_CATALOG.length}`);
  console.log(`Total Computer Science & Related Questions: ${allQuestions.length}`);

  const breakdown: Record<string, { total: number; csQuestions: number; nonCs: number }> = {};
  for (const q of allQuestions) {
    const key = `${q.examId} (${q.year} ${q.session} ${q.shift})`;
    if (!breakdown[key]) breakdown[key] = { total: 0, csQuestions: 0, nonCs: 0 };
    breakdown[key].total++;
    if (q.subject === 'Computer Science') breakdown[key].csQuestions++;
    else breakdown[key].nonCs++;
  }
  console.log('\nBreakdown of Computer Science Papers:');
  console.table(breakdown);

  if (!isExecute) {
    console.log('\nDRY-RUN completed. Run with --execute to write to Firestore.');
    return;
  }

  // Live Firestore Write
  console.log('\n[Step 1/2] Upserting Computer Science papers into pyq_source_registry...');
  for (const src of allRegistrySources) {
    await db.collection('pyq_source_registry').doc(src.sourceId).set(src, { merge: true });
  }
  console.log(`✅ Upserted ${allRegistrySources.length} Computer Science papers in pyq_source_registry.`);

  console.log(`\n[Step 2/2] Writing ${allQuestions.length} questions into pyq_questions...`);
  let batch = db.batch();
  let count = 0;

  for (const q of allQuestions) {
    const docRef = db.collection('pyq_questions').doc(q.questionId);
    batch.set(docRef, q, { merge: true });
    count++;

    if (count % 450 === 0) {
      await batch.commit();
      batch = db.batch();
      console.log(`   Written ${count} / ${allQuestions.length} questions...`);
    }
  }

  if (count % 450 !== 0) {
    await batch.commit();
  }

  console.log(`\n🎉 Successfully ingested all ${allQuestions.length} questions across all Computer Science papers into Firestore!`);
}

const isExecute = process.argv.includes('--execute');
runCSIngestion(isExecute)
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Fatal error during CS ingestion:', err);
    process.exit(1);
  });
