/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * Sadhya — UGC NET Computer Science & Applications (Code 87) Pattern Analytics
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Computes deep pattern analytics over authentic UGC NET CS PYQs:
 *   - Unit-wise distribution & historical weightage across all 10 official units.
 *   - Question typology breakdown (conceptual, numerical, code_analysis, statement_based, matching).
 *   - Chronological era evolution (UGC pre-2012 -> UGC OMR 2012-2014 -> CBSE 2014-2018 -> July 2018 unified).
 *   - High-yield recurring concept matrix per unit.
 *   - Blueprint generation parameters for authentic mock test creation.
 *
 * Saves output to:
 *   - Local JSON: dataset_staging/ugc_net_cs/ugc_net_cs_pattern_analytics.json
 *   - Firestore: collection 'pyq_analytics', doc ID 'UGC_NET_CS_87'
 *
 * USAGE:
 *   npx tsx scripts/pyq/ugc_net/ugcnetPatternAnalytics.ts
 *   npx tsx scripts/pyq/ugc_net/ugcnetPatternAnalytics.ts --save-firestore
 */

import * as fs from 'fs';
import * as path from 'path';
import { db } from '../../../src/config/firebase';
import { UGC_NET_CS_TAXONOMY } from './ugcnetSyllabusTaxonomy';

const UGC_NET_CS_UNITS = Object.values(UGC_NET_CS_TAXONOMY);

const SAVE_FIRESTORE = process.argv.includes('--save-firestore');
const POOL_PATH = path.resolve('dataset_staging/ugc_net_cs/ugc_net_cs_all_extracted_pyqs.json');
const OUT_ANALYTICS_PATH = path.resolve('dataset_staging/ugc_net_cs/ugc_net_cs_pattern_analytics.json');

interface ConceptMetric {
  name: string;
  keywords: string[];
  count: number;
  percentageInUnit: number;
}

