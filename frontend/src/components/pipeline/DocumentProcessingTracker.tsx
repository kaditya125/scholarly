/**
 * DocumentProcessingTracker Component
 * Phase 6: Real-Time Processing Experience
 * 
 * Renders the 10 visual stages with live indicators (✓, ⟳, ○, ✕), progress bar,
 * duration timer, items processed breakdown, error reporting, cancel and retry controls.
 */

import React, { useEffect, useState } from 'react';
import {
  CheckCircle2,
  Loader2,
  Circle,
  XCircle,
  Clock,
  Layers,
  Sparkles,
  AlertCircle,
  RotateCcw,
  Ban,
  Radio,
  FileText,
  Database,
  Cpu,
  BookOpen,
  HelpCircle,
  Network,
} from 'lucide-react';
import { cn } from '../../lib/utils';
import {
  PipelineRealtimeSnapshot,
  VisualStageName,
  PipelineRealtimeStage,
} from '../../types/pipeline.types';

interface DocumentProcessingTrackerProps {
  snapshot?: PipelineRealtimeSnapshot | null;
  stages?: PipelineRealtimeStage[];
  currentStage?: VisualStageName;
  progress?: number;
  status?: string;
  durationMs?: number;
  itemsProcessed?: {
    pages?: number;
    blocks?: number;
    chunks?: number;
    vectors?: number;
    kgNodes?: number;
    kgEdges?: number;
  };
  error?: {
    code?: string;
    message: string;
    stage?: string;
    recoverable?: boolean;
  } | null;
  canRetry?: boolean;
  canCancel?: boolean;
  isConnected?: boolean;
  onCancel?: () => void;
  onRetry?: () => void;
  className?: string;
}

export const VISUAL_STAGE_LABELS: Record<
  VisualStageName,
  { label: string; description: string; icon: React.FC<{ className?: string }> }
> = {
  Uploading: {
    label: 'Uploading',
    description: 'SHA-256 validation & Cloud Storage ingest',
    icon: FileText,
  },
  Extraction: {
    label: 'Extraction',
    description: 'Format parsing & layout structure extraction',
    icon: FileText,
  },
  OCR: {
    label: 'OCR',
    description: 'Vision OCR for equations, tables & images',
    icon: Cpu,
  },
  Understanding: {
    label: 'Understanding',
    description: 'AST hierarchy & educational metadata classification',
    icon: BookOpen,
  },
  Chunking: {
    label: 'Chunking',
    description: 'Structure-aware semantic passage chunking',
    icon: Layers,
  },
  Embedding: {
    label: 'Embedding',
    description: 'Google Vertex 768-dim vector embeddings',
    icon: Sparkles,
  },
  'Vector Index': {
    label: 'Vector Index',
    description: 'Pinecone vector index upsert with metadata',
    icon: Database,
  },
  'Knowledge Graph': {
    label: 'Knowledge Graph',
    description: 'Concept extraction & relationship graph linking',
    icon: Network,
  },
  Validation: {
    label: 'Validation',
    description: 'Integrity assertions & consistency verification',
    icon: HelpCircle,
  },
  Ready: {
    label: 'Ready',
    description: 'Material is ready for AI Tutor & Magic Workspace',
    icon: CheckCircle2,
  },
};

