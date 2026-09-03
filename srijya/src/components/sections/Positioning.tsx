import { Link } from 'react-router-dom';
import { ArrowRight } from '@/components/Icons';
import { revealProps } from '@/lib/reveal';

/**
 * The section directly under the hero, and the one that has to earn the scroll.
 *
 * It makes no claim about years, clients, offices or scale. Its whole job is to
 * name the gap the company exists to close — the distance between having an idea
 * and having a product — because that gap is the reason anyone reads further.
 */
export default function Positioning() {
  return (
    <section id="positioning" className="section" aria-labelledby="positioning-heading">
      <div className="container-tl">
        <div className="grid gap-y-10 md:grid-cols-12 md:gap-x-10">
          <div className="md:col-span-3" {...revealProps()}>
            <p className="label">The work</p>
          </div>

          <div className="md:col-span-5" {...revealProps(60)}>
            <h2 id="positioning-heading" className="display-3 max-w-[18ch]">
              An idea is only the beginning.
            </h2>
          </div>

          <div className="md:col-span-4" {...revealProps(120)}>
            <p className="body-text">
              Good ideas need clarity, structure, design and engineering before they become
              useful technology. Srijya works across that whole distance — from understanding
              the problem to designing, building, launching and evolving the product.
            </p>
            <p className="body-text mt-5">
              Most of what decides whether a product is any good happens before the interesting
              engineering starts: what problem is being solved, for whom, and what is deliberately
              left out of the first version.
            </p>
            <Link to="/about" className="link-arrow mt-8">
              More about the company
              <ArrowRight />
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
