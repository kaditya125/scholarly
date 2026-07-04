import { useState, useEffect, useRef } from "react";
import { 
  Search, Plus, Hash, MessageSquare, Users, Bot, Star, Clock, 
  ArrowUpRight, MoreHorizontal, Filter, Sparkles, ChevronDown, 
  Pin, Settings, Share, Bookmark, ThumbsUp, FileText, Video, 
  Phone, Shield, Zap, ChevronRight, Activity, MessageCircle,
  LayoutGrid, Compass, AlignLeft, BarChart2, Mic, Loader2,
  HelpCircle, Target, PanelLeft, PanelLeftClose
} from "lucide-react";
import { cn } from "../lib/utils";
import { motion, AnimatePresence } from "motion/react";
import { CreateRoomModal } from "../components/CreateRoomModal";
import { LivePoll } from "../components/LivePoll";
import { CreatePollModal } from "../components/CreatePollModal";
import { Whiteboard } from "../components/Whiteboard";
import { RoomSettingsModal } from "../components/RoomSettingsModal";
import { AIInsights } from "../components/AIInsights";
import { useDiscussions } from "../hooks/ai/useDiscussions";

const ICON_MAP: Record<string, any> = {
  Hash,
  Users,
  HelpCircle,
  Target
};

// API fetching will replace these

