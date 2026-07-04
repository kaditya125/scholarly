import React, { useState, useRef, useEffect } from "react";
import { Link, Outlet, useLocation, useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "motion/react";
import { useTheme } from "../lib/ThemeContext";
import { Breadcrumb } from "./Breadcrumb";
import { 
  Home,
  FileText,
  ClipboardList,
  BarChart2,
  Calendar,
  BotMessageSquare,
  MessagesSquare,
  MessageSquare,
  Search,
  Bell,
  Plus,
  Trash2,
  Clock,
  ChevronDown,
  ArrowRight,
  Package,
  MessageSquareShare,
  PanelLeftClose,
  PanelLeft,
  Sun,
  Moon,
  Share,
  SquareArrowOutUpRight,
  Bug,
  Sparkles,
  Bot,
  BrainCircuit,
  MessageCircle,
  BookOpen,
  Headphones,
  Lightbulb,
  Layers,
  Image as ImageIcon,
  Map,
  CheckSquare,
  Menu,
  X,
  Library,
  LogOut
} from "lucide-react";
import { cn } from "../lib/utils";
import { ShareModal } from "./ShareModal";
import { FeedbackModal } from "./FeedbackModal";
import HighlightAction from "./HighlightAction";
import { useAuth } from "../lib/AuthContext";

const MAIN_MENU = [
  { label: "Home", path: "/dashboard", icon: Home },
  { label: "AI Chat", path: "/chat", icon: BotMessageSquare },
  { label: "Notebooks", path: "/notebooks", icon: BookOpen },
  { label: "Discussions", path: "/discussions", icon: MessagesSquare },
  { label: "Tests", path: "/tests", icon: FileText },
  { label: "Study Plan", path: "/planner", icon: Calendar },
  { label: "My Flashcards", path: "/flashcards", icon: Library },
  { label: "Leaderboard", path: "/leaderboard", icon: ClipboardList },
  { label: "Analytics", path: "/analytics", icon: BarChart2 },
];

const NavItem: React.FC<{ item: any, currentPath: string, collapsed?: boolean }> = ({ item, currentPath, collapsed }) => {
  const isActive = currentPath === item.path || (currentPath.startsWith(item.path) && item.path !== "/");
  const Icon = item.icon;
  
  return (
    <Link 
      to={item.path}
      className={cn(
        "flex items-center transition-all duration-200 font-medium text-[14px] group",
        collapsed 
          ? "justify-center w-10 h-10 mx-auto rounded-lg mb-0.5" 
          : "gap-3 px-3 py-2.5 rounded-lg mx-3 mb-0.5",
        isActive 
          ? "bg-slate-100 dark:bg-[#1a1a1a] text-slate-900 dark:text-gray-100 font-semibold"
          : "text-slate-600 dark:text-gray-400 hover:text-slate-900 dark:hover:text-gray-200 hover:bg-slate-50 dark:hover:bg-[#1a1a1a]"
      )}
      title={collapsed ? item.label : undefined}
    >
      <Icon className={cn("shrink-0", collapsed ? "w-5 h-5" : "w-[18px] h-[18px]", isActive ? "text-slate-900 dark:text-gray-100" : "text-slate-500 dark:text-gray-400 group-hover:text-slate-700 dark:group-hover:text-gray-300")} />
      {!collapsed && <span className="truncate flex-1">{item.label}</span>}
    </Link>
  );
}

export function AppLayout() {
  const location = useLocation();
  const navigate = useNavigate();
  const { theme, toggleTheme } = useTheme();
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [isRecentOpen, setIsRecentOpen] = useState(true);
  const [isRecentlyDeletedOpen, setIsRecentlyDeletedOpen] = useState(false);
  const [isShareModalOpen, setIsShareModalOpen] = useState(false);
  const [isFeedbackModalOpen, setIsFeedbackModalOpen] = useState(false);
  const [isNewMenuOpen, setIsNewMenuOpen] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isProfileMenuOpen, setIsProfileMenuOpen] = useState(false);
  const newMenuRef = useRef<HTMLDivElement>(null);
  const profileMenuRef = useRef<HTMLDivElement>(null);
  const { user, logout } = useAuth();

  useEffect(() => {
    setIsMobileMenuOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (newMenuRef.current && !newMenuRef.current.contains(event.target as Node)) {
        setIsNewMenuOpen(false);
      }
      if (profileMenuRef.current && !profileMenuRef.current.contains(event.target as Node)) {
        setIsProfileMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);

    const handleKeyDown = (e: KeyboardEvent) => {
      // Global navigation shortcuts: Cmd/Ctrl + Shift + Key
      if ((e.metaKey || e.ctrlKey) && e.shiftKey) {
        if (e.key.toLowerCase() === 'd') {
          e.preventDefault();
          navigate('/dashboard');
        } else if (e.key.toLowerCase() === 'c') {
          e.preventDefault();
          navigate('/chat');
          window.dispatchEvent(new CustomEvent('new-chat')); // optional, but a good touch
        } else if (e.key.toLowerCase() === 't') {
          e.preventDefault();
          navigate('/tests');
        }
      }
    };
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [navigate]);

  const getPageTitle = () => {
    switch (location.pathname) {
      case '/dashboard': return 'Dashboard';
      case '/tests': return 'Test Series';
      case '/leaderboard': return 'Leaderboard';
      case '/planner': return 'Tasks Report';
      case '/discussions': return 'General Chats';
      case '/report': return 'Detailed Report';
      case '/flashcards': return 'My Flashcards';
      default: return 'Application';
    }
  };

  return (
    <motion.div 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.3 }}
      className="flex h-[100dvh] w-full bg-slate-50 dark:bg-[#131314] overflow-hidden font-sans transition-colors duration-300"
    >
      
      {/* Overlay for mobile */}
      {isMobileMenuOpen && (
        <div 
          className="fixed inset-0 bg-black/50 z-40 md:hidden"
          onClick={() => setIsMobileMenuOpen(false)}
        />
      )}
      {/* Sidebar */}
      <aside className={cn(
        "bg-white dark:bg-[#111111] border-r border-slate-200 dark:border-white/5 flex flex-col h-full shrink-0 overflow-y-auto custom-scrollbar transition-all duration-300", 
        "fixed md:relative z-50",
        isMobileMenuOpen ? "translate-x-0 w-[260px]" : "-translate-x-full md:translate-x-0",
        !isMobileMenuOpen && isCollapsed ? "md:w-[68px]" : "md:w-[260px]"
      )}>
        <div className={cn("h-[60px] flex items-center shrink-0 mb-2 transition-colors duration-300", isCollapsed ? "justify-center px-0 flex-col py-2" : "px-4 justify-between")}>
          {!isCollapsed && (
            <Link to="/" className="flex items-center gap-2 overflow-hidden px-1">
                <svg className="shrink-0" width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M12 2L2 7L12 12L22 7L12 2Z" fill="#facc15"/>
                  <path d="M2 17L12 22L22 17M2 12L12 17L22 12" stroke="#facc15" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              <span className="font-bold text-lg tracking-tight text-slate-900 dark:text-white uppercase transition-all duration-300">Scholarly</span>
            </Link>
          )}
          {isCollapsed && (
            <Link to="/" className="flex items-center justify-center w-full mb-3 shrink-0">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M12 2L2 7L12 12L22 7L12 2Z" fill="#facc15"/>
                  <path d="M2 17L12 22L22 17M2 12L12 17L22 12" stroke="#facc15" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
            </Link>
          )}
          
          <button 
            onClick={() => setIsCollapsed(!isCollapsed)} 
            className={cn("p-1.5 rounded-md hover:bg-slate-100 dark:hover:bg-[#1a1a1a] text-slate-500 dark:text-gray-400 focus:outline-none transition-colors border border-transparent dark:hover:border-white/10 hidden md:flex items-center justify-center", isCollapsed ? "mt-1 w-9 h-9" : "")} 
            title={isCollapsed ? "Expand sidebar" : "Collapse sidebar"}
            aria-label={isCollapsed ? "Expand sidebar" : "Collapse sidebar"}
            aria-expanded={!isCollapsed}
          >
             {isCollapsed ? <PanelLeft className="w-[18px] h-[18px]" /> : <PanelLeftClose className="w-[18px] h-[18px]" />}
          </button>
        </div>
        
        <div className="flex-1 pb-6 w-full max-w-full pt-4">
           <nav className="space-y-1 relative" role="navigation" aria-label="Main navigation">
              {MAIN_MENU.map(item => (
                 <NavItem key={item.path} item={item} currentPath={location.pathname} collapsed={isCollapsed} />
              ))}
              
              <div className={cn("px-3 mt-3 relative", isCollapsed && "flex justify-center")} ref={newMenuRef}>
                 <button 
                   onClick={() => setIsNewMenuOpen(!isNewMenuOpen)}
                   className={cn(
                     "bg-blue-600 hover:bg-blue-700 text-white flex items-center justify-center transition-colors shadow-sm",
                     isCollapsed ? "w-10 h-10 rounded-[10px]" : "w-full gap-2 py-1.5 rounded-[10px] text-[13px] font-semibold"
                   )}
                   aria-label="Create new item"
                   aria-haspopup="dialog"
                   aria-expanded={isNewMenuOpen}
                 >
                   <Plus className={cn("shrink-0", isCollapsed ? "w-5 h-5" : "w-4 h-4")} /> 
                   {!isCollapsed && "New"}
                 </button>

                 {isNewMenuOpen && (
                   <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm" onClick={() => setIsNewMenuOpen(false)}>
                     <div 
                       className="bg-white dark:bg-[#131314] border border-slate-200 dark:border-white/10 rounded-2xl shadow-2xl overflow-hidden z-50 flex flex-col p-6 w-[800px] max-w-full relative"
                       onClick={(e) => e.stopPropagation()}
                     >
                       <div className="flex items-center gap-2 mb-6">
                         <Sparkles className="w-5 h-5 text-slate-800 dark:text-slate-200" />
                         <h3 className="text-xl font-bold text-slate-800 dark:text-slate-100">Content</h3>
                       </div>
                       
                       <div className="flex flex-wrap gap-3">
                         {[
                           { label: 'AI Chat', icon: MessageSquare, iconColor: 'text-purple-500', path: '/chat', type: 'chat' },
                           { label: 'Study Guide', icon: BookOpen, iconColor: 'text-red-500', path: '/chat', type: 'study-guide' },
                           { label: 'AI Podcast', icon: Headphones, iconColor: 'text-emerald-500', path: '/chat', type: 'podcast' },
                           { label: 'Deep Research', icon: Lightbulb, iconColor: 'text-yellow-500', path: '/research', type: 'research' },
                           { label: 'AI Slides', icon: Layers, iconColor: 'text-blue-500', path: '/chat', type: 'slides' },
                           { label: 'Worksheet', icon: FileText, iconColor: 'text-green-500', path: '/chat', type: 'worksheet' },
                           { label: 'AI Infographic', icon: ImageIcon, iconColor: 'text-cyan-500', path: '/chat', type: 'infographic' },
                           { label: 'Mind Map', icon: Map, iconColor: 'text-purple-500', path: '/chat', type: 'mindmap' },
                           { label: 'AI Image', icon: ImageIcon, iconColor: 'text-orange-500', path: '/chat', type: 'image' },
                           { label: 'Page', icon: FileText, iconColor: 'text-indigo-500', path: '/chat', type: 'page' },
                           { label: 'Practice Exam', icon: CheckSquare, iconColor: 'text-purple-500', path: '/tests', type: 'exam' },
                           { label: 'AI Meeting Notes', icon: Headphones, iconColor: 'text-rose-500', path: '/chat', type: 'meeting-notes' },
                         ].map((ctg, i) => (
                           <button 
                             key={i}
                             onClick={() => {
                               navigate(`${ctg.path}?type=${ctg.type}`);
                               window.dispatchEvent(new CustomEvent('new-chat', { detail: ctg.type }));
                               setIsNewMenuOpen(false);
                             }}
                             className="flex items-center gap-2.5 px-4 py-2 bg-slate-50 hover:bg-slate-100 dark:bg-[#1a1a1b] dark:hover:bg-[#252526] text-sm text-slate-700 dark:text-slate-200 font-medium transition-colors border border-slate-200 dark:border-white/5 rounded-full"
                           >
                             <ctg.icon className={cn("w-[18px] h-[18px]", ctg.iconColor)} /> {ctg.label}
                           </button>
                         ))}
                       </div>
                       
                       <button onClick={() => setIsNewMenuOpen(false)} aria-label="Close menu" className="absolute top-4 right-4 p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors">
                         <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                       </button>
                     </div>
                   </div>
                 )}
              </div>
           </nav>

           {/* Recent section */}
           {!isCollapsed && (
             <div className="mt-4 px-3 flex flex-col pt-2 border-t border-slate-200 dark:border-white/5">
               <button 
                 onClick={() => setIsRecentOpen(!isRecentOpen)}
                 className="flex items-center px-3 py-1.5 text-[13px] font-semibold text-slate-700 dark:text-gray-300 hover:bg-slate-50 dark:hover:bg-[#1a1a1a] rounded-md transition-colors group mb-1 w-fit"
                 aria-label="Toggle recent items menu"
                 aria-expanded={isRecentOpen}
               >
                 <Clock className="w-3.5 h-3.5 mr-2 text-slate-500 dark:text-gray-500" />
                 Recent
                 <ChevronDown className={cn("w-3.5 h-3.5 ml-1.5 text-slate-400 dark:text-gray-500 transition-transform", !isRecentOpen && "-rotate-90")} />
               </button>
               
               {isRecentOpen && (
                 <div className="flex flex-col space-y-0.5 mt-0.5 ml-3 border-l border-slate-200 dark:border-white/10 pl-2">
                    <Link to="/chat" className="flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-slate-100 dark:hover:bg-[#1a1a1a] text-slate-600 dark:text-gray-400 text-[13px] hover:text-slate-900 dark:hover:text-gray-200 transition-colors group">
                      <MessageSquare className="w-3.5 h-3.5 shrink-0 text-slate-400 dark:text-gray-500 group-hover:text-slate-600 dark:group-hover:text-gray-400" />
                      <span className="truncate">Greeting</span>
                    </Link>
                    <Link to="/tests" className="flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-slate-100 dark:hover:bg-[#1a1a1a] text-slate-600 dark:text-gray-400 text-[13px] hover:text-slate-900 dark:hover:text-gray-200 transition-colors group">
                      <FileText className="w-3.5 h-3.5 shrink-0 text-slate-400 dark:text-gray-500 group-hover:text-slate-600 dark:group-hover:text-gray-400" />
                      <span className="truncate">Mock Test 1 Attempt</span>
                    </Link>
                    <Link to="/planner" className="flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-slate-100 dark:hover:bg-[#1a1a1a] text-slate-600 dark:text-gray-400 text-[13px] hover:text-slate-900 dark:hover:text-gray-200 transition-colors group">
                      <Calendar className="w-3.5 h-3.5 shrink-0 text-slate-400 dark:text-gray-500 group-hover:text-slate-600 dark:group-hover:text-gray-400" />
                      <span className="truncate">Updated Study Plan</span>
                    </Link>
                 </div>
               )}
             </div>
           )}

           {/* Folders section */}
           {!isCollapsed && (
             <div className="mt-4 px-3 flex flex-col mb-2">
               <div className="flex items-center justify-between px-3 py-1.5 group">
                 <span className="text-[13px] font-semibold text-slate-700 dark:text-gray-300">Folders</span>
                 <div className="flex items-center gap-1 opacity-100 transition-opacity">
                   <button aria-label="Pin folder" className="p-1 text-slate-500 dark:text-gray-500 hover:text-slate-700 dark:hover:text-gray-300">
                     <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m14 14-8 8" /><path d="m16 16 4-4" /><path d="m21 11-1.4-1.4a2 2 0 0 0-2.8 0l-3.3 3.3a2 2 0 0 0 0 2.8l1.4 1.4" /><path d="m5 5 1.4 1.4a2 2 0 0 0 2.8 0l3.3-3.3a2 2 0 0 0 0-2.8L11 3" /><path d="M12 9V2" /><path d="M15 12H22" /></svg>
                   </button>
                   <button aria-label="Create new folder" className="p-1 hover:text-slate-700 text-slate-500 dark:text-gray-500 dark:hover:text-gray-300">
                     <Plus className="w-3.5 h-3.5" />
                   </button>
                 </div>
               </div>
             </div>
           )}

           {/* Recently Deleted section */}
           {!isCollapsed && (
             <div className="mt-1 px-3 flex flex-col pb-4 border-b border-slate-200 dark:border-white/5">
               <button 
                 onClick={() => setIsRecentlyDeletedOpen(!isRecentlyDeletedOpen)}
                 aria-label="Toggle recently deleted items menu"
                 aria-expanded={isRecentlyDeletedOpen}
                 className="flex items-center px-3 py-1.5 text-[13px] font-semibold text-slate-700 dark:text-gray-300 hover:bg-slate-50 dark:hover:bg-[#1a1a1a] rounded-md transition-colors group mb-1 w-fit"
               >
                 <Trash2 className="w-3.5 h-3.5 mr-2 text-slate-500 dark:text-gray-500" />
                 Recently Deleted
                 <ChevronDown className={cn("w-3.5 h-3.5 ml-1.5 text-slate-400 dark:text-gray-500 transition-transform", !isRecentlyDeletedOpen && "-rotate-90")} />
               </button>
               
               {isRecentlyDeletedOpen && (
                 <div className="flex flex-col space-y-0.5 mt-0.5 ml-3 border-l border-slate-200 dark:border-white/10 pl-2">
                    <Link to="#" className="flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-slate-100 dark:hover:bg-[#1a1a1a] text-slate-600 dark:text-gray-400 text-[13px] hover:text-slate-900 dark:hover:text-gray-200 transition-colors group">
                      <MessageSquare className="w-3.5 h-3.5 shrink-0 text-slate-400 dark:text-gray-500 group-hover:text-slate-600 dark:group-hover:text-gray-400" />
                      <span className="truncate">Biology Doubt</span>
                    </Link>
                    <Link to="#" className="flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-slate-100 dark:hover:bg-[#1a1a1a] text-slate-600 dark:text-gray-400 text-[13px] hover:text-slate-900 dark:hover:text-gray-200 transition-colors group">
                      <FileText className="w-3.5 h-3.5 shrink-0 text-slate-400 dark:text-gray-500 group-hover:text-slate-600 dark:group-hover:text-gray-400" />
                      <span className="truncate">Untitled Document</span>
                    </Link>
                 </div>
               )}
             </div>
           )}

           {/* Upgrade Plan */}
           {!isCollapsed && (
             <div className="px-3 mt-12 mb-2">
               <div className="bg-slate-100 dark:bg-[#1a1a1a] rounded-xl p-4 border border-slate-200 dark:border-[#333]">
                 <h4 className="font-bold text-slate-900 dark:text-gray-100 text-sm mb-1">Upgrade your plan</h4>
                 <p className="text-[13px] text-slate-600 dark:text-gray-400 leading-relaxed mb-3">
                   Upgrade your plan for higher limits across chat, uploads, and study tools.
                 </p>
                 <button className="w-full bg-blue-600 hover:bg-blue-700 text-white flex items-center justify-center gap-2 py-2 rounded-lg text-sm font-semibold transition-colors">
                   Upgrade your plan <ArrowRight className="w-4 h-4 ml-1" />
                 </button>
               </div>
             </div>
           )}
        </div>

        <div className={cn("pb-3 pt-2 shrink-0 border-t border-slate-200 dark:border-white/5 transition-colors", isCollapsed ? "px-2 flex flex-col items-center" : "px-3")}>
          <Link to="#" className={cn("flex items-center transition-colors duration-200 font-medium text-[14px] text-slate-600 dark:text-gray-400 hover:text-slate-900 dark:hover:text-gray-200 hover:bg-slate-100 dark:hover:bg-[#1a1a1a] cursor-pointer", isCollapsed ? "justify-center w-10 h-10 rounded-lg mb-1" : "gap-3 px-3 py-2 rounded-lg mb-0.5")} title={isCollapsed ? "Changelog" : undefined}>
            <Package className={cn("shrink-0", isCollapsed ? "w-5 h-5" : "w-[18px] h-[18px]")} />
            {!isCollapsed && <span className="truncate flex-1">Changelog</span>}
          </Link>
          <button onClick={() => setIsFeedbackModalOpen(true)} className={cn("flex items-center transition-colors duration-200 font-medium text-[14px] text-slate-600 dark:text-gray-400 hover:text-slate-900 dark:hover:text-gray-200 hover:bg-slate-100 dark:hover:bg-[#1a1a1a] cursor-pointer", isCollapsed ? "justify-center w-10 h-10 rounded-lg mb-1" : "gap-3 px-3 py-2 rounded-lg mb-2")} title={isCollapsed ? "Share Feedback" : undefined}>
            <MessageSquareShare className={cn("shrink-0", isCollapsed ? "w-5 h-5" : "w-[18px] h-[18px]")} />
            {!isCollapsed && <span className="truncate flex-1">Share Feedback</span>}
          </button>
          
          <div className="relative" ref={profileMenuRef}>
            <div 
              onClick={() => setIsProfileMenuOpen(!isProfileMenuOpen)}
              className={cn("flex justify-between items-center transition-colors duration-200 cursor-pointer pt-2 border-t border-slate-200 dark:border-white/5 hover:bg-slate-50 dark:hover:bg-[#1a1a1a]", isCollapsed ? "justify-center w-10 h-10 rounded-full mt-2 mx-auto" : "px-3 py-2 rounded-lg")}
            >
               {isCollapsed ? (
                 <div className="w-8 h-8 rounded-full bg-purple-600 flex items-center justify-center text-white text-sm font-bold shadow-sm shrink-0 uppercase">
                   {user?.displayName?.charAt(0) || user?.email?.charAt(0) || 'U'}
                 </div>
               ) : (
                 <>
                   <div className="flex items-center gap-3 overflow-hidden">
                     <div className="w-7 h-7 rounded-full bg-purple-600 flex items-center justify-center text-white text-xs font-bold shadow-sm shrink-0 uppercase">
                       {user?.displayName?.charAt(0) || user?.email?.charAt(0) || 'U'}
                     </div>
                     <div className="text-[14px] font-medium text-slate-700 dark:text-gray-200 truncate pr-2">
                       {user?.displayName || user?.email || 'User'}
                     </div>
                   </div>
                   <ChevronDown className={cn("w-4 h-4 text-slate-400 dark:text-gray-500 shrink-0 transition-transform", isProfileMenuOpen && "rotate-180")} />
                 </>
               )}
            </div>

            {/* Profile Dropdown Menu */}
            {isProfileMenuOpen && (
              <div className="absolute bottom-full left-0 mb-2 w-full min-w-[200px] bg-white dark:bg-[#1f1f1f] border border-slate-200 dark:border-white/10 rounded-xl shadow-lg p-1 z-50 overflow-hidden">
                {!isCollapsed && (
                  <div className="px-3 py-2 border-b border-slate-100 dark:border-white/5 mb-1">
                    <div className="text-sm font-medium text-slate-900 dark:text-gray-100 truncate">{user?.displayName || 'User'}</div>
                    <div className="text-xs text-slate-500 dark:text-gray-400 truncate">{user?.email}</div>
                  </div>
                )}
                <button 
                  onClick={async () => {
                    await logout();
                    navigate('/signin');
                  }}
                  className="w-full flex items-center justify-start gap-2 px-3 py-2 text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-500/10 rounded-lg transition-colors font-medium"
                >
                  <LogOut className="w-4 h-4 shrink-0" />
                  {!isCollapsed && "Sign out"}
                </button>
              </div>
            )}
          </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0 h-full relative">
        
        {/* Top Header */}
        <header className="h-20 bg-slate-50 dark:bg-[#131314] flex items-center justify-between px-4 md:px-8 z-10 shrink-0 w-full md:pt-4 transition-colors duration-300">
          
          <div className="flex items-center gap-2 md:gap-3">
            <button
               onClick={() => setIsMobileMenuOpen(true)}
               className="md:hidden p-2 -ml-2 text-slate-500 hover:bg-slate-200 dark:hover:bg-white/10 rounded-lg dark:text-slate-400 dark:hover:text-slate-200 transition-colors"
               title="Open Menu"
               aria-label="Open mobile menu"
               aria-expanded={isMobileMenuOpen}
             >
               <Menu className="w-5 h-5" />
             </button>
            <div className="flex flex-col">
              <Breadcrumb />
              {location.pathname !== '/research' && (
                <h1 className="text-lg md:text-xl font-bold text-slate-900 dark:text-gray-100">{getPageTitle()}</h1>
              )}
            </div>
          </div>

          {/* Right Actions */}
          {location.pathname === '/research' ? (
            <div className="flex items-center gap-2 md:gap-4 shrink-0 pl-2 md:pl-6">
              <button 
                onClick={() => setIsFeedbackModalOpen(true)}
                className="hidden md:flex items-center gap-2 px-3 py-1.5 rounded-lg text-slate-500 hover:text-slate-800 dark:text-gray-400 dark:hover:text-gray-200 text-sm font-medium transition-colors border border-transparent hover:border-slate-200 dark:hover:border-white/10"
              >
                <Bug className="w-[18px] h-[18px]" strokeWidth={1.75} />
                Report Bug
              </button>
              <button 
                className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-3 md:px-4 py-2 rounded-full text-xs md:text-[13px] font-semibold transition-colors shadow-sm"
              >
                <Sparkles className="w-4 h-4" />
                <span className="hidden sm:inline">Upgrade Plan</span>
                <span className="sm:hidden">Upgrade</span>
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-2 md:gap-6 shrink-0 pl-2 md:pl-6">
              <div className="hidden lg:flex w-[320px] items-center bg-white dark:bg-[#1f1f1f] rounded-full px-4 py-2.5 border border-slate-200 dark:border-white/10 focus-within:border-teal-500 dark:focus-within:border-indigo-500 focus-within:shadow-sm transition-all focus-within:bg-white dark:focus-within:bg-[#1f1f1f] shadow-[0_2px_10px_rgb(0,0,0,0.02)]">
                <Search className="w-4 h-4 text-slate-400 shrink-0 mr-2" />
                <input 
                  type="text" 
                  placeholder="Search..." 
                  className="flex-1 bg-transparent border-none outline-none text-sm text-slate-800 dark:text-gray-200 placeholder:text-slate-400 dark:placeholder:text-gray-500"
                />
                <div className="flex items-center justify-center px-1.5 py-0.5 bg-slate-100 dark:bg-white/10 rounded text-[10px] text-slate-400 dark:text-gray-400 font-medium ml-2">
                  ⌘ F
                </div>
              </div>

              {location.pathname === '/chat' && (
                <button 
                  onClick={() => setIsShareModalOpen(true)}
                  className="hidden md:flex items-center gap-2 px-3 py-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-[#1a1a1a] text-slate-500 hover:text-slate-800 dark:text-gray-400 dark:hover:text-gray-200 text-sm font-medium transition-colors border border-transparent hover:border-slate-200 dark:hover:border-white/10"
                >
                  <SquareArrowOutUpRight className="w-[18px] h-[18px]" strokeWidth={1.75} />
                  Share
                </button>
              )}

              <button onClick={toggleTheme} aria-label={theme === 'dark' ? 'Switch to Light Mode' : 'Switch to Dark Mode'} className="relative w-9 h-9 md:w-10 md:h-10 rounded-full bg-white dark:bg-[#1f1f1f] flex items-center justify-center text-slate-400 hover:text-slate-600 dark:text-gray-400 dark:hover:text-gray-200 transition-colors shadow-[0_2px_10px_rgb(0,0,0,0.02)] border border-slate-200 dark:border-white/10 hover:border-slate-300 dark:hover:border-white/20" title={theme === 'dark' ? 'Light Mode' : 'Dark Mode'}>
                {theme === 'dark' ? <Sun className="w-[18px] h-[18px]" aria-hidden="true" /> : <Moon className="w-[18px] h-[18px]" aria-hidden="true" />}
              </button>
              <button aria-label="Notifications" className="hidden sm:flex relative w-10 h-10 rounded-full bg-white dark:bg-[#1f1f1f] items-center justify-center text-slate-400 hover:text-slate-600 dark:text-gray-400 dark:hover:text-gray-200 transition-colors shadow-[0_2px_10px_rgb(0,0,0,0.02)] border border-slate-200 dark:border-white/10 hover:border-slate-300 dark:hover:border-white/20">
                <Bell className="w-[18px] h-[18px]" aria-hidden="true" />
                <span className="absolute top-2.5 right-2.5 w-1.5 h-1.5 bg-teal-500 dark:bg-indigo-500 rounded-full" />
              </button>
              
              <div className="flex items-center gap-3 cursor-pointer pl-1 md:pl-2">
                <div className="w-8 h-8 md:w-10 md:h-10 rounded-full bg-indigo-600 flex items-center justify-center text-white text-sm md:text-base font-bold shadow-sm border-2 border-white dark:border-[#131314] uppercase">
                  {user?.displayName?.charAt(0) || user?.email?.charAt(0) || 'U'}
                </div>
                <div className="hidden sm:block">
                  <div className="text-sm font-semibold text-slate-900 dark:text-gray-200 truncate max-w-[120px]">{user?.displayName || 'User'}</div>
                  <div className="text-[11px] text-teal-600 dark:text-indigo-400 font-bold uppercase tracking-wider">Student</div>
                </div>
              </div>
            </div>
          )}
        </header>

        {/* Scrollable Page Content */}
        <main className="flex-1 overflow-x-hidden overflow-y-auto w-full bg-slate-50 dark:bg-[#131314] relative transition-colors duration-300">
           <AnimatePresence mode="popLayout">
             <motion.div
               key={location.pathname}
               initial={{ opacity: 0, y: 10 }}
               animate={{ opacity: 1, y: 0 }}
               exit={{ opacity: 0, y: -10 }}
               transition={{ duration: 0.25 }}
               className="min-h-full p-4 md:p-8 pt-4 md:pt-6 w-full"
             >
               <Outlet />
             </motion.div>
           </AnimatePresence>
        </main>
      </div>

      <ShareModal isOpen={isShareModalOpen} onClose={() => setIsShareModalOpen(false)} />
      <FeedbackModal isOpen={isFeedbackModalOpen} onClose={() => setIsFeedbackModalOpen(false)} />
      <HighlightAction />
    </motion.div>
  );
}
