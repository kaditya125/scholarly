/**
 * Part 2 — ingest the real official SSC CGL 2026 syllabus through the existing orchestrator.
 *
 * Source was resolved from SSC's own public content API (general-website/portal/records), not
 * guessed: the notice record carries fileName, type and size, and the downloaded bytes match that
 * size exactly. The previously configured URL soft-404s to the Angular shell, which is how the
 * legacy record acquired a hash of empty input.
 *
 * publish=false deliberately. Ingestion and publication stay separable so publication can be a
 * decision made against verified retrieval, not a side effect of a successful download.
 */
import 'dotenv/config';
import { examMasterService } from '../../src/services/exam/examMaster.service';
import { syllabusIngestionOrchestrator } from '../../src/services/exam/syllabusIngestionOrchestrator';

const SOURCE_DOCUMENT_URL =
  'https://ssc.gov.in/api/attachment/uploads/masterData/NoticeBoards/Notice_of_adv_cgl_2026.pdf';
/** The official notice-board page the document was published on. */
const SOURCE_PAGE_URL = 'https://ssc.gov.in/home/notice-board';

(async () => {
  const exam = await examMasterService.getExam('SSC_CGL');
  if (!exam) throw new Error('SSC_CGL exam master record not found');

  console.log('ingesting:');
  console.log(`  exam    : ${exam.examId} (cycle ${exam.currentCycle})`);
  console.log(`  document: ${SOURCE_DOCUMENT_URL}`);
  console.log('  publish : false (publication is a separate, verified step)\n');

  const started = Date.now();
  const result = await syllabusIngestionOrchestrator.ingestSyllabusVersion({
    exam,
    cycleId: '2026',
    version: '2026-v1',
    sourceUrl: SOURCE_PAGE_URL,
    sourceDocumentUrl: SOURCE_DOCUMENT_URL,
    sourceDocumentTitle: 'Notice of Combined Graduate Level Examination, 2026',
    sourceDocumentType: 'NOTIFICATION',
    performedBy: 'phase4a-ingestion',
    publish: false,
  });

  console.log(`\ncompleted in ${Math.round((Date.now() - started) / 1000)}s\n`);
  console.log('=== INGEST RESULT ===');
  console.log(JSON.stringify(result, null, 2));
  process.exit(result.outcome === 'SUCCESS' ? 0 : 4);
})().catch((e) => { console.error('INGEST FAILED:', e?.stack || e?.message || e); process.exit(1); });
