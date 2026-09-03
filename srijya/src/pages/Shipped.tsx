import { Link } from 'react-router-dom';
import { ArrowRight } from '@/components/Icons';
import PageHeader from '@/components/PageHeader';
import { SHIPPED } from '@/content/shipped';
import { revealProps } from '@/lib/reveal';
import { useSeo } from '@/lib/useSeo';
import { COMPANY } from '@/site.config';

/**
 * The shipping log.
 *
 * Grouped by period rather than listed flat, so the shape of the year is
 * visible at a glance — which is the actual question a reader has. Entries are
 * grouped in array order, so the content file controls the sequence and this
 * component never sorts by parsing a date string.
 */
export default function Shipped() {
  useSeo({
    title: `What we've shipped — ${COMPANY.name}`,
    description: `Dated, plainly described work from ${COMPANY.name} and its products. No metrics, no announcements.`,
    path: '/shipped',
  });

  /* Consecutive entries sharing a period become one group. Deliberately not a
     Map keyed by period: that would silently merge two runs of the same month
     if the array were ever reordered, and hide the mistake. */
  const groups: Array<{ period: string; items: typeof SHIPPED }> = [];
  for (const item of SHIPPED) {
    const last = groups[groups.length - 1];
    if (last && last.period === item.period) last.items.push(item);
    else groups.push({ period: item.period, items: [item] });
  }

  return (
    <>
      <PageHeader
        label="Shipped"
        title="What we've shipped."
        lede="Dated work, described plainly. No metrics and no announcements — most of it you can go and use."
      />

      <div className="container-tl py-14 md:py-20">
        {groups.map((group, groupIndex) => (
          <section
            key={group.period}
            aria-labelledby={`period-${groupIndex}`}
            className="border-t border-line py-10 first:border-t-0 first:pt-0 md:py-12"
          >
            <div className="grid gap-y-8 md:grid-cols-12 md:gap-x-10">
              <div className="md:col-span-3" {...revealProps()}>
                <h2 id={`period-${groupIndex}`} className="label">
                  {group.period}
                </h2>
              </div>

              <div className="md:col-span-9">
                <ul className="space-y-9">
                  {group.items.map((item, index) => (
                    <li key={item.id} id={item.id} className="scroll-mt-28" {...revealProps(index * 70)}>
                      <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
                        <h3 className="heading-4 text-ink">{item.title}</h3>
                        {/* Which product this belongs to. A label, not a badge —
                            the site has one accent and this is not where to spend it. */}
                        <span className="text-[0.75rem] uppercase tracking-[0.08em] text-ink-3">
                          {item.product}
                        </span>
                      </div>
                      <p className="body-text mt-3 max-w-[62ch]">{item.body}</p>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </section>
        ))}

        <div className="border-t border-line pt-12 md:pt-16" {...revealProps()}>
          <p className="body-text max-w-[56ch]">
            Work that is built but not yet released stays off this page. So does anything a
            client has not made public.
          </p>
          <div className="mt-8 flex flex-wrap items-center gap-x-8 gap-y-4">
            <Link to="/products/sadhya" className="link-arrow">
              How Sadhya was built
              <ArrowRight />
            </Link>
            <Link to="/start" className="link-arrow">
              Start with your idea
              <ArrowRight />
            </Link>
          </div>
        </div>
      </div>
    </>
  );
}
