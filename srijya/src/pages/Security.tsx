import { Link } from 'react-router-dom';
import { ArrowRight } from '@/components/Icons';
import PageHeader from '@/components/PageHeader';
import TextSection from '@/components/TextSection';
import { revealProps } from '@/lib/reveal';
import { useSeo } from '@/lib/useSeo';
import { COMPANY, SADHYA } from '@/site.config';

/**
 * How data is handled in the systems Srijya builds.
 *
 * Deliberately NOT a second privacy notice. /privacy covers this website — what
 * it collects, what it does not, and the one third-party request it makes. This
 * page answers the different question an organisation asks before handing over
 * a system: how will you treat our data and our users' data while building it.
 *
 * Every practice described here is one that can be checked against something
 * running — mostly against this site and Sadhya. The section on what Srijya does
 * not have is there because it is the first thing a procurement process asks
 * for, and a company without certifications should say so rather than let the
 * silence imply otherwise.
 */
export default function Security() {
  useSeo({
    title: `Data and security — ${COMPANY.name}`,
    description: `How ${COMPANY.name} handles data in the systems it builds: credentials, public endpoints, grounded AI, and what we deliberately do not collect.`,
    path: '/security',
  });

  return (
    <>
      <PageHeader
        label="Data and security"
        title="How we handle data."
        lede="What we do in the systems we build, and what we deliberately do not do. Most of it can be checked against something already running."
      />

      <div className="container-tl">
        <TextSection label="01 / Credentials" title="Keys stay on the server">
          <p className="body-text">
            No API key, model credential or service token is ever placed in front-end code. Code
            that runs in a browser is readable by anyone who opens it, so a key shipped there is a
            key published. Every integration that needs a secret is called from a server, and the
            browser talks only to our own endpoints.
          </p>
          <p className="body-text">
            The assistant on this site is an example: it sends a question to an endpoint and
            receives an answer. The model, the prompt and the credentials are not in the page, and
            nothing in the page reveals them.
          </p>
        </TextSection>

        <TextSection label="02 / Public endpoints" title="Anything open is rate limited">
          <p className="body-text">
            An endpoint that anyone on the internet can call is an endpoint that will be called by
            people you did not expect. Public routes are rate limited and their payloads are
            bounded before they reach anything expensive — a model, a database, a third-party API
            — rather than after.
          </p>
        </TextSection>

        <TextSection label="03 / Collection" title="We collect as little as will do">
          <p className="body-text">
            The most reliable way to protect information is not to hold it. Ask Srijya keeps no
            session and stores no conversation: a question is answered and nothing is written
            down. This site runs no analytics, sets no advertising cookies and builds no profile
            of anyone reading it — the only thing kept in your browser is which colour theme you
            chose.
          </p>
          <p className="body-text">
            The same question gets asked of every system we build: what is the least this needs to
            know, and how long does it genuinely need to keep it.
          </p>
        </TextSection>

        <TextSection label="04 / AI systems" title="Grounded, traceable, and willing to refuse">
          <p className="body-text">
            An AI feature that cannot say where an answer came from is a liability in any setting
            where being wrong has a cost. We build retrieval against a specific, known body of
            source material rather than against the open internet, so an answer can be traced to
            what produced it.
          </p>
          <p className="body-text">
            Just as important is what a system does when it does not know. Ask Srijya answers only
            from our published help centre and refuses everything else, rather than assembling a
            plausible sentence — you can test that on this page. A model that guesses confidently
            is worse than one that stops.
          </p>
        </TextSection>

        <TextSection label="05 / Public code" title="What never goes in a repository">
          <p className="body-text">
            Credentials, personal data and identity documents do not belong in source control,
            public or private — history is forever and access changes over time. Configuration
            that must vary by environment is supplied at deploy time; what stays in the repository
            is the shape of it, not the values.
          </p>
        </TextSection>

        <TextSection label="06 / Limits" title="What we do not have">
          <p className="body-text">
            Srijya holds no security certifications — no ISO 27001, no SOC 2, no independent
            audit. We are a small company and have not been through those processes. If your
            procurement requires one, we are not currently the right fit, and it is better that
            you know that from this page than three meetings in.
          </p>
          <p className="body-text">
            We also do not publish a formal SLA or an uptime figure. What we can do is talk
            specifically about how a system you are considering would be built, hosted and
            recovered, and put that in writing for the engagement.
          </p>
        </TextSection>

        <TextSection label="07 / Reporting" title="If you find a problem">
          <p className="body-text">
            If you believe you have found a vulnerability in this site, in {SADHYA.name}, or in
            anything we have built, please tell us before telling anyone else. Write to{' '}
            {COMPANY.email} with enough detail to reproduce it. We will confirm we have received
            it, and we will not pursue anyone who reports a genuine issue in good faith.
          </p>
          <p className="body-text">
            We do not run a paid bug bounty. We would still rather hear from you.
          </p>
        </TextSection>

        <section className="border-t border-line py-12 md:py-16" {...revealProps()}>
          <div className="grid gap-y-6 md:grid-cols-12 md:gap-x-10">
            <div className="md:col-span-3">
              <p className="label">Also</p>
            </div>
            <div className="md:col-span-8">
              <h2 className="display-3 max-w-[20ch]">This website specifically</h2>
              <p className="body-text mt-6 max-w-[56ch]">
                What this site collects, the single third-party request it makes, and how to have
                anything you send us removed, is set out in the privacy notice. {SADHYA.name} is a
                separate product with its own policies, published on its own site.
              </p>
              <div className="mt-8 flex flex-wrap items-center gap-x-8 gap-y-4">
                <Link to="/privacy" className="link-arrow">
                  Privacy notice
                  <ArrowRight />
                </Link>
                <Link to="/contact" className="link-arrow">
                  Ask us something specific
                  <ArrowRight />
                </Link>
              </div>
            </div>
          </div>
        </section>
      </div>
    </>
  );
}
