import React from "react";
import { Link, useNavigate } from "react-router-dom";
import { 
  UploadCloud,
  Film,
  Layers,
  Search,
  Mic,
  ArrowUp,
  MessageSquare,
  BookOpen,
  Headphones,
  Lightbulb,
  FileText,
  FileImage,
  Map,
  Image as ImageIcon,
  CheckSquare,
  FileAudio,
  FolderOpen,
  Plus,
  Paperclip,
  Bot,
  Sparkles,
  Zap,
  Cpu,
  Brain,
  PenTool,
  ChevronRight,
  BrainCircuit,
  Settings,
  Activity,
  Trophy,
  Medal,
  Award,
  Flame,
  Clock,
  HelpCircle
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { OpenAI, Groq, Nvidia } from '@lobehub/icons';
import { cn } from "../lib/utils";

const GeminiIcon = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 24 24" className={className}>
    <defs>
      <linearGradient id="gemini-grad" x1="15%" y1="15%" x2="85%" y2="85%">
        <stop offset="0%" stopColor="#F95454" />
        <stop offset="50%" stopColor="#4285F4" />
        <stop offset="100%" stopColor="#34A853" />
      </linearGradient>
    </defs>
    <path d="M12 2C12 7.523 16.477 12 22 12C16.477 12 12 16.477 12 22C12 16.477 7.523 12 2 12C7.523 12 12 7.523 12 2Z" fill="url(#gemini-grad)" />
  </svg>
);

const SHORTCUTS = [
  { label: "AI Chat", icon: MessageSquare, color: "text-purple-500", bg: "bg-purple-500/10", path: "/chat" },
  { label: "Study Guide", icon: BookOpen, color: "text-red-400", bg: "bg-red-400/10", path: "/chat?type=study-guide" },
  { label: "AI Podcast", icon: Headphones, color: "text-teal-500", bg: "bg-teal-500/10", path: "/chat?type=podcast" },
  { label: "Deep Research", icon: Lightbulb, color: "text-yellow-500", bg: "bg-yellow-500/10", path: "/research" },
  { label: "AI Slides", icon: Layers, color: "text-blue-500", bg: "bg-blue-500/10", path: "/chat?type=slides" },
  { label: "Worksheet", icon: FileText, color: "text-green-500", bg: "bg-green-500/10", path: "/chat?type=worksheet" },
  { label: "AI Infographic", icon: FileImage, color: "text-cyan-500", bg: "bg-cyan-500/10", path: "/chat?type=infographic" },
  { label: "Mind Map", icon: Map, color: "text-purple-400", bg: "bg-purple-400/10", path: "/chat?type=mindmap" },
  { label: "AI Image", icon: ImageIcon, color: "text-orange-500", bg: "bg-orange-500/10", path: "/chat?type=image" },
  { label: "Page", icon: FileText, color: "text-indigo-400", bg: "bg-indigo-400/10", path: "/chat?type=page" },
  { label: "Practice Exam", icon: CheckSquare, color: "text-indigo-500", bg: "bg-indigo-500/10", path: "/test" },
  { label: "AI Meeting Notes", icon: FileAudio, color: "text-pink-500", bg: "bg-pink-500/10", path: "/chat?type=meeting-notes" },
];

