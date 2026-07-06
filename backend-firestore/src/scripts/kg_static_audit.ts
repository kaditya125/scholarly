/**
 * KG static quality/structure audit (Firestore read-only — no AI calls, zero token cost).
 * Usage: npx tsx src/scripts/kg_static_audit.ts [notebookId ...]
 */
import { db } from '../config/firebase';

interface KGNode { id: string; label: string; type: string; definition?: string; prerequisites?: string[]; importance?: number; sourceDocIds?: string[]; }
interface KGEdge { id: string; sourceNodeId: string; targetNodeId: string; relationshipType: string; confidence?: number; }

async function analyze(notebookId: string) {
  const nbRef = db.collection('notebooks').doc(notebookId);
  const [nodesSnap, edgesSnap, srcSnap] = await Promise.all([
    nbRef.collection('kg_nodes').get(),
    nbRef.collection('kg_edges').get(),
    nbRef.collection('sources').where('status', '==', 'READY').get(),
  ]);
  const nodes = nodesSnap.docs.map(d => d.data() as KGNode);
  const edges = edgesSnap.docs.map(d => d.data() as KGEdge);
  const nodeIds = new Set(nodes.map(n => n.id));
  const readySources = srcSnap.size;
  const totalChunks = srcSnap.docs.reduce((a, d) => a + ((d.data() as any).chunksExtracted || 0), 0);

  const typeDist: Record<string, number> = {};
  nodes.forEach(n => { typeDist[n.type] = (typeDist[n.type] || 0) + 1; });
  const relDist: Record<string, number> = {};
  edges.forEach(e => { relDist[e.relationshipType] = (relDist[e.relationshipType] || 0) + 1; });

  const labelCount: Record<string, number> = {};
  nodes.forEach(n => { const k = (n.label || '').trim().toLowerCase(); labelCount[k] = (labelCount[k] || 0) + 1; });
  const dupLabels = Object.entries(labelCount).filter(([, c]) => c > 1);

  const degree: Record<string, number> = {};
  let selfLoops = 0, dangling = 0;
  for (const e of edges) {
    if (e.sourceNodeId === e.targetNodeId) { selfLoops++; continue; }
    if (!nodeIds.has(e.sourceNodeId) || !nodeIds.has(e.targetNodeId)) { dangling++; continue; }
    degree[e.sourceNodeId] = (degree[e.sourceNodeId] || 0) + 1;
    degree[e.targetNodeId] = (degree[e.targetNodeId] || 0) + 1;
  }
  const connected = nodes.filter(n => (degree[n.id] || 0) > 0).length;
  const isolated = nodes.length - connected;
  const degrees = nodes.map(n => degree[n.id] || 0);
  const avgDegree = degrees.reduce((a, b) => a + b, 0) / (nodes.length || 1);
  const maxDegree = degrees.length ? Math.max(...degrees) : 0;

  // Union-find connected components
  const parent: Record<string, string> = {};
  nodes.forEach(n => { parent[n.id] = n.id; });
  const find = (x: string): string => { let r = x; while (parent[r] !== r) r = parent[r]; while (parent[x] !== r) { const nx = parent[x]; parent[x] = r; x = nx; } return r; };
  for (const e of edges) {
    if (e.sourceNodeId === e.targetNodeId) continue;
    if (!nodeIds.has(e.sourceNodeId) || !nodeIds.has(e.targetNodeId)) continue;
    const a = find(e.sourceNodeId), b = find(e.targetNodeId);
    if (a !== b) parent[a] = b;
  }
  const compSize: Record<string, number> = {};
  nodes.forEach(n => { const r = find(n.id); compSize[r] = (compSize[r] || 0) + 1; });
  const components = Object.keys(compSize).length;
  const largestComp = Object.values(compSize).length ? Math.max(...Object.values(compSize)) : 0;

  const withPrereq = nodes.filter(n => Array.isArray(n.prerequisites) && n.prerequisites.length > 0).length;
  const isGeneric = (d: string) => !d || d === 'Key term from the material' || d.startsWith('Notable person') || d.startsWith('Notable place') || d.startsWith('Formula:') || d.startsWith('Theorem/principle:') || d === 'Extracted keyword' || d.startsWith('Extracted');
  const genericDefs = nodes.filter(n => isGeneric(n.definition || '')).length;
  const avgDefLen = Math.round(nodes.reduce((a, n) => a + ((n.definition || '').length), 0) / (nodes.length || 1));

  const idToLabel: Record<string, string> = {};
  nodes.forEach(n => { idToLabel[n.id] = n.label; });
  const topNodes = nodes.map(n => ({ label: n.label, type: n.type, deg: degree[n.id] || 0 })).sort((a, b) => b.deg - a.deg).slice(0, 8);

  console.log(`\n===================== ${notebookId} =====================`);
  console.log(`READY sources: ${readySources} | chunks: ${totalChunks}`);
  console.log(`Nodes: ${nodes.length} | Edges: ${edges.length} | self-loops: ${selfLoops} | dangling edges: ${dangling}`);
  console.log(`Node types: ${JSON.stringify(typeDist)}`);
  console.log(`Edge types: ${JSON.stringify(relDist)}`);
  console.log(`Duplicate labels: ${dupLabels.length}${dupLabels.length ? ' e.g. ' + dupLabels.slice(0, 6).map(([l, c]) => `"${l}"x${c}`).join(', ') : ''}`);
  console.log(`Isolated nodes: ${isolated} (${(isolated / (nodes.length || 1) * 100).toFixed(1)}%) | Connected: ${connected}`);
  console.log(`Avg degree: ${avgDegree.toFixed(2)} | Max degree: ${maxDegree}`);
  console.log(`Connected components: ${components} | Largest: ${largestComp} (${(largestComp / (nodes.length || 1) * 100).toFixed(1)}% of nodes)`);
  console.log(`Nodes w/ prerequisites: ${withPrereq} (${(withPrereq / (nodes.length || 1) * 100).toFixed(1)}%)`);
  console.log(`Generic/low-info definitions: ${genericDefs} (${(genericDefs / (nodes.length || 1) * 100).toFixed(1)}%) | avg def length: ${avgDefLen} chars`);
  console.log(`Top-connected concepts: ${topNodes.map(t => `${t.label}(${t.deg})`).join(', ')}`);
  console.log(`Sample nodes:`);
  nodes.slice(0, 6).forEach(n => console.log(`   [${n.type}] ${n.label} :: ${(n.definition || '').slice(0, 90)}`));
  console.log(`Sample edges:`);
  edges.slice(0, 10).forEach(e => console.log(`   ${idToLabel[e.sourceNodeId] || e.sourceNodeId}  --${e.relationshipType}${e.confidence != null ? ` (${e.confidence})` : ''}-->  ${idToLabel[e.targetNodeId] || e.targetNodeId}`));
}

async function main() {
  const args = process.argv.slice(2);
  const targets = args.length ? args : ['ncert-c9-physics', 'ncert-c11-physics', 'ncert-c12-physics'];
  for (const nb of targets) {
    try { await analyze(nb); } catch (e: any) { console.error(`[${nb}] FAILED: ${e?.message || e}`); }
  }
  process.exit(0);
}
main().catch(e => { console.error(e); process.exit(1); });
