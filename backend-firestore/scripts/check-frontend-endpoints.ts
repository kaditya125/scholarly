/**
 * Frontend ↔ backend endpoint integrity check.
 *
 *   npx tsx scripts/check-frontend-endpoints.ts
 *
 * Walks the REAL Express router (routes/index.ts, mounted at /api) and every
 * api.get/post/put/patch/delete(...) and fetch(...) call under frontend/src, then fails if:
 *   - a frontend call matches no backend route and is not in
 *     frontend/src/lib/api/unsupportedEndpoints.ts (with its reason), or
 *   - an entry in that list now matches a real route (stale — remove it).
 * Read-only; needs the same env as other probe scripts (DI bootstrap only, no server).
 */
import { bootstrapForProbe } from '../src/core/di/probeBootstrap';
bootstrapForProbe();

import * as fs from 'fs';
import * as path from 'path';
import { UNSUPPORTED_ENDPOINTS } from '../../frontend/src/lib/api/unsupportedEndpoints';

const FRONTEND_SRC = path.resolve(__dirname, '../../frontend/src');
/** Frontend calls that intentionally do not go to the backend API, with the reason. */
const NON_BACKEND = new Set<string>([]);

type Route = { method: string; path: string; re: RegExp };

function mountPath(layer: any): string {
  const src: string = layer.regexp?.source ?? '';
  if (src === '^\\/?(?=\\/|$)' || src === '^\\/?$') return '';
  return src.replace('^', '').replace(/\\\/\?\(\?=\\\/\|\$\)$/, '').replace(/\(\?:\(\[\^\\\/\]\+\?\)\)/g, ':p').replace(/\\\//g, '/');
}
const toRe = (p: string) => new RegExp('^' + p.replace(/\*/g, '.*').replace(/:\w+/g, '[^/]+') + '$');

function routeTable(): Route[] {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const router = require('../src/routes/index').default;
  const out: Route[] = [];
  const walk = (stack: any[], prefix: string) => {
    for (const layer of stack) {
      if (layer.route) {
        for (const p of [].concat(layer.route.path)) {
          for (const m of Object.keys(layer.route.methods)) {
            const full = (prefix + p).replace(/\/+$/, '') || '/';
            out.push({ method: m.toUpperCase(), path: full, re: toRe(full) });
          }
        }
      } else if (layer.handle?.stack) walk(layer.handle.stack, prefix + mountPath(layer));
    }
  };
  walk(router.stack, '');
  return out;
}

/** Reads the first argument of a call starting at `i` (just after the open paren). */
function readStringArg(src: string, i: number): string | null {
  while (/\s/.test(src[i])) i++;
  const q = src[i];
  if (q !== '`' && q !== "'" && q !== '"') return null;
  let out = '';
  let depth = 0;
  for (let j = i + 1; j < src.length; j++) {
    const c = src[j];
    if (depth === 0 && c === q) return out;
    if (q === '`' && c === '$' && src[j + 1] === '{') { depth++; out += '${'; j++; continue; }
    if (depth > 0 && c === '}') { depth--; out += '}'; continue; }
    out += c;
  }
  return null;
}

/** Turns a call's URL text into an /api-relative path with ':param' segments, or null if not a backend call. */
function normalise(raw: string, consts: Record<string, string>): string | null {
  let url = raw;
  const lead = /^\$\{\s*([\w.()]+)\s*\}/.exec(url);
  if (lead) {
    const name = lead[1];
    if (['API_BASE_URL', 'getApiBaseUrl()', 'API_BASE'].includes(name) && !(name in consts)) url = url.slice(lead[0].length);
    else if (name in consts) url = consts[name] + url.slice(lead[0].length);
    else return null;
  }
  if (/^https?:/.test(url)) return null;
  // Template expressions: whole segment → :param; expressions appended to a literal (query strings,
  // suffixes like `${qs}`) are dropped.
  url = replaceExpressions(url);
  url = url.split('?')[0].replace(/\/+$/, '');
  if (url.startsWith('/api/')) url = url.slice(4);
  return url.startsWith('/') ? url : null;
}

/**
 * Brace-aware: a ${...} that is a whole path segment becomes ':p'; any other expression (query
 * strings, suffixes, nested templates like `?${q}`) is dropped.
 */
function replaceExpressions(url: string): string {
  let out = '';
  for (let i = 0; i < url.length; i++) {
    if (url[i] === '$' && url[i + 1] === '{') {
      let depth = 1, j = i + 2;
      for (; j < url.length && depth; j++) { if (url[j] === '{') depth++; else if (url[j] === '}') depth--; }
      const next = url[j];
      out += out.endsWith('/') && (next === undefined || next === '/' || next === '?') ? ':p' : '';
      i = j - 1;
      continue;
    }
    out += url[i];
  }
  return out;
}

function frontendCalls() {
  const calls: Array<{ file: string; line: number; method: string; path: string }> = [];
  const walk = (dir: string) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) { if (!e.name.startsWith('__')) walk(p); continue; }
      if (!/\.tsx?$/.test(e.name)) continue;
      const src = fs.readFileSync(p, 'utf8');
      const consts: Record<string, string> = {};
      for (const m of src.matchAll(/const (\w+)\s*=\s*['`]([^'`$]*)['`]/g)) consts[m[1]] = m[2];
      for (const m of src.matchAll(/\b(?:api\.(get|post|put|patch|delete)\s*(?:<[^>()]*>)?|fetch)\s*\(/g)) {
        const raw = readStringArg(src, m.index! + m[0].length);
        if (raw == null) continue;
        const url = normalise(raw, consts);
        if (!url) continue;
        let method = m[1]?.toUpperCase();
        if (!method) {
          const tail = src.slice(m.index!, m.index! + 400);
          method = (/method:\s*['"](\w+)['"]/.exec(tail)?.[1] ?? 'GET').toUpperCase();
        }
        calls.push({ file: path.relative(FRONTEND_SRC, p).replace(/\\/g, '/'), line: src.slice(0, m.index).split('\n').length, method, path: url });
      }
    }
  };
  walk(FRONTEND_SRC);
  return calls;
}

function main() {
  const routes = routeTable();
  const calls = frontendCalls();
  const hasRoute = (method: string, p: string) => routes.some((r) => r.method === method && r.re.test(p));
  const listed = UNSUPPORTED_ENDPOINTS.map((u) => ({ ...u, re: toRe(u.path) }));

  const unexplained = calls.filter((c) => !NON_BACKEND.has(`${c.method} ${c.path}`) && !hasRoute(c.method, c.path)
    && !listed.some((u) => u.method === c.method && u.re.test(c.path)));
  const stale = listed.filter((u) => hasRoute(u.method, u.path.replace(/:\w+/g, 'x')));

  console.log(`backend routes: ${routes.length}   frontend calls: ${calls.length}   listed unsupported: ${listed.length}`);
  for (const c of unexplained) console.log(`UNEXPLAINED  ${c.method} ${c.path}   (${c.file}:${c.line})`);
  for (const u of stale) console.log(`STALE        ${u.method} ${u.path}   (now has a backend route — remove it from unsupportedEndpoints.ts)`);
  process.exit(unexplained.length || stale.length ? 1 : 0);
}

main();
