/**
 * Retrieval verification for newly published exams.
 *
 * Checks the things publication can get wrong independently: vectors present under the right exam
 * filter, vectors OWNED by the exam they claim, the voice tool returning grounded text, and —
 * just as important — unrelated exams NOT leaking into an exam-filtered answer.
 *
 *   npx tsx scripts/phase4a/verify-30-cse-cce.ts
 */
import 'dotenv/config';
import { executeVoiceTool } from '../../src/services/voice/voiceTools';
import { countVectorsByExam, sampleVectorMetadata, requireNoIndexer } from './_embedding-guard';

const CTX = { userId: 'synthetic-verification-uid' };

const ASKS: Array<{ examId: string; q: string }> = [
  { examId: 'UPSC_CSE', q: 'What is in the General Studies Paper I syllabus?' },
  { examId: 'UPSC_CSE', q: 'What does the Sociology optional cover?' },
  { examId: 'IBPS_PO', q: 'What is the exam pattern for the preliminary examination?' },
];

(async () => {
  // Counting costs no embedding quota — see _embedding-guard.
  console.log('=== vectors present and correctly owned ===');
  for (const examId of ['UPSC_CSE', 'IBPS_PO', 'SSC_CGL']) {
    const n = await countVectorsByExam(examId);
    const mds = await sampleVectorMetadata(examId, 3);
    const owners = [...new Set(mds.map((m) => m?.examId))];
    const ok = !mds.length || (owners.length === 1 && owners[0] === examId);
    console.log(`  ${examId.padEnd(10)} vectors=${String(n).padStart(4)}  owner=${JSON.stringify(owners)} ${ok ? 'OK' : 'MISMATCH'}`);
    if (mds[0]) console.log(`     sample: ${String(mds[0].heading || mds[0].text || '').slice(0, 96)}`);
  }

  /*
   * Everything below performs real semantic retrieval, so it must yield to a live indexer.
   * Refused rather than throttled: a half-answered verification is worse than none.
   */
  requireNoIndexer('voice-tool retrieval verification');

  console.log('\n=== voice tool answers ===');
  for (const { examId, q } of ASKS) {
    const r: any = await executeVoiceTool('searchSyllabus', { examId, query: q } as any, CTX);
    console.log(`\n  [${examId}] ${q}`);
    console.log(`     found=${r?.found} syllabusAvailable=${r?.syllabusAvailable ?? '-'}`);
    const body = JSON.stringify(r).replace(/\s+/g, ' ');
    console.log(`     ${body.slice(0, 300)}`);

    // Exam-specific filtering: nothing from another exam may appear in this answer.
    const foreign = ['SSC_CGL', 'NEET_UG', 'JEE_MAIN', 'BPSC_LDC'].filter((x) => x !== examId && body.includes(x));
    console.log(`     foreign examIds in payload: ${foreign.length ? foreign.join(', ') + '  <-- LEAK' : 'none'}`);
  }
  process.exit(0);
})().catch((e) => { console.error('FAILED:', e?.message || e); process.exit(1); });
