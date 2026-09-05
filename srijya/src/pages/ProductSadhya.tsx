import { Link } from 'react-router-dom';
import { ArrowRight, ArrowUpRight } from '@/components/Icons';
import { LoomMark } from '@/components/Logo';
import PageHeader from '@/components/PageHeader';
import ContactCTA from '@/components/sections/ContactCTA';
import QuestionPath from '@/components/sections/QuestionPath';
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
              <dt className="label">Stack</dt>
              <dd className="mt-2 text-ink">TypeScript, React 19, Vertex AI, Pinecone</dd>
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

        <QuestionPath />

        <TextSection label="05 / Architecture" title="Systems and engineering">
          <p className="body-text">
            Sadhya operates four foundational subsystems engineered for accuracy, responsiveness and operational reliability:
          </p>
          <div className="mt-8 grid gap-6 sm:grid-cols-2">
            <div className="rounded-[5px] border border-line bg-surface p-6">
              <p className="font-mono text-[0.6875rem] font-medium uppercase tracking-[0.16em] text-ink-3">
                01 · Grounding & Retrieval
              </p>
              <h3 className="mt-3 text-[1.0625rem] font-medium text-ink">Curriculum Vector Engine</h3>
              <p className="mt-3 text-[0.875rem] leading-relaxed text-ink-2">
                High-dimensional vector embeddings with strict source provenance and 100% boundary isolation across national competitive exams (UPSC, SSC, JEE, NEET).
              </p>
            </div>
            <div className="rounded-[5px] border border-line bg-surface p-6">
              <p className="font-mono text-[0.6875rem] font-medium uppercase tracking-[0.16em] text-ink-3">
                02 · Multi-Modal AI
              </p>
              <h3 className="mt-3 text-[1.0625rem] font-medium text-ink">AI Tutor & Real-Time Voice</h3>
              <p className="mt-3 text-[0.875rem] leading-relaxed text-ink-2">
                Multi-turn reasoning via Google Gemini, low-latency streaming voice interactions, and adaptive difficulty mock tests drawn directly from verified past papers.
              </p>
            </div>
            <div className="rounded-[5px] border border-line bg-surface p-6">
              <p className="font-mono text-[0.6875rem] font-medium uppercase tracking-[0.16em] text-ink-3">
                03 · Ingestion Reliability
              </p>
              <h3 className="mt-3 text-[1.0625rem] font-medium text-ink">Dual-Flush Persistence</h3>
              <p className="mt-3 text-[0.875rem] leading-relaxed text-ink-2">
                Atomic vector batches synchronized to Pinecone and Firestore with automated backoff on upstream provider rate limits, guaranteeing zero data loss during large corpus ingestion.
              </p>
            </div>
            <div className="rounded-[5px] border border-line bg-surface p-6">
              <p className="font-mono text-[0.6875rem] font-medium uppercase tracking-[0.16em] text-ink-3">
                04 · Self-Service Monetization
              </p>
              <h3 className="mt-3 text-[1.0625rem] font-medium text-ink">Autonomous Entitlements</h3>
              <p className="mt-3 text-[0.875rem] leading-relaxed text-ink-2">
                Automated Razorpay recurring billing, webhook-reconciled quota allocations, and a one-click 7-day money-back guarantee built into student account settings.
              </p>
            </div>
          </div>

          {/* Architecture Pipeline Map */}
          <div className="mt-10 overflow-hidden rounded-[5px] border border-line bg-surface p-6 md:p-8">
            <p className="font-mono text-[0.6875rem] font-medium uppercase tracking-[0.16em] text-ink-3">
              Data & Execution Pipeline
            </p>
            <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <div className="rounded-[4px] border border-line bg-paper-2 p-4">
                <span className="font-mono text-[0.6875rem] text-ink-3">LAYER 01</span>
                <p className="mt-1 text-[0.9375rem] font-medium text-ink">Client Experience</p>
                <p className="mt-2 text-[0.8125rem] leading-relaxed text-ink-2">
                  React 19 SPA, low-latency Web Audio voice streaming, and accessible KaTeX math rendering.
                </p>
              </div>

              <div className="rounded-[4px] border border-line bg-paper-2 p-4">
                <span className="font-mono text-[0.6875rem] text-ink-3">LAYER 02</span>
                <p className="mt-1 text-[0.9375rem] font-medium text-ink">API & Auth Gateway</p>
                <p className="mt-2 text-[0.8125rem] leading-relaxed text-ink-2">
                  Node.js Express microservices, quota rate limiters, and secure Razorpay webhook handlers.
                </p>
              </div>

              <div className="rounded-[4px] border border-line bg-paper-2 p-4">
                <span className="font-mono text-[0.6875rem] text-ink-3">LAYER 03</span>
                <p className="mt-1 text-[0.9375rem] font-medium text-ink">AI & Vector RAG</p>
                <p className="mt-2 text-[0.8125rem] leading-relaxed text-ink-2">
                  768-dim Pinecone vector indexing with zero-leakage cross-exam metadata filtering.
                </p>
              </div>

              <div className="rounded-[4px] border border-line bg-paper-2 p-4">
                <span className="font-mono text-[0.6875rem] text-ink-3">LAYER 04</span>
                <p className="mt-1 text-[0.9375rem] font-medium text-ink">Persistent State</p>
                <p className="mt-2 text-[0.8125rem] leading-relaxed text-ink-2">
                  Atomic Firestore transactions, session caching, and automated cloud backup pipelines.
                </p>
              </div>
            </div>
          </div>
        </TextSection>

        <section className="border-t border-line py-12 md:py-16" {...revealProps()}>
          <div className="grid gap-y-6 md:grid-cols-12 md:gap-x-10">
            <div className="md:col-span-3">
              <p className="label">06 / Capabilities</p>
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

        <TextSection label="07 / Outcome" title="What came of it">
          <p className="body-text">
            Sadhya is live and in public use. It handles accounts, subscriptions and payments,
            serves generated answers anchored to source material, and carries the ordinary
            operational load of a product people rely on — which is a different thing from a
            prototype that demonstrates the same ideas.
          </p>
          <p className="body-text">
            There are no user counts, growth figures or performance claims on this page, and that
            is deliberate. Numbers a company reports about its own product cannot be checked by
            the person reading them. What can be checked is the product itself: it is at{' '}
            {SADHYA.domain}, and it is the same system described above.
          </p>
        </TextSection>

        <section className="border-t border-line py-12 md:py-16" {...revealProps()}>
          <div className="grid gap-y-6 md:grid-cols-12 md:gap-x-10">
            <div className="md:col-span-3">
              <p className="label">Visit</p>
            </div>
            <div className="md:col-span-8">
              <h2 className="display-3 max-w-[18ch]">See it for yourself.</h2>
              <p className="body-text mt-6 max-w-[52ch]">
                Sadhya runs at {SADHYA.domain}. It has its own brand, its own site and its own
                terms — this page is {COMPANY.name}&rsquo;s account of building it.
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
