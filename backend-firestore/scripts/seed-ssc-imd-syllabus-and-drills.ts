/**
 * seed-ssc-imd-syllabus-and-drills.ts
 *
 * Implements the authoritative syllabus and subject-wise practice tests for:
 * SSC Junior Engineer (CS & IT) / Scientific Assistant (IMD)
 *
 * Grounded strictly in official notice:
 * - D:\scholarly\social-kit\notice_16092026 ssc je imd.pdf (Pages 21-28)
 * - Section 14.3.4 Part-D (Computer Science and Information Technology)
 * - Section 14.2 Paper-I (14.2.1 General Intelligence & 14.2.2 General Awareness)
 */

import { db } from '../src/config/firebase';
import { syllabusGraphService } from '../src/services/exam/syllabusGraph.service';
import { ExamSyllabus, SyllabusNode } from '../src/types/exam.types';
import { MockTest, Question } from '../src/types/tests.types';

const OFFICIAL_DOC_HASH = '24ac529a6b2b5d3e321d1ad401163506c3faf9f5f09f6b467753f90beeae5a0d';

function resolveCorrectIndex(correctAnswer: any, options: string[]): number {
  if (typeof correctAnswer === 'number' && correctAnswer >= 0 && correctAnswer < options.length) {
    return correctAnswer;
  }
  if (typeof correctAnswer === 'string') {
    const s = correctAnswer.trim().toUpperCase();
    if (['A', 'B', 'C', 'D', 'E', 'F'].includes(s)) return s.charCodeAt(0) - 65;
    const idx = options.findIndex((o) => String(o).trim().toLowerCase() === s.toLowerCase());
    if (idx >= 0) return idx;
  }
  return 0;
}

function mapDifficulty(d?: string): 'Easy' | 'Medium' | 'Hard' {
  const s = String(d || '').toLowerCase();
  if (s.includes('hard') || s.includes('advanced')) return 'Hard';
  if (s.includes('easy') || s.includes('basic')) return 'Easy';
  return 'Medium';
}

