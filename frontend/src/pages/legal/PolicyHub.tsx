import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Link, useSearchParams, useNavigate } from 'react-router-dom';
import {
  ShieldCheck, Check, Search, ArrowRight, FileText, AlertCircle,
  Clock, Sparkles, Scale, ExternalLink
} from 'lucide-react';
import SiteHeader from '../../components/landing/SiteHeader';
import NightSky from '../../components/landing/NightSky';
import SiteFooter from '../../components/landing/SiteFooter';
import {
  SADHYA_POLICIES,
  CURRENT_POLICY_METADATA,
  PolicySection,
} from '../../content/policies/policyData';
import { useAuth } from '../../lib/AuthContext';
import { usePolicyConsent } from '../../lib/hooks/usePolicyConsent';
import { useSeo } from '../../lib/useSeo';
import { SITE } from '../../lib/siteConfig';
import { cn } from '../../lib/utils';

export default function PolicyHub() {
  const { user } = useAuth();
  const { consentStatus, hasAcceptedCurrent, acceptPolicies, isAccepting, refetch } =
    usePolicyConsent(!!user);

  const [searchParams] = useSearchParams();
  const [searchQuery, setSearchQuery] = useState('');
  const [agreed, setAgreed] = useState(false);
  const [acceptSuccess, setAcceptSuccess] = useState(false);
  const [acceptError, setAcceptError] = useState<string | null>(null);

  useSeo({
    title: `Platform Terms & Operating Policies — Sadhya`,
    description: CURRENT_POLICY_METADATA.tagline,
  });

  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  const filteredSections = useMemo(() => {
    if (!searchQuery.trim()) return SADHYA_POLICIES;
    const q = searchQuery.toLowerCase();
    return SADHYA_POLICIES.filter(
      (s) =>
        s.title.toLowerCase().includes(q) ||
        s.summary.toLowerCase().includes(q) ||
        s.paragraphs.some(
          (p) =>
            p.heading?.toLowerCase().includes(q) ||
            p.text.toLowerCase().includes(q)
        )
    );
  }, [searchQuery]);

  const handleConsentSubmit = async () => {
    if (!agreed || isAccepting) return;
    setAcceptError(null);
    try {
      await acceptPolicies(CURRENT_POLICY_METADATA.version);
      setAcceptSuccess(true);
      refetch();
    } catch (err: any) {
      setAcceptError(err?.response?.data?.error || 'Failed to submit agreement. Please try again.');
    }
  };

  return (
    <div className="min-h-screen bg-white dark:bg-[#0b0b0c] text-slate-900 dark:text-white antialiased selection:bg-[#c8e558]/30">
      <SiteHeader />
      <NightSky />

      <main className="relative z-10 max-w-[1160px] mx-auto px-5 sm:px-8">
        {/* ── Document Header ────────────────────────────────────────────── */}
        <header className="pt-14 sm:pt-20 pb-10 border-b border-slate-100 dark:border-white/[0.07]">
          <nav aria-label="Breadcrumb" className="mb-5 flex items-center justify-between">
            <Link
              to="/"
              className="text-[13px] font-medium text-slate-500 dark:text-gray-400 hover:text-slate-900 dark:hover:text-white transition-colors"
            >
              ← Back to home
            </Link>

            <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-slate-100 dark:bg-white/[0.05] border border-slate-200/60 dark:border-white/10 text-[12px] font-mono text-slate-600 dark:text-gray-300">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
              <span>Version {CURRENT_POLICY_METADATA.version} · {CURRENT_POLICY_METADATA.effectiveDate}</span>
            </div>
          </nav>

          <h1 className="text-[32px] sm:text-[44px] leading-[1.1] font-semibold tracking-[-0.035em]">
            Platform Terms &amp; Operating Policies
          </h1>

          <p className="mt-4 max-w-[42rem] text-[15.5px] leading-relaxed text-slate-600 dark:text-gray-400">
            {CURRENT_POLICY_METADATA.tagline}
          </p>

          <p className="mt-4 text-[13px] text-slate-400 dark:text-gray-500">
            Last updated {CURRENT_POLICY_METADATA.effectiveDate} · {SITE.legalEntity}
          </p>

          {/* Inline Filter Search */}
          <div className="mt-6 max-w-md relative">
            <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
            <input
              type="text"
              placeholder="Search policy clauses, AI rules, or terms..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2 rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-white/[0.03] text-slate-900 dark:text-white placeholder-slate-400 text-[13.5px] focus:outline-none focus:ring-2 focus:ring-[#c8e558]/50"
            />
          </div>
        </header>

        {/* ── Main Legal Stream Layout ────────────────────────────────────── */}
        <div className="grid lg:grid-cols-[16rem_minmax(0,1fr)] gap-10 lg:gap-16 py-12 sm:py-16">
          
          {/* Contents Navigation Rail */}
          <aside className="hidden lg:block">
            <nav aria-label="On this page" className="sticky top-24 space-y-4 max-h-[calc(100vh-8rem)] overflow-y-auto pr-3">
              <p className="text-[12px] font-semibold uppercase tracking-[0.11em] text-slate-500 dark:text-gray-400">
                Contents ({filteredSections.length})
              </p>
              <ul className="space-y-2">
                {filteredSections.map((s, idx) => (
                  <li key={s.id}>
                    <a
                      href={`#${s.id}`}
                      className="block text-[13px] leading-snug text-slate-600 dark:text-gray-400 hover:text-slate-900 dark:hover:text-white transition-colors"
                    >
                      <span className="font-mono text-slate-400 dark:text-gray-500 mr-1.5">{idx + 1}.</span>
                      {s.title}
                    </a>
                  </li>
                ))}
              </ul>

              {user && (
                <div className="pt-6 border-t border-slate-100 dark:border-white/[0.07]">
                  <a
                    href="#agreement-covenant"
                    className="inline-flex items-center gap-1.5 text-[12.5px] font-semibold text-[#6ca855] dark:text-[#c8e558] hover:underline"
                  >
                    <Scale className="w-3.5 h-3.5" />
                    <span>Jump to agreement box &darr;</span>
                  </a>
                </div>
              )}
            </nav>
          </aside>

          {/* Continuous Legal Document (No Box Containers) */}
          <article className="max-w-[46rem] space-y-14">
            {filteredSections.map((section, sIdx) => (
              <section key={section.id} id={section.id} className="scroll-mt-24 space-y-4">
                <div className="flex items-baseline justify-between gap-4 border-b border-slate-100 dark:border-white/[0.07] pb-3">
                  <h2 className="text-[20px] sm:text-[23px] font-semibold tracking-[-0.025em] text-slate-900 dark:text-white">
                    <span className="font-mono text-[16px] text-slate-400 dark:text-gray-500 mr-2 font-normal">
                      {sIdx + 1}.0
                    </span>
                    {section.title}
                  </h2>
                  <span className="text-[11px] font-mono uppercase tracking-wider text-slate-400 dark:text-gray-500 shrink-0">
                    {section.badge}
                  </span>
                </div>

                <p className="text-[14.5px] leading-[1.75] text-slate-700 dark:text-gray-300 font-medium">
                  {section.summary}
                </p>

                <div className="space-y-4 pt-1">
                  {section.paragraphs.map((para, pIdx) => (
                    <div key={pIdx} className="space-y-2">
                      {para.heading && (
                        <h3 className="text-[15px] font-semibold text-slate-900 dark:text-white tracking-[-0.01em]">
                          {para.heading}
                        </h3>
                      )}
                      <p className="text-[14px] leading-[1.75] text-slate-600 dark:text-gray-300">
                        {para.text}
                      </p>
                      {para.highlights && para.highlights.length > 0 && (
                        <ul className="space-y-1.5 pl-2 pt-1">
                          {para.highlights.map((h, hIdx) => (
                            <li
                              key={hIdx}
                              className="flex items-start gap-2.5 text-[13.5px] leading-relaxed text-slate-600 dark:text-gray-300"
                            >
                              <span className="mt-[0.6em] w-1.5 h-1.5 rounded-full bg-[#6ca855] dark:bg-[#c8e558] shrink-0" />
                              <span>{h}</span>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  ))}
                </div>
              </section>
            ))}

            {/* ── Official Agreement & Acceptance Box ──────────────────────── */}
            <section
              id="agreement-covenant"
              className="mt-16 pt-8 border-t-2 border-slate-200 dark:border-white/10 space-y-5"
            >
              <div className="space-y-1">
                <div className="flex items-center gap-2 text-[12px] font-mono font-bold uppercase tracking-wider text-[#6ca855] dark:text-[#c8e558]">
                  <Scale className="w-3.5 h-3.5" />
                  <span>Covenant &amp; Agreement Acknowledgment</span>
                </div>
                <h3 className="text-[20px] font-bold tracking-tight text-slate-900 dark:text-white">
                  Confirm Your Acceptance
                </h3>
                <p className="text-[13.5px] text-slate-600 dark:text-gray-400 leading-relaxed">
                  By checking the box below, you acknowledge having reviewed and agreed to the Sadhya Terms of Service, Privacy Policy, and Educational Operating Guidelines.
                </p>
              </div>

              {hasAcceptedCurrent || acceptSuccess ? (
                <div className="p-4 rounded-xl bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-300 text-[13.5px] flex items-center gap-3">
                  <ShieldCheck className="w-5 h-5 shrink-0 text-emerald-600 dark:text-emerald-400" />
                  <div>
                    <span className="font-semibold">Consent Recorded:</span> You have accepted Version {CURRENT_POLICY_METADATA.version} of the Sadhya Platform Terms &amp; Policies.
                  </div>
                </div>
              ) : (
                <div className="space-y-4 pt-2">
                  {acceptError && (
                    <div className="p-3 rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 text-[13px] flex items-center gap-2">
                      <AlertCircle className="w-4 h-4 shrink-0" />
                      <span>{acceptError}</span>
                    </div>
                  )}

                  <label className="flex items-start gap-3 cursor-pointer select-none group">
                    <input
                      type="checkbox"
                      checked={agreed}
                      onChange={(e) => setAgreed(e.target.checked)}
                      className="mt-1 w-4 h-4 rounded border-slate-300 dark:border-gray-600 text-slate-900 dark:text-[#c8e558] focus:ring-[#c8e558] cursor-pointer"
                    />
                    <span className="text-[13.5px] text-slate-700 dark:text-gray-300 leading-snug">
                      I have read, understood, and agree to abide by the complete{' '}
                      <strong>Sadhya Platform Terms of Service</strong>, <strong>Privacy Policy</strong>, and <strong>Platform Guidelines</strong> (Version {CURRENT_POLICY_METADATA.version}).
                    </span>
                  </label>

                  <div className="pt-2 flex items-center gap-4">
                    {user ? (
                      <button
                        type="button"
                        disabled={!agreed || isAccepting}
                        onClick={handleConsentSubmit}
                        className={cn(
                          'px-6 py-2.5 rounded-xl font-semibold text-[13.5px] transition-all flex items-center gap-2',
                          agreed && !isAccepting
                            ? 'bg-slate-900 dark:bg-white text-white dark:text-slate-900 hover:opacity-90 shadow-md cursor-pointer'
                            : 'bg-slate-200 dark:bg-white/10 text-slate-400 dark:text-gray-500 cursor-not-allowed'
                        )}
                      >
                        {isAccepting ? (
                          <>
                            <span className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                            <span>Recording Agreement...</span>
                          </>
                        ) : (
                          <>
                            <Check className="w-4 h-4" />
                            <span>Accept &amp; Save to Profile</span>
                          </>
                        )}
                      </button>
                    ) : (
                      <Link
                        to="/signup"
                        className="px-6 py-2.5 rounded-xl bg-slate-900 dark:bg-white text-white dark:text-slate-900 font-semibold text-[13.5px] hover:opacity-90 transition-opacity inline-flex items-center gap-2"
                      >
                        <span>Create Student Account</span>
                        <ArrowRight className="w-4 h-4" />
                      </Link>
                    )}
                  </div>
                </div>
              )}
            </section>

            {/* Questions Section matching footer legal style */}
            <section className="rounded-2xl border border-slate-200 dark:border-white/10 bg-slate-50/70 dark:bg-white/[0.02] p-6 sm:p-7">
              <h2 className="text-[16px] font-semibold tracking-[-0.015em]">Questions about platform policies?</h2>
              <p className="text-[14px] leading-relaxed text-slate-600 dark:text-gray-300 mt-2">
                Write to our Grievance Officer at{' '}
                <a
                  href={`mailto:${SITE.email.legal}`}
                  className="font-medium text-slate-900 dark:text-white underline underline-offset-2"
                >
                  {SITE.email.legal}
                </a>{' '}
                or use our{' '}
                <Link to="/contact" className="font-medium text-slate-900 dark:text-white underline underline-offset-2">
                  contact page
                </Link>
                . We reply within three working days.
              </p>
            </section>
          </article>
        </div>
      </main>

      <div className="relative z-10">
        <SiteFooter />
      </div>
    </div>
  );
}
