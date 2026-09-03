import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, ArrowRight } from '@/components/Icons';
import PageHeader from '@/components/PageHeader';
import NotFound from '@/pages/NotFound';
import { INSIGHTS, readingMinutes } from '@/content/insights';
import type { Block } from '@/content/insights';
import { revealProps } from '@/lib/reveal';
import { useSeo } from '@/lib/useSeo';
import { COMPANY } from '@/site.config';

/**
 * One article.
 *
 * An unknown slug renders the site's own 404 rather than an empty article
 * shell — a URL someone mistyped or a link that outlived its post should say so
 * clearly, not present as a page with nothing in it.
 */
export default function InsightArticle() {
  const { slug } = useParams();
  const insight = INSIGHTS.find((entry) => entry.slug === slug);

  if (!insight) return <NotFound />;

  return <Article insight={insight} />;
}

/* Split out so the SEO hook is never called conditionally — hooks cannot run
   after an early return, and the 404 above is exactly that. */
function Article({ insight }: { insight: (typeof INSIGHTS)[number] }) {
  useSeo({
    title: `${insight.title} — ${COMPANY.name}`,
    description: insight.standfirst,
    path: `/insights/${insight.slug}`,
  });

  return (
    <>
      <PageHeader
        label={`From the lab · ${insight.published} · ${readingMinutes(insight)} min read`}
        title={insight.title}
        lede={insight.standfirst}
      />

      <div className="container-tl py-12 md:py-16">
        <div className="grid md:grid-cols-12 md:gap-x-10">
          {/* A single measured column. Long-form prose does not want the full
              grid width — around 68 characters is where it stays readable.

              `min-w-0` is load-bearing. A grid item defaults to min-width:auto,
              so it refuses to shrink below its widest content — which means the
              code block's own overflow-x never gets the chance to engage and a
              long line pushes the whole page sideways on a phone instead. */}
          <article className="min-w-0 md:col-span-8 md:col-start-3">
            {insight.blocks.map((block, index) => (
              <BlockView key={index} block={block} />
            ))}
          </article>
        </div>

        <div className="mt-14 border-t border-line pt-10 md:mt-20">
          <div className="flex flex-wrap items-center gap-x-8 gap-y-4">
            <Link to="/insights" className="link-arrow">
              <ArrowLeft />
              All writing
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

/** One block. Forty lines, and the reason this site has no markdown parser. */
function BlockView({ block }: { block: Block }) {
  switch (block.kind) {
    case 'h':
      return (
        <h2 className="heading-4 mt-12 text-ink first:mt-0" {...revealProps()}>
          {block.text}
        </h2>
      );

    case 'p':
      return (
        <p className="body-text mt-5 max-w-[68ch] first:mt-0" {...revealProps()}>
          {block.text}
        </p>
      );

    case 'list':
      return (
        <ul className="mt-5 max-w-[68ch] space-y-2" {...revealProps()}>
          {block.items.map((item) => (
            <li key={item} className="body-text flex gap-3">
              <span aria-hidden="true" className="text-ink-3">
                —
              </span>
              <span>{item}</span>
            </li>
          ))}
        </ul>
      );

    case 'quote':
      return (
        <blockquote
          className="mt-7 max-w-[64ch] border-l-2 border-accent pl-6"
          {...revealProps()}
        >
          <p className="text-[1.0625rem] leading-[1.6] text-ink">{block.text}</p>
          {block.attribution ? (
            <footer className="mt-3 text-[0.8125rem] text-ink-3">{block.attribution}</footer>
          ) : null}
        </blockquote>
      );

    case 'code':
      /* Scrolls inside its own box. A long line in a code sample must never be
         the reason the whole page scrolls sideways on a phone. */
      return (
        <pre
          className="mt-7 overflow-x-auto rounded-[4px] border border-line bg-paper-2 p-5 text-[0.8125rem] leading-[1.7]"
          {...revealProps()}
        >
          <code className="font-mono text-ink-2">{block.code}</code>
        </pre>
      );
  }
}
