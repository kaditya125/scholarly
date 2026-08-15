import React, { useState, useEffect } from 'react';
import {
  Search, Star, Download, BookOpen, Brain, Filter, Sparkles, Award,
  ArrowRight, Heart, Notebook, Compass, Check, Bookmark, Layers, Eye
} from 'lucide-react';
import { motion } from 'motion/react';
import { cn } from '../lib/utils';

export interface PublishedAsset {
  id: string;
  notebookId: string;
  userId: string;
  type: string;
  title: string;
  description?: string;
  content: any;
  sourceDocIds: string[];
  createdAt: number;
  updatedAt: number;
  isPublic: boolean;
  authorId: string;
  authorName: string;
  subject?: string;
  exam?: string;
  aiModel?: string;
  rating: number;
  ratingCount: number;
  downloads: number;
  bookmarks: number;
  reports: number;
  publishedAt: number;
}

const TYPE_CONFIG: Record<string, { label: string; icon: React.ReactNode; color: string; bg: string }> = {
  'FLASHCARDS': {
    label: 'Flashcards',
    icon: <BookOpen className="w-3.5 h-3.5" />,
    color: 'text-amber-700 dark:text-amber-300',
    bg: 'bg-amber-500/10 border-amber-500/20'
  },
  'QUIZ': {
    label: 'Interactive Quiz',
    icon: <Brain className="w-3.5 h-3.5" />,
    color: 'text-blue-700 dark:text-blue-300',
    bg: 'bg-blue-500/10 border-blue-500/20'
  },
  'MIND_MAP': {
    label: 'Concept Mind Map',
    icon: <Sparkles className="w-3.5 h-3.5" />,
    color: 'text-[#8ba32b] dark:text-[#c8e558]',
    bg: 'bg-[#8ba32b]/10 dark:bg-[#c8e558]/10 border-[#8ba32b]/20 dark:border-[#c8e558]/20'
  },
  'NOTES': {
    label: 'Structured Notes',
    icon: <Notebook className="w-3.5 h-3.5" />,
    color: 'text-emerald-700 dark:text-emerald-300',
    bg: 'bg-emerald-500/10 border-emerald-500/20'
  },
  'SUMMARY': {
    label: 'Exam Cheat Sheet',
    icon: <Award className="w-3.5 h-3.5" />,
    color: 'text-purple-700 dark:text-purple-300',
    bg: 'bg-purple-500/10 border-purple-500/20'
  }
};

