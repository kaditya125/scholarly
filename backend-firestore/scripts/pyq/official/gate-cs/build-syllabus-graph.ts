/**
 * Give the transcribed GATE CS syllabus tree its canonical node ids and run the application's own
 * graph validation on it — the same functions the publish gate relies on. Writes nothing to Firestore.
 */
import * as fs from 'fs';
import * as path from 'path';
import { canonicalNodeId, buildCanonicalGraph, validateCanonicalGraph } from '../../../../src/services/exam/syllabusCanonicalGraph';

const DIR = path.resolve(__dirname, '..', 'out', 'gate-cs', 'syllabus');
const structure = JSON.parse(fs.readFileSync(path.join(DIR, 'syllabus-structure.json'), 'utf8'));
const examId = 'GATE_CS', cycleId = '2026', syllabusId = 'syl_gate_cs_2026_2026_v1';

function assign(n: any, parentPath: string[]): any {
  const nodeId = canonicalNodeId({ examId, cycleId, syllabusId, type: n.type, parentPath, officialName: n.name });
  return { ...n, nodeId, children: (n.children || []).map((c: any) => assign(c, [...parentPath, n.name])) };
}
const nodes = structure.nodes.map((n: any) => assign(n, []));
const syllabus: any = { syllabusId, examId, cycleId, version: '2026-v1', nodes };
const graph = buildCanonicalGraph(syllabus);
const result = validateCanonicalGraph(graph, { examId, cycleId, syllabusId });
fs.writeFileSync(path.join(DIR, 'syllabus-candidate.json'), JSON.stringify({ ...structure, syllabusId, version: '2026-v1', nodes, graph: { nodeCount: graph.nodes.length, edgeCount: graph.edges.length, valid: result.valid, errors: result.errors } }, null, 1));
console.log(`graph nodes=${graph.nodes.length} edges=${graph.edges.length} valid=${result.valid} errors=${JSON.stringify(result.errors).slice(0, 400)}`);
const topics = graph.nodes.filter((n: any) => n.type === 'TOPIC').length;
console.log(`question-bearing TOPIC nodes: ${topics}`);
process.exit(result.valid ? 0 : 2);
