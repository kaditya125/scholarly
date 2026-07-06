import { db } from '../config/firebase';

async function main() {
  const snap = await db.collection('notebooks').get();
  for (const doc of snap.docs) {
    const nb: any = doc.data();
    const srcs = (await doc.ref.collection('sources').get()).docs.map((d) => d.data() as any);
    if (srcs.length === 0 && !doc.id.startsWith('ncert')) continue;
    const ready = srcs.filter((s) => s.status === 'READY');
    const failed = srcs.filter((s) => s.status === 'FAILED');
    const inprog = srcs.filter((s) => !['READY', 'FAILED'].includes(s.status));
    const kg = (await doc.ref.collection('kg_nodes').get()).size;
    console.log(`\n[${doc.id}] "${nb.title}" owner=${nb.userId || nb.owner}  READY=${ready.length} FAILED=${failed.length} INPROG=${inprog.length} KGnodes=${kg}`);
    ready.forEach((s) => console.log(`   READY  ${s.title}  chunks=${s.chunksExtracted} concepts=${s.conceptsExtracted}`));
    inprog.forEach((s) => console.log(`   ${s.status}  ${s.title}`));
  }
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
