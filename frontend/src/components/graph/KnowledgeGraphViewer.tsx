import React, { useCallback, useRef, useState, useEffect } from 'react';
import ForceGraph2D, { ForceGraphMethods } from 'react-force-graph-2d';
import { KGNode, KGEdge } from '../../types';
import { ZoomIn, ZoomOut, Maximize, Brain } from 'lucide-react';

interface KnowledgeGraphViewerProps {
  nodes: KGNode[];
  edges: KGEdge[];
}

export function KnowledgeGraphViewer({ nodes, edges }: KnowledgeGraphViewerProps) {
  const graphRef = useRef<any>(null);
  const [dimensions, setDimensions] = useState({ width: 800, height: 600 });
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleResize = () => {
      if (containerRef.current) {
        setDimensions({
          width: containerRef.current.clientWidth,
          height: containerRef.current.clientHeight
        });
      }
    };

    window.addEventListener('resize', handleResize);
    handleResize();

    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const getNodeColor = (type: string) => {
    switch (type.toUpperCase()) {
      case 'CONCEPT': return '#6366f1'; // Indigo
      case 'ENTITY': return '#14b8a6'; // Teal
      case 'PRINCIPLE': return '#f59e0b'; // Amber
      case 'FORMULA': return '#ec4899'; // Pink
      case 'HISTORICAL_EVENT': return '#8b5cf6'; // Violet
      default: return '#94a3b8'; // Slate
    }
  };

  const getEdgeColor = (type: string) => {
    return 'rgba(200, 200, 200, 0.4)'; // Light gray, translucent
  };

  return (
    <div ref={containerRef} className="w-full h-full relative bg-slate-50 dark:bg-[#121212] flex flex-col">
      {nodes.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center text-slate-500">
           <Brain className="w-12 h-12 mb-4 text-slate-300 dark:text-slate-600" />
           <h3 className="text-lg font-bold text-slate-800 dark:text-gray-200">No Knowledge Graph Data</h3>
           <p className="text-sm">Upload documents to extract concepts and entities.</p>
        </div>
      ) : (
        <>
          <div className="absolute top-4 right-4 z-10 flex flex-col gap-2 bg-white/80 dark:bg-black/50 backdrop-blur-md p-1 rounded-xl shadow-lg border border-slate-200 dark:border-white/10">
             <button 
                onClick={() => graphRef.current?.zoom(graphRef.current.zoom() * 1.2, 400)}
                className="p-2 hover:bg-slate-100 dark:hover:bg-white/10 rounded-lg text-slate-600 dark:text-gray-300 transition-colors"
             >
                <ZoomIn className="w-5 h-5" />
             </button>
             <button 
                onClick={() => graphRef.current?.zoom(graphRef.current.zoom() / 1.2, 400)}
                className="p-2 hover:bg-slate-100 dark:hover:bg-white/10 rounded-lg text-slate-600 dark:text-gray-300 transition-colors"
             >
                <ZoomOut className="w-5 h-5" />
             </button>
             <button 
                onClick={() => graphRef.current?.zoomToFit(400)}
                className="p-2 hover:bg-slate-100 dark:hover:bg-white/10 rounded-lg text-slate-600 dark:text-gray-300 transition-colors"
             >
                <Maximize className="w-5 h-5" />
             </button>
          </div>
          
          <div className="absolute top-4 left-4 z-10 flex gap-2">
             <div className="flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 bg-white/80 dark:bg-black/50 backdrop-blur-md rounded-full border border-slate-200 dark:border-white/10 shadow-sm text-slate-700 dark:text-gray-300">
                <span className="w-2 h-2 rounded-full" style={{ backgroundColor: getNodeColor('CONCEPT') }} /> Concept
             </div>
             <div className="flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 bg-white/80 dark:bg-black/50 backdrop-blur-md rounded-full border border-slate-200 dark:border-white/10 shadow-sm text-slate-700 dark:text-gray-300">
                <span className="w-2 h-2 rounded-full" style={{ backgroundColor: getNodeColor('ENTITY') }} /> Entity
             </div>
             <div className="flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 bg-white/80 dark:bg-black/50 backdrop-blur-md rounded-full border border-slate-200 dark:border-white/10 shadow-sm text-slate-700 dark:text-gray-300">
                <span className="w-2 h-2 rounded-full" style={{ backgroundColor: getNodeColor('PRINCIPLE') }} /> Principle
             </div>
          </div>

          <ForceGraph2D
            ref={graphRef}
            width={dimensions.width}
            height={dimensions.height}
            graphData={{ nodes, links: edges.map(e => ({ source: e.sourceNodeId, target: e.targetNodeId, ...e })) }}
            nodeId="id"
            nodeLabel="label"
            nodeColor={(node: any) => getNodeColor(node.type)}
            nodeRelSize={6}
            linkColor={(link: any) => getEdgeColor(link.type)}
            linkWidth={1.5}
            linkDirectionalParticles={2}
            linkDirectionalParticleSpeed={d => 0.005}
            d3VelocityDecay={0.3}
            onNodeClick={(node: any) => {
               graphRef.current?.centerAt(node.x, node.y, 1000);
               graphRef.current?.zoom(4, 1000);
            }}
            nodeCanvasObject={(node: any, ctx, globalScale) => {
              const label = node.label;
              const fontSize = 12 / globalScale;
              ctx.font = `${fontSize}px Sans-Serif`;
              const textWidth = ctx.measureText(label).width;
              const bckgDimensions = [textWidth, fontSize].map(n => n + fontSize * 0.2); 

              ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
              ctx.fillRect(node.x - bckgDimensions[0] / 2, node.y - bckgDimensions[1] / 2, bckgDimensions[0], bckgDimensions[1]);

              ctx.textAlign = 'center';
              ctx.textBaseline = 'middle';
              ctx.fillStyle = getNodeColor(node.type);
              ctx.fillText(label, node.x, node.y);

              node.__bckgDimensions = bckgDimensions; // to re-use in nodePointerAreaPaint
            }}
            nodePointerAreaPaint={(node: any, color, ctx) => {
              ctx.fillStyle = color;
              const bckgDimensions = node.__bckgDimensions;
              bckgDimensions && ctx.fillRect(node.x - bckgDimensions[0] / 2, node.y - bckgDimensions[1] / 2, bckgDimensions[0], bckgDimensions[1]);
            }}
          />
        </>
      )}
    </div>
  );
}
