import PageHeader from '@/components/PageHeader';
import TextSection from '@/components/TextSection';
import { useSeo } from '@/lib/useSeo';
import { COMPANY, SADHYA } from '@/site.config';

/**
 * Terms for this website.
 *
 * A marketing site sells nothing and creates no account, so these are terms of
 * use rather than terms of service: what the content is, what it is not, and
 * which document governs the products instead of this one.
 */
export default function Terms() {
  useSeo({
    title: `Terms — ${COMPANY.name}`,
    description: `Terms of use for the ${COMPANY.name} website.`,
    path: '/terms',
  });

  return (
    <>
      <PageHeader
        label="Legal"
        title="Terms of use."
        lede={`The terms on which this website is provided. Last updated ${COMPANY.legalLastUpdated}.`}
      />

      <div className="container-tl">
        <TextSection label="01" title="Who these terms are with" size="small">
          <p className="body-text">
            This website is operated by {COMPANY.name}, a proprietorship registered in India
            (Udyam {COMPANY.registration.udyam}). Using the site means accepting the terms on this
            page.
          </p>
        </TextSection>

        <TextSection label="02" title="What this site is" size="small">
          <p className="body-text">
            A description of the company and the work it does. Nothing on it is an offer, a quote
            or a commitment to provide services, and nothing on it is professional advice you
            should act on without talking to us about your own situation. Any engagement is
            governed by a separate written agreement, not by this website.
          </p>
        </TextSection>

        <TextSection label="03" title="Accuracy" size="small">
          <p className="body-text">
            We keep this site accurate and correct it when we find it is not. It is provided as
            it is, without warranties, and we are not liable for loss arising from relying on it.
            Nothing here limits liability that cannot be limited under Indian law.
          </p>
        </TextSection>

        <TextSection label="04" title="Content and marks" size="small">
          <p className="body-text">
            The text, design, code and graphics on this site belong to {COMPANY.name} unless
            stated otherwise. You are welcome to read, quote and link to it. Reproducing
            substantial parts of it, or using the TechLoom or {SADHYA.name} names and marks in a
            way that suggests association or endorsement, requires our permission.
          </p>
        </TextSection>

        <TextSection label="05" title="Products and external links" size="small">
          <p className="body-text">
            {SADHYA.name} is operated at {SADHYA.domain} under its own terms and privacy policy;
            those apply to your use of the product, not these. Where we link to other sites, we do
            not control them and are not responsible for their content.
          </p>
        </TextSection>

        <TextSection label="06" title="Governing law" size="small">
          <p className="body-text">
            These terms are governed by the laws of India, and the courts at Noida, Uttar Pradesh
            have jurisdiction over any dispute arising from this website.
          </p>
        </TextSection>

        <TextSection label="07" title="Changes" size="small">
          <p className="body-text">
            We may update these terms. The version on this page is the one that applies, and the
            date at the top shows when it last changed.
          </p>
        </TextSection>
      </div>
    </>
  );
}
