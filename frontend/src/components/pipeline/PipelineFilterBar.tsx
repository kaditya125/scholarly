/**
 * PipelineFilterBar Component
 * Phase 1B: Content Pipeline Frontend Foundation
 */

import React from 'react';
import { Search, X, Filter, RotateCcw, LayoutGrid, List } from 'lucide-react';
import { cn } from '../../lib/utils';
import {
  PipelineFilterState,
  PipelineCollection,
  ContentTypeFilter,
} from '../../types/pipeline.types';

interface PipelineFilterBarProps {
  filters: PipelineFilterState;
  onFilterChange: (updates: Partial<PipelineFilterState>) => void;
  onReset: () => void;
  collections: PipelineCollection[];
  filterOptions: {
    subjects: string[];
    classGrades: string[];
    exams: string[];
    languages: string[];
  };
  totalCount: number;
  filteredCount: number;
  viewMode: 'table' | 'grid';
  onViewModeChange: (mode: 'table' | 'grid') => void;
}

const CONTENT_TYPES: { id: ContentTypeFilter; label: string }[] = [
  { id: 'ALL', label: 'All Types' },
  { id: 'PDF', label: 'PDF Document' },
  { id: 'EPUB', label: 'EPUB Book' },
  { id: 'DOCX', label: 'Word (DOCX)' },
  { id: 'TXT', label: 'Plain Text' },
  { id: 'MD', label: 'Markdown' },
  { id: 'IMAGE', label: 'Images (PNG/JPG)' },
  { id: 'AUDIO', label: 'Audio (MP3)' },
  { id: 'VIDEO', label: 'Video (MP4)' },
];

const STATUSES = [
  { id: 'ALL', label: 'All Statuses' },
  { id: 'READY', label: 'Ready' },
  { id: 'PROCESSING', label: 'Processing' },
  { id: 'FAILED', label: 'Failed' },
  { id: 'ARCHIVED', label: 'Archived' },
];

const DEFAULT_SUBJECTS = ['Mathematics', 'Physics', 'Chemistry', 'Biology', 'History', 'Geography', 'Economics', 'Polity', 'Computer Science'];
const DEFAULT_CLASSES = ['Class 6', 'Class 7', 'Class 8', 'Class 9', 'Class 10', 'Class 11', 'Class 12', 'Undergraduate'];
const DEFAULT_EXAMS = ['CBSE', 'ICSE', 'NCERT', 'JEE Main', 'JEE Advanced', 'NEET', 'UPSC', 'BPSC', 'State Board'];
const DEFAULT_LANGUAGES = ['English', 'Hindi', 'Bilingual (Hinglish)', 'Sanskrit'];

