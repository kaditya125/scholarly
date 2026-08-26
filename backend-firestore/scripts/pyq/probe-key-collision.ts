import 'dotenv/config';
import { db } from '../../src/config/firebase';
import { slugifyConcept } from '../../src/core/intelligence/MasteryEngine';
(async () => {
  const exams = await db.collection('exam_syllabi_graphs').listDocuments();
  const ids: string[] = [];
  for (const e of exams) {
    for (const v of await e.collection('versions').listDocuments()) {
      const ns = await v.collection('nodes').get();
      ns.forEach((n) => { const x: any = n.data(); if (x?.id) ids.push(x.id); });
    }
  }
  console.log(`canonical node ids: ${ids.length}`);
  const lens = ids.map((i) => i.length).sort((a, b) => a - b);
  console.log(`  raw id length     min=${lens[0]} median=${lens[Math.floor(lens.length/2)]} max=${lens[lens.length-1]}`);

  const keys = ids.map(slugifyConcept);
  const klens = keys.map((k) => k.length).sort((a, b) => a - b);
  console.log(`  slugified length  min=${klens[0]} median=${klens[Math.floor(klens.length/2)]} max=${klens[klens.length-1]}`);
  const truncated = ids.filter((i) => slugifyConcept(i).length >= 120).length;
  console.log(`  ids hitting the 120-char cap: ${truncated}`);

  const byKey = new Map<string, Set<string>>();
  ids.forEach((i) => { const k = slugifyConcept(i); if (!byKey.has(k)) byKey.set(k, new Set()); byKey.get(k)!.add(i); });
  const collisions = [...byKey.entries()].filter(([, s]) => s.size > 1);
  console.log(`\n  DISTINCT nodes collapsing to the SAME mastery key: ${collisions.length}`);
  collisions.slice(0, 3).forEach(([k, s]) => {
    console.log(`    key: ${k.slice(0, 100)}…`);
    [...s].slice(0, 2).forEach((i) => console.log(`       <- ${i}`));
  });
  const affected = collisions.reduce((a, [, s]) => a + s.size, 0);
  console.log(`\n  nodes affected by key collision: ${affected}/${ids.length}`);
  process.exit(0);
})().catch((e) => { console.error('FAILED:', e?.message || e); process.exit(1); });
