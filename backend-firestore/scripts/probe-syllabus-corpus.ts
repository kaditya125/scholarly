/**
 * Phase 4A §2: is there an official-syllabus corpus at all?
 *
 * Retrieval for syllabus builds filter { examId, documentType: 'OFFICIAL_SYLLABUS' }, and
 * syllabusIngestion writes exactly those two fields. So the contract lines up and zero results
 * means one of:
 *
 *   Case A  canonical syllabus rows exist in Firestore but were never pushed to Pinecone
 *   Case B  they were pushed, but under metadata that does not match the filter
 *   Case C  no official syllabus corpus exists anywhere
 *
 * This asks both stores directly rather than inferring from a failed end-to-end query.
 *
 *   npx tsx scripts/probe-syllabus-corpus.ts
 */
import 'dotenv/config';
import { GoogleEmbeddingProvider } from '../src/services/ai/providers/google-embedding.provider';
import { pineconeService } from '../src/services/rag/pinecone.service';
import { db } from '../src/config/firebase';
import { env } from '../src/config/env';

const EXAM_IDS = ['SSC_CGL', 'UPSC_CSE', 'NEET_UG', 'JEE_MAIN', 'IBPS_PO'];

async function probePinecone() {
  console.log('=== PINECONE ===\n');
  const embedder = new GoogleEmbeddingProvider();
  const vec = await embedder.generateEmbedding('syllabus topics and subjects');

  // Broadest possible syllabus question: does ANY vector carry the marker the filter needs?
  const anySyllabus = await pineconeService.queryVectors(vec as any, 10, { documentType: 'OFFICIAL_SYLLABUS' }, env.PINECONE_NAMESPACE);
  console.log(`documentType=OFFICIAL_SYLLABUS   -> ${anySyllabus?.length ?? 0} match(es)`);

  const anyCanonical = await pineconeService.queryVectors(vec as any, 10, { vectorKind: 'CANONICAL_SYLLABUS_NODE' }, env.PINECONE_NAMESPACE);
  console.log(`vectorKind=CANONICAL_SYLLABUS_NODE -> ${anyCanonical?.length ?? 0} match(es)`);

  // Per-exam, in the canonical UPPERCASE_UNDERSCORE form used by src/seed/examSeeds.ts.
  console.log('');
  for (const examId of EXAM_IDS) {
    const byExam = await pineconeService.queryVectors(vec as any, 5, { examId }, env.PINECONE_NAMESPACE);
    console.log(`  examId=${examId.padEnd(9)} -> ${byExam?.length ?? 0} match(es)`);
  }

  // Was the earlier zero-result run just the wrong case/separator? Check the form I used.
  console.log('');
  for (const examId of ['ssc-cgl', 'ssc_cgl', 'SSC-CGL']) {
    const byExam = await pineconeService.queryVectors(vec as any, 5, { examId }, env.PINECONE_NAMESPACE);
    console.log(`  examId=${examId.padEnd(9)} -> ${byExam?.length ?? 0} match(es)  (alternate casing)`);
  }

  if (anySyllabus?.length) {
    console.log('\nsample syllabus vector metadata:');
    console.log(JSON.stringify((anySyllabus[0] as any).metadata, null, 2).slice(0, 900));
  }
  return { pineconeSyllabusVectors: anySyllabus?.length ?? 0 };
}

async function probeFirestore() {
  console.log('\n=== FIRESTORE ===\n');
  // Names taken from the syllabus subsystem rather than guessed; a miss prints 0, not an error.
  // Real collection names, confirmed via db.listCollections() — an earlier version of this
  // script guessed them, missed 'exam_syllabi' entirely, and reported Case C on a false negative.
  const candidates = ['exam_syllabi', 'exam_official_sources', 'exams', 'exam_audit_logs'];
  const found: Record<string, number> = {};
  for (const name of candidates) {
    try {
      const snap = await db.collection(name).limit(3).get();
      found[name] = snap.size;
      console.log(`  ${name.padEnd(24)} ${snap.size} doc(s)${snap.size ? '' : ''}`);
      if (snap.size) {
        const d: any = snap.docs[0].data();
        const keys = Object.keys(d).slice(0, 12).join(', ');
        console.log(`      first doc id=${snap.docs[0].id}  keys: ${keys}`);
        if (d.status) console.log(`      status=${d.status}  examId=${d.examId ?? '-'}  version=${d.version ?? '-'}`);
      }
    } catch (e: any) {
      console.log(`  ${name.padEnd(24)} ERROR ${String(e?.message || e).slice(0, 60)}`);
    }
  }
  return found;
}

(async () => {
  const p = await probePinecone();
  const f = await probeFirestore();

  const firestoreHasSyllabus = (f['exam_syllabi'] ?? 0) > 0;
  console.log('\n=== VERDICT ===');
  if (p.pineconeSyllabusVectors > 0) {
    console.log('Syllabus vectors EXIST in Pinecone. Zero end-to-end results are a query/filter');
    console.log('problem, not a corpus problem. -> investigate examId value + casing.');
  } else if (firestoreHasSyllabus) {
    console.log('CASE A: canonical syllabus rows exist in Firestore but nothing is indexed in');
    console.log('Pinecone. The ingestion pipeline exists and was never run to completion.');
  } else {
    console.log('CASE C: no official syllabus corpus in either store. The pipeline is built but');
    console.log('has no source data behind it. Retrieval cannot be "fixed" — data must be ingested.');
  }
  process.exit(0);
})().catch((e) => { console.error('PROBE FAILED:', e?.message || e); process.exit(1); });