export const PipelineFilterBar: React.FC<PipelineFilterBarProps> = ({
  filters,
  onFilterChange,
  onReset,
  collections,
  filterOptions,
  totalCount,
  filteredCount,
  viewMode,
  onViewModeChange,
}) => {
  const isFiltered =
    filters.search.trim() !== '' ||
    filters.status !== 'ALL' ||
    filters.contentType !== 'ALL' ||
    filters.subject !== 'ALL' ||
    filters.classGrade !== 'ALL' ||
    filters.exam !== 'ALL' ||
    filters.language !== 'ALL' ||
    filters.collectionId !== 'ALL';

  const subjects = Array.from(new Set([...filterOptions.subjects, ...DEFAULT_SUBJECTS])).sort();
  const classGrades = Array.from(new Set([...filterOptions.classGrades, ...DEFAULT_CLASSES])).sort();
  const exams = Array.from(new Set([...filterOptions.exams, ...DEFAULT_EXAMS])).sort();
  const languages = Array.from(new Set([...filterOptions.languages, ...DEFAULT_LANGUAGES])).sort();

  return (
    <div className="bg-white dark:bg-[#1a1a1b] border border-slate-200/80 dark:border-white/10 rounded-2xl p-4 mb-6 shadow-xs">
      {/* Top row: Search, Collections, View Switcher */}
      <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3 mb-3">
        {/* Search Input */}
        <div className="relative flex-1">
          <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Search content by title, filename, collection, subject..."
            value={filters.search}
            onChange={(e) => onFilterChange({ search: e.target.value })}
            className="w-full pl-10 pr-9 py-2 bg-slate-50 dark:bg-black/20 border border-slate-200 dark:border-white/10 rounded-xl text-[13.5px] text-slate-800 dark:text-gray-200 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-500 transition-all"
          />
          {filters.search && (
            <button
              onClick={() => onFilterChange({ search: '' })}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-gray-200"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Collection Dropdown */}
        <div className="w-full md:w-56 shrink-0">
          <select
            value={filters.collectionId}
            onChange={(e) => onFilterChange({ collectionId: e.target.value })}
            aria-label="Filter by collection"
            className="w-full py-2 px-3 bg-slate-50 dark:bg-black/20 border border-slate-200 dark:border-white/10 rounded-xl text-[13px] text-slate-700 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-500 transition-all"
          >
            <option value="ALL">All Collections ({collections.length})</option>
            {collections.map((col) => (
              <option key={col.id} value={col.id}>
                {col.title} ({col.sourceCount || 0})
              </option>
            ))}
          </select>
        </div>

        {/* View Mode Toggle */}
        <div className="flex items-center gap-1 bg-slate-100 dark:bg-black/30 p-1 rounded-xl shrink-0 self-end md:self-auto">
          <button
            type="button"
            onClick={() => onViewModeChange('table')}
            className={cn(
              'p-1.5 rounded-lg text-[12px] font-medium transition-all flex items-center gap-1.5',
              viewMode === 'table'
                ? 'bg-white dark:bg-[#252526] text-slate-900 dark:text-white shadow-xs'
                : 'text-slate-500 dark:text-gray-400 hover:text-slate-700 dark:hover:text-gray-200'
            )}
            title="Table List View"
          >
            <List className="w-4 h-4" />
            <span className="hidden sm:inline">Table</span>
          </button>
          <button
            type="button"
            onClick={() => onViewModeChange('grid')}
            className={cn(
              'p-1.5 rounded-lg text-[12px] font-medium transition-all flex items-center gap-1.5',
              viewMode === 'grid'
                ? 'bg-white dark:bg-[#252526] text-slate-900 dark:text-white shadow-xs'
                : 'text-slate-500 dark:text-gray-400 hover:text-slate-700 dark:hover:text-gray-200'
            )}
            title="Card Grid View"
          >
            <LayoutGrid className="w-4 h-4" />
            <span className="hidden sm:inline">Grid</span>
          </button>
        </div>
      </div>

      {/* Bottom row: Multi-attribute Filters (Status, Type, Subject, Class, Exam, Language) */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-2 pt-2 border-t border-slate-100 dark:border-white/5">
        {/* Status Filter */}
        <div>
          <label className="block text-[11px] font-medium text-slate-400 dark:text-gray-500 mb-1">
            Status
          </label>
          <select
            value={filters.status}
            onChange={(e) => onFilterChange({ status: e.target.value })}
            className="w-full py-1.5 px-2.5 bg-slate-50 dark:bg-black/20 border border-slate-200/80 dark:border-white/10 rounded-lg text-[12.5px] text-slate-700 dark:text-gray-200 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          >
            {STATUSES.map((st) => (
              <option key={st.id} value={st.id}>
                {st.label}
              </option>
            ))}
          </select>
        </div>

        {/* Content Type Filter */}
        <div>
          <label className="block text-[11px] font-medium text-slate-400 dark:text-gray-500 mb-1">
            Content Type
          </label>
          <select
            value={filters.contentType}
            onChange={(e) => onFilterChange({ contentType: e.target.value as ContentTypeFilter })}
            className="w-full py-1.5 px-2.5 bg-slate-50 dark:bg-black/20 border border-slate-200/80 dark:border-white/10 rounded-lg text-[12.5px] text-slate-700 dark:text-gray-200 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          >
            {CONTENT_TYPES.map((ct) => (
              <option key={ct.id} value={ct.id}>
                {ct.label}
              </option>
            ))}
          </select>
        </div>

        {/* Subject Filter */}
        <div>
          <label className="block text-[11px] font-medium text-slate-400 dark:text-gray-500 mb-1">
            Subject
          </label>
          <select
            value={filters.subject}
            onChange={(e) => onFilterChange({ subject: e.target.value })}
            className="w-full py-1.5 px-2.5 bg-slate-50 dark:bg-black/20 border border-slate-200/80 dark:border-white/10 rounded-lg text-[12.5px] text-slate-700 dark:text-gray-200 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          >
            <option value="ALL">All Subjects</option>
            {subjects.map((sub) => (
              <option key={sub} value={sub}>
                {sub}
              </option>
            ))}
          </select>
        </div>

        {/* Class Filter */}
        <div>
          <label className="block text-[11px] font-medium text-slate-400 dark:text-gray-500 mb-1">
            Class / Grade
          </label>
          <select
            value={filters.classGrade}
            onChange={(e) => onFilterChange({ classGrade: e.target.value })}
            className="w-full py-1.5 px-2.5 bg-slate-50 dark:bg-black/20 border border-slate-200/80 dark:border-white/10 rounded-lg text-[12.5px] text-slate-700 dark:text-gray-200 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          >
            <option value="ALL">All Classes</option>
            {classGrades.map((cg) => (
              <option key={cg} value={cg}>
                {cg}
              </option>
            ))}
          </select>
        </div>

        {/* Exam Filter */}
        <div>
          <label className="block text-[11px] font-medium text-slate-400 dark:text-gray-500 mb-1">
            Exam Target
          </label>
          <select
            value={filters.exam}
            onChange={(e) => onFilterChange({ exam: e.target.value })}
            className="w-full py-1.5 px-2.5 bg-slate-50 dark:bg-black/20 border border-slate-200/80 dark:border-white/10 rounded-lg text-[12.5px] text-slate-700 dark:text-gray-200 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          >
            <option value="ALL">All Exams</option>
            {exams.map((ex) => (
              <option key={ex} value={ex}>
                {ex}
              </option>
            ))}
          </select>
        </div>

        {/* Language Filter */}
        <div>
          <label className="block text-[11px] font-medium text-slate-400 dark:text-gray-500 mb-1">
            Language
          </label>
          <select
            value={filters.language}
            onChange={(e) => onFilterChange({ language: e.target.value })}
            className="w-full py-1.5 px-2.5 bg-slate-50 dark:bg-black/20 border border-slate-200/80 dark:border-white/10 rounded-lg text-[12.5px] text-slate-700 dark:text-gray-200 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          >
            <option value="ALL">All Languages</option>
            {languages.map((lng) => (
              <option key={lng} value={lng}>
                {lng}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Filter Status Summary & Reset */}
      <div className="flex items-center justify-between mt-3 pt-2 text-[12px] text-slate-500 dark:text-gray-400">
        <div className="flex items-center gap-2">
          <span>
            Showing <strong className="text-slate-800 dark:text-white">{filteredCount}</strong> of{' '}
            {totalCount} source items
          </span>
          {isFiltered && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-indigo-50 dark:bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 text-[11px] font-medium">
              <Filter className="w-3 h-3" /> Filters Active
            </span>
          )}
        </div>

        {isFiltered && (
          <button
            type="button"
            onClick={onReset}
            className="inline-flex items-center gap-1.5 text-[11.5px] font-medium text-slate-600 dark:text-gray-300 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors"
          >
            <RotateCcw className="w-3 h-3" /> Reset Filters
          </button>
        )}
      </div>
    </div>
  );
};
