/**
 * ContentExplorationSearch
 * Phase 7: Content Exploration UI
 *
 * Implements:
 * 1. Unified Hybrid / Semantic / Keyword search engine bar
 * 2. Deep educational metadata filtering (subject, grade, exam, collection, language)
 * 3. Search result cards showing Title, Snippet, Document, Chapter, Section, Page, Relevance
 * 4. Deterministic 4-level lineage breadcrumb: Search Result -> Chunk -> Page -> Document
 * 5. Direct click-to-navigate action leading straight to the document workspace source location.
 */

import React, { useState } from 'react';
import {
  Search,
  Sparkles,
  Layers,
  BookOpen,
  FileText,
  Filter,
  ArrowRight,
  Compass,
  Cpu,
  Hash,
  CheckCircle2,
  ExternalLink,
  ChevronRight,
  SlidersHorizontal,
  X,
  Clock,
  RotateCw,
} from 'lucide-react';
import {
  ExplorationSearchMode,
  ExplorationSearchFilter,
  ExplorationSearchResultItem,
  PipelineCollection,
  PipelineSource,
} from '../../types/pipeline.types';
import { cn } from '../../lib/utils';

interface ContentExplorationSearchProps {
  query: string;
  onQueryChange: (q: string) => void;
  mode: ExplorationSearchMode;
  onModeChange: (m: ExplorationSearchMode) => void;
  filters: ExplorationSearchFilter;
  onFilterChange: (f: Partial<ExplorationSearchFilter>) => void;
  results: ExplorationSearchResultItem[];
  isSearching: boolean;
  searchError: string | null;
  collections: PipelineCollection[];
  sources: PipelineSource[];
  onSearch: (q?: string) => void;
  onClear: () => void;
  onNavigateToSource: (source: PipelineSource, targetChunkId?: string, targetPage?: number) => void;
}

