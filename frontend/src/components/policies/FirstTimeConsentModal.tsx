import React, { useState } from 'react';
import {
  Shield, Check, Sparkles, ChevronDown, ChevronUp, ExternalLink,
  BookOpen, Bot, Users, GraduationCap, ArrowRight, X, AlertCircle
} from 'lucide-react';
import {
  SADHYA_POLICIES,
  CURRENT_POLICY_METADATA,
  PolicySection,
} from '../../content/policies/policyData';
import { api } from '../../lib/api/client';
import { cn } from '../../lib/utils';

interface FirstTimeConsentModalProps {
  isOpen: boolean;
  onConsentAccepted: () => void;
  isUpdate?: boolean;
  lastAcceptedVersion?: string | null;
}

const CATEGORY_ICONS: Record<string, React.ReactNode> = {
  core: <Shield className="w-4 h-4" />,
  ai: <Bot className="w-4 h-4" />,
  community: <Users className="w-4 h-4" />,
  education: <GraduationCap className="w-4 h-4" />,
  safety: <Shield className="w-4 h-4" />,
  billing: <BookOpen className="w-4 h-4" />,
};

export default function FirstTimeConsentModal({
  isOpen,
  onConsentAccepted,
  isUpdate = false,
  lastAcceptedVersion,
}: FirstTimeConsentModalProps) {
  const [agreed, setAgreed] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expandedSectionId, setExpandedSectionId] = useState<string | null>(null);
  const [modalPolicy, setModalPolicy] = useState<PolicySection | null>(null);

  if (!isOpen) return null;

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
          'Failed to record policy consent. Please check your internet connection and try again.'
      );
    } finally {
      setSubmitting(false);
    }
  };

  const toggleExpand = (id: string) => {
    setExpandedSectionId((prev) => (prev === id ? null : id));
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-6 bg-slate-950/70 backdrop-blur-md animate-fade-in overflow-y-auto">
      <div className="relative w-full max-w-2xl bg-white dark:bg-[#141416] border border-slate-200 dark:border-white/10 rounded-2xl shadow-2xl overflow-hidden my-8 flex flex-col max-h-[90vh]">
        {/* Header Ribbon */}
        <div className="px-6 sm:px-8 pt-7 pb-5 border-b border-slate-100 dark:border-white/5 bg-slate-50/50 dark:bg-white/[0.02]">
          <div className="flex items-center gap-2 mb-2">
            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-[#6ca855]/10 dark:bg-[#c8e558]/10 text-[#6ca855] dark:text-[#c8e558] text-[11.5px] font-semibold">
              <Sparkles className="w-3.5 h-3.5" />
              {isUpdate ? `Policy Update · Version ${CURRENT_POLICY_METADATA.version}` : 'Welcome to Sadhya'}
            </span>
          </div>

          <h2 className="text-[22px] sm:text-[26px] font-bold text-slate-900 dark:text-white tracking-tight">
            {isUpdate ? "We've updated our platform policies" : 'Before you get started'}
          </h2>

          <p className="text-[14px] sm:text-[14.5px] text-slate-600 dark:text-gray-300 mt-2 leading-relaxed">
            {isUpdate
              ? `We've refined our guidelines to better explain how Sadhya's AI features, adaptive tests, and classrooms work. Please review and confirm to continue.`
              : `We're excited to have you here! Sadhya brings together learning tools, AI assistance, adaptive assessments, and a community of students and teachers. Here is how our platform works and what you can expect.`}
          </p>
        </div>

        {/* Scrollable Policy Checklist & Summaries */}
        <div className="px-6 sm:px-8 py-5 overflow-y-auto space-y-3 flex-1">
          <p className="text-[12px] font-semibold uppercase tracking-wider text-slate-400 dark:text-gray-500 mb-3">
            How Sadhya works ({SADHYA_POLICIES.length} Key Policies)
          </p>

          <div className="space-y-2.5">
            {SADHYA_POLICIES.map((policy) => {
              const isExpanded = expandedSectionId === policy.id;
              return (
                <div
                  key={policy.id}
                  className="rounded-xl border border-slate-200/80 dark:border-white/10 bg-slate-50/60 dark:bg-white/[0.02] overflow-hidden transition-colors"
                >
                  <div
                    onClick={() => toggleExpand(policy.id)}
                    className="p-3.5 flex items-center justify-between cursor-pointer hover:bg-slate-100/70 dark:hover:bg-white/[0.04] transition-colors"
                  >
                    <div className="flex items-center gap-3 min-w-0 pr-2">
                      <div className="w-5 h-5 rounded-full bg-[#6ca855]/15 dark:bg-[#c8e558]/15 text-[#6ca855] dark:text-[#c8e558] flex items-center justify-center shrink-0 text-[11px]">
                        <Check className="w-3 h-3 stroke-[2.5]" />
                      </div>
                      <span className="text-[14px] font-semibold text-slate-900 dark:text-white truncate">
                        {policy.title}
                      </span>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setModalPolicy(policy);
                        }}
                        className="text-[12px] font-medium text-slate-500 dark:text-gray-400 hover:text-slate-900 dark:hover:text-white inline-flex items-center gap-0.5 px-2 py-1 rounded hover:bg-slate-200/60 dark:hover:bg-white/[0.06] transition-colors"
                      >
                        <span>Read</span>
                        <ExternalLink className="w-3 h-3" />
                      </button>
                      {isExpanded ? (
                        <ChevronUp className="w-4 h-4 text-slate-400" />
                      ) : (
                        <ChevronDown className="w-4 h-4 text-slate-400" />
                      )}
                    </div>
                  </div>

                  {isExpanded && (
                    <div className="px-4 pb-3.5 pt-1 text-[13px] text-slate-600 dark:text-gray-300 leading-relaxed border-t border-slate-200/40 dark:border-white/5 bg-white dark:bg-[#141416]">
                      <p>{policy.summary}</p>
                      <div className="mt-2 flex justify-end">
                        <button
                          type="button"
                          onClick={() => setModalPolicy(policy)}
                          className="text-[12px] font-semibold text-[#6ca855] dark:text-[#c8e558] hover:underline"
                        >
                          View full policy clause &rarr;
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {error && (
            <div className="p-3 rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800/50 text-red-700 dark:text-red-300 text-[13px] flex items-center gap-2 mt-4">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}
        </div>

        {/* Agreement Footer */}
        <div className="px-6 sm:px-8 py-5 border-t border-slate-100 dark:border-white/10 bg-slate-50/80 dark:bg-[#111113] space-y-4">
          <div className="space-y-1">
            <p className="text-[13px] font-medium text-slate-700 dark:text-gray-300">
              <strong>You&apos;re in control</strong>
            </p>
            <p className="text-[12px] text-slate-500 dark:text-gray-400 leading-relaxed">
              These policies explain how Sadhya works and how we keep our study community useful and respectful. You can review your accepted policies anytime from Settings.
            </p>
          </div>

          {/* Consent Checkbox */}
          <label className="flex items-start gap-3 cursor-pointer select-none group">
            <input
              type="checkbox"
              checked={agreed}
              onChange={(e) => setAgreed(e.target.checked)}
              className="mt-0.5 w-4 h-4 rounded border-slate-300 dark:border-gray-600 text-slate-900 dark:text-[#c8e558] focus:ring-[#c8e558] cursor-pointer"
            />
            <span className="text-[13px] text-slate-700 dark:text-gray-300 leading-snug">
              I have read and agree to Sadhya&apos;s{' '}
              <a
                href="/policies"
                target="_blank"
                rel="noreferrer"
                className="font-semibold underline underline-offset-2 text-slate-900 dark:text-white hover:text-[#6ca855] dark:hover:text-[#c8e558]"
              >
                Terms of Service
              </a>
              ,{' '}
              <a
                href="/policies?section=privacy"
                target="_blank"
                rel="noreferrer"
                className="font-semibold underline underline-offset-2 text-slate-900 dark:text-white hover:text-[#6ca855] dark:hover:text-[#c8e558]"
              >
                Privacy Policy
              </a>
              , and applicable platform policies.
            </span>
          </label>

          {/* Action Buttons */}
          <div className="flex items-center justify-end gap-3 pt-1">
            <button
              type="button"
              disabled={!agreed || submitting}
              onClick={handleAccept}
              className={cn(
                'w-full sm:w-auto px-6 py-2.5 rounded-xl font-semibold text-[14px] transition-all flex items-center justify-center gap-2',
                agreed && !submitting
                  ? 'bg-slate-900 dark:bg-white text-white dark:text-slate-900 hover:opacity-90 shadow-md'
                  : 'bg-slate-200 dark:bg-white/10 text-slate-400 dark:text-gray-500 cursor-not-allowed'
              )}
            >
              {submitting ? (
                <>
                  <span className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                  <span>Recording agreement...</span>
                </>
              ) : (
                <>
                  <span>Accept &amp; Continue</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Embedded Deep Policy Reader Modal */}
      {modalPolicy && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <div className="w-full max-w-xl bg-white dark:bg-[#161618] border border-slate-200 dark:border-white/10 rounded-2xl shadow-2xl p-6 sm:p-7 max-h-[80vh] flex flex-col">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-white/10">
              <div className="flex items-center gap-2">
                {CATEGORY_ICONS[modalPolicy.category]}
                <h3 className="text-[17px] font-bold text-slate-900 dark:text-white">
                  {modalPolicy.title}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setModalPolicy(null)}
                className="p-1 rounded-lg hover:bg-slate-100 dark:hover:bg-white/10 text-slate-500 dark:text-gray-400"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="py-4 overflow-y-auto space-y-4 flex-1 text-[13.5px] text-slate-600 dark:text-gray-300 leading-relaxed">
              <p className="font-medium text-slate-800 dark:text-gray-200 bg-slate-50 dark:bg-white/[0.03] p-3 rounded-lg">
                {modalPolicy.summary}
              </p>
              {modalPolicy.paragraphs.map((clause, cIdx) => (
                <div key={cIdx} className="space-y-1">
                  {clause.heading && (
                    <h4 className="font-semibold text-slate-900 dark:text-white">
                      {clause.heading}
                    </h4>
                  )}
                  <p>{clause.text}</p>
                </div>
              ))}
            </div>

            <div className="pt-3 border-t border-slate-100 dark:border-white/10 flex justify-end">
              <button
                type="button"
                onClick={() => setModalPolicy(null)}
                className="px-4 py-2 rounded-lg bg-slate-100 dark:bg-white/10 text-slate-800 dark:text-white text-[13px] font-semibold hover:bg-slate-200 dark:hover:bg-white/20"
              >
                Close Preview
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
