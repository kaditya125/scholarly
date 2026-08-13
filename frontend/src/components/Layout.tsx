import React, { useState, useRef, useEffect } from "react";
import { Link, Outlet, useLocation, useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "motion/react";
import { useTheme } from "../lib/ThemeContext";
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
  ChevronDown,
  ArrowRight,
  Package,
  MessageSquareShare,
  PanelLeftClose,
  PanelLeft,
  Sun,
  Moon,
  Share,
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
  LogOut,
  Users,
  Compass,
  ShieldAlert,
  Settings,
  Workflow,
  HelpCircle,
  FolderOpen,
  GraduationCap,
  Palette
} from "lucide-react";

import { cn } from "../lib/utils";
import { ShareModal } from "./ShareModal";
import { FeedbackModal } from "./FeedbackModal";
import HighlightAction from "./HighlightAction";
import { useAuth } from "../lib/AuthContext";
import { api } from "../lib/api/client";
import { AppearanceModal } from "./AppearanceModal";
import { NotificationsMenu } from "./NotificationsMenu";
import { CommandPalette } from "./CommandPalette";

/**
 * Sidebar navigation. Items are laid out in visual sections separated by a
 * hair-thin divider so related destinations cluster together — Study surfaces
 * (Home, AI Chat), Creation surfaces (Documents, Notebooks, Content
 * Pipeline, Podcasts), Social surface (Community), Practice surfaces (Tests,
 * Study Plan, Study Groups, My Doubts), and Utility (Explore, Settings).
 *
 * "AI Workspace" removed on request — the same tools are surfaced inside the
 * Podcast Studio.
 * "Chats & DMs" / "Discussions" removed — both live inside /community as tabs.
 */
const MAIN_MENU: { label: string; path: string; icon: any; group?: 'top' }[] = [
  // Study
  { label: "Home", path: "/dashboard", icon: Home, group: 'top' },
  { label: "AI Chat", path: "/chat", icon: BotMessageSquare },

  // Create
  { label: "Documents", path: "/documents", icon: FolderOpen, group: 'top' },
  { label: "Notebooks", path: "/notebooks", icon: BookOpen },
  { label: "Content Pipeline", path: "/pipeline", icon: Workflow },
  { label: "Podcasts", path: "/podcasts", icon: Headphones },

  // Social
  { label: "Community", path: "/community", icon: Users, group: 'top' },

  // Practice
  { label: "Tests", path: "/tests", icon: FileText, group: 'top' },
  { label: "Study Plan", path: "/planner", icon: Calendar },
  { label: "Study Groups", path: "/groups", icon: Users },
  // Classes a teacher has enrolled this student in (Phase 3E). Distinct from Study Groups:
  // a group is peer-formed, a class is taught and requires an accepted enrolment edge.
  { label: "My Classes", path: "/my-classes", icon: GraduationCap },
  { label: "My Doubts", path: "/doubts", icon: HelpCircle },

  // Utility
  { label: "Explore", path: "/explore", icon: Compass, group: 'top' },
  { label: "Settings", path: "/settings", icon: Settings },
];

/**
 * Single sidebar row. Selection is a soft-tinted pill with a subtle 1px
 * inset ring — quieter than the previous solid gray fill, which is what the
 * Taskk-style reference uses. The active icon picks up the same color as the
 * label so the whole row reads as one unit rather than a glyph + text pair.
 */
