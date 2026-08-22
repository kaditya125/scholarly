import { useEffect, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ChevronDown } from 'lucide-react';
import SiteHeader from '../components/landing/SiteHeader';
import SiteFooter from '../components/landing/SiteFooter';
import PricingSection from '../components/landing/PricingSection';
import { cn } from '../lib/utils';
import { SITE, PRO_MONTHLY_INR, PRO_YEARLY_TOTAL_INR } from '../lib/siteConfig';
import { useSeo } from '../lib/useSeo';

/**
 * /pricing — previously a "coming soon" placeholder, which was a dead end for every
 * link that pointed at it. Now the real plans (shared with the landing page) plus the
 * questions people actually ask before paying.
 */

const FAQS: { q: string; a: ReactNode }[] = [
  {
    q: 'Is the free plan actually usable, or is it a trial?',
    a: (
      <>
        It&rsquo;s a real plan, not a countdown. The AI tutor, scan-and-solve, your notebooks,
        practice quizzes and the adaptive baseline assessment are all available on Free, within
        fair-use limits that exist to keep the service up for everyone. There is no expiry and no
        card required.
      </>
    ),
  },
  {
    q: 'What exactly changes when I go Pro?',
    a: (
      <>
        The fair-use ceiling lifts, the Podcast Studio and generated video lessons open up,
        full-length adaptive mock tests with deep analytics are included, your jobs get priority
        when the queue is busy, and support comes from a person rather than a help article.
      </>
    ),
  },
  {
    q: 'How does yearly billing work?',
    a: (
      <>
        Yearly is charged once up front at ₹{PRO_YEARLY_TOTAL_INR.toLocaleString('en-IN')} (just ₹149/mo) — a <strong>70% saving</strong> against the regular price of ₹5,088/yr. It covers twelve months of unlimited access from the day you pay, with a full 7-day refund guarantee.
      </>
    ),
  },
  {
    q: 'Can I cancel whenever I want?',
    a: (
      <>
        Yes, directly from Settings → Billing, with zero hassle or emails. Cancelling stops the next renewal and you keep Pro until the end of the paid billing cycle. Your notes, notebooks, and test analytics remain safely saved on your Free account. The full detail is in our{' '}
        <Link to="/refunds" className="underline underline-offset-2">refunds &amp; cancellation policy</Link>.
      </>
    ),
  },
  {
    q: 'What is the Launch Event Grandfathered Rate Guarantee?',
    a: (
      <>
        When you subscribe during the Sadhya 1.0 Launch Event, you lock in the promotional launch price (₹199/mo or ₹1,788/yr) for as long as your subscription remains active. Even when public prices revert to standard rates (₹499/mo), your renewal price will never increase.
      </>
    ),
  },
  {
    q: 'What if I subscribe and don’t get on with it?',
    a: (
      <>
        Ask us within 7 days of your payment and we&rsquo;ll refund it in full — no questions asked. Duplicate charges or accidental renewals are also refunded promptly upon request.
      </>
    ),
  },
  {
    q: 'Which payment methods work?',
    a: (
      <>
        Cards, UPI and netbanking, through Razorpay. You enter your details in Razorpay&rsquo;s own
        secure window — card numbers and UPI PINs never touch our servers, and the amount charged is
        computed server-side so it can&rsquo;t be tampered with from the browser.
      </>
    ),
  },
  {
    q: 'Do you have a student or group discount?',
    a: (
      <>
        Annual billing is the standing discount for individuals. For a class, a batch or a whole
        institution, write to{' '}
        <a href={`mailto:${SITE.email.sales}`} className="underline underline-offset-2">
          {SITE.email.sales}
        </a>{' '}
        — institutional pricing is per seat and depends on cohort size.
      </>
    ),
  },
  {
    q: 'Will the price go up later?',
    a: (
      <>
        If we change prices, it never affects a period you have already paid for, and we tell you
        before it applies to a renewal so you can decide.
      </>
    ),
  },
];

function Faq({ q, a }: { q: string; a: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border-b border-slate-100 dark:border-white/[0.07]">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="w-full flex items-start justify-between gap-6 py-5 text-left group"
      >
        <span className="text-[15.5px] font-medium tracking-[-0.01em] text-slate-900 dark:text-white">
          {q}
        </span>
        <ChevronDown
          className={cn(
            'w-4 h-4 mt-1 shrink-0 text-slate-400 dark:text-gray-500 transition-transform duration-200',
            open && 'rotate-180',
          )}
          strokeWidth={2}
        />
      </button>
      {open && (
        <p className="pb-5 pr-10 text-[14.5px] leading-[1.75] text-slate-600 dark:text-gray-300">
          {a}
        </p>
      )}
    </div>
  );
}

export default function Pricing() {
  useSeo({
    title: `Pricing — ${SITE.name}`,
    description: `${SITE.name} pricing: a free tier to try the AI tutor, and Pro at ₹${PRO_MONTHLY_INR}/month for unlimited use across every exam we cover.`,
    url: `${SITE.url}/pricing`,
  });
  useEffect(() => { window.scrollTo(0, 0); }, []);

  return (
    <div className="min-h-screen bg-white dark:bg-[#0b0b0c] text-slate-900 dark:text-white antialiased">
      <SiteHeader />

      <main>
        <PricingSection id="plans" headingAs="h1" />

        <section className="border-t border-slate-100 dark:border-white/[0.07]">
          <div className="max-w-[1160px] mx-auto px-5 sm:px-8 py-20 sm:py-24">
            <div className="grid lg:grid-cols-[minmax(0,20rem)_minmax(0,1fr)] gap-10 lg:gap-16">
              <div>
                <h2 className="text-[26px] sm:text-[32px] leading-[1.14] font-semibold tracking-[-0.03em]">
                  Before you pay.
                </h2>
                <p className="mt-4 text-[15px] leading-relaxed text-slate-500 dark:text-gray-400">
                  Still unsure? Ask our 24/7 AI guide, chat live with a support specialist, or write to{' '}
                  <a
                    href={`mailto:${SITE.email.support}`}
                    className="font-medium text-slate-900 dark:text-white underline underline-offset-2"
                  >
                    {SITE.email.support}
                  </a>. We&rsquo;d rather answer the question than take a subscription you regret.
                </p>
                <div className="mt-6">
                  <Link
                    to="/help"
                    className="inline-flex items-center gap-2 px-4.5 py-2.5 rounded-xl bg-slate-900 dark:bg-white text-white dark:text-slate-900 text-[13.5px] font-semibold hover:opacity-90 transition-opacity"
                  >
                    Ask Sadhya Guide
                  </Link>
                </div>
              </div>

              <div>
                {FAQS.map((f) => (
                  <Faq key={f.q} q={f.q} a={f.a} />
                ))}
              </div>
            </div>
          </div>
        </section>
      </main>

      <SiteFooter />
    </div>
  );
}
