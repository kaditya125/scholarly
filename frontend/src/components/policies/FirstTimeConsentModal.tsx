import React, { useState, useRef, useEffect } from 'react';
import {
  ShieldCheck, Check, Sparkles, ArrowRight, FileText,
  AlertCircle, ScrollText, Lock, Scale
} from 'lucide-react';
import { api } from '../../lib/api/client';
import { CURRENT_POLICY_METADATA } from '../../content/policies/policyData';
import { cn } from '../../lib/utils';

interface FirstTimeConsentModalProps {
  isOpen: boolean;
  onConsentAccepted: () => void;
  isUpdate?: boolean;
  lastAcceptedVersion?: string | null;
}

export default function FirstTimeConsentModal({
  isOpen,
  onConsentAccepted,
  isUpdate = false,
  lastAcceptedVersion,
}: FirstTimeConsentModalProps) {
  const [agreed, setAgreed] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [scrollProgress, setScrollProgress] = useState(0);
  const scrollRef = useRef<HTMLDivElement>(null);

  if (!isOpen) return null;

  const handleScroll = () => {
    if (!scrollRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = scrollRef.current;
    const total = scrollHeight - clientHeight;
    if (total <= 0) {
      setScrollProgress(100);
    } else {
      const progress = Math.min(100, Math.round((scrollTop / total) * 100));
      setScrollProgress(progress);
    }
  };

  const handleAccept = async () => {
    if (!agreed || submitting) return;

    setSubmitting(true);
    setError(null);

    try {
      await api.post('/policies/consent', {
        version: CURRENT_POLICY_METADATA.version,
      });
      onConsentAccepted();
    } catch (err: any) {
      console.error('Failed to submit policy consent:', err);
      setError(
        err?.response?.data?.error ||
          'Unable to record consent. Please check your internet connection and try again.'
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-3 sm:p-5 bg-slate-950/80 backdrop-blur-md animate-fade-in overflow-y-auto">
      <div className="relative w-full max-w-3xl bg-white dark:bg-[#111113] border border-slate-200/90 dark:border-white/10 rounded-2xl shadow-2xl overflow-hidden my-auto flex flex-col max-h-[92vh]">
        
        {/* ── Top Header Banner ────────────────────────────────────────────── */}
        <div className="px-6 sm:px-8 pt-6 pb-4 border-b border-slate-200 dark:border-white/10 bg-slate-50/70 dark:bg-white/[0.02]">
          <div className="flex items-center justify-between gap-4 mb-2">
            <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded-md bg-slate-900 text-white dark:bg-white dark:text-slate-900 text-[11px] font-bold uppercase tracking-wider">
              <Scale className="w-3 h-3" />
              <span>Platform Agreement</span>
            </div>

            <div className="flex items-center gap-2 text-[12px] font-mono text-slate-500 dark:text-gray-400">
              <span className="inline-block w-2 h-2 rounded-full bg-emerald-500" />
              <span>Ver. {CURRENT_POLICY_METADATA.version}</span>
            </div>
          </div>

          <h2 className="text-[20px] sm:text-[23px] font-bold text-slate-900 dark:text-white tracking-tight font-serif">
            {isUpdate ? 'Updated Sadhya Operating Terms & Policies' : 'Sadhya Master Terms & Platform Guidelines'}
          </h2>

          <p className="text-[13px] text-slate-600 dark:text-gray-400 mt-1 leading-relaxed">
            Please review our platform terms, AI usage covenants, and student privacy protections before continuing.
          </p>

          {/* Reading Progress Indicator Bar */}
          <div className="mt-3 flex items-center justify-between gap-3 text-[11px] text-slate-400 dark:text-gray-500 font-mono">
            <span>DOCUMENT PROGRESS</span>
            <div className="flex items-center gap-2 flex-1 max-w-xs">
              <div className="h-1.5 w-full bg-slate-200 dark:bg-white/10 rounded-full overflow-hidden">
                <div
                  className="h-full bg-[#6ca855] dark:bg-[#c8e558] transition-all duration-150"
                  style={{ width: `${scrollProgress}%` }}
                />
              </div>
              <span className="w-9 text-right">{scrollProgress}%</span>
            </div>
          </div>
        </div>

        {/* ── Continuous Premium Legal Document Stream (No Containers) ──────── */}
        <div
          ref={scrollRef}
          onScroll={handleScroll}
          className="px-6 sm:px-9 py-6 overflow-y-auto space-y-6 flex-1 text-slate-700 dark:text-gray-300 text-[13.5px] leading-[1.75] font-sans antialiased selection:bg-[#c8e558]/30"
        >
          {/* Section 1 */}
          <div className="space-y-2 border-b border-slate-100 dark:border-white/5 pb-5">
            <div className="flex items-baseline gap-2">
              <span className="font-mono text-[12px] font-bold text-[#6ca855] dark:text-[#c8e558]">§ 1.0</span>
              <h3 className="text-[15px] font-bold text-slate-900 dark:text-white font-serif tracking-tight">
                Acceptance of Terms &amp; Educational Workspaces
              </h3>
            </div>
            <p>
              By accessing or using Sadhya (&ldquo;Platform&rdquo;), you enter into a binding agreement governing your access to AI-powered study assistance, adaptive mock assessments, digital notebook indexing, and community learning environments. If you are under 18 years of age, you represent that your parent, legal guardian, or educator has reviewed and consented to these terms.
            </p>
            <p>
              Sadhya provides role-delimited workspaces: <strong>Student Accounts</strong> (syllabus telemetry, AI revision drills, personalized diagnostics) and <strong>Teacher Accounts</strong> (classroom creation, curriculum cohort monitoring, drill assignments).
            </p>
          </div>

          {/* Section 2 */}
          <div className="space-y-2 border-b border-slate-100 dark:border-white/5 pb-5">
            <div className="flex items-baseline gap-2">
              <span className="font-mono text-[12px] font-bold text-[#6ca855] dark:text-[#c8e558]">§ 2.0</span>
              <h3 className="text-[15px] font-bold text-slate-900 dark:text-white font-serif tracking-tight">
                AI Assistant, 6-Step Reasoning &amp; Syllabus Grounding
              </h3>
            </div>
            <p>
              Sadhya AI utilizes advanced neural models (including Vertex AI and Gemini 2.5) paired with syllabus grounding against NCERT benchmarks, official previous years questions (PYQs), and standard competitive examination standards (NEET, JEE, UPSC, State PSCs).
            </p>
            <ul className="list-disc pl-5 space-y-1 text-[13px] text-slate-600 dark:text-gray-400">
              <li><strong>Study Aid Only:</strong> AI outputs and explanations are educational tools designed to build conceptual intuition and do not constitute infallible authority. Critical formulas should be verified against official textbooks.</li>
              <li><strong>No Proctored Exam Cheating:</strong> Sadhya AI must not be used to bypass active school/institutional invigilation, fabricate test submissions, or violate third-party academic integrity standards.</li>
              <li><strong>Zero PII in Prompts:</strong> You agree never to input banking credentials, government identification numbers, or unauthorized third-party private contact information into chat inputs.</li>
            </ul>
          </div>

          {/* Section 3 */}
          <div className="space-y-2 border-b border-slate-100 dark:border-white/5 pb-5">
            <div className="flex items-baseline gap-2">
              <span className="font-mono text-[12px] font-bold text-[#6ca855] dark:text-[#c8e558]">§ 3.0</span>
              <h3 className="text-[15px] font-bold text-slate-900 dark:text-white font-serif tracking-tight">
                AI-Generated Practice Questions &amp; Adaptive CBT Tests
              </h3>
            </div>
            <p>
              Practice items comprise both human-curated official past papers and dynamically generated AI drills. Dynamic questions are calibrated across four cognitive tiers: <em>Recall</em>, <em>Conceptual</em>, <em>Application</em>, and <em>Analysis</em>. In adaptive test modes, difficulty scales in real-time based on diagnostic accuracy.
            </p>
          </div>

          {/* Section 4 */}
          <div className="space-y-2 border-b border-slate-100 dark:border-white/5 pb-5">
            <div className="flex items-baseline gap-2">
              <span className="font-mono text-[12px] font-bold text-[#6ca855] dark:text-[#c8e558]">§ 4.0</span>
              <h3 className="text-[15px] font-bold text-slate-900 dark:text-white font-serif tracking-tight">
                Privacy, Learner Model &amp; Data Rights
              </h3>
            </div>
            <p>
              In full compliance with India&rsquo;s Digital Personal Data Protection (DPDP) Act, 2023 and global privacy standards, we collect only learning telemetry (topic mastery scores, response latencies, target exam timelines) required to personalize your revision schedule. We do not sell user data to data brokers or advertisers. You retain the right to export or permanently delete your account and study records via Account Settings.
            </p>
          </div>

          {/* Section 5 */}
          <div className="space-y-2 border-b border-slate-100 dark:border-white/5 pb-5">
            <div className="flex items-baseline gap-2">
              <span className="font-mono text-[12px] font-bold text-[#6ca855] dark:text-[#c8e558]">§ 5.0</span>
              <h3 className="text-[15px] font-bold text-slate-900 dark:text-white font-serif tracking-tight">
                Community Feed, Peer Messages &amp; Behavioral Standards
              </h3>
            </div>
            <p>
              Public forums, comments, and direct study messages must remain respectful, constructive, and strictly academic. Harassment, abusive language, spam promotion, unsolicited commercial links, and unauthorized sharing of pirated study materials are grounds for immediate suspension. Built-in blocking and one-click reporting tools are available on all interactive surfaces.
            </p>
          </div>

          {/* Section 6 */}
          <div className="space-y-2 border-b border-slate-100 dark:border-white/5 pb-5">
            <div className="flex items-baseline gap-2">
              <span className="font-mono text-[12px] font-bold text-[#6ca855] dark:text-[#c8e558]">§ 6.0</span>
              <h3 className="text-[15px] font-bold text-slate-900 dark:text-white font-serif tracking-tight">
                User-Uploaded Notebooks &amp; Intellectual Property
              </h3>
            </div>
            <p>
              You retain full copyright and ownership over the original study notes, handwritten summaries, and documents you upload to private Notebooks. You grant Sadhya a limited technical license solely to OCR, parse, and vector-index your files within your isolated namespace. You agree not to upload materials that infringe third-party copyrights.
            </p>
          </div>

          {/* Section 7 */}
          <div className="space-y-2 border-b border-slate-100 dark:border-white/5 pb-5">
            <div className="flex items-baseline gap-2">
              <span className="font-mono text-[12px] font-bold text-[#6ca855] dark:text-[#c8e558]">§ 7.0</span>
              <h3 className="text-[15px] font-bold text-slate-900 dark:text-white font-serif tracking-tight">
                Payments, Subscriptions &amp; 7-Day Refund Guarantee
              </h3>
            </div>
            <p>
              Pro subscriptions are billed in Indian Rupees (INR) through Razorpay. You may cancel recurring billing anytime from Settings. Initial subscription purchases are eligible for a 100% money-back refund within 7 calendar days by writing to support@sadhya.app.
            </p>
          </div>

          {/* Section 8 */}
          <div className="space-y-2">
            <div className="flex items-baseline gap-2">
              <span className="font-mono text-[12px] font-bold text-[#6ca855] dark:text-[#c8e558]">§ 8.0</span>
              <h3 className="text-[15px] font-bold text-slate-900 dark:text-white font-serif tracking-tight">
                Grievance Redressal &amp; Legal Inquiries
              </h3>
            </div>
            <p>
              In accordance with the Information Technology Act, 2000, notices, complaints, and intellectual property infringement inquiries may be addressed to our Grievance Officer at <a href="mailto:legal@sadhya.app" className="underline font-semibold text-slate-900 dark:text-white">legal@sadhya.app</a>.
            </p>
          </div>
        </div>

        {/* ── Agreement & Acceptance Box ────────────────────────────────────── */}
        <div className="px-6 sm:px-8 py-5 border-t border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-[#0c0c0e] space-y-4">
          {error && (
            <div className="p-3 rounded-xl bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 text-[13px] flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Legal Acknowledgement Checkbox */}
          <label className="flex items-start gap-3 cursor-pointer select-none group">
            <input
              type="checkbox"
              checked={agreed}
              onChange={(e) => setAgreed(e.target.checked)}
              className="mt-0.5 w-4 h-4 rounded border-slate-300 dark:border-gray-600 text-slate-900 dark:text-[#c8e558] focus:ring-[#c8e558] cursor-pointer"
            />
            <span className="text-[13px] text-slate-700 dark:text-gray-300 leading-snug">
              I have read, understood, and agree to the Sadhya{' '}
              <a
                href="/terms"
                target="_blank"
                rel="noreferrer"
                className="font-semibold underline underline-offset-2 text-slate-900 dark:text-white hover:text-[#6ca855] dark:hover:text-[#c8e558]"
              >
                Terms of Service
              </a>
              ,{' '}
              <a
                href="/privacy"
                target="_blank"
                rel="noreferrer"
                className="font-semibold underline underline-offset-2 text-slate-900 dark:text-white hover:text-[#6ca855] dark:hover:text-[#c8e558]"
              >
                Privacy Policy
              </a>
              , and Educational Operating Guidelines.
            </span>
          </label>

          {/* Action Row */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-1">
            <span className="text-[12px] text-slate-400 dark:text-gray-500">
              Receipt will be recorded in your Settings.
            </span>

            <button
              type="button"
              disabled={!agreed || submitting}
              onClick={handleAccept}
              className={cn(
                'w-full sm:w-auto px-7 py-2.5 rounded-xl font-semibold text-[13.5px] transition-all flex items-center justify-center gap-2 shadow-xs',
                agreed && !submitting
                  ? 'bg-slate-900 dark:bg-white text-white dark:text-slate-900 hover:opacity-90 shadow-md cursor-pointer'
                  : 'bg-slate-200 dark:bg-white/10 text-slate-400 dark:text-gray-500 cursor-not-allowed'
              )}
            >
              {submitting ? (
                <>
                  <span className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                  <span>Recording acceptance...</span>
                </>
              ) : (
                <>
                  <ShieldCheck className="w-4 h-4" />
                  <span>Accept &amp; Enter Sadhya</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
