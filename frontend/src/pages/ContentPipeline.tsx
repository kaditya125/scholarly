/**
 * ContentPipeline Page
 * Phase 7: Content Exploration & Multi-modal Workspace Integration
 */

import React, { useState } from 'react';
import {
  UploadCloud,
  FolderPlus,
  Layers,
  Folder,
  FileText,
  RotateCw,
  Sparkles,
  Compass,
  Search,
} from 'lucide-react';
import { cn } from '../lib/utils';
import { usePipeline } from '../hooks/usePipeline';
import { useContentExploration } from '../hooks/useContentExploration';
import { PipelineStatsCard } from '../components/pipeline/PipelineStatsCard';
import { PipelineFilterBar } from '../components/pipeline/PipelineFilterBar';
import { ContentLibraryTable } from '../components/pipeline/ContentLibraryTable';
import { CollectionsManager } from '../components/pipeline/CollectionsManager';
import { DocumentDetailWorkspace } from '../components/pipeline/DocumentDetailWorkspace';
import { ContentExplorationSearch } from '../components/pipeline/ContentExplorationSearch';
import { UploadContentModal } from '../components/pipeline/UploadContentModal';
import { CreateCollectionModal } from '../components/pipeline/CreateCollectionModal';
import { RenameCollectionModal } from '../components/pipeline/RenameCollectionModal';
import { PipelineCollection, PipelineSource } from '../types/pipeline.types';

