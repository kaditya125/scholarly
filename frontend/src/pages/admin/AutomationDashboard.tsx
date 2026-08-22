/**
 * @file AutomationDashboard.tsx
 * @description Main dashboard listing all workflows, performance metrics, and quick actions.
 */

import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Plus,
  Play,
  CheckCircle,
  Pause,
  Clock,
  Layers,
  ArrowRight,
  TrendingUp,
  Activity,
  Sliders
} from 'lucide-react';
import { automationsApi, WorkflowDefinition } from '../../lib/api/automations';

export default function AutomationDashboard() {
  const navigate = useNavigate();
  const [workflows, setWorkflows] = useState<WorkflowDefinition[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function fetchWorkflows() {
      try {
        setIsLoading(true);
        const list = await automationsApi.listWorkflows();
        setWorkflows(list);
      } catch (err) {
        console.error('Failed to load workflows:', err);
      } finally {
        setIsLoading(false);
      }
    }
    fetchWorkflows();
  }, []);

  const handleCreateNew = async () => {
    try {
      const created = await automationsApi.createWorkflow({
        name: 'New Learning Workflow',
        scope: 'ORGANIZATION'
      });
      navigate(`/admin/automations/${created.id}`);
    } catch (err) {
      console.error('Failed to create workflow:', err);
    }
  };

  const activeCount = workflows.filter(w => w.status === 'ACTIVE').length;
  const draftCount = workflows.filter(w => w.status === 'DRAFT').length;

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-[#131314] text-slate-900 dark:text-white p-8">
      {/* Header */}
      <div className="max-w-6xl mx-auto">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-black tracking-tight">Automation Studio</h1>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
              Event-driven closed-loop workflows for student learning, diagnostics, and recovery.
            </p>
          </div>
          <button
            onClick={handleCreateNew}
            className="flex items-center gap-2 px-4 py-2.5 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-500 rounded-xl shadow-md shadow-indigo-600/20 transition-all hover:scale-[1.02] active:scale-[0.98]"
          >
            <Plus className="w-4 h-4" />
            Create Workflow
          </button>
        </div>

        {/* Metrics Row */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
          <div className="p-4 rounded-2xl bg-white dark:bg-[#1E1F20] border border-slate-200 dark:border-white/10 shadow-sm flex items-center gap-4">
            <div className="p-3 rounded-xl bg-indigo-50 dark:bg-indigo-500/10 text-indigo-600 dark:text-indigo-400">
              <Layers className="w-5 h-5" />
            </div>
            <div>
              <p className="text-xs text-slate-500 dark:text-slate-400 font-medium">Total Workflows</p>
              <p className="text-xl font-bold">{workflows.length}</p>
            </div>
          </div>

          <div className="p-4 rounded-2xl bg-white dark:bg-[#1E1F20] border border-slate-200 dark:border-white/10 shadow-sm flex items-center gap-4">
            <div className="p-3 rounded-xl bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
              <CheckCircle className="w-5 h-5" />
            </div>
            <div>
              <p className="text-xs text-slate-500 dark:text-slate-400 font-medium">Active Automations</p>
              <p className="text-xl font-bold">{activeCount}</p>
            </div>
          </div>

          <div className="p-4 rounded-2xl bg-white dark:bg-[#1E1F20] border border-slate-200 dark:border-white/10 shadow-sm flex items-center gap-4">
            <div className="p-3 rounded-xl bg-amber-50 dark:bg-amber-500/10 text-amber-600 dark:text-amber-400">
              <Sliders className="w-5 h-5" />
            </div>
            <div>
              <p className="text-xs text-slate-500 dark:text-slate-400 font-medium">Drafts</p>
              <p className="text-xl font-bold">{draftCount}</p>
            </div>
          </div>

          <div className="p-4 rounded-2xl bg-white dark:bg-[#1E1F20] border border-slate-200 dark:border-white/10 shadow-sm flex items-center gap-4">
            <div className="p-3 rounded-xl bg-purple-50 dark:bg-purple-500/10 text-purple-600 dark:text-purple-400">
              <Activity className="w-5 h-5" />
            </div>
            <div>
              <p className="text-xs text-slate-500 dark:text-slate-400 font-medium">Execution Engine</p>
              <p className="text-sm font-bold text-emerald-500">Operational</p>
            </div>
          </div>
        </div>

        {/* Workflows List */}
        <div className="bg-white dark:bg-[#1E1F20] rounded-2xl border border-slate-200 dark:border-white/10 shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-200 dark:border-white/10 flex items-center justify-between">
            <h2 className="text-sm font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300">
              All Workflows
            </h2>
          </div>

          {isLoading ? (
            <div className="p-8 text-center text-sm text-slate-400">Loading workflows...</div>
          ) : workflows.length === 0 ? (
            <div className="p-12 text-center">
              <Layers className="w-8 h-8 text-slate-400 mx-auto mb-3" />
              <p className="text-sm font-semibold text-slate-700 dark:text-slate-300">
                No workflows created yet.
              </p>
              <p className="text-xs text-slate-500 mt-1 mb-4">
                Build your first closed-loop automation using the visual designer.
              </p>
              <button
                onClick={handleCreateNew}
                className="px-4 py-2 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-500 rounded-lg"
              >
                Create Workflow
              </button>
            </div>
          ) : (
            <div className="divide-y divide-slate-100 dark:divide-white/5">
              {workflows.map(wf => (
                <div
                  key={wf.id}
                  onClick={() => navigate(`/admin/automations/${wf.id}`)}
                  className="p-5 hover:bg-slate-50 dark:hover:bg-white/[0.02] cursor-pointer transition-colors flex items-center justify-between gap-4"
                >
                  <div className="flex items-center gap-4">
                    <div className="p-2.5 rounded-xl bg-slate-100 dark:bg-white/5 text-slate-600 dark:text-slate-300">
                      <Layers className="w-5 h-5" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-bold">{wf.name}</span>
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${
                            wf.status === 'ACTIVE'
                              ? 'bg-emerald-100 dark:bg-emerald-500/20 text-emerald-700 dark:text-emerald-300'
                              : 'bg-amber-100 dark:bg-amber-500/20 text-amber-700 dark:text-amber-300'
                          }`}
                        >
                          {wf.status} (v{wf.version})
                        </span>
                      </div>
                      <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                        Trigger: <span className="font-mono">{wf.trigger?.eventType || wf.trigger?.type}</span> · {wf.nodes?.length || 0} nodes
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        navigate(`/admin/automations/${wf.id}/executions`);
                      }}
                      className="px-3 py-1.5 text-xs font-semibold text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-white/5 hover:bg-slate-200 rounded-lg transition-colors"
                    >
                      History
                    </button>
                    <ArrowRight className="w-4 h-4 text-slate-400" />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
