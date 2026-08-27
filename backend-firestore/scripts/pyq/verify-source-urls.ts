/** Do the cited PYQ source URLs actually exist? HEAD only. */
import 'dotenv/config';
import https from 'https';
import { db } from '../../src/config/firebase';
import { certificateAuthorities } from '../../src/services/exam/trust';

const head = (url: string) => new Promise<string>((resolve) => {
  let done = false;
  const fin = (s: string) => { if (!done) { done = true; resolve(s); } };
  try {
    const req = https.request(url, { method: 'HEAD', timeout: 12000,
      agent: new https.Agent({ ca: certificateAuthorities(), rejectUnauthorized: true }) }, (res) => {
      fin(`${res.statusCode} ${res.headers['content-type'] || ''}`); res.destroy();
    });
    req.on('error', (e: any) => fin('ERR ' + String(e.message).slice(0, 55)));
    req.on('timeout', () => { req.destroy(); fin('TIMEOUT'); });
    req.end();
  } catch (e: any) { fin('BAD URL'); }
});

(async () => {
  const snap = await db.collection('pyq_questions').get();
  const rows = snap.docs.map((d) => d.data() as any).filter((q) => q.examId === 'JEE_MAIN');
  const urls = [...new Set(rows.map((q) => q.sourceUrl).filter(Boolean))];
  console.log(`distinct cited source URLs for JEE_MAIN: ${urls.length}\n`);
  for (const u of urls.slice(0, 10)) console.log(`  ${(await head(u)).padEnd(34)} ${u}`);

  console.log('\n=== do the cited hosts even resolve? ===');
  const hosts = [...new Set(urls.map((u) => { try { return new URL(u).hostname; } catch { return '?'; } }))];
  for (const h of hosts) {
    const r = await head(`https://${h}/`);
    console.log(`  ${r.padEnd(34)} ${h}`);
  }
  process.exit(0);
})().catch((e) => { console.error('FAILED:', e?.message || e); process.exit(1); });
