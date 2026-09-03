import { Link } from 'react-router-dom';
import { ArrowRight, ArrowUpRight } from '@/components/Icons';
import { LoomMark } from '@/components/Logo';
import { revealProps } from '@/lib/reveal';
import { SADHYA } from '@/site.config';

/**
 * The flagship product.
 *
 * This is the one section that does not use the site's colour tokens. Sadhya has
 * its own identity — a near-black surface and a lime accent — and the point of
 * the section is that the visitor can see it is a different brand living inside
 * TechLoom's neutral page. Hard-coding those colours is what makes the panel
 * read as "another brand, our product" rather than as another TechLoom section,
 * and it keeps the panel identical in light and dark mode, which is how Sadhya
 * actually presents itself.
 *
 * The preview is Sadhya's own published brand banner, served from this site. It
 * is not a mocked-up screenshot of an interface that does not exist.
 */
export default function SadhyaFeature() {
  return (
    <section className="section-tight" aria-labelledby="sadhya-heading">
      <div className="container-tl">
        <div
          className="overflow-hidden rounded-[6px] border border-white/10 bg-[#0f1013] px-6 py-12 text-white sm:px-10 md:px-12 md:py-16 lg:px-16"
          {...revealProps()}
        >
          <div className="grid items-center gap-12 lg:grid-cols-12 lg:gap-14">
            <div className="lg:col-span-5">
              <p className="font-mono text-[0.6875rem] font-medium uppercase tracking-[0.16em] text-white/55">
                From our product studio
              </p>

              <h2
                id="sadhya-heading"
                className="mt-6 text-[clamp(2.6rem,5vw,3.75rem)] font-medium leading-none tracking-[-0.035em] text-white"
              >
                {SADHYA.name}
              </h2>

              <p className="mt-3 inline-flex items-center gap-2 text-[0.8125rem] text-white/55">
                <LoomMark size={15} className="text-white/70" />
                A TechLoom product
              </p>

              <p className="mt-7 max-w-[46ch] text-[1.0313rem] leading-relaxed text-white/70">
                {SADHYA.summary}
              </p>

              <div className="mt-10 flex flex-col gap-3 sm:flex-row sm:items-center">
                <a
                  href={SADHYA.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn inline-flex bg-[#c8e558] text-[#12140c] hover:bg-white"
                >
                  Explore {SADHYA.name}
                  <ArrowUpRight />
                </a>
                <Link
                  to="/products/sadhya"
                  className="btn border border-white/20 text-white transition-colors hover:border-white/60"
                >
                  How it was built
                  <ArrowRight />
                </Link>
              </div>
            </div>

            {/* Product surface, in a restrained browser frame. */}
            <div className="lg:col-span-7">
              <figure className="group/frame">
                <div className="overflow-hidden rounded-[5px] border border-white/12 bg-[#141519] shadow-[0_24px_70px_-30px_rgba(0,0,0,0.9)] transition-transform duration-500 ease-out group-hover/frame:-translate-y-1 motion-reduce:transition-none motion-reduce:group-hover/frame:translate-y-0">
                  <div className="flex items-center gap-3 border-b border-white/8 px-4 py-3">
                    <span aria-hidden="true" className="flex gap-1.5">
                      <span className="h-[7px] w-[7px] rounded-full bg-white/15" />
                      <span className="h-[7px] w-[7px] rounded-full bg-white/15" />
                      <span className="h-[7px] w-[7px] rounded-full bg-white/15" />
                    </span>
                    <span className="flex min-w-0 flex-1 items-center gap-2 rounded-[3px] bg-white/6 px-3 py-1.5">
                      <svg
                        width="10"
                        height="10"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2.2"
                        className="shrink-0 text-white/40"
                        aria-hidden="true"
                      >
                        <rect x="4" y="10" width="16" height="11" rx="2" />
                        <path d="M8 10V7a4 4 0 0 1 8 0v3" />
                      </svg>
                      <span className="truncate font-mono text-[0.6875rem] tracking-[0.02em] text-white/55">
                        {SADHYA.domain}
                      </span>
                    </span>
                  </div>
                  <img
                    src="/sadhya-og.jpg"
                    width={1200}
                    height={630}
                    loading="lazy"
                    decoding="async"
                    alt="Sadhya's brand banner: “Every goal, attainable.” — AI-powered prep for UPSC, SSC, JEE, NEET and BPSC."
                    className="block aspect-[1200/630] w-full object-cover"
                  />
                </div>
                <figcaption className="mt-4 font-mono text-[0.6875rem] uppercase tracking-[0.14em] text-white/50">
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
