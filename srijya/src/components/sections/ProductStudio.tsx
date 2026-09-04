import { Link } from 'react-router-dom';
import { ArrowRight } from '@/components/Icons';
import SectionMotif from '@/components/SectionMotif';
import { revealProps } from '@/lib/reveal';
import { SADHYA } from '@/site.config';

/**
 * The product studio.
 *
 * Two rows: the product that exists, and an honest statement about the ones that
 * do not yet. Inventing a second product to balance the row would be the easiest
 * thing on this page to fake and the easiest thing for a visitor to check.
 */
export default function ProductStudio() {
  return (
    <section className="section border-t border-line" aria-labelledby="studio-heading">
      <div className="container-tl">
        <div className="grid gap-y-8 md:grid-cols-12 md:gap-x-10">
          <div className="md:col-span-3" {...revealProps()}>
            <p className="label flex items-center gap-2.5">
              <SectionMotif name="studio" size={20} className="shrink-0 text-accent" />
              Product studio
            </p>
          </div>
          <div className="md:col-span-9" {...revealProps(60)}>
            <h2 id="studio-heading" className="display-3 max-w-[16ch]">
              Building beyond client work.
            </h2>
            <p className="lede mt-7 max-w-[56ch]">
              Srijya doesn&rsquo;t only build technology for others. We build and evolve
              products of our own — which is also the fastest way to stay honest about what
              running one actually costs.
            </p>
          </div>
        </div>

        <ul className="mt-14 md:mt-16">
          <li {...revealProps()}>
            <Link
              to="/products/sadhya"
              className="hover-row group grid grid-cols-[1fr_auto] items-baseline gap-x-6 gap-y-2 border-t border-line py-7 md:grid-cols-12 md:gap-x-8 md:py-8"
            >
              <h3 className="heading-4 text-ink md:col-span-4">{SADHYA.name}</h3>
              <p className="body-text col-span-2 md:col-span-6">
                {SADHYA.role} — a digital learning platform, live at {SADHYA.domain}.
              </p>
              <span
                aria-hidden="true"
                className="col-start-2 row-start-1 flex justify-end text-ink-3 transition-colors duration-300 group-hover:text-ink md:col-span-2"
              >
                <ArrowRight />
              </span>
            </Link>
          </li>

          <li
            className="grid grid-cols-1 items-baseline gap-y-2 border-y border-line py-7 md:grid-cols-12 md:gap-x-8 md:py-8"
            {...revealProps(80)}
          >
            <h3 className="heading-4 text-ink-3 md:col-span-4">More in development.</h3>
            <p className="body-text md:col-span-6">
              Work that isn&rsquo;t public yet stays off this page until it is.
            </p>
          </li>
        </ul>
      </div>
    </section>
  );
}
