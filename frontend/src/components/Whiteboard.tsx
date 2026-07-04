import React, { useRef, useState, useEffect } from 'react';
import { Pen, Eraser, Download, Trash2, Undo, Circle, Square, Minus } from 'lucide-react';
import { cn } from '../lib/utils';

export function Whiteboard() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  
  const [isDrawing, setIsDrawing] = useState(false);
  const [color, setColor] = useState('#6366f1'); // Indigo 500
  const [brushSize, setBrushSize] = useState(3);
  const [tool, setTool] = useState<'pen' | 'eraser'>('pen');
  const [ctx, setCtx] = useState<CanvasRenderingContext2D | null>(null);

  // Used for a simple undo stack
  const [paths, setPaths] = useState<ImageData[]>([]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    // Fit canvas to container size
    const resizeCanvas = () => {
      const parent = containerRef.current;
      if (parent) {
        canvas.width = parent.clientWidth;
        canvas.height = parent.clientHeight;
        
        // Initial clean background
        const context = canvas.getContext('2d');
        if (context) {
          context.fillStyle = 'transparent';
          context.fillRect(0, 0, canvas.width, canvas.height);
          context.lineCap = 'round';
          context.lineJoin = 'round';
          setCtx(context);
        }
      }
    };
    
    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);
    
    return () => window.removeEventListener('resize', resizeCanvas);
  }, []);

  const saveState = () => {
    const canvas = canvasRef.current;
    if (canvas && ctx) {
      const data = ctx.getImageData(0, 0, canvas.width, canvas.height);
      setPaths((prev) => [...prev, data]);
    }
  };

  const startDrawing = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    if (!ctx) return;
    setIsDrawing(true);
    saveState();
    ctx.beginPath();
    const { x, y } = getCoordinates(e);
    ctx.moveTo(x, y);
  };

  const draw = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    if (!isDrawing || !ctx) return;
    
    const { x, y } = getCoordinates(e);
    
    ctx.lineTo(x, y);
    ctx.strokeStyle = tool === 'eraser' ? '#ffffff' : color;
    ctx.lineWidth = tool === 'eraser' ? brushSize * 3 : brushSize;
    // For eraser, composite operation can make it truly erase or just draw white.
    // Drawing white is fine for a white background, but let's use destination-out for transparent
    if (tool === 'eraser') {
      ctx.globalCompositeOperation = 'destination-out';
      ctx.strokeStyle = 'rgba(0,0,0,1)';
    } else {
      ctx.globalCompositeOperation = 'source-over';
      ctx.strokeStyle = color;
    }
    
    ctx.stroke();
  };

  const stopDrawing = () => {
    if (!ctx) return;
    ctx.closePath();
    setIsDrawing(false);
  };

  const getCoordinates = (e: React.MouseEvent | React.TouchEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    
    const rect = canvas.getBoundingClientRect();
    
    if ('touches' in e) {
      return {
        x: e.touches[0].clientX - rect.left,
        y: e.touches[0].clientY - rect.top
      };
    } else {
      return {
        x: e.clientX - rect.left,
        y: e.clientY - rect.top
      };
    }
  };

  const clearCanvas = () => {
    const canvas = canvasRef.current;
    if (canvas && ctx) {
      saveState();
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    }
  };

  const undo = () => {
    const canvas = canvasRef.current;
    if (paths.length > 0 && ctx && canvas) {
      const newPaths = [...paths];
      const lastState = newPaths.pop();
      setPaths(newPaths);
      if (lastState) {
         ctx.putImageData(lastState, 0, 0);
      }
    } else if (paths.length === 0 && ctx && canvas) {
         ctx.clearRect(0, 0, canvas.width, canvas.height);
    }
  };

  const downloadCanvas = () => {
    const canvas = canvasRef.current;
    if (canvas) {
      // Create a temporary canvas to add a white background
      const tempCanvas = document.createElement('canvas');
      tempCanvas.width = canvas.width;
      tempCanvas.height = canvas.height;
      const tempCtx = tempCanvas.getContext('2d');
      if (tempCtx) {
        tempCtx.fillStyle = '#ffffff';
        tempCtx.fillRect(0, 0, canvas.width, canvas.height);
        tempCtx.drawImage(canvas, 0, 0);
        
        const dataUrl = tempCanvas.toDataURL('image/png');
        const link = document.createElement('a');
        link.download = 'whiteboard.png';
        link.href = dataUrl;
        link.click();
      }
    }
  };

  const colors = ['#000000', '#ef4444', '#f59e0b', '#10b981', '#3b82f6', '#6366f1', '#a855f7', '#ec4899'];

  return (
    <div className="flex flex-col h-full bg-white dark:bg-[#1a1a1a] rounded-2xl border border-slate-200 dark:border-white/10 overflow-hidden shadow-sm m-6 relative">
      
      {/* Toolbar */}
      <div className="flex items-center justify-between p-3 border-b border-slate-100 dark:border-white/5 bg-slate-50/50 dark:bg-white/5">
        <div className="flex items-center gap-2">
          <div className="flex bg-white dark:bg-[#212121] rounded-lg border border-slate-200 dark:border-white/10 p-1">
             <button 
               onClick={() => setTool('pen')}
               className={cn("p-2 rounded-md transition-colors", tool === 'pen' ? "bg-indigo-50 dark:bg-indigo-500/20 text-indigo-600 dark:text-indigo-400" : "text-slate-500 hover:bg-slate-100 dark:hover:bg-white/5")}
               title="Pen Tool"
             >
               <Pen className="w-4 h-4" />
             </button>
             <button 
               onClick={() => setTool('eraser')}
               className={cn("p-2 rounded-md transition-colors", tool === 'eraser' ? "bg-indigo-50 dark:bg-indigo-500/20 text-indigo-600 dark:text-indigo-400" : "text-slate-500 hover:bg-slate-100 dark:hover:bg-white/5")}
               title="Eraser Tool"
             >
               <Eraser className="w-4 h-4" />
             </button>
          </div>
          
          <div className="h-6 w-px bg-slate-200 dark:bg-white/10 mx-2" />
          
          <div className="flex items-center gap-1.5">
            {colors.map(c => (
              <button
                key={c}
                onClick={() => { setColor(c); setTool('pen'); }}
                className={cn(
                  "w-6 h-6 rounded-full transition-transform outline-none border-2",
                  color === c && tool === 'pen' ? "border-indigo-200 dark:border-indigo-500/30 scale-110 shadow-sm" : "border-transparent hover:scale-110"
                )}
                style={{ backgroundColor: c }}
              />
            ))}
          </div>

          <div className="h-6 w-px bg-slate-200 dark:bg-white/10 mx-2" />

          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-500 font-medium ml-1">Size</span>
            <input 
              type="range" 
              min="1" 
              max="20" 
              value={brushSize} 
              onChange={e => setBrushSize(parseInt(e.target.value))}
              className="w-24 accent-indigo-600"
            />
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button 
            onClick={undo}
            disabled={paths.length === 0}
            className="p-2 rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-white/5 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            title="Undo"
          >
            <Undo className="w-4 h-4" />
          </button>
          <button 
            onClick={clearCanvas}
            className="p-2 rounded-lg text-slate-500 hover:bg-red-50 dark:hover:bg-red-500/10 hover:text-red-600 dark:hover:text-red-400 transition-colors"
            title="Clear Board"
          >
            <Trash2 className="w-4 h-4" />
          </button>
          <button 
            onClick={downloadCanvas}
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-indigo-50 dark:bg-indigo-500/20 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-100 dark:hover:bg-indigo-500/30 text-[13px] font-bold transition-colors ml-2"
          >
            <Download className="w-4 h-4" /> Export
          </button>
        </div>
      </div>

      {/* Canvas Area */}
      <div 
        ref={containerRef} 
        className="flex-1 w-full relative bg-[#fcfcfc] dark:bg-[#1a1a1a] cursor-crosshair overflow-hidden dot-pattern"
      >
        <canvas
          ref={canvasRef}
          onMouseDown={startDrawing}
          onMouseMove={draw}
          onMouseUp={stopDrawing}
          onMouseOut={stopDrawing}
          onTouchStart={startDrawing}
          onTouchMove={draw}
          onTouchEnd={stopDrawing}
          className="absolute inset-0 touch-none"
        />
        
        {/* Collaborative Cursors (Visual Only) */}
        <div className="absolute top-1/4 left-1/3 flex items-center gap-2 pointer-events-none opacity-60">
           <svg className="w-4 h-4 text-rose-500" width="24" height="24" viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
             <path d="M4 4L9.5 21L13.5 13.5L21 9.5L4 4Z" />
           </svg>
           <span className="bg-rose-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded shadow-sm">Adit</span>
        </div>
      </div>
    </div>
  );
}
