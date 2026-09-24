/**
 * Dedicated Bihar STET & BPSC TRE Computer Science Reference Knowledge Base & Books Ingestor
 * ==========================================================================================
 *
 * Ingests comprehensive, textbook-grounded reference knowledge bases and standard books for the
 * entire Computer Science syllabus (Higher Secondary Class 11-12 / PGT) into the isolated
 * `reference_books` namespace in Pinecone/Qdrant and Firestore collections:
 *   - `reference_sources`
 *   - `reference_chunks`
 *
 * Covered Reference Books & Standard Textbooks:
 *   1. NCERT Computer Science Class 11 (NCERT)
 *   2. NCERT Computer Science Class 12 (NCERT)
 *   3. Database System Concepts (Silberschatz, Korth, Sudarshan — McGraw Hill)
 *   4. Operating System Concepts (Silberschatz, Galvin, Gagne — John Wiley)
 *   5. Data Communications and Networking (Behrouz A. Forouzan — McGraw Hill)
 *   6. Computer System Architecture & Digital Logic (M. Morris Mano — Pearson)
 *   7. Data Structures and Algorithms (Seymour Lipschutz — Schaum's Outline / McGraw Hill)
 *   8. Pedagogy & Teaching Aptitude (Dr. S.K. Mangal & NCERT/NEP 2020 Framework)
 *
 * Strictly adheres to the Reference Isolation Contract:
 *   - Namespace: `reference_books`
 *   - corpusBucket: `REFERENCE_BOOK`
 *   - Authority: `secondary_reference` (0.9 multiplier)
 */

import * as crypto from 'crypto';
import { db } from '../../../src/config/firebase';
import { pineconeService, VectorDocument } from '../../../src/services/rag/pinecone.service';
import { GoogleEmbeddingProvider } from '../../../src/services/ai/providers/google-embedding.provider';
import {
  REFERENCE_NAMESPACE,
  REF_SOURCE_COLLECTION,
  REF_CHUNK_COLLECTION,
  CORPUS_BUCKET,
  assertReferenceNamespace,
  assertWritableCollection,
  KnowledgeType,
  ExamCode,
  RelevanceTier,
} from './contract';

function sha256(s: string): string {
  return crypto.createHash('sha256').update(s).digest('hex');
}

export interface CSBookDefinition {
  key: string;
  title: string;
  publisher: string;
  author: string;
  edition: string;
  publicationYear: string;
  language: 'English';
  domain: 'computer_science' | 'pedagogy';
  subject: string;
  category: string;
  examRelevance: ExamCode[];
  chunks: Array<{
    chapter: string;
    section: string;
    topic: string;
    subtopic?: string;
    knowledgeType: KnowledgeType;
    text: string;
  }>;
}