const HIGH_YIELD_CONCEPT_DEFINITIONS: Record<number, { name: string; keywords: string[] }[]> = {
  1: [
    { name: 'Graph Theory & Trees', keywords: ['graph', 'vertex', 'vertices', 'edge', 'tree', 'chromatic', 'eulerian', 'hamiltonian', 'bipartite', 'planar'] },
    { name: 'Propositional & Predicate Logic', keywords: ['proposition', 'tautology', 'predicate', 'quantifier', 'logic', 'formula', 'well-formed', 'inference'] },
    { name: 'Set Theory, Relations & Posets', keywords: ['relation', 'equivalence relation', 'partial order', 'poset', 'lattice', 'hasse diagram', 'set'] },
    { name: 'Combinatorics & Recurrence', keywords: ['permutation', 'combination', 'pigeonhole', 'recurrence relation', 'generating function', 'recurrence'] },
    { name: 'Optimization & LPP', keywords: ['simplex', 'linear programming', 'lpp', 'dual', 'objective function', 'feasible region', 'transportation'] },
  ],
  2: [
    { name: 'Pipeline & Instruction Hazards', keywords: ['pipeline', 'pipelining', 'hazard', 'branch prediction', 'data hazard', 'structural hazard', 'stall'] },
    { name: 'Cache Memory & Virtual Memory Organization', keywords: ['cache', 'hit ratio', 'miss penalty', 'direct mapping', 'set associative', 'associative', 'tag'] },
    { name: 'Addressing Modes & CPU Organization', keywords: ['addressing mode', 'register', 'accumulator', 'instruction format', 'microprogramming', 'risc', 'cisc'] },
    { name: 'Digital Logic & Boolean Minimization', keywords: ['k-map', 'karnaugh', 'boolean', 'multiplexer', 'decoder', 'flip-flop', 'counter', 'sop', 'pos'] },
  ],
  3: [
    { name: 'C & C++ Programming Concepts', keywords: ['pointer', 'malloc', 'calloc', 'class', 'constructor', 'destructor', 'inheritance', 'polymorphism', 'virtual function'] },
    { name: 'Computer Graphics & Transformations', keywords: ['bresenham', 'dda', 'raster', 'transformation', 'rotation', 'scaling', 'shearing', 'clipping', 'cohen-sutherland'] },
    { name: 'Web Programming & Markup', keywords: ['html', 'xml', 'javascript', 'servlet', 'dom', 'dtd', 'css'] },
  ],
  4: [
    { name: 'Relational Model & Normalization', keywords: ['normal form', '1nf', '2nf', '3nf', 'bcnf', 'functional dependency', 'lossless', 'dependency preserving'] },
    { name: 'SQL & Relational Algebra', keywords: ['sql', 'relational algebra', 'tuple relational', 'select', 'project', 'join', 'group by', 'having'] },
    { name: 'Transaction Management & Concurrency Control', keywords: ['transaction', 'acid', 'serializability', 'two-phase locking', '2pl', 'timestamp', 'deadlock', 'recovery'] },
    { name: 'File Organization & Indexing (B-Trees)', keywords: ['b-tree', 'b+ tree', 'indexing', 'dense index', 'sparse index', 'hashing'] },
  ],
  5: [
    { name: 'CPU Scheduling Algorithms', keywords: ['scheduling', 'round robin', 'sjf', 'fcfs', 'priority scheduling', 'turnaround time', 'waiting time'] },
    { name: 'Memory Management & Paging', keywords: ['paging', 'page fault', 'tlb', 'virtual memory', 'fifo', 'lru', 'belady', 'segmentation'] },
    { name: 'Process Synchronization & Semaphores', keywords: ['semaphore', 'critical section', 'mutual exclusion', 'race condition', 'peterson', 'producer-consumer'] },
    { name: 'Deadlocks & Banker\'s Algorithm', keywords: ['deadlock', 'banker', 'safe state', 'resource allocation graph', 'prevention', 'avoidance'] },
  ],
  6: [
    { name: 'Software Development Life Cycle & Agile', keywords: ['sdlc', 'waterfall', 'spiral', 'agile', 'scrum', 'rad', 'prototype'] },
    { name: 'Software Metrics & Cost Estimation (COCOMO)', keywords: ['cocomo', 'function point', 'fp', 'loc', 'kloc', 'effort', 'cost estimation'] },
    { name: 'Software Testing & Quality Assurance', keywords: ['testing', 'cyclomatic complexity', 'white box', 'black box', 'boundary value', 'cmm', 'iso 9000'] },
    { name: 'Design Patterns & Coupling/Cohesion', keywords: ['coupling', 'cohesion', 'object-oriented design', 'uml', 'design pattern'] },
  ],
  7: [
    { name: 'Algorithm Asymptotics & Complexity Classes', keywords: ['big-o', 'time complexity', 'space complexity', 'np-complete', 'np-hard', 'polynomial time', 'p vs np'] },
    { name: 'Trees & Balanced Search Trees', keywords: ['binary search tree', 'bst', 'avl', 'red-black', 'heap', 'traversal', 'inorder', 'preorder', 'postorder'] },
    { name: 'Graph Algorithms & Shortest Path', keywords: ['dijkstra', 'bellman-ford', 'prim', 'kruskal', 'minimum spanning tree', 'mst', 'bfs', 'dfs'] },
    { name: 'Sorting & Searching Algorithms', keywords: ['quicksort', 'mergesort', 'heapsort', 'bubble sort', 'binary search', 'comparisons'] },
    { name: 'Dynamic Programming & Greedy Algorithms', keywords: ['dynamic programming', 'greedy', 'knapsack', 'optimal substructure', 'matrix chain'] },
  ],
  8: [
    { name: 'Chomsky Hierarchy & Grammars', keywords: ['chomsky', 'regular grammar', 'context-free', 'cfg', 'type 0', 'type 1', 'type 2', 'type 3', 'ambiguity'] },
    { name: 'Finite Automata & Regular Languages', keywords: ['dfa', 'nfa', 'regular expression', 'pumping lemma', 'equivalence', 'minimization'] },
    { name: 'Pushdown Automata & Turing Machines', keywords: ['pda', 'pushdown', 'turing machine', 'halting problem', 'decidable', 'undecidable', 'recursively enumerable'] },
    { name: 'Compiler Phases & Parsing', keywords: ['compiler', 'lexical analysis', 'parser', 'lr parser', 'll parser', 'shift reduce', 'intermediate code', 'code optimization'] },
  ],
  9: [
    { name: 'IP Addressing, Subnetting & CIDR', keywords: ['subnet', 'cidr', 'ipv4', 'ipv6', 'classful', 'mask', 'subnet mask', 'address space'] },
    { name: 'OSI & TCP/IP Protocol Layers', keywords: ['osi', 'tcp/ip', 'transport layer', 'network layer', 'data link', 'physical layer', 'application layer'] },
    { name: 'Routing Protocols & Algorithms', keywords: ['routing', 'distance vector', 'link state', 'ospf', 'rip', 'bgp', 'dijkstra', 'count to infinity'] },
    { name: 'Transport Layer (TCP/UDP) & Flow/Congestion Control', keywords: ['tcp', 'udp', 'congestion control', 'flow control', 'sliding window', 'three-way handshake', 'go-back-n', 'selective repeat'] },
    { name: 'Network Security & Cryptography', keywords: ['cryptography', 'rsa', 'des', 'aes', 'digital signature', 'public key', 'symmetric key', 'firewall'] },
  ],
  10: [
    { name: 'State Space Search & Heuristics (A*, AO*)', keywords: ['heuristic', 'a*', 'ao*', 'alpha-beta', 'minimax', 'state space', 'informed search', 'best-first'] },
    { name: 'Knowledge Representation & Expert Systems', keywords: ['knowledge representation', 'semantic net', 'frame', 'expert system', 'inference engine', 'prolog'] },
    { name: 'Machine Learning & Neural Networks', keywords: ['neural network', 'perceptron', 'backpropagation', 'activation function', 'supervised', 'unsupervised', 'clustering'] },
    { name: 'Fuzzy Logic & Genetic Algorithms', keywords: ['fuzzy', 'membership function', 'defuzzification', 'genetic algorithm', 'crossover', 'mutation', 'fitness'] },
  ],
};

