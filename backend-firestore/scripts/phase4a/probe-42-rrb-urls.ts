/** Probe candidate official RRB document URLs. HEAD only — no download, no quota. */
import https from 'https';
import { certificateAuthorities } from '../../src/services/exam/trust';

const CANDIDATES = [
  'https://rrb.indianrailways.gov.in/downloads/CEN-07-2025-NTPC-UnderGraduate-English.pdf',
  'https://rrb.indianrailways.gov.in/uploads/CEN-07-2025-NTPC-UnderGraduate-English.pdf',
  'https://rrb.indianrailways.gov.in/CEN-07-2025-NTPC-UnderGraduate-English.pdf',
  'https://rrbchennai.gov.in/downloads/CEN-07-2025-NTPC-UnderGraduate-English.pdf',
  'https://rrbapply.gov.in/',
  'https://rrb.indianrailways.gov.in/',
];

const head = (url: string) => new Promise<string>((resolve) => {
  const req = https.request(url, { method: 'HEAD', timeout: 15000,
    agent: new https.Agent({ ca: certificateAuthorities(), rejectUnauthorized: true }) }, (res) => {
    resolve(`${res.statusCode} ${res.headers['content-type'] || ''} ${res.headers['content-length'] || ''} ${res.headers.location ? '-> ' + res.headers.location : ''}`);
    res.destroy();
  });
  req.on('error', (e: any) => resolve('ERR ' + e.message.slice(0, 80)));
  req.on('timeout', () => { req.destroy(); resolve('TIMEOUT'); });
  req.end();
});

(async () => {
  for (const u of CANDIDATES) console.log(`${(await head(u)).padEnd(52)} ${u}`);
  process.exit(0);
})();
