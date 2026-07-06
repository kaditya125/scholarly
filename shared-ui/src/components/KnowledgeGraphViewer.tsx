import { useCallback, useRef, useState, useEffect, useMemo } from 'react';
import ForceGraph2D from 'react-force-graph-2d';
import type { KGNode, KGEdge } from '../types';
import { ZoomIn, ZoomOut, Maximize, Brain, Search, X, BookOpen, Layers, Zap, GraduationCap, Target, ChevronRight, Sparkles, Activity, Link as LinkIcon } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface KnowledgeGraphViewerProps {
  nodes: KGNode[];
  edges: KGEdge[];
}

// Extend KGNode locally for UI mocked properties
interface EnhancedKGNode extends KGNode {
  mastery?: number;
  difficulty?: 'Beginner' | 'Intermediate' | 'Advanced';
  priority?: 'High' | 'Medium' | 'Low';
  x?: number;
  y?: number;
  __bckgDimensions?: [number, number];
}

export function KnowledgeGraphViewer({ nodes, edges }: KnowledgeGraphViewerProps) {
  const graphRef = useRef<any>(null);
  const [dimensions, setDimensions] = useState({ width: 800, height: 600 });
  const containerRef = useRef<HTMLDivElement>(null);
  
  const [activeNode, setActiveNode] = useState<EnhancedKGNode | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [isLearningPathView, setIsLearningPathView] = useState(false);

  // Enhance nodes with mock data for UI requirements if not present
  const enhancedNodes = useMemo(() => {
    return nodes.map(node => {
      // Deterministic random-like values based on ID string length or char codes
      const hash = node.id.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
      return {
        ...node,
        mastery: (node as any).mastery ?? (hash % 100),
        difficulty: (node as any).difficulty ?? (['Beginner', 'Intermediate', 'Advanced'][hash % 3]),
        priority: (node as any).priority ?? (['Low', 'Medium', 'High'][(hash + 1) % 3])
      } as EnhancedKGNode;
    });
  }, [nodes]);

  const graphData = useMemo(() => ({
    nodes: enhancedNodes,
    links: edges.map(e => ({ ...e, source: e.sourceNodeId, target: e.targetNodeId }))
  }), [enhancedNodes, edges]);

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

  const getEdgeColor = () => {
    return document.documentElement.classList.contains('dark') 
      ? 'rgba(99, 102, 241, 0.2)' // Subtle indigo for dark mode
      : 'rgba(99, 102, 241, 0.3)'; // Slightly stronger indigo for light mode
  };

  // Analytics
  const totalConcepts = enhancedNodes.length;
  const masteredCount = enhancedNodes.filter(n => n.mastery! >= 80).length;
  const revisionPending = totalConcepts - masteredCount;

  // Search logic
  const searchRegex = useMemo(() => {
    if (!searchQuery.trim()) return null;
    return new RegExp(searchQuery, 'i');
  }, [searchQuery]);

  const handleNodeClick = useCallback((node: any) => {
    setActiveNode(node);
    if (graphRef.current) {
      const currentZoom = graphRef.current.zoom();
      graphRef.current.centerAt(node.x, node.y, 800);
      graphRef.current.zoom(Math.max(currentZoom, 2.5), 800);
    }
  }, []);

  // Configure Physics
  useEffect(() => {
    if (graphRef.current) {
      // Push nodes apart more for a cleaner "breathed out" look
      graphRef.current.d3Force('charge')?.strength(-350)?.distanceMax(400);
      // Encourage edges to be a bit longer
      graphRef.current.d3Force('link')?.distance(80);
    }
  }, [graphData]);

  // Prerequisites based on edges targeting this node
  const getPrerequisites = (nodeId: string) => {
    const prereqEdges = edges.filter(e => e.targetNodeId === nodeId);
    return prereqEdges
      .map(e => enhancedNodes.find(n => n.id === e.sourceNodeId))
      .filter(Boolean) as EnhancedKGNode[];
  };

  // Canvas drawing optimization
  const paintNode = useCallback((node: any, ctx: CanvasRenderingContext2D, globalScale: number) => {
    const isHighlighted = searchRegex ? searchRegex.test(node.label || '') : false;
    const isDimmed = searchRegex && !isHighlighted;
    const isSelected = activeNode?.id === node.id;
    
    const label = node.label || node.concept || node.id || 'Unknown';
    const fontSize = isSelected || isHighlighted ? 14 / globalScale : 12 / globalScale;
    ctx.font = `${isSelected ? 'bold ' : ''}${fontSize}px Inter, system-ui, sans-serif`;
    const textWidth = ctx.measureText(label).width;
    const bckgDimensions = [textWidth, fontSize].map(n => n + fontSize * 0.4); 

    // Draw mastery ring if Learning Path view
    if (isLearningPathView && !isDimmed) {
      const radius = Math.max(...bckgDimensions) / 2 + 4/globalScale;
      
      // Background track
      ctx.beginPath();
      ctx.arc(node.x, node.y, radius, 0, 2 * Math.PI, false);
      ctx.lineWidth = 2 / globalScale;
      ctx.strokeStyle = document.documentElement.classList.contains('dark') ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)';
      ctx.stroke();
      
      const mastery = node.mastery || 0;
      if (mastery > 0) {
        ctx.beginPath();
        const startAngle = -Math.PI / 2;
        const endAngle = startAngle + (mastery / 100) * 2 * Math.PI;
        ctx.arc(node.x, node.y, radius, startAngle, endAngle, false);
        ctx.lineWidth = 2.5 / globalScale;
        ctx.strokeStyle = mastery >= 80 ? '#22c55e' : mastery >= 40 ? '#eab308' : '#ef4444';
        ctx.lineCap = 'round';
        ctx.stroke();
      }
    }

    // Node Background
    ctx.fillStyle = isSelected 
      ? (document.documentElement.classList.contains('dark') ? 'rgba(30, 41, 59, 1)' : 'rgba(255, 255, 255, 1)')
      : (document.documentElement.classList.contains('dark') ? 'rgba(15, 23, 42, 0.9)' : 'rgba(255, 255, 255, 0.9)');
    
    // Glowing shadow for premium feel
    ctx.shadowColor = isSelected || isHighlighted ? getNodeColor(node.type) : 'transparent';
    ctx.shadowBlur = isSelected || isHighlighted ? 15 / globalScale : 0;
    
    // Draw Pill
    ctx.beginPath();
    ctx.roundRect(
      node.x - bckgDimensions[0] / 2, 
      node.y - bckgDimensions[1] / 2, 
      bckgDimensions[0], 
      bckgDimensions[1],
      8 / globalScale
    );
    ctx.fill();

    // Reset shadow for stroke & text
    ctx.shadowBlur = 0;

    // Add border for selected or highlighted
    if (isSelected || isHighlighted) {
      ctx.strokeStyle = getNodeColor(node.type);
      ctx.lineWidth = (isSelected ? 2 : 1) / globalScale;
      ctx.stroke();
    } else {
      ctx.strokeStyle = document.documentElement.classList.contains('dark') ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)';
      ctx.lineWidth = 1 / globalScale;
      ctx.stroke();
    }

    // Text
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    
    if (isDimmed) {
      ctx.fillStyle = document.documentElement.classList.contains('dark') ? 'rgba(148, 163, 184, 0.2)' : 'rgba(148, 163, 184, 0.3)';
    } else {
      ctx.fillStyle = getNodeColor(node.type);
    }
    
    ctx.fillText(label, node.x, node.y);
    node.__bckgDimensions = bckgDimensions;
  }, [activeNode, searchRegex, isLearningPathView]);

  return (
    <div ref={containerRef} className="w-full h-full relative bg-slate-50 dark:bg-[#0a0a0a] flex flex-col overflow-hidden font-sans">
      {nodes.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center text-slate-500 relative z-10">
           <Brain className="w-16 h-16 mb-4 text-slate-300 dark:text-slate-700 animate-pulse" />
           <h3 className="text-xl font-semibold text-slate-800 dark:text-gray-200">Knowledge Graph Empty</h3>
           <p className="text-sm mt-2 max-w-md text-center text-slate-500 dark:text-slate-400">Upload documents or add notes to automatically extract concepts, entities, and their relationships.</p>
        </div>
      ) : (
        <>
          {/* Top Control Bar */}
          <div className="absolute top-4 left-4 right-4 z-10 flex items-center justify-between pointer-events-none">
            {/* Analytics & Search */}
            <div className="flex items-center gap-4 pointer-events-auto">
              <div className="flex items-center gap-4 bg-white/80 dark:bg-slate-900/80 backdrop-blur-md px-4 py-2.5 rounded-2xl border border-slate-200 dark:border-white/10 shadow-sm text-sm font-medium text-slate-700 dark:text-slate-300">
                <div className="flex items-center gap-2">
                  <Layers className="w-4 h-4 text-indigo-500" />
                  <span>Concepts: <span className="font-bold text-slate-900 dark:text-white">{totalConcepts}</span></span>
                </div>
                <div className="w-px h-4 bg-slate-300 dark:bg-slate-700" />
                <div className="flex items-center gap-2">
                  <Zap className="w-4 h-4 text-emerald-500" />
                  <span>Mastered: <span className="font-bold text-slate-900 dark:text-white">{masteredCount}</span></span>
                </div>
                <div className="w-px h-4 bg-slate-300 dark:bg-slate-700" />
                <div className="flex items-center gap-2">
                  <Activity className="w-4 h-4 text-amber-500" />
                  <span>Revision: <span className="font-bold text-slate-900 dark:text-white">{revisionPending}</span></span>
                </div>
              </div>

              <div className="relative group">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-indigo-500 transition-colors" />
                <input
                  type="text"
                  placeholder="Search concepts..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="bg-white/80 dark:bg-slate-900/80 backdrop-blur-md pl-9 pr-4 py-2.5 rounded-2xl border border-slate-200 dark:border-white/10 shadow-sm text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/50 w-64 text-slate-900 dark:text-white placeholder-slate-400 transition-all"
                />
              </div>
            </div>

            {/* View Toggles & Zoom Controls */}
            <div className="flex items-center gap-3 pointer-events-auto">
              <button
                onClick={() => setIsLearningPathView(!isLearningPathView)}
                className={`flex items-center gap-2 px-4 py-2.5 rounded-2xl border backdrop-blur-md text-sm font-medium transition-all ${
                  isLearningPathView 
                    ? 'bg-indigo-50 dark:bg-indigo-500/20 border-indigo-200 dark:border-indigo-500/30 text-indigo-700 dark:text-indigo-300'
                    : 'bg-white/80 dark:bg-slate-900/80 border-slate-200 dark:border-white/10 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'
                }`}
              >
                <Target className="w-4 h-4" />
                Learning Path View
              </button>

              <div className="flex items-center bg-white/80 dark:bg-slate-900/80 backdrop-blur-md p-1 rounded-2xl border border-slate-200 dark:border-white/10 shadow-sm">
                <button onClick={() => graphRef.current?.zoom(graphRef.current.zoom() * 1.2, 400)} className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl text-slate-600 dark:text-slate-300 transition-colors">
                  <ZoomIn className="w-4 h-4" />
                </button>
                <button onClick={() => graphRef.current?.zoom(graphRef.current.zoom() / 1.2, 400)} className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl text-slate-600 dark:text-slate-300 transition-colors">
                  <ZoomOut className="w-4 h-4" />
                </button>
                <button onClick={() => graphRef.current?.zoomToFit(400)} className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl text-slate-600 dark:text-slate-300 transition-colors">
                  <Maximize className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>

          <div className="absolute inset-0 z-0 bg-[radial-gradient(circle_at_center,rgba(99,102,241,0.03)_0%,transparent_100%)]">
            {/* Subtle Dot Grid Background */}
            <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjQiIGhlaWdodD0iMjQiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PGNpcmNsZSBjeD0iMSIgY3k9IjEiIHI9IjEiIGZpbGw9InJnYmEoMTQ4LCAxNjMsIDE4NCwgMC4xNSkiLz48L3N2Zz4=')] [mask-image:radial-gradient(ellipse_at_center,black_40%,transparent_100%)] pointer-events-none" />
            
            <ForceGraph2D
              ref={graphRef}
              width={dimensions.width}
              height={dimensions.height}
              graphData={graphData}
              nodeId="id"
              nodeRelSize={6}
              linkColor={(_link: any) => getEdgeColor()}
              linkWidth={(_link: any) => (isLearningPathView ? 2 : 1)}
              linkCurvature={0.15}
              linkDirectionalParticles={2}
              linkDirectionalParticleSpeed={0.005}
              linkDirectionalParticleWidth={2.5}
              linkDirectionalParticleColor={(link: any) => isLearningPathView ? '#6366f1' : document.documentElement.classList.contains('dark') ? 'rgba(99, 102, 241, 0.4)' : 'rgba(99, 102, 241, 0.6)'}
              d3VelocityDecay={0.2}
              onNodeClick={handleNodeClick}
              onBackgroundClick={() => setActiveNode(null)}
              nodeCanvasObject={paintNode}
              nodePointerAreaPaint={(node: any, color, ctx) => {
                ctx.fillStyle = color;
                const bckgDimensions = node.__bckgDimensions;
                if (bckgDimensions) {
                  ctx.beginPath();
                  ctx.roundRect(node.x - bckgDimensions[0] / 2, node.y - bckgDimensions[1] / 2, bckgDimensions[0], bckgDimensions[1], 4);
                  ctx.fill();
                }
              }}
            />
          </div>

          {/* Node Sidebar */}
          <AnimatePresence>
            {activeNode && (
              <motion.div
                initial={{ x: 400, opacity: 0 }}
                animate={{ x: 0, opacity: 1 }}
                exit={{ x: 400, opacity: 0 }}
                transition={{ type: "spring", bounce: 0, duration: 0.4 }}
                className="absolute top-4 right-4 bottom-4 w-[340px] bg-white/95 dark:bg-[#111111]/95 backdrop-blur-xl border border-slate-200 dark:border-white/10 rounded-3xl shadow-2xl flex flex-col overflow-hidden z-20"
              >
                {/* Header */}
                <div className="p-5 border-b border-slate-200 dark:border-white/10 flex items-start justify-between bg-slate-50/50 dark:bg-white/[0.02]">
                  <div className="pr-4">
                    <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold mb-3 border" style={{ 
                      backgroundColor: `${getNodeColor(activeNode.type || 'concept')}15`,
                      color: getNodeColor(activeNode.type || 'concept'),
                      borderColor: `${getNodeColor(activeNode.type || 'concept')}30`
                    }}>
                      <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: getNodeColor(activeNode.type || 'concept') }} />
                      {(activeNode.type || 'concept').replace('_', ' ')}
                    </div>
                    <h2 className="text-xl font-bold text-slate-900 dark:text-white leading-tight">
                      {activeNode.label || activeNode.concept || activeNode.id}
                    </h2>
                  </div>
                  <button 
                    onClick={() => setActiveNode(null)}
                    className="p-2 hover:bg-slate-200 dark:hover:bg-white/10 rounded-full text-slate-500 dark:text-slate-400 transition-colors"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                {/* Scrollable Content */}
                <div className="flex-1 overflow-y-auto p-5 space-y-6 custom-scrollbar">
                  {/* Definition */}
                  <div>
                    <h3 className="text-sm font-semibold text-slate-900 dark:text-white mb-2 flex items-center gap-2">
                      <BookOpen className="w-4 h-4 text-slate-400" />
                      Definition
                    </h3>
                    <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed bg-slate-50 dark:bg-white/[0.03] border border-slate-100 dark:border-white/5 p-3.5 rounded-2xl">
                      {activeNode.definition || "No definition available for this concept."}
                    </p>
                  </div>

                  {/* Learning Stats */}
                  <div className="space-y-4">
                    <h3 className="text-sm font-semibold text-slate-900 dark:text-white flex items-center gap-2">
                      <Activity className="w-4 h-4 text-slate-400" />
                      Learning Status
                    </h3>
                    
                    <div className="bg-slate-50 dark:bg-white/[0.03] border border-slate-100 dark:border-white/5 p-4 rounded-2xl space-y-4">
                      {/* Mastery Bar */}
                      <div>
                        <div className="flex justify-between items-end mb-2">
                          <span className="text-xs font-medium text-slate-500 dark:text-slate-400">Mastery Level</span>
                          <span className="text-sm font-bold text-slate-900 dark:text-white">{activeNode.mastery || 0}%</span>
                        </div>
                        <div className="h-2 w-full bg-slate-200 dark:bg-white/10 rounded-full overflow-hidden">
                          <motion.div 
                            initial={{ width: 0 }}
                            animate={{ width: `${activeNode.mastery || 0}%` }}
                            transition={{ duration: 0.8, ease: "easeOut" }}
                            className={`h-full rounded-full ${
                              (activeNode.mastery || 0) >= 80 ? 'bg-gradient-to-r from-emerald-500 to-emerald-400' :
                              (activeNode.mastery || 0) >= 40 ? 'bg-gradient-to-r from-amber-500 to-amber-400' :
                              'bg-gradient-to-r from-rose-500 to-rose-400'
                            }`}
                          />
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-3">
                        <div className="bg-white dark:bg-[#111111] p-2.5 rounded-xl border border-slate-200 dark:border-white/10">
                          <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 block mb-1">Difficulty</span>
                          <span className={`text-sm font-medium ${
                            activeNode.difficulty === 'Advanced' ? 'text-rose-500' :
                            activeNode.difficulty === 'Intermediate' ? 'text-amber-500' : 'text-emerald-500'
                          }`}>{activeNode.difficulty}</span>
                        </div>
                        <div className="bg-white dark:bg-[#111111] p-2.5 rounded-xl border border-slate-200 dark:border-white/10">
                          <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 block mb-1">Priority</span>
                          <span className={`text-sm font-medium ${
                            activeNode.priority === 'High' ? 'text-rose-500' :
                            activeNode.priority === 'Medium' ? 'text-amber-500' : 'text-slate-600 dark:text-slate-300'
                          }`}>{activeNode.priority}</span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Prerequisites */}
                  <div>
                    <h3 className="text-sm font-semibold text-slate-900 dark:text-white mb-3 flex items-center gap-2">
                      <LinkIcon className="w-4 h-4 text-slate-400" />
                      Prerequisites
                    </h3>
                    <div className="space-y-2">
                      {getPrerequisites(activeNode.id).length > 0 ? (
                        getPrerequisites(activeNode.id).map(prereq => (
                          <button
                            key={prereq.id}
                            onClick={() => handleNodeClick(prereq)}
                            className="w-full flex items-center justify-between p-3 rounded-xl border border-slate-200 dark:border-white/10 hover:border-indigo-300 dark:hover:border-indigo-500/50 hover:bg-indigo-50 dark:hover:bg-indigo-500/10 transition-colors cursor-pointer group bg-white dark:bg-[#111111]"
                          >
                            <span className="text-sm text-slate-700 dark:text-slate-300 truncate pr-2 font-medium">{prereq.label || prereq.concept || prereq.id}</span>
                            <ChevronRight className="w-4 h-4 text-slate-400 group-hover:text-indigo-500 transition-colors flex-shrink-0" />
                          </button>
                        ))
                      ) : (
                        <p className="text-sm text-slate-500 dark:text-slate-400 italic bg-slate-50 dark:bg-white/[0.03] border border-slate-100 dark:border-white/5 p-3 rounded-xl">
                          No prerequisites required.
                        </p>
                      )}
                    </div>
                  </div>
                </div>

                {/* AI Tutor Actions */}
                <div className="p-5 border-t border-slate-200 dark:border-white/10 bg-slate-50/50 dark:bg-white/[0.02] space-y-2.5">
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-3 flex items-center gap-2">
                    <Sparkles className="w-3.5 h-3.5" />
                    AI Tutor Actions
                  </h3>
                  <button 
                    onClick={() => alert('Starting AI explanation...')}
                    className="w-full flex items-center justify-between px-4 py-2.5 bg-indigo-500 hover:bg-indigo-600 text-white rounded-xl text-sm font-medium transition-colors shadow-sm shadow-indigo-500/20"
                  >
                    <span className="flex items-center gap-2"><GraduationCap className="w-4 h-4" /> Explain from Basics</span>
                  </button>
                  <button 
                    onClick={() => alert('Generating flashcards...')}
                    className="w-full flex items-center justify-between px-4 py-2.5 bg-white dark:bg-[#111111] border border-slate-200 dark:border-white/10 hover:bg-slate-50 dark:hover:bg-white/[0.05] text-slate-700 dark:text-slate-200 rounded-xl text-sm font-medium transition-colors"
                  >
                    <span className="flex items-center gap-2"><Layers className="w-4 h-4" /> Generate Flashcards</span>
                  </button>
                  <button 
                    onClick={() => alert('Creating quiz...')}
                    className="w-full flex items-center justify-between px-4 py-2.5 bg-white dark:bg-[#111111] border border-slate-200 dark:border-white/10 hover:bg-slate-50 dark:hover:bg-white/[0.05] text-slate-700 dark:text-slate-200 rounded-xl text-sm font-medium transition-colors"
                  >
                    <span className="flex items-center gap-2"><Target className="w-4 h-4" /> Create Quick Quiz</span>
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </>
      )}
    </div>
  );
}
