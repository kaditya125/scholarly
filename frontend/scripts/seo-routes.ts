/**
 * The one list of publicly indexable URLs, and the head tags each one must serve.
 *
 * ─────────────────────────────────────────────────────────────────────────────────────
 *  WHY THIS FILE EXISTS
 *
 *  Sadhya is a client-rendered SPA. nginx resolves every unmatched path with
 *  `try_files $uri $uri/ /index.html`, so before this file existed EVERY route — /pricing,
 *  /about, all 17 /exams/:slug hubs — was answered with one byte-identical index.html that
 *  declared:
 *
 *      <link rel="canonical" href="https://sadhya.app/" />
 *
 *  A canonical is a statement that "the real address of this page is X". Serving that one
 *  on every URL tells Google every page IS the home page. Google believed it: Search Console
 *  reported 40 URLs under "Alternative page with proper canonical tag" against 13 indexed —
 *  the pages were crawled, understood, and then deliberately folded into the home page.
 *
 *  useSeo() does rewrite the canonical, but only after React has run. Google explicitly
 *  advises against injecting rel=canonical with JavaScript: when the raw HTML and the
 *  rendered DOM disagree, the raw HTML is what gets trusted. Link unfurlers (WhatsApp,
 *  LinkedIn, X, Slack) never run scripts at all, so they only ever saw the home page too.
 *
 *  So the head tags have to be correct in the bytes nginx sends. scripts/seo-prerender.ts
 *  reads this table and stamps one static dist/<path>/index.html per route after vite build.
 *
 *  KEEP IN SYNC: these titles and descriptions mirror the useSeo() call in each page so the
 *  static head and the rendered head agree. If you change one, change the other — they are
 *  deliberately duplicated rather than shared, because this file must import cleanly in
 *  plain Node (no React, no DOM) and the pages must not import a build script.
 *
 *  Exam and blog routes are NOT listed by hand — they are derived from the same catalogues
 *  the app renders from, so a new exam or post cannot be missed.
 * ─────────────────────────────────────────────────────────────────────────────────────
 */

import { EXAM_CATALOG } from '../src/lib/examCatalog';
import { BLOG_POSTS } from '../src/content/blogPosts';
import { examMetaDescription } from '../src/lib/examSeo';
import { SITE, PRO_MONTHLY_INR } from '../src/lib/siteConfig';

export interface SeoRoute {
  /** Path as served, always leading-slash, never trailing-slash (except '/'). */
  path: string;
  title: string;
  description: string;
  /**
   * Absolute URL this page declares as its own address. Defaults to SITE.url + path.
   * Set explicitly only for alias routes that must point at their primary URL.
   */
  canonical?: string;
  /** og:type. 'website' unless the page is really something else. */
  type?: string;
  changefreq: 'weekly' | 'monthly' | 'yearly';
  priority: number;
  /**
   * Date the CONTENT last meaningfully changed — not the build date. Google discounts a
   * sitemap whose lastmod moves on every deploy, so this is written by hand and only bumped
   * when the page is actually revised.
   */
  lastmod: string;
  /**
   * false for alias URLs that render a primary page's content. They still get a prerendered
   * file (so the canonical they serve points at the primary), but advertising them in the
   * sitemap would be asking Google to index a URL we have just told it to ignore.
   */
  inSitemap?: boolean;
}

