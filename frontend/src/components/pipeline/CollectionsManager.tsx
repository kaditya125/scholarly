/**
 * CollectionsManager Component
 * Phase 1B: Content Pipeline Frontend Foundation
 */

import React, { useState } from 'react';
import {
  Folder,
  Plus,
  MoreVertical,
  Edit2,
  Trash2,
  UploadCloud,
  FileText,
  Layers,
  CheckCircle2,
  Loader2,
  AlertTriangle,
  ArrowRight,
  Sparkles,
} from 'lucide-react';
import { cn } from '../../lib/utils';
import { PipelineCollection } from '../../types/pipeline.types';

interface CollectionsManagerProps {
  collections: PipelineCollection[];
  onSelectCollection: (collectionId: string) => void;
  onOpenCreateCollection: () => void;
  onOpenRenameCollection: (col: PipelineCollection) => void;
  onDeleteCollection: (collectionId: string) => void;
  onOpenUploadForCollection: (collectionId: string) => void;
}

const COLOR_MAP: Record<string, string> = {
  'bg-indigo-500': 'from-indigo-500 to-indigo-600',
  'bg-emerald-500': 'from-emerald-500 to-emerald-600',
  'bg-rose-500': 'from-rose-500 to-rose-600',
  'bg-amber-500': 'from-amber-500 to-amber-600',
  'bg-blue-500': 'from-blue-500 to-blue-600',
  'bg-fuchsia-500': 'from-fuchsia-500 to-fuchsia-600',
  'bg-teal-500': 'from-teal-500 to-teal-600',
};

