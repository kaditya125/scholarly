/**
 * Rewrite the landing page's exam list from what the LIVE API actually serves.
 *
 * Deliberately queries sadhya.app rather than Firestore or the ingest batch's own summary. Both of
 * those can say an exam published while a student still gets nothing — publication and indexing
 * are separate steps, and a partial index leaves a syllabus that is CURRENT but empty. The only
 * check that reflects a student's experience is asking the same endpoint their browser would.
 *
 * An exam is listed only if the API returns status CURRENT and a non-zero topic count.
 *
 *   node backend-firestore/scripts/phase4a/sync-28-landing-list.mjs [--write]
 */
import fs from 'fs';
import path from 'path';

const WRITE = process.argv.includes('--write');
const BASE = process.env.SADHYA_BASE || 'https://sadhya.app';

/** Display name and the authority domain shown beside it. Order is the order on the page. */
const CANDIDATES = [
  ['SSC_CGL', 'SSC CGL', 'ssc.gov.in'],
  ['SSC_MTS', 'SSC MTS', 'ssc.gov.in'],
  ['SSC_GD', 'SSC GD Constable', 'ssc.gov.in'],
  ['NEET_UG', 'NEET UG', 'nta.ac.in'],
  ['JEE_MAIN', 'JEE Main', 'nta.ac.in'],
  ['UPSC_ESE', 'UPSC ESE', 'upsc.gov.in'],
  ['UPSC_CAPF', 'UPSC CAPF', 'upsc.gov.in'],
  ['BPSC_LDC', 'BPSC LDC', 'bpsc.bihar.gov.in'],
  ['BPSC_DPRO', 'BPSC DPRO', 'bpsc.bihar.gov.in'],
  ['BPSC_CDPO_HS', 'BPSC CDPO', 'bpsc.bihar.gov.in'],
];

const countTopics = (nodes, acc = { n: 0 }) => {
  for (const node of nodes || []) {
    if (node.type === 'TOPIC') acc.n++;
    countTopics(node.children, acc);
  }
  return acc.n;
};

const live = [];
for (const [examId, name, source] of CANDIDATES) {
  let verdict = 'no response';
  try {
    const res = await fetch(`${BASE}/api/exams/${examId}/syllabus`, { signal: AbortSignal.timeout(30000) });
    if (res.ok) {
      const body = await res.json();
      const s = body?.syllabus;
      const topics = s ? countTopics(s.nodes) : 0;
      if (s?.status === 'CURRENT' && topics > 0) {
        live.push({ name, source });
        verdict = `CURRENT, ${topics} topics`;
      } else {
        verdict = s ? `${s.status}, ${topics} topics — excluded` : 'not published — excluded';
      }
    } else {
      verdict = `HTTP ${res.status} — excluded`;
    }
  } catch (err) {
    verdict = `${String(err?.message).slice(0, 40)} — excluded`;
  }
  console.log(`  ${examId.padEnd(14)} ${verdict}`);
}

console.log(`\n  ${live.length}/${CANDIDATES.length} exams are retrievable and will be listed`);
if (!live.length) { console.error('\nrefusing to write an empty list'); process.exit(2); }

const file = path.join(process.cwd(), 'frontend', 'src', 'pages', 'Landing.tsx');
const src = fs.readFileSync(file, 'utf8');
const eol = src.includes('\r\n') ? '\r\n' : '\n';
const body = src.replace(/\r\n/g, '\n');

const start = body.indexOf('const SYLLABUS_LIVE = [');
const end = body.indexOf('];', start) + 2;
if (start < 0) { console.error('SYLLABUS_LIVE not found'); process.exit(2); }

const block = 'const SYLLABUS_LIVE = [\n'
  + live.map((e) => `  { name: '${e.name}', source: '${e.source}' },`).join('\n')
  + '\n];';

if (body.slice(start, end) === block) { console.log('\nlist already matches the live API — nothing to write'); process.exit(0); }
if (!WRITE) { console.log('\nDRY RUN — pass --write to update Landing.tsx'); process.exit(0); }

fs.writeFileSync(file, (body.slice(0, start) + block + body.slice(end)).replace(/\n/g, eol));
console.log('\nLanding.tsx updated');
