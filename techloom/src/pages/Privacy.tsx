import { Link } from 'react-router-dom';
import PageHeader from '@/components/PageHeader';
import TextSection from '@/components/TextSection';
import { useSeo } from '@/lib/useSeo';
import { COMPANY, SADHYA } from '@/site.config';

/**
 * Privacy notice for this website only.
 *
 * Written to describe what the site actually does, which is very little: no
 * analytics, no advertising, no cookies, one third-party request for the
 * typeface, and one browser-local value for the theme. If any of that changes,
 * this page changes with it — an inaccurate privacy notice is worse than none.
 */
export default function Privacy() {
  useSeo({
    title: `Privacy — ${COMPANY.name}`,
    description: `How this website handles information. ${COMPANY.name} does not track visitors or use advertising cookies.`,
    path: '/privacy',
  });

  return (
    <>
      <PageHeader
        label="Legal"
        title="Privacy notice."
        lede={`How this website handles information. Last updated ${COMPANY.legalLastUpdated}.`}
      />

      <div className="container-tl">
        <TextSection label="Scope" title="What this covers" size="small">
          <p className="body-text">
            This notice covers this website only — the pages under this domain, operated by{' '}
            {COMPANY.name}. Our products have their own policies: if you use {SADHYA.name}, the
            notice that applies to you is the one published at {SADHYA.domain}.
          </p>
        </TextSection>

        <TextSection label="Collection" title="What we collect" size="small">
          <p className="body-text">
            Nothing, unless you send it to us. This site has no analytics, no advertising
            trackers, no session cookies and no visitor profiling. We do not know who you are or
            which pages you read.
          </p>
          <p className="body-text">
            One value is stored in your browser: your light or dark theme choice, kept in local
            storage so the site remembers it on your next visit. It never leaves your device and
            we cannot read it.
          </p>
        </TextSection>

        <TextSection label="Third parties" title="Requests to other services" size="small">
          <p className="body-text">
            The site loads its typeface from Google Fonts. Making that request tells Google your
            IP address and general browser information, as any request to any server does. No
            other third-party service is used on these pages.
          </p>
        </TextSection>

        <TextSection label="Contact form" title="If you write to us" size="small">
          <p className="body-text">
            The contact form collects your name, email address, and whatever you choose to put in
            the message, company and budget fields. Unless the deployment is configured with a
            submission endpoint, submitting the form simply opens your own email client with the
            message ready — the details never pass through this website at all.
          </p>
          <p className="body-text">
            We use what you send only to reply to you and, if it leads somewhere, to carry on that
            conversation. We do not sell it, share it for marketing, or add you to a mailing list.
          </p>
        </TextSection>

        <TextSection label="Retention & rights" title="Keeping and removing information" size="small">
          <p className="body-text">
            Enquiries are kept in our email while a conversation is live and for a reasonable
            period afterwards, in case it resumes. You can ask us at any time for a copy of what
            we hold about you, or ask us to delete it, and we will do so unless we are required to
            keep it.
          </p>
          {COMPANY.email ? (
            <p className="body-text">
              Write to{' '}
              <a
                href={`mailto:${COMPANY.email}`}
                className="text-ink underline decoration-line-2 underline-offset-4 hover:decoration-ink"
              >
                {COMPANY.email}
              </a>{' '}
              for anything on this page.
            </p>
          ) : (
            <p className="body-text">
              Use the{' '}
              <Link to="/contact" className="text-ink underline underline-offset-4">
                contact page
              </Link>{' '}
              for anything on this page.
            </p>
          )}
        </TextSection>

        <TextSection label="Changes" title="Updates to this notice" size="small">
          <p className="body-text">
            If what the site does changes, this page is updated and the date at the top changes
            with it. There is no archive of previous versions — the current one is what applies.
          </p>
        </TextSection>
      </div>
    </>
  );
}
