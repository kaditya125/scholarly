/**
 * P3 reconnaissance: can a dated sitting be recovered for each exam? READ-ONLY.
 *
 * JEE Main already separates cleanly — `sittingId` is populated from a date the question itself
 * carries. SSC CGL does not: its shift is a bare "1"/"2"/"3" with no date, so 991 records collapse
 * into one paper group. The question this answers is whether the date exists ANYWHERE
 * authoritative for those records — in the source id, the source url, the provenance records, the
 * document title — or whether it genuinely is not in the corpus.
 *
 * The answer decides the implementation: recoverable means a deterministic backfill; not
 * recoverable means the identity is marked UNRESOLVED and stays that way. Guessing a date would
 * attach real questions to a sitting that never held them.
 */
import { firebaseApp } from '../../../src/config/firebase';
import * as fs from 'fs';
import * as path from 'path';

const OUT = path.join(__dirname, 'out', 'p3-paper-identity.json');
const has = (v: any) => v !== undefined && v !== null && String(v).trim() !== '';

/** Any date-looking token: 2022-12-02, 02 Dec, 02/12/2022, 2022_12_02. */
const DATE_RE = /(\d{4}[-_/]\d{1,2}[-_/]\d{1,2})|(\d{1,2}[-_/\s](jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*)|((jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*[-_/\s]\d{1,2})/i;

async function main() {
  const db = firebaseApp.firestore();
  const report: any = {};

  const load = async (examId: string) => {
    const out: any[] = [];
    let last: any = null;
    while (true) {
      let q: FirebaseFirestore.Query = db.collection('pyq_questions').where('examId', '==', examId).orderBy('__name__').limit(2000);
      if (last) q = q.startAfter(last);
      const s = await q.get();
      if (s.empty) break;
      for (const d of s.docs) out.push(d.data());
      last = s.docs[s.docs.length - 1];
      if (s.size < 2000) break;
    }
    return out;
  };

  for (const exam of ['JEE_MAIN', 'SSC_CGL']) {
    const rows = await load(exam);
    console.log(`\n=== ${exam} — ${rows.length} records ===`);

    const withSitting = rows.filter((r) => has(r.sittingId));
    const withDate = rows.filter((r) => has(r.normalizedSittingDate));
    console.log(`  sittingId populated          ${withSitting.length}  (${((withSitting.length / rows.length) * 100).toFixed(1)}%)`);
    console.log(`  normalizedSittingDate        ${withDate.length}  (${((withDate.length / rows.length) * 100).toFixed(1)}%)`);

    const noSitting = rows.filter((r) => !has(r.sittingId));
    console.log(`  records WITHOUT a sitting    ${noSitting.length}`);
    if (noSitting.length === 0) { report[exam] = { total: rows.length, withSitting: withSitting.length, recoverable: 0 }; continue; }

    // Where might a date still be hiding for those records?
    const probes: Array<[string, (r: any) => string]> = [
      ['questionId', (r) => String(r.questionId ?? '')],
      ['sourceId', (r) => String(r.sourceId ?? '')],
      ['sourceUrl', (r) => String(r.sourceUrl ?? '')],
      ['paper', (r) => String(r.paper ?? '')],
      ['session', (r) => String(r.session ?? '')],
      ['shift', (r) => String(r.shift ?? '')],
      ['sourcePaperId', (r) => String(r.sourcePaperId ?? '')],
      ['provenanceRecords', (r) => JSON.stringify(r.provenanceRecords ?? '')],
    ];
    console.log(`  where a date could still be recovered from, for those ${noSitting.length}:`);
    const recoverability: Record<string, number> = {};
    for (const [name, get] of probes) {
      const n = noSitting.filter((r) => DATE_RE.test(get(r))).length;
      recoverability[name] = n;
      console.log(`    ${name.padEnd(20)} ${String(n).padStart(6)}  ${((n / noSitting.length) * 100).toFixed(1)}%`);
    }

    const anyRecoverable = noSitting.filter((r) => probes.some(([, get]) => DATE_RE.test(get(r))));
    console.log(`  recoverable from ANY authoritative field: ${anyRecoverable.length} / ${noSitting.length}`);
    if (anyRecoverable[0]) {
      const r = anyRecoverable[0];
      console.log(`    example: questionId=${String(r.questionId).slice(0, 56)}`);
      console.log(`             sourceId=${String(r.sourceId ?? '').slice(0, 56)}`);
    }
    // What do the unrecoverable ones look like?
    const stuck = noSitting.filter((r) => !probes.some(([, get]) => DATE_RE.test(get(r))));
    if (stuck[0]) {
      console.log(`  NOT recoverable: ${stuck.length}. Example fields:`);
      const r = stuck[0];
      console.log(`    questionId=${String(r.questionId).slice(0, 60)}`);
      console.log(`    sourceId=${JSON.stringify(r.sourceId ?? null)} paper=${JSON.stringify(r.paper ?? null)} shift=${JSON.stringify(r.shift ?? null)} session=${JSON.stringify(r.session ?? null)}`);
      console.log(`    sourceUrl=${JSON.stringify(String(r.sourceUrl ?? '').slice(0, 70))}`);
    }
    report[exam] = {
      total: rows.length, withSitting: withSitting.length, withoutSitting: noSitting.length,
      recoverability, anyRecoverable: anyRecoverable.length, notRecoverable: stuck.length,
    };
  }

  // What does the registry know that the questions do not?
  console.log('\n=== registry: does it carry dates the questions lack? ===');
  const reg = (await db.collection('pyq_source_registry').get()).docs.map((d) => d.data() as any);
  const sscReg = reg.filter((s) => s.examId === 'SSC_CGL');
  console.log(`  SSC_CGL registry rows: ${sscReg.length}`);
  const dateBearing = sscReg.filter((s) => DATE_RE.test(JSON.stringify(s)));
  console.log(`  rows containing a date anywhere: ${dateBearing.length}`);
  for (const s of dateBearing.slice(0, 5)) {
    console.log(`    ${String(s.sourceId).slice(0, 48)} year=${s.year} shift=${JSON.stringify(s.shift)} title=${JSON.stringify(String(s.documentTitle ?? s.sourceName ?? '').slice(0, 44))}`);
  }
  report.registry = { sscRows: sscReg.length, dateBearing: dateBearing.length };

  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify(report, null, 2));
  console.log(`\n-> ${OUT}`);
}

main().then(() => process.exit(0)).catch((e) => { console.error('FAILED:', e?.message || e); process.exit(1); });