const NavItem: React.FC<{ item: any, currentPath: string, collapsed?: boolean }> = ({ item, currentPath, collapsed }) => {
  const isActive = currentPath === item.path || (currentPath.startsWith(item.path) && item.path !== "/");
  const Icon = item.icon;

  return (
    <Link
      to={item.path}
      className={cn(
        "flex items-center transition-colors duration-150 group antialiased",
        collapsed
          ? "justify-center w-8 h-8 mx-auto rounded-lg"
          : "gap-2.5 h-[30px] px-2.5 rounded-lg mx-2.5 text-[12.5px] tracking-[-0.006em]",
        isActive
          ? "bg-slate-100 text-slate-900 font-medium dark:bg-white/[0.07] dark:text-white"
          : "text-slate-500 font-normal hover:bg-slate-100/70 hover:text-slate-900 dark:text-gray-400 dark:hover:bg-white/[0.04] dark:hover:text-gray-100"
      )}
      title={collapsed ? item.label : undefined}
    >
      <Icon
        className={cn(
          "shrink-0 w-4 h-4",
          isActive
            ? "text-slate-900 dark:text-white"
            : "text-slate-400 group-hover:text-slate-700 dark:text-gray-500 dark:group-hover:text-gray-200"
        )}
        strokeWidth={isActive ? 2 : 1.6}
      />
      {!collapsed && <span className="truncate flex-1 leading-none">{item.label}</span>}
    </Link>
  );
};

