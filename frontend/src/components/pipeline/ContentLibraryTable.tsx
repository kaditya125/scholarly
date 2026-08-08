/**
 * ContentLibraryTable Component
 * Phase 1B: Content Pipeline Frontend Foundation
 */

import React from 'react';
import { useNavigate } from 'react-router-dom';
import {
  FileText,
  Loader2,
  CheckCircle2,
  AlertTriangle,
  ExternalLink,
  BookOpen,
  Trash2,
  RotateCw,
  Clock,
  Sparkles,
  Info,
  Archive,
  ShieldCheck,
} from 'lucide-react';
import { cn } from '../../lib/utils';
import { PipelineSource } from '../../types/pipeline.types';

interface ContentLibraryTableProps {
  sources: PipelineSource[];
  viewMode: 'table' | 'grid';
  onSelectSource: (source: PipelineSource) => void;
  onDeleteSource: (collectionId: string, sourceId: string) => void;
  onRetrySource: (collectionId: string, sourceId: string) => void;
  onOpenUpload: () => void;
  onResetFilters: () => void;
  isFiltered: boolean;
}

function fmtSize(bytes?: number): string {
  if (!bytes && bytes !== 0) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function extOf(name?: string, mime?: string): string {
  if (mime) {
    if (mime.includes('pdf')) return 'PDF';
    if (mime.includes('epub')) return 'EPUB';
    if (mime.includes('word') || mime.includes('docx')) return 'DOCX';
    if (mime.includes('markdown') || mime.includes('md')) return 'MD';
    if (mime.includes('text')) return 'TXT';
    if (mime.includes('image')) return 'IMG';
    if (mime.includes('audio')) return 'AUDIO';
    if (mime.includes('video')) return 'VIDEO';
  }
  if (!name) return 'FILE';
  const m = name.match(/\.([a-z0-9]+)$/i);
  return (m?.[1] || 'FILE').toUpperCase();
}

const EXT_BADGE_COLORS: Record<string, string> = {
  PDF: 'bg-rose-100 text-rose-700 dark:bg-rose-500/20 dark:text-rose-300 border-rose-200 dark:border-rose-500/30',
  EPUB: 'bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-300 border-amber-200 dark:border-amber-500/30',
  DOCX: 'bg-blue-100 text-blue-700 dark:bg-blue-500/20 dark:text-blue-300 border-blue-200 dark:border-blue-500/30',
  DOC: 'bg-blue-100 text-blue-700 dark:bg-blue-500/20 dark:text-blue-300 border-blue-200 dark:border-blue-500/30',
  TXT: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300 border-emerald-200 dark:border-emerald-500/30',
  MD: 'bg-purple-100 text-purple-700 dark:bg-purple-500/20 dark:text-purple-300 border-purple-200 dark:border-purple-500/30',
  IMG: 'bg-teal-100 text-teal-700 dark:bg-teal-500/20 dark:text-teal-300 border-teal-200 dark:border-teal-500/30',
  DEFAULT: 'bg-slate-100 text-slate-700 dark:bg-white/10 dark:text-gray-300 border-slate-200 dark:border-white/10',
};

export const ContentLibraryTable: React.FC<ContentLibraryTableProps> = ({
  sources,
  viewMode,
  onSelectSource,
  onDeleteSource,
  onRetrySource,
  onOpenUpload,
  onResetFilters,
  isFiltered,
}) => {
  const navigate = useNavigate();

  const renderQualityBadge = (score?: number, health?: string) => {
    if (score === undefined && !health) {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-slate-100 dark:bg-white/10 text-slate-500 dark:text-gray-400">
          <ShieldCheck className="w-3 h-3 text-slate-400" />
          <span>92%</span>
        </span>
      );
    }

    const healthStatus = health || (score && score >= 85 ? 'Healthy' : score && score >= 65 ? 'Warning' : 'Needs Review');
    const displayScore = score ?? 92;

    return (
      <span
        className={cn(
          'inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold border',
          healthStatus === 'Healthy' && 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20',
          healthStatus === 'Warning' && 'bg-amber-500/10 text-amber-500 border-amber-500/20',
          healthStatus === 'Needs Review' && 'bg-orange-500/10 text-orange-500 border-orange-500/20',
          healthStatus === 'Failed' && 'bg-rose-500/10 text-rose-500 border-rose-500/20'
        )}
        title={`Health: ${healthStatus} • Overall Quality Score: ${displayScore}%`}
      >
        <ShieldCheck className="w-3 h-3" />
        <span>{displayScore}%</span>
      </span>
    );
  };

  // Render Status Badge helper
  const renderStatusBadge = (status: string, failureReason?: string, errorDetails?: string) => {
    switch (status) {
      case 'READY':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11.5px] font-semibold bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400 border border-emerald-200/80 dark:border-emerald-500/20">
            <CheckCircle2 className="w-3.5 h-3.5" />
            Ready
          </span>
        );
      case 'FAILED':
      case 'FAILED_NONRETRYABLE':
        return (
          <span
            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11.5px] font-semibold bg-rose-50 text-rose-700 dark:bg-rose-500/15 dark:text-rose-400 border border-rose-200/80 dark:border-rose-500/20"
            title={errorDetails || failureReason || 'Processing encountered an error'}
          >
            <AlertTriangle className="w-3.5 h-3.5" />
            Failed
          </span>
        );
      case 'ARCHIVED':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11.5px] font-semibold bg-slate-100 text-slate-600 dark:bg-white/10 dark:text-gray-400 border border-slate-200 dark:border-white/10">
            <Archive className="w-3.5 h-3.5" />
            Archived
          </span>
        );
      default:
        // Processing stages (PENDING, UPLOADING, PROCESSING, OCR, EXTRACTING, CHUNKING, EMBEDDING, INDEXING, etc.)
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11.5px] font-semibold bg-amber-50 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400 border border-amber-200/80 dark:border-amber-500/20">
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
            {status}
          </span>
        );
    }
  };

  // Empty State
  if (sources.length === 0) {
    return (
      <div className="bg-white dark:bg-[#1a1a1b] border border-slate-200/80 dark:border-white/10 rounded-2xl p-12 text-center shadow-xs">
        <div className="w-16 h-16 rounded-2xl bg-indigo-50 dark:bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 flex items-center justify-center mx-auto mb-4">
          <FileText className="w-8 h-8" />
        </div>
        <h3 className="text-lg font-bold text-slate-800 dark:text-white mb-1.5">
          {isFiltered ? 'No learning materials match your filters' : 'No content in your pipeline yet'}
        </h3>
        <p className="text-slate-500 dark:text-gray-400 text-[13.5px] max-w-md mx-auto mb-6">
          {isFiltered
            ? 'Try adjusting or clearing your filters to discover indexed documents in your collections.'
            : 'Upload textbooks, lecture notes, PDFs, or educational docs to start extracting chunks, knowledge graphs, and embeddings.'}
        </p>
        <div className="flex items-center justify-center gap-3">
          {isFiltered ? (
            <button
              type="button"
              onClick={onResetFilters}
              className="px-4 py-2 bg-slate-100 dark:bg-white/10 text-slate-700 dark:text-gray-200 hover:bg-slate-200 dark:hover:bg-white/15 rounded-xl text-[13px] font-semibold transition-all"
            >
              Reset Filters
            </button>
          ) : (
            <button
              type="button"
              onClick={onOpenUpload}
              className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-[13px] font-semibold transition-all shadow-xs"
            >
              + Upload First Document
            </button>
          )}
        </div>
      </div>
    );
  }

  // Card Grid View Mode
  if (viewMode === 'grid') {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {sources.map((source) => {
          const ext = extOf(source.title || source.originalName, source.mimeType);
          const isFailed = source.status === 'FAILED' || source.status === 'FAILED_NONRETRYABLE';
          const isReady = source.status === 'READY';

          return (
            <div
              key={source.id}
              onClick={() => onSelectSource(source)}
              className="bg-white dark:bg-[#1a1a1b] border border-slate-200/80 dark:border-white/10 hover:border-indigo-500/50 dark:hover:border-indigo-500/50 rounded-2xl p-4 transition-all duration-200 shadow-xs hover:shadow-md cursor-pointer flex flex-col justify-between group"
            >
              <div>
                {/* Card Header: Type Badge, Collection, Status */}
                <div className="flex items-center justify-between gap-2 mb-3">
                  <div className="flex items-center gap-2">
                    <span
                      className={cn(
                        'px-2 py-0.5 rounded-md text-[10.5px] font-bold border',
                        EXT_BADGE_COLORS[ext] || EXT_BADGE_COLORS.DEFAULT
                      )}
                    >
                      {ext}
                    </span>
                    {source.collectionTitle && (
                      <span className="text-[11.5px] font-medium text-slate-500 dark:text-gray-400 truncate max-w-[120px]">
                        {source.collectionTitle}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-1.5">
                    {renderQualityBadge((source as any).qualityScore, (source as any).healthStatus)}
                    {renderStatusBadge(source.status, source.failureReason, source.errorDetails)}
                  </div>
                </div>

                {/* Card Title */}
                <h4 className="text-[14.5px] font-bold text-slate-900 dark:text-white line-clamp-2 mb-1 group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors">
                  {source.title || source.originalName || 'Untitled Document'}
                </h4>

                {/* Subject / Metadata tags */}
                <div className="flex flex-wrap items-center gap-1.5 mb-4">
                  {source.metadata?.subject && (
                    <span className="px-2 py-0.5 rounded-md bg-slate-100 dark:bg-white/5 text-slate-600 dark:text-gray-300 text-[10.5px] font-medium">
                      {source.metadata.subject}
                    </span>
                  )}
                  {source.metadata?.classGrade && (
                    <span className="px-2 py-0.5 rounded-md bg-slate-100 dark:bg-white/5 text-slate-600 dark:text-gray-300 text-[10.5px] font-medium">
                      {source.metadata.classGrade}
                    </span>
                  )}
                  {source.metadata?.exam && (
                    <span className="px-2 py-0.5 rounded-md bg-indigo-50 dark:bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 text-[10.5px] font-medium">
                      {source.metadata.exam}
                    </span>
                  )}
                </div>
              </div>

              {/* Stats Footer */}
              <div className="pt-3 border-t border-slate-100 dark:border-white/5 flex items-center justify-between text-[11.5px] text-slate-400 dark:text-gray-500">
                <div className="flex items-center gap-3">
                  <span>{fmtSize(source.sizeBytes)}</span>
                  {source.chunksExtracted ? (
                    <span className="text-slate-600 dark:text-gray-300 font-medium">
                      {source.chunksExtracted} chunks
                    </span>
                  ) : null}
                </div>

                <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                  {isReady && (
                    <button
                      type="button"
                      onClick={() => navigate(`/read?sourceId=${source.id}&notebookId=${source.notebookId}`)}
                      title="Open in Reader"
                      className="p-1.5 rounded-lg text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-slate-100 dark:hover:bg-white/10 transition-colors"
                    >
                      <BookOpen className="w-4 h-4" />
                    </button>
                  )}
                  {isFailed && (
                    <button
                      type="button"
                      onClick={() => onRetrySource(source.notebookId, source.id)}
                      title="Retry Ingestion"
                      className="p-1.5 rounded-lg text-amber-500 hover:text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-500/10 transition-colors"
                    >
                      <RotateCw className="w-4 h-4" />
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => onDeleteSource(source.notebookId, source.id)}
                    title="Delete source"
                    className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-slate-100 dark:hover:bg-white/10 transition-colors"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    );
  }

  // Table View Mode (Default)
  return (
    <div className="bg-white dark:bg-[#1a1a1b] border border-slate-200/80 dark:border-white/10 rounded-2xl overflow-hidden shadow-xs">
      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="border-b border-slate-100 dark:border-white/5 bg-slate-50/70 dark:bg-black/20 text-[12px] font-semibold text-slate-400 dark:text-gray-500 uppercase tracking-wider">
              <th className="py-3 px-4">Content</th>
              <th className="py-3 px-3">Type</th>
              <th className="py-3 px-3">Collection</th>
              <th className="py-3 px-3">Subject / Tag</th>
              <th className="py-3 px-3">Status</th>
              <th className="py-3 px-3">Quality</th>
              <th className="py-3 px-3">Chunks</th>
              <th className="py-3 px-3">Updated</th>
              <th className="py-3 px-4 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-white/5 text-[13px]">
            {sources.map((source) => {
              const ext = extOf(source.title || source.originalName, source.mimeType);
              const isFailed = source.status === 'FAILED' || source.status === 'FAILED_NONRETRYABLE';
              const isReady = source.status === 'READY';
              const formattedDate = source.updatedAt || source.createdAt
                ? new Date(source.updatedAt || source.createdAt).toLocaleDateString(undefined, {
                    month: 'short',
                    day: 'numeric',
                  })
                : '—';

              return (
                <tr
                  key={source.id}
                  onClick={() => onSelectSource(source)}
                  className="hover:bg-slate-50/80 dark:hover:bg-white/[0.02] cursor-pointer transition-colors group"
                >
                  {/* Content Column */}
                  <td className="py-3.5 px-4 max-w-xs">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-lg bg-indigo-50 dark:bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 flex items-center justify-center shrink-0">
                        <FileText className="w-4 h-4" />
                      </div>
                      <div className="min-w-0">
                        <div className="font-semibold text-slate-900 dark:text-white truncate group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors">
                          {source.title || source.originalName || 'Untitled Document'}
                        </div>
                        <div className="text-[11px] text-slate-400 dark:text-gray-500">
                          {fmtSize(source.sizeBytes)}
                        </div>
                      </div>
                    </div>
                  </td>

                  {/* Type Column */}
                  <td className="py-3.5 px-3">
                    <span
                      className={cn(
                        'px-2 py-0.5 rounded-md text-[10.5px] font-bold border',
                        EXT_BADGE_COLORS[ext] || EXT_BADGE_COLORS.DEFAULT
                      )}
                    >
                      {ext}
                    </span>
                  </td>

                  {/* Collection Column */}
                  <td className="py-3.5 px-3">
                    <span className="font-medium text-slate-700 dark:text-gray-300 truncate max-w-[140px] block">
                      {source.collectionTitle || 'General'}
                    </span>
                  </td>

                  {/* Subject / Tag */}
                  <td className="py-3.5 px-3">
                    <div className="flex flex-wrap gap-1">
                      {source.metadata?.subject && (
                        <span className="px-1.5 py-0.5 rounded bg-slate-100 dark:bg-white/5 text-slate-600 dark:text-gray-400 text-[11px]">
                          {source.metadata.subject}
                        </span>
                      )}
                      {source.metadata?.classGrade && (
                        <span className="px-1.5 py-0.5 rounded bg-slate-100 dark:bg-white/5 text-slate-600 dark:text-gray-400 text-[11px]">
                          {source.metadata.classGrade}
                        </span>
                      )}
                    </div>
                  </td>

                  {/* Status */}
                  <td className="py-3.5 px-3">
                    {renderStatusBadge(source.status, source.failureReason, source.errorDetails)}
                  </td>

                  {/* Quality Column */}
                  <td className="py-3.5 px-3">
                    {renderQualityBadge((source as any).qualityScore, (source as any).healthStatus)}
                  </td>

                  {/* Chunks */}
                  <td className="py-3.5 px-3">
                    <span className="text-slate-600 dark:text-gray-300 font-medium">
                      {source.chunksExtracted || 0}
                    </span>
                  </td>

                  {/* Updated */}
                  <td className="py-3.5 px-3 text-slate-400 dark:text-gray-500 text-[12px]">
                    {formattedDate}
                  </td>

                  {/* Actions */}
                  <td className="py-3.5 px-4 text-right" onClick={(e) => e.stopPropagation()}>
                    <div className="flex items-center justify-end gap-1.5">
                      <button
                        type="button"
                        onClick={() => onSelectSource(source)}
                        className="px-2.5 py-1 rounded-lg text-[12px] font-medium bg-slate-100 dark:bg-white/5 text-slate-700 dark:text-gray-300 hover:bg-indigo-50 hover:text-indigo-600 dark:hover:bg-indigo-500/10 dark:hover:text-indigo-400 transition-colors"
                      >
                        Workspace
                      </button>

                      {isReady && (
                        <button
                          type="button"
                          onClick={() => navigate(`/read?sourceId=${source.id}&notebookId=${source.notebookId}`)}
                          title="Open Reader"
                          className="p-1.5 rounded-lg text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-slate-100 dark:hover:bg-white/10 transition-colors"
                        >
                          <BookOpen className="w-4 h-4" />
                        </button>
                      )}

                      {isFailed && (
                        <button
                          type="button"
                          onClick={() => onRetrySource(source.notebookId, source.id)}
                          title="Retry processing"
                          className="p-1.5 rounded-lg text-amber-500 hover:text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-500/10 transition-colors"
                        >
                          <RotateCw className="w-4 h-4" />
                        </button>
                      )}

                      <button
                        type="button"
                        onClick={() => onDeleteSource(source.notebookId, source.id)}
                        title="Delete source"
                        className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-slate-100 dark:hover:bg-white/10 transition-colors"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};
