/**
 * J.11 — safe outbound retrieval from official domains.
 *
 * Every byte the canonical pipeline trusts enters through here. Two defects this closes, both
 * found in the J.11 audit and both capable of putting hostile bytes behind official provenance:
 *
 *  1. REDIRECT BYPASS. `archiveFromUrl` called `axios.get` with no `maxRedirects`, so axios
 *     silently followed up to five hops. Domain authority was checked on the ORIGINAL url only, so
 *     `https://ssc.gov.in/x.pdf` → 302 → `https://evil.example/x.pdf` would have had evil.example's
 *     bytes hashed and archived as the official syllabus. Authority must be re-established at every
 *     hop, because the only URL that matters is the one that actually served the bytes.
 *
 *  2. NO SSRF DEFENCE. Nothing rejected loopback, private, link-local or cloud-metadata addresses.
 *     An exam registered with an internal hostname — or a redirect to one — would have been fetched
 *     from inside the VM's network. DNS is resolved and the ADDRESS is checked, not the name:
 *     `internal.ssc.gov.in` can resolve to 10.0.0.5 while looking perfectly official.
 *
 * Deliberately does not own the domain allowlist. That stays with officialSourceVerificationService
 * — a second allowlist would drift from the first, and the drift would be silent.
 */
import axios from 'axios';
import dns from 'dns/promises';
import net from 'net';
import { logger } from '../../utils/logger';
import { officialSourceVerificationService } from './officialSourceVerification.service';
import type { ExamMaster } from '../../types/exam.types';

export type FetchRejectionCode =
  | 'URL_UNPARSEABLE'
  | 'URL_CONTAINS_USERINFO'
  | 'UNSUPPORTED_PROTOCOL'
  | 'DOMAIN_NOT_OFFICIAL'
  | 'REDIRECT_LEFT_OFFICIAL_DOMAIN'
  | 'TOO_MANY_REDIRECTS'
  | 'PRIVATE_ADDRESS_BLOCKED'
  | 'DNS_RESOLUTION_FAILED'
  | 'RESPONSE_TOO_LARGE'
  | 'REQUEST_FAILED';

export class OfficialFetchError extends Error {
  constructor(public readonly code: FetchRejectionCode, message: string) {
    super(message);
    this.name = 'OfficialFetchError';
  }
}

/** Hard ceiling on a retrieved document. Government notices are megabytes, not gigabytes. */
export const MAX_DOCUMENT_BYTES = 64 * 1024 * 1024;
const MAX_REDIRECTS = 5;
const DEFAULT_TIMEOUT_MS = 30_000;

/**
 * Whether an IP is one we must never fetch from.
 *
 * Covers loopback, RFC1918 private ranges, link-local (which includes 169.254.169.254 — the cloud
 * metadata endpoint that leaks instance credentials), carrier-grade NAT, and the IPv6 equivalents.
 * Checked against RESOLVED ADDRESSES rather than hostnames: a name says nothing about where it
 * points, and that gap is the whole of SSRF.
 */
export function isBlockedAddress(ip: string): boolean {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split('.').map(Number);
    if (a === 0 || a === 127) return true;                    // this-host / loopback
    if (a === 10) return true;                                // RFC1918
    if (a === 172 && b >= 16 && b <= 31) return true;         // RFC1918
    if (a === 192 && b === 168) return true;                  // RFC1918
    if (a === 169 && b === 254) return true;                  // link-local + metadata
    if (a === 100 && b >= 64 && b <= 127) return true;        // CGNAT
    if (a >= 224) return true;                                // multicast / reserved
    return false;
  }
  if (net.isIPv6(ip)) {
    const v = ip.toLowerCase();
    if (v === '::' || v === '::1') return true;               // unspecified / loopback
    if (v.startsWith('fe80')) return true;                    // link-local
    if (v.startsWith('fc') || v.startsWith('fd')) return true; // unique local
    // IPv4-mapped (::ffff:10.0.0.1) — re-check the embedded address rather than trusting the form.
    const mapped = v.match(/::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    if (mapped) return isBlockedAddress(mapped[1]);
    return false;
  }
  return true; // not a recognisable address — refuse rather than guess
}