export function AppLayout() {
  const location = useLocation();
  const navigate = useNavigate();
  const { theme, toggleTheme } = useTheme();
  /**
   * Sidebar collapse is persisted because App.tsx renders <Routes key={location.pathname}>,
   * which remounts this whole layout on every navigation — plain useState would snap the
   * rail back open each time you clicked a link. localStorage also makes the choice
   * survive a reload, which is what users expect from a collapsible rail anyway.
   */
  const [isCollapsed, setIsCollapsed] = useState(
    () => localStorage.getItem('sidebarCollapsed') === 'true'
  );
  useEffect(() => {
    localStorage.setItem('sidebarCollapsed', String(isCollapsed));
  }, [isCollapsed]);
  const [isRecentOpen, setIsRecentOpen] = useState(true);
  const [isMoreOpen, setIsMoreOpen] = useState(false);
  const [isShareModalOpen, setIsShareModalOpen] = useState(false);
  const [isFeedbackModalOpen, setIsFeedbackModalOpen] = useState(false);
  const [isNewMenuOpen, setIsNewMenuOpen] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isProfileMenuOpen, setIsProfileMenuOpen] = useState(false);
  const [isAppearanceOpen, setIsAppearanceOpen] = useState(false);
  const [isCommandPaletteOpen, setIsCommandPaletteOpen] = useState(false);
  const newMenuRef = useRef<HTMLDivElement>(null);
  const profileMenuRef = useRef<HTMLDivElement>(null);
  const { user, logout } = useAuth();

  /**
   * Recent chats for the sidebar's "Recent" section. Reads the same endpoint the
   * chat page uses (GET /api/chat/sessions). Refetched when the route changes so a
   * conversation started on /chat shows up here without a reload. Failure is
   * non-fatal — the section just renders its empty state.
   */
  const [recentSessions, setRecentSessions] = useState<any[]>([]);
  useEffect(() => {
    if (!user?.uid) { setRecentSessions([]); return; }
    let cancelled = false;
    (async () => {
      try {
        const res = await api.get(`/chat/sessions?userId=${user.uid}`);
        if (!cancelled) setRecentSessions(Array.isArray(res.data) ? res.data : []);
      } catch {
        if (!cancelled) setRecentSessions([]);
      }
    })();
    return () => { cancelled = true; };
  }, [user?.uid, location.pathname]);

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
      // Command palette: Cmd/Ctrl + K
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setIsCommandPaletteOpen(true);
      }
      // Close on Escape
      if (e.key === 'Escape') {
        setIsCommandPaletteOpen(false);
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
      case '/community': return 'Community';
      case '/report': return 'Detailed Report';
      case '/flashcards': return 'My Flashcards';
      case '/workspace': return 'AI Workspace';
      case '/documents': return 'Documents';
      case '/notebooks': return 'Notebooks';
      case '/pipeline': return 'Content Pipeline';
      case '/doubts': return 'My Doubts';
      case '/settings': return 'Settings';
      case '/groups': return 'Study Groups';
      case '/explore': return 'Explore';
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
        !isMobileMenuOpen && isCollapsed ? "md:w-[52px]" : "md:w-[260px]"
      )}>
        {/* Brand + collapse control. The brand mark uses a slightly softer
            tracking + lowercase-caps blend so it reads like a wordmark rather
            than a shouty ALL-CAPS label. */}
        <div className={cn(
          "h-[60px] flex items-center shrink-0 transition-colors duration-300",
          isCollapsed ? "justify-center px-0 flex-col py-2" : "px-4 justify-between"
        )}>
          {!isCollapsed ? (
            <Link to="/" className="flex items-center gap-2.5 overflow-hidden">
              <svg className="shrink-0" width="22" height="22" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M12 2L2 7L12 12L22 7L12 2Z" fill="#facc15"/>
                <path d="M2 17L12 22L22 17M2 12L12 17L22 12" stroke="#facc15" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
              <span className="font-semibold text-[15.5px] tracking-tight text-slate-900 dark:text-white">
                Scholarly
              </span>
            </Link>
          ) : (
            <Link to="/" className="flex items-center justify-center w-full mb-3 shrink-0">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M12 2L2 7L12 12L22 7L12 2Z" fill="#facc15"/>
                <path d="M2 17L12 22L22 17M2 12L12 17L22 12" stroke="#facc15" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </Link>
          )}

          <button
            onClick={() => setIsCollapsed(!isCollapsed)}
            className={cn(
              "rounded-lg text-slate-500 dark:text-gray-500 hover:text-slate-800 dark:hover:text-gray-200 hover:bg-slate-100/70 dark:hover:bg-white/[0.05] focus:outline-none transition-colors hidden md:flex items-center justify-center",
              isCollapsed ? "mt-1 w-8 h-8" : "w-7 h-7"
            )}
            title={isCollapsed ? "Expand sidebar" : "Collapse sidebar"}
            aria-label={isCollapsed ? "Expand sidebar" : "Collapse sidebar"}
            aria-expanded={!isCollapsed}
          >
            {isCollapsed ? <PanelLeft className="w-[16px] h-[16px]" strokeWidth={1.75} /> : <PanelLeftClose className="w-[16px] h-[16px]" strokeWidth={1.75} />}
          </button>
        </div>
        
        <div className={cn("flex-1 w-full max-w-full", isCollapsed ? "pt-1 pb-3" : "pt-3 pb-6")}>
           <nav className="relative" role="navigation" aria-label="Main navigation">
              {MAIN_MENU.map((item, idx) => (
                 <div key={item.path}>
                   {/* Hairline section divider only in expanded mode. `group:'top'`
                       marks the first item of a new visual cluster; we insert
                       a slim margin above it so related items breathe together
                       without adding actual horizontal rules that would clutter
                       the rail. */}
                   {!isCollapsed && idx > 0 && item.group === 'top' && (
                     <div className="my-1.5 mx-4 h-px bg-slate-100 dark:bg-white/[0.04]" aria-hidden="true" />
                   )}
                   {/* Collapsed rail gets spacing, not rules. Four hairlines across a
                       56px column read as scattered fragments rather than one list. */}
                   {isCollapsed && idx > 0 && item.group === 'top' && (
                     <div className="h-[3px]" aria-hidden="true" />
                   )}
                   <div className="mb-0.5">
                     <NavItem item={item} currentPath={location.pathname} collapsed={isCollapsed} />
                   </div>
                 </div>
              ))}
              
              <div className={cn("px-2.5 mt-4 relative", isCollapsed && "flex justify-center")} ref={newMenuRef}>
                 <button
                   onClick={() => setIsNewMenuOpen(!isNewMenuOpen)}
                   className={cn(
                     // Softer indigo, subtle gradient, thin ring — the "New"
                     // affordance should feel considered rather than shouty.
                     "flex items-center justify-center transition-all duration-150 shadow-[0_1px_2px_rgba(15,23,42,0.08),0_4px_10px_-4px_rgba(79,70,229,0.35)] hover:shadow-[0_1px_2px_rgba(15,23,42,0.1),0_6px_14px_-4px_rgba(79,70,229,0.45)] active:translate-y-px",
                     "bg-gradient-to-b from-indigo-500 to-indigo-600 hover:from-indigo-500 hover:to-indigo-700 text-white",
                     isCollapsed
                       ? "w-10 h-10 rounded-[10px]"
                       : "w-full gap-2 h-9 rounded-xl text-[13.5px] font-semibold tracking-tight"
                   )}
                   aria-label="Create new item"
                   aria-haspopup="dialog"
                   aria-expanded={isNewMenuOpen}
                 >
                   <Plus className={cn("shrink-0 w-4 h-4")} strokeWidth={2.25} />
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

           {/* Recent — collapsible list of recently-touched surfaces. Section
               header uses an all-caps 11 px eyebrow (tracking-widest) instead of
               a bold slate label; the earlier variant looked like a nav item.
               Child rows share the NavItem language: h-8, rounded-lg, subtle
               hover. Indent guide is a single 1 px column, softer than the
               previous border-l that visually competed with the item pills. */}
           {!isCollapsed && (
             <div className="mt-5 px-2.5">
               <button
                 onClick={() => setIsRecentOpen(!isRecentOpen)}
                 className="w-full flex items-center justify-between px-2.5 h-7 text-[11px] font-medium text-slate-400 dark:text-gray-500 hover:text-slate-600 dark:hover:text-gray-300 transition-colors"
                 aria-label="Toggle recent items menu"
                 aria-expanded={isRecentOpen}
               >
                 <span>Recent</span>
                 <ChevronDown className={cn("w-3 h-3 transition-transform duration-200", !isRecentOpen && "-rotate-90")} strokeWidth={2} />
               </button>

               {isRecentOpen && (
                 <div className="mt-1 pl-3 ml-3 border-l border-slate-100 dark:border-white/[0.05] space-y-0.5 max-h-[220px] overflow-y-auto custom-scrollbar">
                   {recentSessions.length === 0 ? (
                     <div className="px-2 py-2 text-[12px] text-slate-400 dark:text-gray-500">
                       No recent chats
                     </div>
                   ) : (
                     recentSessions.map((s) => (
                       <Link
                         key={s.sessionId}
                         to={`/chat?session=${s.sessionId}`}
                         title={s.title || 'Study Assistant'}
                         className="flex items-center gap-2 px-2 h-8 rounded-lg text-[13px] text-slate-600 dark:text-gray-400 hover:bg-slate-100/60 hover:text-slate-900 dark:hover:bg-white/[0.04] dark:hover:text-gray-100 transition-colors group"
                       >
                         <MessageSquare className="w-3.5 h-3.5 shrink-0 text-slate-400 dark:text-gray-500 group-hover:text-slate-700 dark:group-hover:text-gray-300" strokeWidth={1.75} />
                         <span className="truncate">
                           {s.title || (s.topicType === 'chat' ? 'Study Assistant' : s.topicType) || 'Untitled chat'}
                         </span>
                       </Link>
                     ))
                   )}
                 </div>
               )}
             </div>
           )}

           {/* More — everything secondary folds into one disclosure, closed by default,
               so the idle rail is just navigation + Recent. Folders and Recently Deleted
               both still render placeholder content, which is another reason not to give
               them permanent real estate. */}
           {!isCollapsed && (
             <div className="mt-3 px-2.5">
               <button
                 onClick={() => setIsMoreOpen(!isMoreOpen)}
                 aria-label="Toggle more sidebar sections"
                 aria-expanded={isMoreOpen}
                 className="w-full flex items-center justify-between px-2.5 h-7 text-[11px] font-medium text-slate-400 dark:text-gray-500 hover:text-slate-600 dark:hover:text-gray-300 transition-colors"
               >
                 <span>More</span>
                 <ChevronDown className={cn("w-3 h-3 transition-transform duration-200", !isMoreOpen && "-rotate-90")} strokeWidth={2} />
               </button>

               {isMoreOpen && (
                 <div className="mt-1 space-y-0.5">
                   <div className="flex items-center justify-between px-2.5 h-7 group/folders">
                     <span className="text-[11px] font-medium text-slate-400 dark:text-gray-500">Folders</span>
                     <button
                       aria-label="Create new folder"
                       className="w-5 h-5 flex items-center justify-center rounded-md text-slate-400 dark:text-gray-500 opacity-0 group-hover/folders:opacity-100 hover:text-slate-700 hover:bg-slate-100 dark:hover:text-gray-200 dark:hover:bg-white/[0.05] transition-all"
                     >
                       <Plus className="w-3 h-3" strokeWidth={2.25} />
                     </button>
                   </div>

                   <Link
                     to="/trash"
                     className="flex items-center gap-2.5 px-2.5 h-[30px] rounded-lg text-[12.5px] text-slate-500 dark:text-gray-400 hover:bg-slate-100/70 hover:text-slate-900 dark:hover:bg-white/[0.04] dark:hover:text-gray-100 transition-colors group"
                   >
                     <Trash2 className="w-4 h-4 shrink-0 text-slate-400 dark:text-gray-500 group-hover:text-slate-700 dark:group-hover:text-gray-200" strokeWidth={1.6} />
                     <span className="truncate">Recently Deleted</span>
                   </Link>
                 </div>
               )}
             </div>
           )}

           {/* Upgrade card. Feels like a real marketing surface now — a soft
               indigo-to-slate radial wash, refined typography, and a ghost
               button that reveals a filled fill on hover. Ships more polish
               than a solid tint + shouty blue CTA. */}
           {!isCollapsed && (
             <div className="px-2.5 mt-8 mb-2">
               <div className="relative overflow-hidden rounded-2xl border border-slate-200/70 dark:border-white/[0.06] bg-gradient-to-br from-indigo-50 via-white to-white dark:from-indigo-500/[0.08] dark:via-transparent dark:to-transparent p-4">
                 <div className="absolute -top-6 -right-6 w-24 h-24 rounded-full bg-indigo-500/10 dark:bg-indigo-400/10 blur-2xl pointer-events-none" aria-hidden="true" />
                 <div className="relative">
                   <div className="inline-flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.1em] text-indigo-600 dark:text-indigo-300 mb-2">
                     <Sparkles className="w-3 h-3" strokeWidth={2} />
                     Pro
                   </div>
                   <h4 className="font-semibold text-[14px] text-slate-900 dark:text-white tracking-tight">
                     Unlock higher limits
                   </h4>
                   <p className="text-[12.5px] text-slate-500 dark:text-gray-400 leading-relaxed mt-1 mb-3">
                     Higher chat, uploads, and study-tool limits.
                   </p>
                   <button
                     onClick={() => navigate('/checkout')}
                     className="w-full h-8 flex items-center justify-center gap-1.5 rounded-lg text-[13px] font-semibold text-white bg-slate-900 hover:bg-slate-800 dark:bg-white dark:text-slate-900 dark:hover:bg-slate-100 transition-colors"
                   >
                     Upgrade
                     <ArrowRight className="w-3.5 h-3.5" strokeWidth={2.25} />
                   </button>
                 </div>
               </div>
             </div>
           )}
        </div>

        <div className={cn("pb-3 pt-2 shrink-0 border-t border-slate-200 dark:border-white/5 transition-colors", isCollapsed ? "px-1 pt-1.5 pb-2 flex flex-col items-center" : "px-3")}>
          <Link to="#" className={cn("flex items-center transition-colors duration-200 font-medium text-[14px] text-slate-600 dark:text-gray-400 hover:text-slate-900 dark:hover:text-gray-200 hover:bg-slate-100 dark:hover:bg-[#1a1a1a] cursor-pointer", isCollapsed ? "justify-center w-8 h-8 mx-auto rounded-lg" : "gap-3 px-3 py-2 rounded-lg mb-0.5")} title={isCollapsed ? "Changelog" : undefined}>
            <Package className={cn("shrink-0", isCollapsed ? "w-4 h-4" : "w-[18px] h-[18px]")} strokeWidth={1.6} />
            {!isCollapsed && <span className="truncate flex-1">Changelog</span>}
          </Link>
          <button onClick={() => setIsFeedbackModalOpen(true)} className={cn("flex items-center transition-colors duration-200 font-medium text-[14px] text-slate-600 dark:text-gray-400 hover:text-slate-900 dark:hover:text-gray-200 hover:bg-slate-100 dark:hover:bg-[#1a1a1a] cursor-pointer", isCollapsed ? "justify-center w-8 h-8 mx-auto rounded-lg" : "gap-3 px-3 py-2 rounded-lg mb-2")} title={isCollapsed ? "Share Feedback" : undefined}>
            <MessageSquareShare className={cn("shrink-0", isCollapsed ? "w-4 h-4" : "w-[18px] h-[18px]")} strokeWidth={1.6} />
            {!isCollapsed && <span className="truncate flex-1">Share Feedback</span>}
          </button>
          
          <div className="relative" ref={profileMenuRef}>
            <div 
              onClick={() => setIsProfileMenuOpen(!isProfileMenuOpen)}
              className={cn("flex justify-between items-center transition-colors duration-200 cursor-pointer pt-2 border-t border-slate-200 dark:border-white/5 hover:bg-slate-50 dark:hover:bg-[#1a1a1a]", isCollapsed ? "justify-center w-8 h-8 rounded-full mt-1 mx-auto" : "px-3 py-2 rounded-lg")}
            >
               {isCollapsed ? (
                 <div className="w-8 h-8 rounded-full bg-purple-600 flex items-center justify-center text-white text-sm font-bold shadow-sm shrink-0 uppercase overflow-hidden">
                   {user?.photoURL ? <img src={user.photoURL} alt="User" className="w-full h-full object-cover" /> : (user?.displayName?.charAt(0) || user?.email?.charAt(0) || 'U')}
                 </div>
               ) : (
                 <>
                   <div className="flex items-center gap-3 overflow-hidden">
                     <div className="w-7 h-7 rounded-full bg-purple-600 flex items-center justify-center text-white text-xs font-bold shadow-sm shrink-0 uppercase overflow-hidden">
                       {user?.photoURL ? <img src={user.photoURL} alt="User" className="w-full h-full object-cover" /> : (user?.displayName?.charAt(0) || user?.email?.charAt(0) || 'U')}
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
        
        {/* Top Header — hidden on immersive routes that render their own chrome.
            /podcasts has its studio sidebar + inline header; /community has its
            own tab bar + three-panel workspace; /chat is a full-bleed conversation
            surface with its own inline header. All three duplicate the outer chrome
            so we drop the AppLayout header on those routes only. */}
        {!location.pathname.startsWith('/podcasts') &&
         !location.pathname.startsWith('/community') &&
         !location.pathname.startsWith('/chat') && (
        <header className="h-16 bg-slate-50 dark:bg-[#131314] flex items-center justify-between px-4 md:px-8 z-10 shrink-0 w-full transition-colors duration-300">
          
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
            {/* One line, not two: the breadcrumb already ends with the page name, so
                the large duplicate title below it was saying the same thing twice. */}
            <h1 className="text-[15px] font-semibold text-slate-900 dark:text-gray-100 tracking-[-0.015em]">
              {getPageTitle()}
            </h1>
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
            // Minimal action rail: one bordered element (search), everything else is a
            // flat 34px ghost icon button. The previous mix of bordered pills, drop
            // shadows and labelled buttons made the header the loudest thing on screen.
            <div className="flex items-center gap-1.5 shrink-0 pl-2 md:pl-6">
              <div
                className="hidden lg:flex w-[260px] items-center bg-white dark:bg-white/[0.04] rounded-lg px-3 h-[34px] border border-slate-200 dark:border-white/[0.08] hover:border-slate-300 dark:hover:border-white/[0.14] transition-colors cursor-pointer mr-1"
                onClick={() => setIsCommandPaletteOpen(true)}
              >
                <Search className="w-3.5 h-3.5 text-slate-400 shrink-0 mr-2" strokeWidth={1.75} />
                <span className="flex-1 text-[12.5px] text-slate-400 dark:text-gray-500 select-none">
                  Search or ask AI
                </span>
                <span className="text-[10.5px] text-slate-400 dark:text-gray-500 font-medium ml-2 tabular-nums">
                  ⌘K
                </span>
              </div>

              <button
                onClick={() => setIsAppearanceOpen(true)}
                aria-label="Appearance"
                title="Appearance"
                className="hidden md:flex w-[34px] h-[34px] items-center justify-center rounded-lg text-slate-400 dark:text-gray-500 hover:text-slate-700 dark:hover:text-gray-200 hover:bg-slate-100 dark:hover:bg-white/[0.06] transition-colors"
              >
                <Palette className="w-4 h-4" strokeWidth={1.75} />
              </button>

              <button
                onClick={toggleTheme}
                aria-label={theme === 'dark' ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
                title={theme === 'dark' ? 'Light mode' : 'Dark mode'}
                className="w-[34px] h-[34px] rounded-lg flex items-center justify-center text-slate-400 dark:text-gray-500 hover:text-slate-700 dark:hover:text-gray-200 hover:bg-slate-100 dark:hover:bg-white/[0.06] transition-colors"
              >
                {theme === 'dark' ? <Sun className="w-4 h-4" strokeWidth={1.75} aria-hidden="true" /> : <Moon className="w-4 h-4" strokeWidth={1.75} aria-hidden="true" />}
              </button>

              {/* Notifications */}
              <NotificationsMenu />
              
              
              {/* Avatar only — the name and role read as noise beside the breadcrumb,
                  which already says where you are. Identity stays available via the
                  title tooltip and the /profile destination. */}
              <Link
                to="/profile"
                className="pl-1 md:pl-2 group"
                title={user?.displayName || user?.email || 'Profile'}
                aria-label="Open your profile"
              >
                <div className="w-9 h-9 rounded-full bg-indigo-600 flex items-center justify-center text-white text-[13px] font-semibold uppercase overflow-hidden ring-1 ring-black/5 dark:ring-white/10 group-hover:ring-2 group-hover:ring-indigo-500 transition-all">
                  {user?.photoURL
                    ? <img src={user.photoURL} alt="" className="w-full h-full object-cover" />
                    : (user?.displayName?.charAt(0) || user?.email?.charAt(0) || 'U')}
                </div>
              </Link>
            </div>
          )}
        </header>
        )}

        {/* Scrollable Page Content — immersive routes get no padding so they can use full h-full */}
        {/* Immersive routes own their scrolling: the page itself must not scroll, or the
            fixed composer/panels drift. Everything else keeps the normal page scroll. */}
        <main className={cn(
          "flex-1 overflow-x-hidden w-full bg-slate-50 dark:bg-[#131314] relative transition-colors duration-300",
          location.pathname.startsWith('/chat') ? "overflow-y-hidden" : "overflow-y-auto"
        )}>
           <AnimatePresence mode="popLayout">
             <motion.div
               key={location.pathname}
               initial={{ opacity: 0, y: 10 }}
               animate={{ opacity: 1, y: 0 }}
               exit={{ opacity: 0, y: -10 }}
               transition={{ duration: 0.25 }}
               className={cn(
                 "min-h-full w-full",
                 location.pathname.startsWith('/podcasts') ||
                 location.pathname.startsWith('/community') ||
                 location.pathname.startsWith('/chat')
                   ? "h-full"
                   : "p-4 md:p-8 pt-4 md:pt-6"
               )}
             >
               <Outlet />
             </motion.div>
           </AnimatePresence>
        </main>
      </div>

      <ShareModal isOpen={isShareModalOpen} onClose={() => setIsShareModalOpen(false)} />
      <FeedbackModal isOpen={isFeedbackModalOpen} onClose={() => setIsFeedbackModalOpen(false)} />
      <AppearanceModal isOpen={isAppearanceOpen} onClose={() => setIsAppearanceOpen(false)} />
      <CommandPalette open={isCommandPaletteOpen} onClose={() => setIsCommandPaletteOpen(false)} />
      <HighlightAction />
    </motion.div>
  );
}
