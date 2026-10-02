/**
 * API base URL: one resolver, no localhost in production, and no hook inventing its own base.
 * Run: npm run test:unit
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  resolveApiBaseUrl, toWebSocketUrl, assertProductionApiUrl, isLocalUrl, LOCAL_DEV_API_URL,
} from '../../src/lib/api/baseUrl';

const prod = { hostname: 'sadhya.app', origin: 'https://sadhya.app' };
const local = { hostname: 'localhost', origin: 'http://localhost:3000' };

test('production hostname with the production env resolves to https://sadhya.app/api', () => {
  assert.equal(resolveApiBaseUrl({ envUrl: 'https://sadhya.app/api', location: prod }), 'https://sadhya.app/api');
  assert.equal(resolveApiBaseUrl({ envUrl: 'https://sadhya.app/api/', location: prod }), 'https://sadhya.app/api');
});

test('production hostname with no env uses same-origin /api', () => {
  assert.equal(resolveApiBaseUrl({ envUrl: undefined, location: prod }), 'https://sadhya.app/api');
  assert.equal(resolveApiBaseUrl({ envUrl: '', location: { hostname: 'www.sadhya.app', origin: 'https://www.sadhya.app' } }), 'https://www.sadhya.app/api');
});

test('a localhost VITE_API_URL is never used on a real domain', () => {
  let ignored = '';
  const url = resolveApiBaseUrl({ envUrl: 'http://localhost:8080/api', location: prod, onIgnoredLocalEnv: (u) => { ignored = u; } });
  assert.equal(url, 'https://sadhya.app/api');
  assert.equal(ignored, 'http://localhost:8080/api');
  assert.equal(resolveApiBaseUrl({ envUrl: 'http://127.0.0.1:8080/api', location: prod }), 'https://sadhya.app/api');
});

test('local development', () => {
  assert.equal(resolveApiBaseUrl({ envUrl: undefined, location: local }), LOCAL_DEV_API_URL);
  assert.equal(LOCAL_DEV_API_URL, 'http://localhost:8080/api');
  assert.equal(resolveApiBaseUrl({ envUrl: 'http://localhost:9090/api', location: local }), 'http://localhost:9090/api');
  assert.equal(resolveApiBaseUrl({ envUrl: undefined, location: null }), LOCAL_DEV_API_URL);
});

test('an explicit non-local VITE_API_URL wins everywhere', () => {
  assert.equal(resolveApiBaseUrl({ envUrl: 'https://staging.sadhya.app/api', location: local }), 'https://staging.sadhya.app/api');
  assert.equal(resolveApiBaseUrl({ envUrl: 'https://sadhya.app/api', location: { hostname: 'preview.example', origin: 'https://preview.example' } }), 'https://sadhya.app/api');
});

test('WebSocket URL derives from the API base: https→wss, http→ws', () => {
  assert.equal(toWebSocketUrl('https://sadhya.app/api', '/voice'), 'wss://sadhya.app/voice');
  assert.equal(toWebSocketUrl('http://localhost:8080/api', 'voice'), 'ws://localhost:8080/voice');
  assert.equal(toWebSocketUrl('https://sadhya.app/api/', '/voice'), 'wss://sadhya.app/voice');
});

test('production build refuses a local VITE_API_URL', () => {
  assert.throws(() => assertProductionApiUrl('production', 'http://localhost:8080/api'), /local host/);
  assert.throws(() => assertProductionApiUrl('production', 'http://127.0.0.1:8080/api'), /local host/);
  assert.doesNotThrow(() => assertProductionApiUrl('production', 'https://sadhya.app/api'));
  assert.doesNotThrow(() => assertProductionApiUrl('production', undefined));
  assert.doesNotThrow(() => assertProductionApiUrl('development', 'http://localhost:8080/api'));
  assert.equal(isLocalUrl('http://app.localhost:5173'), true);
  assert.equal(isLocalUrl('not a url'), false);
});

test('no source file outside baseUrl.ts reads VITE_API_URL, spells a backend host, or opens its own WebSocket host', () => {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../src');
  const offenders: string[] = [];
  const walk = (dir: string) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) { walk(p); continue; }
      if (!/\.(ts|tsx)$/.test(e.name)) continue;
      const rel = path.relative(root, p).replace(/\\/g, '/');
      if (rel === 'lib/api/baseUrl.ts') continue;
      const src = fs.readFileSync(p, 'utf8');
      if (/VITE_API_URL/.test(src)) offenders.push(`${rel}: reads VITE_API_URL`);
      if (/(localhost|127\.0\.0\.1):\d+/.test(src)) offenders.push(`${rel}: hardcoded local host`);
      if (/new WebSocket\((?!wsUrl\(\)|getWebSocketUrl\()/.test(src)) offenders.push(`${rel}: WebSocket not built from getWebSocketUrl`);
      if (/fetch\(\s*[`'"]\/api\/(?!analyze-test)/.test(src)) offenders.push(`${rel}: relative /api fetch bypasses the base URL`);
    }
  };
  walk(root);
  assert.deepEqual(offenders, []);
});
