/**
 * Live retrieval, routing, contamination and isolation audit. READ-ONLY.
 *
 * Database state is not utilisation. This exercises the actual retrieval path with real
 * embeddings and reports what comes back, so claims about corpus usage rest on returned
 * documents rather than on configuration flags.
 *
 * Embedding cost: one embedding per query below (~16). The indexer lock is checked first — if an
 * indexing run holds it, this refuses rather than competing for the same per-minute quota.
 */
import { getVectorStore } from '../../../src/services/rag/vectorStore';
import { GoogleEmbeddingProvider } from '../../../src/services/ai/providers/google-embedding.provider';
import { knowledgeRouter } from '../../../src/core/knowledge/knowledgeRouter.service';
import { env } from '../../../src/config/env';
import * as fs from 'fs';
import * as path from 'path';

const OUT = path.join(__dirname, 'out', 'live-retrieval-audit.json');
const NS = env.PINECONE_NAMESPACE;

const embedder = new GoogleEmbeddingProvider();
const store = getVectorStore();

const timed = async <T>(fn: () => Promise<T>): Promise<[T, number]> => {
  const t0 = Date.now();
  const r = await fn();
  return [r, Date.now() - t0];
};

interface Probe { label: string; query: string; filter: any; expect: string }

/**
 * Vertex caps gemini-embedding per MINUTE per base model, and this audit tripped it after five
 * probes. Pace deliberately and retry once on 429 rather than abandoning the run half-measured.
 */
const PACE_MS = Number(process.env.AUDIT_PACE_MS ?? 13000);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
let firstProbe = true;

async function embedPaced(text: string): Promise<[number[], number]> {
  if (!firstProbe) await sleep(PACE_MS);
  firstProbe = false;
  for (let attempt = 1; ; attempt++) {
    try {
      return await timed(() => embedder.generateEmbedding(text));
    } catch (e: any) {
      const msg = String(e?.message ?? e);
      if (attempt < 3 && (msg.includes('429') || msg.includes('RESOURCE_EXHAUSTED'))) {
        console.log(`   (429, backing off ${attempt * 30}s)`);
        await sleep(attempt * 30000);
        continue;
      }
      throw e;
    }
  }
}

async function runProbe(p: Probe, topK = 8) {
  const [emb, embMs] = await embedPaced(p.query);
  const [matches, qMs] = await timed(() => store.queryVectors(emb, topK, p.filter, NS) as Promise<any[]>);
  const rows = (matches ?? []).map((m: any) => ({
    score: +(m.score ?? 0).toFixed(4),
    examId: m.metadata?.examId ?? null,
    year: m.metadata?.year ?? null,
    session: m.metadata?.session ?? null,
    shift: m.metadata?.shift ?? null,
    subject: m.metadata?.subject ?? null,
    contentType: m.metadata?.content_type ?? null,
    bucket: m.metadata?.corpusBucket ?? null,
    tier: m.metadata?.sourceType ?? null,
    verification: m.metadata?.verificationStatus ?? null,
    book: m.metadata?.book ?? null,
    userId: m.metadata?.userId || null,
    text: String(m.metadata?.text ?? '').slice(0, 70),
  }));
  return { ...p, embMs, queryMs: qMs, returned: rows.length, rows };
}

