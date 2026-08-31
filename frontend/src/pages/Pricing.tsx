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
        It&rsquo;s a permanent free tier, not an expiring trial. Every month, free students receive <strong>100 AI Chat messages</strong>, <strong>15 minutes of Realtime Voice AI Tutoring</strong>, <strong>5 Document / PDF uploads</strong> (up to 10MB/file), <strong>1 AI Podcast Studio episode preview</strong>, and <strong>3 AI adaptive mock tests</strong>. In addition, official Past Year Questions (PYQs), Community forums, and Study Circles are <strong>100% Free and Unlimited</strong>. No credit card is required.
      </>
    ),
  },
  {
    q: 'What exactly changes when I go Pro?',
    a: (
      <>
        Sadhya Pro expands your monthly allowance to <strong>up to 2,000 AI Chat messages</strong>, <strong>up to 300 minutes (5 full hours) of Realtime Voice Tutoring</strong>, <strong>up to 100 Document uploads</strong> (up to 50MB/file with full OCR), <strong>25 dual-voice AI Podcast Studio episodes</strong> with MP3 export, and <strong>up to 1,000 adaptive mock tests</strong> with deep diagnostic heatmaps. You also get GPU priority fast-lane routing and priority human support.
      </>
    ),
  },
  {
    q: 'How does yearly billing work?',
    a: (
      <>
        Yearly is charged once up front at ₹{PRO_YEARLY_TOTAL_INR.toLocaleString('en-IN')} (just ₹149/mo) — save ₹600/year against regular launch annual pricing. It covers twelve months of Pro access from the day you pay, backed by our 7-Day 100% Refund Policy.
      </>
    ),
  },
  {
    q: 'Can I cancel whenever I want?',
    a: (
      <>
        Yes, directly from Settings → Plan &amp; Billing with a single click — zero emails or calls needed. Cancelling stops future renewals and you keep your Pro entitlements until the end of your paid billing period. All your notebooks, study history, and test analytics remain 100% safe on your Free account. Read our full{' '}
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
        Under our <strong>7-Day 100% Refund Policy</strong>, you can request a full refund within 7 days of purchase directly in 1 click from <code>Settings → Plan &amp; Billing</code> or by emailing <a href="mailto:support@sadhya.app" className="underline">support@sadhya.app</a>. 100% of your payment is returned to your original payment method (UPI within 1–3 business days, cards/netbanking within 5–7 business days).
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
        className="w-full flex items-start justify-between gap-4 py-4 sm:py-5 text-left group cursor-pointer touch-manipulation"
      >
        <span className="text-[15px] sm:text-[15.5px] font-medium tracking-[-0.01em] text-slate-900 dark:text-white pr-2">
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
        <p className="pb-4 sm:pb-5 pr-4 sm:pr-8 text-[13.5px] sm:text-[14.5px] leading-[1.75] text-slate-600 dark:text-gray-300">
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
    <div className="min-h-screen bg-white dark:bg-[#0b0b0c] text-slate-900 dark:text-white antialiased overflow-x-hidden">
      <SiteHeader />

      <main className="w-full">
        <PricingSection id="plans" headingAs="h1" />

        <section className="border-t border-slate-100 dark:border-white/[0.07]">
          <div className="max-w-[1160px] mx-auto px-4 sm:px-6 lg:px-8 py-12 sm:py-16 lg:py-20">
            <div className="grid lg:grid-cols-[minmax(0,20rem)_minmax(0,1fr)] gap-8 lg:gap-16">
              <div>
                <h2 className="text-[24px] sm:text-[30px] lg:text-[32px] leading-[1.15] font-semibold tracking-[-0.03em]">
                  Before you pay.
                </h2>
                <p className="mt-3 sm:mt-4 text-[14px] sm:text-[15px] leading-relaxed text-slate-500 dark:text-gray-400">
                  Still unsure? Ask our 24/7 AI guide, chat live with a support specialist, or write to{' '}
                  <a
                    href={`mailto:${SITE.email.support}`}
                    className="font-medium text-slate-900 dark:text-white underline underline-offset-2"
                  >
                    {SITE.email.support}
                  </a>. We&rsquo;d rather answer the question than take a subscription you regret.
                </p>
                <div className="mt-5 sm:mt-6">
                  <Link
                    to="/help"
                    className="inline-flex items-center gap-2 px-4.5 py-2.5 rounded-xl bg-slate-900 dark:bg-white text-white dark:text-slate-900 text-[13.5px] font-semibold hover:opacity-90 transition-opacity touch-manipulation"
                  >
                    Ask Sadhya Guide
                  </Link>
                </div>
              </div>

              <div className="mt-2 lg:mt-0">
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
