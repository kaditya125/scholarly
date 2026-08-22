/**
 * @file AutomationStudio.tsx
 * @description Visual Workflow Studio designer with React Flow for Scholarly Automation Studio.
 */

import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ReactFlow,
  Controls,
  Background,
  applyNodeChanges,
  applyEdgeChanges,
  addEdge,
  Node,
  Edge,
  Connection,
  NodeChange,
  EdgeChange,
  BackgroundVariant
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import {
  Save,
  Play,
  CheckCircle,
  Pause,
  ArrowLeft,
  Loader2,
  Sparkles,
  History
} from 'lucide-react';
import { CustomWorkflowNode } from '../../components/automation/nodes/CustomWorkflowNode';
import { NodeLibrary } from '../../components/automation/NodeLibrary';
import { NodeInspector } from '../../components/automation/NodeInspector';
import {
  automationsApi,
  WorkflowDefinition,
  NodeCatalogItem,
  WorkflowNodeConfig
} from '../../lib/api/automations';

const nodeTypes = {
  custom: CustomWorkflowNode
};

export default function AutomationStudio() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [workflow, setWorkflow] = useState<WorkflowDefinition | null>(null);
  const [catalog, setCatalog] = useState<NodeCatalogItem[]>([]);
  const [nodes, setNodes] = useState<Node[]>([]);
  const [edges, setEdges] = useState<Edge[]>([]);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isSimulating, setIsSimulating] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  // Load catalog and workflow
  useEffect(() => {
    async function loadData() {
      try {
        setIsLoading(true);
        const [cat, wf] = await Promise.all([
          automationsApi.getNodeCatalog(),
          id ? automationsApi.getWorkflow(id) : null
        ]);
        setCatalog(cat);

        if (wf) {
          setWorkflow(wf);
          setNodes(
            wf.nodes.map(n => ({
              id: n.id,
              type: 'custom',
              position: n.position || { x: 100, y: 100 },
              data: {
                label: n.label,
                category: n.category,
                type: n.type,
                config: n.config
              }
            }))
          );
          setEdges(
            wf.edges.map(e => ({
              id: e.id,
              source: e.sourceNodeId,
              target: e.targetNodeId,
              sourceHandle: e.sourceHandle,
              animated: true
            }))
          );
        }
      } catch (err: any) {
        console.error('Failed to load automation data:', err);
      } finally {
        setIsLoading(false);
      }
    }
    loadData();
  }, [id]);

  const onNodesChange = useCallback(
    (changes: NodeChange[]) => setNodes(nds => applyNodeChanges(changes, nds)),
    []
  );

  const onEdgesChange = useCallback(
    (changes: EdgeChange[]) => setEdges(eds => applyEdgeChanges(changes, eds)),
    []
  );

  const onConnect = useCallback(
    (params: Connection) =>
      setEdges(eds => addEdge({ ...params, animated: true }, eds)),
    []
  );

  const handleAddNode = (item: NodeCatalogItem) => {
    const newNodeId = `node_${Date.now()}`;
    const newNode: Node = {
      id: newNodeId,
      type: 'custom',
      position: { x: 300 + Math.random() * 50, y: 200 + Math.random() * 50 },
      data: {
        label: item.label,
        category: item.category,
        type: item.type,
        icon: item.icon,
        description: item.description,
        config: {}
      }
    };
    setNodes(nds => [...nds, newNode]);
    setSelectedNodeId(newNodeId);
  };

  const handleSave = async () => {
    if (!workflow) return;
    try {
      setIsSaving(true);
      const payloadNodes: WorkflowNodeConfig[] = nodes.map(n => ({
        id: n.id,
        type: n.data.type as string,
        label: n.data.label as string,
        category: n.data.category as any,
        position: n.position,
        config: (n.data.config as Record<string, unknown>) || {}
      }));

      const payloadEdges = edges.map(e => ({
        id: e.id,
        sourceNodeId: e.source,
        targetNodeId: e.target,
        sourceHandle: e.sourceHandle || undefined
      }));

      const updated = await automationsApi.updateWorkflow(workflow.id, {
        nodes: payloadNodes,
        edges: payloadEdges
      });
      setWorkflow(updated);
      setStatusMessage('Draft saved successfully.');
      setTimeout(() => setStatusMessage(null), 3000);
    } catch (err: any) {
      console.error('Failed to save draft:', err);
      setStatusMessage('Failed to save draft.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleActivate = async () => {
    if (!workflow) return;
    try {
      await handleSave();
      const res = await automationsApi.activateWorkflow(workflow.id);
      setWorkflow(res.workflow);
      setStatusMessage(`Workflow activated (Version ${res.workflow.version})!`);
      setTimeout(() => setStatusMessage(null), 4000);
    } catch (err: any) {
      console.error('Failed to activate workflow:', err);
      setStatusMessage('Activation failed. Check validation errors.');
    }
  };

  const handleRunSimulation = async () => {
    if (!workflow) return;
    try {
      setIsSimulating(true);
      await handleSave();
      const exec = await automationsApi.testWorkflow(workflow.id);
      setStatusMessage(`Simulation finished (${exec.status}). Check executions tab.`);
      setTimeout(() => setStatusMessage(null), 5000);
    } catch (err: any) {
      console.error('Simulation failed:', err);
      setStatusMessage('Simulation failed.');
    } finally {
      setIsSimulating(false);
    }
  };

  const selectedNode = nodes.find(n => n.id === selectedNodeId);
  const selectedNodeConfig: WorkflowNodeConfig | null = selectedNode
    ? {
        id: selectedNode.id,
        type: selectedNode.data.type as string,
        label: selectedNode.data.label as string,
        category: selectedNode.data.category as any,
        position: selectedNode.position,
        config: (selectedNode.data.config as Record<string, unknown>) || {}
      }
    : null;

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-[#131314]">
        <Loader2 className="w-8 h-8 text-indigo-500 animate-spin" />
      </div>
    );
  }

  return (
    <div className="h-screen w-screen flex flex-col bg-slate-100 dark:bg-[#131314] overflow-hidden">
      {/* Top Navigation Bar */}
      <div className="h-14 px-4 bg-white dark:bg-[#18191A] border-b border-slate-200 dark:border-white/10 flex items-center justify-between z-10 shadow-sm">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate('/admin/automations')}
            className="p-1.5 rounded-lg text-slate-500 hover:text-slate-800 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-white/5 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-sm font-bold text-slate-900 dark:text-white">
                {workflow?.name || 'Automation Studio'}
              </h1>
              <span
                className={`px-2 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wider ${
                  workflow?.status === 'ACTIVE'
                    ? 'bg-emerald-100 dark:bg-emerald-500/20 text-emerald-700 dark:text-emerald-300'
                    : 'bg-amber-100 dark:bg-amber-500/20 text-amber-700 dark:text-amber-300'
                }`}
              >
                {workflow?.status || 'DRAFT'} (v{workflow?.version || 1})
              </span>
            </div>
          </div>
        </div>

        {/* Status Toast */}
        {statusMessage && (
          <div className="text-xs px-3 py-1 bg-indigo-50 dark:bg-indigo-500/20 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-500/30 rounded-lg animate-fade-in">
            {statusMessage}
          </div>
        )}

        {/* Actions */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => navigate(`/admin/automations/${workflow?.id}/executions`)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-200 bg-slate-100 dark:bg-white/5 hover:bg-slate-200 dark:hover:bg-white/10 rounded-lg transition-colors"
          >
            <History className="w-4 h-4" />
            History
          </button>
          <button
            onClick={handleRunSimulation}
            disabled={isSimulating}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-500/10 hover:bg-indigo-100 dark:hover:bg-indigo-500/20 rounded-lg transition-colors"
          >
            <Play className="w-3.5 h-3.5" />
            {isSimulating ? 'Simulating...' : 'Test Simulation'}
          </button>
          <button
            onClick={handleSave}
            disabled={isSaving}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-700 dark:text-slate-200 bg-white dark:bg-white/10 border border-slate-300 dark:border-white/10 hover:bg-slate-50 dark:hover:bg-white/15 rounded-lg transition-colors"
          >
            <Save className="w-3.5 h-3.5" />
            Save Draft
          </button>
          {workflow?.status !== 'ACTIVE' ? (
            <button
              onClick={handleActivate}
              className="flex items-center gap-1.5 px-4 py-1.5 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-500 rounded-lg shadow-sm transition-colors"
            >
              <CheckCircle className="w-4 h-4" />
              Activate
            </button>
          ) : (
            <button
              onClick={async () => {
                if (workflow) {
                  const updated = await automationsApi.pauseWorkflow(workflow.id);
                  setWorkflow(updated);
                }
              }}
              className="flex items-center gap-1.5 px-4 py-1.5 text-xs font-bold text-amber-800 dark:text-amber-200 bg-amber-100 dark:bg-amber-500/20 hover:bg-amber-200 rounded-lg transition-colors"
            >
              <Pause className="w-4 h-4" />
              Pause
            </button>
          )}
        </div>
      </div>

      {/* Main Workspace Layout */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left: Node Library */}
        <NodeLibrary catalog={catalog} onAddNode={handleAddNode} />

        {/* Center: Interactive React Flow Canvas */}
        <div className="flex-1 h-full relative">
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            nodeTypes={nodeTypes}
            onNodeClick={(_event, node) => setSelectedNodeId(node.id)}
            onPaneClick={() => setSelectedNodeId(null)}
            fitView
          >
            <Background color="#94a3b8" gap={16} variant={BackgroundVariant.Dots} />
            <Controls className="!bg-white dark:!bg-[#1E1F20] !border-slate-200 dark:!border-white/10 !shadow-lg" />
          </ReactFlow>
        </div>

        {/* Right: Node Inspector Drawer */}
        <NodeInspector
          selectedNode={selectedNodeConfig}
          onUpdateConfig={(nodeId, newConfig) => {
            setNodes(nds =>
              nds.map(n =>
                n.id === nodeId
                  ? { ...n, data: { ...n.data, config: newConfig } }
                  : n
              )
            );
          }}
          onDeleteNode={nodeId => {
            setNodes(nds => nds.filter(n => n.id !== nodeId));
            setEdges(eds => eds.filter(e => e.source !== nodeId && e.target !== nodeId));
            setSelectedNodeId(null);
          }}
          onClose={() => setSelectedNodeId(null)}
        />
      </div>
    </div>
  );
}