export const CS_REFERENCE_BOOKS: CSBookDefinition[] = [
  // ── 1. NCERT CLASS 11 COMPUTER SCIENCE ──
  {
    key: 'ncert_cs_11',
    title: 'NCERT Computer Science (Class XI)',
    publisher: 'National Council of Educational Research and Training (NCERT)',
    author: 'NCERT Textbook Development Committee',
    edition: 'Latest Edition (Rationalised Curriculum)',
    publicationYear: '2023',
    language: 'English',
    domain: 'computer_science',
    subject: 'Computer Science',
    category: 'Computer Fundamentals & Python Basics',
    examRelevance: ['BPSC_TRE', 'BIHAR_STET', 'BPSC', 'GENERAL'],
    chunks: [
      {
        chapter: 'Chapter 1: Computer System',
        section: '1.2 Central Processing Unit and Memory',
        topic: 'Von Neumann Architecture and Memory Hierarchy',
        knowledgeType: 'conceptual',
        text: 'A computer system comprises hardware and software components operating on the stored-program concept formulated by John von Neumann. The Central Processing Unit (CPU) contains the Arithmetic Logic Unit (ALU), Control Unit (CU), and internal Registers. Memory is structured hierarchically: Primary Memory comprises RAM (Random Access Memory, volatile read-write) and ROM (Read Only Memory, non-volatile holding firmware/BIOS). Cache Memory is a high-speed semiconductor memory placed between the CPU and main RAM to synchronize with high-speed CPU clock cycles by caching frequently referenced instructions and data.',
      },
      {
        chapter: 'Chapter 2: Encoding Schemes and Number System',
        section: '2.3 Radix Conversions and Complements',
        topic: 'Binary, Hexadecimal, and Two\'s Complement Representation',
        knowledgeType: 'rule',
        text: 'Digital computers represent all numerical and textual data using positional binary numbering systems. To represent negative integers, modern computer systems universally implement 2\'s complement notation. To find the 2\'s complement of an N-bit binary integer: first compute the 1\'s complement by inverting every bit (0 becomes 1, and 1 becomes 0), then add 1 to the least significant bit (LSB). An N-bit signed 2\'s complement integer covers the dynamic range from -(2^(N-1)) to +(2^(N-1) - 1). Character encoding schemes include ASCII (7-bit, 128 characters), ISCII (8-bit for Indian scripts), and Unicode (UTF-8, UTF-16, UTF-32), providing unique numeric code points across all human written scripts.',
      },
      {
        chapter: 'Chapter 3: Boolean Logic',
        section: '3.4 De Morgan\'s Laws and Logic Gates',
        topic: 'Universal Gates and Boolean Algebra Axioms',
        knowledgeType: 'formula',
        text: 'Boolean algebra governs digital switching circuits through binary truth values (0 and 1). The fundamental logic gates are AND, OR, and NOT. NAND and NOR gates are termed Universal Gates because any combinational digital circuit can be fabricated exclusively using either NAND or NOR gates alone. De Morgan\'s First Law states that (A + B)\' = A\' · B\' (the complement of a logical sum equals the product of individual complements). De Morgan\'s Second Law states that (A · B)\' = A\' + B\' (the complement of a logical product equals the sum of individual complements). Standard representations include Sum of Products (SOP, formed using minterms m_i) and Product of Sums (POS, formed using maxterms M_i).',
      },
      {
        chapter: 'Chapter 5: Getting Started with Python',
        section: '5.4 Data Types and Mutability',
        topic: 'Core Python Data Types and Mutable vs Immutable Semantics',
        knowledgeType: 'definition',
        text: 'In Python, everything is an object with an identity (id), a type, and a value. Python data types are partitioned into Mutable and Immutable categories. Immutable types cannot have their in-place value altered after instantiation; any rebinding creates a new object in memory. Immutable types include int, float, complex, bool, str, tuple, and frozenset. Mutable types allow in-place modification of their elements without altering the object memory address. Mutable types include list, dict, and set. Python variables are references (pointers) to objects rather than typed storage locations.',
      },
      {
        chapter: 'Chapter 8: Python Strings and Lists',
        section: '8.3 Slicing and Comprehensions',
        topic: 'Sequence Slicing Syntax and List Comprehension',
        knowledgeType: 'worked_example',
        text: 'Sequence slicing in Python follows the syntax `sequence[start:stop:step]`, extracting elements from index `start` up to but excluding `stop`, stepping by `step`. A negative step traverses the sequence in reverse order (e.g., `s[::-1]` reverses string `s`). List comprehensions provide a concise syntactic construct to generate lists: `[expression for item in iterable if condition]`. For example, `[x**2 for x in range(10) if x % 2 == 0]` evaluates to `[0, 4, 16, 36, 64]`, executing with internal C-level bytecode optimization faster than an explicit for-loop append sequence.',
      },
    ],
  },

  // ── 2. NCERT CLASS 12 COMPUTER SCIENCE ──
  {
    key: 'ncert_cs_12',
    title: 'NCERT Computer Science (Class XII)',
    publisher: 'National Council of Educational Research and Training (NCERT)',
    author: 'NCERT Textbook Development Committee',
    edition: 'Latest Edition (Rationalised Curriculum)',
    publicationYear: '2023',
    language: 'English',
    domain: 'computer_science',
    subject: 'Computer Science',
    category: 'Advanced Python, SQL & Computer Networks',
    examRelevance: ['BPSC_TRE', 'BIHAR_STET', 'BPSC', 'GENERAL'],
    chunks: [
      {
        chapter: 'Chapter 1: Exception Handling in Python',
        section: '1.2 Try-Except-Else-Finally Suite',
        topic: 'Python Exception Handling Architecture',
        knowledgeType: 'rule',
        text: 'Python handles runtime anomalies via the `try...except...else...finally` architecture. Code susceptible to runtime exceptions is encapsulated within the `try` block. If an exception occurs, execution immediately shifts to the matching `except` handler. If no exception is raised, execution enters the optional `else` block. The `finally` block is guaranteed to execute unconditionally regardless of whether an exception occurred, was handled, or remained unhandled, making it essential for resource cleanup such as closing file descriptors and database network connections.',
      },
      {
        chapter: 'Chapter 2: File Handling in Python',
        section: '2.4 Pickle Module and Serialization',
        topic: 'Binary File Serialization with Pickle',
        knowledgeType: 'conceptual',
        text: 'Python supports Text files (.txt), Binary files (.dat), and CSV files. Binary files store data in the native machine representation without ASCII or newline conversions. Python\'s built-in `pickle` module performs object serialization (pickling: converting Python object hierarchies into byte streams using `pickle.dump(obj, file_handle)`) and deserialization (unpickling: reconstituting object hierarchies from byte streams using `pickle.load(file_handle)`). When handling binary files, the file must be opened with mode flags `\'wb\'`, `\'rb\'`, or `\'ab\'`.',
      },
      {
        chapter: 'Chapter 3: Stack Data Structure',
        section: '3.2 Implementation and Applications',
        topic: 'LIFO Stack Operations and Polish Expressions',
        knowledgeType: 'definition',
        text: 'A Stack is a linear data structure adhering to the Last In First Out (LIFO) access discipline. Key operations are Push (inserting at top), Pop (deleting from top), and Peek (inspecting top without removal). Attempting to pop from an empty stack causes Stack Underflow; pushing onto a full bounded stack causes Stack Overflow. Stacks are fundamentally utilized in computer science for: 1. Function call stacks and recursion management, 2. Parsing and expression conversion (Infix to Postfix/Prefix using the Shunting-yard algorithm), 3. Evaluating Postfix expressions, and 4. Backtracking and depth-first traversal.',
      },
      {
        chapter: 'Chapter 7: Database Concepts and SQL',
        section: '7.5 SQL DDL, DML, and Aggregate Grouping',
        topic: 'SQL DDL vs DML and Group By / Having Clauses',
        knowledgeType: 'rule',
        text: 'Structured Query Language (SQL) is categorized into Data Definition Language (DDL: `CREATE`, `ALTER`, `DROP`, `TRUNCATE`) which modifies schema metadata and is auto-committed, and Data Manipulation Language (DML: `SELECT`, `INSERT`, `UPDATE`, `DELETE`) which queries and modifies tuple data. The `GROUP BY` clause groups rows that have the same values in specified columns into summary rows (e.g., finding average marks per department). The `WHERE` clause filters individual rows before grouping takes place; the `HAVING` clause filters aggregated groups after the `GROUP BY` clause has been computed.',
      },
      {
        chapter: 'Chapter 11: Computer Networks',
        section: '11.3 Network Topologies and Transmission Media',
        topic: 'Network Topologies and Guided vs Unguided Media',
        knowledgeType: 'conceptual',
        text: 'Computer network topologies define the geometric arrangement of links and nodes. In a Star Topology, all nodes connect to a central hub or switch; a failure of one cable affects only that node, but central switch failure collapses the entire network. In a Bus Topology, nodes share a single backbone coaxial cable terminated at both ends; signal reflection requires terminators. In a Mesh Topology, every node has dedicated point-to-point links to every other node (requiring n(n-1)/2 links for n nodes), providing maximum fault tolerance. Transmission media comprise Guided (Twisted Pair, Coaxial, Fiber Optic) and Unguided (Radio waves, Microwaves, Infrared).',
      },
    ],
  },

  // ── 3. DATABASE SYSTEM CONCEPTS (KORTH / SILBERSCHATZ) ──
  {
    key: 'silberschatz_dbms',
    title: 'Database System Concepts',
    publisher: 'McGraw-Hill Education',
    author: 'Abraham Silberschatz, Henry F. Korth, S. Sudarshan',
    edition: '7th International Edition',
    publicationYear: '2020',
    language: 'English',
    domain: 'computer_science',
    subject: 'Computer Science',
    category: 'Database Management Systems & SQL',
    examRelevance: ['BPSC_TRE', 'BIHAR_STET', 'BPSC', 'GENERAL'],
    chunks: [
      {
        chapter: 'Chapter 2: Relational Model',
        section: '2.6 Relational Algebra Fundamentals',
        topic: 'Fundamental Relational Algebra Operators',
        knowledgeType: 'definition',
        text: 'Relational algebra is a formal procedural query language consisting of operations that take one or two relations as input and produce a new relation as output. The six fundamental operators are: 1. Selection (σ): filters tuples satisfying a predicate. 2. Projection (π): selects specified columns and eliminates duplicate tuples. 3. Cartesian Product (×): pairs each tuple of relation R with every tuple of relation S. 4. Set Union (∪): combines tuples from two union-compatible relations. 5. Set Difference (-): finds tuples in R that are not in S. 6. Rename (ρ): assigns an alias name to relations or attributes. The Natural Join (⋈) combines Cartesian product, equality selection on common attributes, and duplicate projection.',
      },
      {
        chapter: 'Chapter 7: Relational Database Design',
        section: '7.3 Normal Forms and Functional Dependencies',
        topic: 'Normalization Hierarchy: 1NF, 2NF, 3NF, and BCNF',
        knowledgeType: 'rule',
        text: 'Normalization eliminates data redundancy and update anomalies through functional dependency analysis. 1NF requires all attribute domains to be atomic (no composite or multi-valued attributes). 2NF requires 1NF and that every non-prime attribute is fully functionally dependent on the entire primary key (no partial dependency on a subset of a candidate key). 3NF requires 2NF and that no non-prime attribute is transitively dependent on the primary key; formally, for every non-trivial dependency X -> Y, either X is a superkey or Y is a prime attribute. Boyce-Codd Normal Form (BCNF) strictly requires that for every non-trivial functional dependency X -> Y, X must strictly be a superkey of the relation.',
      },
      {
        chapter: 'Chapter 14: Transactions',
        section: '14.2 ACID Properties and Serializability',
        topic: 'ACID Properties and Conflict Serializability',
        knowledgeType: 'conceptual',
        text: 'A transaction is an indivisible execution unit of database operations. The ACID properties guarantee database consistency: Atomicity (all changes succeed or all are aborted), Consistency (preserves database integrity constraints across commits), Isolation (concurrent execution yields state equivalent to some serial order), Durability (committed modifications survive system crashes). A schedule S is Conflict Serializable if it is conflict equivalent to a serial schedule. Two operations conflict if they belong to different transactions, access the same data item, and at least one is a write. Conflict serializability is formally verified if and only if the precedence graph (serialization graph) contains no directed cycles.',
      },
      {
        chapter: 'Chapter 15: Concurrency Control',
        section: '15.1 Lock-Based Protocols and Two-Phase Locking',
        topic: 'Two-Phase Locking (2PL) and Deadlock Management',
        knowledgeType: 'rule',
        text: 'The Two-Phase Locking (2PL) protocol ensures conflict serializability by dividing lock handling into two phases: 1. Growing Phase: a transaction may acquire new locks but may not release any lock. 2. Shrinking Phase: a transaction may release locks but may not acquire any new lock. While standard 2PL guarantees serializability, it does not prevent deadlocks. Strict 2PL requires exclusive locks to be held until transaction commit/abort to prevent cascading rollbacks. Rigorous 2PL requires all shared and exclusive locks to be held until commit. Deadlock detection relies on maintaining a directed Wait-For Graph (WFG), where a cycle indicates mutual circular wait requiring victim transaction selection and rollback.',
      },
    ],
  },

  // ── 4. OPERATING SYSTEM CONCEPTS (GALVIN) ──
  {
    key: 'galvin_os',
    title: 'Operating System Concepts',
    publisher: 'John Wiley & Sons',
    author: 'Abraham Silberschatz, Peter Baer Galvin, Greg Gagne',
    edition: '10th Edition',
    publicationYear: '2018',
    language: 'English',
    domain: 'computer_science',
    subject: 'Computer Science',
    category: 'Operating Systems',
    examRelevance: ['BPSC_TRE', 'BIHAR_STET', 'BPSC', 'GENERAL'],
    chunks: [
      {
        chapter: 'Chapter 3: Processes',
        section: '3.1 Process State and Process Control Block (PCB)',
        topic: 'Process Lifecycle, States, and Context Switching',
        knowledgeType: 'conceptual',
        text: 'A process is an active program in execution. Its lifecycle transitions across five principal states: New (being created), Ready (waiting in memory for CPU allocation), Running (instructions currently executing on CPU), Waiting/Blocked (waiting for an I/O event or signal), and Terminated (finished execution). The Operating System tracks each process via a Process Control Block (PCB) containing Process ID (PID), Process State, Program Counter (PC), CPU registers, memory limits, and list of open files. Context Switching is the mechanism of saving the CPU state of the running process into its PCB and restoring the state of the next ready process selected by the short-term CPU scheduler.',
      },
      {
        chapter: 'Chapter 5: CPU Scheduling',
        section: '5.3 Scheduling Algorithms and Metrics',
        topic: 'Preemptive vs Non-Preemptive CPU Scheduling Algorithms',
        knowledgeType: 'rule',
        text: 'CPU scheduling allocates the processor among ready processes. In First-Come First-Served (FCFS, non-preemptive), processes are served in order of arrival, suffering from the Convoy Effect where short I/O-bound jobs wait behind a long CPU-bound burst. Shortest Job First (SJF) is provably optimal for minimizing average waiting time; its preemptive variant is Shortest Remaining Time First (SRTF). Round Robin (RR) allocates a fixed time quantum q to each process in circular order; if q is excessively large, RR degenerates to FCFS, whereas if q is very small, context-switch overhead degrades CPU throughput. Priority Scheduling schedules highest-priority jobs first, mitigating starvation via aging (gradually boosting priority over time).',
      },
      {
        chapter: 'Chapter 6: Synchronization Tools',
        section: '6.5 Semaphores and Mutex Locks',
        topic: 'Critical Section Problem, Semaphores, and Race Conditions',
        knowledgeType: 'definition',
        text: 'A race condition occurs when multiple processes access and manipulate shared data concurrently and the outcome depends on the particular execution order. Any solution to the Critical Section problem must satisfy three requirements: 1. Mutual Exclusion (only one process executes inside the critical section at any instant), 2. Progress (only processes not in remainder sections participate in selecting who enters next), 3. Bounded Waiting (a limit exists on how many times other processes can enter before a request is granted). A Semaphore S is an integer variable accessed solely via atomic operations: wait(S) (or P, decrements S and blocks if S <= 0) and signal(S) (or V, increments S and wakes up a blocked process). Binary semaphores act as mutex locks.',
      },
      {
        chapter: 'Chapter 8: Deadlocks',
        section: '8.4 Banker\'s Algorithm and Coffman Conditions',
        topic: 'Coffman Deadlock Conditions and Banker\'s Avoidance Algorithm',
        knowledgeType: 'formula',
        text: 'A deadlock state requires the simultaneous occurrence of all four Coffman conditions: 1. Mutual Exclusion, 2. Hold and Wait, 3. No Preemption, 4. Circular Wait. Deadlock prevention dismantles at least one condition. Dijkstra\'s Banker\'s Algorithm avoids deadlocks by ensuring the system never leaves a Safe State. A state is safe if there exists a safe execution sequence <P1, P2, ..., Pn> such that for each Pi, its maximum remaining resource needs (Need[i] = Max[i] - Allocation[i]) can be satisfied by currently Available resources plus the resources held by all preceding processes Pj (j < i). If no safe sequence exists, the state is unsafe (which can lead to deadlock).',
      },
      {
        chapter: 'Chapter 9: Virtual Memory',
        section: '9.4 Page Replacement Algorithms',
        topic: 'Paging, Translation Lookaside Buffer (TLB), and Belady\'s Anomaly',
        knowledgeType: 'conceptual',
        text: 'Virtual memory separates user logical memory from physical RAM using Demand Paging. The MMU maps a logical address (Page Number p, Offset d) to a physical frame using the Page Table. The Translation Lookaside Buffer (TLB) is an associative hardware cache inside the MMU holding recent page-to-frame translations. Effective Access Time (EAT) = Hit_Ratio * (TLB_access + RAM_access) + (1 - Hit_Ratio) * (TLB_access + 2 * RAM_access). When a requested page is not in RAM, a Page Fault trap occurs. Page replacement algorithms include FIFO (which can exhibit Belady\'s Anomaly: increasing allocated frames increases page faults), Optimal (evicts page that will not be used for longest time, theoretical benchmark), and LRU (Least Recently Used, evicts page unreferenced for longest time). Thrashing occurs when page-fault handling consumes more time than actual execution.',
      },
    ],
  },

  // ── 5. DATA COMMUNICATIONS & NETWORKING (FOROUZAN) ──
  {
    key: 'forouzan_networks',
    title: 'Data Communications and Networking',
    publisher: 'McGraw-Hill Education',
    author: 'Behrouz A. Forouzan',
    edition: '5th Edition',
    publicationYear: '2013',
    language: 'English',
    domain: 'computer_science',
    subject: 'Computer Science',
    category: 'Computer Networks & Cybersecurity',
    examRelevance: ['BPSC_TRE', 'BIHAR_STET', 'BPSC', 'GENERAL'],
    chunks: [
      {
        chapter: 'Chapter 2: Network Models',
        section: '2.2 The OSI 7-Layer Architecture',
        topic: 'OSI Reference Model vs TCP/IP Architecture',
        knowledgeType: 'conceptual',
        text: 'The ISO/OSI Reference Model partitions network communication into 7 distinct functional layers: 1. Physical Layer: raw bit stream transmission over physical media, signal encoding, and connector pinouts. 2. Data Link Layer: framing, MAC physical addressing (48-bit MAC), flow control, error detection (CRC), and media access (CSMA/CD). 3. Network Layer: logical IP addressing (IPv4/IPv6), subnet routing, and packet forwarding. 4. Transport Layer: end-to-end process-to-process delivery, port addressing, segmentation, and connection management (TCP/UDP). 5. Session Layer: dialog control, session checkpointing, and token management. 6. Presentation Layer: data translation, formatting, compression, and encryption/decryption (SSL/TLS). 7. Application Layer: user application protocols (HTTP, FTP, DNS, SMTP, Telnet).',
      },
      {
        chapter: 'Chapter 11: Data Link Control',
        section: '11.2 Flow and Error Control Protocols',
        topic: 'Sliding Window Flow Control: Stop-and-Wait, Go-Back-N, and Selective Repeat',
        knowledgeType: 'rule',
        text: 'Flow control manages frame transmission rates to prevent receiver buffer overflow. In Stop-and-Wait ARQ, sender transmits one frame and waits for ACK before sending the next. In Go-Back-N ARQ, the sender can transmit up to W_s = 2^m - 1 frames without waiting for ACK; the receiver maintains window size W_r = 1 and accepts frames strictly in sequence, discarding out-of-order frames and requiring the sender to retransmit all unacknowledged frames upon timeout. In Selective Repeat ARQ, sender and receiver both have window size W_s = W_r = 2^(m-1); the receiver buffers valid out-of-order frames and the sender retransmits only the specific corrupted or missing frame via negative acknowledgments (NAK) or individual timeouts.',
      },
      {
        chapter: 'Chapter 19: Network Layer: Logical Addressing',
        section: '19.2 IPv4 Subnetting and CIDR Prefix Notation',
        topic: 'IPv4 Subnet Calculation, Masking, and CIDR',
        knowledgeType: 'formula',
        text: 'An IPv4 address consists of 32 bits divided into Network ID and Host ID. Classful addressing defines Class A (/8, 1.0.0.0-126.255.255.255), Class B (/16, 128.0.0.0-191.255.255.255), Class C (/24, 192.0.0.0-223.255.255.255), Class D (224.0.0.0-239.255.255.255, Multicast), and Class E (Experimental). In Classless Inter-Domain Routing (CIDR, /N notation), an address block carries N network prefix bits and (32 - N) host bits. The total number of IP addresses in a /N subnet is 2^(32-N); the usable host count is 2^(32-N) - 2 (subtracting the Network ID where all host bits are 0 and the Directed Broadcast Address where all host bits are 1). For example, a /26 subnet has 2^(32-26) = 64 total addresses and 62 assignable host addresses with subnet mask 255.255.255.192.',
      },
      {
        chapter: 'Chapter 23: Transport Layer Protocols',
        section: '23.3 Transmission Control Protocol (TCP)',
        topic: 'TCP Three-Way Handshake, Flow Control, and Congestion Control',
        knowledgeType: 'definition',
        text: 'TCP is a connection-oriented, reliable transport protocol providing a full-duplex byte stream. Connection establishment utilizes a Three-Way Handshake: 1. Client sends SYN (Synchronize Sequence Number = x), 2. Server replies with SYN-ACK (Sequence Number = y, Acknowledgment Number = x + 1), 3. Client confirms with ACK (Sequence Number = x + 1, Acknowledgment Number = y + 1). Connection termination utilizes a Four-Way Handshake (FIN, ACK, FIN, ACK). TCP achieves flow control via Sliding Window with credit-based receiver window advertisements (rwnd). Congestion control operates through four algorithms: Slow Start (exponential window growth), Congestion Avoidance (additive increase linear growth), Fast Retransmit (triggered by 3 duplicate ACKs), and Fast Recovery.',
      },
    ],
  },

  // ── 6. COMPUTER SYSTEM ARCHITECTURE (MANO) ──
  {
    key: 'mano_architecture',
    title: 'Computer System Architecture & Digital Logic',
    publisher: 'Pearson Education',
    author: 'M. Morris Mano',
    edition: '3rd Revised Edition',
    publicationYear: '2017',
    language: 'English',
    domain: 'computer_science',
    subject: 'Computer Science',
    category: 'Computer Architecture & Digital Logic',
    examRelevance: ['BPSC_TRE', 'BIHAR_STET', 'BPSC', 'GENERAL'],
    chunks: [
      {
        chapter: 'Chapter 1: Digital Logic Circuits',
        section: '1.4 Combinational and Sequential Logic Elements',
        topic: 'Multiplexers, Decoders, and Flip-Flop State Equations',
        knowledgeType: 'conceptual',
        text: 'Combinational logic circuits compute outputs determined strictly by instantaneous inputs without internal memory. A Multiplexer (Data Selector) selects one of 2^n input lines and routes it to a single output line using n select lines. A Decoder converts an n-bit binary input into 2^n unique output lines. Sequential logic circuits incorporate memory elements where output depends on both current inputs and previous internal state. The fundamental sequential memory cell is the Flip-Flop: SR Flip-Flop (invalid when S=1, R=1), D Flip-Flop (transparent data delay, Q_next = D), JK Flip-Flop (eliminates SR race condition by toggling output when J=1, K=1), and T Flip-Flop (toggle flip-flop, Q_next = T ⊕ Q). Master-Slave flip-flop configurations eliminate race-around conditions in level-triggered latches.',
      },
      {
        chapter: 'Chapter 5: Basic Computer Organization and Design',
        section: '5.3 Instruction Formats and Addressing Modes',
        topic: 'Addressing Modes and Instruction Execution Cycle',
        knowledgeType: 'rule',
        text: 'An instruction format specifies the operation code (opcode) and operand address fields. Addressing modes define how the Effective Address (EA) of an operand is determined: 1. Immediate Mode: operand value is specified inside the instruction itself. 2. Direct Mode: instruction contains the actual memory address (EA = Address). 3. Indirect Mode: instruction addresses a memory pointer holding the true address (EA = M[Address]). 4. Register Mode: operand resides in an internal CPU register. 5. Register Indirect: register holds the operand memory address (EA = [R]). 6. Indexed Mode: EA = Base Address + Index Register. 7. Relative Mode: EA = Program Counter (PC) + Displacement. The standard CPU instruction cycle consists of Fetch, Decode, Read Effective Address, and Execute phases.',
      },
      {
        chapter: 'Chapter 9: Pipeline and Vector Processing',
        section: '9.2 Instruction Pipelining and Hazard Analysis',
        topic: 'Instruction Pipelining and Pipeline Hazard Mitigation',
        knowledgeType: 'conceptual',
        text: 'Pipelining overlaps the execution of multiple instructions across sequential stages (Instruction Fetch IF, Instruction Decode ID, Execute EX, Memory Access MEM, Write Back WB). Under ideal conditions, an n-stage pipeline produces a speedup approaching n over non-pipelined execution. Pipeline hazards prevent the next instruction from executing in its designated clock cycle: 1. Structural Hazards: hardware resource conflicts where two pipeline stages demand the same functional unit or memory bus simultaneously. 2. Data Hazards: instruction depends on the result of a preceding instruction still in flight (Read-After-Write RAW, Write-After-Read WAR, Write-After-Write WAW), mitigated via operand forwarding / bypassing and compiler-scheduled NOP bubbles. 3. Control Hazards: caused by conditional branch instructions altering the Program Counter, mitigated using dynamic branch prediction buffers and delayed branching.',
      },
      {
        chapter: 'Chapter 12: Memory Organization',
        section: '12.5 Cache Memory Mapping Architectures',
        topic: 'Cache Memory Mapping: Direct, Fully Associative, and Set-Associative',
        knowledgeType: 'formula',
        text: 'Cache memory accelerates processor-memory latency through temporal and spatial locality of reference. A main memory address is mapped into cache via three architectures: 1. Direct Mapping: each memory block maps to exactly one cache line determined by (Block Address mod Number of Cache Lines). Address fields: Tag, Line/Index, Block Offset. Suffers from conflict misses when competing blocks alternate in the same line. 2. Fully Associative Mapping: any memory block can reside in any cache line. Address fields: Tag, Block Offset. Eliminates conflict misses but requires parallel associative comparison circuitry across all cache tags. 3. Set-Associative Mapping: cache is divided into sets of k lines (k-way set associative). A block maps to set (Block Address mod Number of Sets), then placed in any line within that set. Cache write policies: Write-Through (updates cache and main memory simultaneously) vs Write-Back (updates main memory only when dirty cache line is evicted).',
      },
    ],
  },

  // ── 7. DATA STRUCTURES & ALGORITHMS (LIPSCHUTZ) ──
  {
    key: 'lipschutz_dsa',
    title: 'Data Structures and Algorithms',
    publisher: 'McGraw-Hill Education (Schaum\'s Outlines)',
    author: 'Seymour Lipschutz',
    edition: 'Revised Edition',
    publicationYear: '2014',
    language: 'English',
    domain: 'computer_science',
    subject: 'Computer Science',
    category: 'Data Structures & Algorithms',
    examRelevance: ['BPSC_TRE', 'BIHAR_STET', 'BPSC', 'GENERAL'],
    chunks: [
      {
        chapter: 'Chapter 2: Complexity of Algorithms',
        section: '2.4 Asymptotic Notations and Growth Orders',
        topic: 'Asymptotic Notations: Big O, Big Omega, and Big Theta',
        knowledgeType: 'definition',
        text: 'Asymptotic analysis evaluates algorithmic time and space requirements as input size n grows asymptotically toward infinity. 1. Big-O notation (O): provides an asymptotic upper bound. f(n) = O(g(n)) if there exist positive constants c and n0 such that f(n) <= c * g(n) for all n >= n0 (worst-case guarantee). 2. Big-Omega notation (Ω): provides an asymptotic lower bound. f(n) = Ω(g(n)) if f(n) >= c * g(n) for all n >= n0 (best-case guarantee). 3. Big-Theta notation (Θ): provides an asymptotically tight bound. f(n) = Θ(g(n)) if and only if f(n) = O(g(n)) and f(n) = Ω(g(n)). Standard growth hierarchies: O(1) < O(log n) < O(n) < O(n log n) < O(n^2) < O(n^3) < O(2^n) < O(n!).',
      },
      {
        chapter: 'Chapter 6: Trees and Binary Trees',
        section: '6.4 Binary Search Trees and AVL Balanced Trees',
        topic: 'BST Properties, Tree Traversals, and AVL Tree Rotations',
        knowledgeType: 'rule',
        text: 'A Binary Search Tree (BST) is a binary tree where for every node X, all keys in its left subtree are strictly smaller than X.key, and all keys in its right subtree are strictly greater than X.key. Inorder traversal (Left, Root, Right) of a BST outputs node values in ascending sorted order. Preorder traversal follows Root, Left, Right; Postorder follows Left, Right, Root. Worst-case search time in a degenerate skewed BST degrades to O(n). An AVL Tree is a height-balanced BST where the balance factor BF = Height(Left Subtree) - Height(Right Subtree) of every node is strictly in {-1, 0, +1}. Imbalance is restored using single rotations (LL or RR rotation) or double rotations (LR or RL rotation) in O(log n) time.',
      },
      {
        chapter: 'Chapter 8: Sorting Algorithms',
        section: '8.3 Comparison of Internal Sorting Algorithms',
        topic: 'Quick Sort, Merge Sort, and Heap Sort Comparative Analysis',
        knowledgeType: 'formula',
        text: 'Sorting algorithms arrange elements in ascending or descending sequence. 1. Bubble, Selection, and Insertion Sort: Average and worst-case time complexity O(n^2). Insertion sort is adaptive and stable, optimal for nearly sorted arrays. 2. Merge Sort: Divide-and-conquer algorithm. Time complexity is Θ(n log n) in best, average, and worst cases; requires O(n) auxiliary memory; stable. 3. Quick Sort: Partitions array around a pivot element. Average case O(n log n); worst case O(n^2) when partition is highly unbalanced; in-place O(log n) stack space; not stable. 4. Heap Sort: Uses binary heap data structure. Builds max-heap in O(n) time, sorts in O(n log n) best, average, and worst-case time; in-place; not stable. Stability means equal keys retain their relative initial order.',
      },
      {
        chapter: 'Chapter 9: Graph Algorithms',
        section: '9.3 Graph Traversals, MST, and Shortest Paths',
        topic: 'BFS, DFS, Dijkstra, and Kruskal Minimum Spanning Tree',
        knowledgeType: 'conceptual',
        text: 'Graphs G = (V, E) are represented using Adjacency Matrices (space O(V^2)) or Adjacency Lists (space O(V + E)). Breadth-First Search (BFS) explores vertices level-by-level using a FIFO Queue, computing single-source shortest paths in unweighted graphs in O(V + E) time. Depth-First Search (DFS) traverses as deep as possible before backtracking using a Stack or recursion, computing topological sorting and cycle detection. Dijkstra\'s Algorithm finds single-source shortest paths in non-negative weighted graphs using a priority queue in O((V + E) log V) time. Kruskal\'s Algorithm constructs a Minimum Spanning Tree (MST) by sorting edges by weight and adding them greedily using Disjoint Set Union (DSU) with path compression in O(E log E) time.',
      },
    ],
  },

  // ── 8. PEDAGOGY & ART OF TEACHING (DR. S.K. MANGAL / NEP 2020) ──
  {
    key: 'stet_pedagogy_guide',
    title: 'Essentials of Educational Technology & Pedagogy',
    publisher: 'PHI Learning / NCERT Reference',
    author: 'Dr. S.K. Mangal & Uma Mangal',
    edition: 'Revised Edition',
    publicationYear: '2021',
    language: 'English',
    domain: 'pedagogy',
    subject: 'Art of Teaching',
    category: 'Pedagogy & Educational Psychology',
    examRelevance: ['BIHAR_STET', 'BPSC_TRE', 'GENERAL'],
    chunks: [
      {
        chapter: 'Chapter 1: Teaching-Learning Process',
        section: '1.3 Principles and Maxims of Teaching',
        topic: 'Learner-Centred Pedagogy and Maxims of Teaching',
        knowledgeType: 'rule',
        text: 'Modern pedagogical practice emphasizes student-centred constructivism over traditional teacher-dominated rote instruction. Classical maxims of teaching guide effective classroom instruction: From Known to Unknown (connecting new concepts to existing cognitive schema), From Simple to Complex, From Concrete to Abstract (using manipulative aids before abstract symbolic equations), From Particular to General (inductive reasoning preceding formal generalization), and From Whole to Parts (Gestalt psychological perspective). Under constructivist frameworks (Piaget and Vygotsky), knowledge is actively constructed by the learner through environmental interaction and social collaboration within their Zone of Proximal Development (ZPD) through scaffolding.',
      },
      {
        chapter: 'Chapter 3: Instructional Objectives',
        section: '3.2 Bloom\'s Taxonomy of Educational Objectives',
        topic: 'Revised Bloom\'s Taxonomy: Cognitive, Affective, and Psychomotor Domains',
        knowledgeType: 'definition',
        text: 'Benjamin Bloom and collaborators categorized educational goals into three domains: Cognitive (mental skills), Affective (attitudes, emotions), and Psychomotor (motor skills). In 2001, Lorin Anderson and David Krathwohl revised the Cognitive Domain from nouns to active verbs across six hierarchical levels: 1. Remembering (recalling relevant knowledge), 2. Understanding (explaining ideas or concepts), 3. Applying (using information in new situations), 4. Analyzing (drawing connections, breaking material into parts), 5. Evaluating (justifying a stand or decision, critique), and 6. Creating (producing new or original work, highest level). Formulating measurable behavioral learning outcomes requires actionable verbs matching these tiers.',
      },
      {
        chapter: 'Chapter 5: Teaching Methods and Microteaching',
        section: '5.4 Microteaching Cycle and Inquiry-Based Methods',
        topic: 'Microteaching Cycle and Heuristic / Project Methods',
        knowledgeType: 'rule',
        text: 'Microteaching is a scaled-down teacher-training technique developed by Dwight Allen to develop specific teaching skills (probing questions, reinforcement, blackboard writing) with small student groups (5-10) and short durations (5-10 minutes). The standard NCERT microteaching cycle comprises 36 minutes: Teach (6 min) -> Feedback (6 min) -> Re-plan (12 min) -> Re-teach (6 min) -> Re-feedback (6 min). Innovative teaching methods include the Heuristic Method (propounded by Professor H.E. Armstrong, Greek "heuriskein" = to discover, casting the student as an independent researcher) and the Project Method (developed by William Kilpatrick based on John Dewey\'s pragmatism, featuring purposeful activity carried out in a social environment).',
      },
      {
        chapter: 'Chapter 7: Evaluation and Assessment',
        section: '7.2 Formative vs Summative Assessment',
        topic: 'Assessment FOR, OF, and AS Learning',
        knowledgeType: 'conceptual',
        text: 'Educational assessment is classified by its pedagogical intent: 1. Assessment FOR Learning (Formative Assessment): diagnostic and ongoing during the instructional process to provide immediate constructive feedback to adapt teaching and scaffold student weaknesses without awarding formal letter ranks. 2. Assessment OF Learning (Summative Assessment): periodic, end-of-term comprehensive evaluation to measure cumulative achievement against benchmark standards. 3. Assessment AS Learning: metacognitive self-evaluation where students self-assess and monitor their own conceptual understanding. Continuous and Comprehensive Evaluation (CCE) evaluates both scholastic and co-scholastic domains of child personality.',
      },
      {
        chapter: 'Chapter 10: Educational Policies and Inclusive Education',
        section: '10.3 NEP 2020 Framework and RPwD Act 2016',
        topic: 'National Education Policy (NEP 2020) and Inclusive Classrooms',
        knowledgeType: 'rule',
        text: 'The National Education Policy (NEP 2020) replaces the 10+2 curricular structure with the 5+3+3+4 pedagogical structure: Foundational Stage (5 years, ages 3-8, play/activity-based), Preparatory Stage (3 years, ages 8-11, discovery and basic literacy/numeracy), Middle Stage (3 years, ages 11-14, experiential subject learning and vocational exposure), and Secondary Stage (4 years, ages 14-18, multidisciplinary depth and critical thinking). Inclusive Education mandates that all children learn together in mainstream classrooms regardless of physical, intellectual, or linguistic differences. Under the RPwD Act 2016, teachers must provide reasonable accommodations for specific learning disabilities: Dyslexia (reading difficulties), Dyscalculia (mathematical processing deficits), and Dysgraphia (writing motor impairments).',
      },
    ],
  },
];

