/** Tier A source probe. Paced, bounded, zero embeddings. */
import https from 'https';
import dns from 'dns/promises';
import { certificateAuthorities } from '../../src/services/exam/trust';

const CITED = 'https://jeemain.nta.ac.in/archive/jee_main_2024_jan29_29janshift1.pdf';

const head = (url: string) => new Promise<string>((resolve) => {
  let done = false;
  const fin = (s: string) => { if (!done) { done = true; resolve(s); } };
  try {
    const req = https.request(url, { method: 'HEAD', timeout: 12000,
      agent: new https.Agent({ ca: certificateAuthorities(), rejectUnauthorized: true }) }, (res) => {
      fin(`${res.statusCode} ${res.headers['content-type'] ?? ''}`); res.destroy();
    });
    req.on('error', (e: any) => fin('ERR ' + String(e.message).slice(0, 60)));
    req.on('timeout', () => { req.destroy(); fin('TIMEOUT'); });
    req.end();
  } catch { fin('BAD_URL'); }
});

(async () => {
  console.log('=== cited source (Tier A as claimed) ===');
  console.log(`  ${await head(CITED)}   ${CITED}`);

  console.log('\n=== does the cited host resolve at all? ===');
  for (const h of ['jeemain.nta.ac.in', 'jeemain.nta.nic.in', 'nta.ac.in', 'www.nta.ac.in']) {
    try { const a = await dns.resolve4(h); console.log(`  ${h.padEnd(24)} ${a[0]}`); }
    catch { console.log(`  ${h.padEnd(24)} NO DNS`); }
  }

  console.log('\n=== is the archive path plausible on the live host? ===');
  for (const u of [
    'https://jeemain.nta.nic.in/',
    'https://jeemain.nta.nic.in/archive/jee_main_2024_jan29_29janshift1.pdf',
    'https://www.nta.ac.in/',
  ]) {
    console.log(`  ${(await head(u)).padEnd(34)} ${u}`);
    await new Promise((r) => setTimeout(r, 1200));   // domain-level pacing
  }
  process.exit(0);
})();
