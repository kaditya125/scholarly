import { Link } from 'react-router-dom';
import { ArrowUpRight, BookOpen, Github, Globe, Linkedin, Mail, ShieldCheck, Sparkles, UserRound } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import SiteHeader from '../components/landing/SiteHeader';
import SkyAmbience from '../components/landing/sky';
import SiteFooter from '../components/landing/SiteFooter';
import { SITE, type SocialIcon } from '../lib/siteConfig';
import { useSeo } from '../lib/useSeo';
import { Underline } from '../components/landing/Annotate';
import { BRAND_PATHS } from '../components/brand/brandPaths';

/**
 * /social — Sadhya's official channels.
 *
 * WHAT THIS PAGE USED TO BE, AND WHY IT ISN'T ANY MORE
 * It rendered mock feeds for X, LinkedIn, Instagram, Facebook, YouTube and GitHub accounts under
 * @sadhyalearn — with follower counts, likes, video views and repository stars. On 16 Sep 2026 every one of
 * those accounts was checked while logged out and none of them existed; the numbers were invented. A page that
 * verifiers are sent to from the footer cannot show activity that did not happen, so it lists only channels
 * that are real and run by Sadhya — the social rows come straight from SITE.social.
 *
 * THE RULE: a channel appears here only once it is live, is run by Sadhya, and links back to sadhya.app.
 * Counts, posts and previews of third-party feeds are never hard-coded.
 * Old /social?tab=… links still land here; the parameter is simply ignored.
 */

interface Channel {
  name: string;
  handle: string;
  body: string;
  href: string;
  cta: string;
  /** A lucide icon, or a brand glyph for social networks. */
  icon?: LucideIcon;
  brand?: SocialIcon;
  /** Internal routes use the router; everything else opens in a new tab. */
  internal?: boolean;
  /** Spans the full grid width. */
  wide?: boolean;
}

/** What each network is for, in words that promise no particular volume or kind of posting. */
const SOCIAL_BODY: Partial<Record<SocialIcon, string>> = {
  linkedin: 'Company updates from Sadhya. LinkedIn may ask you to sign in before it shows the page.',
  x: 'Announcements and short updates from Sadhya.',
  instagram: 'Posts and updates from Sadhya.',
  facebook: 'The Sadhya Page — announcements and updates.',
};

const CHANNELS: Channel[] = [
  {
    icon: Globe,
    name: 'Website',
    handle: SITE.domain,
    body: 'The product itself — the AI tutor, practice tests and notebooks — along with pricing, policies and how to reach us.',
    href: '/',
    internal: true,
    cta: 'Open sadhya.app',
    wide: true,
  },
  ...SITE.social.map((s) => ({
    brand: s.icon,
    name: s.name,
    handle: s.handle,
    body: SOCIAL_BODY[s.icon] ?? `Sadhya on ${s.name}.`,
    href: s.href,
    cta: `Open ${s.name}`,
  })),
  {
    icon: Mail,
    name: 'Email',
    handle: SITE.email.support,
    body: `Accounts, payments and anything that isn't working. Security reports go to ${SITE.email.security}.`,
    href: `mailto:${SITE.email.support}`,
    cta: 'Write to support',
  },
  {
    icon: BookOpen,
    name: 'Engineering blog',
    handle: `${SITE.domain}/blog`,
    body: 'How Sadhya is built: the retrieval pipeline, where syllabus data comes from, and how voice mode works.',
    href: '/blog',
    internal: true,
    cta: 'Read the blog',
  },
];

const CARD =
  'rounded-2xl border border-slate-200 dark:border-white/10 bg-white dark:bg-white/[0.03] p-6 sm:p-7 shadow-xs';

const DESCRIPTION = `Where to find ${SITE.name}: the website, LinkedIn, X, Instagram and Facebook, support email, and the founder's public profiles. These are the only channels ${SITE.name} runs.`;

function ChannelIcon({ channel }: { channel: Channel }) {
  if (channel.brand) {
    return (
      <svg viewBox="0 0 24 24" className="w-[18px] h-[18px] text-slate-700 dark:text-gray-200" fill="currentColor" aria-hidden>
        <path d={BRAND_PATHS[channel.brand]} />
      </svg>
    );
  }
  const Icon = channel.icon ?? Globe;
  return <Icon className="w-5 h-5 text-slate-700 dark:text-gray-200" strokeWidth={1.9} aria-hidden />;
}

function ChannelLink({ channel }: { channel: Channel }) {
  const className =
    'mt-5 inline-flex items-center gap-1.5 text-[13.5px] font-semibold text-slate-900 dark:text-white hover:text-[#5f7415] dark:hover:text-[#c8e558] transition-colors';
  if (channel.internal) {
    return (
      <Link to={channel.href} className={className}>
        {channel.cta}
        <ArrowUpRight className="w-4 h-4" strokeWidth={2} aria-hidden />
      </Link>
    );
  }
  const external = channel.href.startsWith('http');
  return (
    <a
      href={channel.href}
      {...(external ? { target: '_blank', rel: 'noopener noreferrer me' } : {})}
      className={className}
    >
      {channel.cta}
      <ArrowUpRight className="w-4 h-4" strokeWidth={2} aria-hidden />
    </a>
  );
}

