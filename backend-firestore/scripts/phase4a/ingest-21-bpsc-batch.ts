/**
 * Ingest the BPSC syllabi, one at a time.
 *
 * Sequential on purpose. Each document is an LLM extraction over several chunks, and a parallel
 * burst across nine exams is the reliable way to get throttled halfway through and leave the set
 * half-ingested. Slow is fine here; this is an offline job.
 *
 * One exam failing does not stop the rest — each is independent, and a source that is malformed
 * or unreachable today should not block the eight that are fine. Failures are reported at the end
 * rather than swallowed.
 *
 * Simultala (item 33) is excluded: 24 subject-wise papers for one residential-school recruitment.
 *
 *   npx tsx scripts/phase4a/ingest-21-bpsc-batch.ts
 */
import 'dotenv/config';
import { examMasterService } from '../../src/services/exam/examMaster.service';
import { syllabusIngestionOrchestrator } from '../../src/services/exam/syllabusIngestionOrchestrator';
import { BPSC_SOURCES, BPSC_SYLLABUS_PAGE } from './bpsc-sources';

/** Registry id for each source, keyed by the Commission's own dropdown item id. */
const EXAM_BY_ITEM: Record<string, string> = {
  '4':  'BPSC_JUDICIAL',
  '27': 'BPSC_LDC',
  '32': 'BPSC_ACF',
  '5':  'BPSC_ASST_PROF',
  '8':  'BPSC_DPRO',
  '6':  'BPSC_CDPO_HS',
  '1':  'BPSC_DSP_WT',
  '2':  'BPSC_DSP_WO',
  '7':  'BPSC_OSH',
};

(async () => {
  const results: Array<{ exam: string; outcome: string; nodes?: number; reason?: string }> = [];

  for (const src of BPSC_SOURCES) {
    const examId = EXAM_BY_ITEM[src.itemId];
    if (!examId) { console.log(`skip  ${src.exam} (no registry mapping — CCE is ingested separately)`); continue; }

    const exam = await examMasterService.getExam(examId);
    if (!exam) { results.push({ exam: examId, outcome: 'NO_EXAM_RECORD' }); continue; }

    console.log(`\n=== ${examId} — ${src.exam} ===`);
    try {
      const r = await syllabusIngestionOrchestrator.ingestSyllabusVersion({
        exam, cycleId: '2026', version: '2026-v1',
        sourceUrl: BPSC_SYLLABUS_PAGE,
        sourceDocumentUrl: src.url,
        sourceDocumentTitle: src.title,
        sourceDocumentType: 'SYLLABUS',
        performedBy: 'phase4a-ingestion',
        publish: false,
      });
      console.log(`  ${r.outcome}  status=${r.status ?? '-'}  nodes=${r.nodeCount ?? '-'}  ${r.reason ?? ''}`);
      if (r.errors?.length) console.log(`  errors: ${r.errors[0].slice(0, 160)}`);
      results.push({ exam: examId, outcome: r.outcome, nodes: r.nodeCount, reason: r.reason });
    } catch (e: any) {
      console.log(`  THREW: ${String(e?.message).slice(0, 140)}`);
      results.push({ exam: examId, outcome: 'THREW', reason: String(e?.message).slice(0, 80) });
    }
  }

  console.log('\n=== BATCH SUMMARY ===');
  for (const r of results) {
    console.log(`  ${r.exam.padEnd(16)} ${r.outcome.padEnd(18)} nodes=${r.nodes ?? '-'}  ${r.reason ?? ''}`);
  }
  const ok = results.filter((r) => r.outcome === 'SUCCESS').length;
  console.log(`\nsucceeded ${ok}/${results.length}`);
  process.exit(0);
})().catch((e) => { console.error('BATCH FAILED:', e?.message || e); process.exit(1); });
