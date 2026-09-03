import { Link } from 'react-router-dom';
import { ArrowRight } from '@/components/Icons';
import PageHeader from '@/components/PageHeader';
import { HELP_CATEGORIES } from '@/content/help';
import { revealProps } from '@/lib/reveal';
import { useSeo } from '@/lib/useSeo';
import { COMPANY } from '@/site.config';

/**
 * The help centre.
 *
 * Built on native <details>, so every answer opens with a keyboard, is exposed
 * correctly to assistive technology, and is readable with JavaScript disabled —
 * none of which a div-and-onClick accordion gives you without reimplementing all
 * three badly.
 *
 * This page is also the assistant's published knowledge. That is deliberate: an
 * assistant grounded in a corpus nobody can read cannot be audited, because when
 * it says something wrong there is no page to check it against.
 */
export default function Help() {
  useSeo({
    title: `Help — ${COMPANY.name}`,
    description: `Answers about ${COMPANY.name} — the company, its products, how engagements work, and the technology behind them.`,
    path: '/help',
  });

  return (
    <>
      <PageHeader
        label="Help"
        title="Questions, answered."
        lede="What the company is, what it builds, and how working together actually starts. Every answer here is one you can hold us to."
      />

      <div className="container-tl py-14 md:py-20">
        {/* Category index. On a phone this is the fastest route to an answer;
            on a wide screen it doubles as a summary of what the page covers. */}
        <nav aria-label="Help categories" className="border-y border-line py-6" {...revealProps()}>
          <ul className="flex flex-wrap gap-x-8 gap-y-3">
            {HELP_CATEGORIES.map((category) => (
              <li key={category.id}>
                <a
                  href={`#${category.id}`}
                  className="text-[0.9375rem] text-ink-2 underline decoration-line-2 underline-offset-4 transition-colors duration-300 hover:text-ink hover:decoration-ink"
                >
                  {category.title}
                </a>
              </li>
            ))}
          </ul>
        </nav>

        {HELP_CATEGORIES.map((category, categoryIndex) => (
          <section
            key={category.id}
            id={category.id}
            aria-labelledby={`${category.id}-heading`}
            className="scroll-mt-28 border-b border-line py-12 md:py-16"
          >
            <div className="grid gap-y-8 md:grid-cols-12 md:gap-x-10">
              <div className="md:col-span-4" {...revealProps()}>
                <p className="index-num">{String(categoryIndex + 1).padStart(2, '0')}</p>
                <h2 id={`${category.id}-heading`} className="display-3 mt-4 max-w-[12ch]">
                  {category.title}
                </h2>
                <p className="body-text mt-4 max-w-[32ch]">{category.blurb}</p>
              </div>

              <div className="md:col-span-8" {...revealProps(80)}>
                <dl>
                  {category.articles.map((article) => (
                    <details
                      key={article.id}
                      id={article.id}
                      name={category.id}
                      className="group scroll-mt-28 border-t border-line first:border-t-0"
                    >
                      <summary className="flex cursor-pointer items-baseline justify-between gap-6 py-5 text-ink marker:content-none [&::-webkit-details-marker]:hidden">
                        <dt className="heading-4">{article.question}</dt>
                        {/* Rotates to a minus when open. aria-hidden: the state is
                            already announced by the disclosure itself. */}
                        <span
                          aria-hidden="true"
                          className="relative mt-2 h-px w-4 shrink-0 bg-ink-3 before:absolute before:left-1/2 before:top-1/2 before:h-4 before:w-px before:-translate-x-1/2 before:-translate-y-1/2 before:bg-ink-3 before:transition-transform before:duration-300 group-open:before:rotate-90 motion-reduce:before:transition-none"
                        />
                      </summary>
                      <dd className="body-text max-w-[62ch] pb-6">{article.answer}</dd>
                    </details>
                  ))}
                </dl>
              </div>
            </div>
          </section>
        ))}

        <div className="py-12 md:py-16" {...revealProps()}>
          <h2 className="display-3 max-w-[18ch]">Not answered here?</h2>
          <p className="body-text mt-5 max-w-[52ch]">
            Ask Srijya using the assistant in the corner of any page, or write to us — a person
            reads everything that comes in.
          </p>
          <div className="mt-8 flex flex-wrap items-center gap-x-8 gap-y-4">
            <Link to="/start" className="btn btn-primary">
              Start with your idea
              <ArrowRight />
            </Link>
            <Link to="/contact" className="link-arrow">
              Or write to us
              <ArrowRight />
            </Link>
          </div>
        </div>
      </div>
    </>
  );
}
