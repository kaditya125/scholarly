import { Link } from 'react-router-dom';
import { ArrowDown, ArrowRight } from '@/components/Icons';
import LoomField from '@/components/LoomField';
import Sprout from '@/components/Sprout';
import { revealProps } from '@/lib/reveal';
import { COMPANY } from '@/site.config';

/**
 * The four areas the company works across. Read as positioning, not as a menu —
 * the full list lives in src/content/capabilities.ts, and this is deliberately
 * shorter than it. Four labels on a hairline scan; six become a table.
 */
const PILLARS = [
  'Product engineering',
  'Software development',
  'Applied AI',
  'Product design',
];

export default function Hero() {
  return (
    <section className="relative" aria-labelledby="hero-heading">
      <div className="container-tl pb-16 pt-12 md:pb-24 md:pt-20 lg:pt-24">
        <div className="grid items-center gap-12 lg:grid-cols-12 lg:gap-10">
          <div className="lg:col-span-7">
            {/* The company name, with the seed beside it. Srijya is "that which
                is to be created" — the sprout is that, in four strokes, and it
                sits next to the name rather than in the hero visual so the two
                are read together. */}
            <p className="label flex items-center gap-2.5" {...revealProps()}>
              <Sprout size={34} className="-my-2 text-accent" />
              {COMPANY.name}
            </p>

            <h1
              id="hero-heading"
              className="display-1 mt-6 max-w-[15ch]"
              {...revealProps(60)}
            >
              From ideas to real technology.
            </h1>

            <p className="lede mt-8 max-w-[54ch]" {...revealProps(120)}>
              Srijya is a technology and product engineering company helping
              organisations turn complex ideas into practical digital products,
              applications and intelligent technology experiences.
            </p>

            {/* Content-width, left-aligned — a full-bleed pair of buttons on a phone
                reads as a signup page, not a company. `.btn` already carries a 44px
                minimum height for touch. */}
            <div
              className="mt-11 flex flex-col items-start gap-3 sm:flex-row sm:items-center"
              {...revealProps(180)}
            >
              <Link to="/capabilities" className="btn btn-primary">
                Explore what we build
                <ArrowRight />
              </Link>
              <Link to="/contact" className="btn btn-ghost">
                Have an idea? Let&rsquo;s talk
                <ArrowRight />
              </Link>
            </div>
          </div>

          {/* The loom. Decorative in the layout sense, but it carries the company's
              one idea, so it keeps its space on a phone rather than being dropped. */}
          <div className="lg:col-span-5" {...revealProps(240)}>
            {/* Sized by width, so the motif scales with the column instead of being
                letterboxed into a narrow strip — the SVG's own aspect ratio supplies
                the height. */}
            <LoomField className="mx-auto h-auto w-full max-w-[300px] sm:max-w-[360px] lg:max-w-[470px]" />
          </div>
        </div>
      </div>

      {/* Positioning strip. Four labels on a hairline — no cards, no icons. */}
      <div className="border-y border-line">
        <div className="container-tl">
          <ul className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
            {PILLARS.map((pillar, index) => (
              <li
                key={pillar}
                className="flex items-baseline gap-3 border-b border-line py-5 last:border-b-0 sm:[&:nth-last-child(-n+2)]:border-b-0 lg:border-b-0 lg:border-l lg:border-line lg:py-6 lg:pl-6 lg:first:border-l-0 lg:first:pl-0"
                {...revealProps(index * 70)}
              >
                <span className="index-num">{String(index + 1).padStart(2, '0')}</span>
                <span className="text-[0.9375rem] font-medium tracking-[-0.008em] text-ink">
                  {pillar}
                </span>
              </li>
            ))}
          </ul>
        </div>
      </div>

      <div className="container-tl">
        <Link
          to="#positioning"
          className="mt-8 inline-flex items-center gap-2 text-[0.8125rem] text-ink-3 transition-colors duration-300 hover:text-ink"
        >
          Scroll to explore
          <ArrowDown size={14} />
        </Link>
      </div>
    </section>
  );
}
