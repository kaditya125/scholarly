import { Link } from 'react-router-dom';
import { Mail, Phone, MapPin } from 'lucide-react';
import { SITE, formatAddress, type SocialIcon } from '../../lib/siteConfig';
import { LogoMark as Mark } from '../brand/Logo';
import { HandwrittenTagline } from '../brand/HandwrittenTagline';

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

/* Brand glyphs. lucide-react removed brand icons in v1, so these are inlined from the
   Simple Icons set (CC0). Single-path, currentColor, no runtime dependency. */
const BRAND_PATHS: Record<SocialIcon, string> = {
  x: 'M18.901 1.153h3.68l-8.04 9.19L24 22.846h-7.406l-5.8-7.584-6.638 7.584H.474l8.6-9.83L0 1.154h7.594l5.243 6.932ZM17.61 20.644h2.039L6.486 3.24H4.298Z',
  linkedin: 'M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.064 2.064 0 112.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z',
  instagram: 'M12 0C8.74 0 8.333.015 7.053.072 5.775.132 4.905.333 4.14.63c-.789.306-1.459.717-2.126 1.384S.935 3.35.63 4.14C.333 4.905.131 5.775.072 7.053.012 8.333 0 8.74 0 12s.015 3.667.072 4.947c.06 1.277.261 2.148.558 2.913.306.788.717 1.459 1.384 2.126.667.666 1.336 1.079 2.126 1.384.766.296 1.636.499 2.913.558C8.333 23.988 8.74 24 12 24s3.667-.015 4.947-.072c1.277-.06 2.148-.262 2.913-.558.788-.306 1.459-.718 2.126-1.384.666-.667 1.079-1.335 1.384-2.126.296-.765.499-1.636.558-2.913.06-1.28.072-1.687.072-4.947s-.015-3.667-.072-4.947c-.06-1.277-.262-2.149-.558-2.913-.306-.789-.718-1.459-1.384-2.126C21.319 1.347 20.651.935 19.86.63c-.765-.297-1.636-.499-2.913-.558C15.667.012 15.26 0 12 0zm0 2.16c3.203 0 3.585.016 4.85.071 1.17.055 1.805.249 2.227.415.562.217.96.477 1.382.896.419.42.679.819.896 1.381.164.422.36 1.057.413 2.227.057 1.266.07 1.646.07 4.85s-.015 3.585-.074 4.85c-.061 1.17-.256 1.805-.421 2.227-.224.562-.479.96-.899 1.382-.419.419-.824.679-1.38.896-.42.164-1.065.36-2.235.413-1.274.057-1.649.07-4.859.07-3.211 0-3.586-.015-4.859-.074-1.171-.061-1.816-.256-2.236-.421-.569-.224-.96-.479-1.379-.899-.421-.419-.69-.824-.9-1.38-.165-.42-.359-1.065-.42-2.235-.045-1.26-.061-1.649-.061-4.844 0-3.196.016-3.586.061-4.861.061-1.17.255-1.814.42-2.234.21-.57.479-.96.9-1.381.419-.419.81-.689 1.379-.898.42-.166 1.051-.361 2.221-.421 1.275-.045 1.65-.06 4.859-.06l.045.03zm0 3.678a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm7.846-10.405a1.441 1.441 0 01-2.88 0 1.44 1.44 0 012.88 0z',
  facebook: 'M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z',
  youtube: 'M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z',
  github: 'M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12',
};

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
          <p className="text-[12.5px] text-slate-500 dark:text-gray-400">
            © {new Date().getFullYear()} {SITE.legalEntity}. All rights reserved.
          </p>

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
