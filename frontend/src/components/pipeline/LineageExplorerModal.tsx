/**
 * LineageExplorerModal Component
 * Phase 9: Document Versioning & 4-Level Content Lineage Visualizer
 *
 * Visualizes deterministic provenance:
 * Level 1: Artifact -> Level 2: Chunk -> Level 3: Document Version -> Level 4: Original Source
 */

import React, { useState } from 'react';
import {
  X,
  Layers,
  FileText,
  History,
  Sparkles,
  BotMessageSquare,
  Headphones,
  FileCode,
  HelpCircle,
  Hash,
  Copy,
  Check,
  ExternalLink,
  ChevronRight,
  ShieldCheck,
  Cpu,
} from 'lucide-react';
import { cn } from '../../lib/utils';
import { Complete4LevelLineage, DownstreamArtifactType } from '../../types/pipeline.types';

interface LineageExplorerModalProps {
  isOpen: boolean;
  onClose: () => void;
  lineage: Complete4LevelLineage | null;
  loading?: boolean;
}

export const LineageExplorerModal: React.FC<LineageExplorerModalProps> = ({
  isOpen,
  onClose,
  lineage,
  loading = false,
}) => {
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [activeLevel, setActiveLevel] = useState<number>(1);

  if (!isOpen) return null;

  const handleCopy = (key: string, text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  const getArtifactIcon = (type: DownstreamArtifactType) => {
    switch (type) {
      case 'MAGIC_CHAT':
        return <BotMessageSquare className="w-5 h-5 text-indigo-500" />;
      case 'PODCAST':
        return <Headphones className="w-5 h-5 text-amber-500" />;
      case 'ARTICLE':
      case 'NOTE':
        return <FileCode className="w-5 h-5 text-emerald-500" />;
      case 'QUIZ':
      case 'FLASHCARD':
        return <HelpCircle className="w-5 h-5 text-rose-500" />;
      case 'RAG_CITATION':
      default:
        return <Sparkles className="w-5 h-5 text-blue-500" />;
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-white dark:bg-[#1e1e1f] border border-slate-200 dark:border-white/10 rounded-2xl shadow-2xl w-full max-w-3xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="p-5 border-b border-slate-200 dark:border-white/10 flex items-center justify-between bg-slate-50/50 dark:bg-black/20">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-indigo-50 dark:bg-indigo-500/15 flex items-center justify-center text-indigo-600 dark:text-indigo-400">
              <Layers className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                4-Level Content Lineage & Provenance
                <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-indigo-100 dark:bg-indigo-500/20 text-indigo-700 dark:text-indigo-300">
                  Deterministic
                </span>
              </h3>
              <p className="text-xs text-slate-500 dark:text-gray-400">
                Trace downstream AI artifact directly back to chunk, version, and original source.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-slate-600 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-white/10 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-6 overflow-y-auto space-y-6">
          {loading ? (
            <div className="py-16 text-center">
              <div className="w-8 h-8 border-3 border-indigo-600 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
              <p className="text-sm font-medium text-slate-600 dark:text-gray-400">
                Tracing 4-Level provenance graph...
              </p>
            </div>
          ) : !lineage ? (
            <div className="py-12 text-center text-slate-500 dark:text-gray-400">
              <Layers className="w-10 h-10 mx-auto mb-2 opacity-40" />
              <p>No lineage trace found for the selected entity.</p>
            </div>
          ) : (
            <>
              {/* Provenance Flow Breadcrumbs */}
              <div className="grid grid-cols-4 gap-2 bg-slate-100 dark:bg-black/40 p-2 rounded-xl border border-slate-200/80 dark:border-white/5">
                {[
                  { level: 1, label: '1. Artifact', sub: lineage.artifact.artifactType, icon: Sparkles },
                  { level: 2, label: '2. Chunk', sub: `#${lineage.chunk.sequence}`, icon: FileCode },
                  { level: 3, label: '3. Version', sub: lineage.documentVersion.documentVersionId, icon: History },
                  { level: 4, label: '4. Source', sub: 'Original File', icon: FileText },
                ].map((step) => {
                  const Icon = step.icon;
                  const isActive = activeLevel === step.level;
                  return (
                    <button
                      key={step.level}
                      onClick={() => setActiveLevel(step.level)}
                      className={cn(
                        'flex flex-col items-center justify-center p-2.5 rounded-lg text-center transition-all cursor-pointer border',
                        isActive
                          ? 'bg-white dark:bg-[#252526] text-indigo-600 dark:text-indigo-400 border-indigo-500/30 shadow-xs'
                          : 'bg-transparent text-slate-500 dark:text-gray-400 border-transparent hover:bg-white/40 dark:hover:bg-white/5'
                      )}
                    >
                      <Icon className="w-4 h-4 mb-1" />
                      <span className="text-[11.5px] font-bold">{step.label}</span>
                      <span className="text-[10px] opacity-75 font-mono truncate max-w-full">{step.sub}</span>
                    </button>
                  );
                })}
              </div>

              {/* Level 1: Artifact Card */}
              <div className={cn('space-y-3', activeLevel !== 1 && 'hidden')}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="px-2 py-0.5 rounded text-[10.5px] font-bold bg-indigo-50 dark:bg-indigo-500/20 text-indigo-700 dark:text-indigo-300">
                      LEVEL 1
                    </span>
                    <h4 className="font-bold text-sm text-slate-900 dark:text-white">
                      Downstream AI Artifact
                    </h4>
                  </div>
                  <span className="text-xs text-slate-400">
                    {new Date(lineage.artifact.generatedAt).toLocaleString()}
                  </span>
                </div>

                <div className="p-4 rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50/50 dark:bg-black/20 space-y-3">
                  <div className="flex items-start gap-3">
                    <div className="w-9 h-9 rounded-lg bg-white dark:bg-[#252526] flex items-center justify-center shadow-xs shrink-0">
                      {getArtifactIcon(lineage.artifact.artifactType)}
                    </div>
                    <div>
                      <h5 className="font-bold text-sm text-slate-800 dark:text-white">
                        {lineage.artifact.title || lineage.artifact.artifactType}
                      </h5>
                      <p className="text-xs text-slate-500 dark:text-gray-400 mt-0.5">
                        Context: {lineage.artifact.consumerContext || 'RAG Retrieval Grounding'}
                      </p>
                    </div>
                  </div>

                  <div className="pt-2 border-t border-slate-200/60 dark:border-white/5 flex items-center justify-between text-xs">
                    <span className="text-slate-400">Artifact ID:</span>
                    <button
                      onClick={() => handleCopy('artId', lineage.artifact.artifactId)}
                      className="font-mono text-slate-700 dark:text-gray-300 flex items-center gap-1 hover:text-indigo-600 transition-colors"
                    >
                      {lineage.artifact.artifactId}
                      {copiedKey === 'artId' ? <Check className="w-3 h-3 text-emerald-500" /> : <Copy className="w-3 h-3" />}
                    </button>
                  </div>
                </div>
              </div>

              {/* Level 2: Chunk Card */}
              <div className={cn('space-y-3', activeLevel !== 2 && 'hidden')}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="px-2 py-0.5 rounded text-[10.5px] font-bold bg-amber-50 dark:bg-amber-500/20 text-amber-700 dark:text-amber-300">
                      LEVEL 2
                    </span>
                    <h4 className="font-bold text-sm text-slate-900 dark:text-white">
                      Semantic Chunk & Exact Bounds
                    </h4>
                  </div>
                  <span className="text-xs font-semibold text-slate-500">
                    Page {lineage.chunk.pageNumber} {lineage.chunk.pageEnd > lineage.chunk.pageNumber && `- ${lineage.chunk.pageEnd}`}
                  </span>
                </div>

                <div className="p-4 rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50/50 dark:bg-black/20 space-y-3">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-semibold text-slate-700 dark:text-white">
                      {lineage.chunk.chapter || 'Chapter'} &gt; {lineage.chunk.section || 'Section'}
                    </span>
                    <span className="text-slate-400 font-mono">
                      {lineage.chunk.tokenCount} tokens • {lineage.chunk.charCount} chars
                    </span>
                  </div>

                  <div className="p-3 bg-white dark:bg-[#252526] rounded-lg border border-slate-200/80 dark:border-white/10 text-xs font-mono text-slate-800 dark:text-gray-200 max-h-36 overflow-y-auto leading-relaxed">
                    {lineage.chunk.snippet}
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-[11.5px] pt-1">
                    <div className="p-2 rounded bg-slate-100/70 dark:bg-white/5 flex items-center justify-between">
                      <span className="text-slate-400">Chunk ID:</span>
                      <span className="font-mono text-slate-700 dark:text-gray-300 truncate max-w-[120px]">
                        {lineage.chunk.chunkId}
                      </span>
                    </div>
                    <div className="p-2 rounded bg-slate-100/70 dark:bg-white/5 flex items-center justify-between">
                      <span className="text-slate-400">Sequence:</span>
                      <span className="font-mono font-bold text-slate-700 dark:text-gray-300">
                        #{lineage.chunk.sequence}
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Level 3: Document Version Card */}
              <div className={cn('space-y-3', activeLevel !== 3 && 'hidden')}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="px-2 py-0.5 rounded text-[10.5px] font-bold bg-teal-50 dark:bg-teal-500/20 text-teal-700 dark:text-teal-300">
                      LEVEL 3
                    </span>
                    <h4 className="font-bold text-sm text-slate-900 dark:text-white">
                      Document Version & Processing Snapshot
                    </h4>
                  </div>
                  <span className="px-2 py-0.5 rounded-full text-[10.5px] font-bold bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300">
                    Version {lineage.documentVersion.versionNumber} ({lineage.documentVersion.documentVersionId})
                  </span>
                </div>

                <div className="p-4 rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50/50 dark:bg-black/20 space-y-3 text-xs">
                  <div className="grid grid-cols-2 gap-3">
                    <div className="p-3 rounded-xl bg-white dark:bg-[#252526] border border-slate-100 dark:border-white/5">
                      <span className="text-slate-400 block text-[11px] mb-0.5">Embedding Model</span>
                      <span className="font-semibold text-slate-800 dark:text-white flex items-center gap-1">
                        <Cpu className="w-3.5 h-3.5 text-teal-500" />
                        {lineage.documentVersion.embeddingModel}
                      </span>
                    </div>

                    <div className="p-3 rounded-xl bg-white dark:bg-[#252526] border border-slate-100 dark:border-white/5">
                      <span className="text-slate-400 block text-[11px] mb-0.5">Embedding Version</span>
                      <span className="font-semibold text-slate-800 dark:text-white">
                        v{lineage.documentVersion.embeddingVersion} (Run #{lineage.documentVersion.processingVersion})
                      </span>
                    </div>
                  </div>

                  <div className="p-3 rounded-xl bg-white dark:bg-[#252526] border border-slate-100 dark:border-white/5 flex items-center justify-between">
                    <div>
                      <span className="text-slate-400 block text-[11px]">Version Hash / Checksum</span>
                      <span className="font-mono text-[11px] text-slate-700 dark:text-gray-300">
                        {lineage.documentVersion.checksum}
                      </span>
                    </div>
                    <button
                      onClick={() => handleCopy('vHash', lineage.documentVersion.checksum)}
                      className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-white/10 text-slate-400 hover:text-slate-600 transition-colors"
                    >
                      {copiedKey === 'vHash' ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                </div>
              </div>

              {/* Level 4: Original Source Card */}
              <div className={cn('space-y-3', activeLevel !== 4 && 'hidden')}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="px-2 py-0.5 rounded text-[10.5px] font-bold bg-blue-50 dark:bg-blue-500/20 text-blue-700 dark:text-blue-300">
                      LEVEL 4
                    </span>
                    <h4 className="font-bold text-sm text-slate-900 dark:text-white">
                      Original Root Source Document
                    </h4>
                  </div>
                  <span className="text-xs text-slate-400">
                    Uploaded {new Date(lineage.originalSource.uploadedAt).toLocaleDateString()}
                  </span>
                </div>

                <div className="p-4 rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50/50 dark:bg-black/20 space-y-3 text-xs">
                  <div className="flex items-start gap-3">
                    <div className="w-9 h-9 rounded-lg bg-white dark:bg-[#252526] flex items-center justify-center shadow-xs shrink-0 text-blue-500">
                      <FileText className="w-5 h-5" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <h5 className="font-bold text-sm text-slate-800 dark:text-white truncate">
                        {lineage.originalSource.title}
                      </h5>
                      <p className="text-[11.5px] text-slate-500 dark:text-gray-400 font-mono truncate">
                        {lineage.originalSource.originalName} • {lineage.originalSource.contentType}
                      </p>
                    </div>
                  </div>

                  <div className="pt-2 border-t border-slate-200/60 dark:border-white/5 space-y-2">
                    <div className="flex items-center justify-between text-[11.5px]">
                      <span className="text-slate-400">Collection ID:</span>
                      <span className="font-mono text-slate-700 dark:text-gray-300">
                        {lineage.originalSource.collectionId}
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-[11.5px]">
                      <span className="text-slate-400">Storage URI:</span>
                      <span className="font-mono text-slate-700 dark:text-gray-300 truncate max-w-[260px]">
                        {lineage.originalSource.storagePath || 'gs://...'}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-200 dark:border-white/10 bg-slate-50/50 dark:bg-black/20 flex items-center justify-between">
          <div className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-gray-400">
            <ShieldCheck className="w-4 h-4 text-emerald-500" />
            <span>Immutable Lineage Invariant Verified</span>
          </div>
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-xl text-xs font-semibold bg-slate-900 text-white dark:bg-white dark:text-slate-900 hover:opacity-90 transition-opacity"
          >
            Close Inspector
          </button>
        </div>
      </div>
    </div>
  );
};
