/**
 * Credential redaction for connection URLs.
 *
 * THE LEAK THIS CLOSES: both `[EventBus] Redis Pub/Sub connected successfully to ${redisUrl}` and
 * `[BackgroundQueue] Initialized … Connecting to ${env.REDIS_URL}` printed the full Upstash
 * connection string — password included — at every boot. Anyone with PM2 log access, log shipping
 * or a support bundle held the live Redis credential, reprinted on every restart.
 */
import { redactUrlCredentials } from '../../src/utils/redactUrl';
import fs from 'fs';
import path from 'path';

const SECRET = 'gQAAAAAAARmQAAIgcDJlZTI0ZTljNzIxYmQ0OWI0OTk3YTVjMzUzYzZiOTFjYg';

describe('redactUrlCredentials', () => {
  it('removes the password from a real-shaped Upstash URL but keeps the host', () => {
    const out = redactUrlCredentials(`rediss://default:${SECRET}@special-unicorn-72080.upstash.io:6379`);
    expect(out).not.toContain(SECRET);
    expect(out).toContain('***');
    // Still useful: you can see WHICH Redis was attached without being able to read it.
    expect(out).toContain('special-unicorn-72080.upstash.io');
    expect(out).toContain('rediss:');
  });

  it('keeps port and database path', () => {
    const out = redactUrlCredentials('redis://user:pw@10.0.0.5:6379/2');
    expect(out).not.toContain('pw@');
    expect(out).toContain('6379');
    expect(out).toContain('/2');
  });

  it('leaves a credential-free URL intact', () => {
    expect(redactUrlCredentials('redis://127.0.0.1:6379')).toContain('127.0.0.1:6379');
  });

  it('never echoes an unparseable value verbatim', () => {
    // A malformed URL must not be assumed harmless — it can still contain a token.
    const out = redactUrlCredentials(`garbage-${SECRET}`);
    expect(out).not.toContain(SECRET);
  });

  it('reports an unset value without throwing', () => {
    expect(redactUrlCredentials(undefined)).toBe('(unset)');
    expect(redactUrlCredentials('')).toBe('(unset)');
    expect(redactUrlCredentials(null)).toBe('(unset)');
  });
});

describe('no boot path logs a raw connection string', () => {
  const src = (rel: string) =>
    fs.readFileSync(path.join(__dirname, '../../src', rel), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

  it('EventBus redacts before logging', () => {
    const s = src('core/events/EventBus.ts');
    expect(s).toMatch(/redactUrlCredentials\(redisUrl\)/);
    expect(s).not.toMatch(/connected successfully to \$\{redisUrl\}/);
  });

  it('BackgroundQueue redacts before logging', () => {
    const s = src('core/workflow/jobs/BackgroundQueue.ts');
    expect(s).toMatch(/redactUrlCredentials\(env\.REDIS_URL\)/);
    expect(s).not.toMatch(/Connecting to \$\{env\.REDIS_URL\}/);
  });

  it('no logger call anywhere interpolates a redis URL directly', () => {
    const root = path.join(__dirname, '../../src');
    const offenders: string[] = [];
    const walk = (dir: string) => {
      for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, e.name);
        if (e.isDirectory()) { walk(p); continue; }
        if (!e.name.endsWith('.ts')) continue;
        const s = fs.readFileSync(p, 'utf8')
          .replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
        if (/(logger\.(info|warn|error|debug)|console\.(log|info|error|warn))[^\n]*\$\{\s*(redisUrl|env\.REDIS_URL|process\.env\.REDIS_URL)\s*\}/.test(s)) {
          offenders.push(path.relative(root, p));
        }
      }
    };
    walk(root);
    expect(offenders).toEqual([]);
  });
});
