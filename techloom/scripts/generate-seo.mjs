/**
 * Writes robots.txt and sitemap.xml into dist/ after a build.
 *
 * Both files need absolute URLs, so both are generated rather than committed: a
 * sitemap listing a domain the site is not served from is actively harmful, and a
 * committed one would rot the first time the domain changed. With SITE_URL unset
 * the build still succeeds — it just says loudly that these two files were
 * skipped, which is the honest outcome for a preview or a local build.
 *
 * Run automatically by `npm run build`.
 */
import { readFileSync } from 'node:fs';
import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIST = path.join(ROOT, 'dist');

/**
 * Resolves SITE_URL the way Vite resolves it for the app itself.
 *
 * This runs as a separate Node process after `vite build`, so it does not
 * inherit Vite's `loadEnv` result and would not otherwise see a value set in
 * `.env.production`. Without this the two halves of the same build could
 * disagree — index.html carrying a canonical while sitemap.xml was skipped —
 * which is a worse failure than either one alone, because it looks like it
 * worked.
 *
 * Precedence matches Vite's: the real environment wins, then `.env.production`,
 * then `.env`.
 */
function resolveSiteUrl() {
  const fromEnvironment = process.env.SITE_URL || process.env.VITE_SITE_URL;
  if (fromEnvironment) return fromEnvironment;

  for (const file of ['.env.production', '.env']) {
    let contents;
    try {
      contents = readFileSync(path.join(ROOT, file), 'utf8');
    } catch {
      continue; // Absent is normal.
    }
    for (const line of contents.split(/\r?\n/)) {
      const match = /^\s*(?:export\s+)?(SITE_URL|VITE_SITE_URL)\s*=\s*(.*)$/.exec(line);
      if (!match) continue;
      const value = match[2].trim().replace(/^(['"])(.*)\1$/, '$2');
      if (value) return value;
    }
  }
  return '';
}

/** Every indexable route, with a priority reflecting how central it is. */
const ROUTES = [
  { path: '/', priority: '1.0', changefreq: 'monthly' },
  { path: '/about', priority: '0.8', changefreq: 'monthly' },
  { path: '/capabilities', priority: '0.8', changefreq: 'monthly' },
  { path: '/products', priority: '0.7', changefreq: 'monthly' },
  { path: '/products/sadhya', priority: '0.7', changefreq: 'monthly' },
  { path: '/contact', priority: '0.6', changefreq: 'yearly' },
  { path: '/company', priority: '0.4', changefreq: 'yearly' },
  { path: '/privacy', priority: '0.2', changefreq: 'yearly' },
  { path: '/terms', priority: '0.2', changefreq: 'yearly' },
];

const raw = resolveSiteUrl();

if (!raw) {
  console.warn(
    '\n[techloom] SITE_URL is not set — dist/robots.txt and dist/sitemap.xml were not written.\n' +
      '           Production deploy: SITE_URL=https://your-domain npm run build\n'
  );
  process.exit(0);
}

const origin = raw.replace(/\/+$/, '');
const today = new Date().toISOString().slice(0, 10);

const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${ROUTES.map(
  (route) => `  <url>
    <loc>${origin}${route.path}</loc>
    <lastmod>${today}</lastmod>
    <changefreq>${route.changefreq}</changefreq>
    <priority>${route.priority}</priority>
  </url>`
).join('\n')}
</urlset>
`;

const robots = `User-agent: *
Allow: /

Sitemap: ${origin}/sitemap.xml
`;

await writeFile(path.join(DIST, 'sitemap.xml'), sitemap, 'utf8');
await writeFile(path.join(DIST, 'robots.txt'), robots, 'utf8');

console.log(`[techloom] Wrote dist/sitemap.xml (${ROUTES.length} routes) and dist/robots.txt for ${origin}`);
