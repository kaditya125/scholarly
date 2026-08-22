/**
 * @file ExecutionDetail.tsx
 * @description Detailed execution history and step-by-step timeline inspector for Scholarly Automation Studio.
 */

import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  CheckCircle,
  XCircle,
  Clock,
  ChevronDown,
  ChevronRight,
  Activity,
  Layers,
  Calendar
} from 'lucide-react';
import {
  automationsApi,
  WorkflowExecutionRecord,
  WorkflowNodeExecution
} from '../../lib/api/automations';

export default function ExecutionDetail() {
  const { workflowId, execId } = useParams<{ workflowId: string; execId?: string }>();
  const navigate = useNavigate();

  const [executions, setExecutions] = useState<WorkflowExecutionRecord[]>([]);
  const [selectedExecId, setSelectedExecId] = useState<string | null>(execId || null);
  const [selectedExecution, setSelectedExecution] = useState<WorkflowExecutionRecord | null>(null);
  const [nodeExecutions, setNodeExecutions] = useState<WorkflowNodeExecution[]>([]);
  const [expandedNodes, setExpandedNodes] = useState<Record<string, boolean>>({});
  const [isLoading, setIsLoading] = useState(true);

  // Load executions list
  useEffect(() => {
    async function loadExecutions() {
      if (!workflowId) return;
      try {
        setIsLoading(true);
        const list = await automationsApi.listExecutions(workflowId);
        setExecutions(list);
        if (!selectedExecId && list.length > 0) {
          setSelectedExecId(list[0].id);
        }
      } catch (err) {
        console.error('Failed to load executions:', err);
      } finally {
        setIsLoading(false);
      }
    }
    loadExecutions();
  }, [workflowId]);

  // Load specific execution detail
  useEffect(() => {
    async function loadDetail() {
      if (!selectedExecId) return;
      try {
        const data = await automationsApi.getExecutionDetail(selectedExecId);
        setSelectedExecution(data.execution);
        setNodeExecutions(data.nodeExecutions || []);
      } catch (err) {
        console.error('Failed to load execution detail:', err);
      }
    }
    loadDetail();
  }, [selectedExecId]);

  const toggleNode = (nodeId: string) => {
    setExpandedNodes(prev => ({
      ...prev,
      [nodeId]: !prev[nodeId]
    }));
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-[#131314] text-slate-900 dark:text-white p-8">
      <div className="max-w-6xl mx-auto">
        {/* Top Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <button
              onClick={() => navigate(`/admin/automations/${workflowId}`)}
              className="p-2 rounded-xl text-slate-500 hover:text-slate-800 dark:hover:text-white hover:bg-slate-200 dark:hover:bg-white/5 transition-colors"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div>
              <h1 className="text-xl font-bold">Execution Observability & Timeline</h1>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Workflow ID: <span className="font-mono">{workflowId}</span>
              </p>
            </div>
          </div>
        </div>

        {/* 2-Column Split View */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Left: Execution List */}
          <div className="bg-white dark:bg-[#1E1F20] rounded-2xl border border-slate-200 dark:border-white/10 shadow-sm overflow-hidden h-[750px] flex flex-col">
            <div className="p-4 border-b border-slate-200 dark:border-white/10">
              <h2 className="text-xs font-bold uppercase tracking-wider text-slate-500">
                Recent Runs ({executions.length})
              </h2>
            </div>
            <div className="flex-1 overflow-y-auto divide-y divide-slate-100 dark:divide-white/5">
              {executions.map(exec => (
                <div
                  key={exec.id}
                  onClick={() => setSelectedExecId(exec.id)}
                  className={`p-4 cursor-pointer transition-colors ${
                    selectedExecId === exec.id
                      ? 'bg-indigo-50/50 dark:bg-indigo-500/10 border-l-4 border-indigo-600'
                      : 'hover:bg-slate-50 dark:hover:bg-white/[0.02]'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-mono font-semibold truncate max-w-[150px]">
                      {exec.id}
                    </span>
                    <span
                      className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                        exec.status === 'COMPLETED'
                          ? 'bg-emerald-100 dark:bg-emerald-500/20 text-emerald-700 dark:text-emerald-300'
                          : exec.status === 'FAILED'
                          ? 'bg-rose-100 dark:bg-rose-500/20 text-rose-700 dark:text-rose-300'
                          : 'bg-amber-100 dark:bg-amber-500/20 text-amber-700 dark:text-amber-300'
                      }`}
                    >
                      {exec.status}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 text-[11px] text-slate-400 mt-2">
                    <Calendar className="w-3.5 h-3.5" />
                    <span>{new Date(exec.startedAt).toLocaleTimeString()}</span>
                    {exec.durationMs && <span>· {exec.durationMs}ms</span>}
                  </div>
                </div>
              ))}
              {executions.length === 0 && !isLoading && (
                <div className="p-8 text-center text-xs text-slate-400">
                  No executions recorded for this workflow yet.
                </div>
              )}
            </div>
          </div>

          {/* Right: Step-by-Step Execution Timeline */}
          <div className="md:col-span-2 bg-white dark:bg-[#1E1F20] rounded-2xl border border-slate-200 dark:border-white/10 shadow-sm overflow-hidden h-[750px] flex flex-col">
            <div className="p-4 border-b border-slate-200 dark:border-white/10 flex items-center justify-between">
              <div>
                <h2 className="text-xs font-bold uppercase tracking-wider text-slate-500">
                  Execution Trace
                </h2>
                <p className="text-sm font-bold font-mono mt-0.5">
                  {selectedExecution?.id || 'Select a run'}
                </p>
              </div>
              {selectedExecution && (
                <div className="flex items-center gap-2">
                  <span className="text-xs text-slate-500">
                    Duration: <strong>{selectedExecution.durationMs || 0}ms</strong>
                  </span>
                  <span
                    className={`px-2.5 py-1 rounded-lg text-xs font-bold uppercase ${
                      selectedExecution.status === 'COMPLETED'
                        ? 'bg-emerald-100 dark:bg-emerald-500/20 text-emerald-700 dark:text-emerald-300'
                        : selectedExecution.status === 'FAILED'
                        ? 'bg-rose-100 dark:bg-rose-500/20 text-rose-700 dark:text-rose-300'
                        : 'bg-amber-100 dark:bg-amber-500/20 text-amber-700 dark:text-amber-300'
                    }`}
                  >
                    {selectedExecution.status}
                  </span>
                </div>
              )}
            </div>

            {/* Timeline Steps */}
            <div className="flex-1 overflow-y-auto p-6 space-y-4">
              {nodeExecutions.map((node, index) => {
                const isExpanded = !!expandedNodes[node.nodeId];
                return (
                  <div
                    key={node.id}
                    className="rounded-xl border border-slate-200 dark:border-white/10 overflow-hidden bg-slate-50/50 dark:bg-white/[0.01]"
                  >
                    <div
                      onClick={() => toggleNode(node.nodeId)}
                      className="p-3.5 flex items-center justify-between cursor-pointer hover:bg-slate-100/50 dark:hover:bg-white/[0.03] transition-colors"
                    >
                      <div className="flex items-center gap-3">
                        <span className="w-5 h-5 rounded-full bg-slate-200 dark:bg-white/10 text-[10px] font-bold flex items-center justify-center">
                          {index + 1}
                        </span>
                        {node.status === 'COMPLETED' ? (
                          <CheckCircle className="w-4 h-4 text-emerald-500" />
                        ) : node.status === 'FAILED' ? (
                          <XCircle className="w-4 h-4 text-rose-500" />
                        ) : (
                          <Clock className="w-4 h-4 text-amber-500" />
                        )}
                        <div>
                          <p className="text-xs font-bold">{node.nodeId}</p>
                          <p className="text-[10px] font-mono text-slate-400 uppercase">
                            {node.nodeType}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="text-[11px] text-slate-400 font-mono">
                          {node.durationMs || 0}ms
                        </span>
                        {isExpanded ? (
                          <ChevronDown className="w-4 h-4 text-slate-400" />
                        ) : (
                          <ChevronRight className="w-4 h-4 text-slate-400" />
                        )}
                      </div>
                    </div>

                    {/* Collapsible Input/Output Details */}
                    {isExpanded && (
                      <div className="p-4 border-t border-slate-200 dark:border-white/10 bg-white dark:bg-[#18191A] space-y-3 text-xs">
                        <div>
                          <p className="font-semibold text-slate-500 uppercase tracking-wider text-[10px] mb-1">
                            Output Payload
                          </p>
                          <pre className="p-3 rounded-lg bg-slate-900 text-slate-100 font-mono text-[11px] overflow-x-auto">
                            {JSON.stringify(node.output, null, 2) || 'No output recorded'}
                          </pre>
                        </div>
                        {node.error && (
                          <div>
                            <p className="font-semibold text-rose-500 uppercase tracking-wider text-[10px] mb-1">
                              Error Message
                            </p>
                            <div className="p-3 rounded-lg bg-rose-500/10 text-rose-600 dark:text-rose-400 text-xs font-mono">
                              {node.error.message}
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}

              {nodeExecutions.length === 0 && (
                <div className="text-center py-16 text-slate-400 text-sm">
                  Select a workflow run from the left panel to inspect step execution.
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
