import { useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Mail, Phone, MapPin } from 'lucide-react';
import { SITE, formatAddress } from '../../lib/siteConfig';
import { LogoMark as Mark } from '../brand/Logo';
import { HandwrittenTagline } from '../brand/HandwrittenTagline';
import { BRAND_PATHS } from '../brand/brandPaths';

/**
 * The public site footer.
 *
 * Every link here resolves to a route that exists — there are no "#" placeholders and no
 * links to pages that were never built. Sections that would need pages we don't have
 * (careers, press, changelog, status) are simply absent rather than dead.
 *
 * The social row renders exactly what's configured in SITE.social, so deleting a handle
 * you don't own removes its icon instead of shipping a link to a 404.
 */

/* Brand glyphs live in components/brand/brandPaths.ts, shared with /social. */

const COLUMNS: { title: string; links: { label: string; href: string; external?: boolean }[] }[] = [
  {
    title: 'Product',
    links: [
      { label: 'AI Tutor', href: '/chat' },
      { label: 'Notebooks', href: '/notebooks' },
      { label: 'Podcast Studio', href: '/podcasts' },
      { label: 'Mock Tests', href: '/tests' },
      { label: 'Analytics', href: '/analytics' },
      { label: 'Refer & Earn', href: '/referral-program' },
      { label: 'Pricing', href: '/pricing' },
    ],
  },
  {
    title: 'Who it’s for',
    links: [
      { label: 'Students', href: '/signup' },
      { label: 'Teachers', href: '/for-teachers' },
      { label: 'Institutions', href: '/contact' },
      { label: 'Study groups', href: '/groups' },
    ],
  },
  {
    title: 'Company',
    links: [
      { label: 'About', href: '/about' },
      /* Labelled "Our Team" while the page itself is headed "Meet the Founder", so the
         link survives Sadhya growing past one builder. See pages/OurTeam.tsx. */
      { label: 'Our Team', href: '/our-team' },
      { label: 'Official Channels', href: '/social' },
      { label: 'Blog', href: '/blog' },
      { label: 'Contact', href: '/contact' },
      { label: 'Security', href: '/security' },
      { label: 'Help & Queries', href: '/help' },
    ],
  },
  {
    title: 'Legal',
    links: [
      { label: 'Terms of Service', href: '/terms' },
      { label: 'Privacy Policy', href: '/privacy' },
      { label: 'Refunds & Cancellation', href: '/refunds' },
      { label: 'Platform Policies', href: '/policies' },
      { label: 'Security', href: '/security' },
    ],
  },
];

/**
 * Discreet administrative entry point (§31).
 *
 * The copyright year. Three clicks inside two seconds opens /admin/login.
 *
 * WHY THIS SHAPE. The requirement is an entry that operators can reach but that is not
 * advertised to students, so:
 *   - it renders as a <span>, not a link. There is no href, so it does not appear in the
 *     DOM as a navigable target, is not followed by crawlers, and does not show in
 *     "copy link" or link-preview tooling.
 *   - it carries no hover, cursor or focus affordance — visually it is the year.
 *   - three clicks in a short window means it cannot be triggered by a stray click on a
 *     footer that people do click around in.
 *
 * ─── THIS IS NOT SECURITY ────────────────────────────────────────────────────────────
 * Obscuring the entrance protects nothing, and §30 says so explicitly. /admin/login is a
 * normal reachable route and anyone may type it. What actually guards the admin area is
 * the role claim checked by AdminGuard for routing and, authoritatively, by
 * requireRoles() on every admin endpoint. This exists only to keep an operator door out
 * of a student's way.
 */
function AdminEntry() {
  const navigate = useNavigate();
  const clicks = useRef<number[]>([]);

  const onClick = () => {
    const now = Date.now();
    clicks.current = [...clicks.current, now].filter((t) => now - t < 2000);
    if (clicks.current.length >= 3) {
      clicks.current = [];
      navigate('/admin/login');
    }
  };

  return (
    <span onClick={onClick} className="select-none">
      {new Date().getFullYear()}
    </span>
  );
}

