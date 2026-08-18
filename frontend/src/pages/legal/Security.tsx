import { Link } from 'react-router-dom';
import LegalPage, { P, UL, H3 } from '../../components/landing/LegalPage';
import { SITE } from '../../lib/siteConfig';

/**
 * Security page.
 *
 * Every control described here corresponds to something actually in the codebase —
 * Firebase Authentication, Firestore security rules, helmet, cors, express-rate-limit
 * backed by Redis, and the payments service's server-side amount computation plus
 * HMAC signature verification. Keep it that way: a security page that overstates is
 * worse than no security page.
 */
export default function Security() {
  return (
    <LegalPage
      title="Security"
      intro="How we protect your account, your documents and your payments — and how to tell us if you find a hole in it."
      sections={[
        {
          id: 'accounts',
          title: '1. Accounts and access',
          body: (
            <>
              <P>
                Sign-in is handled by Firebase Authentication. If you use Google sign-in, your
                password is never sent to us and we never see it. Session tokens are short-lived and
                refreshed automatically.
              </P>
              <P>
                Every request to our API is verified against the caller&rsquo;s identity token
                before it reaches your data, and database access is constrained by server-side
                security rules so that one account cannot read another&rsquo;s notebooks,
                conversations or results.
              </P>
            </>
          ),
        },
        {
          id: 'data',
          title: '2. Your data in transit and at rest',
          body: (
            <UL
              items={[
                'All traffic between your browser and our servers uses TLS. We do not accept unencrypted connections.',
                'Documents you upload are stored in Google Cloud Storage and your records in Firestore, both encrypted at rest by default.',
                'The embeddings generated from your documents are stored separately in Pinecone, keyed to your account.',
                'Deleted items go to Trash, are recoverable for 30 days, and are then removed along with their embeddings.',
              ]}
            />
          ),
        },
        {
          id: 'payments',
          title: '3. Payments',
          body: (
            <>
              <P>
                Payments run through Razorpay, a PCI-DSS compliant gateway. Card numbers, CVVs, UPI
                PINs and netbanking credentials are entered inside Razorpay&rsquo;s own window —
                they never pass through, and are never stored on, Sadhya&rsquo;s servers.
              </P>
              <P>Two details worth stating plainly, because they are where payment bugs usually live:</P>
              <UL
                items={[
                  'The amount you are charged is computed on our server from the plan you selected. A modified request from a browser cannot change the price.',
                  'Every payment confirmation is verified against a cryptographic signature before Pro is activated, so a forged success response cannot unlock a subscription.',
                ]}
              />
            </>
          ),
        },
        {
          id: 'platform',
          title: '4. Platform hardening',
          body: (
            <UL
              items={[
                'Security headers are set on every response, and cross-origin access is restricted to our own domains.',
                'Rate limits protect the API against brute-force and scraping, with counters held in Redis so they apply across all server instances rather than per-process.',
                'Request payloads are validated against strict schemas before they reach business logic.',
                'Secrets and API keys are held in environment configuration, never in the client bundle or the repository.',
              ]}
            />
          ),
        },
        {
          id: 'ai',
          title: '5. AI providers',
          body: (
            <P>
              Answering a question requires sending your question, the retrieved passages and a
              summary of your profile to our AI providers. Which providers those are, and what they
              may do with the data, is set out in the{' '}
              <Link to="/privacy" className="underline underline-offset-2">privacy policy</Link>. We
              do not sell your content and we do not let it be used to train third-party foundation
              models.
            </P>
          ),
        },
        {
          id: 'disclosure',
          title: '6. Reporting a vulnerability',
          body: (
            <>
              <P>
                If you have found a security issue, please tell us before you tell anyone else. Email{' '}
                <a href={`mailto:${SITE.email.security}`} className="underline underline-offset-2">
                  {SITE.email.security}
                </a>{' '}
                with enough detail to reproduce it — the endpoint or page, the steps, and what you
                were able to access.
              </P>

              <H3>What we commit to</H3>
              <UL
                items={[
                  'We acknowledge your report within 2 working days.',
                  'We tell you our assessment and expected fix timeline within 10 working days.',
                  'We will not pursue legal action against you for research carried out in good faith and within the boundaries below.',
                  'We will credit you when the fix ships, if you would like us to.',
                ]}
              />

              <H3>What we ask</H3>
              <UL
                items={[
                  'Test only against your own account. Do not access, modify or delete another user’s data.',
                  'Do not run denial-of-service, spam or social-engineering attacks against us, our staff or our users.',
                  'Give us reasonable time to fix the issue before disclosing it publicly.',
                  'Do not exfiltrate data. If you can prove the issue with a single record, stop there.',
                ]}
              />
              <P>
                We do not currently run a paid bug-bounty programme, so we cannot promise a
                monetary reward — but we take reports seriously and we will say thank you properly.
              </P>
            </>
          ),
        },
        {
          id: 'incident',
          title: '7. If something goes wrong',
          body: (
            <P>
              No system is perfectly secure. If a breach affects your personal data we will notify
              you and the Data Protection Board of India within the timeframes the Digital Personal
              Data Protection Act, 2023 requires, describe what happened and what data was involved,
              and tell you what to do about it.
            </P>
          ),
        },
      ]}
    />
  );
}
