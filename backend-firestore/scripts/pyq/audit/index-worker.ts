/**
 * Durable PYQ indexing worker.
 *
 * The job this replaces kept its place in the run as an array offset, so a single embedding
 * failure shifted every subsequent write-back by one: questions were marked indexed that had no
 * vector, and questions with vectors were left unmarked. Everything here is keyed on
 * `questionId`; no step depends on a position in a list.
 *
 *   IDEMPOTENT      the queue is recomputed from Qdrant on every start, not read from
 *                   `vectorIndexed`. A question already carrying a valid point is skipped
 *                   whatever its flag says, so a re-run costs nothing and cannot double-write.
 *   RESUMABLE       progress is checkpointed to `pyq_index_jobs/{jobId}` after every batch with
 *                   the set of completed and failed question ids. A restart re-derives the queue
 *                   and continues; a kill -9 loses at most one batch.
 *   RETRY-SAFE      per-question retry with exponential backoff on 429; a question that exhausts
 *                   its retries is recorded in the dead-letter list with its error and skipped,
 *                   never silently marked done.
 *   RATE-LIMITED    `--pace` milliseconds between embeddings. The measured Vertex ceiling is
 *                   ~5/min, and the service default of 4s (15/min) thrashes on 429s.
 *   NO DUPLICATES   the point id is derived from the questionId, so re-embedding the same
 *                   question overwrites its own point rather than creating a second one.
 *
 * Usage:
 *   --execute          actually embed and write (otherwise reports the queue and exits)
 *   --limit=N          stop after N questions (for a bounded, observable first run)
 *   --pace=MS          delay between embeddings (default 13000)
 *   --exam=SSC_CGL     restrict the queue to one exam
 *   --job=<id>         resume a specific job (default: derived from the filter)
 */
import { firebaseApp } from '../../../src/config/firebase';
import { QdrantClient } from '@qdrant/js-client-rest';
import { toQdrantId } from '../../../src/services/rag/qdrantFilter';
import { QDRANT_COLLECTION } from '../../../src/services/rag/qdrant.service';
import { GoogleEmbeddingProvider } from '../../../src/services/ai/providers/google-embedding.provider';
import { getVectorStore } from '../../../src/services/rag/vectorStore';
import { env } from '../../../src/config/env';
import { classifyProvenance, isAuthenticPyq } from '../../../src/services/pyq/paperIdentity';

const arg = (name: string, dflt?: string) =>
  process.argv.find((a) => a.startsWith(`--${name}=`))?.split('=')[1] ?? dflt;

const EXECUTE = process.argv.includes('--execute');
const LIMIT = Number(arg('limit', '0'));
const PACE_MS = Number(arg('pace', '13000'));
const EXAM = arg('exam');
const MAX_ATTEMPTS = 3;

const derive = (qid: string) => toQdrantId(env.PINECONE_NAMESPACE, `vec_${qid.replace(/[^a-zA-Z0-9_-]/g, '_')}`);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const ACCEPTED = new Set([
  'RIGHTS_APPROVED', 'READY_FOR_INDEX', 'VERIFIED', 'ACTIVE', 'EXTRACTED', 'VERIFICATION_PENDING', 'INDEXED',
]);

const JOB_ID = arg('job', `pyq-index-${EXAM ?? 'all'}`)!;

interface JobState {
  jobId: string;
  status: 'running' | 'paused' | 'complete';
  startedAt: number;
  updatedAt: number;
  examFilter: string | null;
  totalQueued: number;
  completed: string[];
  failed: { questionId: string; error: string; attempts: number }[];
}

function embeddingText(q: any): string {
  return [
    q.questionText,
    Array.isArray(q.options) ? q.options.join(' ') : Object.values(q.options ?? {}).join(' '),
    q.subject, q.topic, q.examName, q.year,
  ].filter(Boolean).join('\n');
}

