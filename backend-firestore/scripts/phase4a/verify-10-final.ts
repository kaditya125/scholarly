/**
 * Parts 4, 6, 7 — post-change verification of the retrieval, cache and voice-tool paths.
 */
import 'dotenv/config';
import { retrievalService } from '../../src/services/rag/retrieval.service';
import { executeVoiceTool } from '../../src/services/voice/voiceTools';

const now = () => Date.now();

(async () => {
  // ── PART 4: syllabus retrieval, all three casings ─────────────────────────────────────
  console.log('=== PART 4: retrieveOfficialSyllabusContext ===\n');
  for (const examId of ['ssc-cgl', 'SSC_CGL', 'Ssc Cgl']) {
    const t = now();
    const r = await retrievalService.retrieveOfficialSyllabusContext(examId, 'quantitative aptitude', 4);
    console.log(`  ${JSON.stringify(examId).padEnd(11)} -> results=${r.length}  ${now() - t}ms`);
  }

  // ── PART 6: cache key must separate exam, query and topK ──────────────────────────────
  console.log('\n=== PART 6: cache behaviour ===\n');
  const Q = 'quantitative aptitude syllabus';
  const t1 = now(); await retrievalService.retrieveOfficialSyllabusContext('SSC_CGL', Q, 4); const m1 = now() - t1;
  const t2 = now(); await retrievalService.retrieveOfficialSyllabusContext('SSC_CGL', Q, 4); const m2 = now() - t2;
  console.log(`  SSC_CGL + Q  (1st) ${String(m1).padStart(5)}ms   <- expect miss`);
  console.log(`  SSC_CGL + Q  (2nd) ${String(m2).padStart(5)}ms   <- expect hit (much faster)`);
  console.log(`  cache hit observed: ${m2 < Math.max(50, m1 / 3)}`);

  const t3 = now(); await retrievalService.retrieveOfficialSyllabusContext('UPSC_CSE', Q, 4); const m3 = now() - t3;
  console.log(`  UPSC_CSE + Q       ${String(m3).padStart(5)}ms   <- different exam, must not reuse SSC entry`);
  console.log(`  distinct entry    : ${m3 > Math.max(50, m2 * 2)}`);

  // Public-knowledge cache, which now has real data behind it.
  const t4 = now(); await retrievalService.retrievePublicKnowledge('newton laws of motion', 4); const m4 = now() - t4;
  const t5 = now(); await retrievalService.retrievePublicKnowledge('newton laws of motion', 4); const m5 = now() - t5;
  const t6 = now(); await retrievalService.retrievePublicKnowledge('photosynthesis in plants', 4); const m6 = now() - t6;
  console.log(`\n  publicKnowledge  A (1st) ${String(m4).padStart(5)}ms`);
  console.log(`  publicKnowledge  A (2nd) ${String(m5).padStart(5)}ms   hit=${m5 < Math.max(50, m4 / 3)}`);
  console.log(`  publicKnowledge  B       ${String(m6).padStart(5)}ms   distinct=${m6 > Math.max(50, m5 * 2)}`);

  // ── PART 7: voice tool must not claim a topic is excluded when no syllabus exists ──────
  console.log('\n=== PART 7: searchSyllabus states ===\n');
  const r: any = await executeVoiceTool('searchSyllabus', { examId: 'SSC_CGL', query: 'quantitative aptitude' }, { userId: 'synthetic-verification-uid' });
  console.log(`  found=${r.found}  syllabusAvailable=${r.syllabusAvailable}`);
  console.log(`  reason: ${r.reason}`);
  console.log(`  State 3 enforced (does NOT claim topic excluded): ${r.syllabusAvailable === false && !/not (found )?in/i.test(String(r.reason))}`);

  const k: any = await executeVoiceTool('searchKnowledge', { query: 'newton laws of motion' }, { userId: 'synthetic-verification-uid' });
  console.log(`\n  searchKnowledge found=${k.found} snippets=${k.snippets?.length ?? 0}`);
  process.exit(0);
})().catch(e => { console.error('FAILED:', e?.message || e); process.exit(1); });
