import React, { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  ChevronDown, 
  Sparkles, 
  Paperclip, 
  Mic, 
  ArrowUp,
  Bot,
  Copy,
  Check,
  Volume2,
  VolumeX,
  RefreshCw,
  MessageSquare,
  Plus,
  Loader2,
  Clock,
  PanelLeftClose,
  PanelLeft,
  Trash2,
  Settings,
  Wand2,
  X,
  Lightbulb,
  BookOpen,
  Globe,
  Calculator,
  FileText,
  UserPlus,
  MoreVertical,
  Upload,
  Brain,
  Network,
  ChevronRight,
  FileDown,
  Book, UploadCloud, History, Bookmark, Search, GraduationCap, Target, RefreshCcw, Layers, Map, Download
} from 'lucide-react';
import { ExportDialog } from '../components/export/ExportDialog';
import { generateStudyGuidePDF } from '../services/exportService';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '../lib/utils';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useNotebooks, useNotebookSources } from '../hooks/ai/useNotebook';
import { useWorkflowStream } from '../hooks/ai/useWorkflowStream';
import { ChatMessageList, ChatMessage } from '../components/chat/ChatMessageList';
import { CitationViewerPanel } from '../components/chat/CitationViewerPanel';
import { useKnowledgeGraph, useAssets } from '../hooks/ai/useNotebook';
import { KnowledgeGraphViewer } from 'shared-ui';
import { AssetsTab } from '../components/assets/AssetsTab';
import { AssetViewer } from '../components/assets/AssetViewer';
import { LearningAsset, DocumentSource } from '../types';
import { storage } from '../lib/storage';
import { ref, getDownloadURL } from 'firebase/storage';

const LEARNING_MODES = [
  { id: 'TEACHER', label: 'Teacher Mode', icon: GraduationCap, color: 'text-indigo-500', bg: 'bg-indigo-500/10' },
  { id: 'REVISION', label: 'Revision Mode', icon: History, color: 'text-emerald-500', bg: 'bg-emerald-500/10' },
  { id: 'QUIZ', label: 'Quiz Master', icon: Target, color: 'text-rose-500', bg: 'bg-rose-500/10' },
  { id: 'PODCAST', label: 'Podcast Mode', icon: Mic, color: 'text-amber-500', bg: 'bg-amber-500/10' },
  { id: 'RESEARCH', label: 'Deep Research', icon: Search, color: 'text-blue-500', bg: 'bg-blue-500/10' },
];

const ONE_CLICK_ACTIONS = [
  { label: 'Summarize', icon: FileText },
  { label: 'Generate Flashcards', icon: Layers },
  { label: 'Mind Map', icon: Map },
  { label: 'Quiz Me', icon: Target },
];

import { ShareModal } from '../components/notebook/ShareModal';