export const CollectionsManager: React.FC<CollectionsManagerProps> = ({
  collections,
  onSelectCollection,
  onOpenCreateCollection,
  onOpenRenameCollection,
  onDeleteCollection,
  onOpenUploadForCollection,
}) => {
  const [activeMenuId, setActiveMenuId] = useState<string | null>(null);

  return (
    <div>
      {/* Header Bar */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-base font-bold text-slate-900 dark:text-white">
            Knowledge Collections ({collections.length})
          </h3>
          <p className="text-[13px] text-slate-500 dark:text-gray-400">
            Group your textbooks, subjects, and study sets into structured ingestion buckets.
          </p>
        </div>
        <button
          type="button"
          onClick={onOpenCreateCollection}
          className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-[13px] font-semibold transition-all shadow-xs"
        >
          <Plus className="w-4 h-4" />
          Create Collection
        </button>
      </div>

      {/* Empty State */}
      {collections.length === 0 ? (
        <div className="bg-white dark:bg-[#1a1a1b] border border-slate-200/80 dark:border-white/10 rounded-2xl p-12 text-center shadow-xs">
          <div className="w-14 h-14 rounded-2xl bg-indigo-50 dark:bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 flex items-center justify-center mx-auto mb-3">
            <Folder className="w-7 h-7" />
          </div>
          <h4 className="text-base font-bold text-slate-800 dark:text-white mb-1">
            No Collections Created Yet
          </h4>
          <p className="text-[13px] text-slate-500 dark:text-gray-400 max-w-sm mx-auto mb-5">
            Collections group multiple books and documents (e.g. "Class 10 Physics" or "JEE Chemistry").
          </p>
          <button
            type="button"
            onClick={onOpenCreateCollection}
            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-[13px] font-semibold transition-all shadow-xs"
          >
            + Create First Collection
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {collections.map((col) => {
            const gradient = COLOR_MAP[col.color] || 'from-indigo-500 to-indigo-600';
            const isMenuOpen = activeMenuId === col.id;

            return (
              <div
                key={col.id}
                className="bg-white dark:bg-[#1a1a1b] border border-slate-200/80 dark:border-white/10 hover:border-indigo-500/40 rounded-2xl p-4 transition-all duration-200 shadow-xs hover:shadow-md flex flex-col justify-between relative group"
              >
                <div>
                  {/* Top Bar: Gradient Accent & Menu */}
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2.5">
                      <div
                        className={cn(
                          'w-9 h-9 rounded-xl bg-gradient-to-br flex items-center justify-center text-white shadow-xs',
                          gradient
                        )}
                      >
                        <Folder className="w-4 h-4" />
                      </div>
                      <div>
                        <h4 className="text-[14.5px] font-bold text-slate-900 dark:text-white group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors">
                          {col.title}
                        </h4>
                        <span className="text-[11px] text-slate-400 dark:text-gray-500">
                          Created {new Date(col.createdAt).toLocaleDateString()}
                        </span>
                      </div>
                    </div>

                    {/* Context Menu Button */}
                    <div className="relative">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setActiveMenuId(isMenuOpen ? null : col.id);
                        }}
                        className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-gray-200 hover:bg-slate-100 dark:hover:bg-white/10 transition-colors"
                      >
                        <MoreVertical className="w-4 h-4" />
                      </button>

                      {/* Dropdown Menu */}
                      {isMenuOpen && (
                        <div
                          className="absolute right-0 top-8 w-44 bg-white dark:bg-[#202022] border border-slate-200 dark:border-white/10 rounded-xl shadow-lg z-20 py-1"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <button
                            type="button"
                            onClick={() => {
                              setActiveMenuId(null);
                              onOpenRenameCollection(col);
                            }}
                            className="w-full px-3 py-2 text-left text-[12.5px] font-medium text-slate-700 dark:text-gray-200 hover:bg-slate-100 dark:hover:bg-white/5 flex items-center gap-2"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                            Rename Collection
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setActiveMenuId(null);
                              onOpenUploadForCollection(col.id);
                            }}
                            className="w-full px-3 py-2 text-left text-[12.5px] font-medium text-slate-700 dark:text-gray-200 hover:bg-slate-100 dark:hover:bg-white/5 flex items-center gap-2"
                          >
                            <UploadCloud className="w-3.5 h-3.5 text-indigo-500" />
                            Add Content
                          </button>
                          <div className="border-t border-slate-100 dark:border-white/5 my-1" />
                          <button
                            type="button"
                            onClick={() => {
                              setActiveMenuId(null);
                              if (confirm(`Archive collection "${col.title}" and its sources?`)) {
                                onDeleteCollection(col.id);
                              }
                            }}
                            className="w-full px-3 py-2 text-left text-[12.5px] font-medium text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-500/10 flex items-center gap-2"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                            Archive Collection
                          </button>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Metrics Pills */}
                  <div className="grid grid-cols-3 gap-2 my-3 p-2.5 rounded-xl bg-slate-50 dark:bg-black/20 border border-slate-100 dark:border-white/5 text-center">
                    <div>
                      <div className="text-[11px] text-slate-400 dark:text-gray-500">Sources</div>
                      <div className="text-sm font-bold text-slate-800 dark:text-white">
                        {col.sourceCount || 0}
                      </div>
                    </div>
                    <div>
                      <div className="text-[11px] text-slate-400 dark:text-gray-500">Ready</div>
                      <div className="text-sm font-bold text-emerald-600 dark:text-emerald-400">
                        {col.readyCount || 0}
                      </div>
                    </div>
                    <div>
                      <div className="text-[11px] text-slate-400 dark:text-gray-500">Chunks</div>
                      <div className="text-sm font-bold text-indigo-600 dark:text-indigo-400">
                        {col.totalChunks || 0}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Card Actions Footer */}
                <div className="pt-2 border-t border-slate-100 dark:border-white/5 flex items-center justify-between gap-2">
                  <button
                    type="button"
                    onClick={() => onOpenUploadForCollection(col.id)}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[12px] font-medium text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-500/10 transition-colors"
                  >
                    <UploadCloud className="w-3.5 h-3.5" />
                    + Add Content
                  </button>

                  <button
                    type="button"
                    onClick={() => onSelectCollection(col.id)}
                    className="inline-flex items-center gap-1 text-[12px] font-semibold text-slate-700 dark:text-gray-300 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors"
                  >
                    View Content <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
