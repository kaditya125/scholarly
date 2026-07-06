import React, { useCallback, useState, useRef, useEffect } from 'react';
import {
  ReactFlow,
  MiniMap,
  Controls,
  Background,
  useNodesState,
  useEdgesState,
  addEdge,
  Handle,
  Position,
  NodeProps,
  Panel,
  MarkerType,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import dagre from 'dagre';
import { Download, Search, Maximize, X } from 'lucide-react';
import * as htmlToImage from 'html-to-image';

// --- Custom Node Component ---
const CustomMindMapNode = ({ data, selected }: NodeProps) => {
  return (
    <div className={`px-4 py-3 shadow-md rounded-xl bg-white dark:bg-[#1e1e1e] border-2 transition-all ${selected ? 'border-teal-500 ring-4 ring-teal-500/20' : 'border-slate-200 dark:border-white/10 hover:border-teal-300'}`}>
      <Handle type="target" position={Position.Top} className="w-2 h-2 bg-slate-400" />
      
      <div className="flex flex-col">
        {data.category && (
          <span className="text-[10px] font-bold uppercase tracking-wider text-teal-600 dark:text-teal-400 mb-1">
            {data.category as string}
          </span>
        )}
        <div className="font-bold text-slate-800 dark:text-white text-sm break-words max-w-[200px]">
          {data.title as string}
        </div>
        {data.description && (
          <div className="text-xs text-slate-500 dark:text-slate-400 mt-1 max-w-[200px] leading-relaxed">
            {data.description as string}
          </div>
        )}
        
        {((data.importance as number) > 0 || (data.difficulty as number) > 0) && (
          <div className="flex gap-2 mt-2 pt-2 border-t border-slate-100 dark:border-white/5">
            {data.importance && <span className="text-[10px] text-amber-600 dark:text-amber-400 font-medium">Imp: {data.importance as number}/10</span>}
            {data.difficulty && <span className="text-[10px] text-rose-500 dark:text-rose-400 font-medium">Diff: {data.difficulty as number}/10</span>}
          </div>
        )}
      </div>

      <Handle type="source" position={Position.Bottom} className="w-2 h-2 bg-slate-400" />
    </div>
  );
};

const nodeTypes = {
  customMindMap: CustomMindMapNode,
};

const getLayoutedElements = (nodes: any[], edges: any[], direction = 'TB') => {
  const dagreGraph = new dagre.graphlib.Graph();
  dagreGraph.setDefaultEdgeLabel(() => ({}));

  const isHorizontal = direction === 'LR';
  dagreGraph.setGraph({ rankdir: direction, nodesep: 100, ranksep: 120 });

  nodes.forEach((node) => {
    dagreGraph.setNode(node.id, { width: 250, height: 150 });
  });

  edges.forEach((edge) => {
    dagreGraph.setEdge(edge.source, edge.target);
  });

  dagre.layout(dagreGraph);

  nodes.forEach((node) => {
    const nodeWithPosition = dagreGraph.node(node.id);
    node.targetPosition = isHorizontal ? Position.Left : Position.Top;
    node.sourcePosition = isHorizontal ? Position.Right : Position.Bottom;
    // We are shifting the dagre node position (anchor=center center) to the top left
    // so it matches the React Flow node anchor point (top left).
    node.position = {
      x: nodeWithPosition.x - 250 / 2,
      y: nodeWithPosition.y - 150 / 2,
    };
    return node;
  });

  return { nodes, edges };
};

export default function MindMapViewer({ assetData }: { assetData: any }) {
  const mindMapContent = assetData.content?.mindMap || assetData;
  const rawNodes = mindMapContent.nodes || [];
  const rawEdges = mindMapContent.edges || [];

  const initialNodes = rawNodes.map((n: any) => ({
    id: n.id,
    type: 'customMindMap',
    data: { 
      title: n.title || n.label, 
      description: n.description,
      category: n.category,
      importance: n.importance,
      difficulty: n.difficulty
    },
    position: { x: 0, y: 0 }
  }));

  const initialEdges = rawEdges.map((e: any, i: number) => ({
    id: `e${e.source}-${e.target}-${i}`,
    source: e.source,
    target: e.target,
    label: e.label || e.relationshipType,
    animated: true,
    style: { stroke: '#94a3b8', strokeWidth: 2 },
    markerEnd: {
      type: MarkerType.ArrowClosed,
      width: 20,
      height: 20,
      color: '#94a3b8',
    },
    labelBgPadding: [8, 4],
    labelBgBorderRadius: 4,
    labelBgStyle: { fill: '#ffffff', color: '#fff', fillOpacity: 0.8 },
    labelStyle: { fill: '#475569', fontWeight: 600, fontSize: 12 },
  }));

  const { nodes: layoutedNodes, edges: layoutedEdges } = getLayoutedElements(initialNodes, initialEdges);

  const [nodes, setNodes, onNodesChange] = useNodesState(layoutedNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(layoutedEdges);
  const [searchQuery, setSearchQuery] = useState('');
  
  const reactFlowWrapper = useRef<HTMLDivElement>(null);

  // Search highlighting
  useEffect(() => {
    if (!searchQuery.trim()) {
      setNodes((nds) => nds.map(n => ({ ...n, style: { opacity: 1 } })));
      return;
    }

    const query = searchQuery.toLowerCase();
    setNodes((nds) => nds.map((n) => {
      const title = String(n.data.title || '').toLowerCase();
      const desc = String(n.data.description || '').toLowerCase();
      const match = title.includes(query) || desc.includes(query);
      return {
        ...n,
        style: { opacity: match ? 1 : 0.2, transition: 'opacity 0.3s ease' }
      };
    }));
  }, [searchQuery, setNodes]);

  const onConnect = useCallback((params: any) => setEdges((eds) => addEdge(params, eds)), [setEdges]);

  const downloadImage = () => {
    if (reactFlowWrapper.current === null) return;
    const flowEl = reactFlowWrapper.current.querySelector('.react-flow__viewport') as HTMLElement;
    if (!flowEl) return;
    
    htmlToImage.toPng(reactFlowWrapper.current, { backgroundColor: '#f8fafc' })
      .then((dataUrl) => {
        const a = document.createElement('a');
        a.setAttribute('download', `${assetData.title || 'mindmap'}.png`);
        a.setAttribute('href', dataUrl);
        a.click();
      })
      .catch((err) => {
        console.error('Failed to export image', err);
      });
  };

  return (
    <div className="w-full h-[600px] border border-slate-200 dark:border-white/10 rounded-2xl overflow-hidden relative bg-slate-50 dark:bg-[#121212]" ref={reactFlowWrapper}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        nodeTypes={nodeTypes}
        fitView
        minZoom={0.1}
        className="bg-slate-50 dark:bg-[#121212]"
      >
        <Controls className="bg-white dark:bg-[#1e1e1e] border border-slate-200 dark:border-white/10 shadow-sm rounded-lg overflow-hidden fill-slate-700 dark:fill-slate-300" />
        <MiniMap 
          nodeColor={(node) => {
            return '#14b8a6'; // teal-500
          }}
          maskColor="rgba(0,0,0,0.1)"
          className="bg-white dark:bg-[#1e1e1e] border border-slate-200 dark:border-white/10 rounded-xl overflow-hidden shadow-sm"
        />
        <Background color="#94a3b8" gap={24} size={1} />
        
        <Panel position="top-right" className="flex gap-2">
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input 
              type="text" 
              placeholder="Search concepts..." 
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="pl-9 pr-4 py-2 bg-white dark:bg-[#1e1e1e] border border-slate-200 dark:border-white/10 rounded-xl text-sm outline-none focus:ring-2 focus:ring-teal-500/50 shadow-sm"
            />
            {searchQuery && (
              <button onClick={() => setSearchQuery('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                <X className="w-3 h-3" />
              </button>
            )}
          </div>
          <button 
            onClick={downloadImage}
            className="flex items-center gap-2 px-4 py-2 bg-white dark:bg-[#1e1e1e] hover:bg-slate-50 dark:hover:bg-white/5 border border-slate-200 dark:border-white/10 rounded-xl shadow-sm text-sm font-bold text-slate-700 dark:text-gray-200 transition-colors"
          >
            <Download className="w-4 h-4" /> Export
          </button>
        </Panel>
      </ReactFlow>
    </div>
  );
}
