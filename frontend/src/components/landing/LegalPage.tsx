import { useEffect, type ReactNode } from 'react';
import { Link, useLocation } from 'react-router-dom';
import SiteHeader from './SiteHeader';
import SkyAmbience from './sky';
import SiteFooter from './SiteFooter';
import { SITE } from '../../lib/siteConfig';
import { useSeo } from '../../lib/useSeo';

/**
 * Shared chrome for the policy pages (/terms, /privacy, /refunds, /security).
 *
 * Long legal text is unreadable without navigation, so each page passes its sections in
 * and gets a sticky contents rail on desktop plus deep-linkable anchors — which is also
 * what lets support point a user at a specific clause.
 */

export interface LegalSectionDef {
  id: string;
  title: string;
  body: ReactNode;
}

/** Paragraph. Kept as a component so every policy page shares one measure and rhythm. */
export function P({ children }: { children: ReactNode }) {
  return <p className="text-[14.5px] leading-[1.75] text-slate-600 dark:text-gray-300">{children}</p>;
}

/** Bulleted list with the same rhythm as <P>. */
export function UL({ items }: { items: ReactNode[] }) {
  return (
    <ul className="space-y-2">
      {items.map((it, i) => (
        <li key={i} className="flex gap-3 text-[14.5px] leading-[1.75] text-slate-600 dark:text-gray-300">
          <span className="mt-[0.6em] w-1 h-1 rounded-full bg-slate-400 dark:bg-gray-500 shrink-0" aria-hidden />
          <span>{it}</span>
        </li>
      ))}
    </ul>
  );
}

/** Sub-heading inside a section. */
export function H3({ children }: { children: ReactNode }) {
  return (
    <h3 className="text-[15px] font-semibold tracking-[-0.01em] text-slate-900 dark:text-white mt-1">
      {children}
    </h3>
  );
}

/** A definition-style row, used for the data tables in the privacy policy. */
export function DefRow({ term, children }: { term: string; children: ReactNode }) {
  return (
    <div className="grid sm:grid-cols-[11rem_1fr] gap-1 sm:gap-5 py-3 border-b border-slate-100 dark:border-white/[0.07] last:border-0">
      <dt className="text-[13.5px] font-medium text-slate-900 dark:text-white">{term}</dt>
      <dd className="text-[13.5px] leading-relaxed text-slate-600 dark:text-gray-300">{children}</dd>
    </div>
  );
}

export default function LegalPage({
  title,
  intro,
  sections,
}: {
  title: string;
  intro: string;
  sections: LegalSectionDef[];
}) {
  const { pathname } = useLocation();
  useSeo({
    title: `${title} — ${SITE.name}`,
    description: intro,
    url: `${SITE.url}${pathname}`,
  });

  // These pages are reached from the footer of a scrolled page, so without this the
  // visitor lands halfway down a policy they've never read.
  useEffect(() => { window.scrollTo(0, 0); }, [title]);

  return (
    <div className="min-h-screen bg-white dark:bg-[#0b0b0c] text-slate-900 dark:text-white antialiased">
      <SiteHeader />
      <SkyAmbience />

      <main className="relative z-10 max-w-[1160px] mx-auto px-5 sm:px-8">
        <header className="pt-14 sm:pt-20 pb-10 border-b border-slate-100 dark:border-white/[0.07]">
          <nav aria-label="Breadcrumb" className="mb-5">
            <Link
              to="/"
              className="text-[13px] font-medium text-slate-500 dark:text-gray-400 hover:text-slate-900 dark:hover:text-white transition-colors"
            >
              ← Back to home
            </Link>
          </nav>
          <h1 className="text-[34px] sm:text-[44px] leading-[1.08] font-semibold tracking-[-0.035em]">
            {title}
          </h1>
          <p className="mt-4 max-w-[42rem] text-[15.5px] leading-relaxed text-slate-500 dark:text-gray-400">
            {intro}
          </p>
          <p className="mt-5 text-[13px] text-slate-500 dark:text-gray-400">
            Last updated {SITE.legalLastUpdated} · {SITE.legalEntity}
          </p>
        </header>

        <div className="grid lg:grid-cols-[15rem_minmax(0,1fr)] gap-10 lg:gap-16 py-12 sm:py-16">
          {/* Contents rail */}
          <aside className="hidden lg:block">
            <nav aria-label="On this page" className="sticky top-24">
              <p className="text-[12px] font-semibold uppercase tracking-[0.11em] text-slate-500 dark:text-gray-400">
                On this page
              </p>
              <ul className="mt-4 space-y-2">
                {sections.map((s) => (
                  <li key={s.id}>
                    <a
                      href={`#${s.id}`}
                      className="block text-[13px] leading-snug text-slate-600 dark:text-gray-300 hover:text-slate-900 dark:hover:text-white transition-colors"
                    >
                      {s.title}
                    </a>
                  </li>
                ))}
              </ul>
            </nav>
          </aside>

          <article className="max-w-[44rem] space-y-12">
            {sections.map((s) => (
              <section key={s.id} id={s.id} className="scroll-mt-24">
                <h2 className="text-[19px] sm:text-[21px] font-semibold tracking-[-0.02em] mb-4">
                  {s.title}
                </h2>
                <div className="space-y-4">{s.body}</div>
              </section>
            ))}

            <section className="rounded-2xl border border-slate-200 dark:border-white/10 bg-slate-50/70 dark:bg-white/[0.02] p-6 sm:p-7">
              <h2 className="text-[16px] font-semibold tracking-[-0.015em]">Questions about this policy?</h2>
              <P>
                Write to{' '}
                <a
                  href={`mailto:${SITE.email.legal}`}
                  className="font-medium text-slate-900 dark:text-white underline underline-offset-2"
                >
                  {SITE.email.legal}
                </a>{' '}
                or use the details on our{' '}
                <Link to="/contact" className="font-medium text-slate-900 dark:text-white underline underline-offset-2">
                  contact page
                </Link>
                . We reply within three working days.
              </P>
            </section>
          </article>
        </div>
      </main>

      <div className="relative z-10">
        <SiteFooter />
      </div>
    </div>
  );
}
