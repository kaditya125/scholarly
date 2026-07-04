import { useState, useEffect } from "react";
import { api } from "../lib/api/client";
import { Loader2 } from "lucide-react";
import { MoreHorizontal, Calendar, Eye, MessageSquare, Plus, ClipboardList, BookOpen } from "lucide-react";
import { cn } from "../lib/utils";
import { ModernCalendarFilter } from "../components/ModernCalendarFilter";
import { usePlanner } from "../hooks/ai/usePlanner";

const KANBAN_COLUMNS = [
  { status: "To do", color: "bg-teal-50 dark:bg-teal-900/20", dot: "bg-teal-400", border: "border-teal-100 dark:border-teal-900/50" },
  { status: "In Progress", color: "bg-slate-100 dark:bg-slate-800/50", dot: "bg-slate-400 dark:bg-slate-500", border: "border-slate-200 dark:border-slate-700/50" },
  { status: "Under Review", color: "bg-yellow-50 dark:bg-yellow-900/10", dot: "bg-yellow-400 dark:bg-yellow-600", border: "border-yellow-200 dark:border-yellow-900/30" },
  { status: "Completed", color: "bg-teal-100 dark:bg-teal-900/40", dot: "bg-slate-700 dark:bg-slate-300", border: "border-teal-200 dark:border-teal-800/50" }
];

