import React, { useState, useEffect, useMemo } from 'react';
import { useParams, Link, useSearchParams } from 'react-router-dom';
import {
  Shield, BookOpen, Bot, Users, GraduationCap, CheckCircle2,
  Search, ArrowRight, Clock, ChevronRight, FileText, Check, Copy,
  Sparkles, ExternalLink
} from 'lucide-react';
import SiteHeader from '../../components/landing/SiteHeader';
import SiteFooter from '../../components/landing/SiteFooter';
import {
  SADHYA_POLICIES,
  CURRENT_POLICY_METADATA,
  PolicySection,
} from '../../content/policies/policyData';
import { useSeo } from '../../lib/useSeo';
import { cn } from '../../lib/utils';

const CATEGORY_ICONS: Record<string, React.ReactNode> = {
  core: <Shield className="w-4 h-4" />,
  ai: <Bot className="w-4 h-4" />,
  community: <Users className="w-4 h-4" />,
  education: <GraduationCap className="w-4 h-4" />,
  safety: <Shield className="w-4 h-4" />,
  billing: <BookOpen className="w-4 h-4" />,
};

const CATEGORIES = [
  { id: 'all', label: 'All Policies' },
  { id: 'core', label: 'Core Terms & Privacy' },
  { id: 'ai', label: 'AI & Adaptivity' },
  { id: 'community', label: 'Community & Peer' },
  { id: 'education', label: 'Academics & Classrooms' },
  { id: 'safety', label: 'Safety & IP' },
  { id: 'billing', label: 'Billing & Plans' },
];

