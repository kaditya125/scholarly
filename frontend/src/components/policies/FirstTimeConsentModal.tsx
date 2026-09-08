import { useEffect, useState, type ReactNode } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import { AlertCircle, ArrowUpRight, Check } from 'lucide-react';
import { api } from '../../lib/api/client';
import { CURRENT_POLICY_METADATA, SADHYA_POLICIES } from '../../content/policies/policyData';
import { BrandMark, SubmitButton } from '../auth/AuthShell';
import { useAuth } from '../../lib/AuthContext';

/** The wizard's easing curve, so this screen moves the way the next one does. */
const EASE = [0.16, 1, 0.3, 1] as const;

/**
 * The consent gate a student meets once, between signing up and reaching the app.
 *
 * ─────────────────────────────────────────────────────────────────────────────────────
 *  DESIGN LANGUAGE — the same one Onboarding.tsx documents for itself, because this screen
 *  sits directly beside the wizard in the flow and previously did not look like it:
 *
 *    · lime #c8e558 is the ONLY accent; slate carries everything else
 *    · labels on lime are slate-900 — white on this lime is ~1.7:1 and unreadable
 *    · rounded-xl controls, h-11 primary actions, hairline borders, no shadows
 *    · Inter with the negative tracking the landing headings use
 *    · one easing curve, one gesture (rise + fade); nothing scales or spins
 *
 *  What this replaced ran against all of it: a floating rounded-2xl card with shadow-2xl,
 *  serif headings, `§ 1.0` monospace section markers, a "DOCUMENT PROGRESS" percentage
 *  readout, a "Platform Agreement" badge, and a second green (#6ca855) alongside the lime.
 *  A student went lime (landing) → lime (auth) → legal-document chrome → lime (wizard).
 *
 *  BrandMark and SubmitButton are imported rather than restyled — same reason.
 * ─────────────────────────────────────────────────────────────────────────────────────
 *
 *  ON THE CONTENT. The old screen reproduced eight sections of terms inline. That made it a
 *  THIRD copy of the policies, after the /terms page and SADHYA_POLICIES (which /policies
 *  renders) — three bodies of legal text with nothing keeping them in agreement, and the one
 *  a student actually consented to was the copy that lived only here.
 *
 *  So the inline legalese is gone. What remains is a plain-language summary of the four
 *  things that actually change how someone uses the product, every one of them traceable to
 *  SADHYA_POLICIES, and links to the documents that govern. The summary says it is a summary.
 *  The policy count comes from SADHYA_POLICIES.length so it cannot go stale.
 */

interface FirstTimeConsentModalProps {
  isOpen: boolean;
  onConsentAccepted: () => void;
  isUpdate?: boolean;
  lastAcceptedVersion?: string | null;
}

/**
 * The four points, in the order a student cares about them.
 *
 * Each is a faithful compression of a section in src/content/policies/policyData.ts — named
 * here so a future edit can check the summary still matches what it summarises.
 */
const POINTS: { lead: string; body: string; source: string }[] = [
  {
    lead: 'Your notes stay yours.',
    body:
      'You keep the copyright on everything you upload. We index it so the tutor can answer from it, inside your own namespace — and we do not sell your data or pass it to advertisers.',
    source: 'user-content + privacy',
  },
  {
    lead: 'The tutor can be wrong.',
    body:
      'It answers from the official syllabus and shows you its sources, but it is a study aid, not an authority. Check anything that matters against your textbook.',
    source: 'ai-usage',
  },
  {
    lead: 'Not for use in a live exam.',
    body:
      'Sadhya is for preparing. Using it to get around invigilation, or to fabricate a submission, ends the account.',
    source: 'academic-integrity',
  },
  {
    lead: 'You can leave whenever.',
    body:
      'Export or permanently delete your account and everything in it from Settings, without asking us first.',
    source: 'privacy',
  },
];

