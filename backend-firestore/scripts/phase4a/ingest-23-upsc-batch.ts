/**
 * Ingest UPSC's syllabi, one exam at a time, from each examination's own notification.
 *
 * These are the slowest documents in the set. A UPSC notification is a hundred-plus pages of
 * eligibility rules, fee tables and centre lists with the syllabus in its appendices, so most of
 * each extraction is the model correctly deciding that a page contains no syllabus at all. Expect
 * roughly twenty minutes per exam, and longer where adaptive splitting kicks in.
 *
 * Sequential, and one failure never stops the rest — a malformed or unavailable notification for
 * one examination should not cost the other ten.
 *
 *   npx tsx scripts/phase4a/ingest-23-upsc-batch.ts [examId ...]
 */
import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { examMasterService } from '../../src/services/exam/examMaster.service';
import { syllabusIngestionOrchestrator } from '../../src/services/exam/syllabusIngestionOrchestrator';

interface PlanRow { examId: string; name: string; source: string; url: string; label?: string }

(async () => {
  const plan: PlanRow[] = JSON.parse(fs.readFileSync(path.join(__dirname, 'upsc-sources.json'), 'utf8'));
  const only = process.argv.slice(2);
  const rows = only.length ? plan.filter((r) => only.includes(r.examId)) : plan;

  const results: Array<{ exam: string; outcome: string; nodes?: number; reason?: string }> = [];

  for (const row of rows) {
    const exam = await examMasterService.getExam(row.examId);
    if (!exam) { results.push({ exam: row.examId, outcome: 'NO_EXAM_RECORD' }); continue; }

    console.log(`\n=== ${row.examId} — ${row.name} ===`);
    console.log(`    ${row.url}`);
    const started = Date.now();
    try {
      const r = await syllabusIngestionOrchestrator.ingestSyllabusVersion({
        exam, cycleId: '2026', version: '2026-v1',
        sourceUrl: 'https://www.upsc.gov.in/examinations/active-exams',
        sourceDocumentUrl: row.url,
        sourceDocumentTitle: row.source,
        sourceDocumentType: 'NOTIFICATION',
        performedBy: 'phase4a-ingestion',
        publish: false,
      });
      console.log(`    ${r.outcome}  status=${r.status ?? '-'}  nodes=${r.nodeCount ?? '-'}  ${r.reason ?? ''}  (${Math.round((Date.now()-started)/1000)}s)`);
      if (r.errors?.length) console.log(`    errors: ${r.errors[0].slice(0, 150)}`);
      results.push({ exam: row.examId, outcome: r.outcome, nodes: r.nodeCount, reason: r.reason });
    } catch (e: any) {
      console.log(`    THREW: ${String(e?.message).slice(0, 140)}`);
      results.push({ exam: row.examId, outcome: 'THREW', reason: String(e?.message).slice(0, 70) });
    }
  }

  console.log('\n=== UPSC BATCH SUMMARY ===');
  for (const r of results) console.log(`  ${r.exam.padEnd(14)} ${r.outcome.padEnd(18)} nodes=${r.nodes ?? '-'}  ${r.reason ?? ''}`);
  console.log(`\nsucceeded ${results.filter((r) => r.outcome === 'SUCCESS').length}/${results.length}`);
  process.exit(0);
})().catch((e) => { console.error('BATCH FAILED:', e?.message || e); process.exit(1); });