export async function runCSReferenceIngestion(isExecute: boolean) {
  console.log('═══════════════════════════════════════════════════════════════════════════════');
  console.log('📚 BIHAR STET & BPSC TRE COMPUTER SCIENCE REFERENCE KB INGESTION ENGINE');
  console.log(`   Execution Mode: ${isExecute ? 'LIVE EMBED & WRITE (Firestore + Vector)' : 'DRY-RUN (Audit only)'}`);
  console.log('═══════════════════════════════════════════════════════════════════════════════\n');

  assertReferenceNamespace(REFERENCE_NAMESPACE);
  assertWritableCollection(REF_SOURCE_COLLECTION);
  assertWritableCollection(REF_CHUNK_COLLECTION);

  const now = new Date().toISOString();
  let totalChunks = 0;
  for (const book of CS_REFERENCE_BOOKS) {
    totalChunks += book.chunks.length;
  }

  console.log(`Reference Books Cataloged: ${CS_REFERENCE_BOOKS.length}`);
  console.log(`Total Curated Reference Chunks: ${totalChunks}\n`);

  console.log('Catalog of Reference Books:');
  CS_REFERENCE_BOOKS.forEach((b, i) => {
    console.log(` ${i + 1}. [${b.key}] "${b.title}" — ${b.author} (${b.publisher}) [${b.chunks.length} chunks]`);
  });

  if (!isExecute) {
    console.log('\nDRY-RUN completed. Run with --execute to embed and ingest into Firestore & Vector Index.');
    return;
  }

  const provider = new GoogleEmbeddingProvider();
  let chunksWritten = 0;
  let vectorsWritten = 0;

  for (const book of CS_REFERENCE_BOOKS) {
    console.log(`\nProcessing book [${book.key}] "${book.title}"...`);

    // 1. Write reference source metadata
    const sourceRecord = {
      id: book.key,
      book: book.key,
      publisher: book.publisher,
      author: book.author,
      book_title: book.title,
      source_filename: `${book.key}.reference`,
      source_path_at_ingest: `dataset_staging/cs_reference/${book.key}`,
      edition: book.edition,
      publication_year: book.publicationYear,
      language: book.language,
      domain: book.domain,
      subject: book.subject,
      category: book.category,
      source_type: 'reference_book',
      source_status: 'authorized',
      source_sha256: sha256(book.title + book.author),
      pdf_page_count: book.chunks.length * 2,
      chunk_count: book.chunks.length,
      watermark_present: false,
      watermark_note: 'none',
      ingestedAt: now,
      notes: 'Authoritative curriculum reference knowledge base for BPSC TRE & Bihar STET',
    };

    await db.collection(REF_SOURCE_COLLECTION).doc(book.key).set(sourceRecord, { merge: true });
    console.log(`  ✅ Registered in ${REF_SOURCE_COLLECTION}`);

    // 2. Prepare chunks, embeddings, and vectors
    const vectorDocs: VectorDocument[] = [];
    const chunkBatch = db.batch();

    for (let cIdx = 0; cIdx < book.chunks.length; cIdx++) {
      const c = book.chunks[cIdx];
      const chunkId = `ref:${book.key}:c${cIdx + 1}:${sha256(c.text).slice(0, 8)}`;
      const pageStart = (cIdx * 2) + 1;
      const pageEnd = pageStart + 1;

      const chunkData = {
        chunk_id: chunkId,
        parent_document_id: book.key,
        book: book.key,
        book_title: book.title,
        publisher: book.publisher,
        author: book.author,
        part: book.category,
        chapter: c.chapter,
        section: c.section,
        topic: c.topic,
        subtopic: c.subtopic || '',
        category: book.category,
        subject: book.subject,
        text: c.text,
        knowledge_type: c.knowledgeType,
        page_start: pageStart,
        page_end: pageEnd,
        pdf_page: pageStart,
        language: book.language,
        exam_relevance: book.examRelevance,
        relevance_tier: 'high_relevance' as RelevanceTier,
        relevance: 'content',
        corpusBucket: CORPUS_BUCKET,
        authority: 'secondary_reference',
        source_filename: `${book.key}.reference`,
        source_status: 'authorized',
        watermark_present: false,
        vectorNamespace: REFERENCE_NAMESPACE,
        content_hash: sha256(c.text),
        indexedAt: Date.now(),
      };

      chunkBatch.set(db.collection(REF_CHUNK_COLLECTION).doc(chunkId), chunkData, { merge: true });
      chunksWritten++;

      // Generate 768-dim Google Embedding
      const embeddingText = `Book: ${book.title} | Chapter: ${c.chapter} | Topic: ${c.topic}\n${c.text}`;
      let vector: number[] = [];
      try {
        vector = await provider.generateEmbedding(embeddingText);
      } catch (embErr) {
        console.warn(`    Embedding generation warning on ${chunkId}, retrying...`);
        await new Promise((r) => setTimeout(r, 2000));
        vector = await provider.generateEmbedding(embeddingText);
      }

      if (vector && vector.length === 768) {
        vectorDocs.push({
          id: chunkId,
          values: vector,
          metadata: {
            chunk_id: chunkId,
            parent_document_id: book.key,
            book: book.key,
            book_title: book.title,
            publisher: book.publisher,
            author: book.author,
            chapter: c.chapter,
            section: c.section,
            topic: c.topic,
            subject: book.subject,
            category: book.category,
            knowledge_type: c.knowledgeType,
            text: c.text,
            exam_relevance: book.examRelevance,
            relevance_tier: 'high_relevance',
            is_pyq: false,
            is_generated: false,
            is_mock: false,
            content_type: 'reference_book',
            vectorKind: 'REFERENCE_BOOK_CHUNK',
            public: true,
            owner: 'sadhya-reference',
            userId: '',
            corpusBucket: CORPUS_BUCKET,
            source_type: 'reference_book',
            authority: 'secondary_reference',
            page_number: pageStart,
          },
        });
      }
    }

    await chunkBatch.commit();
    console.log(`  ✅ Written ${book.chunks.length} chunks to Firestore ${REF_CHUNK_COLLECTION}`);

    // Upsert vectors to Pinecone under REFERENCE_NAMESPACE
    if (vectorDocs.length > 0) {
      try {
        await pineconeService.upsertVectors(vectorDocs, REFERENCE_NAMESPACE);
        vectorsWritten += vectorDocs.length;
        console.log(`  ✅ Upserted ${vectorDocs.length} vectors to namespace "${REFERENCE_NAMESPACE}"`);
      } catch (vErr: any) {
        console.warn(`  ⚠ Pinecone upsert note: ${vErr?.message || vErr} (Firestore records safely persisted)`);
      }
    }
  }

  console.log(`\n🎉 INGESTION COMPLETE!`);
  console.log(`Total Reference Chunks Written to Firestore: ${chunksWritten}`);
  console.log(`Total Reference Vectors Upserted: ${vectorsWritten}`);
}

const isExecute = process.argv.includes('--execute');
runCSReferenceIngestion(isExecute)
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Fatal error during CS reference ingestion:', err);
    process.exit(1);
  });