export default function Notebooks() {
  // Lets an external link open a specific notebook (e.g. "Open" on a class resource in the
  // teacher workspace, or a student's class view) without this page needing a dedicated
  // /notebooks/:id route of its own — selection here has always lived in component state, and
  // a query param is the smallest change that makes it linkable from outside this page.
  const [searchParams] = useSearchParams();
  const requestedNotebookId = searchParams.get('open');

  const [activeNotebook, setActiveNotebook] = useState<string | null>(null);
  const [activeMode, setActiveMode] = useState('TEACHER');
  const [activeTab, setActiveTab] = useState<'CHAT' | 'GRAPH' | 'ASSETS'>('CHAT');
  const [isShareModalOpen, setIsShareModalOpen] = React.useState(false);
  const [isExportModalOpen, setIsExportModalOpen] = React.useState(false);
  const [exportState, setExportState] = React.useState<'idle' | 'preparing' | 'rendering_layout' | 'rendering_diagrams' | 'generating_pdf' | 'completed' | 'error'>('idle');
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);
  const [speakingIndex, setSpeakingIndex] = useState<number | null>(null);
  const [activeAsset, setActiveAsset] = useState<LearningAsset | null>(null);
  
  const [prompt, setPrompt] = useState('');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [activeCitation, setActiveCitation] = useState<any | null>(null);
  
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  
  const { notebooks, isLoading: isLoadingNotebooks, createNotebook } = useNotebooks();
  const { startStream, isStreaming, content: streamContent, citations: streamCitations, warnings: streamWarnings } = useWorkflowStream();
  const { graph, isLoading: isLoadingGraph } = useKnowledgeGraph(activeNotebook);
  const { assets, isLoading: isLoadingAssets } = useAssets(activeNotebook);
  
  // Auto-select: the requested notebook if the URL asked for one and it's actually in this
  // account's list (never trust the id blindly — e.g. a stale link to a since-detached
  // resource), otherwise fall back to the first notebook as before.
  React.useEffect(() => {
    if (activeNotebook || !notebooks?.length) return;
    const requested = requestedNotebookId && notebooks.find((n) => n.id === requestedNotebookId);
    setActiveNotebook(requested ? requested.id : notebooks[0].id);
  }, [notebooks, activeNotebook, requestedNotebookId]);

  const { sources, isUploading, uploadSource, uploadProgress } = useNotebookSources(activeNotebook);
  const [isDragging, setIsDragging] = React.useState(false);

  const handleUploadClick = () => {
    fileInputRef.current?.click();
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file && activeNotebook) {
      try {
        await uploadSource(file);
      } catch (err) {
        console.error("Failed to upload source", err);
      }
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      try {
        await uploadSource(file);
      } catch (err) {
        console.error("Failed to upload source", err);
      }
    }
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleDownloadPdf = async (e: React.MouseEvent, doc: DocumentSource) => {
    e.stopPropagation();
    if (!doc.gcsPath) return;
    
    try {
      const gsRef = ref(storage, doc.gcsPath);
      const url = await getDownloadURL(gsRef);
      // Create a temporary link to trigger download
      const link = document.createElement('a');
      link.href = url;
      link.download = doc.title;
      link.target = "_blank";
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (err) {
      console.error("Failed to download PDF:", err);
      alert("Could not download the file. It may no longer exist.");
    }
  };

  const handleNewNotebook = async () => {
    const title = window.prompt("Enter notebook title:");
    if (title) {
      await createNotebook({ title, color: 'bg-indigo-500' });
    }
  };

  const handleSendMessage = async () => {
    if (!prompt.trim() || !activeNotebook || isStreaming) return;
    
    const userMessage: ChatMessage = {
      id: Date.now().toString(),
      role: 'user',
      content: prompt.trim(),
      timestamp: Date.now()
    };
    
    setMessages(prev => [...prev, userMessage]);
    setPrompt('');
    
    try {
      const response = await startStream({
         notebookId: activeNotebook,
         message: userMessage.content,
         mode: activeMode,
      });
      
      const assistantMessage: ChatMessage = {
         id: (Date.now() + 1).toString(),
         role: 'assistant',
         content: response.content,
         timestamp: Date.now(),
         citations: response.data?.citations || [],
         warnings: response.data?.warnings || [],
      };
      
      setMessages(prev => [...prev, assistantMessage]);
    } catch (err) {
      console.error('Chat error:', err);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const handleExport = async (selection: any) => {
    if (!activeNotebook) return;
    const nb = notebooks.find(n => n.id === activeNotebook);
    if (!nb) return;

    try {
      setExportState('preparing');
      // @ts-ignore
      await generateStudyGuidePDF(nb, assets || [], selection, nb.owner || 'Student', (state) => {
        setExportState(state as any);
      });
      setExportState('completed');
    } catch (err) {
      console.error('Export error:', err);
      setExportState('error');
    }
  };

  // When streaming, we append a temporary message
  const displayMessages = [...messages];
  if (isStreaming && streamContent) {
    displayMessages.push({
      id: 'stream',
      role: 'assistant',
      content: streamContent,
      timestamp: Date.now(),
      citations: streamCitations,
      warnings: streamWarnings
    });
  }

  return (
    <div className="flex w-full h-[calc(100vh-80px)] bg-[#fafbfc] dark:bg-[#131315] overflow-hidden font-sans">
      
      {/* LEFT SIDEBAR: NOTEBOOK MANAGEMENT */}
      <div className="w-[280px] bg-white dark:bg-[#111113] border-r border-slate-200/80 dark:border-white/10 flex flex-col h-full flex-shrink-0 relative z-20 shadow-2xs font-sans">
         <div className="p-4 border-b border-slate-200/80 dark:border-white/10">
           <button 
             onClick={handleNewNotebook}
             className="w-full flex items-center justify-center gap-2 bg-slate-900 hover:bg-slate-800 text-white dark:bg-white dark:hover:bg-slate-100 dark:text-slate-900 font-semibold py-2.5 px-4 rounded-xl transition-all shadow-xs active:scale-[0.98] text-[13px]">
             <Plus className="w-4 h-4 text-[#c8e558] dark:text-slate-900" />
             New Notebook
           </button>
         </div>

         <div className="flex-1 overflow-y-auto p-3 space-y-4 custom-scrollbar">
           <div>
             <h3 className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-2 px-2">Your Notebooks</h3>
             {notebooks.filter(nb => nb.owner === (nb as any).userId).map(nb => (
               <button
                 key={nb.id}
                 onClick={() => setActiveNotebook(nb.id)}
                 className={cn(
                   "w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-left transition-all",
                   activeNotebook === nb.id 
                     ? "bg-slate-100/90 dark:bg-white/[0.08] shadow-2xs border border-slate-200/80 dark:border-white/10 text-slate-900 dark:text-white font-semibold" 
                     : "hover:bg-slate-50 dark:hover:bg-white/[0.04] text-slate-700 dark:text-slate-300 font-medium"
                 )}
               >
                 <div className={cn("w-2.5 h-2.5 rounded-full shrink-0", nb.color || "bg-[#8ba32b] dark:bg-[#c8e558]")} />
                 <span className="text-[13px] truncate">{nb.title}</span>
               </button>
             ))}
           </div>
           
           <div>
             <h3 className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-2 px-2 mt-4">Shared with me</h3>
             {notebooks.filter(nb => nb.owner !== (nb as any).userId).map(nb => (
               <button
                 key={nb.id}
                 onClick={() => setActiveNotebook(nb.id)}
                 className={cn(
                   "w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-left transition-all opacity-80",
                   activeNotebook === nb.id 
                     ? "bg-slate-100/90 dark:bg-white/[0.08] shadow-2xs border border-slate-200/80 dark:border-white/10 text-slate-900 dark:text-white font-semibold" 
                     : "hover:bg-slate-50 dark:hover:bg-white/[0.04] text-slate-700 dark:text-slate-300 font-medium"
                 )}
               >
                 <div className={cn("w-2.5 h-2.5 rounded-full shrink-0", nb.color || "bg-slate-400")} />
                 <span className="text-[13px] truncate">{nb.title}</span>
               </button>
             ))}
           </div>
         </div>

         <div className="p-3.5 border-t border-slate-200/80 dark:border-white/10">
            <button className="flex items-center gap-2 text-[12.5px] font-medium text-slate-500 hover:text-slate-900 dark:hover:text-white transition-colors px-2">
              <Settings className="w-4 h-4 text-slate-400" />
              Notebook Settings
            </button>
         </div>
      </div>
      
      {/* CENTER: CHAT INTERFACE & CITATION VIEWER */}
      <div className="flex-1 flex flex-col relative h-full bg-[#fafbfc] dark:bg-[#0b0b0c] min-w-0">
         
         {/* Top Bar: Learning Modes */}
         <div className="h-14 border-b border-slate-200/80 dark:border-white/10 flex items-center justify-between px-5 bg-white/80 dark:bg-[#141416]/90 backdrop-blur-md">
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 rounded-lg bg-slate-900 dark:bg-white flex items-center justify-center shadow-xs">
                  <Brain className="w-3.5 h-3.5 text-[#c8e558] dark:text-slate-900" />
                </div>
                <span className="text-[13.5px] font-semibold text-slate-900 dark:text-white">Sadhya AI Studio</span>
              </div>
              
              <div className="h-4 w-px bg-slate-200 dark:bg-white/10 mx-1" />
              
              <div className="flex rounded-full bg-slate-100/90 dark:bg-white/[0.04] border border-slate-200/80 dark:border-white/10 p-0.5">
                {(['CHAT', 'GRAPH', 'ASSETS'] as const).map(tab => (
                  <button
                    key={tab}
                    onClick={() => setActiveTab(tab)}
                    className={cn(
                      "px-3 py-1 rounded-full text-[12px] font-semibold transition-all",
                      activeTab === tab 
                        ? "bg-white dark:bg-[#1f1f23] text-slate-900 dark:text-white shadow-xs" 
                        : "text-slate-500 hover:text-slate-900 dark:hover:text-white"
                    )}
                  >
                    {tab.charAt(0) + tab.slice(1).toLowerCase()}
                  </button>
                ))}
              </div>

              <div className="h-4 w-px bg-slate-200 dark:bg-white/10 mx-1" />

              <div className="flex space-x-1 bg-slate-100/90 dark:bg-white/[0.04] border border-slate-200/80 dark:border-white/10 p-0.5 rounded-full">
                {LEARNING_MODES.slice(0, 3).map(mode => (
                  <button 
                    key={mode.id}
                    onClick={() => setActiveMode(mode.id)}
                    className={cn(
                      "flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11.5px] font-semibold transition-all",
                      activeMode === mode.id
                        ? "bg-white dark:bg-[#1f1f23] text-slate-900 dark:text-white shadow-xs"
                        : "text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
                    )}
                  >
                    <mode.icon className={cn("w-3 h-3", activeMode === mode.id ? "text-[#8ba32b] dark:text-[#c8e558]" : "text-slate-400")} />
                    {mode.label}
                  </button>
                ))}
                <button className="px-2 py-1 text-slate-400 hover:text-slate-600 dark:hover:text-white">
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {activeNotebook && (
                <>
                  <button 
                    onClick={() => setIsExportModalOpen(true)}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-white dark:bg-white/[0.04] border border-slate-200 dark:border-white/10 hover:bg-slate-50 dark:hover:bg-white/[0.08] text-slate-700 dark:text-slate-200 text-[12px] font-semibold rounded-lg transition-colors shadow-2xs"
                  >
                    <FileDown className="w-3.5 h-3.5 text-[#8ba32b] dark:text-[#c8e558]" />
                    Export PDF
                  </button>
                  <button 
                    onClick={() => setIsShareModalOpen(true)}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-900 hover:bg-slate-800 text-white dark:bg-[#c8e558] dark:hover:bg-[#bcd94c] dark:text-slate-900 text-[12px] font-semibold rounded-lg transition-all shadow-xs"
                  >
                    <UserPlus className="w-3.5 h-3.5" />
                    Share
                  </button>
                </>
              )}
            </div>
         </div>
         
         {/* Share Modal */}
         {isShareModalOpen && activeNotebook && (
           <ShareModal notebookId={activeNotebook} onClose={() => setIsShareModalOpen(false)} />
         )}

         {/* Tab Content */}
         {activeTab === 'CHAT' && (
           <>
             {/* Chat History Area */}
             <div className="flex-1 overflow-y-auto p-6 md:p-8 space-y-8 custom-scrollbar">
                {displayMessages.length === 0 ? (
                  /* Initial empty state */
                  <div className="flex flex-col items-center justify-center h-full text-center max-w-lg mx-auto mt-16">
                    <div className="w-14 h-14 rounded-2xl bg-slate-900 dark:bg-white flex items-center justify-center mb-5 shadow-xs">
                       <Brain className="w-7 h-7 text-[#c8e558] dark:text-slate-900" />
                    </div>
                    <h2 className="text-[24px] sm:text-[26px] font-semibold text-slate-900 dark:text-white tracking-[-0.025em] mb-2">
                      Your Learning Workspace
                    </h2>
                    <p className="text-[13.5px] text-slate-500 dark:text-slate-400 mb-7 leading-relaxed max-w-md">
                      Upload your study materials, and I'll act as your personal tutor. Every answer is grounded in your documents with precise citations.
                    </p>

                    <div className="flex flex-wrap justify-center gap-2.5 w-full">
                      {ONE_CLICK_ACTIONS.map((action, i) => (
                        <button key={i} className="flex items-center gap-2 px-3.5 py-2 bg-white dark:bg-white/[0.04] border border-slate-200/90 dark:border-white/10 rounded-full text-[12.5px] font-medium text-slate-700 dark:text-slate-200 hover:border-[#8ba32b]/40 dark:hover:border-[#c8e558]/40 hover:bg-slate-50/80 dark:hover:bg-white/[0.06] hover:text-slate-900 dark:hover:text-white transition-all shadow-2xs">
                          <action.icon className="w-3.5 h-3.5 text-[#8ba32b] dark:text-[#c8e558]" />
                          {action.label}
                        </button>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="max-w-4xl mx-auto">
                    <ChatMessageList 
                      messages={displayMessages} 
                      isStreaming={isStreaming && !streamContent} 
                      onCitationClick={setActiveCitation} 
                    />
                  </div>
                )}
             </div>

             {/* Chat Input Bar */}
             <div className="p-5 pt-0">
               <div className="max-w-3xl mx-auto relative bg-white dark:bg-[#141416] rounded-2xl sm:rounded-3xl border border-slate-200/90 dark:border-white/10 shadow-xs focus-within:border-slate-400 dark:focus-within:border-white/25 focus-within:shadow-sm transition-all p-2 pl-3 flex items-center gap-2.5">
                 <button className="p-1.5 rounded-xl text-slate-400 hover:text-slate-800 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-white/[0.06] transition-colors shrink-0">
                   <Plus className="w-4 h-4" />
                 </button>
                 
                 <textarea 
                   value={prompt}
                   onChange={e => setPrompt(e.target.value)}
                   onKeyDown={handleKeyDown}
                   placeholder={`Ask anything in ${activeMode.toLowerCase()} mode...`}
                   className="flex-1 max-h-48 min-h-[40px] bg-transparent border-none outline-none resize-none text-[14px] text-slate-900 dark:text-white py-2 placeholder:text-slate-400 custom-scrollbar"
                   rows={1}
                 />

                 <button 
                   onClick={handleSendMessage}
                   disabled={!prompt.trim() || !activeNotebook || isStreaming}
                   className="w-8 h-8 rounded-full bg-slate-900 hover:bg-slate-800 text-white dark:bg-[#c8e558] dark:hover:bg-[#bcd94c] dark:text-slate-900 disabled:bg-slate-100 dark:disabled:bg-white/5 disabled:text-slate-400 dark:disabled:text-slate-600 disabled:cursor-not-allowed flex items-center justify-center transition-all shadow-xs shrink-0 active:scale-95"
                 >
                   <ArrowUp className="w-4 h-4" strokeWidth={2.5} />
                 </button>
               </div>
             </div>
           </>
         )}
         
         {activeTab === 'GRAPH' && (
           <div className="flex-1 overflow-hidden relative">
              {isLoadingGraph ? (
                 <div className="absolute inset-0 flex items-center justify-center">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#8ba32b] dark:border-[#c8e558]"></div>
                 </div>
              ) : (
                 <KnowledgeGraphViewer nodes={graph?.nodes || []} edges={graph?.edges || []} />
              )}
           </div>
         )}

         {activeTab === 'ASSETS' && (
           <div className="flex-1 flex overflow-hidden relative">
              {isLoadingAssets ? (
                 <div className="absolute inset-0 flex items-center justify-center">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#8ba32b] dark:border-[#c8e558]"></div>
                 </div>
              ) : activeAsset ? (
                 <AssetViewer asset={activeAsset} onBack={() => setActiveAsset(null)} />
              ) : (
                 <AssetsTab assets={assets} onSelect={setActiveAsset} />
              )}
           </div>
         )}
      </div>
      
      {/* RIGHT SIDEBAR: RESOURCE PANEL */}
      <div className="w-[320px] bg-white dark:bg-[#111113] border-l border-slate-200/80 dark:border-white/10 flex flex-col h-full flex-shrink-0 relative z-20 font-sans">
        
        {/* Render CitationViewerPanel absolute to right sidebar when active */}
        <AnimatePresence>
           {activeCitation && (
              <CitationViewerPanel 
                citation={activeCitation} 
                onClose={() => setActiveCitation(null)} 
              />
           )}
        </AnimatePresence>

        <div className="p-4 border-b border-slate-200/80 dark:border-white/10 flex justify-between items-center">
          <h3 className="font-semibold text-slate-900 dark:text-white flex items-center gap-2 text-[13.5px]">
            <Book className="w-4 h-4 text-[#8ba32b] dark:text-[#c8e558]" />
            Knowledge Base
          </h3>
          <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-slate-100 dark:bg-white/10 text-slate-600 dark:text-slate-300">{sources?.length || 0} Sources</span>
        </div>

        <div className="p-3.5">
          <input 
            type="file" 
            ref={fileInputRef} 
            style={{ display: 'none' }} 
            onChange={handleFileChange} 
          />
          <div 
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            onClick={handleUploadClick}
            className={cn(
              "w-full border-2 border-dashed rounded-2xl p-5 flex flex-col items-center justify-center gap-2.5 transition-all group relative overflow-hidden",
              isUploading 
                ? "border-[#8ba32b] bg-[#8ba32b]/5 dark:border-[#c8e558] dark:bg-[#c8e558]/5 opacity-90 cursor-not-allowed" 
                : isDragging 
                  ? "border-[#8ba32b] bg-[#8ba32b]/10 dark:border-[#c8e558] dark:bg-[#c8e558]/10 scale-[1.01]"
                  : "border-slate-200 dark:border-white/10 hover:border-[#8ba32b]/60 dark:hover:border-[#c8e558]/60 hover:bg-slate-50/70 dark:hover:bg-white/[0.02] cursor-pointer"
            )}
          >
            {isUploading && (
              <div 
                className="absolute left-0 bottom-0 top-0 bg-[#8ba32b]/10 dark:bg-[#c8e558]/10 transition-all duration-300 -z-10"
                style={{ width: `${uploadProgress}%` }}
              />
            )}
            <div className="w-9 h-9 rounded-xl bg-slate-100 dark:bg-white/5 text-slate-600 dark:text-slate-300 group-hover:text-[#8ba32b] dark:group-hover:text-[#c8e558] group-hover:scale-105 transition-all flex items-center justify-center z-10">
              {isUploading ? <RefreshCcw className="w-4 h-4 animate-spin text-[#8ba32b] dark:text-[#c8e558]" /> : <UploadCloud className="w-4 h-4" />}
            </div>
            <div className="text-center z-10">
              <p className="text-[13px] font-semibold text-slate-800 dark:text-white">
                {isUploading ? `Uploading... ${uploadProgress}%` : isDragging ? "Drop file here" : "Upload Source"}
              </p>
              <p className="text-[11px] text-slate-400 mt-0.5">PDF, DOCX, TXT, Images (Max 50MB)</p>
            </div>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-3.5 pb-3.5 space-y-2.5 custom-scrollbar">
          <h3 className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-2 px-1">Indexed Documents</h3>
          {sources?.map(doc => (
            <div key={doc.id} className="bg-white dark:bg-white/[0.03] p-3 rounded-xl border border-slate-200/80 dark:border-white/10 hover:border-slate-300 dark:hover:border-white/20 transition-all shadow-2xs cursor-pointer group">
              <div className="flex items-start gap-2.5">
                <div className={cn(
                  "w-7 h-7 rounded-lg flex items-center justify-center shrink-0 mt-0.5",
                  doc.type === 'PDF' ? "bg-red-50 text-red-500 dark:bg-red-500/10" : "bg-slate-100 text-slate-700 dark:bg-white/10 dark:text-slate-300"
                )}>
                  <FileText className="w-3.5 h-3.5" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[12.5px] font-semibold text-slate-800 dark:text-slate-100 truncate group-hover:text-slate-900 dark:group-hover:text-white transition-colors">
                    {doc.title}
                  </p>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-[10.5px] font-medium text-slate-500 bg-slate-100 dark:bg-white/5 px-1.5 py-0.5 rounded-md">
                      {doc.type}
                    </span>
                    {doc.totalPages && (
                      <span className="text-[10.5px] text-slate-400 flex items-center gap-1">
                        <Book className="w-3 h-3" /> {doc.totalPages} pages
                      </span>
                    )}
                    <span className={cn(
                      "text-[10px] flex items-center gap-1 ml-auto font-semibold px-1.5 py-0.5 rounded border",
                      doc.status === 'READY' ? "text-emerald-600 border-emerald-200 bg-emerald-50 dark:bg-emerald-500/10 dark:border-emerald-500/20" :
                      doc.status === 'FAILED' ? "text-red-600 border-red-200 bg-red-50 dark:bg-red-500/10 dark:border-red-500/20" :
                      "text-slate-600 border-slate-200 bg-slate-50 dark:bg-white/5 dark:border-white/10"
                    )}>
                      {doc.status !== 'READY' && doc.status !== 'FAILED' && <RefreshCcw className="w-2.5 h-2.5 animate-spin mr-0.5" />}
                      {doc.status}
                    </span>
                    {doc.gcsPath && (
                      <button 
                        onClick={(e) => handleDownloadPdf(e, doc)}
                        className="ml-1 p-1 rounded-md hover:bg-slate-100 dark:hover:bg-white/10 text-slate-400 hover:text-slate-900 dark:hover:text-white transition-colors"
                        title="Download PDF"
                      >
                        <Download className="w-3 h-3" />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
        
        {/* Verification Engine Status */}
        <div className="p-3.5 border-t border-slate-200/80 dark:border-white/10 bg-slate-50/60 dark:bg-white/[0.02]">
           <div className="flex items-center gap-2 text-[11.5px] font-semibold text-emerald-600 dark:text-emerald-400 mb-1">
             <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
             Hallucination Shield Active
           </div>
           <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-tight">Responses are cross-verified against your uploaded sources and citations are provided automatically.</p>
        </div>
      </div>

      <ExportDialog 
        isOpen={isExportModalOpen}
        onClose={() => setIsExportModalOpen(false)}
        onExport={handleExport}
        exportState={exportState}
      />
    </div>
  );
}