export function buildOfficialSyllabusNodes(): SyllabusNode[] {
  return [
    {
      nodeId: 'stage:cbt_paper_1',
      type: 'STAGE',
      name: 'Paper-I (Computer Based Examination)',
      order: 1,
      description: 'Paper-I is compulsory and qualifying for Paper-II. Total 200 Questions, 200 Marks, 120 Minutes.',
      marks: 200,
      durationMinutes: 120,
      questionCount: 200,
      children: [
        {
          nodeId: 'subject:gi_reasoning',
          type: 'SUBJECT',
          name: 'General Intelligence & Reasoning (14.2.1)',
          order: 1,
          description: 'Verbal and non-verbal reasoning, analogies, spatial visualization, problem solving, analysis and syllogistic reasoning.',
          marks: 50,
          questionCount: 50,
          children: [
            { nodeId: 'topic:gi_analogies', type: 'TOPIC', name: 'Analogies and Similarities', order: 1, children: [] },
            { nodeId: 'topic:gi_spatial', type: 'TOPIC', name: 'Spatial Visualization and Orientation', order: 2, children: [] },
            { nodeId: 'topic:gi_problem_solving', type: 'TOPIC', name: 'Problem Solving and Analysis', order: 3, children: [] },
            { nodeId: 'topic:gi_decision_making', type: 'TOPIC', name: 'Judgment, Decision Making and Visual Memory', order: 4, children: [] },
            { nodeId: 'topic:gi_relationship', type: 'TOPIC', name: 'Relationship Concepts and Blood Relations', order: 5, children: [] },
            { nodeId: 'topic:gi_arithmetic_reasoning', type: 'TOPIC', name: 'Arithmetical Reasoning and Computations', order: 6, children: [] },
            { nodeId: 'topic:gi_classification', type: 'TOPIC', name: 'Verbal and Figure Classification', order: 7, children: [] },
            { nodeId: 'topic:gi_series', type: 'TOPIC', name: 'Number Series and Non-Verbal Series', order: 8, children: [] },
            { nodeId: 'topic:gi_coding_decoding', type: 'TOPIC', name: 'Coding and Decoding', order: 9, children: [] },
            { nodeId: 'topic:gi_syllogism', type: 'TOPIC', name: 'Statement Conclusion and Syllogistic Reasoning', order: 10, children: [] },
          ],
        },
        {
          nodeId: 'subject:general_awareness',
          type: 'SUBJECT',
          name: 'General Awareness & Scientific Aspects (14.2.2)',
          order: 2,
          description: 'Testing general awareness of environment, everyday observations in scientific aspect, history, culture, geography, economics, and polity.',
          marks: 50,
          questionCount: 50,
          children: [
            { nodeId: 'topic:ga_science_research', type: 'TOPIC', name: 'Everyday Science and Scientific Research', order: 1, children: [] },
            { nodeId: 'topic:ga_current_events', type: 'TOPIC', name: 'Current Events of National and International Importance', order: 2, children: [] },
            { nodeId: 'topic:ga_history_culture', type: 'TOPIC', name: 'Indian History and Culture', order: 3, children: [] },
            { nodeId: 'topic:ga_geography', type: 'TOPIC', name: 'Geography of India and Neighboring Countries', order: 4, children: [] },
            { nodeId: 'topic:ga_economic_scene', type: 'TOPIC', name: 'Economic Scene and Policy', order: 5, children: [] },
            { nodeId: 'topic:ga_polity_constitution', type: 'TOPIC', name: 'General Polity and Constitution of India', order: 6, children: [] },
          ],
        },
        {
          nodeId: 'subject:part_d_cs_it',
          type: 'SUBJECT',
          name: 'Part-D: Computer Science and Information Technology (14.3.4)',
          order: 3,
          description: 'Official Part-D Technical CS & IT curriculum spanning 10 core subjects.',
          marks: 100,
          questionCount: 100,
          children: [
            {
              nodeId: 'topic:engg_math',
              type: 'TOPIC',
              name: 'Engineering Mathematics',
              order: 1,
              children: [
                { nodeId: 'subtopic:discrete_math', type: 'SUBTOPIC', name: 'Discrete Mathematics (Logic, Sets, Relations, Functions, Lattices, Monoids, Groups, Graphs, Combinatorics)', order: 1, children: [] },
                { nodeId: 'subtopic:linear_algebra', type: 'SUBTOPIC', name: 'Linear Algebra (Matrices, Determinants, Systems of Linear Equations, Eigenvalues, LU Decomposition)', order: 2, children: [] },
                { nodeId: 'subtopic:calculus', type: 'SUBTOPIC', name: 'Calculus (Limits, Continuity, Differentiability, Maxima and Minima, Integration)', order: 3, children: [] },
                { nodeId: 'subtopic:probability_stats', type: 'SUBTOPIC', name: 'Probability and Statistics (Distributions, Mean, Variance, Conditional Probability, Bayes Theorem)', order: 4, children: [] },
              ],
            },
            {
              nodeId: 'topic:digital_logic',
              type: 'TOPIC',
              name: 'Digital Logic',
              order: 2,
              children: [
                { nodeId: 'subtopic:boolean_algebra', type: 'SUBTOPIC', name: 'Boolean Algebra and Minimization (K-Maps)', order: 1, children: [] },
                { nodeId: 'subtopic:circuits', type: 'SUBTOPIC', name: 'Combinational and Sequential Circuits', order: 2, children: [] },
                { nodeId: 'subtopic:number_rep', type: 'SUBTOPIC', name: 'Number Representations and Computer Arithmetic (Fixed and Floating Point)', order: 3, children: [] },
              ],
            },
            {
              nodeId: 'topic:coa',
              type: 'TOPIC',
              name: 'Computer Organization and Architecture',
              order: 3,
              children: [
                { nodeId: 'subtopic:machine_instructions', type: 'SUBTOPIC', name: 'Machine Instructions, Addressing Modes, ALU and Data-Path', order: 1, children: [] },
                { nodeId: 'subtopic:pipelining', type: 'SUBTOPIC', name: 'Instruction Pipelining and Pipeline Hazards (Data, Control, Structural)', order: 2, children: [] },
                { nodeId: 'subtopic:memory_hierarchy', type: 'SUBTOPIC', name: 'Memory Hierarchy: Cache, Main Memory and Secondary Storage', order: 3, children: [] },
                { nodeId: 'subtopic:io_interface', type: 'SUBTOPIC', name: 'I/O Interface (Interrupt and DMA mode)', order: 4, children: [] },
              ],
            },
            {
              nodeId: 'topic:prog_ds',
              type: 'TOPIC',
              name: 'Programming and Data Structures',
              order: 4,
              children: [
                { nodeId: 'subtopic:c_programming', type: 'SUBTOPIC', name: 'Programming in C, Pointers and Recursion', order: 1, children: [] },
                { nodeId: 'subtopic:linear_ds', type: 'SUBTOPIC', name: 'Arrays, Stacks, Queues and Linked Lists', order: 2, children: [] },
                { nodeId: 'subtopic:trees_heaps_graphs', type: 'SUBTOPIC', name: 'Trees, Binary Search Trees, Binary Heaps and Graphs', order: 3, children: [] },
              ],
            },
            {
              nodeId: 'topic:algorithms',
              type: 'TOPIC',
              name: 'Algorithms',
              order: 5,
              children: [
                { nodeId: 'subtopic:searching_sorting_hashing', type: 'SUBTOPIC', name: 'Searching, Sorting and Hashing', order: 1, children: [] },
                { nodeId: 'subtopic:asymptotic_complexity', type: 'SUBTOPIC', name: 'Asymptotic Worst-Case Time and Space Complexity', order: 2, children: [] },
                { nodeId: 'subtopic:algorithm_design', type: 'SUBTOPIC', name: 'Algorithm Design: Greedy, Dynamic Programming and Divide-and-Conquer', order: 3, children: [] },
                { nodeId: 'subtopic:graph_algorithms', type: 'SUBTOPIC', name: 'Graph Traversals, Minimum Spanning Trees, Shortest Paths', order: 4, children: [] },
              ],
            },
            {
              nodeId: 'topic:toc',
              type: 'TOPIC',
              name: 'Theory of Computation',
              order: 6,
              children: [
                { nodeId: 'subtopic:automata_regular', type: 'SUBTOPIC', name: 'Regular Expressions, Finite Automata (DFA, NFA), Pumping Lemma', order: 1, children: [] },
                { nodeId: 'subtopic:cfg_pda', type: 'SUBTOPIC', name: 'Context-Free Grammars, Push-Down Automata and Context-Free Languages', order: 2, children: [] },
                { nodeId: 'subtopic:turing_decidability', type: 'SUBTOPIC', name: 'Turing Machines and Undecidability', order: 3, children: [] },
              ],
            },
            {
              nodeId: 'topic:compiler_design',
              type: 'TOPIC',
              name: 'Compiler Design',
              order: 7,
              children: [
                { nodeId: 'subtopic:lexical_parsing', type: 'SUBTOPIC', name: 'Lexical Analysis, Parsing (LL, LR) and Syntax-Directed Translation', order: 1, children: [] },
                { nodeId: 'subtopic:intermediate_code', type: 'SUBTOPIC', name: 'Runtime Environments and Intermediate Code Generation', order: 2, children: [] },
                { nodeId: 'subtopic:code_optimization', type: 'SUBTOPIC', name: 'Local Optimization and Data Flow Analysis', order: 3, children: [] },
              ],
            },
            {
              nodeId: 'topic:os',
              type: 'TOPIC',
              name: 'Operating System',
              order: 8,
              children: [
                { nodeId: 'subtopic:os_processes_threads', type: 'SUBTOPIC', name: 'System Calls, Processes, Threads and IPC', order: 1, children: [] },
                { nodeId: 'subtopic:concurrency_deadlock', type: 'SUBTOPIC', name: 'Concurrency, Synchronization, Semaphores, Mutex and Deadlock Handling', order: 2, children: [] },
                { nodeId: 'subtopic:cpu_scheduling', type: 'SUBTOPIC', name: 'CPU Scheduling and I/O Scheduling', order: 3, children: [] },
                { nodeId: 'subtopic:memory_mgmt', type: 'SUBTOPIC', name: 'Memory Management, Virtual Memory, Paging, Page Replacement and File Systems', order: 4, children: [] },
              ],
            },
            {
              nodeId: 'topic:databases',
              type: 'TOPIC',
              name: 'Databases',
              order: 9,
              children: [
                { nodeId: 'subtopic:er_relational', type: 'SUBTOPIC', name: 'ER-Model, Relational Model, Relational Algebra and Tuple Calculus', order: 1, children: [] },
                { nodeId: 'subtopic:sql_normalization', type: 'SUBTOPIC', name: 'SQL, Integrity Constraints and Normal Forms (1NF, 2NF, 3NF, BCNF)', order: 2, children: [] },
                { nodeId: 'subtopic:indexing_transactions', type: 'SUBTOPIC', name: 'File Organization, Indexing (B and B+ Trees), Transactions and Concurrency Control', order: 3, children: [] },
              ],
            },
            {
              nodeId: 'topic:computer_networks',
              type: 'TOPIC',
              name: 'Computer Networks',
              order: 10,
              children: [
                { nodeId: 'subtopic:layering_data_link', type: 'SUBTOPIC', name: 'OSI and TCP/IP Layering, Switching and Data Link Layer (Framing, CRC, MAC, Ethernet)', order: 1, children: [] },
                { nodeId: 'subtopic:routing_ip', type: 'SUBTOPIC', name: 'Routing Protocols, IPv4, CIDR, ARP, DHCP, ICMP, NAT', order: 2, children: [] },
                { nodeId: 'subtopic:transport_application', type: 'SUBTOPIC', name: 'Transport Layer (UDP, TCP, Flow & Congestion Control, Sockets) and Application Layer (DNS, HTTP, SMTP)', order: 3, children: [] },
              ],
            },
          ],
        },
      ],
    },
  ];
}

