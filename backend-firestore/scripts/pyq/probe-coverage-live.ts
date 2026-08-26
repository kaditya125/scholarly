/** Real coverage against the real graph. Read-only, no embeddings. */
import 'dotenv/config';
import { getSyllabusCoverage, pruneToDepth } from '../../src/services/learning/syllabusCoverage.service';

(async () => {
  for (const exam of ['SSC_CGL', 'UPSC_CSE', 'IBPS_PO']) {
    const t0 = Date.now();
    const c = await getSyllabusCoverage('probe-user-no-evidence', exam);
    const shallow = pruneToDepth(c, 2);
    const size = (o: any) => JSON.stringify(o).length;
    console.log(`${exam.padEnd(10)} addressable=${String(c.totals.addressable).padStart(4)} ` +
      `coverage=${c.coveragePercent}% roots=${c.subjects.length} ` +
      `ms=${Date.now() - t0} fullKB=${Math.round(size(c)/1024)} depth2KB=${Math.round(size(shallow)/1024)}`);
    console.log(`           totals=${JSON.stringify(c.totals)}`);
  }
  process.exit(0);
})().catch((e) => { console.error('FAILED:', e?.message || e); process.exit(1); });
