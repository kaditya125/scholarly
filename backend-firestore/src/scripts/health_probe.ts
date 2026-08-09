/**
 * Pings every mounted route group to see what actually responds.
 *
 * "Healthy" = the router is loaded and its handler runs. 401/403 count as
 * healthy — that just means auth is required, which is the correct behaviour
 * for user endpoints. A 404 or 5xx from a route that USED to work indicates a
 * real regression from a wiped tracked file.
 */

const BASE = 'http://localhost:8080/api';

// One probe per mount point, chosen to require no auth if possible or to at
// least reach the router (so a wrong path returns 401 from auth middleware
// rather than 404 from an unmounted router).
const PROBES: { name: string; method: string; path: string }[] = [
  { name: 'analytics',           method: 'GET',  path: '/analytics/costs' },
  { name: 'briefing',            method: 'GET',  path: '/briefing' },
  { name: 'questions',           method: 'GET',  path: '/questions' },
  { name: 'tests',               method: 'GET',  path: '/tests' },
  { name: 'planner',             method: 'GET',  path: '/planner' },
  { name: 'leaderboard',         method: 'GET',  path: '/leaderboard' },
  { name: 'discussions',         method: 'GET',  path: '/discussions' },
  { name: 'rooms',               method: 'GET',  path: '/rooms' },
  { name: 'users',               method: 'GET',  path: '/users' },
  { name: 'chat',                method: 'GET',  path: '/chat/sessions' },
  { name: 'companion',           method: 'POST', path: '/companion/evaluate' },
  { name: 'notebooks',           method: 'GET',  path: '/notebooks' },
  { name: 'study-groups',        method: 'GET',  path: '/study-groups' },
  { name: 'explore',             method: 'GET',  path: '/explore' },
  { name: 'admin',               method: 'GET',  path: '/admin' },
  { name: 'baseline-assessment', method: 'GET',  path: '/baseline-assessment/start/probe-user' },
  { name: 'connections',         method: 'GET',  path: '/connections' },
  { name: 'cron',                method: 'POST', path: '/cron/backup' },
  { name: 'dm',                  method: 'GET',  path: '/dm' },
  { name: 'documents',           method: 'GET',  path: '/documents/books' },
  { name: 'doubts',              method: 'GET',  path: '/doubts' },
  { name: 'media',               method: 'GET',  path: '/media' },
  { name: 'notifications',       method: 'GET',  path: '/notifications' },
  { name: 'payments',            method: 'GET',  path: '/payments/config' },
  { name: 'planning',            method: 'POST', path: '/planning/start' },
  { name: 'podcasts (unauth)',   method: 'GET',  path: '/podcasts/cinematic/status' },
  { name: 'podcasts (auth)',     method: 'GET',  path: '/podcasts' },
  { name: 'quiz',                method: 'GET',  path: '/quiz' },
  { name: 'scan',                method: 'GET',  path: '/scan' },
  { name: 'trash',               method: 'GET',  path: '/trash' },
  { name: 'uploads',             method: 'GET',  path: '/uploads' },
  { name: 'video-lesson',        method: 'GET',  path: '/video-lesson' },
  { name: 'webhooks',            method: 'GET',  path: '/webhooks/whatsapp' },
];

const verdict = (s: number) => {
  if (s >= 200 && s < 400) return 'OK';
  if (s === 401 || s === 403) return 'OK (auth)';
  if (s === 404) return 'BROKEN (404)';
  if (s === 429) return 'OK (rate-limited)';
  if (s === 400) return 'OK (bad request but route responded)';
  if (s === 405) return 'OK (method not allowed but route exists)';
  if (s >= 500) return 'BROKEN (' + s + ')';
  return String(s);
};

async function probe(p: { name: string; method: string; path: string }) {
  const start = Date.now();
  try {
    const r = await fetch(BASE + p.path, {
      method: p.method,
      signal: AbortSignal.timeout(10000),
    });
    return { name: p.name, path: p.path, status: r.status, ms: Date.now() - start };
  } catch (e: any) {
    return { name: p.name, path: p.path, status: 0, ms: Date.now() - start, err: e?.message };
  }
}

async function main() {
  console.log('\n=== backend endpoint health probe ===\n');
  console.log('name                       path                                status  verdict          ms');
  console.log('-'.repeat(105));

  const results: Awaited<ReturnType<typeof probe>>[] = [];
  for (const p of PROBES) {
    const r = await probe(p);
    results.push(r);
    const status = r.status ? String(r.status) : 'NO-CONN';
    const v = r.err ? 'BROKEN (' + r.err + ')' : verdict(r.status);
    console.log(
      `${r.name.padEnd(26)} ${r.path.padEnd(34)} ${status.padStart(6)}  ${v.padEnd(15)} ${String(r.ms).padStart(5)}`
    );
  }

  const broken = results.filter((r) => {
    if (!r.status) return true;
    if (r.status === 404) return true;
    if (r.status >= 500) return true;
    return false;
  });
  const ok = results.length - broken.length;

  console.log('\n' + '='.repeat(105));
  console.log(`${ok}/${results.length} routers responding healthily.`);
  if (broken.length) {
    console.log('\nBROKEN endpoints:');
    for (const b of broken) console.log(`  ${b.path}  ${b.status || b.err}`);
  } else {
    console.log('All routers healthy.');
  }
  console.log('');
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