const MODELS = [
  { id: 'gemini-2.5-flash', name: 'Gemini 2.5 Flash', icon: GeminiIcon, color: 'text-purple-500', btnBg: 'bg-purple-500 hover:bg-purple-600' },
  { id: 'gemini-2.5-flash-lite', name: 'Gemini 2.5 Flash Lite', icon: GeminiIcon, color: 'text-purple-500', btnBg: 'bg-purple-500 hover:bg-purple-600' },
  { id: 'gemini-2.5-pro', name: 'Gemini 2.5 Pro', icon: GeminiIcon, color: 'text-purple-500', btnBg: 'bg-purple-500 hover:bg-purple-600' },
  { id: 'gemini-3.0-flash', name: 'Gemini 3 Flash', icon: GeminiIcon, color: 'text-purple-500', btnBg: 'bg-purple-500 hover:bg-purple-600' },
  { id: 'gemini-3.1-pro', name: 'Gemini 3.1 Pro', icon: GeminiIcon, color: 'text-purple-500', btnBg: 'bg-purple-500 hover:bg-purple-600' },
  { id: 'gemini-3.1-flash-lite', name: 'Gemini 3.1 Flash Lite', icon: GeminiIcon, color: 'text-purple-500', btnBg: 'bg-purple-500 hover:bg-purple-600' },
  { id: 'llama-3.1-8b-instant', name: 'Llama 3.1 8B', icon: Groq, color: 'text-[#f55036]', btnBg: 'bg-[#f55036] hover:bg-[#e0402b]' },
  { id: 'llama-3.3-70b-versatile', name: 'Llama 3.3 70B', icon: Groq, color: 'text-[#f55036]', btnBg: 'bg-[#f55036] hover:bg-[#e0402b]' },
  { id: 'meta/llama-3.1-405b-instruct', name: 'Llama 3.1 405B', icon: Nvidia.Color, color: '', btnBg: 'bg-green-600 hover:bg-green-700' },
  { id: 'nvidia/nemotron-4-340b-instruct', name: 'Nemotron 340B', icon: Nvidia.Color, color: '', btnBg: 'bg-green-600 hover:bg-green-700' },
  { id: 'openai/gpt-oss-120b', name: 'GPT OSS 120B', icon: OpenAI, color: 'text-slate-800 dark:text-gray-200', btnBg: 'bg-slate-700 hover:bg-slate-800' },
  { id: 'openai/gpt-oss-20b', name: 'GPT OSS 20B', icon: OpenAI, color: 'text-slate-800 dark:text-gray-200', btnBg: 'bg-slate-700 hover:bg-slate-800' }
];

const ACTIVITY_DATA = Array.from({ length: 30 }).map((_, i) => {
  const d = new Date();
  d.setDate(d.getDate() - (29 - i));
  const hasTest = i % 4 !== 0 && i !== 2 && i !== 7; 
  const count = hasTest ? (i % 3 === 0 ? 3 : (i % 2 === 0 ? 2 : 1)) : 0;
  const successRate = hasTest ? 50 + (i * 2.5) % 50 : 0; // between 50 and 100
  return {
    date: d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
    count,
    successRate: Math.round(successRate)
  };
});

const getHeatmapColor = (count: number, success: number) => {
  if (count === 0) return "bg-slate-100 dark:bg-white/5";
  
  if (success >= 80) {
      if (count === 1) return "bg-emerald-200 dark:bg-emerald-900/40";
      if (count === 2) return "bg-emerald-400 dark:bg-emerald-700/60 text-emerald-900 dark:text-emerald-100";
      return "bg-emerald-500 dark:bg-emerald-500 text-white";
  } else if (success >= 60) {
      if (count === 1) return "bg-amber-200 dark:bg-amber-900/40";
      if (count === 2) return "bg-amber-400 dark:bg-amber-700/60";
      return "bg-amber-500 dark:bg-amber-500 text-white";
  } else {
      if (count === 1) return "bg-rose-200 dark:bg-rose-900/40";
      if (count === 2) return "bg-rose-400 dark:bg-rose-700/60";
      return "bg-rose-500 dark:bg-rose-500 text-white";
  }
};

