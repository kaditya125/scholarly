import { Link } from 'react-router-dom';
import { ArrowRight } from '@/components/Icons';
import SectionHeading from '@/components/SectionHeading';
import { CAPABILITIES } from '@/content/capabilities';
import { revealProps } from '@/lib/reveal';

/**
 * Capabilities as an index, not a grid of cards.
 *
 * A numbered list on hairlines reads as a table of contents for the company —
 * which is what it is — and it scales down to a phone without six boxes
 * stacking into a column of noise. Each row links through to the section on the
 * capabilities page that describes it properly.
 */
export default function Capabilities() {
  return (
    <section className="section border-t border-line bg-paper-2" aria-labelledby="capabilities-heading">
      <div className="container-tl">
        <SectionHeading
          id="capabilities-heading"
          label="Capabilities"
          title="What we build"
          lede="From early concepts to production systems, we combine product thinking with engineering to build technology that is useful, maintainable and ready for the real world."
        />

        <ul className="mt-14 md:mt-20">
          {CAPABILITIES.map((capability, index) => (
            <li key={capability.id} {...revealProps(Math.min(index * 60, 240))}>
              <Link
                to={`/capabilities#${capability.id}`}
                className="hover-row group grid grid-cols-[auto_1fr_auto] items-start gap-x-5 gap-y-2 border-t border-line py-7 md:grid-cols-12 md:items-baseline md:gap-x-8 md:py-8"
              >
                <span className="index-num md:col-span-1 md:pt-1">{capability.index}</span>

                <h3 className="heading-4 text-ink md:col-span-4">{capability.title}</h3>

                <p className="body-text col-span-2 col-start-2 md:col-span-6 md:col-start-auto">
                  {capability.summary}
                </p>

                <span
                  aria-hidden="true"
                  className="row-start-1 flex items-center justify-end text-ink-3 transition-colors duration-300 group-hover:text-ink md:col-span-1 md:row-start-auto"
                >
                  <ArrowRight />
                </span>
              </Link>
            </li>
          ))}
        </ul>

        <div className="border-t border-line pt-8" {...revealProps()}>
          <Link to="/capabilities" className="link-arrow">
            See how we work in each area
            <ArrowRight />
          </Link>
        </div>
      </div>
    </section>
  );
}
