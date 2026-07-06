import React, { useState } from 'react';
import { Network, Calendar, Maximize, Download } from 'lucide-react';
import MindMapViewer from '../assets/MindMapViewer';
import TimelineViewer from '../assets/TimelineViewer';

interface DiagramWidgetProps {
  type: 'mindMap' | 'timeline';
  data: any;
}

export default function DiagramWidget({ type, data }: DiagramWidgetProps) {
  const [isOpen, setIsOpen] = useState(false);

  // Creating a fake asset wrapper to pass to the viewers
  const assetData = {
    title: type === 'mindMap' ? 'Generated Mind Map' : 'Generated Timeline',
    content: {
      [type]: data
    }
  };

  return (
    <div className="my-4">
      {/* Small Preview Widget */}
      <div className="border border-slate-200 dark:border-white/10 rounded-2xl p-4 bg-slate-50 dark:bg-[#121212] flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-white dark:bg-[#1e1e1e] flex items-center justify-center shadow-sm">
            {type === 'mindMap' ? (
              <Network className="w-5 h-5 text-teal-500" />
            ) : (
              <Calendar className="w-5 h-5 text-indigo-500" />
            )}
          </div>
          <div>
            <h4 className="font-bold text-slate-800 dark:text-white text-sm">
              {type === 'mindMap' ? 'Interactive Mind Map' : 'Interactive Timeline'}
            </h4>
            <p className="text-xs text-slate-500 dark:text-gray-400">
              {type === 'mindMap' ? `${data.nodes?.length || 0} nodes, ${data.edges?.length || 0} edges` : `${data.events?.length || 0} events`}
            </p>
          </div>
        </div>
        <button
          onClick={() => setIsOpen(true)}
          className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-sm font-bold shadow-sm transition-colors flex items-center gap-2"
        >
          <Maximize className="w-4 h-4" /> Open Diagram
        </button>
      </div>

      {/* Fullscreen Modal */}
      {isOpen && (
        <div className="fixed inset-0 z-[100] bg-white dark:bg-[#121212] flex flex-col">
          <div className="flex items-center justify-between p-4 border-b border-slate-200 dark:border-white/10">
            <div className="flex items-center gap-3">
              {type === 'mindMap' ? <Network className="w-5 h-5 text-teal-500" /> : <Calendar className="w-5 h-5 text-indigo-500" />}
              <h2 className="font-bold text-lg dark:text-white">
                {type === 'mindMap' ? 'Mind Map Viewer' : 'Timeline Viewer'}
              </h2>
            </div>
            <button
              onClick={() => setIsOpen(false)}
              className="px-4 py-2 bg-slate-100 dark:bg-white/5 hover:bg-slate-200 dark:hover:bg-white/10 rounded-xl text-sm font-bold text-slate-700 dark:text-gray-200"
            >
              Close
            </button>
          </div>
          <div className="flex-1 overflow-auto bg-slate-50 dark:bg-[#121212] p-6">
            <div className="max-w-7xl mx-auto h-full min-h-[600px]">
              {type === 'mindMap' ? (
                <MindMapViewer assetData={assetData} />
              ) : (
                <TimelineViewer assetData={assetData} />
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
