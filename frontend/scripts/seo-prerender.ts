/**
 * Post-build step: give every public route its own HTML file with its own head tags.
 *
 * Run after `vite build`, against dist/. For each route in scripts/seo-routes.ts it copies
 * the built index.html — hashed asset URLs and all — and rewrites nine head tags:
 *
 *     <title>, meta description, link rel=canonical,
 *     og:url, og:title, og:description, og:type,
 *     twitter:title, twitter:description
 *
 * The body is untouched. This is not server-side rendering and does not pretend to be: React
 * still boots and paints the page. What changes is that the bytes nginx sends for /pricing now
 * say they are /pricing, which is the only part Search and link unfurlers read before any
 * script runs.
 *
 * WHY FILES AND NOT A SERVER: nginx already resolves unmatched paths against the filesystem, so
 * a file at dist/pricing/index.html can be served for /pricing while anything not prerendered
 * still falls through to the SPA shell exactly as before. Nothing about the deploy loop changes
 * — this runs inside `npm run build`.
 *
 * IT DOES NEED ONE NGINX DIRECTIVE. `try_files $uri $uri/ /index.html` is not enough: /pricing
 * fails the file test, passes the directory test, and nginx 301s to /pricing/ — which is not the
 * URL in the sitemap or in the page's own canonical. `$uri/index.html` has to come before `$uri/`
 * so the file is served at the slash-less URL with a 200. Full reasoning, the measurement it is
 * based on, and the apply/rollback commands are in deploy/nginx-seo.md. Until that directive is
 * live, these files are built but never reached.
 *
 * The fall-through is also the safety net: an unknown or app-only URL still receives the shell,
 * which canonicalises to the home page. That is the right answer for junk URLs. It is the WRONG
 * answer for a real public page, so any new public route must be added to scripts/seo-routes.ts
 * or it will quietly tell Google it is the home page — which is the bug this file exists to fix.
 *
 * Regenerates dist/sitemap.xml from the same table, so the sitemap cannot drift from what the
 * pages actually claim. public/sitemap.xml was deleted when this landed; this is its successor.
 */

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { SEO_ROUTES, assertRoutesAreSane, canonicalFor, type SeoRoute } from './seo-routes';
import { SITE } from '../src/lib/siteConfig';

const DIST = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'dist');

/** Escapes a value for use inside a double-quoted HTML attribute. */
function attr(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Escapes text content between tags (<title>, sitemap <loc>). */
function text(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/**
 * Replaces exactly one match, and throws if the pattern is not found.
 *
 * Deliberately loud. A silent no-op here ships a page whose canonical still points at the home
 * page, which looks fine in the browser and is invisible until Search Console reports it weeks
 * later. If someone edits index.html and drops one of these tags, the build should stop.
 */
function replaceOnce(html: string, pattern: RegExp, replacement: string, what: string): string {
  const matches = html.match(new RegExp(pattern.source, pattern.flags.replace('g', '') + 'g'));
  if (!matches || matches.length === 0) {
    throw new Error(`index.html has no ${what} tag to rewrite — SEO prerender cannot continue.`);
  }
  if (matches.length > 1) {
    throw new Error(`index.html has ${matches.length} ${what} tags; expected exactly one.`);
  }
  return html.replace(pattern, () => replacement);
}

function renderRoute(template: string, route: SeoRoute): string {
  const canonical = canonicalFor(route);
  const title = route.title;
  const description = route.description;
  const type = route.type ?? 'website';

  let html = template;
  html = replaceOnce(html, /<title>[\s\S]*?<\/title>/, `<title>${text(title)}</title>`, '<title>');
  html = replaceOnce(
    html,
    /<meta name="description" content="[^"]*"\s*\/?>/,
    `<meta name="description" content="${attr(description)}" />`,
    'meta description',
  );
  html = replaceOnce(
    html,
    /<link rel="canonical" href="[^"]*"\s*\/?>/,
    `<link rel="canonical" href="${attr(canonical)}" />`,
    'rel=canonical',
  );
  html = replaceOnce(
    html,
    /<meta property="og:url" content="[^"]*"\s*\/?>/,
    `<meta property="og:url" content="${attr(canonical)}" />`,
    'og:url',
  );
  html = replaceOnce(
    html,
    /<meta property="og:title" content="[^"]*"\s*\/?>/,
    `<meta property="og:title" content="${attr(title)}" />`,
    'og:title',
  );
  html = replaceOnce(
    html,
    /<meta property="og:description" content="[^"]*"\s*\/?>/,
    `<meta property="og:description" content="${attr(description)}" />`,
    'og:description',
  );
  html = replaceOnce(
    html,
    /<meta property="og:type" content="[^"]*"\s*\/?>/,
    `<meta property="og:type" content="${attr(type)}" />`,
    'og:type',
  );
  html = replaceOnce(
    html,
    /<meta name="twitter:title" content="[^"]*"\s*\/?>/,
    `<meta name="twitter:title" content="${attr(title)}" />`,
    'twitter:title',
  );
  html = replaceOnce(
    html,
    /<meta name="twitter:description" content="[^"]*"\s*\/?>/,
    `<meta name="twitter:description" content="${attr(description)}" />`,
    'twitter:description',
  );
  return html;
}

/** dist/pricing/index.html for /pricing; dist/index.html for /. */
function outputPathFor(route: SeoRoute): string {
  return route.path === '/'
    ? join(DIST, 'index.html')
    : join(DIST, ...route.path.replace(/^\//, '').split('/'), 'index.html');
}

function buildSitemap(): string {
  // Two decimals, not one: toFixed(1) rounds 0.85 down to "0.8", which silently demoted every
  // second-tier exam hub the first time this ran.
  const entries = SEO_ROUTES.filter((r) => r.inSitemap !== false)
    .map((route) => {
      const loc = text(canonicalFor(route));
      return `  <url><loc>${loc}</loc><lastmod>${route.lastmod}</lastmod><changefreq>${route.changefreq}</changefreq><priority>${route.priority.toFixed(2)}</priority></url>`;
    })
    .join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<!-- Generated by scripts/seo-prerender.ts from scripts/seo-routes.ts. Do not edit by hand. -->
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${entries}
</urlset>
`;
}

function main(): void {
  assertRoutesAreSane();

  const templatePath = join(DIST, 'index.html');
  let template: string;
  try {
    template = readFileSync(templatePath, 'utf8');
  } catch {
    throw new Error(`No built shell at ${templatePath}. Run vite build before this script.`);
  }

  // Render every route from the ORIGINAL template. '/' overwrites dist/index.html last-ish, so
  // reading it up front is what keeps one route's tags out of the next route's file.
  const rendered = SEO_ROUTES.map((route) => ({ route, html: renderRoute(template, route) }));

  for (const { route, html } of rendered) {
    const out = outputPathFor(route);
    mkdirSync(dirname(out), { recursive: true });
    writeFileSync(out, html, 'utf8');
  }

  writeFileSync(join(DIST, 'sitemap.xml'), buildSitemap(), 'utf8');

  const inSitemap = SEO_ROUTES.filter((r) => r.inSitemap !== false).length;
  const aliases = SEO_ROUTES.length - inSitemap;
  console.log(
    `[seo] ${SEO_ROUTES.length} routes prerendered (${inSitemap} in sitemap, ${aliases} canonical alias${aliases === 1 ? '' : 'es'}) → ${SITE.url}/sitemap.xml`,
  );
}

main();