export default function FirstTimeConsentModal({
  isOpen,
  onConsentAccepted,
  isUpdate = false,
  lastAcceptedVersion,
}: FirstTimeConsentModalProps) {
  const { logout } = useAuth();
  const reduced = useReducedMotion();
  const [agreed, setAgreed] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // The gate covers the app, so the page behind it must not scroll with it.
  // Declared before the early return below — a hook after it would run conditionally.
  useEffect(() => {
    if (!isOpen) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previous;
    };
  }, [isOpen]);

  if (!isOpen) return null;

  const handleAccept = async () => {
    if (!agreed || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      await api.post('/policies/consent', { version: CURRENT_POLICY_METADATA.version });
      onConsentAccepted();
    } catch (err: any) {
      console.error('Failed to submit policy consent:', err);
      setError(
        err?.response?.data?.error ||
          'Could not record your acceptance. Check your connection and try again.',
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="consent-heading"
      className="fixed inset-0 z-[100] flex flex-col bg-white dark:bg-[#0b0b0c] text-slate-900 dark:text-white antialiased"
    >
      {/* ── Header ───────────────────────────────────────────────────────────── */}
      <header className="shrink-0 border-b border-slate-100 dark:border-white/[0.07]">
        <div className="w-full max-w-[640px] mx-auto px-6 h-16 flex items-center justify-between gap-4">
          <BrandMark size={24} />
          <span className="text-[12px] font-medium tabular-nums text-slate-400 dark:text-gray-500">
            Version {CURRENT_POLICY_METADATA.version}
          </span>
        </div>
      </header>

      {/* ── Body ─────────────────────────────────────────────────────────────── */}
      <main className="flex-1 overflow-y-auto">
        <motion.div
          initial={{ opacity: 0, y: reduced ? 0 : 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: reduced ? 0 : 0.4, ease: EASE }}
          className="w-full max-w-[640px] mx-auto px-6 py-10 sm:py-12"
        >
          <h1
            id="consent-heading"
            className="text-[30px] sm:text-[34px] leading-[1.12] font-semibold tracking-[-0.03em]"
          >
            {isUpdate ? 'We changed the terms' : 'Before you begin'}
          </h1>

          <p className="mt-3 text-[15px] sm:text-[15.5px] leading-relaxed text-slate-500 dark:text-gray-400 max-w-[34rem] text-pretty">
            {isUpdate
              ? `You agreed to version ${lastAcceptedVersion ?? 'an earlier release'}. Here is what your account runs on now, in plain language.`
              : 'Four things worth knowing in plain language, before the account is yours.'}
          </p>

          {isUpdate && (
            <p className="mt-5 pl-4 border-l-2 border-[#c8e558] text-[14px] leading-relaxed text-slate-600 dark:text-gray-300">
              {CURRENT_POLICY_METADATA.changelog}
            </p>
          )}

          {/* The four points. Hairline rules, not cards — nothing here is a separate object. */}
          <ul className="mt-8 border-t border-slate-100 dark:border-white/[0.07]">
            {POINTS.map((point) => (
              <li
                key={point.lead}
                className="py-4 border-b border-slate-100 dark:border-white/[0.07]"
              >
                <p className="text-[15px] leading-relaxed text-slate-500 dark:text-gray-400">
                  <span className="font-semibold text-slate-900 dark:text-white">{point.lead}</span>{' '}
                  {point.body}
                </p>
              </li>
            ))}
          </ul>

          <p className="mt-6 text-[14px] leading-relaxed text-slate-500 dark:text-gray-400">
            That is a summary, not a replacement. Your use is governed by the{' '}
            <PolicyLink href="/terms">Terms of Service</PolicyLink> and{' '}
            <PolicyLink href="/privacy">Privacy Policy</PolicyLink>, alongside{' '}
            {SADHYA_POLICIES.length} policies covering AI use, community, classrooms and billing.
          </p>

          <a
            href="/policies"
            target="_blank"
            rel="noreferrer"
            className="mt-3 inline-flex items-center gap-1 text-[14px] font-semibold text-slate-900 dark:text-white underline underline-offset-4 decoration-slate-300 dark:decoration-white/25 hover:decoration-[#8ea63a] dark:hover:decoration-[#c8e558] transition-colors"
          >
            Read all {SADHYA_POLICIES.length} policies
            <ArrowUpRight className="w-3.5 h-3.5" strokeWidth={2.25} />
          </a>
        </motion.div>
      </main>

      {/* ── Action bar ───────────────────────────────────────────────────────── */}
      <footer className="shrink-0 border-t border-slate-100 dark:border-white/[0.07] bg-white dark:bg-[#0b0b0c]">
        <div className="w-full max-w-[640px] mx-auto px-6 py-5 space-y-4">
          {error && (
            <p
              role="alert"
              className="flex items-start gap-2 text-[13.5px] leading-snug text-red-600 dark:text-red-400"
            >
              <AlertCircle className="w-4 h-4 shrink-0 mt-px" strokeWidth={2.25} />
              {error}
            </p>
          )}

          {/* Custom control rather than a native checkbox: the native one cannot be given the
              lime fill without appearance-none, at which point it is this anyway. */}
          <label className="flex items-start gap-3 cursor-pointer select-none group">
            <input
              type="checkbox"
              checked={agreed}
              onChange={(event) => setAgreed(event.target.checked)}
              className="peer sr-only"
            />
            <span
              aria-hidden
              className={[
                'mt-px shrink-0 w-[18px] h-[18px] rounded-[6px] border flex items-center justify-center transition-colors',
                'peer-focus-visible:ring-2 peer-focus-visible:ring-[#c8e558] peer-focus-visible:ring-offset-2',
                'dark:peer-focus-visible:ring-offset-[#0b0b0c]',
                agreed
                  ? 'bg-[#c8e558] border-[#c8e558]'
                  : 'border-slate-300 dark:border-white/20 group-hover:border-slate-400 dark:group-hover:border-white/35',
              ].join(' ')}
            >
              {agreed && <Check className="w-3 h-3 text-slate-900" strokeWidth={3} />}
            </span>
            <span className="text-[13.5px] leading-snug text-slate-600 dark:text-gray-300">
              I have read and agree to the{' '}
              <PolicyLink href="/terms">Terms of Service</PolicyLink> and{' '}
              <PolicyLink href="/privacy">Privacy Policy</PolicyLink>.
            </span>
          </label>

          <div className="flex flex-col-reverse sm:flex-row sm:items-center sm:justify-between gap-3">
            {/* A gate with no way out is a trap. Declining means not having an account here. */}
            <button
              type="button"
              onClick={() => void logout()}
              className="text-[13px] font-medium text-slate-400 dark:text-gray-500 hover:text-slate-700 dark:hover:text-gray-300 transition-colors self-start sm:self-auto"
            >
              I don&rsquo;t agree — sign out
            </button>

            <div className="sm:w-[260px]">
              <SubmitButton
                type="button"
                onClick={handleAccept}
                disabled={!agreed}
                loading={submitting}
              >
                {submitting ? 'Recording' : 'Agree and continue'}
              </SubmitButton>
              <p className="mt-2 text-[12px] text-center text-slate-400 dark:text-gray-500">
                Recorded in your Settings.
              </p>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}

/** Underlined inline link, matching the landing pages' treatment. */
function PolicyLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="font-semibold text-slate-900 dark:text-white underline underline-offset-2 decoration-slate-300 dark:decoration-white/25 hover:decoration-[#8ea63a] dark:hover:decoration-[#c8e558] transition-colors"
    >
      {children}
    </a>
  );
}
