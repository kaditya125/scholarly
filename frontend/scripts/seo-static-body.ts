/**
 * The page body a visitor receives BEFORE JavaScript runs — one per public route.
 *
 * WHY: until 16 Sep 2026 every prerendered file carried index.html's home-page hero as its body, so the raw
 * HTML of /our-team, /about and /contact said "Ask anything from your syllabus" and nothing about who builds
 * Sadhya. Google for Startups declined the application for "Lack of Operational Transparency … authentic founder
 * and core team information that is fully verifiable via active, third-party public links directly on the
 * domain". Anything that reads HTML without executing scripts — compliance crawlers, link unfurlers, some
 * search passes — saw no founder, no team page content and no third-party links at all.
 *
 * WHAT THIS IS: static, semantic HTML for the same page, built from the same data the React pages render
 * (SITE, FOUNDER, the About copy, the exam catalogue, the blog). createRoot() in main.tsx replaces it when the
 * app mounts, so users see the real page moments later; nothing is shown to crawlers that people are not shown.
 * Every route also carries a static footer with the operator, the founder and his profile links.
 *
 * RULE: this file may only restate facts the site already publishes. No counts, no claims, no copy that the
 * rendered page does not also carry.
 */
import {
  SITE,
  formatAddress,
  PRO_MONTHLY_INR,
  PRO_REGULAR_MONTHLY_INR,
  PRO_YEARLY_PER_MONTH_INR,
  PRO_YEARLY_TOTAL_INR,
} from '../src/lib/siteConfig';
import { FOUNDER, TEAM, ADVISORS, BUILDING, BUILD_STATUS_LABEL } from '../src/components/landing/founderPageData';
import { ABOUT_HEADLINE, ABOUT_INTRO, ABOUT_PRINCIPLES } from '../src/content/aboutContent';
import { EXAM_CATALOG } from '../src/lib/examCatalog';
import { BLOG_POSTS } from '../src/content/blogPosts';
import type { SeoRoute } from './seo-routes';

/* ── HTML helpers ─────────────────────────────────────────────────────────────────────────── */