export const DocumentProcessingTracker: React.FC<DocumentProcessingTrackerProps> = ({
  snapshot,
  stages,
  currentStage,
  progress = 0,
  status = 'QUEUED',
  durationMs = 0,
  itemsProcessed = {},
  error,
  canRetry = false,
  canCancel = false,
  isConnected = true,
  onCancel,
  onRetry,
  className,
}) => {
  const effectiveStages = snapshot?.stages || stages || [];
  const effectiveCurrentStage = snapshot?.currentStage || currentStage || 'Uploading';
  const effectiveProgress = snapshot?.progress ?? progress;
  const effectiveStatus = snapshot?.status || status;
  const effectiveError = snapshot?.error || error;
  const effectiveItems = snapshot?.itemsProcessed || itemsProcessed;
  const effectiveCanCancel = snapshot?.canCancel ?? canCancel;
  const effectiveCanRetry = snapshot?.canRetry ?? canRetry;

  // Live timer for elapsed time
  const [elapsedMs, setElapsedMs] = useState(durationMs);

  useEffect(() => {
    if (effectiveStatus === 'COMPLETED' || effectiveStatus === 'FAILED' || effectiveStatus === 'CANCELLED') {
      setElapsedMs(snapshot?.durationMs || durationMs);
      return;
    }
    const timer = setInterval(() => {
      setElapsedMs((prev) => prev + 500);
    }, 500);
    return () => clearInterval(timer);
  }, [effectiveStatus, snapshot?.durationMs, durationMs]);

  const formatDuration = (ms: number) => {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const remainingSecs = seconds % 60;
    if (minutes === 0) return `${remainingSecs}s`;
    return `${minutes}m ${remainingSecs}s`;
  };

  const isCompleted = effectiveStatus === 'COMPLETED';
  const isFailed = effectiveStatus === 'FAILED';
  const isCancelled = effectiveStatus === 'CANCELLED';

  return (
    <div
      className={cn(
        'p-5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-sm space-y-5',
        className
      )}
    >
      {/* Top Header & Metrics */}
      <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-slate-100 dark:border-slate-800">
        <div className="flex items-center gap-3">
          <div className="relative">
            {isCompleted ? (
              <div className="w-10 h-10 rounded-xl bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200 dark:border-emerald-800 flex items-center justify-center text-emerald-600 dark:text-emerald-400 font-bold">
                <CheckCircle2 className="w-5 h-5" />
              </div>
            ) : isFailed ? (
              <div className="w-10 h-10 rounded-xl bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-800 flex items-center justify-center text-rose-600 dark:text-rose-400 font-bold">
                <XCircle className="w-5 h-5" />
              </div>
            ) : (
              <div className="w-10 h-10 rounded-xl bg-indigo-50 dark:bg-indigo-950/50 border border-indigo-200 dark:border-indigo-800 flex items-center justify-center text-indigo-600 dark:text-indigo-400">
                <Loader2 className="w-5 h-5 animate-spin" />
              </div>
            )}
          </div>

          <div>
            <div className="flex items-center gap-2">
              <h4 className="text-base font-semibold text-slate-900 dark:text-white">
                {isCompleted
                  ? 'Document Ready'
                  : isFailed
                  ? 'Processing Failed'
                  : isCancelled
                  ? 'Processing Cancelled'
                  : `${effectiveCurrentStage} in Progress`}
              </h4>
              <span
                className={cn(
                  'px-2 py-0.5 text-xs font-semibold rounded-full uppercase tracking-wider',
                  isCompleted
                    ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300'
                    : isFailed
                    ? 'bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300'
                    : isCancelled
                    ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300'
                    : 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300'
                )}
              >
                {effectiveStatus}
              </span>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {isCompleted
                ? 'All 10 pipeline stages successfully executed'
                : isFailed
                ? 'An error occurred during stage execution'
                : VISUAL_STAGE_LABELS[effectiveCurrentStage]?.description || 'Processing document content'}
            </p>
          </div>
        </div>

        {/* Duration & Live SSE Status */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5 px-2.5 py-1 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 rounded-lg text-xs font-medium">
            <Clock className="w-3.5 h-3.5 text-slate-400" />
            <span>{formatDuration(elapsedMs)}</span>
          </div>

          <div
            className={cn(
              'flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium',
              isConnected
                ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400'
                : 'bg-amber-50 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400'
            )}
          >
            <Radio className={cn('w-3.5 h-3.5', isConnected ? 'animate-pulse' : '')} />
            <span>{isConnected ? 'Live Stream' : 'Reconnecting…'}</span>
          </div>

          {/* Action Buttons */}
          {effectiveCanCancel && !isCompleted && !isFailed && onCancel && (
            <button
              onClick={onCancel}
              className="flex items-center gap-1.5 px-3 py-1 bg-rose-50 hover:bg-rose-100 text-rose-600 dark:bg-rose-950/40 dark:hover:bg-rose-900/40 dark:text-rose-400 rounded-lg text-xs font-semibold transition"
            >
              <Ban className="w-3.5 h-3.5" />
              Cancel
            </button>
          )}

          {(effectiveCanRetry || isFailed) && onRetry && (
            <button
              onClick={onRetry}
              className="flex items-center gap-1.5 px-3 py-1 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-semibold shadow-sm transition"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              Retry Stage
            </button>
          )}
        </div>
      </div>

      {/* Progress Bar */}
      <div className="space-y-1.5">
        <div className="flex justify-between text-xs font-semibold text-slate-600 dark:text-slate-400">
          <span>Overall Pipeline Progress</span>
          <span>{Math.round(effectiveProgress * 100)}%</span>
        </div>
        <div className="w-full h-2.5 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
          <div
            className={cn(
              'h-full transition-all duration-500 ease-out',
              isCompleted
                ? 'bg-emerald-500'
                : isFailed
                ? 'bg-rose-500'
                : 'bg-gradient-to-r from-indigo-500 via-purple-500 to-teal-400'
            )}
            style={{ width: `${Math.max(effectiveProgress * 100, isCompleted ? 100 : 4)}%` }}
          />
        </div>
      </div>

      {/* Items Processed Metrics Pills */}
      {(effectiveItems.pages ||
        effectiveItems.blocks ||
        effectiveItems.chunks ||
        effectiveItems.vectors ||
        effectiveItems.kgNodes) && (
        <div className="flex flex-wrap items-center gap-2 pt-1">
          {effectiveItems.pages !== undefined && (
            <span className="px-2.5 py-1 bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-lg text-xs text-slate-700 dark:text-slate-300">
              📄 <strong>{effectiveItems.pages}</strong> {effectiveItems.pages === 1 ? 'Page' : 'Pages'}
            </span>
          )}
          {effectiveItems.blocks !== undefined && (
            <span className="px-2.5 py-1 bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-lg text-xs text-slate-700 dark:text-slate-300">
              🧱 <strong>{effectiveItems.blocks}</strong> Blocks
            </span>
          )}
          {effectiveItems.chunks !== undefined && (
            <span className="px-2.5 py-1 bg-indigo-50 dark:bg-indigo-950/40 border border-indigo-200 dark:border-indigo-800 rounded-lg text-xs text-indigo-700 dark:text-indigo-300">
              🧩 <strong>{effectiveItems.chunks}</strong> Semantic Chunks
            </span>
          )}
          {effectiveItems.vectors !== undefined && (
            <span className="px-2.5 py-1 bg-teal-50 dark:bg-teal-950/40 border border-teal-200 dark:border-teal-800 rounded-lg text-xs text-teal-700 dark:text-teal-300">
              ⚡ <strong>{effectiveItems.vectors}</strong> Indexed Vectors
            </span>
          )}
          {effectiveItems.kgNodes !== undefined && (
            <span className="px-2.5 py-1 bg-purple-50 dark:bg-purple-950/40 border border-purple-200 dark:border-purple-800 rounded-lg text-xs text-purple-700 dark:text-purple-300">
              🌐 <strong>{effectiveItems.kgNodes}</strong> KG Concepts
            </span>
          )}
          {effectiveItems.kgEdges !== undefined && (
            <span className="px-2.5 py-1 bg-purple-50 dark:bg-purple-950/40 border border-purple-200 dark:border-purple-800 rounded-lg text-xs text-purple-700 dark:text-purple-300">
              🔗 <strong>{effectiveItems.kgEdges}</strong> Relationships
            </span>
          )}
        </div>
      )}

      {/* Error Banner */}
      {effectiveError && (
        <div className="p-3.5 bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-800 rounded-xl flex items-start gap-3 text-rose-700 dark:text-rose-300 text-xs">
          <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5 text-rose-500" />
          <div className="space-y-1 flex-1">
            <div className="font-semibold flex items-center justify-between">
              <span>Failure in stage [{effectiveError.stage || effectiveCurrentStage}]</span>
              {effectiveError.code && (
                <span className="font-mono text-[10px] uppercase bg-rose-100 dark:bg-rose-900/50 px-1.5 py-0.5 rounded">
                  {effectiveError.code}
                </span>
              )}
            </div>
            <p className="text-rose-600 dark:text-rose-400">{effectiveError.message}</p>
          </div>
        </div>
      )}

      {/* 10 Visual Stages Grid / List */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2.5 pt-2">
        {effectiveStages.map((stg) => {
          const isStgCompleted = stg.status === 'completed';
          const isStgRunning = stg.status === 'running';
          const isStgFailed = stg.status === 'failed';
          const config = VISUAL_STAGE_LABELS[stg.stage] || {
            label: stg.stage,
            description: '',
            icon: Circle,
          };
          const Icon = config.icon;

          return (
            <div
              key={stg.stage}
              className={cn(
                'p-3 rounded-xl border transition-all flex flex-col justify-between space-y-2',
                isStgCompleted
                  ? 'bg-emerald-50/50 dark:bg-emerald-950/20 border-emerald-200/70 dark:border-emerald-900/40 text-emerald-950 dark:text-emerald-100'
                  : isStgRunning
                  ? 'bg-indigo-50/80 dark:bg-indigo-950/40 border-indigo-300 dark:border-indigo-700 shadow-sm text-indigo-950 dark:text-indigo-100 ring-1 ring-indigo-400/30'
                  : isStgFailed
                  ? 'bg-rose-50/70 dark:bg-rose-950/30 border-rose-300 dark:border-rose-800 text-rose-950 dark:text-rose-100'
                  : 'bg-slate-50/50 dark:bg-slate-800/40 border-slate-200/60 dark:border-slate-800 text-slate-500 dark:text-slate-400'
              )}
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold truncate flex items-center gap-1.5">
                  <Icon className="w-3.5 h-3.5 opacity-70" />
                  {config.label}
                </span>

                {/* Status Indicator Symbol (✓, ⟳, ○, ✕) */}
                {isStgCompleted ? (
                  <span
                    title="Completed"
                    className="flex items-center justify-center w-5 h-5 rounded-full bg-emerald-100 text-emerald-600 dark:bg-emerald-900/60 dark:text-emerald-300 text-xs font-bold"
                  >
                    ✓
                  </span>
                ) : isStgRunning ? (
                  <span
                    title="Running"
                    className="flex items-center justify-center w-5 h-5 rounded-full bg-indigo-100 text-indigo-600 dark:bg-indigo-900/60 dark:text-indigo-300 text-xs font-bold animate-spin"
                  >
                    ⟳
                  </span>
                ) : isStgFailed ? (
                  <span
                    title="Failed"
                    className="flex items-center justify-center w-5 h-5 rounded-full bg-rose-100 text-rose-600 dark:bg-rose-900/60 dark:text-rose-300 text-xs font-bold"
                  >
                    ✕
                  </span>
                ) : (
                  <span
                    title="Pending"
                    className="flex items-center justify-center w-5 h-5 rounded-full bg-slate-100 text-slate-400 dark:bg-slate-800 text-xs"
                  >
                    ○
                  </span>
                )}
              </div>

              <div className="flex items-center justify-between text-[11px] opacity-80">
                <span className="capitalize">{stg.status}</span>
                {stg.durationMs > 0 && <span>{formatDuration(stg.durationMs)}</span>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
