import 'dotenv/config';
import { getEligiblePyqReport } from '../../src/services/pyq/pyqEligibility.service';
(async () => {
  for (const exam of ['JEE_MAIN', 'SSC_CGL', 'IBPS_PO', 'RRB_NTPC']) {
    const r = await getEligiblePyqReport(exam);
    console.log(`${exam.padEnd(11)} total=${String(r.total).padStart(3)} eligible=${String(r.eligible).padStart(3)} excluded=${String(r.excluded).padStart(3)}  reads=${r.firestoreReads} ms=${r.tookMs}`);
    const top = Object.entries(r.byReason).sort((a,b)=>b[1]-a[1]).slice(0,4);
    if (top.length) console.log(`            reasons: ${top.map(([k,v])=>`${k}=${v}`).join('  ')}`);
  }
  process.exit(0);
})().catch(e => { console.error('FAILED:', e?.message||e); process.exit(1); });
