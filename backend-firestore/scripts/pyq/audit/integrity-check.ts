/**
 * Production-safe PYQ integrity check. READ-ONLY; exits non-zero when an invariant is violated.
 *
 * Safe to run on a schedule against production: it reads Firestore and Qdrant, embeds nothing,
 * and writes nothing. Intended as the gate that stops "the API returns 200" being mistaken for
 * "the knowledge chain is intact".
 *
 * Each check states the link of the chain it protects:
 *
 *     SOURCE -> PAPER -> CANONICAL PAPER -> QUESTION -> PROVENANCE -> FIRESTORE -> QDRANT
 *
 * `--json` prints machine-readable output. `--allow=name1,name2` tolerates named checks that are
 * expected to fail for documented reasons (an embedding backlog, say) without hiding them — they
 * are still reported, just not fatal.
 */
import { firebaseApp } from '../../../src/config/firebase';
import { QdrantClient } from '@qdrant/js-client-rest';
import { toQdrantId } from '../../../src/services/rag/qdrantFilter';
import { QDRANT_COLLECTION } from '../../../src/services/rag/qdrant.service';
import { env } from '../../../src/config/env';

const JSON_OUT = process.argv.includes('--json');
const ALLOW = new Set(
  (process.argv.find((a) => a.startsWith('--allow='))?.split('=')[1] ?? '').split(',').filter(Boolean),
);

const derive = (qid: string) => toQdrantId(env.PINECONE_NAMESPACE, `vec_${qid.replace(/[^a-zA-Z0-9_-]/g, '_')}`);
const ACCEPTED = new Set([
  'RIGHTS_APPROVED', 'READY_FOR_INDEX', 'VERIFIED', 'ACTIVE', 'EXTRACTED', 'VERIFICATION_PENDING', 'INDEXED',
]);

interface Check { name: string; link: string; count: number; limit: number; detail: string; sample: string[] }

