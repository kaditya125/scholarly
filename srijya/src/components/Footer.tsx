import { Link } from 'react-router-dom';
import { ArrowUpRight } from '@/components/Icons';
import { LoomRule } from '@/components/LoomField';
import { LoomMark } from '@/components/Logo';
import { hasShipped } from '@/content/shipped';
import { hasTeam } from '@/content/team';
import { COMPANY, SADHYA } from '@/site.config';

const COLUMNS = [
  {
    heading: 'Company',
    links: [
      { label: 'About', to: '/about' },
      { label: 'Capabilities', to: '/capabilities' },
      // Appears on its own once src/content/team.ts has an entry.
      ...(hasTeam ? [{ label: 'Team', to: '/team' }] : []),
      ...(hasShipped ? [{ label: 'Shipped', to: '/shipped' }] : []),
      { label: 'Products', to: '/products' },
      { label: 'Start a project', to: '/start' },
      { label: 'Help', to: '/help' },
      { label: 'Contact', to: '/contact' },
    ],
  },
  {
    heading: 'Products',
    links: [
      { label: SADHYA.name, to: '/products/sadhya' },
      { label: 'Product studio', to: '/products' },
    ],
  },
  {
    heading: 'Legal',
    links: [
      { label: 'Privacy', to: '/privacy' },
      { label: 'Data & security', to: '/security' },
      { label: 'Terms', to: '/terms' },
      { label: 'Company information', to: '/company' },
    ],
  },
] as const;

export default function Footer() {
  const year = new Date().getFullYear();

  return (
    <footer className="border-t border-line bg-paper-2">
      <div className="container-tl py-16 md:py-20">
        <div className="grid gap-12 md:grid-cols-12 md:gap-10">
          {/* Identity */}
          <div className="md:col-span-5">
            <div className="flex items-start gap-3">
              <LoomMark size={30} className="mt-[2px] shrink-0 text-ink" />
              <div>
                <p className="text-[1.0625rem] font-semibold leading-tight tracking-[-0.018em] text-ink">
                  {COMPANY.nameParts[0]}
                </p>
                <p className="mt-1 font-mono text-[0.625rem] font-medium uppercase tracking-[0.22em] text-ink-3">
                  {COMPANY.nameParts[1]}
                </p>
              </div>
            </div>
            <p className="mt-6 max-w-[34ch] text-[0.9375rem] leading-relaxed text-ink-2">
              {COMPANY.tagline}
            </p>
            <p className="mt-8 text-[0.8125rem] text-ink-3">{COMPANY.location}</p>
            {COMPANY.email ? (
              <a
                href={`mailto:${COMPANY.email}`}
                className="mt-1 inline-block text-[0.8125rem] text-ink-2 underline decoration-line-2 underline-offset-4 transition-colors duration-300 hover:text-ink hover:decoration-ink"
              >
                {COMPANY.email}
              </a>
            ) : null}
          </div>

          {/* Sitemap. Nested rather than three top-level columns so the group ends
              flush with the right edge of the container at every breakpoint. */}
          <div className="grid grid-cols-2 gap-x-8 gap-y-10 sm:grid-cols-3 md:col-span-7">
            {COLUMNS.map((column) => (
              <nav key={column.heading} aria-label={column.heading}>
                <p className="label">{column.heading}</p>
                <ul className="mt-5 space-y-3">
                  {column.links.map((link) => (
                    <li key={link.to + link.label}>
                      <Link
                        to={link.to}
                        className="text-[0.9063rem] text-ink-2 transition-colors duration-300 hover:text-ink"
                      >
                        {link.label}
                      </Link>
                    </li>
                  ))}
                </ul>
              </nav>
            ))}
          </div>
        </div>

        {/* The product, kept visibly distinct from the company's own navigation. */}
        <div className="mt-14 border-t border-line pt-8 md:mt-16">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <p className="text-[0.9063rem] text-ink-2">
              <span className="label mr-3 align-middle">Product</span>
              {SADHYA.name} — {SADHYA.role.toLowerCase()}
            </p>
            <a
              href={SADHYA.url}
              target="_blank"
              rel="noopener noreferrer"
              className="link-arrow text-[0.875rem]"
            >
              {SADHYA.domain}
              <ArrowUpRight size={14} />
            </a>
          </div>
        </div>

        {/* Social links render only for profiles that exist — see site.config.ts. */}
        {COMPANY.social.length > 0 ? (
          <ul className="mt-8 flex flex-wrap gap-6">
            {COMPANY.social.map((profile) => (
              <li key={profile.href}>
                <a
                  href={profile.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[0.875rem] text-ink-2 transition-colors duration-300 hover:text-ink"
                >
                  {profile.name}
                </a>
              </li>
            ))}
          </ul>
        ) : null}
      </div>

      <LoomRule className="h-4 w-full" />

      <div className="container-tl flex flex-wrap items-center justify-between gap-3 pb-10 pt-6">
        <p className="text-[0.8125rem] text-ink-3">
          © {year} {COMPANY.legalEntity}. All rights reserved.
        </p>
        <p className="font-mono text-[0.6875rem] uppercase tracking-[0.14em] text-ink-3">
          Udyam {COMPANY.registration.udyam}
        </p>
      </div>
    </footer>
  );
}
