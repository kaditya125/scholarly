import SectionHeading from '@/components/SectionHeading';
import { APPROACH } from '@/content/approach';
import { revealProps } from '@/lib/reveal';

/**
 * How we work.
 *
 * Four stages on a shared rail. Each stage's segment of the rail draws in and its
 * node fills as the stage scrolls into view — the activation is driven entirely by
 * the `data-revealed` attribute the shared observer already sets, so there is no
 * scroll handler and no second mechanism to keep in sync.
 *
 * The rail runs along the top of each stage rather than between them, which means
 * the same markup works stacked on a phone and in a row on a desktop.
 */
export default function ApproachTimeline() {
  return (
    <section className="section" id="approach" aria-labelledby="approach-heading">
      <div className="container-tl">
        <SectionHeading
          id="approach-heading"
          label="Approach"
          title="How we work"
          lede="The same four stages, whether the engagement is a two-week review or a product built over months."
        />

        <ol className="mt-14 grid gap-y-12 md:mt-20 md:grid-cols-4 md:gap-x-8">
          {APPROACH.map((stage, index) => (
            <li
              key={stage.index}
              className="group relative pt-9"
              {...revealProps(Math.min(index * 110, 400))}
            >
              {/* The rail: a hairline, an accent segment that draws in, and the node. */}
              <span aria-hidden="true" className="absolute left-0 top-0 h-px w-full bg-line" />
              <span
                aria-hidden="true"
                className="absolute left-0 top-0 h-px w-full origin-left scale-x-0 bg-ink transition-transform duration-1000 ease-out group-data-[revealed=true]:scale-x-100 motion-reduce:transition-none motion-reduce:group-data-[revealed=true]:scale-x-100"
              />
              <span
                aria-hidden="true"
                className="absolute -top-[3.5px] left-0 h-[7px] w-[7px] bg-line-2 transition-colors delay-500 duration-500 group-data-[revealed=true]:bg-accent motion-reduce:delay-0 motion-reduce:transition-none"
              />

              <p className="index-num">{stage.index}</p>
              <h3 className="heading-4 mt-3 text-ink">{stage.title}</h3>
              <p className="body-text mt-3 max-w-[38ch]">{stage.body}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