async function main() {
  const db = firebaseApp.firestore();
  const client = new QdrantClient({ url: env.QDRANT_URL, apiKey: process.env.QDRANT_API_KEY || undefined, checkCompatibility: false });

  const questions: any[] = [];
  let last: any = null;
  while (true) {
    let q: FirebaseFirestore.Query = db.collection('pyq_questions').orderBy('__name__').limit(2000);
    if (last) q = q.startAfter(last);
    const s = await q.get();
    if (s.empty) break;
    for (const d of s.docs) questions.push(d.data());
    last = s.docs[s.docs.length - 1];
    if (s.size < 2000) break;
  }
  const registry = (await db.collection('pyq_source_registry').get()).docs.map((d) => d.data() as any);

  const points = new Map<string, any>();
  let offset: any = undefined;
  while (true) {
    const res: any = await client.scroll(QDRANT_COLLECTION, {
      limit: 2000, offset,
      with_payload: { include: ['content_type', 'questionId', 'provenanceClass', 'isAuthenticPyq', 'canonicalPaperId', 'examId'] } as any,
      with_vector: false,
    });
    for (const p of res.points ?? []) if (p.payload?.content_type === 'pyq') points.set(String(p.id), p.payload);
    offset = res.next_page_offset;
    if (!offset) break;
  }

  const live = new Set(questions.map((q) => derive(q.questionId)));
  const accepted = questions.filter((q) => ACCEPTED.has(String(q.ingestionState)));
  const checks: Check[] = [];
  const add = (name: string, link: string, bad: any[], limit = 0, detail = '', idOf: (x: any) => string = (x) => x.questionId) =>
    checks.push({ name, link, count: bad.length, limit, detail, sample: bad.slice(0, 5).map(idOf) });

  // QUESTION -> QDRANT
  add('accepted_without_vector', 'QUESTION -> QDRANT',
    accepted.filter((q) => !points.has(derive(q.questionId))), 0,
    'Accepted questions with no vector are invisible to retrieval.');

  // QDRANT -> QUESTION
  const orphans = [...points.keys()].filter((id) => !live.has(id));
  add('orphan_vectors', 'QDRANT -> QUESTION', orphans, 0,
    'Vectors with no live question can be retrieved and cited but cannot be traced back.',
    (id) => String(id));

  // flag integrity — the failure mode that hid 334 questions from the indexer permanently
  add('flag_claims_missing_vector', 'FIRESTORE -> QDRANT',
    questions.filter((q) => q.vectorIndexed === true && !points.has(derive(q.questionId))), 0,
    'vectorIndexed=true with no vector: the indexer will skip these forever.');
  add('flag_denies_present_vector', 'FIRESTORE -> QDRANT',
    questions.filter((q) => q.vectorIndexed !== true && points.has(derive(q.questionId))), 0,
    'A vector exists but the flag denies it: the question will be embedded and paid for twice.');

  // QUESTION -> PROVENANCE
  add('missing_provenance_class', 'QUESTION -> PROVENANCE',
    questions.filter((q) => !q.provenanceClass), 0,
    'Without a provenance class, ranking cannot tell an official paper from a practice drill.');
  add('false_official_labels', 'QUESTION -> PROVENANCE',
    questions.filter((q) =>
      ['PRACTICE_MOCK', 'GENERATED', 'SYNTHETIC'].includes(String(q.provenanceClass)) &&
      (q.verificationStatus === 'OFFICIAL_CONFIRMED' || q.rightsStatus === 'OFFICIAL_SOURCE_REVIEWED')), 0,
    'Practice or generated material asserting official provenance.');
  add('provenance_gaps', 'QUESTION -> PROVENANCE',
    questions.filter((q) => !q.sourceId || !q.examId || q.year == null ||
      !Array.isArray(q.provenanceRecords) || q.provenanceRecords.length === 0), 0,
    'Questions that cannot state where they came from.');

  // QUESTION -> CANONICAL PAPER
  add('missing_paper_identity', 'QUESTION -> CANONICAL PAPER',
    questions.filter((q) => !q.paperIdentityStatus), 0,
    'Every question must carry a paper identity status, even if that status is UNRESOLVED.');
  add('unresolved_paper_identity', 'QUESTION -> CANONICAL PAPER',
    questions.filter((q) => q.paperIdentityStatus === 'UNRESOLVED'), 0,
    'No registry paper is consistent with these questions.');
  add('ambiguous_paper_identity', 'QUESTION -> CANONICAL PAPER',
    questions.filter((q) => q.paperIdentityStatus === 'AMBIGUOUS'), 0,
    'Several registry papers are equally consistent; identity is withheld rather than guessed.');

  // ranking safety — the invariant that a non-PYQ never wears the authentic boost
  add('authentic_boost_on_non_pyq', 'QDRANT -> RETRIEVAL',
    [...points.entries()].filter(([, p]) => p.isAuthenticPyq === true && p.provenanceClass !== 'VERIFIED_OFFICIAL_PYQ'),
    0, 'A vector marked authentic whose provenance class does not support it.',
    ([id]: any) => String(id));
  add('vectors_without_provenance_class', 'QDRANT -> RETRIEVAL',
    [...points.entries()].filter(([id, p]) => live.has(id) && !p.provenanceClass), 0,
    'Matched vectors must carry a provenance class or ranking falls back to a guess.',
    ([id]: any) => String(id));

  // SOURCE -> PAPER
  const withQuestions = new Set(questions.map((q) => `${q.examId}|${q.year}`));
  add('papers_with_source_but_no_questions', 'SOURCE -> PAPER',
    registry.filter((s) => s.sourceUrl && !withQuestions.has(`${s.examId}|${s.year}`)), 0,
    'Authoritative source exists but nothing has been extracted from it.',
    (s) => String(s.sourceId));

  // ── report ─────────────────────────────────────────────────────────────────────────────────
  const failing = checks.filter((c) => c.count > c.limit && !ALLOW.has(c.name));
  const waived = checks.filter((c) => c.count > c.limit && ALLOW.has(c.name));

  if (JSON_OUT) {
    console.log(JSON.stringify({
      generatedAt: new Date().toISOString(),
      totals: { questions: questions.length, accepted: accepted.length, pyqVectors: points.size, registryPapers: registry.length },
      checks, failing: failing.map((c) => c.name), waived: waived.map((c) => c.name),
      verdict: failing.length === 0 ? 'PASS' : 'FAIL',
    }, null, 2));
  } else {
    console.log('=== PYQ INTEGRITY CHECK ===');
    console.log(`questions ${questions.length}  accepted ${accepted.length}  pyq vectors ${points.size}  registry ${registry.length}\n`);
    const w = Math.max(...checks.map((c) => c.name.length));
    for (const c of checks) {
      const bad = c.count > c.limit;
      const mark = !bad ? 'PASS' : ALLOW.has(c.name) ? 'WAIVED' : 'FAIL';
      console.log(`  [${mark.padEnd(6)}] ${c.name.padEnd(w)} ${String(c.count).padStart(6)}   ${c.link}`);
      if (bad) console.log(`             ${c.detail}${c.sample.length ? `\n             e.g. ${c.sample.slice(0, 3).join(', ')}` : ''}`);
    }
    console.log(`\nVERDICT: ${failing.length === 0 ? 'PASS' : `FAIL (${failing.length} check${failing.length === 1 ? '' : 's'})`}`);
    if (waived.length) console.log(`waived:  ${waived.map((c) => `${c.name}=${c.count}`).join(', ')}`);
  }

  process.exit(failing.length === 0 ? 0 : 1);
}

main().catch((e) => { console.error('INTEGRITY CHECK FAILED TO RUN:', e?.message || e); process.exit(2); });