export default function SocialHub() {
  useSeo({ title: `Official channels — ${SITE.name}`, description: DESCRIPTION, url: `${SITE.url}/social` });

  const founderLinks = [
    { label: 'LinkedIn', href: SITE.founder.linkedin, icon: Linkedin, external: true },
    { label: 'GitHub', href: SITE.founder.github, icon: Github, external: true },
    { label: SITE.founder.email, href: `mailto:${SITE.founder.email}`, icon: Mail, external: false },
  ];

  return (
    <div className="min-h-screen flex flex-col bg-white dark:bg-[#0b0b0c] text-slate-900 dark:text-gray-100 selection:bg-[#c8e558]/30">
      <SiteHeader />
      <SkyAmbience />

      <main className="relative z-10 flex-1">
        {/* ══ Hero ═══════════════════════════════════════════════════════════ */}
        <section className="border-b border-slate-100 dark:border-white/[0.07] bg-slate-50/70 dark:bg-white/[0.02]">
          <div className="max-w-[1160px] mx-auto px-5 sm:px-8 pt-14 sm:pt-20 pb-12 sm:pb-16 text-center">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-slate-200 dark:border-white/10 bg-white dark:bg-white/[0.04] text-[12.5px] font-semibold text-slate-700 dark:text-gray-200 mb-5 shadow-2xs">
              <Sparkles className="w-3.5 h-3.5 text-[#8ba32b] dark:text-[#c8e558]" aria-hidden />
              <span>Official channels</span>
            </div>

            <h1 className="text-[34px] sm:text-[48px] lg:text-[54px] font-semibold tracking-[-0.035em] leading-[1.08] max-w-[46rem] mx-auto">
              Where to find <Underline>Sadhya</Underline>.
            </h1>

            <p className="mt-4 text-[15px] sm:text-[17px] leading-relaxed text-slate-500 dark:text-gray-400 max-w-[40rem] mx-auto">
              These are the only channels Sadhya runs. An account elsewhere using the Sadhya name that isn&rsquo;t
              listed here is not ours.
            </p>
          </div>
        </section>

        {/* ══ Channels ═══════════════════════════════════════════════════════ */}
        <section className="max-w-[1160px] mx-auto px-5 sm:px-8 py-12 sm:py-16">
          <div className="grid sm:grid-cols-2 gap-5">
            {CHANNELS.map((c) => (
              <div key={c.name} className={`${CARD}${c.wide ? ' sm:col-span-2' : ''}`}>
                <div className="flex items-center gap-3">
                  <div className="w-11 h-11 rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-white/[0.04] flex items-center justify-center">
                    <ChannelIcon channel={c} />
                  </div>
                  <div className="min-w-0">
                    <h2 className="text-[16px] font-semibold text-slate-900 dark:text-white">{c.name}</h2>
                    <p className="text-[13px] text-slate-500 dark:text-gray-400 truncate">{c.handle}</p>
                  </div>
                </div>
                <p className="mt-4 text-[14px] leading-relaxed text-slate-600 dark:text-gray-300">{c.body}</p>
                <ChannelLink channel={c} />
              </div>
            ))}
          </div>

          {/* ══ The founder ════════════════════════════════════════════════════ */}
          <div className={`${CARD} mt-5`}>
            <p className="text-[11px] font-bold uppercase tracking-[0.1em] text-slate-400 dark:text-slate-500">The founder</p>
            <div className="mt-3 flex flex-col sm:flex-row sm:items-center gap-5">
              <div className="flex items-center gap-3 sm:min-w-[260px]">
                <div className="w-11 h-11 rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-white/[0.04] flex items-center justify-center">
                  <UserRound className="w-5 h-5 text-slate-700 dark:text-gray-200" strokeWidth={1.9} aria-hidden />
                </div>
                <div>
                  <h2 className="text-[16px] font-semibold text-slate-900 dark:text-white">{SITE.founder.name}</h2>
                  <p className="text-[13px] text-slate-500 dark:text-gray-400">
                    {SITE.founder.role}, {SITE.name}
                  </p>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2 sm:ml-auto">
                {founderLinks.map((l) => (
                  <a
                    key={l.label}
                    href={l.href}
                    {...(l.external ? { target: '_blank', rel: 'noopener noreferrer me' } : {})}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-white/10 text-[12.5px] font-medium text-slate-700 dark:text-gray-300 hover:text-slate-900 dark:hover:text-white hover:border-slate-300 dark:hover:border-white/20 transition-colors"
                  >
                    <l.icon className="w-4 h-4" strokeWidth={1.9} aria-hidden />
                    <span>{l.label}</span>
                  </a>
                ))}
                <Link
                  to="/our-team"
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#c8e558] hover:bg-[#bcd94c] text-slate-900 text-[12.5px] font-semibold transition-colors"
                >
                  Meet the founder
                  <ArrowUpRight className="w-4 h-4" strokeWidth={2} aria-hidden />
                </Link>
              </div>
            </div>
          </div>

          {/* ══ What isn't here ════════════════════════════════════════════════ */}
          <div className="mt-5 rounded-2xl border border-dashed border-slate-300 dark:border-white/15 p-6 sm:p-7 flex items-start gap-3">
            <ShieldCheck className="w-5 h-5 mt-0.5 shrink-0 text-[#8ba32b] dark:text-[#c8e558]" strokeWidth={1.9} aria-hidden />
            <p className="text-[14px] leading-relaxed text-slate-600 dark:text-gray-300">
              Sadhya doesn&rsquo;t run a YouTube channel yet. When it does, it will be listed on this page first. If you
              come across an account using our name that isn&rsquo;t listed here, tell us at{' '}
              <a
                href={`mailto:${SITE.email.security}`}
                className="font-semibold text-slate-900 dark:text-white underline decoration-[#c8e558] underline-offset-2"
              >
                {SITE.email.security}
              </a>
              .
            </p>
          </div>
        </section>
      </main>

      <SiteFooter />
    </div>
  );
}
