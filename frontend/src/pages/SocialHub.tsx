import React, { useState, useEffect } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'motion/react';
import {
  ExternalLink, CheckCircle2, Heart, MessageCircle, Repeat2,
  Share2, Play, Users, GitFork, Star, Copy, Check,
  Sparkles, Bookmark, Send, ThumbsUp, MessageSquare
} from 'lucide-react';
import SiteHeader from '../components/landing/SiteHeader';
import SkyAmbience from '../components/landing/sky';
import SiteFooter from '../components/landing/SiteFooter';
import { SITE, type SocialIcon } from '../lib/siteConfig';
import { LogoMark as Mark } from '../components/brand/Logo';
import { cn } from '../lib/utils';
import { Underline } from '../components/landing/Annotate';

type PlatformKey = 'x' | 'linkedin' | 'instagram' | 'facebook' | 'youtube' | 'github';

interface PlatformMeta {
  key: PlatformKey;
  name: string;
  handle: string;
  url: string;
  iconName: SocialIcon;
  badge: string;
  tagline: string;
  color: string;
  bgLight: string;
  hoverBorder: string;
}

const PLATFORMS: PlatformMeta[] = [
  {
    key: 'x',
    name: 'X (Twitter)',
    handle: '@sadhyalearn',
    url: 'https://x.com/sadhyalearn',
    iconName: 'x',
    badge: 'Official Updates',
    tagline: 'Real-time engineering deep-dives, syllabus breakdowns & PYQ drops',
    color: '#000000',
    bgLight: 'bg-black/5 dark:bg-white/5',
    hoverBorder: 'hover:border-slate-900/40 dark:hover:border-white/40',
  },
  {
    key: 'linkedin',
    name: 'LinkedIn',
    handle: 'Sadhya Technologies',
    url: 'https://www.linkedin.com/company/sadhyalearn',
    iconName: 'linkedin',
    badge: 'Company & Careers',
    tagline: 'Product philosophy, EdTech architecture & builder dispatches by Aditya Kumar',
    color: '#0077b5',
    bgLight: 'bg-[#0077b5]/10',
    hoverBorder: 'hover:border-[#0077b5]/40',
  },
  {
    key: 'instagram',
    name: 'Instagram',
    handle: '@sadhyalearn',
    url: 'https://www.instagram.com/sadhyalearn',
    iconName: 'instagram',
    badge: 'Visual Learning',
    tagline: 'High-yield exam mind maps, formula revision carousels & daily facts',
    color: '#E1306C',
    bgLight: 'bg-[#E1306C]/10',
    hoverBorder: 'hover:border-[#E1306C]/40',
  },
  {
    key: 'facebook',
    name: 'Facebook',
    handle: 'Sadhya',
    url: 'https://www.facebook.com/sadhyalearn',
    iconName: 'facebook',
    badge: 'Community & Groups',
    tagline: 'Aspirant peer study circles, syllabus notifications & live Q&As',
    color: '#1877F2',
    bgLight: 'bg-[#1877F2]/10',
    hoverBorder: 'hover:border-[#1877F2]/40',
  },
  {
    key: 'youtube',
    name: 'YouTube',
    handle: '@sadhyalearn',
    url: 'https://www.youtube.com/@sadhyalearn',
    iconName: 'youtube',
    badge: 'Video & Audio',
    tagline: 'Dual-voice AI podcasts, masterclass lectures & syllabus strategies',
    color: '#FF0000',
    bgLight: 'bg-[#FF0000]/10',
    hoverBorder: 'hover:border-[#FF0000]/40',
  },
  {
    key: 'github',
    name: 'GitHub',
    handle: 'sadhyalearn',
    url: 'https://github.com/sadhyalearn',
    iconName: 'github',
    badge: 'Open Source',
    tagline: 'Curriculum schemas, benchmark datasets & open research tools',
    color: '#24292e',
    bgLight: 'bg-slate-900/5 dark:bg-white/5',
    hoverBorder: 'hover:border-slate-600/40',
  },
];