export default function PolicyHub() {
  const { category: urlCategory } = useParams<{ category?: string }>();
  const [searchParams] = useSearchParams();
  const requestedSection = searchParams.get('section');

  const [activeSectionId, setActiveSectionId] = useState<string>(
    urlCategory || requestedSection || 'terms'
  );
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [copiedId, setCopiedId] = useState<string | null>(null);

  useSeo({
    title: `Terms & Policies — Sadhya`,
    description: CURRENT_POLICY_METADATA.tagline,
  });

  // Sync active section from URL params if route changes
  useEffect(() => {
    if (urlCategory) {
      const match = SADHYA_POLICIES.find(
        (p) => p.id === urlCategory || p.category === urlCategory
      );
      if (match) {
        setActiveSectionId(match.id);
      }
    }
  }, [urlCategory]);

  const filteredPolicies = useMemo(() => {
    return SADHYA_POLICIES.filter((policy) => {
      const matchesCategory =
        selectedCategory === 'all' || policy.category === selectedCategory;
      const matchesSearch =
        searchQuery.trim() === '' ||
        policy.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        policy.summary.toLowerCase().includes(searchQuery.toLowerCase()) ||
        policy.paragraphs.some(
          (p) =>
            p.heading?.toLowerCase().includes(searchQuery.toLowerCase()) ||
            p.text.toLowerCase().includes(searchQuery.toLowerCase())
        );
      return matchesCategory && matchesSearch;
    });
  }, [selectedCategory, searchQuery]);

  const activePolicy = useMemo(() => {
    return (
      SADHYA_POLICIES.find((p) => p.id === activeSectionId) || SADHYA_POLICIES[0]
    );
  }, [activeSectionId]);

  const handleCopyLink = (id: string) => {
    const url = `${window.location.origin}/policies?section=${id}`;
    navigator.clipboard.writeText(url);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-[#131314] text-slate-900 dark:text-white flex flex-col antialiased">
      <SiteHeader />

      {/* ── Hero Banner ────────────────────────────────────────────────────────── */}
      <section className="border-b border-slate-200/80 dark:border-white/10 bg-white dark:bg-[#141416] py-10 sm:py-14">
        <div className="max-w-[1160px] mx-auto px-5 sm:px-8">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
            <div className="space-y-2">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#6ca855]/10 dark:bg-[#c8e558]/10 border border-[#6ca855]/20 dark:border-[#c8e558]/20 text-[#6ca855] dark:text-[#c8e558] text-[12px] font-semibold tracking-wide">
                <Sparkles className="w-3.5 h-3.5" />
                <span>Version {CURRENT_POLICY_METADATA.version} · Effective {CURRENT_POLICY_METADATA.effectiveDate}</span>
              </div>
              <h1 className="text-[28px] sm:text-[36px] font-bold tracking-tight">
                Sadhya Platform Terms &amp; Policies
              </h1>
              <p className="text-[14.5px] sm:text-[16px] text-slate-600 dark:text-gray-400 max-w-2xl leading-relaxed">
                {CURRENT_POLICY_METADATA.tagline}
              </p>
            </div>

            {/* Quick Search */}
            <div className="w-full md:w-80 relative">
              <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 dark:text-gray-500 pointer-events-none" />
              <input
                type="text"
                placeholder="Search policies or rules..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-white/[0.04] text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-gray-500 text-[13.5px] focus:outline-none focus:ring-2 focus:ring-[#c8e558]/50 transition-all"
              />
            </div>
          </div>

          {/* Category Filter Pills */}
          <div className="flex items-center gap-2 mt-8 overflow-x-auto pb-2 scrollbar-none">
            {CATEGORIES.map((cat) => (
              <button
                key={cat.id}
                onClick={() => setSelectedCategory(cat.id)}
                className={cn(
                  'px-3.5 py-1.5 rounded-lg text-[13px] font-medium whitespace-nowrap transition-colors flex items-center gap-1.5',
                  selectedCategory === cat.id
                    ? 'bg-slate-900 dark:bg-white text-white dark:text-slate-900 shadow-xs'
                    : 'bg-slate-100 dark:bg-white/[0.05] text-slate-600 dark:text-gray-400 hover:text-slate-900 dark:hover:text-white'
                )}
              >
                {cat.id !== 'all' && CATEGORY_ICONS[cat.id]}
                {cat.label}
              </button>
            ))}
          </div>
        </div>
      </section>

      {/* ── Main Layout: Sidebar & Content ────────────────────────────────────── */}
      <main className="flex-1 max-w-[1160px] w-full mx-auto px-5 sm:px-8 py-8 sm:py-12">
        <div className="grid lg:grid-cols-[280px_1fr] gap-8 lg:gap-12 items-start">
          {/* Desktop Left Table of Contents */}
          <aside className="hidden lg:block sticky top-24 space-y-1 pr-2 max-h-[calc(100vh-8rem)] overflow-y-auto">
            <p className="text-[11.5px] font-semibold uppercase tracking-wider text-slate-400 dark:text-gray-500 px-3 mb-2">
              Policy Sections ({filteredPolicies.length})
            </p>
            {filteredPolicies.map((p) => {
              const isActive = p.id === activeSectionId;
              return (
                <button
                  key={p.id}
                  onClick={() => {
                    setActiveSectionId(p.id);
                    window.scrollTo({ top: 120, behavior: 'smooth' });
                  }}
                  className={cn(
                    'w-full text-left px-3.5 py-2.5 rounded-xl text-[13.5px] font-medium transition-all flex items-center justify-between group',
                    isActive
                      ? 'bg-slate-900 dark:bg-white text-white dark:text-slate-900 font-semibold shadow-xs'
                      : 'text-slate-600 dark:text-gray-400 hover:bg-slate-200/60 dark:hover:bg-white/[0.05] hover:text-slate-900 dark:hover:text-white'
                  )}
                >
                  <div className="flex items-center gap-2.5 truncate">
                    <span
                      className={cn(
                        'shrink-0',
                        isActive
                          ? 'text-[#c8e558] dark:text-[#6ca855]'
                          : 'text-slate-400 dark:text-gray-500 group-hover:text-slate-700 dark:group-hover:text-gray-300'
                      )}
                    >
                      {CATEGORY_ICONS[p.category]}
                    </span>
                    <span className="truncate">{p.title}</span>
                  </div>
                  <ChevronRight
                    className={cn(
                      'w-3.5 h-3.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0',
                      isActive && 'opacity-100'
                    )}
                  />
                </button>
              );
            })}
          </aside>

          {/* Policy Detail Section */}
          <div className="space-y-8 min-w-0">
            {/* Active Policy Header Card */}
            <div className="p-6 sm:p-8 rounded-2xl border border-slate-200/80 dark:border-white/10 bg-white dark:bg-[#141416] shadow-xs space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-slate-100 dark:bg-white/[0.06] text-slate-700 dark:text-gray-300 text-[12px] font-medium">
                  {CATEGORY_ICONS[activePolicy.category]}
                  {activePolicy.badge}
                </span>

                <div className="flex items-center gap-3 text-[12.5px] text-slate-500 dark:text-gray-400">
                  <span className="inline-flex items-center gap-1">
                    <Clock className="w-3.5 h-3.5" />
                    Updated: {activePolicy.lastUpdated}
                  </span>
                  <button
                    onClick={() => handleCopyLink(activePolicy.id)}
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md hover:bg-slate-100 dark:hover:bg-white/[0.05] text-slate-600 dark:text-gray-300 transition-colors"
                    title="Copy link to this section"
                  >
                    {copiedId === activePolicy.id ? (
                      <>
                        <Check className="w-3.5 h-3.5 text-emerald-500" />
                        <span className="text-emerald-500 font-medium">Copied</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-3.5 h-3.5" />
                        <span>Share</span>
                      </>
                    )}
                  </button>
                </div>
              </div>

              <h2 className="text-[24px] sm:text-[30px] font-bold tracking-tight text-slate-900 dark:text-white">
                {activePolicy.title}
              </h2>

              <p className="text-[15px] sm:text-[16px] text-slate-600 dark:text-gray-300 leading-relaxed bg-slate-50 dark:bg-white/[0.02] p-4 rounded-xl border border-slate-200/60 dark:border-white/5">
                {activePolicy.summary}
              </p>
            </div>

            {/* Paragraphs and Clauses */}
            <div className="space-y-6">
              {activePolicy.paragraphs.map((clause, idx) => (
                <div
                  key={idx}
                  className="p-6 sm:p-7 rounded-2xl border border-slate-200/70 dark:border-white/10 bg-white dark:bg-[#141416] shadow-xs space-y-3"
                >
                  {clause.heading && (
                    <h3 className="text-[17px] sm:text-[18px] font-semibold text-slate-900 dark:text-white tracking-tight">
                      {clause.heading}
                    </h3>
                  )}
                  <p className="text-[14.5px] sm:text-[15.5px] text-slate-600 dark:text-gray-300 leading-relaxed">
                    {clause.text}
                  </p>

                  {clause.highlights && clause.highlights.length > 0 && (
                    <ul className="mt-3 space-y-2 pt-2">
                      {clause.highlights.map((h, hIdx) => (
                        <li
                          key={hIdx}
                          className="flex items-start gap-2.5 text-[14px] text-slate-700 dark:text-gray-300"
                        >
                          <CheckCircle2 className="w-4 h-4 text-[#6ca855] dark:text-[#c8e558] shrink-0 mt-0.5" />
                          <span>{h}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              ))}
            </div>

            {/* Bottom Next/Prev Section Navigation */}
            <div className="pt-4 flex flex-col sm:flex-row items-center justify-between gap-4 border-t border-slate-200 dark:border-white/10">
              <Link
                to="/settings?tab=policies"
                className="inline-flex items-center gap-1.5 text-[13.5px] font-medium text-slate-600 dark:text-gray-400 hover:text-slate-900 dark:hover:text-white transition-colors"
              >
                <FileText className="w-4 h-4" />
                View your accepted policy receipt in Settings &rarr;
              </Link>

              <div className="flex items-center gap-2">
                {(() => {
                  const currentIndex = SADHYA_POLICIES.findIndex((p) => p.id === activePolicy.id);
                  const nextPolicy = SADHYA_POLICIES[currentIndex + 1];
                  if (!nextPolicy) return null;
                  return (
                    <button
                      onClick={() => {
                        setActiveSectionId(nextPolicy.id);
                        window.scrollTo({ top: 120, behavior: 'smooth' });
                      }}
                      className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-900 dark:bg-white text-white dark:text-slate-900 text-[13.5px] font-semibold hover:opacity-90 transition-opacity"
                    >
                      <span>Next: {nextPolicy.title}</span>
                      <ArrowRight className="w-4 h-4" />
                    </button>
                  );
                })()}
              </div>
            </div>
          </div>
        </div>
      </main>

      <SiteFooter />
    </div>
  );
}