export default function Discussions() {
  const { rooms: backendRooms, isLoadingRooms, discussions, isLoadingDiscussions } = useDiscussions();
  
  const rooms = backendRooms.map((r: any, idx: number) => ({
    ...r,
    icon: ICON_MAP[r.icon] || Hash,
    notification: idx === 0 ? 3 : 0,
    active: idx === 0
  }));

  const [favorites, setFavorites] = useState<any[]>([
    { id: 1, name: "Maths Pedagogy", icon: Star },
    { id: 2, name: "Bihar GK Notes", icon: Star },
  ]);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);

  const [activeCenterTab, setActiveCenterTab] = useState("Discussions");
  const [activeRoom, setActiveRoom] = useState<string | number>(1);
  const [isCreateRoomModalOpen, setIsCreateRoomModalOpen] = useState(false);
  const [isCreatePollModalOpen, setIsCreatePollModalOpen] = useState(false);
  const [isRoomSettingsModalOpen, setIsRoomSettingsModalOpen] = useState(false);

  const [chatInput, setChatInput] = useState("");
  const [isRecording, setIsRecording] = useState(false);
  const recognitionRef = useRef<any>(null);
  
  const [myMessages, setMyMessages] = useState<string[]>([]);

  useEffect(() => {
    if (rooms.length > 0 && !activeRoom) {
       setActiveRoom(rooms[0].id);
    }
  }, [rooms, activeRoom]);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      if (SpeechRecognition) {
        const rec = new SpeechRecognition();
        rec.continuous = true;
        rec.interimResults = true;
        rec.lang = 'en-US';
        
        rec.onresult = (event: any) => {
          let finalTranscript = '';
          for (let i = event.resultIndex; i < event.results.length; i++) {
            if (event.results[i].isFinal) {
              finalTranscript += event.results[i][0].transcript + ' ';
            }
          }
          if (finalTranscript) {
             setChatInput(prev => (prev + ' ' + finalTranscript).trim());
          }
        };

        rec.onerror = (event: any) => {
          console.error("Speech recognition error", event.error);
          setIsRecording(false);
        };

        rec.onend = () => {
          setIsRecording(false);
        };

        recognitionRef.current = rec;
      }
    }
  }, []);

  const toggleRecording = () => {
    if (!recognitionRef.current) {
        alert("Speech recognition is not supported in this browser.");
        return;
    }
    if (isRecording) {
      recognitionRef.current.stop();
      setIsRecording(false);
    } else {
      try {
        recognitionRef.current.start();
        setIsRecording(true);
      } catch (e) {
        console.error(e);
      }
    }
  };

  return (
    <div className="flex h-[calc(100vh-80px)] p-6 pt-0 gap-6 overflow-hidden">
      
      {/* 1. LEFT SIDEBAR */}
      {isSidebarOpen && (
        <div className="w-[260px] bg-white dark:bg-[#1a1a1a] rounded-[24px] border border-slate-200/60 dark:border-white/5 flex flex-col shrink-0 overflow-hidden shadow-[0_4px_20px_rgb(0,0,0,0.03)] h-full transition-all duration-300 relative z-10">
          
          {/* Workspace Dropdown & Toggle */}
          <div className="p-4 border-b border-slate-100 dark:border-white/5 flex items-center justify-between">
            <div className="flex items-center gap-2 cursor-pointer hover:bg-slate-50 dark:hover:bg-white/5 p-1 -ml-1 rounded-lg transition-colors overflow-hidden">
               <div className="w-8 h-8 rounded-lg bg-indigo-600 flex items-center justify-center text-white font-bold shadow-sm shrink-0">
                 T
               </div>
               <div className="min-w-0">
                 <h2 className="text-[13px] font-bold text-slate-900 dark:text-white leading-tight truncate">TRE Exam Hub</h2>
                 <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">Pro Student Workspace</p>
               </div>
               <ChevronDown className="w-3.5 h-3.5 text-slate-400 shrink-0" />
            </div>
            <button 
              onClick={() => setIsSidebarOpen(false)}
              className="p-1.5 hover:bg-slate-100 dark:hover:bg-white/10 rounded-lg transition-colors text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 shrink-0"
              title="Close sidebar"
            >
              <PanelLeftClose className="w-4 h-4" />
            </button>
          </div>

        <div className="flex-1 overflow-y-auto custom-scrollbar p-3 space-y-6">
          
          {/* Quick Nav */}
          <div className="space-y-0.5">
            <button 
              onClick={() => setActiveCenterTab("Community")}
              className={cn("w-full flex items-center gap-3 px-3 py-2 rounded-xl text-[13px] font-medium transition-colors", activeCenterTab === "Community" ? "bg-slate-100 dark:bg-white/10 text-slate-900 dark:text-white" : "text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-white/5")}
            >
              <Users className="w-4 h-4" /> Community
            </button>
            <button className="w-full flex items-center gap-3 px-3 py-2 rounded-xl text-[13px] font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-white/5 transition-colors">
              <Compass className="w-4 h-4" /> Discover
            </button>
            <button className="w-full flex items-center gap-3 px-3 py-2 rounded-xl text-[13px] font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-white/5 transition-colors">
              <Filter className="w-4 h-4" /> Unanswered
            </button>
            <button className="w-full flex items-center gap-3 px-3 py-2 rounded-xl text-[13px] font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-white/5 transition-colors">
              <MessageCircle className="w-4 h-4" /> My Threads
            </button>
          </div>

          {/* Favorites */}
          <div>
            <div className="flex items-center justify-between px-3 mb-2">
              <span className="text-[11px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">Favorites</span>
              <Plus className="w-3.5 h-3.5 text-slate-400 cursor-pointer hover:text-slate-600 dark:hover:text-slate-300" />
            </div>
            <div className="flex flex-col gap-0.5">
              {favorites.map((fav, idx) => (
                <button key={idx} className="flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-white/5 transition-colors group w-full text-left">
                  <fav.icon className="w-3.5 h-3.5 text-yellow-500 group-hover:fill-yellow-500/20" /> 
                  <span className="truncate">{fav.name}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Rooms */}
          <div>
            <div className="flex items-center justify-between px-3 mb-2">
              <span className="text-[11px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">Study Rooms</span>
              <Plus onClick={() => setIsCreateRoomModalOpen(true)} className="w-3.5 h-3.5 text-slate-400 cursor-pointer hover:text-slate-600 dark:hover:text-slate-300" />
            </div>
            <div className="flex flex-col gap-0.5">
              {rooms.map((room) => (
                <button 
                  key={room.id} 
                  onClick={() => {
                    setActiveRoom(room.id);
                    if(activeCenterTab === "Community") setActiveCenterTab("Discussions");
                  }}
                  className={cn(
                    "w-full flex items-center justify-between px-3 py-2 rounded-xl text-[13px] font-medium transition-colors",
                    activeRoom === room.id 
                      ? "bg-indigo-50 dark:bg-indigo-500/10 text-indigo-700 dark:text-indigo-400" 
                      : "text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-white/5"
                  )}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <room.icon className={cn("w-4 h-4 shrink-0", activeRoom === room.id ? "text-indigo-600 dark:text-indigo-400" : "text-slate-400")} /> 
                    <span className="truncate">{room.name}</span>
                  </div>
                  {room.notification > 0 && (
                    <span className="bg-indigo-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full shrink-0">
                      {room.notification}
                    </span>
                  )}
                </button>
              ))}
            </div>
          </div>

        </div>
        
        {/* Magic AI Box */}
        <div className="p-4 border-t border-slate-100 dark:border-white/5">
          <div className="bg-gradient-to-br from-indigo-50 to-purple-50 dark:from-indigo-500/10 dark:to-purple-500/10 p-4 rounded-xl border border-indigo-100 dark:border-indigo-500/20 relative overflow-hidden group cursor-pointer hover:border-indigo-200 dark:hover:border-indigo-500/30 transition-colors">
            <Sparkles className="w-5 h-5 text-indigo-600 dark:text-indigo-400 mb-2" />
            <h4 className="text-[13px] font-bold text-indigo-900 dark:text-indigo-300 mb-1">Get Trenning AI</h4>
            <p className="text-[11px] text-indigo-700/70 dark:text-indigo-400/70 leading-tight">Use AI in every action on discussion to save time.</p>
            <div className="absolute -right-4 -bottom-4 w-16 h-16 bg-gradient-to-br from-indigo-500/20 to-purple-500/20 blur-xl rounded-full group-hover:scale-150 transition-transform duration-500" />
          </div>
        </div>

      </div>
      )}

      {/* 2. CENTER PANEL (Main Feed) */}
      <div className="flex-1 bg-white dark:bg-[#1a1a1a] rounded-[24px] border border-slate-200/60 dark:border-white/5 flex flex-col shadow-[0_4px_20px_rgb(0,0,0,0.03)] h-full transition-colors relative z-10 overflow-hidden">
        
        {!isSidebarOpen && (
          <button
            onClick={() => setIsSidebarOpen(true)}
            className="absolute top-6 left-6 z-20 p-2 rounded-xl bg-white dark:bg-[#1a1a1b] text-slate-500 hover:bg-slate-100 dark:hover:bg-white/5 dark:text-slate-400 transition-colors border border-slate-200 dark:border-white/10 shadow-sm"
            title="Open sidebar"
          >
            <PanelLeft className="w-5 h-5" />
          </button>
        )}

        {/* Header */}
        <div className={cn("pt-6 pb-2 border-b border-slate-100 dark:border-white/5 transition-all duration-300", !isSidebarOpen ? "px-20" : "px-8")}>
           <div className="flex items-center gap-2 text-[12px] font-semibold text-slate-500 dark:text-slate-400 mb-2">
             <AlignLeft className="w-3.5 h-3.5" />
             <span>Page</span>
             <span className="w-1 h-1 rounded-full bg-slate-300 dark:bg-slate-600" />
             <span>English</span>
             <span className="w-1 h-1 rounded-full bg-slate-300 dark:bg-slate-600" />
             <span>Edited 28 Sep 2026</span>
           </div>
           <div className="flex items-center justify-between mb-6">
             <div className="flex items-center gap-3">
               <h1 className="text-2xl font-bold text-slate-900 dark:text-white">
                 {activeCenterTab === "Community" ? "Global Community" : rooms.find((r: any) => r.id === activeRoom)?.name}
               </h1>
               {activeCenterTab !== "Community" && (
                 <button 
                   onClick={() => setIsRoomSettingsModalOpen(true)}
                   className="p-1.5 hover:bg-slate-100 dark:hover:bg-white/10 rounded-full transition-colors text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
                   aria-label="Room Settings"
                   title="Room Settings"
                 >
                   <Settings className="w-5 h-5" />
                 </button>
               )}
             </div>
             <div className="flex items-center gap-3">
               <div className="relative">
                 <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                 <input 
                   type="text" 
                   placeholder="Search discussions..." 
                   className="pl-9 pr-4 py-2 bg-slate-50 dark:bg-white/5 border-none outline-none rounded-full text-[13px] text-slate-900 dark:text-white w-64 focus:ring-2 focus:ring-indigo-500/20 transition-all font-medium"
                 />
               </div>
               <button className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-full text-[13px] font-semibold transition-colors shadow-sm">
                 <Plus className="w-4 h-4" /> New 
               </button>
             </div>
           </div>

           {/* Tabs */}
           <div className="flex items-center gap-6 overflow-x-auto custom-scrollbar">
             {["Discussions", "Group Chat", "Shared Whiteboard", "Community", "AI Insights"].map((tab) => (
               <button 
                 key={tab}
                 onClick={() => setActiveCenterTab(tab)}
                 className={cn(
                   "pb-3 text-[14px] font-semibold transition-colors relative",
                   activeCenterTab === tab 
                     ? "text-indigo-600 dark:text-indigo-400" 
                     : "text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300"
                 )}
               >
                 <span className="flex items-center gap-1.5">
                   {tab === "AI Insights" && <Sparkles className="w-3.5 h-3.5" />}
                   {tab}
                 </span>
                 {activeCenterTab === tab && (
                   <motion.div 
                     layoutId="centerTab" 
                     className="absolute bottom-0 left-0 right-0 h-0.5 bg-indigo-600 dark:bg-indigo-400 rounded-t-full" 
                   />
                 )}
               </button>
             ))}
           </div>
        </div>

        {/* Content Area */}
        <div className="flex-1 overflow-y-auto custom-scrollbar flex flex-col relative">
          {(activeCenterTab === "Discussions" || activeCenterTab === "Community") && (
            <div className="p-8 pt-6">
              <div className="flex items-center justify-between mb-6">
                 <div className="flex items-center gap-2">
                   <h3 className="font-bold text-slate-900 dark:text-white">Discussions</h3>
                   <span className="bg-slate-100 dark:bg-white/10 text-slate-600 dark:text-slate-300 px-2 py-0.5 rounded-full text-[12px] font-bold">12</span>
                 </div>
                 <button className="flex items-center gap-2 text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-white font-semibold text-[13px] transition-colors">
                   <Filter className="w-4 h-4" /> Recent <ChevronDown className="w-3.5 h-3.5" />
                 </button>
              </div>

              <div className="space-y-0">
                 {isLoadingDiscussions ? (
              <div className="flex-1 flex items-center justify-center">
                <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
              </div>
            ) : (
              discussions.map((disc, idx) => (
                     <div key={disc.id || idx} className="py-5 border-b border-slate-100 dark:border-white/5 last:border-0 group cursor-pointer">
                       <div className="flex items-start justify-between mb-1">
                         <div className="flex items-center gap-2 text-[12px] font-semibold text-slate-500 dark:text-slate-400 mb-2">
                           <span>{disc.chapter}</span>
                           <span className="w-1 h-1 rounded-full bg-slate-300 dark:bg-slate-600" />
                           <span>{disc.topic}</span>
                         </div>
                         {disc.aiAssisted && (
                           <div className="flex items-center gap-1 bg-purple-50 dark:bg-purple-500/10 text-purple-600 dark:text-purple-400 px-2 py-1 rounded text-[10px] font-bold tracking-wider uppercase border border-purple-100 dark:border-purple-500/20">
                             <Sparkles className="w-3 h-3" /> AI Assisted
                           </div>
                         )}
                       </div>
                       
                       <h3 className="text-[16px] font-bold text-slate-900 dark:text-white mb-2 group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors">
                         {disc.title}
                       </h3>
                       <p className="text-[14px] text-slate-600 dark:text-slate-400 line-clamp-1 mb-4">
                         {disc.description}
                       </p>

                       <div className="flex items-center gap-4">
                         <div className="flex -space-x-2">
                           {(disc.participants || []).map((avatar: string, i: number) => (
                             <img key={i} src={avatar} alt="Participant" className="w-6 h-6 rounded-full border-2 border-white dark:border-[#1a1a1a] relative z-10" />
                           ))}
                           {disc.aiAssisted && (
                             <div className="w-6 h-6 rounded-full border-2 border-white dark:border-[#1a1a1a] bg-gradient-to-br from-purple-500 to-indigo-500 flex items-center justify-center text-white relative z-10">
                               <Bot className="w-3.5 h-3.5" />
                             </div>
                           )}
                         </div>
                         
                         <div className="flex items-center gap-4 text-[13px] font-medium text-slate-500 dark:text-slate-400">
                           <span>{disc.replies} replies</span>
                           <span className="w-1 h-1 rounded-full bg-slate-300 dark:bg-slate-600" />
                           <span>{disc.views} views</span>
                           <span className="w-1 h-1 rounded-full bg-slate-300 dark:bg-slate-600" />
                           <span>Last reply {disc.time || '10m ago'}</span>
                         </div>
                       </div>
                     </div>
                   ))
                 )}
              </div>
            </div>
          )}

          {activeCenterTab === "Group Chat" && (
            <div className="flex flex-col h-full">
              <div className="flex-1 p-8 space-y-6">
                <div className="flex gap-4">
                  <img src="https://i.pravatar.cc/150?img=11" alt="User" className="w-8 h-8 rounded-full shrink-0 mt-1 dark:border dark:border-white/10" />
                  <div className="flex flex-col gap-2 max-w-[70%]">
                    <div className="text-xs text-slate-500 mb-1 font-medium">Adit Irawan, <span className="ml-1">12:36 PM</span></div>
                    <div className="bg-slate-100 dark:bg-white/5 text-slate-800 dark:text-slate-300 px-5 py-3 rounded-2xl rounded-tl-sm text-sm transition-colors">
                      Has anyone solved the math pedagogy questions from the latest mock?
                    </div>
                  </div>
                </div>

                <div className="flex flex-col gap-2 max-w-[70%] self-end items-end">
                   <div className="text-xs text-slate-500 mb-1 font-medium mr-1">12:38 PM</div>
                   <div className="bg-indigo-600 text-white px-5 py-3 rounded-2xl rounded-tr-sm text-sm shadow-sm transition-colors">
                      Yes! But I am stuck on question 4.
                   </div>
                   <div className="bg-indigo-600 text-white px-5 py-3 rounded-2xl rounded-tr-sm text-sm shadow-sm transition-colors">
                      Can we ask the AI coach?
                   </div>
                </div>

                <div className="flex justify-center my-4">
                  <span className="text-[11px] font-bold text-slate-400 bg-slate-50 dark:bg-white/5 px-3 py-1 rounded-full transition-colors flex items-center gap-1">
                    <Sparkles className="w-3 h-3 text-purple-500" /> AI Coach joined the room
                  </span>
                </div>

                <div className="flex gap-4">
                  <div className="w-8 h-8 rounded-full bg-purple-100 dark:bg-purple-500/20 flex items-center justify-center shrink-0 mt-1">
                    <Bot className="w-4 h-4 text-purple-600 dark:text-purple-400" />
                  </div>
                  <div className="flex flex-col gap-2 max-w-[80%]">
                    <div className="text-xs text-purple-600 dark:text-purple-400 mb-1 font-bold">Exam Coach AI, <span className="text-slate-500 font-medium ml-1">12:40 PM</span></div>
                    <div className="bg-purple-50 dark:bg-purple-500/10 text-slate-800 dark:text-slate-300 px-5 py-3 rounded-2xl rounded-tl-sm text-sm border-l-2 border-purple-400 dark:border-purple-500 transition-colors">
                      Hello! I can help you with question 4. It asks about the Piagetian concept of cognitive development. The correct answer focuses on 'assimilation' vs 'accommodation'. Would you like me to explain the difference?
                    </div>
                  </div>
                </div>

                <div className="flex justify-start my-4 w-full">
                  <LivePoll 
                    question="When should we schedule the group study session for Science Mock Test #4?"
                    options={[
                      { id: '1', text: 'Tonight at 8 PM', votes: 12 },
                      { id: '2', text: 'Tomorrow Morning at 10 AM', votes: 5 },
                      { id: '3', text: 'Tomorrow Evening at 7 PM', votes: 15 },
                      { id: '4', text: 'Friday at 6 PM', votes: 2 }
                    ]}
                    totalVotes={34}
                    creator="Ardhi Mubarok"
                    time="12:45 PM"
                    avatar="https://i.pravatar.cc/150?img=13"
                  />
                </div>

                {myMessages.map((msg, idx) => (
                  <div key={idx} className="flex flex-col gap-2 max-w-[70%] self-end items-end">
                     <div className="text-xs text-slate-500 mb-1 font-medium mr-1">Just now</div>
                     <div className="bg-indigo-600 text-white px-5 py-3 rounded-2xl rounded-tr-sm text-sm shadow-sm transition-colors">
                        {msg}
                     </div>
                  </div>
                ))}
              </div>

              {/* Chat Input */}
              <div className="p-6 pt-2 sticky bottom-0 bg-white dark:bg-[#1a1a1a] z-10 border-t border-slate-100 dark:border-white/5">
                <div className="bg-[#fafbfc] dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-xl px-4 py-3 flex items-center gap-2 lg:gap-4 transition-colors focus-within:ring-2 focus-within:ring-indigo-500/20">
                  <button className="p-1.5 hover:bg-slate-200 dark:hover:bg-white/10 rounded-full transition-colors text-slate-400 hint-bottom" aria-label="Add attachment">
                    <Plus className="w-5 h-5 cursor-pointer" />
                  </button>
                  <button className="p-1.5 hover:bg-slate-200 dark:hover:bg-white/10 rounded-full transition-colors text-blue-500" aria-label="Create Poll" title="Create Live Poll" onClick={() => setIsCreatePollModalOpen(true)}>
                    <BarChart2 className="w-5 h-5 cursor-pointer" />
                  </button>
                  {isRecording ? (
                    <div className="flex-1 flex items-center justify-start gap-2 h-10 px-2 lg:px-0 bg-transparent flex-row overflow-hidden">
                      <div className="flex items-center justify-center gap-1">
                        {[1.2, 2.5, 1.5, 2.0, 1.2, 0.8, 1.8, 1.0].map((scale, i) => (
                          <motion.div
                            key={i}
                            className="w-1 bg-red-500 rounded-full"
                            style={{ height: 4 }}
                            animate={{ height: [4, 12 * scale, 4] }}
                            transition={{
                              duration: 0.8,
                              repeat: Infinity,
                              delay: i * 0.1,
                              ease: "easeInOut",
                            }}
                          />
                        ))}
                      </div>
                      <input 
                        type="text" 
                        value={chatInput}
                        onChange={(e) => setChatInput(e.target.value)}
                        onKeyDown={(e) => {
                          if(e.key === 'Enter' && chatInput.trim()) {
                            setMyMessages(prev => [...prev, chatInput.trim()]);
                            setChatInput("");
                          }
                        }}
                        placeholder="Listening..." 
                        className="flex-1 bg-transparent border-none outline-none text-sm text-slate-800 dark:text-slate-200 placeholder:text-red-500/70 ml-2"
                      />
                    </div>
                  ) : (
                    <input 
                      type="text" 
                      value={chatInput}
                      onChange={(e) => setChatInput(e.target.value)}
                      onKeyDown={(e) => {
                        if(e.key === 'Enter' && chatInput.trim()) {
                          setMyMessages(prev => [...prev, chatInput.trim()]);
                          setChatInput("");
                        }
                      }}
                      placeholder="Message the room or ask AI..." 
                      className="flex-1 bg-transparent border-none outline-none text-sm text-slate-800 dark:text-slate-200 placeholder:text-slate-400 pl-2 lg:pl-0 h-10"
                    />
                  )}
                  <div className="flex items-center gap-1">
                    <button 
                      onClick={toggleRecording}
                      className={cn("p-1.5 rounded-full transition-colors", isRecording ? "bg-red-100 dark:bg-red-500/20 text-red-500 animate-pulse" : "hover:bg-slate-200 dark:hover:bg-white/10 text-slate-500")}
                      title={isRecording ? "Stop recording" : "Record audio note (Voice typing)"}
                    >
                      <Mic className="w-5 h-5 cursor-pointer" />
                    </button>
                    <button className="px-3 py-1.5 mt-0 mb-0 hidden sm:flex rounded-lg font-bold text-[12px] bg-purple-50 dark:bg-purple-500/10 text-purple-600 dark:text-purple-400 hover:bg-purple-100 dark:hover:bg-purple-500/20 transition-colors items-center gap-1.5 border border-purple-100 dark:border-purple-500/20">
                      <Sparkles className="w-3.5 h-3.5" /> Ask AI
                    </button>
                    <button 
                      onClick={() => {
                        if(chatInput.trim()) {
                          setMyMessages(prev => [...prev, chatInput.trim()]);
                          setChatInput("");
                        }
                      }}
                      className="p-1.5 hover:bg-slate-200 dark:hover:bg-white/10 rounded-full transition-colors text-indigo-600 dark:text-indigo-400"
                    >
                      <ChevronRight className="w-5 h-5 cursor-pointer" />
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeCenterTab === "Shared Whiteboard" && (
            <Whiteboard />
          )}

          {activeCenterTab === "AI Insights" && (
            <AIInsights />
          )}
        </div>

      </div>

      <CreateRoomModal isOpen={isCreateRoomModalOpen} onClose={() => setIsCreateRoomModalOpen(false)} />
      <CreatePollModal isOpen={isCreatePollModalOpen} onClose={() => setIsCreatePollModalOpen(false)} />
      <RoomSettingsModal isOpen={isRoomSettingsModalOpen} onClose={() => setIsRoomSettingsModalOpen(false)} roomName={rooms.find((r: any) => r.id === activeRoom)?.name || "Room"} />
    </div>
  );
}

