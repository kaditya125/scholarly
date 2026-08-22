/**
 * @file CustomWorkflowNode.tsx
 * @description Themed React Flow node component for Scholarly Automation Studio.
 */

import React, { memo } from 'react';
import { Handle, Position, NodeProps } from '@xyflow/react';
import {
  Zap,
  Play,
  Calendar,
  User,
  Brain,
  Award,
  BookOpen,
  HelpCircle,
  Sparkles,
  GitBranch,
  Filter,
  Database,
  Bell,
  Mail,
  MessageCircle,
  Clock,
  Settings
} from 'lucide-react';

const ICON_MAP: Record<string, React.ReactNode> = {
  Zap: <Zap className="w-4 h-4 text-amber-500" />,
  Play: <Play className="w-4 h-4 text-emerald-500" />,
  Calendar: <Calendar className="w-4 h-4 text-blue-500" />,
  User: <User className="w-4 h-4 text-indigo-500" />,
  Brain: <Brain className="w-4 h-4 text-purple-500" />,
  Award: <Award className="w-4 h-4 text-yellow-500" />,
  BookOpen: <BookOpen className="w-4 h-4 text-cyan-500" />,
  HelpCircle: <HelpCircle className="w-4 h-4 text-orange-500" />,
  Sparkles: <Sparkles className="w-4 h-4 text-rose-500" />,
  GitBranch: <GitBranch className="w-4 h-4 text-violet-500" />,
  Filter: <Filter className="w-4 h-4 text-teal-500" />,
  Database: <Database className="w-4 h-4 text-blue-400" />,
  Bell: <Bell className="w-4 h-4 text-sky-500" />,
  Mail: <Mail className="w-4 h-4 text-pink-500" />,
  MessageCircle: <MessageCircle className="w-4 h-4 text-green-500" />,
  Clock: <Clock className="w-4 h-4 text-slate-500" />
};

export const CustomWorkflowNode = memo(({ data, isConnectable, selected }: NodeProps) => {
  const isTrigger = data.category === 'Trigger' || (data.type as string)?.startsWith('TRIGGER_');
  const isCondition = data.type === 'CONDITION_IF';
  const icon = ICON_MAP[(data.icon as string) || ''] || <Settings className="w-4 h-4 text-slate-400" />;

  return (
    <div
      className={`min-w-[220px] rounded-xl border bg-white dark:bg-[#1E1F20] shadow-md transition-all ${
        selected
          ? 'border-indigo-500 ring-2 ring-indigo-500/20 shadow-lg'
          : 'border-slate-200 dark:border-white/10 hover:border-slate-300 dark:hover:border-white/20'
      }`}
    >
      {/* Target handle (top) for non-trigger nodes */}
      {!isTrigger && (
        <Handle
          type="target"
          position={Position.Top}
          isConnectable={isConnectable}
          className="!w-3 !h-3 !bg-slate-400 dark:!bg-slate-500 !border-2 !border-white dark:!border-[#1E1F20]"
        />
      )}

      {/* Header */}
      <div className="flex items-center gap-2.5 px-3.5 py-2.5 border-b border-slate-100 dark:border-white/5">
        <div className="p-1.5 rounded-lg bg-slate-100 dark:bg-white/5">{icon}</div>
        <div className="flex-1 min-w-0">
          <p className="text-xs font-semibold text-slate-900 dark:text-white truncate">
            {(data.label as string) || 'Node'}
          </p>
          <p className="text-[10px] text-slate-500 dark:text-slate-400 uppercase tracking-wider font-mono">
            {data.category as string}
          </p>
        </div>
      </div>

      {/* Body preview */}
      <div className="px-3.5 py-2 text-[11px] text-slate-600 dark:text-slate-300">
        {data.description ? (
          <p className="line-clamp-2 leading-relaxed">{data.description as string}</p>
        ) : (
          <p className="italic text-slate-400">Click to configure parameters</p>
        )}
      </div>

      {/* Output Handles */}
      {isCondition ? (
        <div className="flex justify-between items-center px-4 py-1.5 bg-slate-50 dark:bg-white/[0.02] border-t border-slate-100 dark:border-white/5 text-[10px] font-medium">
          <div className="relative flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
            <span>TRUE</span>
            <Handle
              type="source"
              position={Position.Bottom}
              id="true"
              style={{ left: '25%' }}
              isConnectable={isConnectable}
              className="!w-3 !h-3 !bg-emerald-500 !border-2 !border-white dark:!border-[#1E1F20]"
            />
          </div>
          <div className="relative flex items-center gap-1 text-rose-600 dark:text-rose-400">
            <span>FALSE</span>
            <Handle
              type="source"
              position={Position.Bottom}
              id="false"
              style={{ left: '75%' }}
              isConnectable={isConnectable}
              className="!w-3 !h-3 !bg-rose-500 !border-2 !border-white dark:!border-[#1E1F20]"
            />
          </div>
        </div>
      ) : (
        <Handle
          type="source"
          position={Position.Bottom}
          id="source"
          isConnectable={isConnectable}
          className="!w-3 !h-3 !bg-indigo-500 !border-2 !border-white dark:!border-[#1E1F20]"
        />
      )}
    </div>
  );
});

CustomWorkflowNode.displayName = 'CustomWorkflowNode';
