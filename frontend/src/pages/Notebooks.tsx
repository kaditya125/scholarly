import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Book, Plus, UploadCloud, Brain, MessageSquare, 
  History, Bookmark, X, Search, FileText, ChevronRight, Settings, Lightbulb, User, GraduationCap, Mic, Target, RefreshCcw, Layers, Map
} from 'lucide-react';
import { cn } from '../lib/utils';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useNotebooks, useNotebookSources } from '../hooks/ai/useNotebook';
import { useWorkflowStream } from '../hooks/ai/useWorkflowStream';
import { ChatMessageList, ChatMessage } from '../components/chat/ChatMessageList';
import { CitationViewerPanel } from '../components/chat/CitationViewerPanel';
import { useKnowledgeGraph } from '../hooks/ai/useNotebook';
import { KnowledgeGraphViewer } from '../components/graph/KnowledgeGraphViewer';

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

export default function Notebooks() {
  const [activeNotebook, setActiveNotebook] = useState<string | null>(null);
  const [activeMode, setActiveMode] = useState('TEACHER');
  const [activeTab, setActiveTab] = useState<'CHAT' | 'GRAPH' | 'ASSETS'>('CHAT');
  const [prompt, setPrompt] = useState('');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [activeCitation, setActiveCitation] = useState<any | null>(null);
  
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  
  const { notebooks, isLoading: isLoadingNotebooks, createNotebook } = useNotebooks();
  const { startStream, isStreaming, content: streamContent, citations: streamCitations, warnings: streamWarnings } = useWorkflowStream();
  const { graph, isLoading: isLoadingGraph } = useKnowledgeGraph(activeNotebook);
  
  // Auto-select first notebook if none selected
  React.useEffect(() => {
    if (!activeNotebook && notebooks?.length > 0) {
      setActiveNotebook(notebooks[0].id);
    }
  }, [notebooks, activeNotebook]);

  const { sources, isUploading, uploadSource } = useNotebookSources(activeNotebook);

  const handleUploadClick = () => {
    fileInputRef.current?.click();
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
    <div className="flex w-full h-[calc(100vh-80px)] bg-slate-50 dark:bg-[#121212] overflow-hidden font-sans">
      
      {/* LEFT SIDEBAR: NOTEBOOK MANAGEMENT */}
      <div className="w-[280px] bg-white dark:bg-[#1a1a1a] border-r border-slate-200 dark:border-white/5 flex flex-col h-full flex-shrink-0 relative z-20 shadow-[4px_0_24px_rgb(0,0,0,0.02)]">
         <div className="p-5 border-b border-slate-100 dark:border-white/5">
           <button 
             onClick={handleNewNotebook}
             className="w-full flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-2.5 px-4 rounded-xl transition-all shadow-sm">
             <Plus className="w-4 h-4" />
             New Notebook
           </button>
         </div>

         <div className="flex-1 overflow-y-auto p-4 space-y-2">
           <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3 px-2">Your Notebooks</h3>
           {notebooks.map(nb => (
             <button
               key={nb.id}
               onClick={() => setActiveNotebook(nb.id)}
               className={cn(
                 "w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition-all",
                 activeNotebook === nb.id 
                   ? "bg-slate-100 dark:bg-white/10 shadow-sm border border-slate-200 dark:border-white/5" 
                   : "hover:bg-slate-50 dark:hover:bg-white/5 border border-transparent"
               )}
             >
               <div className={cn("w-3 h-3 rounded-full", nb.color)} />
               <span className="text-sm font-semibold text-slate-800 dark:text-gray-200 truncate">{nb.title}</span>
             </button>
           ))}
         </div>

         <div className="p-4 border-t border-slate-100 dark:border-white/5">
            <button className="flex items-center gap-2 text-sm text-slate-500 hover:text-slate-800 dark:hover:text-gray-300 transition-colors px-2">
              <Settings className="w-4 h-4" />
              Notebook Settings
            </button>
         </div>
      </div>
      
      {/* CENTER: CHAT INTERFACE & CITATION VIEWER */}
      <div className="flex-1 flex flex-col relative h-full bg-[#fcfcfc] dark:bg-[#141414]">
         
         {/* Top Bar: Learning Modes */}
         <div className="h-16 border-b border-slate-200 dark:border-white/5 flex items-center justify-between px-6 bg-white dark:bg-[#1a1a1a]">
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <Brain className="w-5 h-5 text-indigo-600" />
                <span className="font-bold text-slate-800 dark:text-gray-100">Scholarly AI Studio</span>
              </div>
              
              <div className="h-4 w-[1px] bg-slate-300 dark:bg-slate-700 mx-2" />
              
              <div className="flex space-x-4">
                {['CHAT', 'GRAPH', 'ASSETS'].map(tab => (
                  <button
                    key={tab}
                    onClick={() => setActiveTab(tab as any)}
                    className={cn(
                      "text-sm font-semibold transition-colors pb-1 border-b-2",
                      activeTab === tab 
                        ? "text-indigo-600 border-indigo-600" 
                        : "text-slate-500 border-transparent hover:text-slate-800 dark:hover:text-gray-300"
                    )}
                  >
                    {tab.charAt(0) + tab.slice(1).toLowerCase()}
                  </button>
                ))}
              </div>

              <div className="h-4 w-[1px] bg-slate-300 dark:bg-slate-700 mx-2" />

              <div className="flex space-x-1 bg-slate-100 dark:bg-white/5 p-1 rounded-lg">
                {LEARNING_MODES.slice(0, 3).map(mode => (
                  <button 
                    key={mode.id}
                    onClick={() => setActiveMode(mode.id)}
                    className={cn(
                      "flex items-center gap-2 px-3 py-1.5 rounded-md text-xs font-bold transition-all",
                      activeMode === mode.id
                        ? "bg-white dark:bg-[#2a2a2a] text-slate-900 dark:text-white shadow-sm"
                        : "text-slate-500 hover:text-slate-700 dark:hover:text-gray-300"
                    )}
                  >
                    <mode.icon className={cn("w-3.5 h-3.5", activeMode === mode.id ? mode.color : "")} />
                    {mode.label}
                  </button>
                ))}
                <button className="px-3 py-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-gray-300">
                  <span className="text-xl leading-none">...</span>
                </button>
              </div>
            </div>
         </div>

         {/* Tab Content */}
         {activeTab === 'CHAT' && (
           <>
             {/* Chat History Area */}
             <div className="flex-1 overflow-y-auto p-6 md:p-10 space-y-8 custom-scrollbar">
                {displayMessages.length === 0 ? (
                  /* Initial empty state */
                  <div className="flex flex-col items-center justify-center h-full text-center max-w-lg mx-auto mt-20">
                    <div className="w-16 h-16 rounded-2xl bg-indigo-50 dark:bg-indigo-500/10 flex items-center justify-center mb-6">
                       <Brain className="w-8 h-8 text-indigo-600 dark:text-indigo-400" />
                    </div>
                    <h2 className="text-2xl font-bold text-slate-900 dark:text-white mb-3">Your Learning Workspace</h2>
                    <p className="text-sm text-slate-500 dark:text-slate-400 mb-8 leading-relaxed">
                      Upload your study materials, and I'll act as your personal tutor. Every answer is grounded in your documents with precise citations.
                    </p>

                    <div className="flex flex-wrap justify-center gap-3 w-full">
                      {ONE_CLICK_ACTIONS.map((action, i) => (
                        <button key={i} className="flex items-center gap-2 px-4 py-2 bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-full text-sm font-semibold text-slate-600 dark:text-gray-300 hover:border-indigo-300 hover:text-indigo-600 dark:hover:text-indigo-400 transition-all shadow-sm">
                          <action.icon className="w-4 h-4" />
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
             <div className="p-6 pt-0">
               <div className="max-w-4xl mx-auto relative bg-white dark:bg-[#1a1a1b] rounded-2xl border border-slate-200 dark:border-white/10 shadow-[0_8px_30px_rgb(0,0,0,0.04)] focus-within:ring-2 focus-within:ring-indigo-500/20 focus-within:border-indigo-500 transition-all p-3 pl-4 flex items-end gap-3">
                 <button className="p-2 rounded-xl text-slate-400 hover:text-slate-600 dark:hover:text-gray-300 hover:bg-slate-100 dark:hover:bg-white/10 transition-colors shrink-0 mb-0.5">
                   <Plus className="w-5 h-5" />
                 </button>
                 
                 <textarea 
                   value={prompt}
                   onChange={e => setPrompt(e.target.value)}
                   onKeyDown={handleKeyDown}
                   placeholder={`Ask anything in ${activeMode.toLowerCase()} mode...`}
                   className="flex-1 max-h-48 min-h-[44px] bg-transparent border-none outline-none resize-none text-[15px] text-slate-800 dark:text-gray-200 py-2.5 placeholder:text-slate-400 custom-scrollbar"
                   rows={1}
                 />

                 <button 
                   onClick={handleSendMessage}
                   disabled={!prompt.trim() || !activeNotebook || isStreaming}
                   className="w-10 h-10 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-300 dark:disabled:bg-slate-800 flex items-center justify-center text-white transition-colors shrink-0 shadow-sm mb-0.5"
                 >
                   <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                     <path strokeLinecap="round" strokeLinejoin="round" d="M14 5l7 7m0 0l-7 7m7-7H3" />
                   </svg>
                 </button>
               </div>
             </div>
           </>
         )}
         
         {activeTab === 'GRAPH' && (
           <div className="flex-1 overflow-hidden relative">
              {isLoadingGraph ? (
                 <div className="absolute inset-0 flex items-center justify-center">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-500"></div>
                 </div>
              ) : (
                 <KnowledgeGraphViewer nodes={graph?.nodes || []} edges={graph?.edges || []} />
              )}
           </div>
         )}

         {activeTab === 'ASSETS' && (
           <div className="flex-1 flex items-center justify-center text-slate-500">
              Learning Assets (Coming in Phase 7)
           </div>
         )}
      </div>
      
      {/* RIGHT SIDEBAR: RESOURCE PANEL */}
      <div className="w-[320px] bg-white dark:bg-[#1a1a1a] border-l border-slate-200 dark:border-white/5 flex flex-col h-full flex-shrink-0 relative z-20">
        
        {/* Render CitationViewerPanel absolute to right sidebar when active */}
        <AnimatePresence>
           {activeCitation && (
              <CitationViewerPanel 
                citation={activeCitation} 
                onClose={() => setActiveCitation(null)} 
              />
           )}
        </AnimatePresence>

        <div className="p-5 border-b border-slate-100 dark:border-white/5 flex justify-between items-center">
          <h3 className="font-bold text-slate-800 dark:text-gray-100 flex items-center gap-2">
            <Book className="w-4 h-4 text-indigo-500" />
            Knowledge Base
          </h3>
          <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-slate-100 dark:bg-white/10 text-slate-500">{sources?.length || 0} Sources</span>
        </div>

        <div className="p-4">
          <input 
            type="file" 
            ref={fileInputRef} 
            style={{ display: 'none' }} 
            onChange={handleFileChange} 
          />
          <button 
            onClick={handleUploadClick}
            disabled={isUploading || !activeNotebook}
            className={cn(
              "w-full border-2 border-dashed rounded-xl p-6 flex flex-col items-center justify-center gap-3 transition-colors group",
              isUploading 
                ? "border-indigo-400 bg-indigo-50 dark:bg-indigo-500/10 opacity-70 cursor-not-allowed" 
                : "border-slate-200 dark:border-white/10 hover:border-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-500/5 cursor-pointer"
            )}
          >
            <div className="w-10 h-10 rounded-full bg-indigo-100 dark:bg-indigo-500/20 text-indigo-600 dark:text-indigo-400 flex items-center justify-center group-hover:scale-110 transition-transform">
              {isUploading ? <RefreshCcw className="w-5 h-5 animate-spin" /> : <UploadCloud className="w-5 h-5" />}
            </div>
            <div className="text-center">
              <p className="text-sm font-semibold text-slate-700 dark:text-gray-200">
                {isUploading ? "Uploading..." : "Upload Source"}
              </p>
              <p className="text-[11px] text-slate-500 mt-1">PDF, DOCX, TXT (Max 10MB)</p>
            </div>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-4 pb-4 space-y-3">
          <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2 px-1">Indexed Documents</h3>
          {sources?.map(doc => (
            <div key={doc.id} className="bg-white dark:bg-[#1a1a1b] p-3.5 rounded-xl border border-slate-100 dark:border-white/5 hover:border-indigo-200 dark:hover:border-indigo-500/30 transition-colors shadow-sm cursor-pointer group">
              <div className="flex items-start gap-3">
                <div className={cn(
                  "w-8 h-8 rounded-lg flex items-center justify-center shrink-0 mt-0.5",
                  doc.type === 'PDF' ? "bg-red-50 text-red-500 dark:bg-red-500/10" : "bg-blue-50 text-blue-500 dark:bg-blue-500/10"
                )}>
                  <FileText className="w-4 h-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-slate-800 dark:text-gray-200 truncate group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors">
                    {doc.title}
                  </p>
                  <div className="flex items-center gap-3 mt-1.5">
                    <span className="text-[11px] font-medium text-slate-500 bg-slate-100 dark:bg-white/5 px-2 py-0.5 rounded-full">
                      {doc.type}
                    </span>
                    {doc.pages && (
                      <span className="text-[11px] text-slate-400 flex items-center gap-1">
                        <Book className="w-3 h-3" /> {doc.pages} pages
                      </span>
                    )}
                    <span className="text-[11px] text-indigo-500 flex items-center gap-1 ml-auto">
                      {doc.status}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
        
        {/* Verification Engine Status */}
        <div className="p-4 border-t border-slate-100 dark:border-white/5 bg-slate-50 dark:bg-black/20">
           <div className="flex items-center gap-2 text-xs font-bold text-emerald-600 dark:text-emerald-500 mb-2">
             <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
             Hallucination Shield Active
           </div>
           <p className="text-[11px] text-slate-500 leading-tight">Responses are cross-verified against your uploaded sources and citations are provided automatically.</p>
        </div>
      </div>

    </div>
  );
}