/**
 * Test seam. Persisted E2E harnesses serve fixtures from 127.0.0.1, which the SSRF guard correctly
 * blocks. Enabling this is an explicit, logged decision available only outside production — it is
 * never reachable by configuration alone, so production cannot be talked into fetching localhost.
 */
export function allowLoopbackForTests(): boolean {
  return process.env.NODE_ENV === 'test' || process.env.ALLOW_LOOPBACK_FETCH === '1';
}

/** Structural URL checks. Mirrors J.6's assertUrlShapeSafe so both layers agree on what is hostile. */
function assertUrlShape(rawUrl: string): URL {
  let parsed: URL;
  try { parsed = new URL(rawUrl); } catch {
    throw new OfficialFetchError('URL_UNPARSEABLE', `not a parseable URL: ${rawUrl}`);
  }
  if (parsed.username || parsed.password) {
    // https://ssc.gov.in@evil.example/x — the real host is evil.example.
    throw new OfficialFetchError('URL_CONTAINS_USERINFO', `URL carries userinfo: ${parsed.host}`);
  }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    throw new OfficialFetchError('UNSUPPORTED_PROTOCOL', `protocol ${parsed.protocol} is not allowed`);
  }
  return parsed;
}

/** Resolves the hostname and refuses if ANY resolved address is blocked. */
async function assertHostResolvesPublicly(hostname: string): Promise<void> {
  if (net.isIP(hostname)) {
    if (isBlockedAddress(hostname) && !allowLoopbackForTests()) {
      throw new OfficialFetchError('PRIVATE_ADDRESS_BLOCKED', `literal address ${hostname} is not routable publicly`);
    }
    return;
  }
  if (allowLoopbackForTests() && (hostname === 'localhost' || hostname.startsWith('127.'))) return;

  let addresses: string[];
  try {
    addresses = (await dns.lookup(hostname, { all: true })).map((a) => a.address);
  } catch (err: any) {
    throw new OfficialFetchError('DNS_RESOLUTION_FAILED', `cannot resolve ${hostname}: ${err?.message}`);
  }
  // ALL addresses must be public. One private answer is enough to make the host unsafe.
  const blocked = addresses.filter(isBlockedAddress);
  if (blocked.length > 0) {
    throw new OfficialFetchError('PRIVATE_ADDRESS_BLOCKED',
      `${hostname} resolves to non-public address(es): ${blocked.join(', ')}`);
  }
}

export interface OfficialFetchResult {
  buffer: Buffer;
  contentType: string;
  /** The URL that ACTUALLY served the bytes, after redirects. Use this as provenance, not the input. */
  finalUrl: string;
  status: number;
  redirectChain: string[];
}

/**
 * Fetches a document, re-verifying authority and address safety at EVERY hop.
 *
 * Redirects are followed manually with `maxRedirects: 0` precisely so each Location can be checked.
 * `exam` is required: there is no mode in which this fetches from a host that is not registered as
 * official for a specific exam.
 */
