import { Link } from 'react-router-dom';
import { ArrowRight } from '@/components/Icons';
import { INSIGHTS, readingMinutes } from '@/content/insights';
import { revealProps } from '@/lib/reveal';

/**
 * The most recent post, surfaced on the home page.
 *
 * Reads INSIGHTS[0] rather than naming an article, so publishing a new one
 * updates the home page by itself. A hand-maintained "featured post" is a thing
 * someone forgets, and a home page pointing at writing from eight months ago is
 * worse than one pointing at none.
 *
 * The array is ordered newest-first by hand — see src/content/insights.ts. That
 * is deliberate: sorting would mean parsing "September 2026" into a date, and a
 * month-granularity string is not a date. The file says to put new posts at the
 * top and this is the reason.
 */
export default function LatestWriting() {
  const latest = INSIGHTS[0];
  if (!latest) return null;

  return (
    <section className="section border-t border-line" aria-labelledby="latest-writing-heading">
      <div className="container-tl">
        <div className="grid gap-y-8 md:grid-cols-12 md:gap-x-10">
          <div className="md:col-span-3" {...revealProps()}>
            <p className="label">From the lab</p>
          </div>

          <div className="md:col-span-9" {...revealProps(60)}>
            <Link to={`/insights/${latest.slug}`} className="group block">
              <h2
                id="latest-writing-heading"
                className="display-3 max-w-[24ch] transition-colors duration-300 group-hover:text-accent-ink"
              >
                {latest.title}
              </h2>
              <p className="body-text mt-5 max-w-[60ch]">{latest.standfirst}</p>
              <span className="link-arrow mt-7 inline-flex">
                Read it
                <ArrowRight />
              </span>
            </Link>

            <p className="mt-8 text-[0.8125rem] text-ink-3">
              {latest.published} · {readingMinutes(latest)} min read ·{' '}
              <Link
                to="/insights"
                className="underline decoration-line-2 underline-offset-4 transition-colors duration-300 hover:text-ink hover:decoration-ink"
              >
                {INSIGHTS.length === 1
                  ? 'all writing'
                  : `${INSIGHTS.length} pieces in all`}
              </Link>
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
