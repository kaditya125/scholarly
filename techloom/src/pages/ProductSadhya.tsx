import { Link } from 'react-router-dom';
import { ArrowRight, ArrowUpRight } from '@/components/Icons';
import { LoomMark } from '@/components/Logo';
import PageHeader from '@/components/PageHeader';
import ContactCTA from '@/components/sections/ContactCTA';
import TextSection from '@/components/TextSection';
import { CAPABILITIES } from '@/content/capabilities';
import { revealProps } from '@/lib/reveal';
import { useSeo } from '@/lib/useSeo';
import { COMPANY, SADHYA } from '@/site.config';

/** The areas of the company's own capability that building Sadhya exercises. */
const EXERCISED = [
  'digital-product-engineering',
  'ai-and-intelligent-experiences',
  'software-development',
];

export default function ProductSadhya() {
  useSeo({
    title: `${SADHYA.name} — a ${COMPANY.name} product`,
    description: `${SADHYA.summary} Built and operated by ${COMPANY.name}.`,
    path: '/products/sadhya',
  });

  const exercised = CAPABILITIES.filter((capability) => EXERCISED.includes(capability.id));

  return (
    <>
      <PageHeader
        label="Products / Sadhya"
        title={SADHYA.name}
        lede={SADHYA.summary}
        meta={
          <dl className="grid grid-cols-2 gap-y-5 text-[0.875rem]">
            <div>
              <dt className="label">Role</dt>
              <dd className="mt-2 text-ink">{SADHYA.role}</dd>
            </div>
            <div>
              <dt className="label">Status</dt>
              <dd className="mt-2 text-ink">Live</dd>
            </div>
            <div>
              <dt className="label">Built by</dt>
              <dd className="mt-2 inline-flex items-center gap-2 text-ink">
                <LoomMark size={14} />
                {COMPANY.nameParts[0]}
              </dd>
            </div>
            <div>
              <dt className="label">Website</dt>
              <dd className="mt-2">
                <a
                  href={SADHYA.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 text-ink underline decoration-line-2 underline-offset-4 transition-colors hover:decoration-ink"
                >
                  {SADHYA.domain}
                  <ArrowUpRight size={13} />
                </a>
              </dd>
            </div>
          </dl>
        }
      />

      <section className="container-tl py-12 md:py-16" aria-label="Sadhya brand banner">
        <figure {...revealProps()}>
          <div className="overflow-hidden rounded-[5px] border border-line bg-[#0f1013]">
            <img
              src="/sadhya-og.jpg"
              width={1200}
              height={630}
              loading="lazy"
              decoding="async"
              alt="Sadhya's brand banner: “Every goal, attainable.” — AI-powered prep for UPSC, SSC, JEE, NEET and BPSC."
              className="block aspect-[1200/630] w-full object-cover"
            />
          </div>
          <figcaption className="label mt-4">
            Sadhya — {SADHYA.domain} · A {COMPANY.name} product
          </figcaption>
        </figure>
      </section>

      <div className="container-tl">
        <TextSection label="01 / The product" title="What Sadhya is">
          <p className="body-text">
            Sadhya is a digital learning platform for people preparing for competitive
            examinations. It answers questions from a specific syllabus rather than from the open
            internet, shows the sources behind an answer, and adapts what it puts in front of a
            student to where that student actually is.
          </p>
          <p className="body-text">
            It is a full product rather than a demonstration: accounts, subscriptions and
            payments, content that has to stay correct, and the operational load that comes with
            all of it.
          </p>
        </TextSection>

        <TextSection label="02 / Why" title="Why we built it">
          <p className="body-text">
            A general-purpose assistant is a poor fit for an exam where a confident wrong answer
            costs marks. That is a product problem before it is a model problem: it is solved by
            grounding answers in the right material, making the reasoning checkable, and being
            explicit about what the system does not know.
          </p>
          <p className="body-text">
            Building it ourselves — rather than writing about it — is what makes the position
            worth anything. Every trade-off in that paragraph had to be made in code, in front of
            people who would notice if it were wrong.
          </p>
        </TextSection>

        <TextSection label="03 / The work" title="What building it involved">
          <p className="body-text">
            Interface and interaction design; front-end engineering for a large, long-lived
            application; back-end services, data modelling and content pipelines; retrieval and
            evaluation work to keep generated answers anchored to source material; payments,
            access control and the ordinary infrastructure of running something people rely on.
          </p>
          <p className="body-text">
            It is also where the less visible discipline shows up: keeping a codebase legible
            while it grows, and being able to change a decision made a year earlier without
            rebuilding around it.
          </p>
        </TextSection>

        <section className="border-t border-line py-12 md:py-16" {...revealProps()}>
          <div className="grid gap-y-6 md:grid-cols-12 md:gap-x-10">
            <div className="md:col-span-3">
              <p className="label">04 / Capabilities</p>
            </div>
            <div className="md:col-span-8">
              <h2 className="display-3 max-w-[20ch]">The capabilities it draws on</h2>
              <ul className="mt-8">
                {exercised.map((capability) => (
                  <li key={capability.id}>
                    <Link
                      to={`/capabilities#${capability.id}`}
                      className="hover-row group flex items-baseline gap-4 border-t border-line py-5"
                    >
                      <span className="index-num">{capability.index}</span>
                      <span className="flex-1 text-[1.0313rem] font-medium tracking-[-0.014em] text-ink">
                        {capability.title}
                      </span>
                      <span
                        aria-hidden="true"
                        className="text-ink-3 transition-colors duration-300 group-hover:text-ink"
                      >
                        <ArrowRight />
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </section>

        <section className="border-t border-line py-12 md:py-16" {...revealProps()}>
          <div className="grid gap-y-6 md:grid-cols-12 md:gap-x-10">
            <div className="md:col-span-3">
              <p className="label">Visit</p>
            </div>
            <div className="md:col-span-8">
              <h2 className="display-3 max-w-[18ch]">See it for yourself.</h2>
              <p className="body-text mt-6 max-w-[52ch]">
                Sadhya runs at {SADHYA.domain}. It has its own brand, its own site and its own
                terms — this page is TechLoom&rsquo;s account of building it.
              </p>
              <div className="mt-9">
                <a
                  href={SADHYA.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn btn-primary"
                >
                  Explore {SADHYA.name}
                  <ArrowUpRight />
                </a>
              </div>
            </div>
          </div>
        </section>
      </div>

      <ContactCTA />
    </>
  );
}
