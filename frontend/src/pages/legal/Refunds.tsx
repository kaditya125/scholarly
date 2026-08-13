import { Link } from 'react-router-dom';
import LegalPage, { P, UL, H3 } from '../../components/landing/LegalPage';
import { SITE, PRO_MONTHLY_INR } from '../../lib/siteConfig';

/**
 * Refunds & Cancellation policy.
 *
 * Razorpay's merchant-activation review requires a publicly reachable cancellation and
 * refund policy, so this page is a prerequisite for taking live payments, not a nicety.
 *
 * ⚠ The 7-day window and the "no pro-rata on partial periods" rule below are business
 * decisions, not facts read out of the codebase. Confirm both before launch — whatever is
 * published here is what you are bound to honour.
 */
export default function Refunds() {
  return (
    <LegalPage
      title="Refunds & Cancellation"
      intro="When you can cancel, when you can get your money back, and how long it takes."
      sections={[
        {
          id: 'summary',
          title: '1. The short version',
          body: (
            <>
              <UL
                items={[
                  'Cancel whenever you like — you keep access until the end of the period you already paid for.',
                  'New to Pro? If it isn’t for you, ask for a full refund within 7 days of your first payment.',
                  'Charged twice, or charged after cancelling? We refund that in full, always.',
                  'Refunds go back to the method you paid with, typically within 5–7 working days.',
                ]}
              />
              <P>
                The rest of this page sets out the detail. If your situation isn&rsquo;t covered,
                write to{' '}
                <a href={`mailto:${SITE.email.support}`} className="underline underline-offset-2">
                  {SITE.email.support}
                </a>{' '}
                — we would rather sort it out than argue about it.
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
                You can cancel at any time from <strong className="font-semibold">Settings →
                Billing</strong>, or by emailing{' '}
                <a href={`mailto:${SITE.email.support}`} className="underline underline-offset-2">
                  {SITE.email.support}
                </a>{' '}
                from the address on your account.
              </P>
              <P>
                Cancelling stops the next renewal. It does not end your current period — if you
                cancel a monthly subscription on day 3, you keep Pro for the remaining days you paid
                for, and are not charged again.
              </P>
              <P>
                Your account is not deleted when you cancel. You drop back to the free tier and keep
                your notebooks, history and progress.
              </P>
            </>
          ),
        },
        {
          id: 'refunds',
          title: '3. When we refund',
          body: (
            <>
              <H3>First-time Pro purchase — 7 days</H3>
              <P>
                If you are subscribing to Pro for the first time and decide within{' '}
                <strong className="font-semibold">7 days</strong> of the payment that it isn&rsquo;t
                right for you, tell us and we will refund it in full. You don&rsquo;t need to explain
                why. This applies once per account.
              </P>

              <H3>Always refunded</H3>
              <UL
                items={[
                  'Duplicate charges for the same period.',
                  'Any amount taken after you cancelled.',
                  'A payment that was debited but where Pro was never activated on your account.',
                  'Charges you did not authorise, once verified with the payment gateway.',
                ]}
              />

              <H3>Service failure</H3>
              <P>
                If a paid feature is unavailable for a prolonged period because of a fault on our
                side, write to us. We will extend your subscription for the lost time or refund a
                proportionate amount, whichever you prefer.
              </P>
            </>
          ),
        },
        {
          id: 'no-refund',
          title: '4. When we don’t refund',
          body: (
            <>
              <UL
                items={[
                  'Part-used periods outside the 7-day window — we don’t pro-rate a month or a year you chose to buy, though you keep access to the end of it.',
                  'Renewals you forgot to cancel where we gave notice before charging, beyond the correction window in section 3.',
                  'Accounts terminated for a breach of our terms — for example sharing credentials or misusing the service.',
                  'Dissatisfaction with an examination result, rank or admission outcome. Scholarly is a study aid and makes no promise about results.',
                ]}
              />
              <P>
                Annual plans bought at the discounted rate are covered by the same 7-day window as
                monthly plans.
              </P>
            </>
          ),
        },
        {
          id: 'how',
          title: '5. How to ask for a refund',
          body: (
            <>
              <P>
                Email{' '}
                <a href={`mailto:${SITE.email.support}`} className="underline underline-offset-2">
                  {SITE.email.support}
                </a>{' '}
                from the address registered on your account, with:
              </P>
              <UL
                items={[
                  'the payment or order reference from your receipt,',
                  'the date of the charge, and',
                  'a line on what went wrong, if anything did.',
                ]}
              />
              <P>
                We acknowledge within 2 working days and decide within 7. If we approve it, the
                refund is issued to the original payment method through Razorpay and normally
                appears within 5–7 working days, depending on your bank. We do not refund to a
                different account or by any other route.
              </P>
            </>
          ),
        },
        {
          id: 'institution',
          title: '6. Institutional plans',
          body: (
            <P>
              Bulk and institutional subscriptions are governed by the signed agreement or purchase
              order between us, which takes precedence over this page. For anything related to an
              institutional invoice, contact{' '}
              <a href={`mailto:${SITE.email.sales}`} className="underline underline-offset-2">
                {SITE.email.sales}
              </a>
              .
            </P>
          ),
        },
        {
          id: 'prices',
          title: '7. Prices and currency',
          body: (
            <P>
              Pro is ₹{PRO_MONTHLY_INR} per month, with a discount for annual billing — the current
              figures are always on the{' '}
              <Link to="/pricing" className="underline underline-offset-2">pricing page</Link>. All
              charges are in Indian Rupees and are collected by Razorpay. Your bank may apply its own
              conversion or transaction fees, which we cannot refund.
            </P>
          ),
        },
      ]}
    />
  );
}
