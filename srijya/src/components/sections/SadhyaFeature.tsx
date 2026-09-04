import { Link } from 'react-router-dom';
import { ArrowRight, ArrowUpRight } from '@/components/Icons';
import { LoomMark } from '@/components/Logo';
import { revealProps } from '@/lib/reveal';
import { COMPANY, SADHYA } from '@/site.config';

/**
 * The flagship product.
 *
 * This panel used to be a near-black slab with its own hard-coded palette, on
 * the reasoning that a visitor should see a different brand living inside
 * Srijya's page. The reasoning was right and the execution was not: a
 * full-width black rectangle on a page built from hairlines and whitespace does
 * not read as "another brand", it reads as a component from a different site.
 * It also ignored the theme entirely, so in light mode it was the single
 * heaviest object on the page by a wide margin.
 *
 * So the container now belongs to Srijya — the site's own surface, border and
 * ink tokens, which means it sits with everything around it and follows the
 * theme like the rest of the page.
 *
 * Sadhya's identity still arrives, through the two things that actually carry a
 * brand: its own published banner, in a browser frame that names the domain, and
 * its lime on the one button that leaves for it. One deliberate moment of
 * somebody else's colour is a stronger signal than a whole panel of it, because
 * a reader notices the exception rather than the block.
 *
 * The preview is Sadhya's real landing page, served from this site. It is not a
 * mocked-up screenshot of an interface that does not exist.
 */
export default function SadhyaFeature() {
  return (
    <section className="section-tight" aria-labelledby="sadhya-heading">
      <div className="container-tl">
        <div
          className="overflow-hidden rounded-[6px] border border-line bg-paper-2 px-6 py-12 sm:px-10 md:px-12 md:py-16 lg:px-14"
          {...revealProps()}
        >
          <div className="grid items-center gap-12 lg:grid-cols-12 lg:gap-14">
            <div className="lg:col-span-5">
              <p className="label">From our product studio</p>

              <h2
                id="sadhya-heading"
                className="mt-6 text-[clamp(2.5rem,5vw,3.5rem)] font-medium leading-none tracking-[-0.035em] text-ink"
              >
                {SADHYA.name}
              </h2>

              <p className="mt-3 inline-flex items-center gap-2 text-[0.8125rem] text-ink-3">
                <LoomMark size={15} className="text-ink-3" />A {COMPANY.name} product
              </p>

              <p className="lede mt-7 max-w-[46ch]">{SADHYA.summary}</p>

              <div className="mt-10 flex flex-col gap-3 sm:flex-row sm:items-center">
                {/* Sadhya's lime, on the one control that leaves for Sadhya. The
                    ink on it is Sadhya's own near-black rather than this site's,
                    so the button is entirely their brand and nothing else is. */}
                <a
                  href={SADHYA.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn inline-flex bg-[#c8e558] text-[#12140c] hover:bg-[#bcda49]"
                >
                  Explore {SADHYA.name}
                  <ArrowUpRight />
                </a>
                <Link to="/products/sadhya" className="btn btn-ghost">
                  How it was built
                  <ArrowRight />
                </Link>
              </div>
            </div>

            {/* Product surface, in a restrained browser frame. The frame is the
                site's own chrome — the screenshot inside it is the brand. */}
            <div className="lg:col-span-7">
              <figure className="group/frame">
                <div className="overflow-hidden rounded-[5px] border border-line bg-paper shadow-[0_18px_50px_-34px_rgba(0,0,0,0.45)] transition-transform duration-500 ease-out group-hover/frame:-translate-y-1 motion-reduce:transition-none motion-reduce:group-hover/frame:translate-y-0">
                  <div className="flex items-center gap-3 border-b border-line px-4 py-3">
                    <span aria-hidden="true" className="flex gap-1.5">
                      <span className="h-[7px] w-[7px] rounded-full bg-line-2" />
                      <span className="h-[7px] w-[7px] rounded-full bg-line-2" />
                      <span className="h-[7px] w-[7px] rounded-full bg-line-2" />
                    </span>
                    <span className="flex min-w-0 flex-1 items-center gap-2 rounded-[3px] bg-paper-2 px-3 py-1.5">
                      <svg
                        width="10"
                        height="10"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2.2"
                        className="shrink-0 text-ink-3"
                        aria-hidden="true"
                      >
                        <rect x="4" y="10" width="16" height="11" rx="2" />
                        <path d="M8 10V7a4 4 0 0 1 8 0v3" />
                      </svg>
                      <span className="truncate font-mono text-[0.6875rem] tracking-[0.02em] text-ink-3">
                        {SADHYA.domain}
                      </span>
                    </span>
                  </div>
                  <img
                    src="/sadhya-hero.png"
                    width={1024}
                    height={521}
                    loading="lazy"
                    decoding="async"
                    alt="Sadhya's live hero landing page: “Ask anything from your syllabus.” — AI-powered prep for competitive exams."
                    className="block aspect-[1024/521] w-full object-cover"
                  />
                </div>
                <figcaption className="mt-4 font-mono text-[0.6875rem] uppercase tracking-[0.14em] text-ink-3">
                  {SADHYA.role} · Live at {SADHYA.domain}
                </figcaption>
              </figure>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