export function ContentPipeline() {
  const {
    sources,
    filteredSources,
    collections,
    stats,
    isLoading,
    isRefetching,
    filters,
    setFilters,
    resetFilters,
    filterOptions,
    selectedSource,
    setSelectedSource,
    activeWorkspaceTab,
    setActiveWorkspaceTab,
    createCollection,
    isCreatingCollection,
    updateCollection,
    isUpdatingCollection,
    deleteCollection,
    uploadSource,
    isUploadingSource,
    uploadProgress,
    deleteSource,
    retrySource,
    refetch,
  } = usePipeline();

  const [activeMainTab, setActiveMainTab] = useState<'library' | 'collections' | 'exploration'>('library');
  const [viewMode, setViewMode] = useState<'table' | 'grid'>('table');
  const [isUploadOpen, setIsUploadOpen] = useState(false);
  const [isCreateCollectionOpen, setIsCreateCollectionOpen] = useState(false);
  const [renamingCollection, setRenamingCollection] = useState<PipelineCollection | null>(null);
  const [uploadTargetCollectionId, setUploadTargetCollectionId] = useState<string | undefined>(undefined);

  // Lineage navigation target state
  const [targetChunkId, setTargetChunkId] = useState<string | undefined>(undefined);
  const [targetPage, setTargetPage] = useState<number | undefined>(undefined);

  // Exploration hook
  const exploration = useContentExploration();

  const handleOpenUpload = (collectionId?: string) => {
    setUploadTargetCollectionId(collectionId);
    setIsUploadOpen(true);
  };

  const handleFilterByStatus = (status: string) => {
    setFilters((prev) => ({ ...prev, status }));
    setActiveMainTab('library');
  };

  const handleSelectCollectionFromManager = (collectionId: string) => {
    setFilters((prev) => ({ ...prev, collectionId }));
    setActiveMainTab('library');
  };

  const handleNavigateToSourceFromSearch = (
    matchedSource: PipelineSource,
    chunkId?: string,
    page?: number
  ) => {
    setTargetChunkId(chunkId);
    setTargetPage(page);
    setSelectedSource(matchedSource);
    setActiveWorkspaceTab('chunks');
  };

  return (
    <div className="min-h-screen bg-slate-50/50 dark:bg-[#121214] text-slate-900 dark:text-gray-100 p-4 sm:p-6 lg:p-8">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Top Header */}
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="px-2 py-0.5 rounded-md bg-indigo-50 dark:bg-indigo-500/15 text-indigo-600 dark:text-indigo-400 text-[11px] font-bold tracking-wider uppercase">
                Knowledge Ingestion Engine
              </span>
              {isRefetching && (
                <span className="flex items-center gap-1 text-[11px] text-slate-400 dark:text-gray-500 animate-pulse">
                  <RotateCw className="w-3 h-3 animate-spin" /> Syncing...
                </span>
              )}
            </div>
            <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 dark:text-white tracking-tight">
              CONTENT PIPELINE
            </h1>
            <p className="text-slate-500 dark:text-gray-400 text-sm mt-1">
              Transform learning materials into AI-ready knowledge with deterministic lineage.
            </p>
          </div>

          {/* Header Action Buttons */}
          <div className="flex items-center gap-2.5 shrink-0 self-stretch sm:self-auto">
            <button
              type="button"
              onClick={() => setIsCreateCollectionOpen(true)}
              className="flex-1 sm:flex-initial inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#1a1a1b] hover:bg-slate-50 dark:hover:bg-white/5 text-slate-700 dark:text-gray-200 text-[13px] font-semibold transition-all shadow-xs"
            >
              <FolderPlus className="w-4 h-4 text-slate-500 dark:text-gray-400" />
              + Create Collection
            </button>

            <button
              type="button"
              onClick={() => handleOpenUpload()}
              className="flex-1 sm:flex-initial inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-[13px] font-semibold transition-all shadow-xs"
            >
              <UploadCloud className="w-4 h-4" />
              + Upload Content
            </button>
          </div>
        </div>

        {/* 7 Metric Stats Row */}
        <PipelineStatsCard stats={stats} onFilterByStatus={handleFilterByStatus} />

        {/* Selected Source Document Workspace View */}
        {selectedSource ? (
          <DocumentDetailWorkspace
            source={selectedSource}
            activeTab={activeWorkspaceTab}
            onTabChange={setActiveWorkspaceTab}
            onBack={() => {
              setSelectedSource(null);
              setTargetChunkId(undefined);
              setTargetPage(undefined);
            }}
            onDelete={async (colId, srcId) => {
              await deleteSource({ collectionId: colId, sourceId: srcId });
              setSelectedSource(null);
            }}
            onRetry={async (colId, srcId) => {
              await retrySource({ collectionId: colId, sourceId: srcId });
            }}
            highlightChunkId={targetChunkId}
            highlightPage={targetPage}
          />
        ) : (
          <>
            {/* View Switcher Tabs: Library vs Collections vs Exploration */}
            <div className="flex items-center gap-2 border-b border-slate-200 dark:border-white/10 pb-3 overflow-x-auto scrollbar-none">
              <button
                type="button"
                onClick={() => setActiveMainTab('library')}
                className={cn(
                  'flex items-center gap-2 px-4 py-2 rounded-xl text-[13px] font-bold transition-all whitespace-nowrap',
                  activeMainTab === 'library'
                    ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900 shadow-xs'
                    : 'text-slate-500 dark:text-gray-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-white/5'
                )}
              >
                <Layers className="w-4 h-4" />
                Content Library ({sources.length})
              </button>

              <button
                type="button"
                onClick={() => setActiveMainTab('collections')}
                className={cn(
                  'flex items-center gap-2 px-4 py-2 rounded-xl text-[13px] font-bold transition-all whitespace-nowrap',
                  activeMainTab === 'collections'
                    ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900 shadow-xs'
                    : 'text-slate-500 dark:text-gray-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-white/5'
                )}
              >
                <Folder className="w-4 h-4" />
                Collections ({collections.length})
              </button>

              <button
                type="button"
                onClick={() => setActiveMainTab('exploration')}
                className={cn(
                  'flex items-center gap-2 px-4 py-2 rounded-xl text-[13px] font-bold transition-all whitespace-nowrap',
                  activeMainTab === 'exploration'
                    ? 'bg-indigo-600 text-white shadow-xs'
                    : 'text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-500/10'
                )}
              >
                <Compass className="w-4 h-4" />
                Content Exploration & Search
              </button>
            </div>

            {/* Tab 1: Content Library */}
            {activeMainTab === 'library' && (
              <div>
                <PipelineFilterBar
                  filters={filters}
                  onFilterChange={(updates) => setFilters((prev) => ({ ...prev, ...updates }))}
                  onReset={resetFilters}
                  collections={collections}
                  filterOptions={filterOptions}
                  totalCount={sources.length}
                  filteredCount={filteredSources.length}
                  viewMode={viewMode}
                  onViewModeChange={setViewMode}
                />

                <ContentLibraryTable
                  sources={filteredSources}
                  viewMode={viewMode}
                  onSelectSource={(s) => setSelectedSource(s)}
                  onDeleteSource={(colId, srcId) => deleteSource({ collectionId: colId, sourceId: srcId })}
                  onRetrySource={(colId, srcId) => retrySource({ collectionId: colId, sourceId: srcId })}
                  onOpenUpload={() => handleOpenUpload()}
                  onResetFilters={resetFilters}
                  isFiltered={
                    filters.search !== '' ||
                    filters.status !== 'ALL' ||
                    filters.contentType !== 'ALL' ||
                    filters.subject !== 'ALL' ||
                    filters.classGrade !== 'ALL' ||
                    filters.exam !== 'ALL' ||
                    filters.language !== 'ALL' ||
                    filters.collectionId !== 'ALL'
                  }
                />
              </div>
            )}

            {/* Tab 2: Collections Manager */}
            {activeMainTab === 'collections' && (
              <CollectionsManager
                collections={collections}
                onSelectCollection={handleSelectCollectionFromManager}
                onOpenCreateCollection={() => setIsCreateCollectionOpen(true)}
                onOpenRenameCollection={(col) => setRenamingCollection(col)}
                onDeleteCollection={(colId) => deleteCollection(colId)}
                onOpenUploadForCollection={(colId) => handleOpenUpload(colId)}
              />
            )}

            {/* Tab 3: Content Exploration Search Engine */}
            {activeMainTab === 'exploration' && (
              <ContentExplorationSearch
                query={exploration.query}
                onQueryChange={exploration.setQuery}
                mode={exploration.mode}
                onModeChange={exploration.setMode}
                filters={exploration.filters}
                onFilterChange={(updates) => exploration.setFilters((prev) => ({ ...prev, ...updates }))}
                results={exploration.results}
                isSearching={exploration.isSearching}
                searchError={exploration.searchError}
                collections={collections}
                sources={sources}
                onSearch={exploration.performSearch}
                onClear={exploration.clearSearch}
                onNavigateToSource={handleNavigateToSourceFromSearch}
              />
            )}
          </>
        )}
      </div>

      {/* Modals */}
      <UploadContentModal
        isOpen={isUploadOpen}
        onClose={() => {
          setIsUploadOpen(false);
          refetch();
        }}
        collections={collections}
        initialCollectionId={uploadTargetCollectionId}
        onSuccess={() => {
          refetch();
        }}
      />

      <CreateCollectionModal
        isOpen={isCreateCollectionOpen}
        onClose={() => setIsCreateCollectionOpen(false)}
        onCreate={async (title, color) => {
          await createCollection({ title, color });
        }}
        isCreating={isCreatingCollection}
      />

      <RenameCollectionModal
        isOpen={!!renamingCollection}
        onClose={() => setRenamingCollection(null)}
        collection={renamingCollection}
        onUpdate={async (colId, updates) => {
          await updateCollection({ collectionId: colId, updates });
        }}
        isUpdating={isUpdatingCollection}
      />
    </div>
  );
}

export default ContentPipeline;