/* Brand glyphs for inline icons */
const BRAND_PATHS: Record<SocialIcon, string> = {
  x: 'M18.901 1.153h3.68l-8.04 9.19L24 22.846h-7.406l-5.8-7.584-6.638 7.584H.474l8.6-9.83L0 1.154h7.594l5.243 6.932ZM17.61 20.644h2.039L6.486 3.24H4.298Z',
  linkedin: 'M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.064 2.064 0 112.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z',
  instagram: 'M12 0C8.74 0 8.333.015 7.053.072 5.775.132 4.905.333 4.14.63c-.789.306-1.459.717-2.126 1.384S.935 3.35.63 4.14C.333 4.905.131 5.775.072 7.053.012 8.333 0 8.74 0 12s.015 3.667.072 4.947c.06 1.277.261 2.148.558 2.913.306.788.717 1.459 1.384 2.126.667.666 1.336 1.079 2.126 1.384.766.296 1.636.499 2.913.558C8.333 23.988 8.74 24 12 24s3.667-.015 4.947-.072c1.277-.06 2.148-.262 2.913-.558.788-.306 1.459-.718 2.126-1.384.666-.667 1.079-1.335 1.384-2.126.296-.765.499-1.636.558-2.913.06-1.28.072-1.687.072-4.947s-.015-3.667-.072-4.947c-.06-1.277-.262-2.149-.558-2.913-.306-.789-.718-1.459-1.384-2.126C21.319 1.347 20.651.935 19.86.63c-.765-.297-1.636-.499-2.913-.558C15.667.012 15.26 0 12 0zm0 2.16c3.203 0 3.585.016 4.85.071 1.17.055 1.805.249 2.227.415.562.217.96.477 1.382.896.419.42.679.819.896 1.381.164.422.36 1.057.413 2.227.057 1.266.07 1.646.07 4.85s-.015 3.585-.074 4.85c-.061 1.17-.256 1.805-.421 2.227-.224.562-.479.96-.899 1.382-.419.419-.824.679-1.38.896-.42.164-1.065.36-2.235.413-1.274.057-1.649.07-4.859.07-3.211 0-3.586-.015-4.859-.074-1.171-.061-1.816-.256-2.236-.421-.569-.224-.96-.479-1.379-.899-.421-.419-.69-.824-.9-1.38-.165-.42-.359-1.065-.42-2.235-.045-1.26-.061-1.649-.061-4.844 0-3.196.016-3.586.061-4.861.061-1.17.255-1.814.42-2.234.21-.57.479-.96.9-1.381.419-.419.81-.689 1.379-.898.42-.166 1.051-.361 2.221-.421 1.275-.045 1.65-.06 4.859-.06l.045.03zm0 3.678a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm7.846-10.405a1.441 1.441 0 01-2.88 0 1.44 1.44 0 012.88 0z',
  facebook: 'M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z',
  youtube: 'M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z',
  github: 'M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12',
};