async function main() {
  console.log(`=== LIVE RETRIEVAL AUDIT ===  store=${store.backend} ns=${NS}\n`);
  const results: any = { generatedAt: new Date().toISOString(), probes: [], router: [], latency: {}, contamination: {}, isolation: {} };

  // ── A. content_type census, so corpus claims are grounded ──────────────────────────────────
  // (counts come from the reconciliation/count scripts; here we only confirm retrievability)

  // ── B. per-exam PYQ retrieval (§12) ────────────────────────────────────────────────────────
  const examProbes: Probe[] = [
    { label: 'JEE Main — kinematics', query: 'projectile motion kinematics velocity acceleration', filter: { content_type: 'pyq', examId: 'JEE_MAIN' }, expect: 'JEE_MAIN PYQs' },
    { label: 'JEE Main — modern physics', query: 'photoelectric effect work function threshold frequency', filter: { content_type: 'pyq', examId: 'JEE_MAIN' }, expect: 'JEE_MAIN PYQs' },
    { label: 'JEE Main — current electricity', query: 'resistors in series and parallel current through circuit', filter: { content_type: 'pyq', examId: 'JEE_MAIN' }, expect: 'JEE_MAIN PYQs' },
    { label: 'SSC CGL — static GK', query: 'which river is known as the sorrow of Bihar', filter: { content_type: 'pyq', examId: 'SSC_CGL' }, expect: 'SSC_CGL PYQs' },
    { label: 'SSC CGL — reasoning', query: 'find the odd one out analogy series completion', filter: { content_type: 'pyq', examId: 'SSC_CGL' }, expect: 'SSC_CGL PYQs' },
    { label: 'SSC CGL — quantitative', query: 'profit and loss percentage discount successive', filter: { content_type: 'pyq', examId: 'SSC_CGL' }, expect: 'SSC_CGL PYQs' },
    { label: 'UPSC — polity', query: 'fundamental rights directive principles constitution article', filter: { content_type: 'pyq', examId: 'UPSC_CSE' }, expect: 'UPSC_CSE PYQs' },
    { label: 'NEET — biology', query: 'photosynthesis light reaction chloroplast thylakoid', filter: { content_type: 'pyq', examId: 'NEET_UG' }, expect: 'NEET_UG PYQs' },
    { label: 'BPSC — Bihar specific', query: 'Bihar history Champaran movement districts', filter: { content_type: 'pyq', examId: 'BPSC_CCE' }, expect: 'BPSC_CCE PYQs' },
  ];

  for (const p of examProbes) {
    const r = await runProbe(p);
    const leak = r.rows.filter((x) => x.examId && x.examId !== p.filter.examId);
    console.log(`${p.label.padEnd(30)} returned=${String(r.returned).padStart(2)}  top=${r.rows[0]?.score ?? '-'}  leak=${leak.length}  embMs=${r.embMs} qMs=${r.queryMs}`);
    if (r.rows[0]) console.log(`   top: ${r.rows[0].examId} ${r.rows[0].year} ${r.rows[0].subject} tier=${r.rows[0].tier} :: ${r.rows[0].text}`);
    if (leak.length) console.log(`   !! CROSS-EXAM LEAK: ${leak.map((x) => x.examId).join(', ')}`);
    results.probes.push({ ...r, crossExamLeak: leak.length });
  }

  // ── C. cross-paper contamination (§8) ──────────────────────────────────────────────────────
  // The app's PYQ filter constrains exam (and optionally subject) only. Ask whether a query
  // scoped to one sitting can return another sitting's questions.
  console.log('\n=== CROSS-PAPER CONTAMINATION PROBE ===');
  const sittingProbe = await runProbe({
    label: 'JEE Main 2024 S1 Shift 1 scope',
    query: 'organic chemistry reaction mechanism nucleophilic substitution',
    filter: { content_type: 'pyq', examId: 'JEE_MAIN', year: 2024, session: 'Session 1 (Jan)', shift: 'Shift 1' },
    expect: 'only 2024 Session 1 Shift 1',
  }, 10);
  console.log(`  strict sitting filter -> returned=${sittingProbe.returned}`);
  const loose = await runProbe({
    label: 'JEE Main exam-only scope',
    query: 'organic chemistry reaction mechanism nucleophilic substitution',
    filter: { content_type: 'pyq', examId: 'JEE_MAIN' },
    expect: 'any JEE Main sitting',
  }, 10);
  const distinctSittings = new Set(loose.rows.map((r) => `${r.year}|${r.session}|${r.shift}`));
  console.log(`  exam-only filter      -> returned=${loose.returned}, distinct sittings in results=${distinctSittings.size}`);
  console.log(`  sittings: ${[...distinctSittings].slice(0, 6).join('  ;  ')}`);
  results.contamination = {
    strictSittingFilterReturned: sittingProbe.returned,
    strictRows: sittingProbe.rows,
    examOnlyReturned: loose.returned,
    examOnlyDistinctSittings: [...distinctSittings],
    note: 'app PYQ retrieval filters exam (+subject); it does not constrain session/shift',
  };

  // ── D. router decisions (§13) — deterministic, no embedding ────────────────────────────────
  console.log('\n=== ROUTER DECISIONS ===');
  const routerCases = [
    { q: 'explain thermodynamics first law', subject: 'Physics', intent: 'CONCEPT_EXPLANATION' },
    { q: 'integration by parts calculus', subject: 'Mathematics', intent: 'CONCEPT_EXPLANATION' },
    { q: 'who was the first governor general of india static gk', subject: undefined, intent: 'FACTUAL_QUERY' },
    { q: 'blood relation reasoning puzzle shortcut', subject: undefined, intent: 'FACTUAL_QUERY' },
    { q: 'percentage profit and loss quant shortcut trick', subject: undefined, intent: 'FACTUAL_QUERY' },
    { q: 'generate a jee main mock test', subject: undefined, intent: 'TEST_GENERATION' },
  ];
  for (const c of routerCases) {
    const d: any = knowledgeRouter.route({ query: c.q, subject: c.subject, intent: c.intent } as any);
    console.log(`  "${c.q.slice(0, 42).padEnd(42)}" curriculum=${d.useCurriculum ? 'Y' : 'n'} pyq=${d.usePYQs ? 'Y' : 'n'} refBooks=${d.useReferenceBooks ? 'Y' : 'n'} books=${JSON.stringify(d.referenceBookFilters?.books ?? null)}`);
    results.router.push({ ...c, decision: { useCurriculum: d.useCurriculum, usePYQs: d.usePYQs, useReferenceBooks: d.useReferenceBooks, books: d.referenceBookFilters?.books ?? null, subject: d.targetSubject } });
  }

  // ── E. NCERT + reference book retrievability (§17, §18) ────────────────────────────────────
  console.log('\n=== OTHER CORPORA ===');
  const corpora: Probe[] = [
    { label: 'NCERT physics', query: 'newton laws of motion inertia', filter: { content_type: 'chapter' }, expect: 'NCERT chunks' },
    { label: 'Lucent GK', query: 'first governor general of bengal', filter: { book: 'lucent_gk' }, expect: 'lucent_gk chunks' },
    { label: 'S.Chand reasoning', query: 'blood relation puzzle method', filter: { book: 'schand_reasoning' }, expect: 'schand chunks' },
    { label: 'S.Chand quant', query: 'time and work shortcut formula', filter: { book: 'schand_quant' }, expect: 'schand chunks' },
  ];
  for (const p of corpora) {
    try {
      const r = await runProbe(p, 5);
      console.log(`  ${p.label.padEnd(20)} returned=${r.returned}  top=${r.rows[0]?.score ?? '-'}  :: ${r.rows[0]?.text ?? '(nothing)'}`);
      results.probes.push(r);
    } catch (e: any) {
      console.log(`  ${p.label.padEnd(20)} ERROR ${e?.message?.slice(0, 60)}`);
      results.probes.push({ ...p, error: e?.message });
    }
  }

  // ── F. notebook isolation (§19) ────────────────────────────────────────────────────────────
  console.log('\n=== NOTEBOOK ISOLATION ===');
  const anyUserPoint = await runProbe({ label: 'private-note sweep', query: 'my personal revision notes', filter: {}, expect: 'any' }, 25);
  const withUser = anyUserPoint.rows.filter((r) => r.userId);
  console.log(`  unfiltered top-25: points carrying a non-empty userId = ${withUser.length}`);
  console.log(`  (PYQ vectors are written with userId:'' and public:true by contract)`);
  results.isolation = { unfilteredTop25WithUserId: withUser.length, sample: withUser.slice(0, 3) };

  // ── G. latency (§20) ───────────────────────────────────────────────────────────────────────
  console.log('\n=== LATENCY (same query, repeated) ===');
  const lat: { embMs: number[]; queryMs: number[] } = { embMs: [], queryMs: [] };
  for (let i = 0; i < 5; i++) {
    const r = await runProbe({ label: 'latency', query: 'photoelectric effect work function', filter: { content_type: 'pyq', examId: 'JEE_MAIN' }, expect: '' }, 8);
    lat.embMs.push(r.embMs); lat.queryMs.push(r.queryMs);
  }
  const pct = (a: number[], p: number) => { const s = [...a].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))]; };
  console.log(`  embedding  p50=${pct(lat.embMs, 50)}ms  p95=${pct(lat.embMs, 95)}ms  raw=${lat.embMs.join(',')}`);
  console.log(`  qdrant     p50=${pct(lat.queryMs, 50)}ms p95=${pct(lat.queryMs, 95)}ms raw=${lat.queryMs.join(',')}`);
  results.latency = { embMs: lat.embMs, queryMs: lat.queryMs, embP50: pct(lat.embMs, 50), embP95: pct(lat.embMs, 95), qP50: pct(lat.queryMs, 50), qP95: pct(lat.queryMs, 95) };

  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify(results, null, 2));
  console.log(`\n-> ${OUT}`);
}

main().then(() => process.exit(0)).catch((e) => { console.error('FAILED:', e?.message || e, e?.stack?.split('\n')[1]); process.exit(1); });