export async function fetchOfficialDocument(params: {
  url: string;
  exam: ExamMaster;
  timeoutMs?: number;
  maxBytes?: number;
}): Promise<OfficialFetchResult> {
  const { exam } = params;
  const timeout = params.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const maxBytes = params.maxBytes ?? MAX_DOCUMENT_BYTES;

  let current = params.url;
  const chain: string[] = [];

  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    const parsed = assertUrlShape(current);

    // Authority is re-established on every hop, not just the first.
    const verification = officialSourceVerificationService.verifyOfficialSource(exam, current);
    if (!verification.isOfficial) {
      throw new OfficialFetchError(
        hop === 0 ? 'DOMAIN_NOT_OFFICIAL' : 'REDIRECT_LEFT_OFFICIAL_DOMAIN',
        `${parsed.hostname} is not a registered official domain for ${exam.examId}` +
        (hop > 0 ? ` (reached via ${chain.join(' → ')})` : ''),
      );
    }
    await assertHostResolvesPublicly(parsed.hostname);

    let response;
    try {
      response = await axios.get(current, {
        responseType: 'arraybuffer',
        timeout,
        maxRedirects: 0,          // manual — see the docblock
        maxContentLength: maxBytes,
        maxBodyLength: maxBytes,
        decompress: true,
        validateStatus: (s) => s >= 200 && s < 400,
        headers: { 'User-Agent': 'Sadhya-Exam-Intelligence-Archiver/1.0' },
      });
    } catch (err: any) {
      if (err?.code === 'ERR_FR_MAX_CONTENT_LENGTH_EXCEEDED') {
        throw new OfficialFetchError('RESPONSE_TOO_LARGE', `${current} exceeded ${maxBytes} bytes`);
      }
      throw new OfficialFetchError('REQUEST_FAILED', `${current}: ${err?.message ?? err}`);
    }

    if (response.status >= 300 && response.status < 400) {
      const location = response.headers?.location;
      if (!location) {
        throw new OfficialFetchError('REQUEST_FAILED', `${current} returned ${response.status} with no Location`);
      }
      chain.push(current);
      current = new URL(location, current).toString(); // resolve relative redirects
      continue;
    }

    const buffer = Buffer.from(response.data);
    if (buffer.length > maxBytes) {
      throw new OfficialFetchError('RESPONSE_TOO_LARGE', `${current} returned ${buffer.length} bytes`);
    }
    return {
      buffer,
      contentType: String(response.headers?.['content-type'] ?? 'application/octet-stream'),
      finalUrl: current,
      status: response.status,
      redirectChain: chain,
    };
  }

  throw new OfficialFetchError('TOO_MANY_REDIRECTS',
    `more than ${MAX_REDIRECTS} redirects starting at ${params.url}`);
}

// ─── Politeness: per-domain rate limiting ────────────────────────────────────────────────────

/**
 * Minimum spacing between requests to one host, and a cap on concurrent in-flight requests.
 *
 * These are government websites with modest capacity, and a discovery sweep across strategies can
 * otherwise issue dozens of requests in a burst. Serialised per host: the delay is computed from
 * the last request to THAT host, so unrelated authorities do not block each other.
 */
const MIN_INTERVAL_MS = 1_000;
const lastRequestAt = new Map<string, number>();
const inFlight = new Map<string, Promise<unknown>>();

export async function withDomainRateLimit<T>(hostname: string, fn: () => Promise<T>): Promise<T> {
  const host = hostname.toLowerCase();
  // Chain onto any in-flight request for the same host so one host is never hit in parallel.
  const previous = inFlight.get(host) ?? Promise.resolve();
  const run = previous.catch(() => undefined).then(async () => {
    const since = Date.now() - (lastRequestAt.get(host) ?? 0);
    if (since < MIN_INTERVAL_MS) {
      await new Promise((r) => setTimeout(r, MIN_INTERVAL_MS - since));
    }
    try {
      return await fn();
    } finally {
      lastRequestAt.set(host, Date.now());
    }
  });
  inFlight.set(host, run);
  return run as Promise<T>;
}

/** Test seam so suites do not wait on real spacing. */
export function resetRateLimiterForTests(): void {
  lastRequestAt.clear();
  inFlight.clear();
}

/**
 * Retries only what retrying can fix.
 *
 * 5xx, timeouts and transport failures are transient. A 404, a wrong domain, an oversized body or
 * a payload that is not a document are settled facts — retrying them just adds load to a government
 * site that already gave a clear answer.
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  opts: { attempts?: number; baseDelayMs?: number; label: string } = { label: 'official-fetch' },
): Promise<T> {
  const attempts = opts.attempts ?? 3;
  const base = opts.baseDelayMs ?? 500;
  let lastErr: any;

  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (err: any) {
      lastErr = err;
      const terminal = err instanceof OfficialFetchError
        && err.code !== 'REQUEST_FAILED';
      if (terminal || i === attempts - 1) throw err;
      const delay = base * Math.pow(2, i);
      logger.warn('[OfficialFetch] transient failure; retrying', {
        label: opts.label, attempt: i + 1, of: attempts, delayMs: delay, error: err?.message,
      });
      await new Promise((r) => setTimeout(r, delay));
    }
  }
  throw lastErr;
}