export const ContentExplorationSearch: React.FC<ContentExplorationSearchProps> = ({
  query,
  onQueryChange,
  mode,
  onModeChange,
  filters,
  onFilterChange,
  results,
  isSearching,
  searchError,
  collections,
  sources,
  onSearch,
  onClear,
  onNavigateToSource,
}) => {
  const [showFilters, setShowFilters] = useState(false);
  const [selectedResult, setSelectedResult] = useState<ExplorationSearchResultItem | null>(null);

  // Extract unique subjects, grades, exams from available sources
  const availableSubjects = Array.from(
    new Set(sources.map((s) => s.metadata?.subject).filter(Boolean))
  ) as string[];
  const availableGrades = Array.from(
    new Set(sources.map((s) => s.metadata?.classGrade).filter(Boolean))
  ) as string[];
  const availableExams = Array.from(
    new Set(sources.map((s) => s.metadata?.exam).filter(Boolean))
  ) as string[];

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      onSearch(query);
    }
  };

  const handleResultClick = (result: ExplorationSearchResultItem) => {
    const matchedSource = sources.find((s) => s.id === result.documentId);
    if (matchedSource) {
      onNavigateToSource(matchedSource, result.chunkId, result.pageNumber);
    } else {
      // Create lightweight source instance if not found in current local list
      const syntheticSource: PipelineSource = {
        id: result.documentId,
        notebookId: result.collectionId,
        userId: 'current',
        title: result.documentTitle,
        type: 'pdf',
        sizeBytes: 1024 * 500,
        status: 'READY',
        createdAt: Date.now(),
        chunksExtracted: 10,
        conceptsExtracted: 5,
        authorityScore: 1.0,
        processingDurationMs: 1000,
        metadata: result.metadata,
      };
      onNavigateToSource(syntheticSource, result.chunkId, result.pageNumber);
    }
  };

  const getRelevanceBadgeClass = (score: number) => {
    if (score >= 80) {
      return 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300 border-emerald-200 dark:border-emerald-500/30';
    }
    if (score >= 50) {
      return 'bg-indigo-50 text-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-300 border-indigo-200 dark:border-indigo-500/30';
    }
    return 'bg-amber-50 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300 border-amber-200 dark:border-amber-500/30';
  };

  return (
    <div className="space-y-5">
      {/* Search Header Banner */}
      <div className="bg-gradient-to-br from-indigo-900/10 via-slate-900/5 to-purple-900/10 dark:from-indigo-950/40 dark:via-black/30 dark:to-purple-950/30 border border-indigo-200/50 dark:border-indigo-500/20 rounded-3xl p-6 shadow-xs">
        <div className="max-w-3xl">
          <div className="flex items-center gap-2 mb-2">
            <span className="px-2.5 py-0.5 rounded-full bg-indigo-600 text-white text-[11px] font-bold uppercase tracking-wider flex items-center gap-1.5 shadow-xs">
              <Compass className="w-3.5 h-3.5" /> Exploration Engine
            </span>
            <span className="text-[12px] text-slate-500 dark:text-gray-400">
              Cross-Collection Semantic & Keyword Intelligence
            </span>
          </div>
          <h2 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white tracking-tight">
            Explore & Verify Curriculum Knowledge
          </h2>
          <p className="text-[13.5px] text-slate-600 dark:text-gray-300 mt-1 leading-relaxed">
            Search across concepts, formulas, exam questions, and full-text passages with verifiable source lineage down to the exact page and chunk.
          </p>
        </div>

        {/* Search Bar & Mode Selector */}
        <div className="mt-5 space-y-3">
          <div className="flex flex-col sm:flex-row items-center gap-2">
            <div className="relative flex-1 w-full">
              <Search className="w-4 h-4 absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 dark:text-gray-500" />
              <input
                type="text"
                placeholder="Ask or search e.g. 'Photoelectric effect Einstein equation', 'Fundamental theorem of calculus', 'Newton laws'..."
                value={query}
                onChange={(e) => onQueryChange(e.target.value)}
                onKeyDown={handleKeyDown}
                className="w-full pl-11 pr-10 py-3.5 bg-white dark:bg-[#1a1a1b] border border-slate-200 dark:border-white/10 rounded-2xl text-[14px] text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 shadow-sm"
              />
              {query && (
                <button
                  type="button"
                  onClick={onClear}
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-600 dark:hover:text-gray-200 rounded-full"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>

            <button
              type="button"
              onClick={() => onSearch(query)}
              disabled={isSearching || !query.trim()}
              className="w-full sm:w-auto px-6 py-3.5 rounded-2xl bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white font-bold text-[13.5px] flex items-center justify-center gap-2 shadow-sm transition-all"
            >
              {isSearching ? (
                <>
                  <RotateCw className="w-4 h-4 animate-spin" /> Searching...
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4" /> Search Knowledge
                </>
              )}
            </button>

            <button
              type="button"
              onClick={() => setShowFilters(!showFilters)}
              className={cn(
                'px-4 py-3.5 rounded-2xl border text-[13px] font-semibold flex items-center gap-2 transition-all',
                showFilters
                  ? 'bg-indigo-50 dark:bg-indigo-500/20 text-indigo-600 dark:text-indigo-300 border-indigo-300 dark:border-indigo-500/30'
                  : 'bg-white dark:bg-[#1a1a1b] text-slate-700 dark:text-gray-300 border-slate-200 dark:border-white/10 hover:bg-slate-50'
              )}
            >
              <SlidersHorizontal className="w-4 h-4" />
              Filters
            </button>
          </div>

          {/* Search Mode Pills */}
          <div className="flex flex-wrap items-center gap-2 pt-1">
            <span className="text-[11.5px] font-bold uppercase tracking-wider text-slate-400 dark:text-gray-500 mr-1">
              Search Mode:
            </span>
            {[
              {
                id: 'hybrid' as ExplorationSearchMode,
                label: 'Hybrid (Semantic + Keyword)',
                icon: Sparkles,
                desc: 'Balanced vector embeddings & exact text matching',
              },
              {
                id: 'semantic' as ExplorationSearchMode,
                label: 'Semantic Search',
                icon: Cpu,
                desc: 'Conceptual meaning via 768-dim embeddings',
              },
              {
                id: 'keyword' as ExplorationSearchMode,
                label: 'Exact Keyword',
                icon: Hash,
                desc: 'Strict term frequency & section headers',
              },
            ].map((m) => {
              const Icon = m.icon;
              const isSelected = mode === m.id;
              return (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => {
                    onModeChange(m.id);
                    if (query.trim()) onSearch(query);
                  }}
                  className={cn(
                    'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[12px] font-semibold transition-all',
                    isSelected
                      ? 'bg-indigo-600 text-white shadow-xs'
                      : 'bg-white/80 dark:bg-white/5 border border-slate-200/80 dark:border-white/10 text-slate-600 dark:text-gray-300 hover:bg-white dark:hover:bg-white/10'
                  )}
                  title={m.desc}
                >
                  <Icon className="w-3.5 h-3.5" />
                  {m.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Collapsible Metadata Filter Bar */}
        {showFilters && (
          <div className="mt-4 pt-4 border-t border-slate-200/60 dark:border-white/10 grid grid-cols-2 sm:grid-cols-4 gap-3">
            {/* Collection Filter */}
            <div>
              <label className="text-[11px] font-bold text-slate-500 dark:text-gray-400 block mb-1">
                Collection Scope
              </label>
              <select
                value={filters.collectionId || 'ALL'}
                onChange={(e) => onFilterChange({ collectionId: e.target.value })}
                className="w-full px-2.5 py-1.5 bg-white dark:bg-[#1a1a1b] border border-slate-200 dark:border-white/10 rounded-lg text-[12px] text-slate-800 dark:text-white"
              >
                <option value="ALL">All Collections ({collections.length})</option>
                {collections.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.title}
                  </option>
                ))}
              </select>
            </div>

            {/* Subject Filter */}
            <div>
              <label className="text-[11px] font-bold text-slate-500 dark:text-gray-400 block mb-1">
                Subject
              </label>
              <select
                value={filters.subject || 'ALL'}
                onChange={(e) => onFilterChange({ subject: e.target.value })}
                className="w-full px-2.5 py-1.5 bg-white dark:bg-[#1a1a1b] border border-slate-200 dark:border-white/10 rounded-lg text-[12px] text-slate-800 dark:text-white"
              >
                <option value="ALL">All Subjects</option>
                {availableSubjects.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>

            {/* Grade Level Filter */}
            <div>
              <label className="text-[11px] font-bold text-slate-500 dark:text-gray-400 block mb-1">
                Class / Grade
              </label>
              <select
                value={filters.classGrade || 'ALL'}
                onChange={(e) => onFilterChange({ classGrade: e.target.value })}
                className="w-full px-2.5 py-1.5 bg-white dark:bg-[#1a1a1b] border border-slate-200 dark:border-white/10 rounded-lg text-[12px] text-slate-800 dark:text-white"
              >
                <option value="ALL">All Grades</option>
                {availableGrades.map((g) => (
                  <option key={g} value={g}>
                    {g}
                  </option>
                ))}
              </select>
            </div>

            {/* Target Exam Filter */}
            <div>
              <label className="text-[11px] font-bold text-slate-500 dark:text-gray-400 block mb-1">
                Exam
              </label>
              <select
                value={filters.exam || 'ALL'}
                onChange={(e) => onFilterChange({ exam: e.target.value })}
                className="w-full px-2.5 py-1.5 bg-white dark:bg-[#1a1a1b] border border-slate-200 dark:border-white/10 rounded-lg text-[12px] text-slate-800 dark:text-white"
              >
                <option value="ALL">All Exams</option>
                {availableExams.map((ex) => (
                  <option key={ex} value={ex}>
                    {ex}
                  </option>
                ))}
              </select>
            </div>
          </div>
        )}
      </div>

      {/* Error Alert */}
      {searchError && (
        <div className="p-4 rounded-2xl bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-800/40 text-rose-700 dark:text-rose-300 text-[13px]">
          {searchError}
        </div>
      )}

      {/* Results Header */}
      {results.length > 0 && (
        <div className="flex items-center justify-between px-1">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-bold text-slate-900 dark:text-white">
              Search Results ({results.length})
            </h3>
            <span className="text-[12px] text-slate-500 dark:text-gray-400">
              Sorted by hybrid relevance
            </span>
          </div>

          <span className="text-[11.5px] font-mono text-slate-400 dark:text-gray-500">
            Mode: {mode.toUpperCase()}
          </span>
        </div>
      )}

      {/* Search Results List */}
      <div className="space-y-3.5">
        {results.map((result, idx) => {
          const isInspected = selectedResult?.chunkId === result.chunkId;
          return (
            <div
              key={result.chunkId || idx}
              className={cn(
                'bg-white dark:bg-[#1a1a1b] border rounded-2xl p-5 shadow-xs transition-all hover:border-indigo-500/50 group',
                isInspected
                  ? 'border-indigo-500 ring-2 ring-indigo-500/20'
                  : 'border-slate-200/80 dark:border-white/10'
              )}
            >
              {/* Card Header: Title & Relevance Badge */}
              <div className="flex items-start justify-between gap-4 mb-2">
                <div className="space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="px-2 py-0.5 rounded-md bg-slate-100 dark:bg-white/10 font-mono text-[11px] font-bold text-slate-700 dark:text-gray-300">
                      CHUNK #{result.lineage.chunkSequence || idx + 1}
                    </span>
                    <span className="px-2 py-0.5 rounded-md bg-indigo-50 dark:bg-indigo-500/15 text-indigo-600 dark:text-indigo-300 text-[11px] font-semibold flex items-center gap-1">
                      <BookOpen className="w-3 h-3" />
                      {result.documentTitle}
                    </span>
                    {result.chapter && (
                      <span className="text-[11.5px] text-slate-500 dark:text-gray-400">
                        • {result.chapter}
                      </span>
                    )}
                  </div>

                  <h4 className="text-base font-bold text-slate-900 dark:text-white group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors">
                    {result.title}
                  </h4>
                </div>

                <div className="flex flex-col items-end gap-1 shrink-0">
                  <span
                    className={cn(
                      'px-2.5 py-1 rounded-xl text-[12px] font-bold border shadow-2xs',
                      getRelevanceBadgeClass(result.relevanceScore)
                    )}
                  >
                    {result.relevanceScore}% Relevance
                  </span>
                  <span className="text-[11px] font-mono text-slate-400 dark:text-gray-500">
                    Page {result.pageNumber}
                  </span>
                </div>
              </div>

              {/* Matching Snippet Excerpt */}
              <p className="text-[13.5px] text-slate-600 dark:text-gray-300 leading-relaxed bg-slate-50/70 dark:bg-black/20 p-3.5 rounded-xl border border-slate-100 dark:border-white/5 font-sans mb-3">
                {result.snippet}
              </p>

              {/* Lineage & Navigation Bar */}
              <div className="pt-2 border-t border-slate-100 dark:border-white/5 flex flex-wrap items-center justify-between gap-3 text-[12px]">
                {/* 4-Stage Lineage Path */}
                <div className="flex flex-wrap items-center gap-1.5 text-slate-500 dark:text-gray-400">
                  <span className="font-semibold text-slate-700 dark:text-gray-300">Lineage:</span>
                  <span className="px-1.5 py-0.5 rounded bg-slate-100 dark:bg-white/5 font-mono text-[11px]">
                    Search Match
                  </span>
                  <ChevronRight className="w-3 h-3 text-slate-400" />
                  <span className="px-1.5 py-0.5 rounded bg-indigo-50 dark:bg-indigo-500/10 text-indigo-600 dark:text-indigo-300 font-mono text-[11px]">
                    Chunk {result.chunkId.slice(0, 10)}
                  </span>
                  <ChevronRight className="w-3 h-3 text-slate-400" />
                  <span className="px-1.5 py-0.5 rounded bg-teal-50 dark:bg-teal-500/10 text-teal-600 dark:text-teal-300 font-medium text-[11px]">
                    Page {result.pageNumber}
                  </span>
                  <ChevronRight className="w-3 h-3 text-slate-400" />
                  <span className="text-slate-600 dark:text-gray-300 font-medium truncate max-w-[140px]">
                    {result.documentTitle}
                  </span>
                </div>

                {/* Direct Action Button: Navigate to Source Location */}
                <button
                  type="button"
                  onClick={() => handleResultClick(result)}
                  className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-indigo-50 dark:bg-indigo-500/20 hover:bg-indigo-600 text-indigo-600 dark:text-indigo-300 hover:text-white text-[12.5px] font-bold transition-all shadow-2xs"
                >
                  Jump to Source Location
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          );
        })}

        {/* Empty State */}
        {!isSearching && results.length === 0 && query.trim() !== '' && (
          <div className="py-16 text-center bg-white dark:bg-[#1a1a1b] border border-slate-200/80 dark:border-white/10 rounded-2xl p-8">
            <div className="w-12 h-12 rounded-2xl bg-slate-100 dark:bg-white/5 flex items-center justify-center mx-auto mb-3 text-slate-400">
              <Search className="w-6 h-6" />
            </div>
            <h4 className="text-base font-bold text-slate-800 dark:text-white">
              No matching curriculum content found
            </h4>
            <p className="text-[13px] text-slate-500 dark:text-gray-400 max-w-md mx-auto mt-1">
              Try adjusting your query keywords, toggling between Hybrid and Semantic search modes, or clearing your metadata filters.
            </p>
          </div>
        )}
      </div>
    </div>
  );
};