export default function Planner() {
  const { tasks, isLoading } = usePlanner();

  const kanbanData = KANBAN_COLUMNS.map(col => {
    const colTasks = tasks.filter((t: any) => t.status === col.status);
    return {
      ...col,
      count: colTasks.length.toString().padStart(2, '0'),
      tasks: colTasks
    };
  });

  return (
    <div className="flex flex-col h-[calc(100vh-100px)] p-6 pt-0">
      
      {/* Header Controls */}
      <div className="flex items-center justify-between mb-8 z-10 relative">
         <div className="flex gap-4">
           <ModernCalendarFilter />
           <button className="flex items-center gap-2 bg-white dark:bg-[#1a1a1a] px-4 py-2.5 rounded-full border border-slate-200 dark:border-white/10 shadow-sm text-sm font-medium hover:border-slate-300 dark:hover:border-white/20 transition-colors text-slate-700 dark:text-slate-300">
             <BookOpen className="w-4 h-4 text-slate-500 dark:text-slate-400" />
             Mathematics
           </button>
           <button className="flex items-center gap-2 bg-white dark:bg-[#1a1a1a] px-4 py-2.5 rounded-full border border-slate-200 dark:border-white/10 shadow-sm text-sm font-medium hover:border-slate-300 dark:hover:border-white/20 transition-colors text-slate-700 dark:text-slate-300">
             Reports
           </button>
         </div>
         <div className="flex gap-2 bg-white dark:bg-[#1a1a1a] rounded-full p-1 border border-slate-200 dark:border-white/10 shadow-[0_2px_10px_rgb(0,0,0,0.02)] transition-colors">
           <button className="px-5 py-2 text-sm font-bold rounded-full text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200 transition-colors">Table</button>
           <button className="px-5 py-2 text-sm font-bold rounded-full bg-teal-600 dark:bg-teal-500 text-white shadow-sm transition-colors">Board</button>
           <button className="px-5 py-2 text-sm font-bold rounded-full text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200 transition-colors">List</button>
         </div>
      </div>

      {/* Kanban Board Area */}
      {isLoading ? (
        <div className="flex flex-1 items-center justify-center">
          <Loader2 className="w-8 h-8 animate-spin text-teal-500" />
        </div>
      ) : (
        <div className="flex gap-6 overflow-x-auto flex-1 custom-scrollbar pb-6">
          {kanbanData.map((column, idx) => (
            <div key={idx} className="flex flex-col min-w-[320px] w-[320px] shrink-0">
              {/* Column Header */}
              <div className="flex items-center justify-between mb-6 px-2">
                <div className="flex items-center gap-2">
                  <span className={cn("w-2.5 h-2.5 rounded-full", column.dot)} />
                  <h3 className="font-bold text-slate-900 dark:text-slate-100">{column.status}</h3>
                  <span className="bg-white dark:bg-[#1a1a1a] border border-slate-200 dark:border-white/10 px-2.5 py-0.5 rounded-full text-[11px] font-bold text-slate-500 dark:text-slate-400 shadow-sm ml-1 transition-colors">
                    {column.count}
                  </span>
                </div>
                <button className="p-1 hover:bg-slate-200 dark:hover:bg-white/10 rounded text-slate-400 dark:text-slate-500 transition-colors">
                  <MoreHorizontal className="w-5 h-5" />
                </button>
              </div>

              {/* Add task button */}
              <button className="flex items-center justify-center gap-2 py-3.5 mb-5 w-full bg-transparent border-2 border-dashed border-slate-200 dark:border-white/10 rounded-3xl text-sm font-bold text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300 hover:border-slate-300 dark:hover:border-white/20 hover:bg-white/50 dark:hover:bg-[#1a1a1a]/50 transition-all cursor-pointer">
                <Plus className="w-4 h-4" /> Add new tasks
              </button>

              {/* Cards List */}
              <div className="flex flex-col gap-4 overflow-y-auto custom-scrollbar pr-2 h-full">
                {column.tasks.map((task: any, taskIdx: number) => (
                  <div key={taskIdx} className={cn("rounded-3xl p-6 border shadow-[0_2px_15px_rgb(0,0,0,0.02)] transition-transform hover:-translate-y-1 cursor-grab active:cursor-grabbing", column.color, column.border)}>
                    <div className="flex items-start justify-between mb-4">
                      <span className="bg-white/70 dark:bg-black/20 px-3 py-1.5 rounded-full text-[11px] font-bold text-slate-600 dark:text-slate-300 pb-1 border border-transparent dark:border-white/5 transition-colors">
                        {task.subject}
                      </span>
                      <button className="p-1 hover:bg-white/50 dark:hover:bg-black/20 rounded text-slate-500 dark:text-slate-400 transition-colors">
                        <MoreHorizontal className="w-4 h-4" />
                      </button>
                    </div>
                    
                    <h4 className="font-bold text-slate-900 dark:text-slate-100 text-lg mb-2">{task.title}</h4>
                    <p className="text-[13px] leading-relaxed text-slate-600 dark:text-slate-400 font-medium opacity-80 mb-6 line-clamp-3">
                      {task.desc}
                    </p>

                    <div className="flex items-center gap-4 mb-6">
                      <div className="flex items-center gap-1.5 text-[11px] font-bold text-slate-500 dark:text-slate-300 bg-white/50 dark:bg-black/20 px-3 py-1.5 rounded-lg border border-white/40 dark:border-white/5 transition-colors">
                        <Calendar className="w-3.5 h-3.5" />
                        {task.date}
                      </div>
                      {task.grade ? (
                        <div className="text-sm font-bold text-green-600 dark:text-green-400 pl-2 border-l border-green-200 dark:border-green-800">
                          Grade: {task.grade}
                        </div>
                      ) : (
                        <div className="flex items-center gap-1.5 text-[11px] font-bold text-slate-500 dark:text-slate-300 bg-white/50 dark:bg-black/20 px-3 py-1.5 rounded-lg border border-white/40 dark:border-white/5 transition-colors">
                          <ClipboardList className="w-3.5 h-3.5 opacity-70" />
                          {task.ratio}
                        </div>
                      )}
                    </div>

                    <div className="flex items-center justify-between mt-auto">
                      <div className="flex items-center">
                        <div className="flex -space-x-2 mr-2">
                          {(task.avatars || []).map((avatar: string, aIdx: number) => (
                            <img key={aIdx} src={avatar} alt="Avatar" className="w-8 h-8 rounded-full border-2 border-white/80 dark:border-[#1a1a1a] shrink-0" />
                          ))}
                        </div>
                        <span className="text-xs font-bold text-slate-600 dark:text-slate-400">{task.extraAvatars}</span>
                      </div>

                      <div className="flex items-center gap-3">
                        <div className="flex items-center gap-1.5 text-xs font-bold text-slate-500 dark:text-slate-400">
                          <Eye className="w-4 h-4 text-slate-400 dark:text-slate-500" /> {task.views}
                        </div>
                        <div className="flex items-center gap-1.5 text-xs font-bold text-slate-500 dark:text-slate-400">
                          <MessageSquare className="w-4 h-4 text-slate-400 dark:text-slate-500" /> {task.comments}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

    </div>
  );
}
