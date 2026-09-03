import { Link } from 'react-router-dom';
import { ArrowRight } from '@/components/Icons';
import LoomField from '@/components/LoomField';
import { revealProps } from '@/lib/reveal';
import { useSeo } from '@/lib/useSeo';
import { COMPANY, NAV_LINKS } from '@/site.config';

export default function NotFound() {
  useSeo({
    title: `Page not found — ${COMPANY.name}`,
    description: 'The page you were looking for is not here.',
    path: '/404',
  });

  return (
    <section className="container-tl" aria-labelledby="notfound-heading">
      <div className="grid items-center gap-12 py-16 md:py-24 lg:grid-cols-12 lg:gap-10">
        <div className="lg:col-span-7">
          <p className="label" {...revealProps()}>
            Error 404
          </p>
          <h1 id="notfound-heading" className="display-1 mt-6 max-w-[13ch]" {...revealProps(60)}>
            This thread went nowhere.
          </h1>
          <p className="lede mt-8 max-w-[46ch]" {...revealProps(120)}>
            The page you were looking for does not exist, or has moved. Everything else is still
            where it was.
          </p>

          <div className="mt-11" {...revealProps(180)}>
            <Link to="/" className="btn btn-primary">
              Back to the home page
              <ArrowRight />
            </Link>
          </div>

          <nav aria-label="Site sections" className="mt-14" {...revealProps(220)}>
            <p className="label">Or go to</p>
            <ul className="mt-5">
              {NAV_LINKS.filter((link) => !link.href.includes('#')).map((link) => (
                <li key={link.href}>
                  <Link
                    to={link.href}
                    className="hover-row group flex items-baseline justify-between gap-6 border-t border-line py-4 text-[1.0313rem] font-medium tracking-[-0.014em] text-ink"
                  >
                    {link.label}
                    <span
                      aria-hidden="true"
                      className="text-ink-3 transition-colors duration-300 group-hover:text-ink"
                    >
                      <ArrowRight />
                    </span>
                  </Link>
                </li>
              ))}
              <li>
                <Link
                  to="/contact"
                  className="hover-row group flex items-baseline justify-between gap-6 border-y border-line py-4 text-[1.0313rem] font-medium tracking-[-0.014em] text-ink"
                >
                  Contact
                  <span
                    aria-hidden="true"
                    className="text-ink-3 transition-colors duration-300 group-hover:text-ink"
                  >
                    <ArrowRight />
                  </span>
                </Link>
              </li>
            </ul>
          </nav>
        </div>

        <div className="lg:col-span-5" {...revealProps(240)}>
          <LoomField className="mx-auto h-auto w-full max-w-[280px] sm:max-w-[340px] lg:max-w-[420px]" />
        </div>
      </div>
    </section>
  );
}