export default function SocialHub() {
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab = (searchParams.get('tab') as PlatformKey) || 'x';
  const [copiedLink, setCopiedLink] = useState(false);

  const selectedPlatform = PLATFORMS.find((p) => p.key === activeTab) || PLATFORMS[0];

  const handleTabChange = (key: PlatformKey) => {
    setSearchParams({ tab: key });
  };

  const copyProfileLink = (url: string) => {
    navigator.clipboard.writeText(url);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2000);
  };

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [activeTab]);

  return (
    <div className="min-h-screen flex flex-col bg-white dark:bg-[#0b0b0c] text-slate-900 dark:text-gray-100 selection:bg-[#c8e558]/30">
      <SiteHeader />
      <SkyAmbience />

      <main className="relative z-10 flex-1">
        {/* ══ Hero Header ════════════════════════════════════════════════════ */}
        <section className="border-b border-slate-100 dark:border-white/[0.07] bg-slate-50/70 dark:bg-white/[0.02]">
          <div className="max-w-[1160px] mx-auto px-5 sm:px-8 pt-14 sm:pt-20 pb-12 sm:pb-16 text-center">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-slate-200 dark:border-white/10 bg-white dark:bg-white/[0.04] text-[12.5px] font-semibold text-slate-700 dark:text-gray-200 mb-5 shadow-2xs">
              <Sparkles className="w-3.5 h-3.5 text-[#8ba32b] dark:text-[#c8e558]" />
              <span>Official Channels &amp; Community Hub</span>
            </div>

            <h1 className="text-[34px] sm:text-[48px] lg:text-[54px] font-semibold tracking-[-0.035em] leading-[1.08] max-w-[46rem] mx-auto">
              Follow Sadhya across your favorite <Underline>networks</Underline>.
            </h1>

            <p className="mt-4 text-[15px] sm:text-[17px] leading-relaxed text-slate-500 dark:text-gray-400 max-w-[38rem] mx-auto">
              Stay connected with real-time syllabus updates, daily PYQ questions, 2-voice podcasts, open-source schemas, and founder insights.
            </p>

            {/* Platform Quick Switch Tabs */}
            <div className="mt-10 flex flex-wrap items-center justify-center gap-2 sm:gap-3">
              {PLATFORMS.map((p) => {
                const isActive = p.key === activeTab;
                return (
                  <button
                    key={p.key}
                    onClick={() => handleTabChange(p.key)}
                    className={cn(
                      'inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-[13.5px] font-semibold transition-all cursor-pointer',
                      isActive
                        ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900 shadow-md scale-102'
                        : 'border border-slate-200/90 dark:border-white/10 bg-white dark:bg-white/[0.03] text-slate-700 dark:text-gray-300 hover:border-slate-300 dark:hover:border-white/20'
                    )}
                  >
                    <svg className="w-4 h-4 fill-current" viewBox="0 0 24 24" aria-hidden>
                      <path d={BRAND_PATHS[p.iconName]} />
                    </svg>
                    <span>{p.name}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </section>

        {/* ══ Live Showcase Section ═══════════════════════════════════════════ */}
        <section className="max-w-[1160px] mx-auto px-5 sm:px-8 py-12 sm:py-16">
          <div className="grid lg:grid-cols-[minmax(0,340px)_minmax(0,1fr)] gap-8 items-start">
            
            {/* Sidebar Profile Card */}
            <div className="rounded-2xl border border-slate-200 dark:border-white/10 bg-white dark:bg-white/[0.03] p-6 sm:p-7 shadow-xs">
              <div className="flex items-center gap-4">
                <div className="w-14 h-14 rounded-2xl bg-[#0b0b0c] border border-slate-200 dark:border-white/10 flex items-center justify-center p-2.5 shadow-sm">
                  <Mark className="w-full h-full text-white" />
                </div>
                <div>
                  <div className="flex items-center gap-1.5">
                    <h2 className="text-[17px] font-bold text-slate-900 dark:text-white">Sadhya</h2>
                    <CheckCircle2 className="w-4 h-4 text-[#8ba32b] dark:text-[#c8e558] fill-current" />
                  </div>
                  <p className="text-[13px] font-medium text-slate-500 dark:text-gray-400">{selectedPlatform.handle}</p>
                </div>
              </div>

              <p className="mt-5 text-[14px] leading-relaxed text-slate-600 dark:text-gray-300">
                {selectedPlatform.tagline}
              </p>

              <div className="mt-6 pt-5 border-t border-slate-100 dark:border-white/[0.07] space-y-3">
                <a
                  href={selectedPlatform.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-full inline-flex items-center justify-center gap-2 h-11 px-5 rounded-xl bg-[#c8e558] hover:bg-[#bcd94c] active:bg-[#b0cd40] text-slate-900 text-[14px] font-semibold transition-all shadow-sm cursor-pointer"
                >
                  <span>Open {selectedPlatform.name}</span>
                  <ExternalLink className="w-4 h-4" />
                </a>

                <button
                  onClick={() => copyProfileLink(selectedPlatform.url)}
                  className="w-full inline-flex items-center justify-center gap-2 h-11 px-5 rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-white/[0.03] text-slate-700 dark:text-gray-200 text-[13.5px] font-semibold hover:bg-slate-100 dark:hover:bg-white/[0.06] transition-colors cursor-pointer"
                >
                  {copiedLink ? <Check className="w-4 h-4 text-green-600" /> : <Copy className="w-4 h-4" />}
                  <span>{copiedLink ? 'Link Copied!' : 'Copy Channel URL'}</span>
                </button>
              </div>

              {/* Founder Direct Connect Card */}
              <div className="mt-6 pt-5 border-t border-slate-100 dark:border-white/[0.07]">
                <p className="text-[11px] font-bold uppercase tracking-[0.1em] text-slate-400 dark:text-slate-500 mb-3">
                  Founder &amp; Engineering
                </p>
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="text-[13.5px] font-semibold text-slate-900 dark:text-white">Aditya Kumar</h4>
                    <p className="text-[11.5px] text-slate-500 dark:text-gray-400">Founder &amp; Product Engineer</p>
                  </div>
                  <a
                    href="https://www.linkedin.com/in/aditya-kumar-122370267/"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[#0077b5]/30 bg-[#0077b5]/10 text-[#0077b5] dark:text-[#38a6e6] text-[12px] font-semibold hover:bg-[#0077b5]/20 transition-colors"
                  >
                    <span>Connect</span>
                  </a>
                </div>
              </div>
            </div>

            {/* Interactive Platform Feed Showcase */}
            <div className="min-w-0">
              <AnimatePresence mode="wait">
                <motion.div
                  key={activeTab}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  transition={{ duration: 0.25 }}
                >
                  {activeTab === 'x' && <TwitterFeedView />}
                  {activeTab === 'linkedin' && <LinkedInFeedView />}
                  {activeTab === 'instagram' && <InstagramFeedView />}
                  {activeTab === 'facebook' && <FacebookFeedView />}
                  {activeTab === 'youtube' && <YouTubeFeedView />}
                  {activeTab === 'github' && <GitHubFeedView />}
                </motion.div>
              </AnimatePresence>
            </div>

          </div>
        </section>
      </main>

      <div className="relative z-10">
        <SiteFooter />
      </div>
    </div>
  );
}

/* ── 1. 𝕏 (Twitter) View ─────────────────────────────────────────────────── */
function TwitterFeedView() {
  return (
    <div className="space-y-4">
      {/* Pinned Tweet */}
      <div className="rounded-2xl border border-slate-200 dark:border-white/10 bg-white dark:bg-white/[0.03] p-5 sm:p-6 shadow-xs">
        <div className="flex items-center gap-2 text-[12px] font-semibold text-slate-400 dark:text-slate-500 mb-3">
          <Bookmark className="w-3.5 h-3.5 text-[#8ba32b] dark:text-[#c8e558]" />
          <span>Pinned Thread · Engineering &amp; Philosophy</span>
        </div>

        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-full bg-slate-900 dark:bg-white flex items-center justify-center shrink-0">
            <Mark className="w-5 h-5 text-white dark:text-slate-900" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="font-bold text-[14.5px] text-slate-900 dark:text-white">Sadhya</span>
              <CheckCircle2 className="w-3.5 h-3.5 text-[#1DA1F2]" />
              <span className="text-[13px] text-slate-500 dark:text-gray-400">@sadhyalearn</span>
              <span className="text-[13px] text-slate-400 dark:text-slate-500">· 1d</span>
            </div>

            <p className="mt-2.5 text-[14.5px] leading-relaxed text-slate-800 dark:text-gray-200">
              Exam prep in India is broken because tools operate in silos.
              <br /><br />
              Your syllabus doesn&rsquo;t know what questions you got wrong. Your question bank doesn&rsquo;t know which chapters you haven&rsquo;t opened.
              <br /><br />
              Here is how we built Sadhya&rsquo;s 5-stage Syllabus Intelligence Engine: 🧵👇
            </p>

            <div className="mt-3.5 p-4 rounded-xl border border-slate-100 dark:border-white/[0.06] bg-slate-50/70 dark:bg-white/[0.02]">
              <div className="text-[12.5px] font-semibold text-[#8ba32b] dark:text-[#c8e558] mb-1">
                Syllabus → Questions → Practice → Mastery → Planning
              </div>
              <p className="text-[13px] text-slate-600 dark:text-gray-300">
                Grounding every AI answer strictly in the official commission syllabus (UPSC, JEE, NEET, SSC, BPSC, RRB). No hallucinations, pure citations.
              </p>
            </div>

            <div className="mt-4 flex items-center justify-between text-[12.5px] text-slate-500 dark:text-gray-400 max-w-sm pt-2">
              <span className="inline-flex items-center gap-1.5 hover:text-[#1DA1F2] cursor-pointer">
                <MessageCircle className="w-4 h-4" /> 142
              </span>
              <span className="inline-flex items-center gap-1.5 hover:text-emerald-500 cursor-pointer">
                <Repeat2 className="w-4 h-4" /> 389
              </span>
              <span className="inline-flex items-center gap-1.5 hover:text-rose-500 cursor-pointer">
                <Heart className="w-4 h-4" /> 1.2K
              </span>
              <span className="inline-flex items-center gap-1.5 hover:text-blue-500 cursor-pointer">
                <Share2 className="w-4 h-4" />
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Daily PYQ Tweet */}
      <div className="rounded-2xl border border-slate-200 dark:border-white/10 bg-white dark:bg-white/[0.03] p-5 sm:p-6 shadow-xs">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-full bg-slate-900 dark:bg-white flex items-center justify-center shrink-0">
            <Mark className="w-5 h-5 text-white dark:text-slate-900" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="font-bold text-[14.5px] text-slate-900 dark:text-white">Sadhya</span>
              <CheckCircle2 className="w-3.5 h-3.5 text-[#1DA1F2]" />
              <span className="text-[13px] text-slate-500 dark:text-gray-400">@sadhyalearn</span>
              <span className="text-[13px] text-slate-400 dark:text-slate-500">· 4h</span>
            </div>

            <p className="mt-2.5 text-[14.5px] leading-relaxed text-slate-800 dark:text-gray-200">
              ⚡ <strong>Daily Exam Challenge #48 · SSC CGL &amp; UPSC Prelims:</strong>
              <br /><br />
              &ldquo;Under Article 110 of the Constitution of India, which of the following is NOT an essential provision for a bill to be deemed a Money Bill?&rdquo;
              <br /><br />
              Test your answer on Sadhya AI and get step-by-step constitutional analysis with previous year trend charts!
            </p>

            <div className="mt-4 flex items-center justify-between text-[12.5px] text-slate-500 dark:text-gray-400 max-w-sm pt-2">
              <span className="inline-flex items-center gap-1.5 hover:text-[#1DA1F2] cursor-pointer">
                <MessageCircle className="w-4 h-4" /> 86
              </span>
              <span className="inline-flex items-center gap-1.5 hover:text-emerald-500 cursor-pointer">
                <Repeat2 className="w-4 h-4" /> 140
              </span>
              <span className="inline-flex items-center gap-1.5 hover:text-rose-500 cursor-pointer">
                <Heart className="w-4 h-4" /> 620
              </span>
              <span className="inline-flex items-center gap-1.5 hover:text-blue-500 cursor-pointer">
                <Share2 className="w-4 h-4" />
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── 2. LinkedIn View ─────────────────────────────────────────────────────── */
function LinkedInFeedView() {
  return (
    <div className="space-y-4">
      {/* Featured Company Post */}
      <div className="rounded-2xl border border-slate-200 dark:border-white/10 bg-white dark:bg-white/[0.03] p-5 sm:p-6 shadow-xs">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl bg-slate-900 dark:bg-white flex items-center justify-center p-2">
              <Mark className="w-full h-full text-white dark:text-slate-900" />
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <h3 className="font-bold text-[15px] text-slate-900 dark:text-white">Sadhya Technologies</h3>
                <span className="text-[12px] text-slate-400">· 1st</span>
              </div>
              <p className="text-[12px] text-slate-500 dark:text-gray-400">E-Learning Providers · 1,420 followers</p>
            </div>
          </div>
          <span className="text-[12px] text-slate-400">2d</span>
        </div>

        <p className="text-[14.5px] leading-relaxed text-slate-800 dark:text-gray-200">
          We believe progress should mean more than hours studied.
          <br /><br />
          A student studying for four hours is not necessarily four hours closer to clearing their exam. Hours are the easiest metric to measure, but the least useful thing to know.
          <br /><br />
          Sadhya is architected around 5 core educational questions:
          <br />
          1️⃣ What is in the syllabus?
          <br />
          2️⃣ What has the student covered?
          <br />
          3️⃣ What do they actually understand?
          <br />
          4️⃣ Where are they losing marks?
          <br />
          5️⃣ What should they practice next?
        </p>

        <div className="mt-4 p-4 rounded-xl border border-slate-200/80 dark:border-white/10 bg-slate-50 dark:bg-white/[0.02]">
          <h4 className="text-[14px] font-semibold text-slate-900 dark:text-white">Building the Next Generation of Indian EdTech</h4>
          <p className="mt-1 text-[12.5px] text-slate-500 dark:text-gray-400">Read the founder manifesto on authentic syllabus-grounded learning models.</p>
        </div>

        <div className="mt-5 pt-3 border-t border-slate-100 dark:border-white/[0.07] flex items-center justify-between text-[13px] text-slate-600 dark:text-gray-300">
          <span className="flex items-center gap-1.5 hover:text-[#0077b5] cursor-pointer">
            <ThumbsUp className="w-4 h-4" /> <span>Like (482)</span>
          </span>
          <span className="flex items-center gap-1.5 hover:text-[#0077b5] cursor-pointer">
            <MessageSquare className="w-4 h-4" /> <span>Comment (58)</span>
          </span>
          <span className="flex items-center gap-1.5 hover:text-[#0077b5] cursor-pointer">
            <Repeat2 className="w-4 h-4" /> <span>Repost (74)</span>
          </span>
          <span className="flex items-center gap-1.5 hover:text-[#0077b5] cursor-pointer">
            <Send className="w-4 h-4" /> <span>Send</span>
          </span>
        </div>
      </div>
    </div>
  );
}

/* ── 3. Instagram View ────────────────────────────────────────────────────── */
function InstagramFeedView() {
  const POSTS = [
    { title: 'Mind Map: Fundamental Rights', tag: 'Polity', color: 'from-amber-500 to-orange-600' },
    { title: 'Organic Chemistry Reactions', tag: 'JEE & NEET', color: 'from-emerald-500 to-teal-700' },
    { title: 'Modern Indian History Timeline', tag: 'UPSC CSE', color: 'from-blue-600 to-indigo-800' },
    { title: 'Quantitative Speed Formulas', tag: 'SSC CGL', color: 'from-purple-600 to-pink-600' },
    { title: 'Dual-Voice AI Podcast Reel', tag: 'Podcast Studio', color: 'from-rose-500 to-red-700' },
    { title: 'How to Fix Negative Marking', tag: 'Strategy', color: 'from-cyan-600 to-blue-700' },
  ];

  return (
    <div className="space-y-6">
      {/* Story Highlights */}
      <div className="flex items-center gap-4 overflow-x-auto pb-2">
        {['Voice Mode', 'PYQs Vault', 'Toppers', 'Tips & Hacks', 'Updates'].map((story) => (
          <div key={story} className="flex flex-col items-center gap-1.5 shrink-0 cursor-pointer group">
            <div className="w-14 h-14 rounded-full p-0.5 bg-gradient-to-tr from-amber-500 via-rose-500 to-purple-600 group-hover:scale-105 transition-transform">
              <div className="w-full h-full rounded-full bg-white dark:bg-[#141416] p-1 flex items-center justify-center">
                <Sparkles className="w-5 h-5 text-slate-800 dark:text-gray-200" />
              </div>
            </div>
            <span className="text-[11.5px] font-medium text-slate-600 dark:text-gray-400">{story}</span>
          </div>
        ))}
      </div>

      {/* Grid of Posts */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3.5">
        {POSTS.map((p) => (
          <div
            key={p.title}
            className="group relative aspect-square rounded-2xl overflow-hidden bg-slate-900 border border-slate-200/60 dark:border-white/10 cursor-pointer shadow-xs"
          >
            <div className={`absolute inset-0 bg-gradient-to-br ${p.color} opacity-80 group-hover:opacity-95 transition-opacity p-4 flex flex-col justify-between text-white`}>
              <span className="text-[11px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-black/30 backdrop-blur-md w-fit">
                {p.tag}
              </span>
              <div>
                <h4 className="text-[13.5px] font-bold leading-snug drop-shadow-sm">{p.title}</h4>
                <div className="mt-2 flex items-center gap-3 text-[11.5px] opacity-90">
                  <span className="flex items-center gap-1"><Heart className="w-3.5 h-3.5" /> 840</span>
                  <span className="flex items-center gap-1"><MessageCircle className="w-3.5 h-3.5" /> 42</span>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ── 4. Facebook View ─────────────────────────────────────────────────────── */
function FacebookFeedView() {
  return (
    <div className="space-y-4">
      {/* Community Group Card */}
      <div className="rounded-2xl border border-slate-200 dark:border-white/10 bg-white dark:bg-white/[0.03] p-5 sm:p-6 shadow-xs">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-[#1877F2] text-white flex items-center justify-center p-2.5">
              <Users className="w-full h-full" />
            </div>
            <div>
              <h3 className="font-bold text-[15px] text-slate-900 dark:text-white">Sadhya Aspirants Community</h3>
              <p className="text-[12px] text-slate-500 dark:text-gray-400">Public Group · 18,400+ Active Members</p>
            </div>
          </div>
          <a
            href="https://www.facebook.com/sadhyalearn"
            target="_blank"
            rel="noopener noreferrer"
            className="px-3.5 py-1.5 rounded-xl bg-[#1877F2] text-white text-[12.5px] font-semibold hover:opacity-90 transition-opacity"
          >
            Join Group
          </a>
        </div>

        <p className="text-[14px] leading-relaxed text-slate-700 dark:text-gray-300">
          Connect with thousands of fellow students preparing for UPSC CSE, SSC CGL, JEE Main, NEET-UG, and State PSC exams. Share daily doubts, exam strategy notes, and verified syllabus updates.
        </p>

        <div className="mt-4 pt-3 border-t border-slate-100 dark:border-white/[0.07] flex items-center gap-6 text-[12.5px] text-slate-500 dark:text-gray-400">
          <span>👥 150+ new members today</span>
          <span>💬 420+ questions resolved this week</span>
        </div>
      </div>

      {/* Official Announcement Post */}
      <div className="rounded-2xl border border-slate-200 dark:border-white/10 bg-white dark:bg-white/[0.03] p-5 sm:p-6 shadow-xs">
        <div className="flex items-center gap-3 mb-3">
          <div className="w-10 h-10 rounded-full bg-slate-900 dark:bg-white flex items-center justify-center">
            <Mark className="w-5 h-5 text-white dark:text-slate-900" />
          </div>
          <div>
            <div className="flex items-center gap-1.5">
              <h4 className="font-bold text-[14.5px] text-slate-900 dark:text-white">Sadhya</h4>
              <CheckCircle2 className="w-3.5 h-3.5 text-[#1877F2]" />
            </div>
            <span className="text-[12px] text-slate-400">3 days ago · 🌐</span>
          </div>
        </div>

        <p className="text-[14.5px] leading-relaxed text-slate-800 dark:text-gray-200">
          📢 <strong>Official Notification Blueprint Update:</strong>
          <br /><br />
          We have indexed the latest 2026 examination schemes, marking rubrics, and subject-wise syllabus modules for NTA JEE Main, NEET, BPSC 70th, and SSC CGL directly into the Sadhya AI Engine.
          <br /><br />
          Experience zero-hallucination doubt solving today at sadhya.app!
        </p>

        <div className="mt-4 pt-3 border-t border-slate-100 dark:border-white/[0.07] flex items-center justify-between text-[13px] text-slate-600 dark:text-gray-300">
          <span className="flex items-center gap-1.5 hover:text-[#1877F2] cursor-pointer">
            <ThumbsUp className="w-4 h-4" /> 312 Likes
          </span>
          <span className="flex items-center gap-1.5 hover:text-[#1877F2] cursor-pointer">
            <MessageSquare className="w-4 h-4" /> 45 Comments
          </span>
          <span className="flex items-center gap-1.5 hover:text-[#1877F2] cursor-pointer">
            <Share2 className="w-4 h-4" /> 68 Shares
          </span>
        </div>
      </div>
    </div>
  );
}

/* ── 5. YouTube View ──────────────────────────────────────────────────────── */
function YouTubeFeedView() {
  const VIDEOS = [
    { title: 'SSC CGL Quant Full Syllabus Breakdown (2-Voice AI Explainer)', duration: '14:20', views: '24K views', date: '3 days ago' },
    { title: 'UPSC CSE GS-1 Geography: High-Yield Topics Explained', duration: '22:15', views: '18K views', date: '1 week ago' },
    { title: 'How Sadhya AI Solves Complex JEE Math Step-by-Step', duration: '08:45', views: '32K views', date: '2 weeks ago' },
  ];

  return (
    <div className="space-y-4">
      {/* Featured Video Player Banner */}
      <div className="rounded-2xl border border-slate-200 dark:border-white/10 bg-slate-950 text-white overflow-hidden shadow-md">
        <div className="relative aspect-video bg-gradient-to-tr from-slate-950 via-slate-900 to-slate-800 flex items-center justify-center p-6">
          <div className="text-center">
            <div className="w-16 h-16 rounded-full bg-red-600 hover:bg-red-700 flex items-center justify-center mx-auto shadow-lg hover:scale-105 transition-transform cursor-pointer">
              <Play className="w-7 h-7 text-white fill-current ml-1" />
            </div>
            <h3 className="mt-4 text-[16px] sm:text-[18px] font-bold max-w-md mx-auto">
              Meet Sadhya: The AI Tutor Grounded in India&rsquo;s Toughest Syllabi
            </h3>
            <p className="mt-1 text-[13px] text-gray-400">Watch the 2-minute interactive architecture walkthrough</p>
          </div>
        </div>
      </div>

      {/* Playlist Grid */}
      <div className="space-y-3">
        {VIDEOS.map((v) => (
          <div
            key={v.title}
            className="rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-white/[0.03] p-4 flex items-center justify-between gap-4 hover:border-slate-300 dark:hover:border-white/20 transition-colors shadow-2xs"
          >
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-12 h-12 rounded-lg bg-red-600/10 text-red-600 flex items-center justify-center shrink-0">
                <Play className="w-5 h-5 fill-current" />
              </div>
              <div className="min-w-0">
                <h4 className="text-[14px] font-semibold text-slate-900 dark:text-white truncate">{v.title}</h4>
                <p className="text-[12px] text-slate-500 dark:text-gray-400">{v.duration} · {v.views} · {v.date}</p>
              </div>
            </div>
            <a
              href="https://www.youtube.com/@sadhyalearn"
              target="_blank"
              rel="noopener noreferrer"
              className="shrink-0 text-[12.5px] font-semibold text-[#8ba32b] dark:text-[#c8e558] hover:underline"
            >
              Watch
            </a>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ── 6. GitHub View ───────────────────────────────────────────────────────── */
function GitHubFeedView() {
  const REPOS = [
    { name: 'sadhya-syllabus-schemas', desc: 'Canonical JSON & Markdown schemas for 17+ Indian competitive exam syllabi and marking rubrics.', stars: 342, forks: 88, lang: 'TypeScript' },
    { name: 'pyq-retrieval-benchmarks', desc: 'Evaluation datasets and accuracy benchmarks for syllabus-grounded educational retrieval systems.', stars: 215, forks: 46, lang: 'Python' },
    { name: 'open-exam-catalog', desc: 'Public blueprint directory indexing authentic official links and stages for SSC, UPSC, NTA, and State PSCs.', stars: 180, forks: 32, lang: 'TypeScript' },
  ];

  return (
    <div className="space-y-4">
      {/* Org Header */}
      <div className="rounded-2xl border border-slate-200 dark:border-white/10 bg-white dark:bg-white/[0.03] p-5 sm:p-6 shadow-xs">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-slate-900 text-white flex items-center justify-center p-2">
              <svg className="w-full h-full fill-current" viewBox="0 0 24 24">
                <path d={BRAND_PATHS.github} />
              </svg>
            </div>
            <div>
              <h3 className="font-bold text-[15px] text-slate-900 dark:text-white">sadhyalearn</h3>
              <p className="text-[12px] text-slate-500 dark:text-gray-400">Open source curriculum tools &amp; benchmarks</p>
            </div>
          </div>
          <a
            href="https://github.com/sadhyalearn"
            target="_blank"
            rel="noopener noreferrer"
            className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-white/10 text-[12.5px] font-semibold hover:bg-slate-50 dark:hover:bg-white/[0.05]"
          >
            Follow Org
          </a>
        </div>
      </div>

      {/* Pinned Repos */}
      <div className="grid gap-3 sm:grid-cols-1">
        {REPOS.map((r) => (
          <div
            key={r.name}
            className="rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-white/[0.03] p-5 hover:border-slate-300 dark:hover:border-white/20 transition-colors shadow-2xs"
          >
            <div className="flex items-center justify-between">
              <a
                href={`https://github.com/sadhyalearn/${r.name}`}
                target="_blank"
                rel="noopener noreferrer"
                className="font-bold text-[14.5px] text-blue-600 dark:text-blue-400 hover:underline"
              >
                {r.name}
              </a>
              <span className="text-[11.5px] px-2 py-0.5 rounded-full border border-slate-200 dark:border-white/10 text-slate-500">Public</span>
            </div>

            <p className="mt-2 text-[13.5px] text-slate-600 dark:text-gray-300">{r.desc}</p>

            <div className="mt-4 flex items-center gap-4 text-[12px] text-slate-500 dark:text-gray-400">
              <span className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-blue-500" />
                {r.lang}
              </span>
              <span className="flex items-center gap-1">
                <Star className="w-3.5 h-3.5" /> {r.stars}
              </span>
              <span className="flex items-center gap-1">
                <GitFork className="w-3.5 h-3.5" /> {r.forks}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