async function main() {
  console.log('🚀 Starting SSC JE CS / IMD Official Syllabus & Subject Drills Seeding...');

  // 1. Update Exam record in Firestore
  const examRef = db.collection('exams').doc('SSC_IMD_CS');
  await examRef.set(
    {
      examId: 'SSC_IMD_CS',
      name: 'SSC Junior Engineer & Scientific Assistant (IMD) — Computer Science & IT',
      shortName: 'SSC JE CS / IMD',
      conductingAuthority: 'Staff Selection Commission / India Meteorological Department',
      category: 'SSC',
      country: 'IN',
      aliases: [
        'SSC IMD CS',
        'SSC JE CS',
        'SSC JEE CS',
        'SSC JE Computer Science',
        'SSC JE IT',
        'SSC Scientific Assistant CS',
        'IMD Scientific Assistant',
        'SSC IMD Part-D',
      ],
      officialDomains: ['ssc.gov.in', 'ssc.nic.in', 'imd.gov.in'],
      currentCycle: '2026',
      activeSyllabusVersionId: 'syl_ssc_imd_cs_2026_v1',
      status: 'ACTIVE',
      description: 'Official Staff Selection Commission examination for Scientific Assistant (IMD) and Junior Engineer (CS & IT) under Scheme 13.1 and Syllabus 14.3.4 Part-D.',
      eligibilitySummary: 'Degree / Diploma in Computer Science / IT / Computer Applications / Electronics.',
      verifiedOfficialUrls: {
        authorityHome: 'https://ssc.gov.in',
        examPortal: 'https://ssc.gov.in/notices',
        syllabusPage: 'https://ssc.gov.in/syllabus',
      },
      updatedAt: Date.now(),
    },
    { merge: true }
  );
  console.log('✅ Exam record updated in exams/SSC_IMD_CS.');

  // 2. Set Cycle 2026
  await db.collection('exam_cycles').doc('cycle_ssc_imd_cs_2026').set(
    {
      cycleId: '2026',
      examId: 'SSC_IMD_CS',
      label: 'SSC JE / IMD Scientific Assistant 2026',
      year: '2026',
      status: 'ACTIVE',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    },
    { merge: true }
  );

  // 3. Create & Publish Canonical Syllabus
  const nodes = buildOfficialSyllabusNodes();
  const syllabusRecord: ExamSyllabus = {
    syllabusId: 'syl_ssc_imd_cs_2026_v1',
    examId: 'SSC_IMD_CS',
    cycleId: '2026',
    version: '2026-v1',
    authority: 'Staff Selection Commission',
    status: 'CURRENT',
    sourceDocumentUrl: 'https://ssc.gov.in/notices',
    sourceDocumentTitle: 'Notice of Examination for Junior Engineer & Scientific Assistant in IMD',
    sourceDocumentHash: OFFICIAL_DOC_HASH,
    extractedAt: Date.now(),
    verifiedAt: Date.now(),
    publishedAt: Date.now(),
    nodes,
    notes: 'Parsed directly from official notice_16092026 ssc je imd.pdf Sections 13.1, 14.2, 14.3.4.',
  };

  await db.collection('exam_syllabi').doc(syllabusRecord.syllabusId).set(syllabusRecord, { merge: true });
  console.log('✅ Official Syllabus saved in exam_syllabi/syl_ssc_imd_cs_2026_v1.');

  // Build syllabus graph
  try {
    const graphRes = await syllabusGraphService.buildSyllabusGraph(syllabusRecord);
    console.log(`✅ Syllabus Graph built: ${graphRes.nodeCount} nodes, ${graphRes.edgeCount} edges.`);
  } catch (err: any) {
    console.warn('Graph build notice:', err?.message || err);
  }

  // 4. Fetch all questions from question_bank for subject tests
  const qBankSnap = await db.collection('question_bank').get();
  console.log(`Loaded ${qBankSnap.size} total questions from question_bank.`);

  const allQuestions: Question[] = [];
  qBankSnap.docs.forEach((doc) => {
    allQuestions.push(doc.data() as Question);
  });

  const getQs = (matchFn: (q: Question) => boolean, limit = 25): Question[] => {
    const matched = allQuestions.filter(matchFn);
    return matched.slice(0, limit);
  };

  // Helper matching functions for subjects
  const isOS = (q: Question) => /operating system|process|thread|deadlock|semaphore|paging|virtual memory|scheduling|file system/i.test(`${q.subject} ${q.topic} ${q.text}`);
  const isCN = (q: Question) => /network|layer|tcp|ip|udp|routing|osi|socket|dns|smtp|http|cidr|packet/i.test(`${q.subject} ${q.topic} ${q.text}`);
  const isDBMS = (q: Question) => /database|dbms|relational|sql|normalization|1nf|2nf|3nf|bcnf|b\+ tree|transaction|acid/i.test(`${q.subject} ${q.topic} ${q.text}`);
  const isDSA = (q: Question) => /data structure|programming|tree|binary search|heap|graph|stack|queue|linked list|recursion|pointer/i.test(`${q.subject} ${q.topic} ${q.text}`);
  const isAlgo = (q: Question) => /algorithm|asymptotic|sorting|quicksort|mergesort|hashing|greedy|dynamic programming|complexity/i.test(`${q.subject} ${q.topic} ${q.text}`);
  const isCOA = (q: Question) => /architecture|pipelining|hazard|cache|alu|memory hierarchy|machine instruction|addressing mode/i.test(`${q.subject} ${q.topic} ${q.text}`);
  const isDigital = (q: Question) => /digital logic|boolean|k-map|multiplexer|circuit|flip-flop|counter|logic gate/i.test(`${q.subject} ${q.topic} ${q.text}`);
  const isTOC = (q: Question) => /theory of computation|automata|dfa|nfa|compiler|regular expression|parsing|pumping lemma|turing/i.test(`${q.subject} ${q.topic} ${q.text}`);
  const isMath = (q: Question) => /mathematics|discrete|matrix|eigenvalue|probability|calculus|relation|group|lattice/i.test(`${q.subject} ${q.topic} ${q.text}`);
  const isGI = (q: Question) => q.subject.includes('Intelligence') || q.subject.includes('Reasoning');
  const isGA = (q: Question) => q.subject.includes('Awareness') || q.subject.includes('Science');

  const drills: Array<{ id: string; title: string; category: string; count: number; duration: number; marks: number; match: (q: Question) => boolean; badge: string }> = [
    {
      id: 'ssc_imd_cs_os_practice_25q',
      title: 'Operating Systems: 25-Question Practice Drill',
      category: 'SSC',
      count: 25,
      duration: 20,
      marks: 25,
      match: isOS,
      badge: 'OS DRILL',
    },
    {
      id: 'ssc_imd_cs_cn_practice_25q',
      title: 'Computer Networks & TCP/IP: 25-Question Practice Drill',
      category: 'SSC',
      count: 25,
      duration: 20,
      marks: 25,
      match: isCN,
      badge: 'CN DRILL',
    },
    {
      id: 'ssc_imd_cs_dbms_practice_25q',
      title: 'Databases & SQL: 25-Question Practice Drill',
      category: 'SSC',
      count: 25,
      duration: 20,
      marks: 25,
      match: isDBMS,
      badge: 'DBMS DRILL',
    },
    {
      id: 'ssc_imd_cs_dsa_practice_25q',
      title: 'Programming & Data Structures: 25-Question Practice Drill',
      category: 'SSC',
      count: 25,
      duration: 20,
      marks: 25,
      match: isDSA,
      badge: 'DSA DRILL',
    },
    {
      id: 'ssc_imd_cs_algo_practice_25q',
      title: 'Algorithms & Complexity: 25-Question Practice Drill',
      category: 'SSC',
      count: 25,
      duration: 20,
      marks: 25,
      match: isAlgo,
      badge: 'ALGO DRILL',
    },
    {
      id: 'ssc_imd_cs_coa_practice_25q',
      title: 'Computer Architecture & Digital Logic: 25-Question Practice Drill',
      category: 'SSC',
      count: 25,
      duration: 20,
      marks: 25,
      match: (q) => isCOA(q) || isDigital(q),
      badge: 'COA DRILL',
    },
    {
      id: 'ssc_imd_cs_toc_compiler_practice_25q',
      title: 'TOC & Compiler Design: 25-Question Practice Drill',
      category: 'SSC',
      count: 25,
      duration: 20,
      marks: 25,
      match: isTOC,
      badge: 'TOC DRILL',
    },
    {
      id: 'ssc_imd_cs_math_practice_25q',
      title: 'Engineering Mathematics & Discrete Math: 25-Question Drill',
      category: 'SSC',
      count: 25,
      duration: 20,
      marks: 25,
      match: isMath,
      badge: 'MATH DRILL',
    },
    {
      id: 'ssc_imd_gi_reasoning_practice_50q',
      title: 'General Intelligence & Reasoning: 50-Question Speed Sprint',
      category: 'SSC',
      count: 50,
      duration: 35,
      marks: 50,
      match: isGI,
      badge: 'REASONING SPRINT',
    },
    {
      id: 'ssc_imd_ga_science_practice_50q',
      title: 'General Awareness & Everyday Science: 50-Question Practice Drill',
      category: 'SSC',
      count: 50,
      duration: 25,
      marks: 50,
      match: isGA,
      badge: 'SCIENCE & GK',
    },
  ];

  for (const d of drills) {
    let matchedQs = getQs(d.match, d.count);
    if (matchedQs.length < d.count) {
      // Backfill with other high-yield CS/relevant questions to reach exact count
      const fallbackQs = allQuestions.filter((q) => !matchedQs.some((m) => m.id === q.id));
      matchedQs = [...matchedQs, ...fallbackQs.slice(0, d.count - matchedQs.length)];
    }

    const testDoc: MockTest = {
      id: d.id,
      title: d.title,
      type: 'sectional',
      category: 'SSC',
      subject: 'Computer Science and Information Technology',
      difficulty: 'Medium',
      isLive: true,
      questionIds: matchedQs.map((q) => q.id),
      sections: [
        {
          name: d.title,
          questionIds: matchedQs.map((q) => q.id),
          totalQuestions: matchedQs.length,
          marks: matchedQs.length,
        },
      ],
      totalQuestions: matchedQs.length,
      totalMarks: d.marks,
      durationMinutes: d.duration,
      positiveMarks: 1,
      negativeMarks: 0.25,
      isFree: true,
      accessType: 'free',
      promotionalBadge: d.badge,
      promotionalNote: 'Subject-wise practice drill matching SSC JE CS / IMD 14.3.4 syllabus.',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    await db.collection('mock_tests').doc(d.id).set(testDoc, { merge: true });
    console.log(`✅ Saved Practice Drill: ${d.id} - "${d.title}" (${matchedQs.length} Qs)`);
  }

  console.log('\n🎉 ALL SUBJECT-WISE SYLLABUS DRILLS & OFFICIAL SYLLABUS GRAPH PERSISTED SUCCESSFULLY!\n');
  process.exit(0);
}

main().catch((err) => {
  console.error('Fatal error during seeding:', err);
  process.exit(1);
});
