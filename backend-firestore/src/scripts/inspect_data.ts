/**
 * READ-ONLY inspection of ingested sources + knowledge graph nodes, to explain
 * what's in the platform's knowledge base. Does not modify anything.
 */
import { db } from '../config/firebase';

async function main() {
  // ── Sources (ingested documents) ──
  const srcSnap = await db.collectionGroup('sources').get();
  const sources = srcSnap.docs.map((d) => {
    const s: any = d.data();
    return {
      notebookId: d.ref.parent.parent?.id || '?',
      title: s.title || s.fileName || s.name || '(untitled)',
      status: s.status || '?',
      type: s.type || s.sourceType || '?',
      createdAt: s.createdAt || null,
    };
  });

  console.log('TOTAL SOURCES:', sources.length);

  const byTitle: Record<string, number> = {};
  const byNotebook: Record<string, number> = {};
  const byStatus: Record<string, number> = {};
  for (const s of sources) {
    byTitle[s.title] = (byTitle[s.title] || 0) + 1;
    byNotebook[s.notebookId] = (byNotebook[s.notebookId] || 0) + 1;
    byStatus[s.status] = (byStatus[s.status] || 0) + 1;
  }
  console.log('BY TITLE  :', JSON.stringify(byTitle));
  console.log('BY STATUS :', JSON.stringify(byStatus));
  console.log('BY NOTEBOOK (count of sources per notebook):', JSON.stringify(byNotebook));

  console.log('\nSOURCE LIST:');
  sources
    .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))
    .forEach((s) => console.log(`  ${s.title}  [${s.status}]  nb=${s.notebookId}  ${s.createdAt ? new Date(s.createdAt).toLocaleString() : ''}`));

  // ── Notebooks these belong to ──
  const nbIds = Object.keys(byNotebook).filter((x) => x !== '?');
  console.log('\nNOTEBOOKS OWNING THESE SOURCES:');
  for (const nbId of nbIds) {
    const doc = await db.collection('notebooks').doc(nbId).get();
    const nb: any = doc.data();
    console.log(`  ${nbId} → title="${nb?.title || '(missing)'}" owner=${nb?.userId || nb?.owner || '?'}`);
  }

  // ── Knowledge graph nodes ──
  const kgCount = await db.collectionGroup('kg_nodes').count().get();
  const kgSnap = await db.collectionGroup('kg_nodes').limit(25).get();
  console.log('\nKG NODES TOTAL:', kgCount.data().count);
  console.log('KG NODE SAMPLE:');
  kgSnap.docs.forEach((d) => {
    const n: any = d.data();
    console.log(`  "${n.label || n.concept || d.id}"  (nb=${d.ref.parent.parent?.id})`);
  });

  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