export function esc(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

const COLOR = { text: '#ffffff', muted: '#94a3b8', soft: '#cbd5e1', accent: '#c8e558', line: 'rgba(255,255,255,0.1)' };
const WRAP = 'max-width:1160px;margin:0 auto;padding-left:20px;padding-right:20px;box-sizing:border-box;';
const LINK = `color:${COLOR.text};text-decoration:underline;text-decoration-color:${COLOR.accent};text-underline-offset:3px;`;
const H1 = `font-size:clamp(32px,6vw,52px);font-weight:600;line-height:1.08;letter-spacing:-0.03em;color:${COLOR.text};margin:6px 0 16px;`;
const H2 = `font-size:24px;font-weight:600;letter-spacing:-0.02em;color:${COLOR.text};margin:40px 0 12px;`;
const H3 = `font-size:17px;font-weight:600;color:${COLOR.text};margin:22px 0 6px;`;
const P = `font-size:16px;line-height:1.65;color:${COLOR.muted};margin:0 0 14px;max-width:44rem;`;
const EYEBROW = `font-size:12px;font-weight:600;letter-spacing:0.13em;text-transform:uppercase;color:${COLOR.muted};margin:0;`;
const LIST = `font-size:16px;line-height:1.65;color:${COLOR.muted};margin:0 0 14px;padding-left:20px;max-width:44rem;`;

function a(href: string, label: string, opts: { external?: boolean; me?: boolean } = {}): string {
  const rel = opts.external ? ` rel="noopener noreferrer${opts.me ? ' me' : ''}"` : '';
  return `<a href="${esc(href)}"${rel} style="${LINK}">${esc(label)}</a>`;
}
const p = (html: string) => `<p style="${P}">${html}</p>`;
const h2 = (t: string, id?: string) => `<h2${id ? ` id="${esc(id)}"` : ''} style="${H2}">${esc(t)}</h2>`;
const h3 = (t: string) => `<h3 style="${H3}">${esc(t)}</h3>`;
/** An h3 whose content is already HTML (a link). */
const h3Html = (html: string) => `<h3 style="${H3}">${html}</h3>`;
const ul = (items: string[]) => `<ul style="${LIST}">${items.map((i) => `<li>${i}</li>`).join('')}</ul>`;

const LOGO =
  '<svg width="24" height="24" viewBox="0 0 32 32" fill="none" aria-hidden="true"><rect width="32" height="32" rx="8" fill="#c8e558"/><path d="M9 16.5L13.5 21L23 11" stroke="#0f172a" stroke-width="2.75" stroke-linecap="round" stroke-linejoin="round"/></svg>';

const founderProfileLinks = () =>
  [
    a(SITE.founder.linkedin, 'LinkedIn', { external: true, me: true }),
    a(SITE.founder.github, 'GitHub', { external: true, me: true }),
    a(`mailto:${SITE.founder.email}`, SITE.founder.email),
  ].join(' · ');

/* ── Shared chrome ────────────────────────────────────────────────────────────────────────── */

function header(): string {
  const nav = [
    ['/how-it-works', 'How it works'],
    ['/pricing', 'Pricing'],
    ['/about', 'About'],
    ['/our-team', 'Our team'],
    ['/contact', 'Contact'],
    ['/signin', 'Sign in'],
  ]
    .map(([href, label]) => `<a href="${href}" style="color:${COLOR.soft};text-decoration:none;">${label}</a>`)
    .join('');
  return (
    `<header style="${WRAP}padding-top:16px;padding-bottom:16px;display:flex;flex-wrap:wrap;gap:12px;align-items:center;justify-content:space-between;">` +
    `<a href="/" style="display:flex;align-items:center;gap:8px;font-size:18px;font-weight:700;letter-spacing:-0.02em;color:${COLOR.text};text-decoration:none;">${LOGO}<span>${esc(SITE.name)}</span></a>` +
    `<nav aria-label="Main" style="display:flex;flex-wrap:wrap;align-items:center;gap:16px;font-size:13.5px;font-weight:600;">${nav}` +
    `<a href="/signup" style="color:#141416;background:${COLOR.accent};padding:7px 16px;border-radius:10px;text-decoration:none;">Get started</a></nav>` +
    `</header>`
  );
}

function footer(): string {
  const links = [
    ['/about', 'About'],
    ['/our-team', 'Our team'],
    ['/social', 'Official channels'],
    ['/contact', 'Contact'],
    ['/pricing', 'Pricing'],
    ['/how-it-works', 'How it works'],
    ['/blog', 'Blog'],
    ['/help', 'Help'],
    ['/terms', 'Terms of Service'],
    ['/privacy', 'Privacy Policy'],
    ['/refunds', 'Refunds & Cancellation'],
    ['/policies', 'Platform Policies'],
    ['/security', 'Security'],
  ]
    .map(([href, label]) => `<a href="${href}" style="color:${COLOR.soft};text-decoration:none;">${esc(label)}</a>`)
    .join('');
  const company = SITE.social.map((s) => a(s.href, s.name, { external: true })).join(' · ');
  return (
    `<footer style="border-top:1px solid ${COLOR.line};margin-top:56px;">` +
    `<div style="${WRAP}padding-top:32px;padding-bottom:40px;font-size:14px;line-height:1.7;color:${COLOR.muted};">` +
    `<p style="margin:0 0 8px;"><strong style="color:${COLOR.text};">${esc(SITE.name)}</strong> — ${esc(SITE.descriptor)}</p>` +
    `<p style="margin:0 0 8px;">${esc(SITE.name)} is a product of ${esc(SITE.parentBrand)}, operated by ${esc(SITE.legalEntity)}${SITE.udyam ? ` · Udyam ${esc(SITE.udyam)}` : ''}.</p>` +
    `<p style="margin:0 0 8px;">Founded by ${a('/our-team', SITE.founder.name)}, ${esc(SITE.founder.role)} · ${founderProfileLinks()}</p>` +
    `<p style="margin:0 0 8px;">Support: ${a(`mailto:${SITE.email.support}`, SITE.email.support)} · ${a(`tel:${SITE.phone.replace(/\s/g, '')}`, SITE.phone)} · Registered office: ${esc(formatAddress())}</p>` +
    (company ? `<p style="margin:0 0 8px;">${esc(SITE.name)} on ${company}</p>` : '') +
    `<nav aria-label="Footer" style="display:flex;flex-wrap:wrap;gap:8px 18px;margin:16px 0;">${links}</nav>` +
    `<p style="margin:0;">© ${esc(SITE.legalEntity)}. All rights reserved.</p>` +
    `</div></footer>`
  );
}

/* ── Page bodies ──────────────────────────────────────────────────────────────────────────── */

function homeMain(): string {
  const exams = EXAM_CATALOG.map((e) => `${a(`/exams/${e.slug}`, e.name)} — ${esc(e.fullName)}`);
  return [
    `<h1 style="${H1}">Ask anything from your syllabus.</h1>`,
    `<p style="font-family:'Caveat',cursive;font-size:20px;color:${COLOR.accent};margin:0 0 18px;">${esc(SITE.tagline)}</p>`,
    p(
      'An AI tutor built around your exam, your subjects and your level. It answers from the curriculum, shows you the sources it used, and lets you check every step it took to get there.',
    ),
    p(`${a('/signup', 'Start learning')} · ${a('/how-it-works', 'See how it works')}`),
    h2('What Sadhya does'),
    ul([
      '<strong>AI tutor</strong> — answers from your exam’s syllabus and shows the sources and reasoning behind each answer.',
      '<strong>Practice</strong> — AI-generated mock tests and previous-year questions.',
      '<strong>Notebooks</strong> — upload your own notes and PDFs and study from them.',
      '<strong>Voice and audio</strong> — realtime voice tutoring, and a podcast studio that turns a topic into a two-voice audio lesson.',
      '<strong>Progress</strong> — syllabus coverage, topic-level mastery and a study plan.',
    ]),
    h2('Exams covered'),
    ul(exams),
    h2('Pricing'),
    p(
      `A free tier at ₹0 with monthly usage limits. ${esc(SITE.name)} Pro at a launch price of ₹${PRO_MONTHLY_INR}/month, or ₹${PRO_YEARLY_TOTAL_INR.toLocaleString('en-IN')}/year (₹${PRO_YEARLY_PER_MONTH_INR}/month); the regular price is ₹${PRO_REGULAR_MONTHLY_INR}/month. Schools and coaching centres: custom per-seat pricing. ${a('/pricing', 'See pricing')}`,
    ),
    h2('Who builds Sadhya'),
    p(
      `${esc(SITE.name)} is built by ${a('/our-team', SITE.founder.name)}, its ${esc(SITE.founder.role.toLowerCase())}, and operated by ${esc(SITE.legalEntity)}. ${founderProfileLinks()}`,
    ),
  ].join('');
}

function ourTeamMain(): string {
  const photo = FOUNDER.photo
    ? `<img src="${esc(FOUNDER.photo)}" alt="${esc(`${FOUNDER.name}, founder of ${SITE.name}`)}" width="177" height="236" style="display:block;border-radius:14px;margin:8px 0 16px;max-width:100%;height:auto;" />`
    : '';
  const team = [...TEAM, ...ADVISORS];
  return [
    `<p style="${EYEBROW}">Our team</p>`,
    `<h1 style="${H1}">Meet the Founder</h1>`,
    `<section id="aditya-kumar">`,
    photo,
    `<h2 style="${H2}margin-top:8px;">${esc(FOUNDER.name)}</h2>`,
    p(`<strong style="color:${COLOR.soft};">${esc(FOUNDER.role)}, ${esc(SITE.name)}</strong>`),
    p(esc(FOUNDER.blurb)),
    p('Sadhya started with a simple idea: exam preparation should understand not only what students study, but what they actually know.'),
    p(`Public profiles: ${founderProfileLinks()}`),
    `</section>`,
    h2('What I’m building'),
    ul(BUILDING.map((b) => `<strong>${esc(b.title)}</strong> (${esc(BUILD_STATUS_LABEL[b.status])}) — ${esc(b.body)}`)),
    h2('The team'),
    team.length === 0
      ? p(`${esc(SITE.name)} is currently built independently by its founder. Team members and advisors will be listed on this page as they join.`)
      : ul(team.map((m) => `<strong>${esc(m.name)}</strong> — ${esc(m.role)}`)),
    p(`To reach the founder: ${a(`mailto:${SITE.founder.email}`, SITE.founder.email)}. For support: ${a(`mailto:${SITE.email.support}`, SITE.email.support)}.`),
  ].join('');
}

function aboutMain(): string {
  return [
    `<p style="${EYEBROW}">About</p>`,
    `<h1 style="${H1}">${esc(ABOUT_HEADLINE)}</h1>`,
    ...ABOUT_INTRO.map((t) => p(esc(t))),
    h2('What we hold to.'),
    ...ABOUT_PRINCIPLES.map((pr) => h3(pr.title) + p(esc(pr.body))),
    h2('Who builds Sadhya.'),
    p(
      `${esc(SITE.name)} was founded and is built by ${a('/our-team', SITE.founder.name)}, ${esc(SITE.founder.role)}. It is a product of ${esc(SITE.parentBrand)}, operated by ${esc(SITE.legalEntity)}${SITE.udyam ? ` (Udyam ${esc(SITE.udyam)})` : ''}, ${esc(SITE.address.city)}, ${esc(SITE.address.state)}, ${esc(SITE.address.country)}.`,
    ),
    p(founderProfileLinks()),
  ].join('');
}

function contactMain(): string {
  return [
    `<p style="${EYEBROW}">Contact</p>`,
    `<h1 style="${H1}">Talk to us</h1>`,
    p('A real person reads every one of these.'),
    ul([
      `<strong>Support</strong> — trouble with your account, a payment, or something that isn’t working: ${a(`mailto:${SITE.email.support}`, SITE.email.support)}`,
      `<strong>Schools &amp; institutions</strong> — bulk seats, teacher dashboards, custom curriculum and invoicing: ${a(`mailto:${SITE.email.sales}`, SITE.email.sales)}`,
      `<strong>Security</strong> — report a vulnerability or security concern: ${a(`mailto:${SITE.email.security}`, SITE.email.security)}`,
      `<strong>Privacy &amp; legal</strong> — data requests and Grievance Officer escalations: ${a(`mailto:${SITE.email.privacy}`, SITE.email.privacy)}`,
    ]),
    h2('Registered office'),
    p(`${esc(SITE.legalEntity)}<br />${esc(formatAddress(', '))}<br />${a(`tel:${SITE.phone.replace(/\s/g, '')}`, SITE.phone)} · ${esc(SITE.supportHours)}`),
    h2('Grievance Officer'),
    p(
      `As required by the Digital Personal Data Protection Act, 2023 and the Information Technology Act, 2000, you can escalate any complaint about your personal data to our Grievance Officer at ${a(`mailto:${SITE.email.privacy}`, SITE.email.privacy)}. We acknowledge complaints within 48 hours and aim to resolve them within 30 days.`,
    ),
    h2('The founder'),
    p(`${a('/our-team', SITE.founder.name)}, ${esc(SITE.founder.role)} · ${founderProfileLinks()}`),
  ].join('');
}

function pricingMain(): string {
  return [
    `<p style="${EYEBROW}">Plans</p>`,
    `<h1 style="${H1}">Pricing</h1>`,
    p('The tutor, your notebooks and the practice engine are free to use. Pro lifts the limits and adds the studio.'),
    ul([
      '<strong>Free Starter</strong> — ₹0, forever. Monthly usage limits; no card required.',
      `<strong>${esc(SITE.name)} Pro</strong> — launch price ₹${PRO_MONTHLY_INR}/month, or ₹${PRO_YEARLY_TOTAL_INR.toLocaleString('en-IN')} billed yearly (₹${PRO_YEARLY_PER_MONTH_INR}/month). Regular price ₹${PRO_REGULAR_MONTHLY_INR}/month.`,
      '<strong>Institution</strong> — custom per-seat pricing for schools, coaching centres and batch educators.',
    ]),
    p(`Payments are processed by Razorpay and billed by ${esc(SITE.legalEntity)}. ${a('/refunds', 'Refunds & cancellation')} · ${a('/terms', 'Terms of Service')}`),
  ].join('');
}

function socialMain(): string {
  return [
    `<p style="${EYEBROW}">Official channels</p>`,
    `<h1 style="${H1}">Where to find Sadhya.</h1>`,
    p('Sadhya is built by one founder, so the list is short. These are the only channels we run — an account elsewhere using the Sadhya name is not ours.'),
    ul([
      `<strong>Website</strong> — ${a('/', SITE.domain)}`,
      ...SITE.social.map((s) => `<strong>${esc(s.name)}</strong> — ${a(s.href, `${SITE.name} company page`, { external: true })}`),
      `<strong>Email</strong> — ${a(`mailto:${SITE.email.support}`, SITE.email.support)}`,
      `<strong>Engineering blog</strong> — ${a('/blog', `${SITE.domain}/blog`)}`,
    ]),
    h2('The founder'),
    p(`${a('/our-team', SITE.founder.name)}, ${esc(SITE.founder.role)} · ${founderProfileLinks()}`),
    p(`Sadhya doesn’t run official X, Instagram, Facebook or YouTube accounts yet. When it does, they will be listed on this page first. If you come across an account using our name, tell us at ${a(`mailto:${SITE.email.security}`, SITE.email.security)}.`),
  ].join('');
}

function blogIndexMain(route: SeoRoute): string {
  const posts = [...BLOG_POSTS].sort((x, y) => y.date.localeCompare(x.date));
  return [
    `<h1 style="${H1}">Engineering blog</h1>`,
    p(esc(route.description)),
    ...posts.map((post) => h3Html(a(`/blog/${post.slug}`, post.title)) + p(`${esc(post.date.slice(0, 10))} · ${esc(post.summary)}`)),
  ].join('');
}

function headingFor(route: SeoRoute): string {
  return route.title.replace(/\s+[—|]\s+Sadhya$/, '');
}

function genericMain(route: SeoRoute): string {
  const blog = route.path.startsWith('/blog/') ? BLOG_POSTS.find((b) => `/blog/${b.slug}` === route.path) : undefined;
  if (blog) {
    return [`<h1 style="${H1}">${esc(blog.title)}</h1>`, p(esc(blog.date.slice(0, 10))), p(esc(blog.summary)), p(a('/blog', 'All posts'))].join('');
  }
  const exam = route.path.startsWith('/exams/') ? EXAM_CATALOG.find((e) => `/exams/${e.slug}` === route.path) : undefined;
  if (exam) {
    return [
      `<p style="${EYEBROW}">${esc(exam.category)}</p>`,
      `<h1 style="${H1}">${esc(exam.name)} — ${esc(exam.fullName)}</h1>`,
      p(esc(exam.about)),
      p(`Conducted by ${esc(exam.conductedBy)}${exam.officialSite ? ` · Official site: ${a(exam.officialSite, exam.officialSite.replace(/^https?:\/\//, ''), { external: true })}` : ''}`),
      h2(`How ${SITE.name} helps with ${exam.name}`),
      ul(exam.howSadhyaHelps.map((x) => esc(x))),
    ].join('');
  }
  return [`<h1 style="${H1}">${esc(headingFor(route))}</h1>`, p(esc(route.description))].join('');
}

const MAINS: Record<string, (route: SeoRoute) => string> = {
  '/': homeMain,
  '/our-team': ourTeamMain,
  '/about': aboutMain,
  '/contact': contactMain,
  '/pricing': pricingMain,
  '/social': socialMain,
  '/community/social': socialMain,
  '/blog': blogIndexMain,
};

/** The full static body for a route: header, route-specific main, and the identity footer. */
export function renderStaticBody(route: SeoRoute): string {
  const main = (MAINS[route.path] ?? genericMain)(route);
  return (
    `<div style="min-height:100vh;background:#131314;color:${COLOR.text};font-family:Inter,system-ui,-apple-system,sans-serif;box-sizing:border-box;">` +
    header() +
    `<main style="${WRAP}padding-top:24px;padding-bottom:24px;">${main}</main>` +
    footer() +
    `</div>`
  );
}
