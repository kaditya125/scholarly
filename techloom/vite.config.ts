import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';
import { defineConfig, loadEnv, type HtmlTagDescriptor, type Plugin } from 'vite';

/**
 * Absolute-URL SEO metadata.
 *
 * Canonical links, `og:url`, `og:image` and the Organization JSON-LD all need the
 * origin the site is actually served from, and there is no safe default for that —
 * a canonical tag pointing at a domain we guessed is worse than shipping none,
 * because it tells search engines the real page is a duplicate of a page that does
 * not exist.
 *
 * So the origin comes from SITE_URL (or VITE_SITE_URL) at build time. When it is
 * absent the build still succeeds, the tags are simply omitted, and the console
 * says so. Everything domain-independent — title, description, OG title/description
 * — is in index.html and always ships.
 */
function seoMeta(siteUrl: string): Plugin {
  return {
    name: 'techloom-seo-meta',
    transformIndexHtml: {
      order: 'post',
      handler() {
        if (!siteUrl) {
          console.warn(
            '\n[techloom] SITE_URL is not set — canonical, og:url, og:image and the\n' +
              '           Organization JSON-LD were left out of index.html.\n' +
              '           Set it before a production deploy: SITE_URL=https://example.com npm run build\n'
          );
          return [];
        }

        const origin = siteUrl.replace(/\/+$/, '');

        /* Only facts that are verifiable from the company's own registration go in
           here. No employee count, no founding story, no aggregate rating. */
        const organization = {
          '@context': 'https://schema.org',
          '@type': 'Organization',
          name: 'TechLoom Innovations',
          url: `${origin}/`,
          logo: `${origin}/icon-512.png`,
          description:
            'TechLoom Innovations is a technology and digital solutions company building practical software, digital products and technology experiences.',
          foundingDate: '2024-06-30',
          address: { '@type': 'PostalAddress', addressCountry: 'IN' },
          owns: {
            '@type': 'Product',
            name: 'Sadhya',
            url: 'https://sadhya.app',
            description:
              'A digital learning platform exploring how AI can make learning more personalised, interactive and accessible.',
          },
        };

        const tags: HtmlTagDescriptor[] = [
          { tag: 'link', attrs: { rel: 'canonical', href: `${origin}/` }, injectTo: 'head' },
          {
            tag: 'meta',
            attrs: { property: 'og:url', content: `${origin}/` },
            injectTo: 'head',
          },
          {
            tag: 'meta',
            attrs: { property: 'og:image', content: `${origin}/og.png` },
            injectTo: 'head',
          },
          {
            tag: 'meta',
            attrs: { name: 'twitter:image', content: `${origin}/og.png` },
            injectTo: 'head',
          },
          {
            tag: 'script',
            attrs: { type: 'application/ld+json' },
            children: JSON.stringify(organization),
            injectTo: 'head',
          },
        ];

        return tags;
      },
    },
  };
}

/**
 * TechLoom Innovations — corporate site.
 *
 * Deliberately a separate Vite app from `frontend/` (the Sadhya product SPA) rather
 * than a route inside it. Two reasons:
 *
 *  1. Brand. TechLoom is the parent company and reads as neutral and corporate;
 *     Sadhya is a product with its own, more expressive identity. Sharing a bundle
 *     would mean sharing a design system, a theme root and a favicon.
 *  2. Weight. The Sadhya app ships auth, Firebase, KaTeX, charts and a router with
 *     ~90 lazy routes. A corporate site that must load fast on a first visit has no
 *     business carrying any of that, so this app's dependency list is three packages.
 */
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const siteUrl = env.SITE_URL || env.VITE_SITE_URL || '';

  return {
    plugins: [react(), tailwindcss(), seoMeta(siteUrl)],
    resolve: {
      alias: { '@': path.resolve(__dirname, './src') },
    },
    define: {
      /* Mirrored to the client so useSeo() can emit per-route canonicals with the
         same origin the build used. */
      __SITE_URL__: JSON.stringify(siteUrl),
    },
    build: {
      target: 'es2020',
      cssMinify: true,
      sourcemap: false,
      // React and the router are the only vendor code here; splitting them out lets
      // the (much smaller, more frequently edited) app chunk be re-fetched alone.
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (id.includes('node_modules')) return 'vendor';
          },
        },
      },
    },
  };
});
