import SectionHeading from '@/components/SectionHeading';
import { TECHNOLOGY_AREAS } from '@/content/technology';
import { revealProps } from '@/lib/reveal';

/**
 * Technology, grouped by purpose rather than displayed as a logo wall.
 *
 * A grid of framework marks proves only that the logos were downloadable. It
 * tells a reader nothing about whether this company could build their product,
 * which is the single question the section exists to answer. So: areas of work,
 * on hairlines, no icons, no cards.
 */
export default function TechnologyPurpose() {
  return (
    <section className="section" aria-labelledby="technology-heading">
      <div className="container-tl">
        <SectionHeading
          id="technology-heading"
          label="Technology"
          motif="technology"
          title="Technology with purpose."
          lede="Chosen for what a product needs, not for what is currently interesting. Each area below is in use in something already running."
        />

        <ul className="mt-14 border-t border-line md:mt-20">
          {TECHNOLOGY_AREAS.map((area, index) => (
            <li
              key={area.title}
              className="grid gap-y-3 border-b border-line py-7 md:grid-cols-12 md:gap-x-10 md:py-8"
              {...revealProps(index * 70)}
            >
              <div className="flex items-baseline gap-4 md:col-span-4">
                <span className="index-num">{area.index}</span>
                <h3 className="heading-4 text-ink">{area.title}</h3>
              </div>
              <p className="body-text md:col-span-8 md:max-w-[60ch]">{area.body}</p>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
