import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import ForceGraph2D from "react-force-graph-2d";
import { motion, AnimatePresence } from "motion/react";
import {
  Sparkles,
  Loader2,
  X,
  Network,
  Layers,
  Link as LinkIcon,
  BookOpen,
  Flame,
} from "lucide-react";
import { cn } from "../../lib/utils";
import type { CircleConcept } from "../../lib/api/studyCircle";

interface CircleConceptGraphProps {
  concepts: CircleConcept[];
  isLoading: boolean;
  isSynthesizing: boolean;
  onSynthesize: () => void;
}

/** Concept colour by how central it is to the group's studies. */
function conceptColor(importance: number): string {
  if (importance >= 0.7) return "#6366f1"; // indigo
  if (importance >= 0.4) return "#8b5cf6"; // violet
  return "#64748b"; // slate
}

/**
 * Interactive concept map for a study circle. Renders the persisted CircleConcept graph with a
 * force layout — nodes sized/coloured by importance, undirected links from relatedConceptIds — and
 * a detail panel showing real data (definition, reinforcement count, related concepts). No mock
 * fields; everything shown comes from the synthesized graph.
 */
export function CircleConceptGraph({
  concepts,
  isLoading,
  isSynthesizing,
  onSynthesize,
}: CircleConceptGraphProps) {
  const graphRef = useRef<any>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [dimensions, setDimensions] = useState({ width: 800, height: 600 });
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const conceptById = useMemo(() => {
    const m = new Map<string, CircleConcept>();
    for (const c of concepts) m.set(c.id, c);
    return m;
  }, [concepts]);

  // Nodes + undirected, de-duplicated links derived from relatedConceptIds.
  const graphData = useMemo(() => {
    const ids = new Set(concepts.map((c) => c.id));
    const seen = new Set<string>();
    const links: { source: string; target: string }[] = [];
    for (const c of concepts) {
      for (const rid of c.relatedConceptIds || []) {
        if (!ids.has(rid) || rid === c.id) continue;
        const key = c.id < rid ? `${c.id}|${rid}` : `${rid}|${c.id}`;
        if (seen.has(key)) continue;
        seen.add(key);
        links.push({ source: c.id, target: rid });
      }
    }
    return { nodes: concepts.map((c) => ({ ...c })), links };
  }, [concepts]);

  // Keep the canvas sized to its container.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const measure = () =>
      setDimensions({ width: el.clientWidth, height: el.clientHeight });
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Breathe the layout out a little for readability.
  useEffect(() => {
    const g = graphRef.current;
    if (!g) return;
    g.d3Force("charge")?.strength(-320)?.distanceMax(420);
    g.d3Force("link")?.distance(90);
  }, [graphData]);

  const focusNode = useCallback((node: any) => {
    const g = graphRef.current;
    if (g && typeof node?.x === "number") {
      g.centerAt(node.x, node.y, 700);
      g.zoom(Math.max(g.zoom(), 2.2), 700);
    }
  }, []);

  const handleNodeClick = useCallback(
    (node: any) => {
      setSelectedId(node.id);
      focusNode(node);
    },
    [focusNode]
  );

  // Select a concept from the detail panel — look up its live (force-positioned) node to recentre.
  const selectConcept = useCallback(
    (id: string) => {
      setSelectedId(id);
      const node = (graphData.nodes as any[]).find((n) => n.id === id);
      if (node) focusNode(node);
    },
    [graphData, focusNode]
  );

  const paintNode = useCallback(
    (node: any, ctx: any, globalScale: number) => {
      const label: string = node.label || node.id;
      const importance = typeof node.importance === "number" ? node.importance : 0.5;
      const isSelected = selectedId === node.id;
      const color = conceptColor(importance);
      const dark = document.documentElement.classList.contains("dark");

      const fontSize = (isSelected ? 13 : 10.5 + importance * 3) / globalScale;
      ctx.font = `${isSelected ? "bold " : ""}${fontSize}px Inter, system-ui, sans-serif`;
      const textWidth = ctx.measureText(label).width;
      const padX = fontSize * 0.7;
      const padY = fontSize * 0.55;
      const w = textWidth + padX * 2;
      const h = fontSize + padY * 2;

      ctx.fillStyle = isSelected
        ? color
        : dark
        ? "rgba(30, 30, 31, 0.95)"
        : "rgba(255, 255, 255, 0.96)";
      ctx.shadowColor = isSelected ? color : "transparent";
      ctx.shadowBlur = isSelected ? 16 / globalScale : 0;
      ctx.beginPath();
      ctx.roundRect(node.x - w / 2, node.y - h / 2, w, h, 8 / globalScale);
      ctx.fill();

      ctx.shadowBlur = 0;
      ctx.lineWidth = (isSelected ? 1.5 : 1) / globalScale;
      ctx.strokeStyle = isSelected
        ? color
        : dark
        ? "rgba(255,255,255,0.12)"
        : "rgba(0,0,0,0.08)";
      ctx.stroke();

      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillStyle = isSelected ? "#ffffff" : color;
      ctx.fillText(label, node.x, node.y);

      node.__w = w;
      node.__h = h;
    },
    [selectedId]
  );

  const edgeColor = () =>
    document.documentElement.classList.contains("dark")
      ? "rgba(139, 92, 246, 0.22)"
      : "rgba(139, 92, 246, 0.32)";

  const selected = selectedId ? conceptById.get(selectedId) : undefined;
  const related = selected
    ? selected.relatedConceptIds
        .map((id) => conceptById.get(id))
        .filter((c): c is CircleConcept => !!c)
    : [];

  const synthLabel = concepts.length === 0 ? "Synthesize concept map" : "Refresh map";

  const SynthesizeButton = (
    <button
      onClick={onSynthesize}
      disabled={isSynthesizing}
      className="flex items-center gap-2 px-3.5 h-9 rounded-xl bg-gradient-to-br from-violet-500 to-indigo-600 text-white text-[12.5px] font-semibold shadow-sm hover:opacity-90 transition-opacity disabled:opacity-60 disabled:cursor-not-allowed"
    >
      {isSynthesizing ? (
        <Loader2 className="w-4 h-4 animate-spin" />
      ) : (
        <Sparkles className="w-4 h-4" />
      )}
      {isSynthesizing ? "Synthesizing…" : synthLabel}
    </button>
  );

  // Empty / loading states.
  if (isLoading && concepts.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center bg-slate-50/50 dark:bg-black/10">
        <Loader2 className="w-6 h-6 text-slate-300 dark:text-white/20 animate-spin" />
      </div>
    );
  }

  if (concepts.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center text-center px-6 bg-slate-50/50 dark:bg-black/10">
        <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center mb-4 shadow-lg shadow-violet-500/20">
          <Network className="w-7 h-7 text-white" />
        </div>
        <p className="text-[15px] font-bold text-slate-900 dark:text-white mb-1.5">
          Build your circle's concept map
        </p>
        <p className="text-[12.5px] text-slate-400 dark:text-gray-500 max-w-xs mb-5 leading-relaxed">
          The AI reads everything your circle has shared and asked, then maps the key concepts and
          how they connect. It grows every time you synthesize.
        </p>
        {SynthesizeButton}
      </div>
    );
  }

  return (
    <div ref={containerRef} className="flex-1 relative min-h-0 overflow-hidden bg-slate-50 dark:bg-[#0a0a0a]">
      {/* Top overlay: stats + synthesize */}
      <div className="absolute top-3 left-3 right-3 z-10 flex items-center justify-between pointer-events-none">
        <div className="pointer-events-auto flex items-center gap-2 bg-white/85 dark:bg-slate-900/85 backdrop-blur-md px-3.5 py-2 rounded-xl border border-slate-200 dark:border-white/10 shadow-sm text-[12.5px] font-medium text-slate-700 dark:text-slate-300">
          <Layers className="w-4 h-4 text-indigo-500" />
          <span>
            <span className="font-bold text-slate-900 dark:text-white">{concepts.length}</span>{" "}
            {concepts.length === 1 ? "concept" : "concepts"}
          </span>
        </div>
        <div className="pointer-events-auto">{SynthesizeButton}</div>
      </div>

      <ForceGraph2D
        ref={graphRef}
        width={dimensions.width}
        height={dimensions.height}
        graphData={graphData}
        nodeId="id"
        nodeRelSize={6}
        linkColor={() => edgeColor()}
        linkWidth={1}
        linkCurvature={0.12}
        linkDirectionalParticles={2}
        linkDirectionalParticleSpeed={0.005}
        linkDirectionalParticleWidth={2}
        linkDirectionalParticleColor={() => edgeColor()}
        d3VelocityDecay={0.25}
        onNodeClick={handleNodeClick}
        onBackgroundClick={() => setSelectedId(null)}
        nodeCanvasObject={paintNode}
        nodePointerAreaPaint={(node: any, color: string, ctx: any) => {
          if (!node.__w) return;
          ctx.fillStyle = color;
          ctx.beginPath();
          ctx.roundRect(node.x - node.__w / 2, node.y - node.__h / 2, node.__w, node.__h, 4);
          ctx.fill();
        }}
      />

      {/* Detail panel */}
      <AnimatePresence>
        {selected && (
          <motion.div
            initial={{ x: 360, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: 360, opacity: 0 }}
            transition={{ type: "spring", bounce: 0, duration: 0.35 }}
            className="absolute top-3 right-3 bottom-3 w-[300px] max-w-[85%] bg-white/95 dark:bg-[#111111]/95 backdrop-blur-xl border border-slate-200 dark:border-white/10 rounded-2xl shadow-2xl flex flex-col overflow-hidden z-20"
          >
            <div className="p-4 border-b border-slate-200 dark:border-white/10 flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div
                  className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10.5px] font-semibold mb-2"
                  style={{
                    backgroundColor: `${conceptColor(selected.importance)}18`,
                    color: conceptColor(selected.importance),
                  }}
                >
                  <span
                    className="w-1.5 h-1.5 rounded-full"
                    style={{ backgroundColor: conceptColor(selected.importance) }}
                  />
                  {Math.round(selected.importance * 100)}% importance
                </div>
                <h3 className="text-[16px] font-bold text-slate-900 dark:text-white leading-tight break-words">
                  {selected.label}
                </h3>
              </div>
              <button
                onClick={() => setSelectedId(null)}
                className="shrink-0 p-1.5 rounded-full text-slate-400 hover:bg-slate-100 dark:hover:bg-white/10 transition-colors"
                aria-label="Close"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto custom-scrollbar p-4 space-y-5">
              <div>
                <h4 className="text-[12px] font-semibold text-slate-900 dark:text-white mb-1.5 flex items-center gap-1.5">
                  <BookOpen className="w-3.5 h-3.5 text-slate-400" /> Definition
                </h4>
                <p className="text-[12.5px] text-slate-600 dark:text-slate-300 leading-relaxed">
                  {selected.definition || "No definition captured yet."}
                </p>
              </div>

              <div className="flex items-center gap-1.5 text-[11.5px] text-slate-500 dark:text-gray-400">
                <Flame className="w-3.5 h-3.5 text-amber-500" />
                Reinforced {selected.mentions}{" "}
                {selected.mentions === 1 ? "time" : "times"} across the circle
              </div>

              <div>
                <h4 className="text-[12px] font-semibold text-slate-900 dark:text-white mb-2 flex items-center gap-1.5">
                  <LinkIcon className="w-3.5 h-3.5 text-slate-400" /> Connected concepts
                </h4>
                {related.length > 0 ? (
                  <div className="space-y-1.5">
                    {related.map((r) => (
                      <button
                        key={r.id}
                        onClick={() => selectConcept(r.id)}
                        className="w-full text-left flex items-center gap-2 px-3 py-2 rounded-xl border border-slate-200 dark:border-white/10 hover:border-violet-300 dark:hover:border-violet-500/40 hover:bg-violet-50 dark:hover:bg-violet-500/10 transition-colors"
                      >
                        <span
                          className="w-2 h-2 rounded-full shrink-0"
                          style={{ backgroundColor: conceptColor(r.importance) }}
                        />
                        <span className="text-[12.5px] text-slate-700 dark:text-slate-200 truncate">
                          {r.label}
                        </span>
                      </button>
                    ))}
                  </div>
                ) : (
                  <p className="text-[12px] text-slate-400 dark:text-gray-500 italic">
                    No connections mapped yet.
                  </p>
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
