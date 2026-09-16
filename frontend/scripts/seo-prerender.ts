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
import { renderStaticBody } from './seo-static-body';
import { EXAM_CATALOG } from '../src/lib/examCatalog';
import { hasWrittenDescription } from '../src/lib/examSeo';
import { SITE } from '../src/lib/siteConfig';

/**
 * dist/ by default. SEO_DIST points it at another build directory, so production can build into a
 * scratch directory and swap it in whole instead of emptying the directory nginx is serving from.
 */
const DIST = process.env.SEO_DIST
  ? resolve(process.env.SEO_DIST)
  : resolve(dirname(fileURLToPath(import.meta.url)), '..', 'dist');

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
  // The body, too: without this every route shipped index.html's home-page hero, so the raw HTML of /our-team
  // carried no founder at all. See scripts/seo-static-body.ts. The markers stay, which keeps a re-run idempotent.
  const bodyRegion = /(<!--\s*static-body:start[\s\S]*?-->)[\s\S]*?(<!--\s*static-body:end\s*-->)/;
  const markers = html.match(bodyRegion);
  if (!markers) throw new Error('index.html has no static-body:start/end markers — SEO prerender cannot continue.');
  // replaceOnce substitutes through a function, so $1/$2 would be inserted literally; build the string instead.
  html = replaceOnce(html, bodyRegion, `${markers[1]}\n${renderStaticBody(route)}\n      ${markers[2]}`, 'static-body marker');
  return html;
}

/**
 * What a verifier must be able to read in the raw HTML, checked on the files actually written.
 *
 * Google for Startups declined Sadhya on 16 Sep 2026 because founder information was not verifiable from the
 * domain. These fail the build rather than let that regress silently: the founder's name and role on /our-team,
 * his third-party profile links and the operator on every page, and structured data that agrees with SITE.
 */
function assertIdentity(route: SeoRoute, html: string): void {
  const fail = (what: string) => {
    throw new Error(`[seo] ${route.path}: raw HTML is missing ${what} — founder/company verification would regress.`);
  };
  const body = html.slice(html.indexOf('static-body:start'));
  for (const url of [SITE.founder.linkedin, SITE.founder.github]) {
    if (!body.includes(`href="${attr(url)}"`)) fail(`a link to ${url}`);
  }
  if (!body.includes('href="/our-team"')) fail('a link to /our-team');
  if (!body.includes(text(SITE.legalEntity))) fail(`the operator (${SITE.legalEntity})`);
  if (route.path === '/our-team') {
    if (!body.includes(`>${text(SITE.founder.name)}<`)) fail(`the founder's name as page text`);
    if (!body.includes(text(SITE.founder.role))) fail(`the founder's role`);
    if (!body.includes(`mailto:${SITE.founder.email}`)) fail(`the founder's email`);
  }
}

/** The JSON-LD in index.html is hand-written; this keeps it honest against SITE. */
function assertStructuredData(template: string): void {
  const match = template.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/);
  if (!match) throw new Error('[seo] index.html has no JSON-LD block.');
  const graph = JSON.parse(match[1]) as Record<string, any>[];
  const person = graph.find((n) => n['@type'] === 'Person');
  const org = graph.find((n) => n['@type'] === 'Organization');
  const same = (a: string[] = [], b: string[]) => a.length === b.length && a.every((x, i) => x === b[i]);
  if (!person || person.name !== SITE.founder.name || person.jobTitle !== SITE.founder.role) {
    throw new Error('[seo] JSON-LD Person does not match SITE.founder (name / jobTitle).');
  }
  if (!same(person.sameAs, [SITE.founder.linkedin, SITE.founder.github])) {
    throw new Error('[seo] JSON-LD Person.sameAs does not match SITE.founder profile links.');
  }
  const companyProfiles = SITE.social.map((s) => s.href);
  if (!org || !same(org.sameAs, companyProfiles)) {
    throw new Error('[seo] JSON-LD Organization.sameAs must list exactly SITE.social (profiles run by Sadhya).');
  }
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

  assertStructuredData(template);

  // Render every route from the ORIGINAL template. '/' overwrites dist/index.html last-ish, so
  // reading it up front is what keeps one route's tags out of the next route's file.
  const rendered = SEO_ROUTES.map((route) => ({ route, html: renderRoute(template, route) }));

  for (const { route, html } of rendered) {
    assertIdentity(route, html);
  }

  for (const { route, html } of rendered) {
    const out = outputPathFor(route);
    mkdirSync(dirname(out), { recursive: true });
    writeFileSync(out, html, 'utf8');
  }

  writeFileSync(join(DIST, 'sitemap.xml'), buildSitemap(), 'utf8');

  // A warning, not a failure: an exam without written copy still gets a serviceable generated
  // description, so this should not block adding one. It should just be impossible to forget.
  const unwritten = EXAM_CATALOG.filter((e) => !hasWrittenDescription(e.slug)).map((e) => e.slug);
  if (unwritten.length > 0) {
    console.warn(
      `[seo] ${unwritten.length} exam(s) have no written meta description and fell back to a` +
        ` generated one: ${unwritten.join(', ')}. Add a line to src/lib/examSeo.ts.`,
    );
  }

  const inSitemap = SEO_ROUTES.filter((r) => r.inSitemap !== false).length;
  const aliases = SEO_ROUTES.length - inSitemap;
  console.log(
    `[seo] ${SEO_ROUTES.length} routes prerendered (${inSitemap} in sitemap, ${aliases} canonical alias${aliases === 1 ? '' : 'es'}) → ${SITE.url}/sitemap.xml`,
  );
}

main();
