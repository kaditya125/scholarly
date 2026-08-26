/**
 * Ingest an official syllabus for ANY exam through the existing orchestrator.
 *
 * Generalised from the SSC CGL script: the pipeline was never exam-specific, only the source URL
 * was. Discovery still has to be done per authority by hand — every commission publishes
 * differently, and the URL must come from that authority's own site, never guessed and never from
 * a third-party syllabus page.
 *
 *   npx tsx scripts/phase4a/ingest-17-exam.ts <EXAM_ID> <cycleId> <version> <documentUrl> [title] [pageUrl]
 */
import 'dotenv/config';
import { examMasterService } from '../../src/services/exam/examMaster.service';
import { syllabusIngestionOrchestrator } from '../../src/services/exam/syllabusIngestionOrchestrator';

(async () => {
  const [examId, cycleId, version, documentUrl, title, pageUrl] = process.argv.slice(2);
  if (!examId || !cycleId || !version || !documentUrl) {
    console.error('usage: ingest-17-exam.ts <EXAM_ID> <cycleId> <version> <documentUrl> [title] [pageUrl]');
    process.exit(64);
  }

  const exam = await examMasterService.getExam(examId);
  if (!exam) throw new Error(`exam master record not found: ${examId}`);

  console.log(`exam    : ${exam.examId} — ${exam.conductingAuthority}`);
  console.log(`document: ${documentUrl}`);
  console.log('publish : false (publication stays a separate, verified step)\n');

  const started = Date.now();
  const result = await syllabusIngestionOrchestrator.ingestSyllabusVersion({
    exam,
    cycleId,
    version,
    sourceUrl: pageUrl || undefined,
    sourceDocumentUrl: documentUrl,
    sourceDocumentTitle: title || undefined,
    sourceDocumentType: 'SYLLABUS',
    performedBy: 'phase4a-ingestion',
    publish: false,
  });

  console.log(`\ncompleted in ${Math.round((Date.now() - started) / 1000)}s`);
  console.log(JSON.stringify(result, null, 2));
  process.exit(result.outcome === 'SUCCESS' ? 0 : 4);
})().catch((e) => { console.error('INGEST FAILED:', e?.message || e); process.exit(1); });
