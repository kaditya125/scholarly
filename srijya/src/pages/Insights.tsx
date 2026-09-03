import { Link } from 'react-router-dom';
import { ArrowRight } from '@/components/Icons';
import PageHeader from '@/components/PageHeader';
import { INSIGHTS, readingMinutes } from '@/content/insights';
import { revealProps } from '@/lib/reveal';
import { useSeo } from '@/lib/useSeo';
import { COMPANY } from '@/site.config';

/**
 * The writing index.
 *
 * One article is not a blog, and the page does not pretend otherwise — there is
 * no category filter, no tag cloud and no "load more" for a list that would fit
 * in a sentence. It is a list of things worth reading, and it will grow into
 * needing more structure or it will not.
 */
export default function Insights() {
  useSeo({
    title: `From the lab — ${COMPANY.name}`,
    description: `Writing from ${COMPANY.name} on building products and applying AI in practice.`,
    path: '/insights',
  });

  return (
    <>
      <PageHeader
        label="From the lab"
        title="What building it taught us."
        lede="Notes on work we actually did, including the parts that went wrong. Everything here is checkable — usually by using the thing being described."
      />

      <div className="container-tl py-14 md:py-20">
        <ul className="border-t border-line">
          {INSIGHTS.map((insight, index) => (
            <li key={insight.slug} {...revealProps(index * 80)}>
              <Link
                to={`/insights/${insight.slug}`}
                className="hover-row group block border-b border-line py-8 md:py-10"
              >
                <div className="grid gap-y-4 md:grid-cols-12 md:gap-x-10">
                  <div className="md:col-span-3">
                    <p className="label">{insight.published}</p>
                    <p className="mt-2 text-[0.8125rem] text-ink-3">
                      {readingMinutes(insight)} min read
                    </p>
                  </div>

                  <div className="md:col-span-8">
                    <h2 className="display-3 max-w-[24ch]">{insight.title}</h2>
                    <p className="body-text mt-4 max-w-[60ch]">{insight.standfirst}</p>
                    <span className="link-arrow mt-6 inline-flex">
                      Read it
                      <ArrowRight />
                    </span>
                  </div>
                </div>
              </Link>
            </li>
          ))}
        </ul>

        <div className="py-12 md:py-16" {...revealProps()}>
          <p className="body-text max-w-[56ch]">
            We write when there is something worth writing about, not to a schedule. If you would
            like us to go deeper on any of this, ask.
          </p>
          <div className="mt-8">
            <Link to="/contact" className="link-arrow">
              Get in touch
              <ArrowRight />
            </Link>
          </div>
        </div>
      </div>
    </>
  );
}
