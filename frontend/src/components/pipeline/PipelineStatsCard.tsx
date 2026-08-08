/**
 * PipelineStatsCard Component
 * Phase 1B: Content Pipeline Frontend Foundation
 */

import React from 'react';
import {
  FileText,
  Loader2,
  CheckCircle2,
  AlertTriangle,
  Layers,
  Cpu,
  Network,
} from 'lucide-react';
import { cn } from '../../lib/utils';
import { PipelineStats } from '../../types/pipeline.types';

interface PipelineStatsProps {
  stats: PipelineStats;
  onFilterByStatus?: (status: string) => void;
}

export const PipelineStatsCard: React.FC<PipelineStatsProps> = ({ stats, onFilterByStatus }) => {
  const cards = [
    {
      id: 'total',
      label: 'Total Sources',
      value: stats.totalSources,
      sublabel: 'Ingested documents',
      icon: FileText,
      color: 'text-indigo-500',
      bgLight: 'bg-indigo-50 dark:bg-indigo-500/10',
      border: 'hover:border-indigo-500/40',
      statusTarget: 'ALL',
    },
    {
      id: 'processing',
      label: 'Processing',
      value: stats.processing,
      sublabel: 'Active extraction jobs',
      icon: Loader2,
      color: 'text-amber-500',
      bgLight: 'bg-amber-50 dark:bg-amber-500/10',
      border: 'hover:border-amber-500/40',
      animateIcon: stats.processing > 0,
      statusTarget: 'PROCESSING',
    },
    {
      id: 'ready',
      label: 'Ready',
      value: stats.ready,
      sublabel: 'AI-ready knowledge',
      icon: CheckCircle2,
      color: 'text-emerald-500',
      bgLight: 'bg-emerald-50 dark:bg-emerald-500/10',
      border: 'hover:border-emerald-500/40',
      statusTarget: 'READY',
    },
    {
      id: 'failed',
      label: 'Failed',
      value: stats.failed,
      sublabel: 'Requires attention',
      icon: AlertTriangle,
      color: 'text-rose-500',
      bgLight: 'bg-rose-50 dark:bg-rose-500/10',
      border: 'hover:border-rose-500/40',
      statusTarget: 'FAILED',
    },
    {
      id: 'chunks',
      label: 'Total Chunks',
      value: stats.totalChunks.toLocaleString(),
      sublabel: 'Semantic passages',
      icon: Layers,
      color: 'text-blue-500',
      bgLight: 'bg-blue-50 dark:bg-blue-500/10',
      border: 'hover:border-blue-500/40',
    },
    {
      id: 'vectors',
      label: 'Indexed Vectors',
      value: stats.indexedVectors.toLocaleString(),
      sublabel: 'Pinecone embeddings',
      icon: Cpu,
      color: 'text-purple-500',
      bgLight: 'bg-purple-50 dark:bg-purple-500/10',
      border: 'hover:border-purple-500/40',
    },
    {
      id: 'kg',
      label: 'Knowledge Graph Nodes',
      value: stats.knowledgeGraphNodes.toLocaleString(),
      sublabel: 'Extracted concepts',
      icon: Network,
      color: 'text-teal-500',
      bgLight: 'bg-teal-50 dark:bg-teal-500/10',
      border: 'hover:border-teal-500/40',
    },
  ];

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-7 gap-3 mb-6">
      {cards.map((card) => {
        const Icon = card.icon;
        const isClickable = !!card.statusTarget && !!onFilterByStatus;

        return (
          <button
            key={card.id}
            type="button"
            onClick={() => card.statusTarget && onFilterByStatus?.(card.statusTarget)}
            disabled={!isClickable}
            className={cn(
              'flex flex-col text-left p-3.5 rounded-xl transition-all duration-200',
              'bg-white dark:bg-[#1a1a1b] border border-slate-200/80 dark:border-white/10 shadow-xs',
              isClickable && 'cursor-pointer hover:shadow-md hover:-translate-y-0.5 active:translate-y-0',
              card.border
            )}
          >
            <div className="flex items-center justify-between w-full mb-2">
              <span className="text-[11.5px] font-medium text-slate-500 dark:text-gray-400 truncate">
                {card.label}
              </span>
              <div className={cn('w-7 h-7 rounded-lg flex items-center justify-center shrink-0', card.bgLight)}>
                <Icon
                  className={cn(
                    'w-4 h-4',
                    card.color,
                    card.animateIcon && 'animate-spin'
                  )}
                />
              </div>
            </div>
            <div className="text-xl font-bold text-slate-900 dark:text-white tracking-tight">
              {card.value}
            </div>
            <span className="text-[10.5px] text-slate-400 dark:text-gray-500 mt-1 truncate">
              {card.sublabel}
            </span>
          </button>
        );
      })}
    </div>
  );
};
