/**
 * J.11 — outbound fetch safety.
 *
 * Two defects found in the J.11 audit, both able to put hostile bytes behind official provenance:
 *
 *  1. `archiveFromUrl` used `axios.get` with no `maxRedirects`, so axios followed up to five hops
 *     while domain authority was checked on the ORIGINAL url only. `ssc.gov.in/x.pdf` → 302 →
 *     `evil.example/x.pdf` would have had evil.example's bytes hashed and archived as the official
 *     syllabus.
 *  2. Nothing rejected loopback, private, link-local or cloud-metadata addresses, so an exam
 *     registered with an internal hostname — or a redirect to one — was fetchable from inside the
 *     VM's network.
 */
import { isBlockedAddress } from '../../src/services/exam/officialFetch';
import fs from 'fs';
import path from 'path';

describe('J.11 SSRF address blocking', () => {
  const blocked = [
    ['loopback v4', '127.0.0.1'], ['loopback range', '127.255.255.254'],
    ['this-host', '0.0.0.0'],
    ['RFC1918 /8', '10.1.2.3'], ['RFC1918 /12 low', '172.16.0.1'], ['RFC1918 /12 high', '172.31.255.254'],
    ['RFC1918 /16', '192.168.1.1'],
    ['link-local', '169.254.1.1'],
    ['CLOUD METADATA', '169.254.169.254'],
    ['CGNAT', '100.64.0.1'],
    ['multicast', '224.0.0.1'],
    ['v6 loopback', '::1'], ['v6 unspecified', '::'],
    ['v6 link-local', 'fe80::1'],
    ['v6 unique-local fc', 'fc00::1'], ['v6 unique-local fd', 'fd12:3456::1'],
    ['v4-mapped private', '::ffff:10.0.0.1'],
    ['v4-mapped metadata', '::ffff:169.254.169.254'],
    ['not an address', 'not-an-ip'],
  ] as const;

  for (const [label, ip] of blocked) {
    it(`blocks ${label} (${ip})`, () => expect(isBlockedAddress(ip)).toBe(true));
  }

  const allowed = [
    ['public v4', '8.8.8.8'], ['gov-ish public', '164.100.1.1'],
    ['172.15 is NOT private', '172.15.0.1'], ['172.32 is NOT private', '172.32.0.1'],
    ['100.63 is below CGNAT', '100.63.255.255'], ['100.128 is above CGNAT', '100.128.0.1'],
    ['public v6', '2001:4860:4860::8888'],
  ] as const;

  for (const [label, ip] of allowed) {
    it(`allows ${label} (${ip})`, () => expect(isBlockedAddress(ip)).toBe(false));
  }

  it('the boundaries are exact, not approximate', () => {
    // 172.16.0.0–172.31.255.255 is private; the neighbours are not. An off-by-one here would
    // either block legitimate hosts or expose an internal range.
    expect(isBlockedAddress('172.16.0.0')).toBe(true);
    expect(isBlockedAddress('172.31.255.255')).toBe(true);
    expect(isBlockedAddress('172.15.255.255')).toBe(false);
    expect(isBlockedAddress('172.32.0.0')).toBe(false);
  });
});

describe('J.11 redirect and retrieval contract', () => {
  const src = (rel: string) =>
    fs.readFileSync(path.join(__dirname, '../../src', rel), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

  it('redirects are never followed automatically', () => {
    const s = src('services/exam/officialFetch.ts');
    expect(s).toMatch(/maxRedirects:\s*0/);
  });

  it('authority is re-verified inside the redirect loop, not once before it', () => {
    const s = src('services/exam/officialFetch.ts');
    // lastIndexOf: TOO_MANY_REDIRECTS also appears in the rejection-code union near the top of the
    // file, and indexOf would slice backwards to an empty string — a test that asserts nothing.
    const loop = s.slice(s.indexOf('for (let hop'), s.lastIndexOf('TOO_MANY_REDIRECTS'));
    expect(loop.length).toBeGreaterThan(200);
    expect(loop).toContain('verifyOfficialSource');
    expect(loop).toContain('assertHostResolvesPublicly');
    // A redirect leaving the official domain is reported as its own distinct failure.
    expect(s).toContain('REDIRECT_LEFT_OFFICIAL_DOMAIN');
  });

  it('the archiver no longer performs an unguarded axios.get', () => {
    const s = src('services/exam/examDocumentStorage.service.ts');
    expect(s).toContain('fetchOfficialDocument');
    // The remaining direct axios path (no exam supplied) must still refuse redirects.
    const axiosCalls = s.match(/axios\.get\([\s\S]{0,300}?\}\)/g) ?? [];
    for (const call of axiosCalls) expect(call).toMatch(/maxRedirects:\s*0/);
  });

  it('there is no second domain allowlist — authority stays with the verifier', () => {
    const s = src('services/exam/officialFetch.ts');
    expect(s).toContain('officialSourceVerificationService');
    expect(s).not.toMatch(/officialDomains\s*=\s*\[/);
    expect(s).not.toMatch(/\.gov\.in['"]/);
  });

  it('a document size ceiling exists', () => {
    const s = src('services/exam/officialFetch.ts');
    expect(s).toMatch(/MAX_DOCUMENT_BYTES/);
    expect(s).toContain('RESPONSE_TOO_LARGE');
  });

  it('retry is limited to transient failures', () => {
    const s = src('services/exam/officialFetch.ts');
    // A settled answer (wrong domain, private address, too large) must not be retried.
    expect(s).toMatch(/err\.code !== 'REQUEST_FAILED'/);
  });

  it('loopback is only reachable through an explicit non-production seam', () => {
    const s = src('services/exam/officialFetch.ts');
    expect(s).toMatch(/NODE_ENV === 'test'/);
    expect(s).toMatch(/ALLOW_LOOPBACK_FETCH/);
  });
});
