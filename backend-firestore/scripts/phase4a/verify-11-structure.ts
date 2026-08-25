import 'dotenv/config';
import { db } from '../../src/config/firebase';
import { syllabusNodesOf, walkSyllabusNodes, SyllabusNode } from '../../src/types/exam.types';

(async () => {
  const doc = await db.collection('exam_syllabi').doc('syl_ssc_cgl_2026_2026_v1').get();
  const s: any = doc.data();
  console.log(`status=${s.status}  version=${s.version}  hash=${s.sourceDocumentHash.slice(0,16)}…`);
  console.log(`storagePath=${s.storagePath}`);

  const nodes = syllabusNodesOf(s);
  const byType: Record<string, number> = {};
  let maxDepth = 0;
  const deepest: string[] = [];
  walkSyllabusNodes(nodes, (n, path) => {
    byType[n.type] = (byType[n.type] || 0) + 1;
    if (path.length + 1 > maxDepth) { maxDepth = path.length + 1; deepest.length = 0; deepest.push([...path, n.name].join(' → ')); }
  });
  console.log('\nnodes by type:', JSON.stringify(byType));
  console.log(`max depth: ${maxDepth}`);
  console.log(`deepest path: ${deepest[0]}`);

  console.log('\ntop level:');
  nodes.forEach(n => console.log(`  ${n.type.padEnd(8)} ${n.name}  (${n.children.length} children: ${[...new Set(n.children.map(c => c.type))].join(',') || '-'})`));

  // The three shapes that broke the old model.
  const skips: string[] = [];
  walkSyllabusNodes(nodes, (n, path, parent) => {
    if (parent && n.type === 'SUBJECT' && parent.type === 'STAGE') skips.push(`SUBJECT under STAGE: ${[...path, n.name].join(' → ')}`);
    if (parent && n.type === 'TOPIC' && parent.type === 'SECTION') skips.push(`TOPIC under SECTION: ${[...path, n.name].join(' → ')}`);
    if (parent && n.type === 'SUBTOPIC' && parent.type === 'SUBTOPIC') skips.push(`SUBTOPIC in SUBTOPIC: ${[...path, n.name].join(' → ')}`);
  });
  console.log('\nlevel-skipping / recursion actually present in the real document:');
  [...new Set(skips.map(x => x.split(':')[0]))].forEach(k => {
    const ex = skips.find(x => x.startsWith(k));
    console.log(`  ${k}  (${skips.filter(x => x.startsWith(k)).length}x)  e.g. ${ex!.split(': ')[1].slice(0, 84)}`);
  });
  if (!skips.length) console.log('  (none)');
  process.exit(0);
})().catch(e => { console.error('FAILED:', e?.message || e); process.exit(1); });
