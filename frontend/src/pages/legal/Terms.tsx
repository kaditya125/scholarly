import { Link } from 'react-router-dom';
import LegalPage, { P, UL, H3 } from '../../components/landing/LegalPage';
import { SITE, PRO_MONTHLY_INR, PRO_YEARLY_TOTAL_INR } from '../../lib/siteConfig';

/**
 * Terms of Service.
 *
 * Written against what the product actually does. The AI-output clause matters more here
 * than in most SaaS terms: this is an exam-preparation tool, users will act on its answers,
 * and the honest position is that a generated explanation is a study aid to be verified —
 * not an authority.
 */
export default function Terms() {
  return (
    <LegalPage
      title="Terms of Service"
      intro={`The agreement between you and ${SITE.legalEntity} for the use of Scholarly. Please read it before you create an account or subscribe.`}
      sections={[
        {
          id: 'about',
          title: '1. Who we are, and what this covers',
          body: (
            <>
              <P>
                Scholarly is an AI-assisted learning platform operated by {SITE.legalEntity}
                {SITE.cin ? ` (CIN ${SITE.cin})` : ''}, with its registered office at{' '}
                {SITE.address.line1}, {SITE.address.city}, {SITE.address.state}, {SITE.address.country}.
                In these terms, &ldquo;we&rdquo;, &ldquo;us&rdquo; and &ldquo;Scholarly&rdquo; mean that company,
                and &ldquo;you&rdquo; means the person using the service.
              </P>
              <P>
                These terms apply to the website, the web application and every feature reachable
                through them. By creating an account, or by continuing to use Scholarly, you agree
                to them. If you do not agree, please do not use the service.
              </P>
            </>
          ),
        },
        {
          id: 'eligibility',
          title: '2. Eligibility, and accounts for under-18s',
          body: (
            <>
              <P>
                You must be at least 18 years old to create an account in your own name and to
                purchase a subscription.
              </P>
              <P>
                Scholarly is designed for school and competitive-exam preparation, so we expect
                many learners to be under 18. A person under 18 may use Scholarly only through an
                account created and supervised by a parent or legal guardian, who accepts these
                terms on their behalf and is responsible for all activity on that account,
                including any payment. Where the law requires verifiable parental consent before
                a child&rsquo;s personal data is processed, that consent must be given before the
                account is used. Our{' '}
                <Link to="/privacy" className="underline underline-offset-2">privacy policy</Link>{' '}
                explains how we handle a child&rsquo;s data.
              </P>
            </>
          ),
        },
        {
          id: 'account',
          title: '3. Your account',
          body: (
            <>
              <P>
                You are responsible for keeping your login credentials confidential and for
                everything done through your account. Tell us promptly at{' '}
                <a href={`mailto:${SITE.email.support}`} className="underline underline-offset-2">
                  {SITE.email.support}
                </a>{' '}
                if you believe it has been accessed by someone else.
              </P>
              <P>
                An account is personal to you. Sharing credentials, or using one account to serve
                several learners, is not permitted — institutions should use an institutional plan
                instead.
              </P>
            </>
          ),
        },
        {
          id: 'ai',
          title: '4. What Scholarly is — and what it is not',
          body: (
            <>
              <P>
                Scholarly generates explanations, summaries, practice questions, audio and video
                using artificial-intelligence models, drawing on curriculum material and on
                documents you upload. It shows you the sources it retrieved and the steps it took
                so that you can check its work.
              </P>
              <P>
                <strong className="font-semibold text-slate-900 dark:text-white">
                  AI output can still be wrong, incomplete or out of date.
                </strong>{' '}
                Scholarly is a study aid, not an authority. Before you rely on anything it tells
                you — and especially before you write it in an examination — verify it against
                your prescribed textbook, your official syllabus, or your teacher.
              </P>
              <P>
                We make no promise about examination results, ranks, scores, admissions or
                selection. Nothing Scholarly produces is professional advice of any kind, including
                medical, legal, financial or career advice.
              </P>
              <P>
                Exam names, patterns and syllabi referred to in the product belong to the
                respective examination authorities. Scholarly is an independent preparation tool
                and is not affiliated with, endorsed by, or certified by any examination board,
                authority or university.
              </P>
            </>
          ),
        },
        {
          id: 'use',
          title: '5. Acceptable use',
          body: (
            <>
              <P>You agree not to:</P>
              <UL
                items={[
                  'Upload material you have no right to share, including copyrighted books, question papers or course material you do not own or licence.',
                  'Use the service to cheat in an examination, assessment or interview, or to produce work you present as your own where that is prohibited.',
                  'Attempt to extract, scrape, resell or redistribute Scholarly’s outputs, question banks or curriculum data as a competing product.',
                  'Probe, scan or interfere with the security or availability of the service, or attempt to bypass rate limits, quotas or access controls.',
                  'Submit content that is unlawful, abusive, harassing, hateful, sexually explicit, or that endangers a minor.',
                  'Use the service to build or train a competing machine-learning model.',
                ]}
              />
              <P>
                We may apply reasonable technical limits — rate limits and fair-use ceilings — to
                keep the service available to everyone, and may adjust them.
              </P>
            </>
          ),
        },
        {
          id: 'content',
          title: '6. Your content',
          body: (
            <>
              <P>
                Documents, notes, questions and messages you put into Scholarly remain yours. We
                claim no ownership of them.
              </P>
              <P>
                To operate the service, you grant us a limited, worldwide, royalty-free licence to
                host, store, copy, process, transmit and display your content — for example to
                extract text from a PDF, split it into passages, generate embeddings so it can be
                searched, and produce answers, audio or summaries for you. This licence exists only
                so that we can run the features you asked for, and it ends when you delete the
                content or your account, subject to the retention periods in our privacy policy.
              </P>
              <P>
                We do not sell your content, and we do not use it to train foundation models for
                third parties.
              </P>
            </>
          ),
        },
        {
          id: 'billing',
          title: '7. Subscriptions, billing and renewal',
          body: (
            <>
              <H3>Plans and prices</H3>
              <P>
                Scholarly has a free tier and a paid <strong className="font-semibold">Pro</strong>{' '}
                subscription at ₹{PRO_MONTHLY_INR} per month, or ₹
                {PRO_YEARLY_TOTAL_INR.toLocaleString('en-IN')} when billed once annually. Current
                prices are always shown on the{' '}
                <Link to="/pricing" className="underline underline-offset-2">pricing page</Link>, and
                the amount charged is computed on our servers at the moment you check out.
                Institutional pricing is agreed separately in writing.
              </P>

              <H3>Payment</H3>
              <P>
                Payments are collected by Razorpay, our payment gateway. Your card, UPI or netbanking
                credentials are entered inside Razorpay&rsquo;s own PCI-DSS compliant window and are
                never stored on, or transmitted through, Scholarly&rsquo;s servers. We receive only
                the outcome of the payment and a reference identifier.
              </P>

              <H3>Renewal</H3>
              <P>
                A subscription runs for the period you paid for. Where a plan is set to renew
                automatically, we will tell you before it does, and you may turn renewal off at any
                time from Settings. Turning renewal off keeps your access until the end of the
                period you have already paid for.
              </P>

              <H3>Taxes and changes</H3>
              <P>
                Prices are in Indian Rupees and include applicable taxes unless stated otherwise. We
                may change prices; a change will never alter the price of a period you have already
                paid for, and we will give you notice before it applies to a renewal.
              </P>
            </>
          ),
        },
        {
          id: 'refunds',
          title: '8. Cancellation and refunds',
          body: (
            <P>
              Cancellations and refunds are governed by our{' '}
              <Link to="/refunds" className="underline underline-offset-2">
                refunds &amp; cancellation policy
              </Link>
              , which forms part of these terms.
            </P>
          ),
        },
        {
          id: 'ip',
          title: '9. Our intellectual property',
          body: (
            <P>
              The Scholarly name, logo, interface, software, curriculum structuring and question
              banks are owned by us or our licensors. These terms give you a personal,
              non-exclusive, non-transferable right to use the service — not to copy, modify,
              reverse-engineer, or create derivative works from it.
            </P>
          ),
        },
        {
          id: 'availability',
          title: '10. Availability and changes',
          body: (
            <>
              <P>
                We work to keep Scholarly available, but we do not guarantee uninterrupted service.
                Features depend in part on third-party providers, and may be interrupted for
                maintenance, capacity limits or events outside our control.
              </P>
              <P>
                We may add, change or withdraw features. If we withdraw something material that you
                are actively paying for, we will give you reasonable notice and, where appropriate,
                a pro-rata refund for the unused period.
              </P>
            </>
          ),
        },
        {
          id: 'termination',
          title: '11. Suspension and termination',
          body: (
            <>
              <P>
                You may stop using Scholarly and delete your account at any time from Settings.
              </P>
              <P>
                We may suspend or terminate an account that breaches these terms, that is used
                unlawfully, or that puts the service or other users at risk. Where the breach is
                capable of being fixed and the circumstances allow it, we will give you notice and
                an opportunity to fix it first. If we terminate an account without cause, we will
                refund the unused portion of any prepaid period.
              </P>
            </>
          ),
        },
        {
          id: 'liability',
          title: '12. Limitation of liability',
          body: (
            <>
              <P>
                To the extent permitted by law, we are not liable for indirect or consequential
                loss, loss of profit, loss of opportunity, or loss arising from examination
                outcomes, admissions decisions or reliance on AI-generated content.
              </P>
              <P>
                Where liability cannot lawfully be excluded, our total liability to you in any
                twelve-month period is limited to the amount you actually paid us for the service in
                that period.
              </P>
              <P>
                Nothing in these terms limits liability for fraud, for death or personal injury
                caused by negligence, or for anything else that cannot be limited under Indian law.
              </P>
            </>
          ),
        },
        {
          id: 'law',
          title: '13. Governing law and disputes',
          body: (
            <P>
              These terms are governed by the laws of India. The courts at {SITE.jurisdiction} have
              exclusive jurisdiction over any dispute. Before starting proceedings, please write to{' '}
              <a href={`mailto:${SITE.email.legal}`} className="underline underline-offset-2">
                {SITE.email.legal}
              </a>{' '}
              so we can try to resolve it directly.
            </P>
          ),
        },
        {
          id: 'changes',
          title: '14. Changes to these terms',
          body: (
            <P>
              We may update these terms. When we make a material change we will update the
              &ldquo;last updated&rdquo; date above and, for significant changes, notify you in the
              app or by email. Continuing to use Scholarly after a change takes effect means you
              accept the revised terms.
            </P>
          ),
        },
      ]}
    />
  );
}