function determineEra(year: number): string {
  if (year <= 2011) return 'UGC_CLASSIC_ERA (2009-2011)';
  if (year >= 2012 && year <= 2014) return 'UGC_OBJECTIVE_OMR_ERA (2012-2014)';
  if (year >= 2015 && year <= 2017) return 'CBSE_ERA (2015-2017)';
  return 'UNIFIED_EXAM_ERA (2018+)';
}

export function runPatternAnalytics() {
  console.log('═══════════════════════════════════════════════════════════════════');
  console.log('  Sadhya — UGC NET Computer Science (Code 87) Pattern Analytics');
  console.log('═══════════════════════════════════════════════════════════════════\n');

  if (!fs.existsSync(POOL_PATH)) {
    throw new Error(`Staged PYQ pool not found at: ${POOL_PATH}`);
  }

  const questions: any[] = JSON.parse(fs.readFileSync(POOL_PATH, 'utf-8'));
  const totalQuestions = questions.length;
  console.log(`📊 Analyzing ${totalQuestions} authentic UGC NET CS questions...\n`);

  // 1. Paper and Year Distribution
  const papersSet = new Set<string>();
  const yearDistribution: Record<number, number> = {};
  const eraDistribution: Record<string, number> = {};

  for (const q of questions) {
    papersSet.add(q.canonicalPaperId);
    yearDistribution[q.year] = (yearDistribution[q.year] || 0) + 1;
    const era = determineEra(q.year);
    eraDistribution[era] = (eraDistribution[era] || 0) + 1;
  }

  // 2. Unit Distribution
  const unitStats: Record<number, { title: string; count: number; percentage: number; recurringConcepts: ConceptMetric[] }> = {};

  for (const u of UGC_NET_CS_UNITS) {
    const uQuestions = questions.filter((q) => q.unitNumber === u.unitNumber);
    const count = uQuestions.length;
    const percentage = Number(((count / totalQuestions) * 100).toFixed(2));

    // Concept frequencies
    const conceptDefs = HIGH_YIELD_CONCEPT_DEFINITIONS[u.unitNumber] || [];
    const recurringConcepts: ConceptMetric[] = [];

    for (const cDef of conceptDefs) {
      let matchCount = 0;
      for (const q of uQuestions) {
        const textLower = (q.questionText + ' ' + (q.options || []).join(' ')).toLowerCase();
        if (cDef.keywords.some((kw) => textLower.includes(kw.toLowerCase()))) {
          matchCount++;
        }
      }
      const conceptPct = count > 0 ? Number(((matchCount / count) * 100).toFixed(1)) : 0;
      recurringConcepts.push({
        name: cDef.name,
        keywords: cDef.keywords,
        count: matchCount,
        percentageInUnit: conceptPct,
      });
    }

    // Sort concepts descending
    recurringConcepts.sort((a, b) => b.count - a.count);

    unitStats[u.unitNumber] = {
      title: u.unitTitle,
      count,
      percentage,
      recurringConcepts,
    };
  }

  // 3. Question Typology Breakdown
  const typeCounts: Record<string, number> = {};
  for (const q of questions) {
    const t = q.questionType || 'conceptual';
    typeCounts[t] = (typeCounts[t] || 0) + 1;
  }
  const typologyBreakdown: Record<string, { count: number; percentage: number }> = {};
  for (const [k, v] of Object.entries(typeCounts)) {
    typologyBreakdown[k] = {
      count: v,
      percentage: Number(((v / totalQuestions) * 100).toFixed(2)),
    };
  }

  // 4. Blueprint Specification for Mock Generation (Standard 100-Question UGC NET Paper II)
  const mockBlueprint100: Record<number, { unitTitle: string; targetQuestions: number; recommendedTypes: Record<string, number> }> = {};
  
  // Allocate 100 questions proportionally across units
  let allocated = 0;
  const unitList = UGC_NET_CS_UNITS.map(u => ({
    unitNumber: u.unitNumber,
    title: u.unitTitle,
    rawTarget: (unitStats[u.unitNumber].count / totalQuestions) * 100
  })).sort((a, b) => b.rawTarget - a.rawTarget);

  for (let i = 0; i < unitList.length; i++) {
    const item = unitList[i];
    let quota = Math.round(item.rawTarget);
    if (i === unitList.length - 1) {
      // Adjust last item so total is exactly 100
      quota = 100 - allocated;
    }
    allocated += quota;

    // Proportional breakdown of question types for this unit
    mockBlueprint100[item.unitNumber] = {
      unitTitle: item.title,
      targetQuestions: quota,
      recommendedTypes: {
        conceptual: Math.round(quota * 0.60),
        numerical: Math.round(quota * 0.15),
        statement_based: Math.round(quota * 0.12),
        code_analysis: Math.round(quota * 0.08),
        matching: Math.max(1, quota - (Math.round(quota * 0.60) + Math.round(quota * 0.15) + Math.round(quota * 0.12) + Math.round(quota * 0.08))),
      }
    };
  }

  const fullAnalytics = {
    metadata: {
      examId: 'UGC_NET',
      subject: 'Computer Science and Applications',
      subjectCode: '87',
      totalPapersAnalyzed: papersSet.size,
      totalQuestionsAnalyzed: totalQuestions,
      generatedAt: new Date().toISOString(),
      provenanceSource: 'Official UGC NET Question Papers (2009-2018)',
    },
    eraDistribution,
    yearDistribution,
    unitWeightage: unitStats,
    typologyBreakdown,
    mockBlueprint100,
  };

  // Write to local disk
  fs.writeFileSync(OUT_ANALYTICS_PATH, JSON.stringify(fullAnalytics, null, 2), 'utf-8');
  console.log(`💾 Saved analytics JSON to: ${OUT_ANALYTICS_PATH}`);

  // Display summary table
  console.log('\n┌──────┬────────────────────────────────────────────────────────┬─────────┬────────────┐');
  console.log('│ Unit │ Unit Title                                             │ Questions│ Weightage  │');
  console.log('├──────┼────────────────────────────────────────────────────────┼─────────┼────────────┤');
  for (const [unitNum, s] of Object.entries(unitStats)) {
    console.log(`│ ${unitNum.padEnd(4)} │ ${s.title.padEnd(54)} │ ${String(s.count).padStart(7)} │ ${String(s.percentage).padStart(8)}%  │`);
  }
  console.log('└──────┴────────────────────────────────────────────────────────┴─────────┴────────────┘');

  console.log('\nTypology Breakdown:');
  for (const [typ, data] of Object.entries(typologyBreakdown)) {
    console.log(`  - ${typ.padEnd(16)}: ${String(data.count).padStart(5)} (${data.percentage}%)`);
  }

  return fullAnalytics;
}

async function main() {
  const analytics = runPatternAnalytics();

  if (SAVE_FIRESTORE) {
    console.log('\n--- Syncing Analytics to Firestore ---');
    await db.collection('pyq_analytics').doc('UGC_NET_CS_87').set(analytics, { merge: true });
    await db.collection('pyq_analytics').doc('UGC_NET').set(analytics, { merge: true });
    console.log('✅ Ingested UGC NET CS analytics into Firestore (pyq_analytics: UGC_NET_CS_87 & UGC_NET).');
  } else {
    console.log('\nℹ️ Pass --save-firestore to persist analytics into Firestore collection "pyq_analytics".');
  }
}

if (require.main === module) {
  main().then(() => process.exit(0)).catch((err) => {
    console.error('Analytics execution failed:', err);
    process.exit(1);
  });
}