export default function StudentDashboard() {
  const [isModelSelectorOpen, setIsModelSelectorOpen] = React.useState(false);
  const [isPremiumOpen, setIsPremiumOpen] = React.useState(false);
  const [isThinkingEnabled, setIsThinkingEnabled] = React.useState(false);
  const [selectedModel, setSelectedModel] = React.useState(MODELS[0]); // Default to Gemini
  const [prompt, setPrompt] = React.useState("");
  const navigate = useNavigate();

  const handleGlobalChatSubmit = () => {
    if (prompt.trim()) {
      navigate(`/chat?prompt=${encodeURIComponent(prompt.trim())}&model=${selectedModel.id}`);
    }
  };

  const handleGlobalChatKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      handleGlobalChatSubmit();
    }
  };
  
  return (
    <div className="w-full h-full max-w-5xl mx-auto space-y-10">
      
      {/* Welcome Banner */}
      <motion.div 
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <h1 className="text-3xl md:text-4xl font-extrabold text-slate-900 dark:text-gray-100 font-serif tracking-tight mb-8">
          Morning, Aditya
        </h1>

        {/* Feature Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
           <div onClick={() => navigate('/chat')} className="bg-white dark:bg-[#1f1f1f] border border-slate-200 dark:border-white/5 p-6 rounded-2xl shadow-sm hover:shadow-md transition-shadow cursor-pointer flex flex-col items-start gap-4">
             <div className="w-10 h-10 rounded-full bg-slate-100 dark:bg-white/10 flex items-center justify-center text-slate-700 dark:text-gray-300">
               <UploadCloud className="w-5 h-5" />
             </div>
             <div>
                <h3 className="font-semibold text-slate-900 dark:text-gray-200 text-[15px]">Upload Content</h3>
                <p className="text-sm text-slate-500 dark:text-gray-500 mt-1">PDF, video, slides, web</p>
             </div>
           </div>

           <div onClick={() => navigate('/chat?type=podcast')} className="bg-white dark:bg-[#1f1f1f] border border-slate-200 dark:border-white/5 p-6 rounded-2xl shadow-sm hover:shadow-md transition-shadow cursor-pointer flex flex-col items-start gap-4">
             <div className="w-10 h-10 rounded-full bg-blue-100 dark:bg-blue-500/20 flex items-center justify-center text-blue-600 dark:text-blue-400">
               <Film className="w-5 h-5" />
             </div>
             <div>
                <h3 className="font-semibold text-slate-900 dark:text-gray-200 text-[15px]">AI Video Lectures</h3>
                <p className="text-sm text-slate-500 dark:text-gray-500 mt-1">Turn notes into a lecture</p>
             </div>
           </div>

           <div onClick={() => navigate('/flashcards')} className="bg-white dark:bg-[#1f1f1f] border border-slate-200 dark:border-white/5 p-6 rounded-2xl shadow-sm hover:shadow-md transition-shadow cursor-pointer flex flex-col items-start gap-4">
             <div className="w-10 h-10 rounded-full bg-yellow-100 dark:bg-yellow-500/20 flex items-center justify-center text-yellow-600 dark:text-yellow-500">
               <Layers className="w-5 h-5" />
             </div>
             <div>
                <h3 className="font-semibold text-slate-900 dark:text-gray-200 text-[15px]">AI Flashcards</h3>
                <p className="text-sm text-slate-500 dark:text-gray-500 mt-1">Study-ready cards</p>
             </div>
           </div>
        </div>

        {/* Global Action Bar */}
        <div className="w-full bg-[#f4f4f5] dark:bg-[#212121] border border-slate-200 dark:border-white/5 rounded-full pl-4 pr-1.5 py-1.5 flex items-center gap-3 shadow-sm focus-within:ring-1 focus-within:ring-indigo-500 transition-all mb-10 relative">
           <Paperclip className="w-4 h-4 text-slate-500 dark:text-slate-400 shrink-0" />
           <input 
             type="text" 
             value={prompt}
             onChange={(e) => setPrompt(e.target.value)}
             onKeyDown={handleGlobalChatKeyDown}
             placeholder="Chat with Scholarly AI: Create Slides, Study Guides, Solve Homework, ..." 
             className="flex-1 bg-transparent border-none outline-none text-[15px] font-medium text-slate-800 dark:text-gray-200 placeholder:text-slate-500 dark:placeholder:text-gray-500 min-w-0"
           />
           <div className="flex items-center gap-1 shrink-0 relative">
             <button className={cn("w-8 h-8 rounded-full flex items-center justify-center text-white transition-colors relative", selectedModel.btnBg)}>
               <selectedModel.icon className="w-4 h-4" />
             </button>
             
             <div className="relative">
               <button 
                 onClick={() => setIsModelSelectorOpen(!isModelSelectorOpen)}
                 className="w-8 h-8 rounded-full flex items-center justify-center text-slate-500 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-white/10 transition-colors"
               >
                 <BrainCircuit className="w-4 h-4" />
               </button>

               {/* Model Selector Dropdown */}
               <AnimatePresence>
                 {isModelSelectorOpen && (
                   <>
                     <div className="fixed inset-0 z-40" onClick={() => setIsModelSelectorOpen(false)} />
                     <motion.div 
                       initial={{ opacity: 0, y: 10, scale: 0.95 }}
                       animate={{ opacity: 1, y: 0, scale: 1 }}
                       exit={{ opacity: 0, y: 10, scale: 0.95 }}
                       transition={{ duration: 0.15 }}
                       className="absolute top-full right-0 mt-2 z-50 w-64 bg-white dark:bg-[#2f2f2f] rounded-2xl border border-slate-200 dark:border-white/10 shadow-xl overflow-hidden py-2"
                     >
                     <div className="px-3 py-1.5">
                       <h3 className="text-xs font-bold text-slate-500 dark:text-slate-400 mb-1 px-2">Models</h3>
                       {MODELS.map((model) => (
                         <button 
                           key={model.id}
                           onClick={() => { setSelectedModel(model); setIsModelSelectorOpen(false); }}
                           className={cn(
                             "w-full flex items-center gap-3 px-2 py-2 rounded-xl text-left transition-colors",
                             selectedModel.id === model.id 
                               ? "bg-slate-50 dark:bg-white/5 border border-slate-200/50 dark:border-white/5" 
                               : "hover:bg-slate-100 dark:hover:bg-white/5"
                           )}
                         >
                           <model.icon className={cn("w-4 h-4", model.color)} />
                           <span className="text-sm font-semibold text-slate-900 dark:text-white">{model.name}</span>
                         </button>
                       ))}
                     </div>

                     <div className="px-3 py-1.5 mt-1 border-t border-slate-100 dark:border-white/5">
                       <button 
                         className="w-full flex items-center justify-between px-2 py-2 rounded-xl hover:bg-slate-100 dark:hover:bg-white/5 text-left transition-colors group"
                         onClick={() => setIsPremiumOpen(!isPremiumOpen)}
                       >
                         <span className="text-sm font-bold text-slate-900 dark:text-white">Premium Models</span>
                         <ChevronRight className="w-4 h-4 text-slate-400 group-hover:text-slate-600 dark:group-hover:text-slate-300" />
                       </button>
                     </div>

                     <div className="px-3 py-1.5 mt-1 border-t border-slate-100 dark:border-white/5">
                       <div className="flex items-center justify-between px-2 py-2">
                         <div className="flex items-center gap-3">
                           <Brain className="w-4 h-4 text-slate-500" />
                           <div>
                             <span className="block text-sm font-semibold text-slate-900 dark:text-white">Thinking</span>
                             <span className="block text-xs text-slate-500 dark:text-slate-400">Upgrade to turn on<br/>thinking</span>
                           </div>
                         </div>
                         <label className="relative inline-flex items-center cursor-pointer">
                           <input type="checkbox" className="sr-only peer" checked={isThinkingEnabled} onChange={() => setIsThinkingEnabled(!isThinkingEnabled)} />
                           <div className="w-9 h-5 bg-slate-200 peer-focus:outline-none rounded-full peer dark:bg-slate-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all dark:border-slate-600 peer-checked:bg-indigo-500"></div>
                         </label>
                       </div>
                     </div>

                     <div className="px-3 py-1.5 mt-1 border-t border-slate-100 dark:border-white/5">
                       <button className="w-full flex items-center gap-3 px-2 py-2 rounded-xl hover:bg-slate-100 dark:hover:bg-white/5 text-left transition-colors">
                         <PenTool className="w-4 h-4 text-slate-500" />
                         <span className="text-sm font-semibold text-slate-900 dark:text-white">Custom Instructions</span>
                       </button>
                     </div>
                   </motion.div>
                 </>
               )}
               </AnimatePresence>
             </div>

             <button className="w-8 h-8 rounded-full flex items-center justify-center text-slate-500 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-white/10 transition-colors">
               <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-audio-lines"><path d="M2 10v3"/><path d="M6 6v11"/><path d="M10 3v18"/><path d="M14 8v7"/><path d="M18 5v13"/><path d="M22 10v3"/></svg>
             </button>
             <button onClick={handleGlobalChatSubmit} className="w-8 h-8 rounded-full bg-slate-200 dark:bg-white/10 hover:bg-slate-300 dark:hover:bg-white/20 flex items-center justify-center text-slate-600 dark:text-slate-300 transition-colors ml-1 cursor-pointer">
               <ArrowUp className="w-4 h-4" />
             </button>
           </div>
        </div>
      </motion.div>

      {/* Content Shortcuts */}
      <motion.div 
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
      >
        <h2 className="text-sm font-semibold text-slate-800 dark:text-gray-300 flex items-center gap-2 mb-4">
          <svg className="w-4 h-4 text-slate-400 dark:text-gray-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z"/></svg>
          Content
        </h2>
        <div className="flex flex-wrap gap-3">
          {SHORTCUTS.map((shortcut, idx) => (
             <button 
               key={idx} 
               onClick={() => navigate(shortcut.path)}
               className="flex items-center gap-2 px-4 py-2 rounded-full border border-slate-200 dark:border-white/10 bg-white dark:bg-[#1a1a1a] hover:bg-slate-50 dark:hover:bg-white/5 transition-colors text-sm font-medium text-slate-700 dark:text-gray-300 shadow-sm"
             >
               <div className={cn("p-1.5 rounded-full", shortcut.bg, shortcut.color)}>
                 <shortcut.icon className="w-3.5 h-3.5" />
               </div>
               {shortcut.label}
             </button>
          ))}
        </div>
      </motion.div>

      {/* Folders */}
      <motion.div 
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
      >
        <div className="flex items-center justify-between mb-4 px-2">
          <h2 className="text-sm font-semibold text-slate-800 dark:text-gray-300 flex items-center gap-2">
            <FolderOpen className="w-4 h-4 text-slate-400 dark:text-gray-500" /> Folders <span className="text-xs text-slate-400 dark:text-gray-600 font-normal">1</span>
          </h2>
          <button className="text-xs font-medium text-slate-500 dark:text-gray-400 flex items-center gap-1.5 hover:text-slate-800 dark:hover:text-gray-200 transition-colors">
            <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m18 15-6-6-6 6"/></svg>
            AI Organizer
          </button>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
           {/* Current folders */}
           <div className="bg-white dark:bg-[#1f1f1f] border border-slate-200 dark:border-white/5 p-4 rounded-xl shadow-sm hover:shadow-md transition-shadow cursor-pointer flex items-center gap-3">
             <div className="w-10 h-10 rounded-lg bg-orange-50 dark:bg-white/5 flex items-center justify-center text-orange-400 dark:text-gray-500">
                <FolderOpen className="w-5 h-5" />
             </div>
             <div>
                <h3 className="text-sm font-semibold text-slate-900 dark:text-gray-200">Untitled</h3>
                <p className="text-xs text-slate-500 dark:text-gray-500">0 items</p>
             </div>
           </div>

           {/* New folder */}
           <button className="bg-transparent border border-dashed border-slate-300 dark:border-white/20 p-4 rounded-xl flex items-center justify-center gap-2 text-sm font-medium text-slate-500 dark:text-gray-400 hover:text-slate-800 dark:hover:text-gray-200 hover:bg-slate-50 dark:hover:bg-white/5 transition-colors">
             <Plus className="w-4 h-4" /> New folder
           </button>
        </div>
      </motion.div>

      {/* Activity Heatmap */}
      <motion.div 
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3 }}
      >
        <div className="flex items-center justify-between mb-4 px-2 mt-10">
          <h2 className="text-sm font-semibold text-slate-800 dark:text-gray-300 flex items-center gap-2">
            <Activity className="w-4 h-4 text-slate-400 dark:text-gray-500" /> Activity (Last 30 Days)
          </h2>
        </div>
        
        <div className="bg-white dark:bg-[#1f1f1f] border border-slate-200 dark:border-white/5 p-6 rounded-2xl shadow-sm">
          <div className="flex items-center gap-6 mb-6">
             <div className="flex flex-col">
               <span className="text-2xl font-bold text-slate-900 dark:text-white">21</span>
               <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">Tests Taken</span>
             </div>
             <div className="w-px h-8 bg-slate-200 dark:bg-white/10" />
             <div className="flex flex-col">
               <span className="text-2xl font-bold text-slate-900 dark:text-white">76%</span>
               <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">Avg. Success Rate</span>
             </div>
          </div>
          
          <div className="flex flex-wrap gap-1.5 md:gap-2">
             {ACTIVITY_DATA.map((day, idx) => (
                <div key={idx} className="relative group">
                  <div className={cn("w-5 h-5 md:w-6 md:h-6 rounded-md transition-colors", getHeatmapColor(day.count, day.successRate))} />
                  
                  {/* Tooltip */}
                  <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 hidden group-hover:flex flex-col items-center z-10 w-max bg-slate-900 dark:bg-black text-white px-3 py-2 rounded-lg shadow-xl pointer-events-none">
                     <span className="text-xs font-bold mb-1 text-slate-200">{day.date}</span>
                     {day.count > 0 ? (
                       <div className="flex flex-col gap-0.5 text-[11px] font-medium items-center">
                         <span>{day.count} test{day.count > 1 ? 's' : ''} taken</span>
                         <span className={
                           day.successRate >= 80 ? "text-emerald-400" :
                           day.successRate >= 60 ? "text-amber-400" : "text-rose-400"
                         }>{day.successRate}% avg score</span>
                       </div>
                     ) : (
                       <span className="text-[11px] font-medium text-slate-400">No tests taken</span>
                     )}
                     <div className="absolute top-full left-1/2 -translate-x-1/2 -mt-px border-4 border-transparent border-t-slate-900 dark:border-t-black" />
                  </div>
                </div>
             ))}
          </div>
          
          <div className="mt-6 flex flex-col md:flex-row items-start md:items-center justify-between text-[11px] font-medium text-slate-500 dark:text-slate-400 gap-4 md:gap-0">
             <div className="flex flex-wrap items-center gap-4">
               <div className="flex items-center gap-1.5">
                  <div className="w-2.5 h-2.5 rounded-[3px] bg-slate-100 dark:bg-white/5" />
                  <span>0 tests</span>
               </div>
               <div className="flex items-center gap-1.5">
                  <div className="flex gap-[2px]">
                    <div className="w-2.5 h-2.5 rounded-[3px] bg-indigo-200 dark:bg-indigo-900/40" />
                    <div className="w-2.5 h-2.5 rounded-[3px] bg-indigo-400 dark:bg-indigo-700/60" />
                    <div className="w-2.5 h-2.5 rounded-[3px] bg-indigo-500 dark:bg-indigo-500" />
                  </div>
                  <span>Frequency</span>
               </div>
             </div>
             
             <div className="flex flex-wrap items-center gap-4">
               <div className="flex items-center gap-1.5">
                  <div className="w-2.5 h-2.5 rounded-[3px] bg-emerald-400" />
                  <span>≥80%</span>
               </div>
               <div className="flex items-center gap-1.5">
                  <div className="w-2.5 h-2.5 rounded-[3px] bg-amber-400" />
                  <span>60-79%</span>
               </div>
               <div className="flex items-center gap-1.5">
                  <div className="w-2.5 h-2.5 rounded-[3px] bg-rose-400" />
                  <span>&lt;60%</span>
               </div>
             </div>
          </div>
        </div>
      </motion.div>

      {/* AI-Recommended Tests */}
      <motion.div 
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.35 }}
      >
        <div className="flex items-center justify-between mb-4 px-2 mt-10">
          <div className="flex flex-col">
            <h2 className="text-sm font-semibold text-slate-800 dark:text-gray-300 flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-purple-500" /> AI-Recommended Tests
            </h2>
            <p className="text-[11px] text-slate-500 font-medium ml-6 mt-0.5">Based on your recent underperformance in History and Algebra</p>
          </div>
          <span className="text-xs font-semibold text-indigo-500 hover:text-indigo-600 cursor-pointer">Explore All</span>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="bg-[#fcf8ff] dark:bg-[#282236] border border-purple-100 dark:border-purple-500/20 p-5 rounded-2xl shadow-sm flex items-start gap-4 hover:border-purple-300 dark:hover:border-purple-500/40 transition-colors">
            <div className="w-10 h-10 rounded-xl bg-purple-100 dark:bg-purple-900/40 flex items-center justify-center shrink-0">
               <FileText className="w-5 h-5 text-purple-600 dark:text-purple-400" />
            </div>
            <div className="flex-1">
               <div className="flex items-center justify-between mb-1">
                 <h3 className="text-sm font-bold text-slate-900 dark:text-white">Modern Indian History - Weak Area Focus</h3>
                 <span className="text-[10px] font-bold px-2 py-0.5 bg-purple-100 dark:bg-purple-500/20 text-purple-700 dark:text-purple-300 rounded-full">New</span>
               </div>
               <p className="text-xs text-slate-600 dark:text-slate-400 font-medium mb-3">Targeting your 45% success rate in 1857 Revolt concepts.</p>
               
               <div className="flex items-center gap-4 text-[11px] font-medium text-slate-500 dark:text-slate-400 mb-4">
                 <div className="flex items-center gap-1.5"><Clock className="w-3.5 h-3.5" /> 30 Mins</div>
                 <div className="flex items-center gap-1.5"><HelpCircle className="w-3.5 h-3.5" /> 20 Questions</div>
               </div>
               
               <button className="w-full py-2 bg-purple-600 hover:bg-purple-700 text-white text-xs font-bold rounded-lg transition-colors">
                 Start Recommended Test
               </button>
            </div>
          </div>

          <div className="bg-[#fcf8ff] dark:bg-[#282236] border border-purple-100 dark:border-purple-500/20 p-5 rounded-2xl shadow-sm flex items-start gap-4 hover:border-purple-300 dark:hover:border-purple-500/40 transition-colors">
            <div className="w-10 h-10 rounded-xl bg-purple-100 dark:bg-purple-900/40 flex items-center justify-center shrink-0">
               <FileText className="w-5 h-5 text-purple-600 dark:text-purple-400" />
            </div>
            <div className="flex-1">
               <div className="flex items-center justify-between mb-1">
                 <h3 className="text-sm font-bold text-slate-900 dark:text-white">Algebraic Equations - Concept Check</h3>
               </div>
               <p className="text-xs text-slate-600 dark:text-slate-400 font-medium mb-3">Addressing your mistakes in linear equations and inequalities.</p>
               
               <div className="flex items-center gap-4 text-[11px] font-medium text-slate-500 dark:text-slate-400 mb-4">
                 <div className="flex items-center gap-1.5"><Clock className="w-3.5 h-3.5" /> 25 Mins</div>
                 <div className="flex items-center gap-1.5"><HelpCircle className="w-3.5 h-3.5" /> 15 Questions</div>
               </div>
               
               <button className="w-full py-2 bg-purple-600 hover:bg-purple-700 text-white text-xs font-bold rounded-lg transition-colors">
                 Start Recommended Test
               </button>
            </div>
          </div>
        </div>
      </motion.div>

      {/* Achievements / Badges System */}
      <motion.div 
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.4 }}
      >
        <div className="flex items-center justify-between mb-4 px-2 mt-10">
          <h2 className="text-sm font-semibold text-slate-800 dark:text-gray-300 flex items-center gap-2">
            <Trophy className="w-4 h-4 text-slate-400 dark:text-gray-500" /> Recent Achievements
          </h2>
          <span className="text-xs font-semibold text-indigo-500 hover:text-indigo-600 cursor-pointer">View All</span>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-white dark:bg-[#1f1f1f] border border-slate-200 dark:border-white/5 p-5 rounded-2xl shadow-sm flex items-start gap-4 hover:border-indigo-200 dark:hover:border-indigo-500/30 transition-colors">
             <div className="w-12 h-12 rounded-full bg-yellow-50 dark:bg-yellow-500/10 flex items-center justify-center shrink-0 border border-yellow-200 dark:border-yellow-500/20">
               <Trophy className="w-6 h-6 text-yellow-500" />
             </div>
             <div>
               <h3 className="text-sm font-bold text-slate-900 dark:text-white mb-1">Top Scorer</h3>
               <p className="text-xs text-slate-500 dark:text-slate-400 font-medium">Scored 90%+ in 5 consecutive mock tests.</p>
               <div className="mt-3 flex items-center gap-2">
                 <div className="flex-1 h-1.5 bg-slate-100 dark:bg-white/5 rounded-full overflow-hidden">
                   <div className="h-full bg-yellow-500 rounded-full" style={{ width: '100%' }} />
                 </div>
                 <span className="text-[10px] font-bold text-yellow-500">Unlocked!</span>
               </div>
             </div>
          </div>

          <div className="bg-white dark:bg-[#1f1f1f] border border-slate-200 dark:border-white/5 p-5 rounded-2xl shadow-sm flex items-start gap-4 hover:border-emerald-200 dark:hover:border-emerald-500/30 transition-colors">
             <div className="w-12 h-12 rounded-full bg-emerald-50 dark:bg-emerald-500/10 flex items-center justify-center shrink-0 border border-emerald-200 dark:border-emerald-500/20">
               <Flame className="w-6 h-6 text-emerald-500" />
             </div>
             <div>
               <h3 className="text-sm font-bold text-slate-900 dark:text-white mb-1">Consistent Learner</h3>
               <p className="text-xs text-slate-500 dark:text-slate-400 font-medium">Logged in and studied for 7 days in a row.</p>
               <div className="mt-3 flex items-center gap-2">
                 <div className="flex-1 h-1.5 bg-slate-100 dark:bg-white/5 rounded-full overflow-hidden">
                   <div className="h-full bg-emerald-500 rounded-full" style={{ width: '100%' }} />
                 </div>
                 <span className="text-[10px] font-bold text-emerald-500">Unlocked!</span>
               </div>
             </div>
          </div>

          <div className="bg-white dark:bg-[#1f1f1f] border border-slate-200 dark:border-white/5 p-5 rounded-2xl shadow-sm flex items-start gap-4 hover:border-purple-200 dark:hover:border-purple-500/30 transition-colors">
             <div className="w-12 h-12 rounded-full bg-purple-50 dark:bg-purple-500/10 flex items-center justify-center shrink-0 border border-slate-100 dark:border-white/5">
               <Zap className="w-6 h-6 text-slate-300 dark:text-slate-600" />
             </div>
             <div className="opacity-70 dark:opacity-50">
               <h3 className="text-sm font-bold text-slate-900 dark:text-white mb-1 hover:text-indigo-500 transition-colors cursor-default">Speedy Solver</h3>
               <p className="text-xs text-slate-500 dark:text-slate-400 font-medium">Complete a test in under 60% of allotted time.</p>
               <div className="mt-3 flex items-center gap-2">
                 <div className="flex-1 h-1.5 bg-slate-100 dark:bg-white/5 rounded-full overflow-hidden">
                   <div className="h-full bg-purple-500 rounded-full" style={{ width: '40%' }} />
                 </div>
                 <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400">2/5 Tests</span>
               </div>
             </div>
          </div>
        </div>
      </motion.div>

    </div>
  );
}
