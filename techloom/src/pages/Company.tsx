import { Link } from 'react-router-dom';
import { ArrowRight } from '@/components/Icons';
import PageHeader from '@/components/PageHeader';
import TextSection from '@/components/TextSection';
import { revealProps } from '@/lib/reveal';
import { useSeo } from '@/lib/useSeo';
import { COMPANY, SADHYA } from '@/site.config';

/**
 * Company information.
 *
 * Only the fields that a business publishes about itself: the registered name,
 * how it is constituted, its MSME classification and registration number, the
 * activity it is registered for, and where it operates. Rows with no verified
 * value are omitted rather than filled in.
 *
 * Everything else on the registration — the proprietor's PAN, bank details,
 * personal contact details, residential address and social category — is
 * deliberately not here and must not be added. None of it belongs on a public
 * website, and none of it is in this repository.
 */
export default function Company() {
  useSeo({
    title: `Company information — ${COMPANY.name}`,
    description: `Registered business information for ${COMPANY.name}, the company behind ${SADHYA.name}.`,
    path: '/company',
  });

  const rows: Array<{ term: string; value: string }> = [
    { term: 'Registered name', value: COMPANY.name },
    { term: 'Constitution', value: COMPANY.registration.constitution },
    { term: 'Enterprise classification', value: COMPANY.registration.classification },
    { term: 'Udyam registration number', value: COMPANY.registration.udyam },
    { term: 'Registered on', value: COMPANY.registration.registeredOn },
    { term: 'Registered activity', value: COMPANY.registration.activity },
    { term: 'Operating from', value: COMPANY.location },
    ...(COMPANY.registration.cin ? [{ term: 'CIN', value: COMPANY.registration.cin }] : []),
    ...(COMPANY.registration.gstin ? [{ term: 'GSTIN', value: COMPANY.registration.gstin }] : []),
    ...(COMPANY.email ? [{ term: 'Contact', value: COMPANY.email }] : []),
  ];

  return (
    <>
      <PageHeader
        label="Company"
        title="Company information."
        lede="The registered details of the business behind this site and its products."
      />

      <div className="container-tl">
        <section className="border-t border-line py-12 md:py-16" {...revealProps()}>
          <div className="grid gap-y-6 md:grid-cols-12 md:gap-x-10">
            <div className="md:col-span-3">
              <p className="label">Registration</p>
            </div>
            <div className="md:col-span-9">
              <dl className="grid grid-cols-1">
                {rows.map((row) => (
                  <div
                    key={row.term}
                    className="grid gap-x-8 gap-y-1 border-b border-line py-4 sm:grid-cols-[minmax(0,15rem)_1fr]"
                  >
                    <dt className="text-[0.875rem] text-ink-3">{row.term}</dt>
                    <dd className="text-[0.9375rem] text-ink">{row.value}</dd>
                  </div>
                ))}
              </dl>
              <p className="mt-6 text-[0.8125rem] text-ink-3">
                TechLoom Innovations is registered as a micro enterprise under the Government of
                India&rsquo;s Udyam registration for MSMEs. It is not incorporated as a company
                and is not GST registered, so it has no CIN or GSTIN to publish.
              </p>
            </div>
          </div>
        </section>

        <TextSection label="Products" title="Products operated by TechLoom">
          <p className="body-text">
            {SADHYA.name} ({SADHYA.domain}) is a product of TechLoom Innovations. Purchases,
            subscriptions and support for {SADHYA.name} are handled on its own site, under its own
            terms and privacy policy — this website does not sell anything.
          </p>
          <div className="pt-2">
            <Link to="/products/sadhya" className="link-arrow">
              About {SADHYA.name}
              <ArrowRight />
            </Link>
          </div>
        </TextSection>

        <TextSection label="Note" title="What is not published here">
          <p className="body-text">
            Registration documents contain personal information about the proprietor — identity
            numbers, bank details, personal contact details and a residential address. None of it
            is relevant to anyone doing business with the company, so none of it appears on this
            site. If you need verified details for a contract or for onboarding, ask us directly
            and we will send them to you.
          </p>
          <div className="pt-2">
            <Link to="/contact" className="link-arrow">
              Request details
              <ArrowRight />
            </Link>
          </div>
        </TextSection>
      </div>
    </>
  );
}
