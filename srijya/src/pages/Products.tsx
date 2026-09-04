import { Link } from 'react-router-dom';
import { ArrowRight, ArrowUpRight } from '@/components/Icons';
import HeaderMotif from '@/components/HeaderMotif';
import PageHeader from '@/components/PageHeader';
import ContactCTA from '@/components/sections/ContactCTA';
import { revealProps } from '@/lib/reveal';
import { useSeo } from '@/lib/useSeo';
import { COMPANY, SADHYA } from '@/site.config';

export default function Products() {
  useSeo({
    title: `Products — ${COMPANY.name}`,
    description: `${COMPANY.name} develops its own products alongside client work. ${SADHYA.name} is the first.`,
    path: '/products',
  });

  return (
    <>
      <PageHeader
        label="Products"
        title="Building beyond services."
        lede="Alongside client-focused technology work, Srijya develops its own products and experiments with new ways technology can solve meaningful problems."
        aside={<HeaderMotif name="studio" className="mx-auto max-w-[180px] text-accent" />}
      />

      {/* The flagship, given the whole width it deserves. */}
      <section className="container-tl py-14 md:py-20" aria-labelledby="sadhya-product-heading">
        <div className="grid gap-10 lg:grid-cols-12 lg:gap-14" {...revealProps()}>
          <div className="lg:col-span-6">
            <Link to="/products/sadhya" className="group block">
              <div className="overflow-hidden rounded-[5px] border border-line bg-surface shadow-[0_16px_40px_-20px_rgba(0,0,0,0.3)] transition-transform duration-500 ease-out group-hover:-translate-y-1 motion-reduce:transition-none motion-reduce:group-hover:translate-y-0">
                <div className="flex items-center gap-3 border-b border-line bg-surface px-4 py-2.5">
                  <span aria-hidden="true" className="flex gap-1.5">
                    <span className="h-[7px] w-[7px] rounded-full bg-ink-4" />
                    <span className="h-[7px] w-[7px] rounded-full bg-ink-4" />
                    <span className="h-[7px] w-[7px] rounded-full bg-ink-4" />
                  </span>
                  <span className="flex min-w-0 flex-1 items-center gap-2 rounded-[3px] bg-canvas px-3 py-1 text-ink-3">
                    <svg
                      width="10"
                      height="10"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2.2"
                      className="shrink-0 text-ink-4"
                      aria-hidden="true"
                    >
                      <rect x="4" y="10" width="16" height="11" rx="2" />
                      <path d="M8 10V7a4 4 0 0 1 8 0v3" />
                    </svg>
                    <span className="truncate font-mono text-[0.6875rem] tracking-[0.02em]">
                      {SADHYA.domain}
                    </span>
                  </span>
                </div>
                <img
                  src="/sadhya-hero.png"
                  width={1024}
                  height={521}
                  loading="lazy"
                  decoding="async"
                  alt="Sadhya's live hero landing page: “Ask anything from your syllabus.” — AI-powered exam preparation."
                  className="block aspect-[1024/521] w-full object-cover"
                />
              </div>
            </Link>
          </div>

          <div className="lg:col-span-6">
            <p className="label">{SADHYA.role}</p>
            <h2
              id="sadhya-product-heading"
              className="display-2 mt-5 flex items-center gap-4"
            >
              <img
                src="/sadhya-mark.svg"
                width={44}
                height={44}
                alt=""
                aria-hidden="true"
                className="h-11 w-11 rounded-[6px]"
              />
              {SADHYA.name}
            </h2>
            <p className="lede mt-7 max-w-[46ch]">{SADHYA.summary}</p>
            <p className="body-text mt-5 max-w-[48ch]">
              Built and operated by Srijya. It is our own product rather than a
              client project, which makes it the clearest available answer to what this company
              can design, build and run.
            </p>

            <div className="mt-6 flex flex-wrap gap-2">
              <span className="rounded-full border border-line bg-surface px-3 py-1 font-mono text-[0.75rem] text-ink-2">
                TypeScript & React 19
              </span>
              <span className="rounded-full border border-line bg-surface px-3 py-1 font-mono text-[0.75rem] text-ink-2">
                Google Gemini & Vertex AI
              </span>
              <span className="rounded-full border border-line bg-surface px-3 py-1 font-mono text-[0.75rem] text-ink-2">
                Pinecone 768-dim Vector RAG
              </span>
              <span className="rounded-full border border-line bg-surface px-3 py-1 font-mono text-[0.75rem] text-ink-2">
                Real-Time Voice AI
              </span>
              <span className="rounded-full border border-line bg-surface px-3 py-1 font-mono text-[0.75rem] text-ink-2">
                Razorpay Billing & Refunds
              </span>
            </div>

            <div className="mt-10 flex flex-wrap items-center gap-x-8 gap-y-4">
              <Link to="/products/sadhya" className="btn btn-primary">
                How it was built
                <ArrowRight />
              </Link>
              <a
                href={SADHYA.url}
                target="_blank"
                rel="noopener noreferrer"
                className="link-arrow"
              >
                Visit {SADHYA.domain}
                <ArrowUpRight size={14} />
              </a>
            </div>
          </div>
        </div>
      </section>

      <section className="border-t border-line" aria-labelledby="pipeline-heading">
        <div className="container-tl py-14 md:py-16">
          <div className="grid gap-y-6 md:grid-cols-12 md:gap-x-10" {...revealProps()}>
            <div className="md:col-span-3">
              <p className="label">In development</p>
            </div>
            <div className="md:col-span-8">
              <h2 id="pipeline-heading" className="display-3 max-w-[16ch]">
                More in development.
              </h2>
              <p className="body-text mt-6 max-w-[56ch]">
                Other product work is under way. It stays off this page until there is something
                real to show — a page of placeholder products would tell you nothing useful about
                the company.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Selected work. There is exactly one publicly presentable project, and the
          section says so rather than filling the space with invented case studies. */}
      <section className="border-t border-line" aria-labelledby="work-heading">
        <div className="container-tl py-14 md:py-16">
          <div className="grid gap-y-6 md:grid-cols-12 md:gap-x-10" {...revealProps()}>
            <div className="md:col-span-3">
              <p className="label">Built by Srijya</p>
            </div>
            <div className="md:col-span-8">
              <h2 id="work-heading" className="display-3 max-w-[18ch]">
                Client work stays private until it isn&rsquo;t.
              </h2>
              <p className="body-text mt-6 max-w-[56ch]">
                More work will be shared as projects move into the public domain. Until then,{' '}
                {SADHYA.name} is the product we can point at in full — and we are happy to talk
                through relevant work directly.
              </p>
              <div className="pt-8">
                <Link to="/contact" className="link-arrow">
                  Ask about relevant work
                  <ArrowRight />
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>

      <ContactCTA />
    </>
  );
}
