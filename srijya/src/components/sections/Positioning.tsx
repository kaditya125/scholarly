import { Link } from 'react-router-dom';
import { ArrowRight } from '@/components/Icons';
import { revealProps } from '@/lib/reveal';

/**
 * The section directly under the hero, and the one that has to earn the scroll.
 *
 * It makes no claim about years, clients, offices or scale. Its whole job is to
 * name the gap the company exists to close, because that gap is the reason
 * anyone reads further.
 *
 * The gap used to be "an idea is not a product". It still is, but that is no
 * longer the hard half. What actually stops people now is that the ground moves
 * every few months: a new model, a new tool, a new thing that is apparently
 * essential. Someone with a job and an idea and no background in this cannot
 * track that, and should not have to. So the section says who carries that
 * weight — and it addresses one person rather than an "organisation", because
 * the reader with the idea and no way to build it is usually on their own.
 *
 * On not overclaiming: the AGI line is written as "whatever you want to call
 * what is coming", deliberately. A site that stakes its credibility on a
 * prediction it cannot support has spent the credibility it needed for the
 * paragraphs that follow.
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
              Whatever you want to call what is coming — AGI, or just the next model after
              this one — it arrives faster than anyone can learn it. There is a new tool
              every month that is apparently essential, and for someone with a job, an idea
              and no background in any of this, keeping up was never realistic.
            </p>
            <p className="body-text mt-5">
              So that part is ours. We follow what these tools can and cannot actually do,
              and choose what fits the problem in front of us rather than what is loudest
              that week. You do not need to understand any of it. You need to know what you
              want to exist.
            </p>
            <p className="body-text mt-5">
              The rest is ordinary work done properly: clarity, structure, design and
              engineering, from understanding the problem through to launching the product
              and evolving it afterwards. You end up with a real thing — and a plain account
              of how it works, because a product you cannot explain is one you do not really
              own.
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
