import { Link } from 'react-router-dom';
import { ArrowRight } from '@/components/Icons';
import SectionMotif from '@/components/SectionMotif';
import { revealProps } from '@/lib/reveal';

/**
 * The invitation: idea on one side, product on the other, and the company in
 * the space between.
 *
 * The transformation is drawn with type and a rule rather than an illustration.
 * Two words and the distance between them say the thing the section exists to
 * say, and they say it identically with animation disabled, at 375px, and to a
 * screen reader — which an animated diagram would not.
 *
 * The arrow is `aria-hidden`; the relationship is carried by the visible words
 * and the sentence beneath, not by a glyph nobody can hear.
 */
export default function IdeaToProduct() {
  return (
    <section
      className="section border-t border-line bg-paper-2"
      aria-labelledby="idea-to-product-heading"
    >
      <div className="container-tl">
        <div className="grid gap-y-12 md:grid-cols-12 md:gap-x-10">
          <div className="md:col-span-5" {...revealProps()}>
            <p className="label flex items-center gap-2.5">
              <SectionMotif name="transform" size={20} className="shrink-0 text-accent" />
              Start here
            </p>
            <h2 id="idea-to-product-heading" className="display-2 mt-6 max-w-[10ch]">
              Have an idea?
            </h2>
          </div>

          <div className="md:col-span-6 md:col-start-7" {...revealProps(80)}>
            {/* The transformation, at type scale. */}
            <div className="flex items-center gap-5 sm:gap-8">
              <span className="display-3 text-ink">Idea</span>
              <span
                aria-hidden="true"
                className="h-px flex-1 bg-line-2"
              />
              <span aria-hidden="true" className="text-ink-3">
                <ArrowRight size={20} />
              </span>
              <span className="display-3 text-ink">Product</span>
            </div>

            <p className="lede mt-10 max-w-[52ch]">
              Whether you have a rough concept, a prototype, or an existing application that needs
              to evolve, we can help turn it into something real.
            </p>

            <p className="body-text mt-5 max-w-[52ch]">
              Five short questions is usually enough for us to tell you something useful back —
              and &ldquo;not sure yet&rdquo; is an answer to every one of them.
            </p>

            <div className="mt-10">
              <Link to="/start" className="btn btn-primary">
                Start with your idea
                <ArrowRight />
              </Link>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
