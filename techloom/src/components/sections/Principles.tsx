import SectionHeading from '@/components/SectionHeading';
import { PRINCIPLES } from '@/content/approach';
import { COMPANY } from '@/site.config';
import { revealProps } from '@/lib/reveal';

/** How the company thinks, expressed as commitments rather than adjectives. */
export default function Principles() {
  return (
    <section className="section bg-paper-2" aria-labelledby="principles-heading">
      <div className="container-tl">
        <SectionHeading
          id="principles-heading"
          label={`How ${COMPANY.name} thinks`}
          title="Built with intent."
          lede="Four things we hold to, on every engagement and in our own products."
        />

        <div className="mt-14 grid gap-y-10 md:mt-20 md:grid-cols-2 md:gap-x-10 lg:grid-cols-4">
          {PRINCIPLES.map((principle, index) => (
            <div
              key={principle.title}
              className="border-t border-line pt-7"
              {...revealProps(index * 90)}
            >
              <p className="index-num">{principle.index}</p>
              <h3 className="heading-4 mt-4 text-ink">{principle.title}</h3>
              <p className="body-text mt-3 max-w-[40ch]">{principle.body}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