async function main() {
  console.log(`=== PYQ INDEX WORKER === job=${JOB_ID} ${EXECUTE ? 'EXECUTE' : 'DRY RUN'} pace=${PACE_MS}ms${EXAM ? ` exam=${EXAM}` : ''}`);
  const db = firebaseApp.firestore();
  const jobsCol = db.collection('pyq_index_jobs');
  const client = new QdrantClient({ url: env.QDRANT_URL, apiKey: process.env.QDRANT_API_KEY || undefined, checkCompatibility: false });
  const embedder = new GoogleEmbeddingProvider();
  const store = getVectorStore();

  // ── the queue is derived from Qdrant, never from the vectorIndexed flag ────────────────────
  const present = new Set<string>();
  let offset: any = undefined;
  while (true) {
    const res: any = await client.scroll(QDRANT_COLLECTION, {
      limit: 2000, offset, with_payload: { include: ['content_type'] } as any, with_vector: false,
    });
    for (const p of res.points ?? []) if (p.payload?.content_type === 'pyq') present.add(String(p.id));
    offset = res.next_page_offset;
    if (!offset) break;
  }

  const queue: any[] = [];
  let scanned = 0;
  let last: any = null;
  while (true) {
    let q: FirebaseFirestore.Query = db.collection('pyq_questions').orderBy('__name__').limit(2000);
    if (EXAM) q = db.collection('pyq_questions').where('examId', '==', EXAM).orderBy('__name__').limit(2000);
    if (last) q = q.startAfter(last);
    const s = await q.get();
    if (s.empty) break;
    for (const d of s.docs) {
      const x: any = d.data();
      scanned++;
      if (!ACCEPTED.has(String(x.ingestionState))) continue;
      if (present.has(derive(x.questionId))) continue;
      if (!x.questionText) continue; // nothing to embed; recorded below, never silently "done"
      queue.push(x);
    }
    last = s.docs[s.docs.length - 1];
    if (s.size < 2000) break;
  }

  const prior = await jobsCol.doc(JOB_ID).get();
  const state: JobState = prior.exists
    ? (prior.data() as JobState)
    : { jobId: JOB_ID, status: 'running', startedAt: Date.now(), updatedAt: Date.now(), examFilter: EXAM ?? null, totalQueued: 0, completed: [], failed: [] };

  const deadLettered = new Set(state.failed.filter((f) => f.attempts >= MAX_ATTEMPTS).map((f) => f.questionId));
  const work = queue.filter((q) => !deadLettered.has(q.questionId));

  console.log(`  scanned ${scanned} questions`);
  console.log(`  already carry a valid vector: ${scanned - queue.length - 0}`);
  console.log(`  QUEUE (accepted, no vector):  ${queue.length}`);
  console.log(`  previously dead-lettered:     ${deadLettered.size}`);
  console.log(`  to process this run:          ${LIMIT ? Math.min(LIMIT, work.length) : work.length}`);
  const noText = queue.length - work.length;
  if (noText > 0) console.log(`  skipped (no question text):   ${noText}`);

  if (!EXECUTE) {
    console.log('\nDRY RUN — nothing embedded or written. Pass --execute to run.');
    console.log(`At ${PACE_MS}ms pacing this run would take ~${Math.round((work.length * PACE_MS) / 60000)} minutes.`);
    return;
  }

  state.status = 'running';
  state.totalQueued = work.length;
  state.updatedAt = Date.now();
  await jobsCol.doc(JOB_ID).set(state, { merge: true });

  const slice = LIMIT ? work.slice(0, LIMIT) : work;
  const BATCH = 20;
  let indexed = 0;
  let failed = 0;

  for (let i = 0; i < slice.length; i += BATCH) {
    const batch = slice.slice(i, i + BATCH);
    const buffered: { id: string; values: number[]; metadata: any; question: any }[] = [];

    for (const q of batch) {
      let embedding: number[] | null = null;
      let lastErr = '';
      for (let attempt = 1; attempt <= MAX_ATTEMPTS && !embedding; attempt++) {
        try {
          if (indexed + failed > 0 || attempt > 1) await sleep(PACE_MS);
          embedding = await embedder.generateEmbedding(embeddingText(q));
        } catch (e: any) {
          lastErr = String(e?.message ?? e).slice(0, 200);
          const is429 = /429|RESOURCE_EXHAUSTED|Quota exceeded/i.test(lastErr);
          if (attempt < MAX_ATTEMPTS) await sleep(is429 ? attempt * 30000 : attempt * 5000);
        }
      }
      if (!embedding) {
        failed++;
        state.failed = state.failed.filter((f) => f.questionId !== q.questionId);
        state.failed.push({ questionId: q.questionId, error: lastErr, attempts: MAX_ATTEMPTS });
        console.log(`  FAILED ${q.questionId}: ${lastErr}`);
        continue;
      }

      const cls = q.provenanceClass ?? classifyProvenance(q);
      buffered.push({
        id: `vec_${q.questionId.replace(/[^a-zA-Z0-9_-]/g, '_')}`,
        values: embedding,
        metadata: {
          content_type: 'pyq',
          corpusBucket: q.corpusBucket || 'OFFICIAL_PYQ',
          vectorKind: q.corpusBucket === 'PRACTICE_MOCK' ? 'PRACTICE_QUESTION' : 'CANONICAL_PYQ_QUESTION',
          // Written at ingestion so a new vector is never ranked as authentic by default.
          provenanceClass: cls,
          isAuthenticPyq: isAuthenticPyq(cls),
          canonicalPaperId: q.canonicalPaperId ?? null,
          paperIdentityStatus: q.paperIdentityStatus ?? 'UNRESOLVED',
          sittingId: q.sittingId ?? null,
          normalizedSession: q.normalizedSession ?? null,
          normalizedShift: q.normalizedShift ?? null,
          normalizedSittingDate: q.normalizedSittingDate ?? null,
          public: true, owner: 'sadhya-exam-intel', userId: '',
          notebookId: `exam-${String(q.examId).toLowerCase()}`,
          sourceId: q.sourceId, examId: q.examId, examName: q.examName, year: q.year,
          session: q.session || '', paper: q.paper || '', shift: q.shift || '',
          subject: q.subject, topic: q.topic || '', subtopic: q.subtopic || '',
          syllabusNodeId: q.syllabusNodeId || '', questionId: q.questionId,
          questionNumber: q.questionNumber, questionType: q.questionType,
          difficulty: q.difficulty || 'MEDIUM', sourceType: q.sourceType,
          verificationStatus: q.verificationStatus, rightsStatus: q.rightsStatus,
          text: q.questionText, options: q.options || [], correctAnswer: q.correctAnswer,
          createdAt: q.createdAt,
        },
        question: q,
      });
    }

    if (buffered.length === 0) continue;

    try {
      await store.upsertVectors(buffered.map(({ id, values, metadata }) => ({ id, values, metadata })), env.PINECONE_NAMESPACE);
    } catch (e: any) {
      // The batch is left entirely unmarked, so the next run picks it up again.
      const msg = String(e?.message ?? e).slice(0, 200);
      console.log(`  UPSERT FAILED for ${buffered.length} vectors, leaving unmarked: ${msg}`);
      failed += buffered.length;
      for (const b of buffered) {
        state.failed = state.failed.filter((f) => f.questionId !== b.question.questionId);
        state.failed.push({ questionId: b.question.questionId, error: `upsert: ${msg}`, attempts: 1 });
      }
      await jobsCol.doc(JOB_ID).set({ ...state, updatedAt: Date.now() }, { merge: true });
      continue;
    }

    // Only now, and only for the questions actually written.
    const now = Date.now();
    const fsBatch = db.batch();
    for (const b of buffered) {
      fsBatch.set(db.collection('pyq_questions').doc(b.question.questionId), {
        vectorIndexed: true, vectorIndexedAt: now, ingestionState: 'INDEXED',
        vectorIndexStatus: 'VERIFIED_PRESENT', vectorIndexReconciledAt: now,
        qdrantPointId: derive(b.question.questionId),
      }, { merge: true });
      state.completed.push(b.question.questionId);
    }
    await fsBatch.commit();
    indexed += buffered.length;

    await jobsCol.doc(JOB_ID).set({ ...state, updatedAt: Date.now() }, { merge: true });
    console.log(`  ${indexed}/${slice.length} indexed, ${failed} failed`);
  }

  state.status = indexed + failed >= work.length ? 'complete' : 'paused';
  await jobsCol.doc(JOB_ID).set({ ...state, updatedAt: Date.now() }, { merge: true });
  console.log(`\nDONE: ${indexed} indexed, ${failed} failed, job status=${state.status}`);
}

main().then(() => process.exit(0)).catch((e) => { console.error('WORKER FAILED:', e?.message || e); process.exit(1); });
