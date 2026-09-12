/**
 * Push canonical paper identity and provenance class onto the Qdrant PYQ payloads.
 *
 * DRY RUN BY DEFAULT; `--execute` writes. This only ever *adds* keys via `setPayload`, which
 * merges — no payload key is removed and no point is deleted, so the change is additive and the
 * prior state of every touched key (all previously absent) is recorded in the snapshot anyway.
 *
 * Why the payload needs this at all: ranking reads the vector, not Firestore. Repairing
 * provenance in Firestore alone leaves the retrieval layer still scoring a practice question as an
 * authentic past paper, because the only signal it can see is `content_type: 'pyq'` — which 5,050
 * practice vectors carry.
 *
 * A deliberate choice about `content_type`: it stays `'pyq'`. It marks which *corpus* a vector
 * belongs to, and practice questions genuinely belong to the PYQ corpus — they are simply not
 * authentic past papers. Re-typing them would silently remove them from practice workflows that
 * legitimately want them. Authenticity moves to `provenanceClass` / `isAuthenticPyq`, which
 * ranking and any official-only filter read instead. Authenticity now comes from provenance
 * rather than from corpus membership, which was the actual defect.
 */
import { firebaseApp } from '../../../src/config/firebase';
import { QdrantClient } from '@qdrant/js-client-rest';
import { QDRANT_COLLECTION } from '../../../src/services/rag/qdrant.service';
import { env } from '../../../src/config/env';
import { isAuthenticPyq, ProvenanceClass } from '../../../src/services/pyq/paperIdentity';
import * as fs from 'fs';
import * as path from 'path';

const EXECUTE = process.argv.includes('--execute');
const OUT_DIR = path.join(__dirname, 'out');
const STAMP = new Date().toISOString().replace(/[:.]/g, '-');

async function main() {
  console.log(`=== QDRANT PAYLOAD SYNC === ${EXECUTE ? 'EXECUTE' : 'DRY RUN (pass --execute to write)'}\n`);
  const db = firebaseApp.firestore();
  const client = new QdrantClient({ url: env.QDRANT_URL, apiKey: process.env.QDRANT_API_KEY || undefined, checkCompatibility: false });

  // Firestore is the source of truth for identity and provenance — it was just reconciled.
  const byPointId = new Map<string, any>();
  let last: any = null;
  let loaded = 0;
  while (true) {
    let q: FirebaseFirestore.Query = db.collection('pyq_questions').orderBy('__name__').limit(2000);
    if (last) q = q.startAfter(last);
    const s = await q.get();
    if (s.empty) break;
    for (const d of s.docs) {
      const x: any = d.data();
      loaded++;
      if (x.qdrantPointId) byPointId.set(x.qdrantPointId, x);
    }
    last = s.docs[s.docs.length - 1];
    if (s.size < 2000) break;
  }
  console.log(`firestore questions with a derived point id: ${byPointId.size} / ${loaded}`);

  // Which PYQ points actually exist.
  const existing: string[] = [];
  let offset: any = undefined;
  while (true) {
    const res: any = await client.scroll(QDRANT_COLLECTION, {
      limit: 2000, offset, with_payload: { include: ['content_type'] } as any, with_vector: false,
    });
    for (const p of res.points ?? []) if (p.payload?.content_type === 'pyq') existing.push(String(p.id));
    offset = res.next_page_offset;
    if (!offset) break;
  }
  console.log(`qdrant pyq points: ${existing.length}\n`);

  // Group points that share an identical patch, so this is a few hundred calls rather than 22,000.
  const groups = new Map<string, { patch: Record<string, any>; ids: string[] }>();
  let matched = 0;
  let unmatched = 0;
  for (const id of existing) {
    const q = byPointId.get(id);
    if (!q) { unmatched++; continue; }
    matched++;
    const cls: ProvenanceClass = q.provenanceClass ?? 'UNKNOWN';
    const patch = {
      provenanceClass: cls,
      isAuthenticPyq: isAuthenticPyq(cls),
      canonicalPaperId: q.canonicalPaperId ?? null,
      paperIdentityStatus: q.paperIdentityStatus ?? 'UNRESOLVED',
      sittingId: q.sittingId ?? null,
      normalizedSession: q.normalizedSession ?? null,
      normalizedShift: q.normalizedShift ?? null,
      normalizedSittingDate: q.normalizedSittingDate ?? null,
    };
    const key = JSON.stringify(patch);
    if (!groups.has(key)) groups.set(key, { patch, ids: [] });
    groups.get(key)!.ids.push(id);
  }

  console.log(`points matched to a Firestore question: ${matched}`);
  console.log(`points with no Firestore question (orphans, left untouched): ${unmatched}`);
  console.log(`distinct payload patches: ${groups.size}\n`);

  const authentic = [...groups.values()].filter((g) => g.patch.isAuthenticPyq).reduce((a, g) => a + g.ids.length, 0);
  const withPaper = [...groups.values()].filter((g) => g.patch.canonicalPaperId).reduce((a, g) => a + g.ids.length, 0);
  console.log(`  will be marked isAuthenticPyq=true : ${authentic}`);
  console.log(`  will be marked isAuthenticPyq=false: ${matched - authentic}   <- lose the 1.4x boost`);
  console.log(`  will carry a canonicalPaperId      : ${withPaper}`);

  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(path.join(OUT_DIR, 'qdrant-payload-plan.json'), JSON.stringify({
    generatedAt: new Date().toISOString(), executed: EXECUTE,
    pyqPoints: existing.length, matched, unmatched, patchGroups: groups.size,
    willBeAuthentic: authentic, willLoseBoost: matched - authentic, willCarryPaperId: withPaper,
    samplePatches: [...groups.values()].slice(0, 10).map((g) => ({ patch: g.patch, pointCount: g.ids.length })),
  }, null, 2));

  if (!EXECUTE) {
    console.log('\nDRY RUN — nothing written. Re-run with --execute to apply.');
    return;
  }

  fs.writeFileSync(
    path.join(OUT_DIR, `qdrant-payload-backup-${STAMP}.json`),
    JSON.stringify({ note: 'keys added by this run were absent beforehand; setPayload merges and removes nothing', pointIds: existing }, null, 2),
  );

  let done = 0;
  for (const { patch, ids } of groups.values()) {
    for (let i = 0; i < ids.length; i += 500) {
      await client.setPayload(QDRANT_COLLECTION, { payload: patch, points: ids.slice(i, i + 500), wait: false });
    }
    done += ids.length;
    process.stderr.write(`\r  patched ${done}/${matched}`);
  }
  process.stderr.write('\n');
  console.log(`\nPATCHED ${done} points across ${groups.size} groups.`);
}

main().then(() => process.exit(0)).catch((e) => { console.error('FAILED:', e?.message || e); process.exit(1); });
