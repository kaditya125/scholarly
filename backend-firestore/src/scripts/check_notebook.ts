import { db } from '../config/firebase';

async function main() {
  const id = process.argv[2] || 'ncert-c11-physics';
  const nb = await db.collection('notebooks').doc(id).get();
  const n: any = nb.data();
  console.log('Notebook:', n?.title, '| stats:', JSON.stringify(n?.stats));

  const src = await db.collection('notebooks').doc(id).collection('sources').get();
  console.log(`Sources: ${src.size}`);
  src.docs.forEach((d) => {
    const s: any = d.data();
    console.log(`  ${s.title} [${s.status}] chunks=${s.chunksExtracted} concepts=${s.conceptsExtracted}`);
  });

  const kg = await db.collection('notebooks').doc(id).collection('kg_nodes').get();
  console.log(`KG nodes: ${kg.size}`);
  kg.docs.slice(0, 15).forEach((d) => {
    const k: any = d.data();
    console.log(`   - ${k.label} (${k.type})`);
  });
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
