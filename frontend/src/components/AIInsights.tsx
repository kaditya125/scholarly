import React, { useState } from 'react';
import { Sparkles, Activity, FileText, CheckCircle2, ChevronRight, BarChart2, ShieldAlert } from 'lucide-react';
import { cn } from '../lib/utils';
import { motion } from 'motion/react';

export function AIInsights() {
  const [isAiActive, setIsAiActive] = useState(true);

  return (
    <div className="p-8 pt-6 max-w-4xl mx-auto w-full">
      <div className="flex items-center justify-between mb-8 bg-purple-50 dark:bg-purple-500/10 border border-purple-100 dark:border-purple-500/20 p-5 rounded-2xl">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 bg-white dark:bg-[#212121] rounded-xl flex items-center justify-center shadow-sm">
            <Sparkles className="w-6 h-6 text-purple-600 dark:text-purple-400" />
          </div>
          <div>
            <h2 className="text-[18px] font-bold text-slate-900 dark:text-white flex items-center gap-2">
              AI Room Moderator
              {isAiActive && <span className="bg-green-100 dark:bg-green-500/20 text-green-700 dark:text-green-400 text-[10px] uppercase font-bold px-2 py-0.5 rounded-full">Active</span>}
            </h2>
            <p className="text-[13px] text-slate-600 dark:text-slate-400 mt-1">
              Auto-summarizing long threads and tracking room sentiment.
            </p>
          </div>
        </div>
        
        <label className="relative inline-flex items-center cursor-pointer">
          <input type="checkbox" className="sr-only peer" checked={isAiActive} onChange={() => setIsAiActive(!isAiActive)} />
          <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer dark:bg-slate-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-slate-600 peer-checked:bg-purple-500"></div>
        </label>
      </div>

      {!isAiActive ? (
        <div className="text-center py-12">
          <div className="w-16 h-16 bg-slate-100 dark:bg-white/5 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <Sparkles className="w-8 h-8 text-slate-300 dark:text-slate-600" />
          </div>
          <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-2">AI Moderator is Disabled</h3>
          <p className="text-slate-500 dark:text-slate-400 text-sm max-w-sm mx-auto">
            Enable the AI moderator to view sentiment analysis, auto-generated discussion summaries, and topic clusters.
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          <div className="grid grid-cols-2 gap-6">
            <div className="border border-slate-200 dark:border-white/10 rounded-2xl p-5 bg-white dark:bg-[#1a1a1a]">
              <h3 className="text-[14px] font-bold text-slate-900 dark:text-white mb-4 flex items-center gap-2">
                <Activity className="w-4 h-4 text-blue-500" /> Room Sentiment
              </h3>
              <div className="flex items-end gap-6 mb-4">
                <div className="text-4xl font-bold text-slate-900 dark:text-white">Positive</div>
                <div className="text-sm text-green-600 dark:text-green-400 font-medium pb-1">+12% from last week</div>
              </div>
              <div className="w-full h-2 bg-slate-100 dark:bg-white/5 rounded-full overflow-hidden flex">
                <div className="h-full bg-green-500" style={{ width: '65%' }}></div>
                <div className="h-full bg-slate-300 dark:bg-slate-600" style={{ width: '25%' }}></div>
                <div className="h-full bg-red-400" style={{ width: '10%' }}></div>
              </div>
              <div className="flex justify-between mt-3 text-[12px] font-medium text-slate-500">
                <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-green-500"></span> Focused & Helpful (65%)</span>
                <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-slate-300 dark:bg-slate-600"></span> Neutral (25%)</span>
                <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-red-400"></span> Frustrated (10%)</span>
              </div>
            </div>

            <div className="border border-slate-200 dark:border-white/10 rounded-2xl p-5 bg-white dark:bg-[#1a1a1a]">
               <h3 className="text-[14px] font-bold text-slate-900 dark:text-white mb-4 flex items-center gap-2">
                <BarChart2 className="w-4 h-4 text-indigo-500" /> Trending Topics Map
              </h3>
              <div className="flex flex-wrap gap-2">
                <span className="px-3 py-1.5 bg-indigo-50 dark:bg-indigo-500/10 text-indigo-700 dark:text-indigo-400 rounded-lg text-sm font-medium border border-indigo-100 dark:border-indigo-500/20">Maths Pedagogy (42)</span>
                <span className="px-3 py-1.5 bg-purple-50 dark:bg-purple-500/10 text-purple-700 dark:text-purple-400 rounded-lg text-sm font-medium border border-purple-100 dark:border-purple-500/20">SCERT Science (28)</span>
                <span className="px-3 py-1.5 bg-blue-50 dark:bg-blue-500/10 text-blue-700 dark:text-blue-400 rounded-lg text-sm font-medium border border-blue-100 dark:border-blue-500/20">Bihar GK Updates (15)</span>
                <span className="px-3 py-1.5 bg-slate-100 dark:bg-white/5 text-slate-700 dark:text-slate-300 rounded-lg text-sm font-medium">Time & Work (9)</span>
                <span className="px-3 py-1.5 bg-slate-100 dark:bg-white/5 text-slate-700 dark:text-slate-300 rounded-lg text-sm font-medium">TRE 3.0 Syllabus (6)</span>
              </div>
            </div>
          </div>

          <div className="border border-slate-200 dark:border-white/10 rounded-2xl overflow-hidden bg-white dark:bg-[#1a1a1a]">
            <div className="p-5 border-b border-slate-100 dark:border-white/5 flex items-center justify-between">
              <h3 className="text-[14px] font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <FileText className="w-4 h-4 text-slate-500" /> Auto-Summarized Threads
              </h3>
              <button className="text-[12px] font-bold text-indigo-600 dark:text-indigo-400 hover:text-indigo-700">View All</button>
            </div>
            
            <div className="divide-y divide-slate-100 dark:divide-white/5">
              <div className="p-5 hover:bg-slate-50 dark:hover:bg-white/5 transition-colors group cursor-pointer">
                <div className="flex items-center gap-3 mb-2">
                  <span className="bg-indigo-100 dark:bg-indigo-500/20 text-indigo-700 dark:text-indigo-400 text-[10px] font-bold px-2 py-0.5 rounded">Resolved</span>
                  <span className="text-[12px] text-slate-500 font-medium">from 'Doubt in Q.45 regarding Time & Work'</span>
                </div>
                <h4 className="text-[15px] font-bold text-slate-900 dark:text-white mb-2 group-hover:text-indigo-600 transition-colors">Consensus on Standard Work Hours</h4>
                <p className="text-[14px] text-slate-600 dark:text-slate-400 leading-relaxed">
                  <span className="font-semibold text-slate-800 dark:text-slate-300">Summary:</span> The discussion clarified that while general aptitude questions assume an 8-hour workday, TRE specific guidelines follow the SCERT textbook examples which default to standard completion time unless specified. The AI verified this against SCERT Class 8 Mathematics Chapter 11.
                </p>
                <div className="flex items-center gap-2 mt-4 text-[12px] font-medium text-slate-500">
                  <BotAvatar />
                  <span>Summarized by AI Moderator</span>
                  <span className="w-1 h-1 rounded-full bg-slate-300"></span>
                  <span>14 messages condensed</span>
                </div>
              </div>

              <div className="p-5 hover:bg-slate-50 dark:hover:bg-white/5 transition-colors group cursor-pointer">
                <div className="flex items-center gap-3 mb-2">
                  <span className="bg-amber-100 dark:bg-amber-500/20 text-amber-700 dark:text-amber-400 text-[10px] font-bold px-2 py-0.5 rounded flex items-center gap-1"><ShieldAlert className="w-3 h-3"/> Active Debate</span>
                  <span className="text-[12px] text-slate-500 font-medium">from 'Syllabus change in TRE 3.0?'</span>
                </div>
                <h4 className="text-[15px] font-bold text-slate-900 dark:text-white mb-2 group-hover:text-indigo-600 transition-colors">Language Section Syllabus Confusion</h4>
                <p className="text-[14px] text-slate-600 dark:text-slate-400 leading-relaxed">
                  <span className="font-semibold text-slate-800 dark:text-slate-300">Summary:</span> Members are confused about the new vocabulary weighting. Several unofficial circulars are being shared. The AI moderator has flagged 3 links as unverified and is awaiting an official statement link from a verified mentor.
                </p>
                <div className="flex items-center gap-2 mt-4 text-[12px] font-medium text-slate-500">
                  <BotAvatar />
                  <span>Summarized by AI Moderator</span>
                  <span className="w-1 h-1 rounded-full bg-slate-300"></span>
                  <span>32 messages condensed</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function BotAvatar() {
  return (
    <div className="w-5 h-5 rounded-full bg-gradient-to-br from-purple-500 to-indigo-500 flex items-center justify-center text-white">
      <Sparkles className="w-3 h-3" />
    </div>
  );
}
