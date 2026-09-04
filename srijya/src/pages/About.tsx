import { Link } from 'react-router-dom';
import { ArrowRight, ArrowUpRight } from '@/components/Icons';
import GrowingPlant from '@/components/GrowingPlant';
import PageHeader from '@/components/PageHeader';
import ContactCTA from '@/components/sections/ContactCTA';
import TextSection from '@/components/TextSection';
import { PRINCIPLES } from '@/content/approach';
import { revealProps } from '@/lib/reveal';
import { useSeo } from '@/lib/useSeo';
import { COMPANY, SADHYA } from '@/site.config';

export default function About() {
  useSeo({
    title: `About — ${COMPANY.name}`,
    description:
      `${COMPANY.name} is a technology and digital solutions company working across consulting, product engineering and its own products.`,
    path: '/about',
  });

  return (
    <>
      <PageHeader
        label="About"
        title="A technology company with a product mindset."
        lede={COMPANY.positioning}
        meta={
          <dl className="grid grid-cols-2 gap-y-5 text-[0.875rem]">
            <div>
              <dt className="label">Based in</dt>
              <dd className="mt-2 text-ink">{COMPANY.location}</dd>
            </div>
            <div>
              <dt className="label">Registered</dt>
              <dd className="mt-2 text-ink">{COMPANY.registration.registeredOn}</dd>
            </div>
            <div>
              <dt className="label">Focus</dt>
              <dd className="mt-2 text-ink">Consulting &amp; product engineering</dd>
            </div>
            <div>
              <dt className="label">Product</dt>
              <dd className="mt-2 text-ink">{SADHYA.name}</dd>
            </div>
          </dl>
        }
        aside={<GrowingPlant className="mx-auto max-w-[190px] text-accent" />}
      />

      <div className="container-tl">
        <TextSection label="01 / The company" title={`What ${COMPANY.name} is`}>
          <p className="body-text">
            Srijya is a technology and digital solutions company. We help
            organisations turn complex ideas into practical digital products and technology
            solutions — sometimes by advising on a decision, more often by designing and building
            the thing itself.
          </p>
          <p className="body-text">
            The work sits between four areas that are usually separated: technology consulting,
            digital product engineering, software solutions, and emerging technology. In practice
            they are rarely separable. A recommendation is worth more when the people making it
            have built the kind of system they are recommending; a build is worth more when
            someone questioned the brief first.
          </p>
          <p className="body-text">
            We are an emerging company rather than a large one, and the site says so rather than
            implying otherwise. What that buys a client is direct access to the people doing the
            work.
          </p>
        </TextSection>

        <TextSection label="02 / Beliefs" title="What we believe">
          <p className="body-text">
            Technology is most valuable when it solves something real. Most of what makes a
            digital product good is decided before any of it is interesting to build: what problem
            is being solved, for whom, and what is being deliberately left out.
          </p>
          <p className="body-text">
            We would rather ship a smaller thing that works than a larger thing that demonstrates
            capability. Complexity is easy to add and expensive to carry, and someone carries it
            long after the engagement ends.
          </p>
        </TextSection>

        <TextSection label="03 / Practice" title="How we work">
          <p className="body-text">
            Four stages, whatever the size of the engagement: understand the problem, shape a
            direction, build it, and keep improving it against real use. The stages are described
            in full on the home page, and they are not a methodology to be sold — they are simply
            the order in which the work goes wrong if it is done backwards.
          </p>
          <p className="body-text">
            Engagements are scoped small at the start. A short, well-defined piece of work tells
            both sides more about whether a longer one is a good idea than any amount of
            proposal-writing.
          </p>
          <div className="pt-3">
            <Link to="/#approach" className="link-arrow">
              See the four stages
              <ArrowRight />
            </Link>
          </div>
        </TextSection>

        <TextSection label="04 / Mindset" title="Technology & product mindset">
          <p className="body-text">
            We treat technology decisions as product decisions. The choice of architecture, the
            boundary between two services, the decision to buy rather than build — each of these
            shows up eventually in what a person using the software can and cannot do, and how
            quickly it can change when they need something different.
          </p>
          <p className="body-text">
            That is also how we approach AI. It is a capability to be applied where it improves a
            specific outcome, with the result checked, not a layer to be added because it is
            available.
          </p>
        </TextSection>

        <TextSection label="05 / Products" title="Our product philosophy">
          <p className="body-text">
            Building our own products keeps the consulting honest. Running something end to end —
            design, engineering, infrastructure, support, the cost of a decision made a year ago —
            is a different discipline from advising on it, and it is the part that is hardest to
            learn from the outside.
          </p>
          <p className="body-text">
            Products are developed under the Srijya name and kept distinct from client work.
            When one is ready to be public, it appears on this site. Until then it does not.
          </p>
        </TextSection>

        <TextSection label="06 / Flagship" title={SADHYA.name}>
          <p className="body-text">
            {SADHYA.summary} It is built and operated by Srijya — a product of the
            company, not a client project — and it is where our work on retrieval-grounded AI,
            content pipelines and learning interfaces is applied end to end.
          </p>
          <div className="flex flex-wrap items-center gap-x-8 gap-y-4 pt-2">
            <Link to="/products/sadhya" className="link-arrow">
              How it was built
              <ArrowRight />
            </Link>
            <a
              href={SADHYA.url}
              target="_blank"
              rel="noopener noreferrer"
              className="link-arrow text-ink-2"
            >
              {SADHYA.domain}
              <ArrowUpRight size={14} />
            </a>
          </div>
        </TextSection>

        <section className="border-t border-line py-12 md:py-16" {...revealProps()}>
          <div className="grid gap-y-5 md:grid-cols-12 md:gap-x-10">
            <div className="md:col-span-3">
              <p className="label">07 / Principles</p>
            </div>
            <div className="grid gap-8 sm:grid-cols-2 md:col-span-8">
              {PRINCIPLES.map((principle) => (
                <div key={principle.title}>
                  <h3 className="heading-4 text-ink">{principle.title}</h3>
                  <p className="body-text mt-3">{principle.body}</p>
                </div>
              ))}
            </div>
          </div>
        </section>
      </div>

      <ContactCTA />
    </>
  );
}
