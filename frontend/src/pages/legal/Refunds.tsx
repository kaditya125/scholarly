import { Link } from 'react-router-dom';
import LegalPage, { P, UL, H3 } from '../../components/landing/LegalPage';
import { SITE, PRO_MONTHLY_INR, PRO_YEARLY_TOTAL_INR } from '../../lib/siteConfig';

/**
 * Refunds & Cancellation policy.
 * Transparent, student-first terms covering self-service in-app refunds,
 * Razorpay timelines (UPI vs Cards), and data preservation guarantees.
 */
export default function Refunds() {
  return (
    <LegalPage
      title="Refunds & Cancellation"
      intro="When you can cancel, when you can get your money back, how to trigger 1-click refunds, and how long it takes."
      sections={[
        {
          id: 'summary',
          title: '1. The short version',
          body: (
            <>
              <UL
                items={[
                  'Cancel whenever you like — you retain complete Pro access until the end of the billing cycle you already paid for.',
                  '7-Day 100% Refund Policy: If you are new to Pro and decide it isn’t right for you, request a 100% full refund within 7 days of your purchase.',
                  'Self-Service 1-Click Refund: Trigger instant automated refunds directly from Settings → Plan & Billing without waiting for email support.',
                  'Fast UPI & Card Refund Timelines: UPI refunds typically credit within 1–3 business days; Cards and Netbanking within 5–7 working days.',
                  '100% Study Data Preserved: Refunding or cancelling never deletes your notebooks, study circles, community posts, or chat history. You simply revert to the generous Free tier.',
                  'Charged twice, or charged after cancelling? We refund that in full, always.',
                ]}
              />
              <P>
                The rest of this page sets out the detailed terms and self-service procedures. If your situation is unique,
                contact our support team at{' '}
                <a href={`mailto:${SITE.email.support}`} className="underline underline-offset-2 font-semibold">
                  {SITE.email.support}
                </a>{' '}
                and we will resolve it promptly.
              </P>
            </>
          ),
        },
        {
          id: 'cancel',
          title: '2. Cancelling your subscription',
          body: (
            <>
              <P>
                You can cancel your subscription at any time directly from <strong className="font-semibold">Settings → Plan &amp; Billing</strong>,
                or by emailing{' '}
                <a href={`mailto:${SITE.email.support}`} className="underline underline-offset-2">
                  {SITE.email.support}
                </a>{' '}
                from your registered account email.
              </P>
              <P>
                Cancelling stops all future recurring charges immediately. It does not prematurely terminate your active period — if you
                cancel a monthly subscription on day 3, you keep your full Pro allowances (up to 2,000 AI Chat messages, 300 minutes of Voice,
                100 document uploads, 25 podcasts, and 1,000 mock tests) for the remaining 27 days you already paid for.
              </P>
              <P>
                <strong className="font-semibold">Data Preservation Guarantee:</strong> Your account, study materials, smart notebooks,
                saved flashcards, and community discussions are never deleted upon cancellation. You automatically drop back to the Free plan
                (100 AI Chat messages/mo, 15 min Voice Tutoring/mo, 5 documents, 1 podcast, 3 AI mock tests, and unlimited PYQs).
              </P>
            </>
          ),
        },
        {
          id: 'refunds',
          title: '3. When we refund (7-Day 100% Refund Policy)',
          body: (
            <>
              <H3>First-time Pro purchase — 7 days</H3>
              <P>
                If you subscribe to Sadhya Pro (Monthly at ₹{PRO_MONTHLY_INR} or Annual at ₹{PRO_YEARLY_TOTAL_INR.toLocaleString('en-IN')})
                and decide within <strong className="font-semibold">7 calendar days</strong> of the transaction that it doesn’t meet your study needs,
                you can claim a 100% full refund. No questions asked. This applies once per student account.
              </P>

              <H3>Always refunded in full</H3>
              <UL
                items={[
                  'Duplicate charges resulting from gateway latency or multiple checkout submissions.',
                  'Any automatic charge billed after you requested cancellation.',
                  'Any payment successfully debited from your bank where Pro was not activated on your account.',
                  'Unauthorized or fraudulent transactions, verified in coordination with Razorpay.',
                ]}
              />

              <H3>Extended outage or service failure</H3>
              <P>
                If core AI study tools or tutoring gateways experience extended downtime due to platform infrastructure faults,
                we will automatically extend your subscription duration or issue a proportionate refund, based on your preference.
              </P>
            </>
          ),
        },
        {
          id: 'no-refund',
          title: '4. When refunds are not applicable',
          body: (
            <>
              <UL
                items={[
                  'Refund requests submitted after the 7-day guarantee window from the transaction timestamp.',
                  'Subsequent renewal cycles after the initial 7-day trial period.',
                  'Accounts terminated due to severe violations of our Terms of Service (e.g., unauthorized scraping, commercial credential sharing, or abusive conduct).',
                  'Dissatisfaction with an official competitive exam result, cutoff, or ranking. Sadhya is an AI-powered preparation companion and makes no guarantee of examination results.',
                ]}
              />
              <P>
                Annual subscriptions bought during promotional events are covered by the exact same 7-day refund window as monthly plans.
              </P>
            </>
          ),
        },
        {
          id: 'how',
          title: '5. How to claim a refund (Self-Service & Support)',
          body: (
            <>
              <H3>Method 1: Instant Self-Service in Settings (Recommended)</H3>
              <P>
                For any purchase within the 7-day window, you do not need to wait for email replies:
              </P>
              <UL
                items={[
                  'Go to Settings → Plan & Billing tab.',
                  'Under your active subscription card, click the "Request 100% Refund" button.',
                  'Confirm the refund dialog — the system automatically verifies eligibility, communicates with Razorpay, and triggers the refund transfer immediately.',
                ]}
              />

              <H3>Method 2: Support Email</H3>
              <P>
                Alternatively, email{' '}
                <a href={`mailto:${SITE.email.support}`} className="underline underline-offset-2 font-semibold">
                  {SITE.email.support}
                </a>{' '}
                with your registered account email and Razorpay payment ID (from your email receipt). We process email requests within 24–48 business hours.
              </P>

              <H3>Refund Processing Timelines</H3>
              <UL
                items={[
                  'UPI (Google Pay, PhonePe, Paytm, BHIM): Typically credited to your bank account within 1–3 business days.',
                  'Debit & Credit Cards: Typically reflects on your card statement within 5–7 working days, subject to your card issuer’s billing cycle.',
                  'Netbanking: Credited to your bank account within 3–5 working days.',
                ]}
              />
              <P className="text-xs text-slate-500 dark:text-gray-400">
                All refunds are routed strictly through Razorpay back to the original source account. We never ask for your debit card PIN, OTP, or CVV.
              </P>
            </>
          ),
        },
        {
          id: 'institution',
          title: '6. Institutional & Coaching Batch plans',
          body: (
            <P>
              Bulk educator licenses, coaching centre batches, and school deployments are governed by their respective institutional contracts
              or purchase orders. For billing adjustments or seat reallocations, please contact{' '}
              <a href={`mailto:${SITE.email.sales}`} className="underline underline-offset-2">
                {SITE.email.sales}
              </a>
              .
            </P>
          ),
        },
        {
          id: 'prices',
          title: '7. Pricing, currency & taxes',
          body: (
            <P>
              Sadhya Pro is offered at <strong className="font-semibold">₹{PRO_MONTHLY_INR} per month</strong> (Launch Special rate)
              or <strong className="font-semibold">₹{PRO_YEARLY_TOTAL_INR.toLocaleString('en-IN')} per year</strong> (equivalent to ₹149/month, saving ₹600/year).
              All prices are in Indian Rupees (INR) and processed securely through Razorpay. Complete plan details and allowances are always accessible on the{' '}
              <Link to="/pricing" className="underline underline-offset-2 font-semibold">pricing page</Link>.
            </P>
          ),
        },
      ]}
    />
  );
}