export default function SiteFooter() {
  return (
    <footer className="border-t border-slate-100 dark:border-white/[0.07] bg-slate-50/60 dark:bg-white/[0.02]">
      <div className="max-w-[1160px] mx-auto px-5 sm:px-8">
        {/* ── Brand + link columns ─────────────────────────────────────── */}
        <div className="grid gap-10 lg:gap-8 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,2.6fr)] pt-14 sm:pt-16 pb-12">
          <div className="max-w-[19rem]">
            <Link to="/" className="flex items-center gap-2.5" aria-label="Sadhya home">
              <Mark className="w-[22px] h-[22px]" />
              <span className="text-[17px] font-semibold tracking-[-0.02em]">
                Sadhya<span className="text-[#c8e558]">.</span>
              </span>
            </Link>
            {/* Sits under the wordmark, indented to the width of the mark so it hangs off the
                name rather than the row. */}
            <HandwrittenTagline className="mt-1 ml-[34px] flex text-[16px] text-[#8ea63a] dark:text-[#c8e558]" />
            <p className="mt-4 text-[14px] leading-relaxed text-slate-500 dark:text-gray-400">
              An AI tutor built around your exam, your subjects and your level — answering from the
              curriculum, with its sources and its reasoning open to inspection.
            </p>

            {SITE.social.length > 0 && (
              <div className="mt-6 flex items-center gap-2">
                {SITE.social.map((s) => {
                  const isInternal = s.href.startsWith('/');
                  if (isInternal) {
                    return (
                      <Link
                        key={s.name}
                        to={s.href}
                        aria-label={`${SITE.name} on ${s.name}`}
                        className="w-9 h-9 rounded-lg border border-slate-200 dark:border-white/10 flex items-center justify-center text-slate-500 dark:text-gray-400 hover:text-slate-900 dark:hover:text-white hover:border-slate-300 dark:hover:border-white/20 hover:bg-white dark:hover:bg-white/[0.06] transition-colors cursor-pointer"
                      >
                        <svg viewBox="0 0 24 24" className="w-[15px] h-[15px]" fill="currentColor" aria-hidden>
                          <path d={BRAND_PATHS[s.icon]} />
                        </svg>
                      </Link>
                    );
                  }
                  return (
                    <a
                      key={s.name}
                      href={s.href}
                      target="_blank"
                      rel="noopener noreferrer me"
                      aria-label={`${SITE.name} on ${s.name}`}
                      className="w-9 h-9 rounded-lg border border-slate-200 dark:border-white/10 flex items-center justify-center text-slate-500 dark:text-gray-400 hover:text-slate-900 dark:hover:text-white hover:border-slate-300 dark:hover:border-white/20 hover:bg-white dark:hover:bg-white/[0.06] transition-colors"
                    >
                      <svg viewBox="0 0 24 24" className="w-[15px] h-[15px]" fill="currentColor" aria-hidden>
                        <path d={BRAND_PATHS[s.icon]} />
                      </svg>
                    </a>
                  );
                })}
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-8 sm:gap-6">
            {COLUMNS.map((col) => (
              <div key={col.title}>
                <h3 className="text-[12px] font-semibold uppercase tracking-[0.11em] text-slate-500 dark:text-gray-400">
                  {col.title}
                </h3>
                <ul className="mt-4 space-y-2.5">
                  {col.links.map((l) => (
                    <li key={l.label}>
                      <Link
                        to={l.href}
                        className="text-[13.5px] text-slate-600 dark:text-gray-300 hover:text-slate-900 dark:hover:text-white transition-colors"
                      >
                        {l.label}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>

        {/* ── Contact strip ────────────────────────────────────────────── */}
        <div className="border-t border-slate-200/70 dark:border-white/[0.07] py-7 grid gap-4 sm:grid-cols-3">
          <a
            href={`mailto:${SITE.email.support}`}
            className="flex items-start gap-3 text-[13.5px] text-slate-600 dark:text-gray-300 hover:text-slate-900 dark:hover:text-white transition-colors"
          >
            <Mail className="w-4 h-4 mt-0.5 shrink-0 text-slate-400 dark:text-gray-500" strokeWidth={1.9} />
            {SITE.email.support}
          </a>
          <a
            href={`tel:${SITE.phone.replace(/\s/g, '')}`}
            className="flex items-start gap-3 text-[13.5px] text-slate-600 dark:text-gray-300 hover:text-slate-900 dark:hover:text-white transition-colors"
          >
            <Phone className="w-4 h-4 mt-0.5 shrink-0 text-slate-400 dark:text-gray-500" strokeWidth={1.9} />
            {SITE.phone}
          </a>
          <p className="flex items-start gap-3 text-[13.5px] leading-relaxed text-slate-600 dark:text-gray-300">
            <MapPin className="w-4 h-4 mt-0.5 shrink-0 text-slate-400 dark:text-gray-500" strokeWidth={1.9} />
            {formatAddress()}
          </p>
        </div>

        {/* ── Bottom bar ───────────────────────────────────────────────── */}
        <div className="border-t border-slate-200/70 dark:border-white/[0.07] py-7 flex flex-col-reverse sm:flex-row sm:items-center gap-4">
          <div className="text-[12.5px] text-slate-500 dark:text-gray-400 space-y-1">
            <p>© <AdminEntry />{' '}{SITE.legalEntity}. All rights reserved.</p>
              {/* Both names, on purpose. Srijya is who makes Sadhya; TechLoom
                  Innovations is the registered entity, and verifiers for the cloud
                  startup programmes check this page against the register. Naming
                  only the brand would break that check, and naming only the entity
                  is now out of date. */}
            <p>
              Sadhya is a product of {SITE.parentBrand}, operated by {SITE.legalEntity}
              {SITE.udyam ? <> · Udyam {SITE.udyam}</> : null}
            </p>
            {/* The founder, on every page, with the third-party profiles that confirm him. */}
            <p>
              Founded by{' '}
              <Link to="/our-team" className="underline underline-offset-2 hover:text-slate-900 dark:hover:text-white">
                {SITE.founder.name}
              </Link>
              {' · '}
              <a href={SITE.founder.linkedin} target="_blank" rel="noopener noreferrer me" className="hover:text-slate-900 dark:hover:text-white">
                LinkedIn
              </a>
              {' · '}
              <a href={SITE.founder.github} target="_blank" rel="noopener noreferrer me" className="hover:text-slate-900 dark:hover:text-white">
                GitHub
              </a>
            </p>
          </div>

          <div className="sm:ml-auto flex flex-wrap items-center gap-x-5 gap-y-2">
            <span className="inline-flex items-center gap-2 text-[12.5px] text-slate-500 dark:text-gray-400">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" aria-hidden />
              Payments secured by Razorpay
            </span>
            <Link to="/terms" className="text-[12.5px] text-slate-500 dark:text-gray-400 hover:text-slate-900 dark:hover:text-white transition-colors">
              Terms
            </Link>
            <Link to="/privacy" className="text-[12.5px] text-slate-500 dark:text-gray-400 hover:text-slate-900 dark:hover:text-white transition-colors">
              Privacy
            </Link>
          </div>
        </div>
      </div>
    </footer>
  );
}
