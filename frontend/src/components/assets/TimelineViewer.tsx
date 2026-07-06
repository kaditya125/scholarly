import React, { useState } from 'react';
import { Calendar, Clock, Download } from 'lucide-react';
import * as htmlToImage from 'html-to-image';
import { useRef } from 'react';

export default function TimelineViewer({ assetData }: { assetData: any }) {
  const content = assetData.content?.timeline || assetData;
  const events = content.events || [];
  const containerRef = useRef<HTMLDivElement>(null);

  const downloadImage = () => {
    if (!containerRef.current) return;
    htmlToImage.toPng(containerRef.current, { backgroundColor: '#f8fafc' })
      .then((dataUrl) => {
        const a = document.createElement('a');
        a.setAttribute('download', `${assetData.title || 'timeline'}.png`);
        a.setAttribute('href', dataUrl);
        a.click();
      })
      .catch((err) => {
        console.error('Failed to export image', err);
      });
  };

  if (events.length === 0) {
    return (
      <div className="p-8 text-center text-slate-500 bg-slate-50 dark:bg-[#121212] rounded-2xl border border-slate-200 dark:border-white/10">
        No timeline events found.
      </div>
    );
  }

  return (
    <div className="relative border border-slate-200 dark:border-white/10 rounded-2xl overflow-hidden bg-slate-50 dark:bg-[#121212]">
      {/* Header controls */}
      <div className="flex justify-end p-4 border-b border-slate-200 dark:border-white/10 bg-white dark:bg-[#1e1e1e]">
        <button 
          onClick={downloadImage}
          className="flex items-center gap-2 px-4 py-2 bg-slate-100 dark:bg-white/5 hover:bg-slate-200 dark:hover:bg-white/10 rounded-xl text-sm font-bold text-slate-700 dark:text-gray-200 transition-colors"
        >
          <Download className="w-4 h-4" /> Export Timeline
        </button>
      </div>
      
      {/* Timeline container */}
      <div className="p-8 overflow-y-auto custom-scrollbar max-h-[600px]" ref={containerRef}>
        <div className="relative max-w-3xl mx-auto">
          {/* Vertical line */}
          <div className="absolute left-[28px] md:left-1/2 top-0 bottom-0 w-0.5 bg-slate-200 dark:bg-white/10 -translate-x-1/2" />
          
          <div className="space-y-12">
            {events.map((evt: any, i: number) => {
              const isEven = i % 2 === 0;
              const isHighImportance = evt.importance?.toLowerCase() === 'high';
              
              return (
                <div key={i} className={`relative flex items-center md:justify-between flex-col md:flex-row ${isEven ? 'md:flex-row-reverse' : ''}`}>
                  
                  {/* Icon point */}
                  <div className="absolute left-[28px] md:left-1/2 -translate-x-1/2 flex items-center justify-center w-10 h-10 rounded-full bg-white dark:bg-[#1e1e1e] border-4 border-slate-50 dark:border-[#121212] shadow-sm z-10">
                    <div className={`w-3 h-3 rounded-full ${isHighImportance ? 'bg-rose-500 shadow-rose-500/50 shadow-md' : 'bg-teal-500'}`} />
                  </div>

                  {/* Content Card */}
                  <div className={`w-full md:w-[calc(50%-3rem)] pl-16 md:pl-0 ${isEven ? 'md:pr-12' : 'md:pl-12'}`}>
                    <div className="bg-white dark:bg-[#1e1e1e] border border-slate-200 dark:border-white/10 p-5 rounded-2xl shadow-sm hover:shadow-md transition-shadow group">
                      
                      <div className="flex items-center gap-2 mb-3">
                        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-indigo-50 dark:bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 text-xs font-bold uppercase tracking-wide">
                          <Calendar className="w-3.5 h-3.5" />
                          {evt.date}
                        </span>
                        {isHighImportance && (
                          <span className="text-[10px] uppercase font-bold text-rose-500 bg-rose-50 dark:bg-rose-500/10 px-2 py-0.5 rounded-full">
                            Key Event
                          </span>
                        )}
                      </div>

                      <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-2 leading-tight">
                        {evt.label}
                      </h3>
                      
                      <p className="text-sm text-slate-600 dark:text-gray-400 leading-relaxed">
                        {evt.description}
                      </p>

                      {evt.relatedConcepts && evt.relatedConcepts.length > 0 && (
                        <div className="mt-4 pt-4 border-t border-slate-100 dark:border-white/5 flex flex-wrap gap-2">
                          {evt.relatedConcepts.map((concept: string, idx: number) => (
                            <span key={idx} className="text-xs font-medium text-slate-500 dark:text-gray-500 bg-slate-100 dark:bg-white/5 px-2 py-1 rounded-md">
                              {concept}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
