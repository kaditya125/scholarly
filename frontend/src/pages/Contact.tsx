import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Mail, Phone, MapPin, Clock, ShieldAlert, Building2, ArrowRight, Scale } from 'lucide-react';
import SiteHeader from '../components/landing/SiteHeader';
import SiteFooter from '../components/landing/SiteFooter';
import { SITE } from '../lib/siteConfig';

/**
 * Contact page.
 *
 * Deliberately built from mailto/tel links rather than a contact form: there is no
 * endpoint behind a form, and a form that silently drops messages is worse than no form.
 * If a submission endpoint is added later, this is the page to put it on.
 *
 * Razorpay's merchant review looks for a reachable email, phone and registered address
 * on a page like this one.
 */

const CHANNELS = [
  {
    icon: Mail,
    title: 'Support',
    body: 'Trouble with your account, a payment, or something that isn’t working.',
    action: SITE.email.support,
    href: `mailto:${SITE.email.support}`,
  },
  {
    icon: Building2,
    title: 'Schools & institutions',
    body: 'Bulk seats, admin dashboards, custom curriculum and invoicing.',
    action: SITE.email.sales,
    href: `mailto:${SITE.email.sales}?subject=Scholarly%20for%20institutions`,
  },
  {
    icon: ShieldAlert,
    title: 'Security',
    body: 'Report a vulnerability. Please read the disclosure guidelines first.',
    action: SITE.email.security,
    href: `mailto:${SITE.email.security}`,
  },
  {
    icon: Scale,
    title: 'Privacy & legal',
    body: 'Data requests, grievances, and anything about our terms.',
    action: SITE.email.privacy,
    href: `mailto:${SITE.email.privacy}`,
  },
];

export default function Contact() {
  useEffect(() => { window.scrollTo(0, 0); }, []);

  return (
    <div className="min-h-screen bg-white dark:bg-[#0b0b0c] text-slate-900 dark:text-white antialiased">
      <SiteHeader />

      <main className="max-w-[1160px] mx-auto px-5 sm:px-8">
        <header className="pt-14 sm:pt-20 pb-10">
          <h1 className="text-[34px] sm:text-[46px] leading-[1.08] font-semibold tracking-[-0.035em]">
            Talk to us
          </h1>
          <p className="mt-4 max-w-[36rem] text-[16px] leading-relaxed text-slate-500 dark:text-gray-400">
            A real person reads every one of these. Pick the one that fits and we&rsquo;ll come back
            to you — usually the same working day.
          </p>
        </header>

        {/* ── Channels ───────────────────────────────────────────────────── */}
        <div className="grid sm:grid-cols-2 gap-4 sm:gap-5 pb-14">
          {CHANNELS.map((c) => (
            <a
              key={c.title}
              href={c.href}
              className="group rounded-2xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#141416] p-6 sm:p-7 hover:border-slate-300 dark:hover:border-white/20 transition-colors"
            >
              <span className="inline-flex w-10 h-10 rounded-xl bg-slate-900 dark:bg-white items-center justify-center">
                <c.icon className="w-[18px] h-[18px] text-white dark:text-slate-900" strokeWidth={1.9} />
              </span>
              <h2 className="mt-5 text-[17px] font-semibold tracking-[-0.015em]">{c.title}</h2>
              <p className="mt-2 text-[14px] leading-relaxed text-slate-500 dark:text-gray-400">{c.body}</p>
              <span className="mt-4 inline-flex items-center gap-1.5 text-[13.5px] font-medium text-slate-900 dark:text-white">
                {c.action}
                <ArrowRight className="w-3.5 h-3.5 transition-transform group-hover:translate-x-0.5" strokeWidth={2.25} />
              </span>
            </a>
          ))}
        </div>

        {/* ── Registered details ─────────────────────────────────────────── */}
        <div className="grid lg:grid-cols-2 gap-4 sm:gap-5 pb-20 sm:pb-28">
          <div className="rounded-2xl border border-slate-200 dark:border-white/10 p-6 sm:p-7">
            <h2 className="text-[16px] font-semibold tracking-[-0.015em]">Registered office</h2>
            <div className="mt-5 space-y-4">
              <div className="flex gap-3">
                <MapPin className="w-4 h-4 mt-1 shrink-0 text-slate-400 dark:text-gray-500" strokeWidth={1.9} />
                <div className="text-[14px] leading-relaxed text-slate-600 dark:text-gray-300">
                  <p className="font-medium text-slate-900 dark:text-white">{SITE.legalEntity}</p>
                  <p>{SITE.address.line1}</p>
                  <p>{SITE.address.line2}</p>
                  <p>{SITE.address.city} {SITE.address.postalCode}</p>
                  <p>{SITE.address.state}, {SITE.address.country}</p>
                </div>
              </div>

              <div className="flex gap-3">
                <Phone className="w-4 h-4 mt-0.5 shrink-0 text-slate-400 dark:text-gray-500" strokeWidth={1.9} />
                <a href={`tel:${SITE.phone.replace(/\s/g, '')}`} className="text-[14px] text-slate-600 dark:text-gray-300 hover:text-slate-900 dark:hover:text-white transition-colors">
                  {SITE.phone}
                </a>
              </div>

              <div className="flex gap-3">
                <Clock className="w-4 h-4 mt-0.5 shrink-0 text-slate-400 dark:text-gray-500" strokeWidth={1.9} />
                <p className="text-[14px] text-slate-600 dark:text-gray-300">{SITE.supportHours}</p>
              </div>

              {(SITE.cin || SITE.gstin) && (
                <div className="pt-2 space-y-1 text-[13px] text-slate-500 dark:text-gray-400">
                  {SITE.cin && <p>CIN: {SITE.cin}</p>}
                  {SITE.gstin && <p>GSTIN: {SITE.gstin}</p>}
                </div>
              )}
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 dark:border-white/10 bg-slate-50/70 dark:bg-white/[0.02] p-6 sm:p-7">
            <h2 className="text-[16px] font-semibold tracking-[-0.015em]">Grievance Officer</h2>
            <p className="mt-3 text-[14px] leading-relaxed text-slate-600 dark:text-gray-300">
              As required by the Digital Personal Data Protection Act, 2023 and the Information
              Technology Act, 2000, you can escalate any complaint about your personal data to our
              Grievance Officer at{' '}
              <a href={`mailto:${SITE.email.privacy}`} className="font-medium text-slate-900 dark:text-white underline underline-offset-2">
                {SITE.email.privacy}
              </a>
              .
            </p>
            <p className="mt-3 text-[14px] leading-relaxed text-slate-600 dark:text-gray-300">
              We acknowledge complaints within 48 hours and aim to resolve them within 30 days.
            </p>
            <div className="mt-6 flex flex-wrap gap-x-5 gap-y-2">
              <Link to="/privacy" className="text-[13.5px] font-medium text-slate-900 dark:text-white underline underline-offset-2">
                Privacy policy
              </Link>
              <Link to="/terms" className="text-[13.5px] font-medium text-slate-900 dark:text-white underline underline-offset-2">
                Terms of service
              </Link>
              <Link to="/refunds" className="text-[13.5px] font-medium text-slate-900 dark:text-white underline underline-offset-2">
                Refunds
              </Link>
            </div>
          </div>
        </div>
      </main>

      <SiteFooter />
    </div>
  );
}