export default function Explore() {
  const [assets, setAssets] = useState<PublishedAsset[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterType, setFilterType] = useState<string>('All');
  const [searchQuery, setSearchQuery] = useState('');
  const [savedIds, setSavedIds] = useState<Set<string>>(new Set());
  const [downloadedIds, setDownloadedIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    const mockAssets: PublishedAsset[] = [
      {
        id: '1',
        notebookId: 'n1',
        userId: 'u1',
        type: 'FLASHCARDS',
        title: 'NCERT Biology Class 11 — Cell Structure & Biomolecules',
        description: 'Comprehensive high-yield active recall flashcards covering organelle functions, cell division, and enzyme kinetics.',
        content: {},
        sourceDocIds: [],
        createdAt: Date.now() - 1000 * 60 * 60 * 24 * 2,
        updatedAt: Date.now(),
        isPublic: true,
        authorId: 'u1',
        authorName: 'Dr. A. Sharma',
        subject: 'Biology',
        exam: 'NEET 2026',
        rating: 4.9,
        ratingCount: 184,
        downloads: 620,
        bookmarks: 42,
        reports: 0,
        publishedAt: Date.now()
      },
      {
        id: '2',
        notebookId: 'n2',
        userId: 'u2',
        type: 'QUIZ',
        title: 'JEE Advanced Physics — Rotational Mechanics & Rigid Bodies',
        description: '25 challenging multi-concept problems with step-by-step video timestamps and formula reminders.',
        content: {},
        sourceDocIds: [],
        createdAt: Date.now() - 1000 * 60 * 60 * 24 * 4,
        updatedAt: Date.now(),
        isPublic: true,
        authorId: 'u2',
        authorName: 'IITian Prep Circle',
        subject: 'Physics',
        exam: 'JEE Advanced',
        rating: 4.9,
        ratingCount: 420,
        downloads: 1450,
        bookmarks: 98,
        reports: 0,
        publishedAt: Date.now()
      },
      {
        id: '3',
        notebookId: 'n3',
        userId: 'u3',
        type: 'MIND_MAP',
        title: 'UPSC History — Indian Freedom Struggle (1857 to 1947)',
        description: 'Hierarchical chronological mind map linking viceroys, key congress sessions, and socio-religious reforms.',
        content: {},
        sourceDocIds: [],
        createdAt: Date.now() - 1000 * 60 * 60 * 24 * 6,
        updatedAt: Date.now(),
        isPublic: true,
        authorId: 'u3',
        authorName: 'IAS Aspirant Hub',
        subject: 'Modern History',
        exam: 'UPSC CSE',
        rating: 4.8,
        ratingCount: 112,
        downloads: 540,
        bookmarks: 35,
        reports: 0,
        publishedAt: Date.now()
      },
      {
        id: '4',
        notebookId: 'n4',
        userId: 'u4',
        type: 'NOTES',
        title: 'Organic Chemistry — Named Reactions, Reagents & Mechanisms',
        description: 'Aldol, Cannizzaro, Grignard, and Friedel-Crafts reaction pathways with key reaction intermediates.',
        content: {},
        sourceDocIds: [],
        createdAt: Date.now() - 1000 * 60 * 60 * 24 * 8,
        updatedAt: Date.now(),
        isPublic: true,
        authorId: 'u4',
        authorName: 'ChemMaster JEE',
        subject: 'Chemistry',
        exam: 'JEE Mains / NEET',
        rating: 4.7,
        ratingCount: 230,
        downloads: 1120,
        bookmarks: 64,
        reports: 0,
        publishedAt: Date.now()
      },
      {
        id: '5',
        notebookId: 'n5',
        userId: 'u5',
        type: 'SUMMARY',
        title: 'Quantitative Aptitude — Fast Calculation Tricks & Formulas',
        description: 'Speed math cheat sheet: percentage multipliers, compound interest approximations, and ratio shortcuts.',
        content: {},
        sourceDocIds: [],
        createdAt: Date.now() - 1000 * 60 * 60 * 24 * 10,
        updatedAt: Date.now(),
        isPublic: true,
        authorId: 'u5',
        authorName: 'QuantGuru Pro',
        subject: 'Mathematics',
        exam: 'SSC CGL / CAT',
        rating: 4.9,
        ratingCount: 560,
        downloads: 2400,
        bookmarks: 140,
        reports: 0,
        publishedAt: Date.now()
      }
    ];
    setAssets(mockAssets);
    setLoading(false);
  }, []);

  const toggleBookmark = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setSavedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleDownload = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setDownloadedIds((prev) => new Set(prev).add(id));
  };

  const filteredAssets = assets.filter((a) => {
    if (filterType !== 'All' && a.type !== filterType) return false;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      return (
        a.title.toLowerCase().includes(q) ||
        (a.subject && a.subject.toLowerCase().includes(q)) ||
        (a.exam && a.exam.toLowerCase().includes(q)) ||
        a.authorName.toLowerCase().includes(q)
      );
    }
    return true;
  });

  return (
    <div className="w-full min-h-full pb-14 bg-slate-50 dark:bg-[#131315] text-slate-900 dark:text-slate-100 font-sans transition-colors duration-200">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-7">
        {/* ── Header ────────────────────────────────────────────── */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-7">
          <div>
            <div className="flex items-center gap-2.5 mb-1.5">
              <div className="w-9 h-9 rounded-xl bg-[#8ba32b]/10 dark:bg-[#c8e558]/10 text-[#8ba32b] dark:text-[#c8e558] flex items-center justify-center border border-[#8ba32b]/20 dark:border-[#c8e558]/20 shrink-0">
                <Compass className="w-5 h-5" />
              </div>
              <h1 className="text-2xl sm:text-[28px] font-bold text-slate-900 dark:text-white tracking-tight">
                Explore Community Study Assets
              </h1>
            </div>
            <p className="text-[13px] text-slate-500 dark:text-slate-400">
              Discover verified flashcards, quizzes, mind maps, and exam summaries curated by top educators and students.
            </p>
          </div>

          {/* Quick Metrics */}
          <div className="flex items-center gap-2">
            <div className="px-3.5 py-1.5 rounded-xl bg-white dark:bg-[#1a1a1e] border border-slate-200/90 dark:border-white/[0.08] shadow-2xs flex items-center gap-2">
              <Sparkles className="w-3.5 h-3.5 text-[#8ba32b] dark:text-[#c8e558]" />
              <span className="text-[12px] font-medium text-slate-500 dark:text-slate-400">Community Assets:</span>
              <span className="text-[12.5px] font-bold text-slate-900 dark:text-white">2,400+</span>
            </div>
          </div>
        </div>

        {/* ── Search & Filter Controls ───────────────────────────── */}
        <div className="bg-white dark:bg-[#1a1a1e] rounded-3xl border border-slate-200/90 dark:border-white/[0.08] p-5 shadow-2xs mb-8">
          <div className="flex flex-col sm:flex-row gap-3 items-center">
            <div className="relative flex-1 w-full">
              <Search className="w-4 h-4 absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="Search by topic, subject (Physics, Biology), exam (NEET, JEE, UPSC), or author..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-11 pr-4 py-2.5 bg-slate-50 dark:bg-[#232328] border border-slate-200/90 dark:border-white/[0.08] rounded-2xl text-[13.5px] text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#8ba32b]/20 dark:focus:ring-[#c8e558]/20 focus:border-[#8ba32b] dark:focus:border-[#c8e558]"
              />
            </div>
          </div>

          {/* Type Filter Pills */}
          <div className="mt-4 flex flex-wrap gap-2 pt-3 border-t border-slate-100 dark:border-white/[0.06]">
            {['All', 'FLASHCARDS', 'QUIZ', 'MIND_MAP', 'NOTES', 'SUMMARY'].map((type) => {
              const active = filterType === type;
              return (
                <button
                  key={type}
                  onClick={() => setFilterType(type)}
                  className={cn(
                    'px-4 py-1.5 rounded-full text-[12.5px] font-bold transition-all cursor-pointer shadow-2xs',
                    active
                      ? 'bg-slate-900 text-white dark:bg-[#c8e558] dark:text-slate-950 shadow-xs'
                      : 'bg-slate-50 dark:bg-[#232328] text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-[#2b2b32] border border-slate-200/70 dark:border-white/[0.06]'
                  )}
                >
                  {type === 'All' ? 'All Formats' : TYPE_CONFIG[type]?.label || type.replace('_', ' ')}
                </button>
              );
            })}
          </div>
        </div>

        {/* ── Assets Grid ────────────────────────────────────────── */}
        {loading ? (
          <div className="flex flex-col items-center justify-center py-24 gap-3">
            <div className="w-8 h-8 border-3 border-[#8ba32b] dark:border-[#c8e558] border-t-transparent rounded-full animate-spin"></div>
            <span className="text-[13px] text-slate-400">Discovering learning assets…</span>
          </div>
        ) : filteredAssets.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center bg-white dark:bg-[#1a1a1e] rounded-3xl border border-slate-200/90 dark:border-white/[0.08] p-8 shadow-2xs">
            <div className="w-16 h-16 bg-[#8ba32b]/10 dark:bg-[#c8e558]/10 text-[#8ba32b] dark:text-[#c8e558] rounded-2xl flex items-center justify-center mb-4 border border-[#8ba32b]/20 dark:border-[#c8e558]/20">
              <Search className="w-8 h-8" />
            </div>
            <h3 className="text-[17px] font-bold text-slate-900 dark:text-white">No assets matched your search</h3>
            <p className="text-[13px] text-slate-500 dark:text-slate-400 max-w-md mt-1 leading-relaxed">
              Try adjusting your search terms or select “All Formats” to view available study guides.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {filteredAssets.map((asset, index) => {
              const config = TYPE_CONFIG[asset.type] || TYPE_CONFIG['NOTES'];
              const isSaved = savedIds.has(asset.id);
              const isDownloaded = downloadedIds.has(asset.id);

              return (
                <motion.div
                  key={asset.id}
                  initial={{ opacity: 0, y: 15 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: index * 0.04 }}
                  className="bg-white dark:bg-[#1a1a1e] rounded-3xl border border-slate-200/90 dark:border-white/[0.08] shadow-2xs hover:shadow-md hover:border-slate-300 dark:hover:border-white/20 transition-all duration-200 group flex flex-col justify-between overflow-hidden"
                >
                  {/* Card Header */}
                  <div className="p-5 pb-4">
                    <div className="flex items-center justify-between gap-2 mb-3">
                      <div className={cn(
                        'px-2.5 py-1 rounded-full flex items-center gap-1.5 text-[11px] font-bold border',
                        config.bg, config.color
                      )}>
                        {config.icon}
                        <span>{config.label}</span>
                      </div>

                      <button
                        onClick={(e) => toggleBookmark(asset.id, e)}
                        className={cn(
                          'w-8 h-8 rounded-xl flex items-center justify-center transition-colors cursor-pointer border',
                          isSaved
                            ? 'bg-rose-50 dark:bg-rose-500/15 text-rose-600 border-rose-200 dark:border-rose-500/30'
                            : 'bg-slate-100 dark:bg-white/5 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 border-transparent'
                        )}
                        title={isSaved ? 'Remove Bookmark' : 'Save Bookmark'}
                      >
                        <Heart className={cn('w-4 h-4', isSaved && 'fill-rose-600')} />
                      </button>
                    </div>

                    <h3 className="font-bold text-[15px] text-slate-900 dark:text-white leading-snug mb-2 group-hover:text-[#8ba32b] dark:group-hover:text-[#c8e558] transition-colors line-clamp-2">
                      {asset.title}
                    </h3>

                    {asset.description && (
                      <p className="text-[12.5px] text-slate-500 dark:text-slate-400 line-clamp-2 leading-relaxed mb-4">
                        {asset.description}
                      </p>
                    )}

                    {/* Tags */}
                    <div className="flex flex-wrap gap-1.5 mb-2">
                      {asset.exam && (
                        <span className="px-2.5 py-0.5 bg-slate-100 dark:bg-[#232328] text-slate-700 dark:text-slate-300 text-[11px] rounded-lg font-semibold border border-slate-200/60 dark:border-white/[0.05]">
                          {asset.exam}
                        </span>
                      )}
                      {asset.subject && (
                        <span className="px-2.5 py-0.5 bg-slate-100 dark:bg-[#232328] text-slate-700 dark:text-slate-300 text-[11px] rounded-lg font-semibold border border-slate-200/60 dark:border-white/[0.05]">
                          {asset.subject}
                        </span>
                      )}
                      <span className="text-[11.5px] text-slate-400 dark:text-slate-500 ml-auto self-center">
                        by <span className="font-medium text-slate-600 dark:text-slate-300">{asset.authorName}</span>
                      </span>
                    </div>
                  </div>

                  {/* Card Footer */}
                  <div className="px-5 py-3.5 border-t border-slate-100 dark:border-white/[0.06] bg-slate-50/50 dark:bg-[#161619]/50 flex items-center justify-between">
                    <div className="flex items-center gap-3.5 text-[12.5px] text-slate-500 font-medium">
                      <div className="flex items-center gap-1">
                        <Star className="w-3.5 h-3.5 text-amber-500 fill-amber-500" />
                        <span className="font-bold text-slate-800 dark:text-slate-200">{asset.rating.toFixed(1)}</span>
                        <span className="text-slate-400 dark:text-slate-500 text-[11.5px]">({asset.ratingCount})</span>
                      </div>
                      <div className="flex items-center gap-1 text-[12px]">
                        <Download className="w-3.5 h-3.5 text-slate-400" />
                        <span>{asset.downloads + (isDownloaded ? 1 : 0)}</span>
                      </div>
                    </div>

                    <button
                      onClick={(e) => handleDownload(asset.id, e)}
                      className={cn(
                        'inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-[12px] font-bold transition-all cursor-pointer shadow-xs active:scale-98',
                        isDownloaded
                          ? 'bg-[#8ba32b]/15 dark:bg-[#c8e558]/15 text-[#8ba32b] dark:text-[#c8e558] border border-[#8ba32b]/30 dark:border-[#c8e558]/30'
                          : 'bg-slate-900 text-white dark:bg-[#c8e558] dark:text-slate-950 hover:opacity-90'
                      )}
                    >
                      {isDownloaded ? (
                        <>
                          <Check className="w-3.5 h-3.5" />
                          <span>Saved to Library</span>
                        </>
                      ) : (
                        <>
                          <Download className="w-3.5 h-3.5" />
                          <span>Get Asset</span>
                        </>
                      )}
                    </button>
                  </div>
                </motion.div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