/** Marketing, legal and support pages. One entry per public route in App.tsx. */
const STATIC_ROUTES: SeoRoute[] = [
  {
    path: '/',
    // 121 characters, deliberately. This is the copy index.html has shipped since launch, and
    // it is the only description on the site written to fit inside the ~160 Google renders
    // before truncating. Landing.tsx's useSeo() was overriding it with a 237-character version
    // on every page load; both now say this. See the note at the foot of this file.
    title: `${SITE.name} — ${SITE.tagline}`,
    description:
      'AI-powered prep for UPSC, SSC CGL, JEE, NEET, BPSC. Every answer grounded in the official syllabus. No hallucinations.',
    changefreq: 'weekly',
    priority: 1.0,
    lastmod: '2026-08-29',
  },
  {
    path: '/pricing',
    title: `Pricing — ${SITE.name}`,
    description: `${SITE.name} pricing: a free tier to try the AI tutor, and Pro at ₹${PRO_MONTHLY_INR}/month for unlimited use across every exam we cover.`,
    changefreq: 'monthly',
    priority: 0.9,
    lastmod: '2026-08-29',
  },
  {
    path: '/how-it-works',
    title: `How It Works — ${SITE.name}`,
    description: `See how ${SITE.name}'s AI tutor works: photograph a question, get a step-by-step explanation, generate adaptive practice tests, and track progress against your exam's actual syllabus.`,
    changefreq: 'monthly',
    priority: 0.8,
    lastmod: '2026-08-29',
  },
  {
    // /demo renders HowItWorks. Same content, second address — so it points at the first one.
    path: '/demo',
    title: `How It Works — ${SITE.name}`,
    description: `See how ${SITE.name}'s AI tutor works: photograph a question, get a step-by-step explanation, generate adaptive practice tests, and track progress against your exam's actual syllabus.`,
    canonical: `${SITE.url}/how-it-works`,
    changefreq: 'monthly',
    priority: 0.8,
    lastmod: '2026-08-29',
    inSitemap: false,
  },
  {
    path: '/for-teachers',
    title: 'Sadhya for Teachers — AI-assisted preparation, with you in control',
    description:
      'Draft explanations, generate practice, index your own material and turn a chapter into audio — with sources shown and nothing reaching a student unless you decide it should.',
    changefreq: 'monthly',
    priority: 0.7,
    lastmod: '2026-08-29',
  },
  {
    path: '/about',
    title: `About — ${SITE.name}`,
    description: `${SITE.name} (साध्य) is Sanskrit for "that which is to be attained" — an AI-first learning platform built around India's competitive exams, from NEET and JEE to UPSC, SSC and state teaching exams.`,
    changefreq: 'monthly',
    priority: 0.6,
    lastmod: '2026-08-29',
  },
  {
    path: '/our-team',
    title: `Meet the Founder | ${SITE.name}`,
    description:
      'Sadhya is built by Aditya Kumar, its founder and product engineer. Why it exists: a connected learning system for competitive-exam preparation that tracks what a student has actually covered, where they are weak, and what to practise next — not just how long they studied.',
    type: 'profile',
    changefreq: 'monthly',
    priority: 0.6,
    lastmod: '2026-08-29',
  },
  {
    path: '/blog',
    title: 'Engineering blog — Sadhya',
    description:
      'How Sadhya is built: the retrieval pipeline, where syllabus data comes from, how voice mode works, and the constraints the product holds itself to.',
    changefreq: 'weekly',
    priority: 0.7,
    lastmod: '2026-08-29',
  },
  {
    // Help.tsx has no useSeo() call, so before this table it served the home page's title
    // and description verbatim — a duplicate as far as Search is concerned.
    path: '/help',
    title: `Help Centre — ${SITE.name}`,
    description: `Answers to common questions about ${SITE.name}: accounts and sign-in, subscriptions and billing, how the AI tutor sources its answers, practice tests, and how to reach support.`,
    changefreq: 'monthly',
    priority: 0.5,
    lastmod: '2026-08-29',
  },
  {
    // SocialHub.tsx likewise has no useSeo() call.
    path: '/social',
    title: `${SITE.name} on social — updates, walkthroughs and exam notes`,
    description: `Follow ${SITE.name} across X, LinkedIn, Instagram, YouTube and GitHub — product updates, feature walkthroughs, exam notifications and preparation notes, gathered in one place.`,
    changefreq: 'weekly',
    priority: 0.5,
    lastmod: '2026-08-29',
  },
  {
    path: '/community/social',
    title: `${SITE.name} on social — updates, walkthroughs and exam notes`,
    description: `Follow ${SITE.name} across X, LinkedIn, Instagram, YouTube and GitHub — product updates, feature walkthroughs, exam notifications and preparation notes, gathered in one place.`,
    canonical: `${SITE.url}/social`,
    changefreq: 'weekly',
    priority: 0.5,
    lastmod: '2026-08-29',
    inSitemap: false,
  },
  {
    path: '/contact',
    title: `Contact Us — ${SITE.name}`,
    description: `Get in touch with ${SITE.name} — support, sales, security, and general enquiries.`,
    changefreq: 'yearly',
    priority: 0.5,
    lastmod: '2026-08-01',
  },
  {
    path: '/referral-program',
    title: `Refer a Friend — ${SITE.name}`,
    description: `Invite friends to ${SITE.name} and earn rewards when they join — refer students preparing for the same exams you are.`,
    changefreq: 'monthly',
    priority: 0.5,
    lastmod: '2026-08-01',
  },

  /* Legal. Titles and intros mirror the <LegalPage title= intro=> props. */
  {
    path: '/terms',
    title: `Terms of Service — ${SITE.name}`,
    description: `The agreement between you and ${SITE.legalEntity} for the use of Sadhya. Please read it before you create an account or subscribe.`,
    changefreq: 'yearly',
    priority: 0.3,
    lastmod: '2026-08-01',
  },
  {
    path: '/privacy',
    title: `Privacy Policy — ${SITE.name}`,
    description:
      'What Sadhya collects, why we collect it, who processes it on our behalf, and the control you have over it.',
    changefreq: 'yearly',
    priority: 0.3,
    lastmod: '2026-08-01',
  },
  {
    path: '/refunds',
    title: `Refunds & Cancellation — ${SITE.name}`,
    description:
      'When you can cancel, when you can get your money back, how to trigger 1-click refunds, and how long it takes.',
    changefreq: 'yearly',
    priority: 0.3,
    lastmod: '2026-08-01',
  },
  {
    path: '/security',
    title: `Security — ${SITE.name}`,
    description:
      'How we protect your account, your documents and your payments — and how to tell us if you find a hole in it.',
    changefreq: 'yearly',
    priority: 0.3,
    lastmod: '2026-08-01',
  },
];

/**
 * Sitemap priority for the exam hubs, carried over from the hand-written sitemap this table
 * replaced. Only the exams we actually compete for sit above the default; everything else
 * takes DEFAULT_EXAM_PRIORITY, so adding an exam to the catalogue needs no edit here.
 *
 * Priority is a weak hint at best — Google has said for years that it largely ignores it. It is
 * preserved because losing the distinction would be a silent change, not because it earns traffic.
 */
const EXAM_PRIORITY: Record<string, number> = {
  'neet': 0.9,
  'jee-main': 0.9,
  'jee-advanced': 0.9,
  'upsc-cse': 0.9,
  'ssc-cgl': 0.9,
  'state-pscs': 0.75,
};
const DEFAULT_EXAM_PRIORITY = 0.85;

/**
 * One hub per exam, built from the catalogue the pages themselves render.
 * Mirrors the useSeo() call in src/pages/ExamLanding.tsx.
 */
const EXAM_ROUTES: SeoRoute[] = EXAM_CATALOG.map((exam) => ({
  path: `/exams/${exam.slug}`,
  title: `${exam.name} Exam Pattern, Syllabus & AI Preparation — ${exam.fullName} | ${SITE.name}`,
  // Written copy, one per exam, shared with ExamLanding.tsx so the two cannot diverge.
  description: examMetaDescription(exam),
  changefreq: 'monthly' as const,
  priority: EXAM_PRIORITY[exam.slug] ?? DEFAULT_EXAM_PRIORITY,
  lastmod: '2026-08-29',
}));

/**
 * Blog posts. These were never in the hand-written sitemap at all, so nine articles were
 * invisible to Search except through whatever links Google happened to follow.
 * Mirrors the useSeo() call in src/pages/BlogPost.tsx.
 */
const BLOG_ROUTES: SeoRoute[] = BLOG_POSTS.map((post) => ({
  path: `/blog/${post.slug}`,
  title: `${post.title} — ${SITE.name}`,
  description: post.summary,
  type: 'article',
  changefreq: 'yearly' as const,
  priority: 0.6,
  // A post's publication date is the honest lastmod; it is what actually changed.
  lastmod: post.date.slice(0, 10),
}));

export const SEO_ROUTES: SeoRoute[] = [...STATIC_ROUTES, ...EXAM_ROUTES, ...BLOG_ROUTES];

/** Fails the build rather than shipping two pages that claim the same address. */
export function assertRoutesAreSane(routes: SeoRoute[] = SEO_ROUTES): void {
  const seen = new Set<string>();
  for (const route of routes) {
    if (!route.path.startsWith('/')) throw new Error(`Route path must be absolute: ${route.path}`);
    if (route.path !== '/' && route.path.endsWith('/')) {
      throw new Error(`Route path must not end in a slash: ${route.path}`);
    }
    if (seen.has(route.path)) throw new Error(`Duplicate route in SEO table: ${route.path}`);
    seen.add(route.path);
  }

  // Two DIFFERENT paths declaring the same canonical is how the 40-page collapse happened.
  // Aliases are allowed to do it on purpose; anything else is the bug returning.
  const canonicals = new Map<string, string>();
  for (const route of routes) {
    if (route.canonical) continue; // deliberate alias
    const url = `${SITE.url}${route.path === '/' ? '/' : route.path}`;
    const owner = canonicals.get(url);
    if (owner) throw new Error(`Routes ${owner} and ${route.path} both claim canonical ${url}`);
    canonicals.set(url, route.path);
  }
}

/** The absolute URL a route declares as its own. */
export function canonicalFor(route: SeoRoute): string {
  return route.canonical ?? `${SITE.url}${route.path === '/' ? '/' : route.path}`;
}

/*
 * REMAINING LONG DESCRIPTIONS: 14 of the 43 routes above still run past the ~160 characters
 * Google renders before truncating — the marketing pages (/our-team worst at 272) and six of the
 * nine blog posts, whose descriptions are the post's own `summary` and are written to introduce
 * an article rather than to sit in a search result.
 *
 * The 17 exam hubs used to be the worst of this, at 240-270 each. They are now written copy in
 * src/lib/examSeo.ts and all land between 127 and 154.
 *
 * The rest are left deliberately. A long description is truncated in the result; it does not
 * cost the page its indexing, which is what the canonical bug was doing. Fixing them means
 * writing copy, page by page, and the blog ones mean deciding whether a post's summary should
 * serve two audiences or be split into two fields. Worth a pass of its own.
 */
