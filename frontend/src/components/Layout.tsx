import React, { useState, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
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
  Palette,
  Gift,
  LifeBuoy,
  Award,
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
import { TopProfileDropdown } from "./navigation/TopProfileDropdown";
import { LogoMark } from "./brand/Logo";

/**
 * CREATE NEW formats — Study tools & Content formats.
 */
const CREATE_NEW_NAV = [
  {
    group: "Study & Prep",
    items: [
      { label: "AI Chat",       icon: BotMessageSquare, path: "/chat",     type: "chat" },
      { label: "Deep Research", icon: BrainCircuit,     path: "/research", type: "research" },
      { label: "Study Guide",   icon: BookOpen,         path: "/chat",     type: "study-guide" },
      { label: "Practice Exam", icon: CheckSquare,      path: "/tests",    type: "exam" },
    ],
  },
  {
    group: "Content & Media",
    items: [
      { label: "AI Podcast",     icon: Headphones, path: "/podcasts", type: "podcast" },
      { label: "AI Slides",      icon: Layers,     path: "/chat",     type: "slides" },
      { label: "Worksheet",      icon: FileText,   path: "/chat",     type: "worksheet" },
      { label: "Mind Map",       icon: Map,        path: "/chat",     type: "mindmap" },
      { label: "AI Infographic", icon: BarChart2,  path: "/chat",     type: "infographic" },
      { label: "AI Image",       icon: ImageIcon,  path: "/chat",     type: "image" },
      { label: "Meeting Notes",  icon: Headphones, path: "/chat",     type: "meeting-notes" },
      { label: "Blank Page",     icon: FileText,   path: "/chat",     type: "page" },
    ],
  },
];

/**
 * PRIMARY navigation — only the 5 highest-value destinations appear here.
 * Everything else lives in the More flyout to keep the rail uncluttered.
 */
const PRIMARY_NAV = [
  { label: "Home",       path: "/dashboard",  icon: Home },
  { label: "AI Chat",    path: "/chat",        icon: BotMessageSquare },
  { label: "Documents",  path: "/documents",   icon: FolderOpen },
  { label: "Tests",      path: "/tests",       icon: FileText },
  { label: "Exam Center",path: "/exam-center", icon: Award },
];

/**
 * SECONDARY navigation — shown in the More flyout panel.
 * Grouped into logical sections for scannability.
 */
const MORE_NAV = [
  {
    group: "Study",
    items: [
      { label: "Notebooks",       path: "/notebooks",  icon: BookOpen },
      { label: "Study Plan",      path: "/planner",    icon: Calendar },
      { label: "My Doubts",       path: "/doubts",     icon: HelpCircle },
      { label: "Explore",         path: "/explore",    icon: Compass },
    ],
  },
  {
    group: "Create",
    items: [
      { label: "Content Pipeline",path: "/pipeline",   icon: Workflow },
      { label: "Podcasts",        path: "/podcasts",   icon: Headphones },
    ],
  },
  {
    group: "Community",
    items: [
      { label: "Community",       path: "/community",  icon: Users },
      { label: "Study Groups",    path: "/groups",     icon: Users },
      { label: "My Classes",      path: "/my-classes", icon: GraduationCap },
    ],
  },
  {
    group: "Account",
    items: [
      { label: "Settings",        path: "/settings",   icon: Settings },
      { label: "Help & Support",  path: "/support",    icon: LifeBuoy },
      { label: "Invite Friends",  path: "/refer",      icon: Gift },
    ],
  },
];

/**
 * Single sidebar row — primary nav style.
 */
const NavItem: React.FC<{ item: any, currentPath: string, collapsed?: boolean, onClick?: () => void }> = ({ item, currentPath, collapsed, onClick }) => {
  const isActive = currentPath === item.path || (currentPath.startsWith(item.path) && item.path !== "/");
  const Icon = item.icon;

  return (
    <Link
      to={item.path}
      onClick={onClick}
      className={cn(
        "flex items-center transition-colors duration-150 group antialiased",
        collapsed
          ? "justify-center w-8 h-8 mx-auto rounded-lg"
          : "gap-2.5 h-[34px] md:h-[30px] px-2.5 rounded-lg mx-2.5 text-[13px] md:text-[12.5px] tracking-[-0.006em]",
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

export function AppLayout({ children }: { children?: React.ReactNode } = {}) {
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
  // More flyout — portal-based for collapsed rail, inline accordion for expanded
  const [isMoreFlyoutOpen, setIsMoreFlyoutOpen] = useState(false);

  // Check if any "more" item is currently active
  const isAnyMoreItemActive = MORE_NAV.flatMap(g => g.items).some(
    item => location.pathname === item.path || (location.pathname.startsWith(item.path) && item.path !== "/")
  );

  // The desktop collapsed rail mode is ONLY active on desktop when not in mobile drawer
  const isRail = isCollapsed && !isMobileMenuOpen;

  // Auto-close mobile drawer and flyouts on route change
  useEffect(() => {
    setIsMobileMenuOpen(false);
    setIsNewMenuOpen(false);
    if (isRail) {
      setIsMoreFlyoutOpen(false);
    }
  }, [location.pathname, isRail]);

  // Keep More expanded if currently navigating within a More section
  useEffect(() => {
    if (!isRail && isAnyMoreItemActive) {
      setIsMoreFlyoutOpen(true);
    }
  }, [location.pathname, isAnyMoreItemActive, isRail]);

  // Listen to open-mobile-sidebar event dispatched from embedded page header bars
  useEffect(() => {
    const handleOpen = () => setIsMobileMenuOpen(true);
    window.addEventListener('open-mobile-sidebar', handleOpen);
    return () => window.removeEventListener('open-mobile-sidebar', handleOpen);
  }, []);
  const moreFlyoutRef = useRef<HTMLDivElement>(null);
  const moreButtonRef = useRef<HTMLButtonElement>(null);
  const moreExpandedRef = useRef<HTMLDivElement>(null);
  const [moreFlyoutStyle, setMoreFlyoutStyle] = useState<React.CSSProperties>({});

  const newMenuRef = useRef<HTMLDivElement>(null);
  const newMenuButtonRef = useRef<HTMLButtonElement>(null);
  const newMenuExpandedRef = useRef<HTMLDivElement>(null);
  const [newMenuStyle, setNewMenuStyle] = useState<React.CSSProperties>({});
  const profileMenuRef = useRef<HTMLDivElement>(null);
  const { user, role, logout } = useAuth();
  const brandHome = role === 'teacher' ? '/teach' : '/dashboard';

  /**
   * Recent chats for the sidebar's "Recent" section.
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
    function handleClickOutside(event: MouseEvent) {
      if (profileMenuRef.current && !profileMenuRef.current.contains(event.target as Node)) {
        setIsProfileMenuOpen(false);
      }
      const target = event.target as Node;
      // Close More flyout when clicking outside (ONLY in collapsed rail portal mode)
      if (isRail) {
        if (
          !moreButtonRef.current?.contains(target) &&
          !moreFlyoutRef.current?.contains(target)
        ) {
          setIsMoreFlyoutOpen(false);
        }
      }
      // Close New menu when clicking outside (ONLY in collapsed rail portal mode)
      if (isRail) {
        if (
          !newMenuButtonRef.current?.contains(target) &&
          !newMenuRef.current?.contains(target)
        ) {
          setIsNewMenuOpen(false);
        }
      }
    }
    document.addEventListener("mousedown", handleClickOutside);

    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.shiftKey) {
        if (e.key.toLowerCase() === 'd') { e.preventDefault(); navigate('/dashboard'); }
        else if (e.key.toLowerCase() === 'c') { e.preventDefault(); navigate('/chat'); window.dispatchEvent(new CustomEvent('new-chat')); }
        else if (e.key.toLowerCase() === 't') { e.preventDefault(); navigate('/tests'); }
      }
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); setIsCommandPaletteOpen(true); }
      if (e.key === 'Escape') {
        setIsCommandPaletteOpen(false);
        setIsMoreFlyoutOpen(false);
        setIsNewMenuOpen(false);
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
          className="fixed inset-0 bg-black/60 backdrop-blur-xs z-40 md:hidden"
          onClick={() => setIsMobileMenuOpen(false)}
        />
      )}
      {/* Sidebar */}
      <aside className={cn(
        "bg-white dark:bg-[#161619] border-r border-slate-200 dark:border-white/[0.08] flex flex-col shrink-0 overflow-y-auto overscroll-contain custom-scrollbar transition-all duration-300", 
        "fixed inset-y-0 left-0 md:relative z-50 h-[100dvh] md:h-full",
        isMobileMenuOpen ? "translate-x-0 w-[290px] max-w-[86vw] shadow-2xl" : "-translate-x-full md:translate-x-0",
        isRail ? "md:w-[52px]" : "md:w-[260px]"
      )}>
        {/* Brand + collapse control / mobile close */}
        <div className={cn(
          "h-[60px] flex items-center shrink-0 transition-colors duration-300",
          isRail ? "justify-center px-0 flex-col py-2" : "px-4 justify-between"
        )}>
          {!isRail ? (
            <Link to={brandHome} onClick={() => setIsMobileMenuOpen(false)} className="flex items-center gap-2.5 overflow-hidden group">
              <LogoMark className="shrink-0 w-[22px] h-[22px] group-hover:scale-105 transition-transform" />
              <span className="font-semibold text-[15.5px] tracking-tight text-slate-900 dark:text-white">
                Sadhya<span className="text-[#c8e558]">.</span>
              </span>
            </Link>
          ) : (
            <Link to={brandHome} className="flex items-center justify-center w-full mb-3 shrink-0 group">
              <LogoMark className="w-[22px] h-[22px] group-hover:scale-105 transition-transform" />
            </Link>
          )}

          {/* Desktop collapse toggle */}
          <button
            onClick={() => setIsCollapsed(!isCollapsed)}
            className={cn(
              "rounded-lg text-slate-500 dark:text-gray-500 hover:text-slate-800 dark:hover:text-gray-200 hover:bg-slate-100/70 dark:hover:bg-white/[0.05] focus:outline-none transition-colors hidden md:flex items-center justify-center",
              isRail ? "mt-1 w-8 h-8" : "w-7 h-7"
            )}
            title={isCollapsed ? "Expand sidebar" : "Collapse sidebar"}
            aria-label={isCollapsed ? "Expand sidebar" : "Collapse sidebar"}
            aria-expanded={!isCollapsed}
          >
            {isCollapsed ? <PanelLeft className="w-[16px] h-[16px]" strokeWidth={1.75} /> : <PanelLeftClose className="w-[16px] h-[16px]" strokeWidth={1.75} />}
          </button>

          {/* Mobile close button */}
          <button
            onClick={() => setIsMobileMenuOpen(false)}
            className="md:hidden w-8 h-8 rounded-lg flex items-center justify-center text-slate-500 dark:text-gray-400 hover:bg-slate-100 dark:hover:bg-white/10 transition-colors"
            aria-label="Close mobile navigation"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        
        <div className={cn("flex-1 w-full max-w-full", isRail ? "pt-1 pb-3" : "pt-3 pb-6")}>
           <nav className="relative" role="navigation" aria-label="Main navigation">
               {/* ── New button ──────────────────────────────────────────────
                    EXPANDED  → inline accordion directly inside sidebar.
                    COLLAPSED → attached flyout anchored to the right of rail.
                 ─────────────────────────────────────────────────────────── */}
               {!isRail && (
                 <div ref={newMenuExpandedRef} className="px-2.5 mb-3">
                   <button
                     onClick={() => setIsNewMenuOpen(v => !v)}
                     className={cn(
                       "flex items-center justify-center transition-all duration-150 shadow-xs hover:shadow-sm active:translate-y-px w-full gap-2 h-9 rounded-xl text-[13px] font-semibold tracking-tight",
                       "bg-slate-900 hover:bg-slate-800 text-white dark:bg-white dark:hover:bg-slate-100 dark:text-slate-900"
                     )}
                     aria-label="Create new item"
                     aria-expanded={isNewMenuOpen}
                   >
                     <Plus className={cn("shrink-0 w-4 h-4 text-[#c8e558] dark:text-slate-900 transition-transform duration-200", isNewMenuOpen && "rotate-45")} strokeWidth={2.25} />
                     <span>New</span>
                   </button>

                   {/* Inline accordion for expanded mode — physically intact inside sidebar */}
                   <AnimatePresence initial={false}>
                     {isNewMenuOpen && (
                       <motion.div
                         initial={{ height: 0, opacity: 0 }}
                         animate={{ height: "auto", opacity: 1 }}
                         exit={{ height: 0, opacity: 0 }}
                         transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
                         className="overflow-hidden mt-1.5 bg-slate-100/70 dark:bg-white/[0.04] border border-slate-200/80 dark:border-white/[0.06] rounded-xl p-1.5"
                       >
                         {CREATE_NEW_NAV.map((group, gi) => (
                           <div key={group.group} className={cn(gi > 0 && "mt-1.5 pt-1.5 border-t border-slate-200/60 dark:border-white/[0.05]")}>
                             <div className="px-2 py-0.5 text-[9.5px] font-semibold uppercase tracking-widest text-slate-400 dark:text-gray-500">
                               {group.group}
                             </div>
                             <div className="space-y-0.5 mt-0.5">
                               {group.items.map((item) => {
                                 const Icon = item.icon;
                                 const searchParams = new URLSearchParams(location.search);
                                 const currentType = searchParams.get('type') || (location.pathname === '/chat' ? 'chat' : '');
                                 const isActive = item.type
                                   ? location.pathname === item.path && currentType === item.type
                                   : location.pathname === item.path;

                                 return (
                                   <button
                                     key={item.label}
                                     onClick={() => {
                                       navigate(`${item.path}${item.type ? `?type=${item.type}` : ''}`);
                                       window.dispatchEvent(new CustomEvent('new-chat', { detail: item.type }));
                                       setIsMobileMenuOpen(false);
                                     }}
                                     className={cn(
                                       "w-full flex items-center gap-2.5 px-2.5 h-[34px] md:h-[30px] rounded-lg text-[13px] md:text-[12.5px] transition-colors duration-150 text-left group antialiased",
                                       isActive
                                         ? "bg-white dark:bg-white/[0.1] text-slate-900 dark:text-white font-medium shadow-2xs"
                                         : "font-normal text-slate-600 dark:text-gray-300 hover:bg-white/80 dark:hover:bg-white/[0.06] hover:text-slate-900 dark:hover:text-white"
                                     )}
                                   >
                                     <Icon
                                       className={cn(
                                         "w-3.5 h-3.5 shrink-0 transition-colors duration-150",
                                         isActive
                                           ? "text-slate-900 dark:text-[#c8e558]"
                                           : "text-slate-400 dark:text-gray-400 group-hover:text-slate-900 dark:group-hover:text-[#c8e558]"
                                       )}
                                       strokeWidth={isActive ? 2 : 1.6}
                                     />
                                     <span className="truncate leading-none flex-1">{item.label}</span>
                                     {isActive && (
                                       <span className="w-1.5 h-1.5 rounded-full bg-[#8ba32b] dark:bg-[#c8e558] shrink-0" />
                                     )}
                                   </button>
                                 );
                               })}
                             </div>
                           </div>
                         ))}
                       </motion.div>
                     )}
                   </AnimatePresence>
                 </div>
               )}

               {isRail && (
                 <div className="flex justify-center px-2.5 mb-3">
                   <button
                     ref={newMenuButtonRef}
                     onClick={() => {
                       if (!isNewMenuOpen && newMenuButtonRef.current) {
                         const rect = newMenuButtonRef.current.getBoundingClientRect();
                         const estimatedH = 460;
                         const padding = 12;
                         let top = rect.top;
                         if (top + estimatedH > window.innerHeight - padding) {
                           top = Math.max(padding, window.innerHeight - estimatedH - padding);
                         }
                         const maxHeight = Math.max(200, window.innerHeight - top - padding);
                         setNewMenuStyle({
                           position: 'fixed',
                           top,
                           left: rect.right + 8,
                           width: 220,
                           maxHeight,
                           zIndex: 9999,
                         });
                         setIsNewMenuOpen(true);
                       } else {
                         setIsNewMenuOpen(false);
                       }
                     }}
                     className={cn(
                       "w-10 h-10 rounded-xl flex items-center justify-center transition-all duration-150 shadow-xs hover:shadow-sm active:translate-y-px",
                       "bg-slate-900 hover:bg-slate-800 text-white dark:bg-white dark:hover:bg-slate-100 dark:text-slate-900"
                     )}
                     title="New"
                     aria-label="Create new item"
                     aria-expanded={isNewMenuOpen}
                   >
                     <Plus className={cn("shrink-0 w-4 h-4 text-[#c8e558] dark:text-slate-900 transition-transform duration-200", isNewMenuOpen && "rotate-45")} strokeWidth={2.25} />
                   </button>
                 </div>
               )}

              {/* Primary nav items */}
              <div className="space-y-0.5">
                {PRIMARY_NAV.map((item) => (
                  <div key={item.path} className="mb-0.5">
                    <NavItem
                      item={item}
                      currentPath={location.pathname}
                      collapsed={isRail}
                      onClick={() => setIsMobileMenuOpen(false)}
                    />
                  </div>
                ))}
              </div>

              {/* ── More ──────────────────────────────────────────────────────
                   EXPANDED  → inline animated accordion within the sidebar.
                   COLLAPSED → portal flyout anchored to the right of the rail.
                ─────────────────────────────────────────────────────────── */}

              {/* EXPANDED: accordion */}
              {!isRail && (
                <div ref={moreExpandedRef} className="mt-0.5 mb-0.5">
                  <button
                    onClick={() => setIsMoreFlyoutOpen(v => !v)}
                    className={cn(
                      "flex items-center gap-2.5 h-[34px] md:h-[30px] px-2.5 rounded-lg mx-2.5 text-[13px] md:text-[12.5px] tracking-[-0.006em] transition-colors duration-150 group antialiased",
                      isMoreFlyoutOpen || isAnyMoreItemActive
                        ? "bg-slate-100 text-slate-900 font-medium dark:bg-white/[0.07] dark:text-white"
                        : "text-slate-500 font-normal hover:bg-slate-100/70 hover:text-slate-900 dark:text-gray-400 dark:hover:bg-white/[0.04] dark:hover:text-gray-100"
                    )}
                    style={{ width: 'calc(100% - 20px)' }}
                    aria-label="More navigation options"
                    aria-expanded={isMoreFlyoutOpen}
                  >
                    <Menu
                      className={cn(
                        "shrink-0 w-4 h-4",
                        isMoreFlyoutOpen || isAnyMoreItemActive
                          ? "text-slate-900 dark:text-white"
                          : "text-slate-400 group-hover:text-slate-700 dark:text-gray-500 dark:group-hover:text-gray-200"
                      )}
                      strokeWidth={isMoreFlyoutOpen || isAnyMoreItemActive ? 2 : 1.6}
                    />
                    <span className="truncate flex-1 text-left leading-none">More</span>
                    <ChevronDown className={cn(
                        "w-3 h-3 shrink-0 transition-transform duration-200 text-slate-400 dark:text-gray-500",
                        isMoreFlyoutOpen && "rotate-180"
                      )}
                      strokeWidth={2}
                    />
                  </button>

                  <AnimatePresence initial={false}>
                    {isMoreFlyoutOpen && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
                        className="overflow-hidden"
                      >
                        <div className="pt-0.5 pb-1">
                          {MORE_NAV.map((group, gi) => (
                            <div key={group.group} className={cn(gi > 0 && "mt-1")}>
                              <div className="px-2.5 py-1 text-[10px] font-semibold uppercase tracking-widest text-slate-400 dark:text-gray-500">
                                {group.group}
                              </div>
                              {group.items.map((item) => {
                                const isActive = location.pathname === item.path || (location.pathname.startsWith(item.path) && item.path !== "/");
                                const Icon = item.icon;
                                return (
                                  <button
                                    key={item.path}
                                    onClick={() => {
                                      navigate(item.path);
                                      setIsMobileMenuOpen(false);
                                    }}
                                    className={cn(
                                      "w-[calc(100%-20px)] flex items-center gap-2.5 h-[32px] md:h-[28px] px-2.5 rounded-lg mx-2.5 text-[13px] md:text-[12px] transition-colors duration-100 text-left",
                                      isActive
                                        ? "bg-slate-100 dark:bg-white/[0.07] text-slate-900 dark:text-white font-medium"
                                        : "text-slate-500 dark:text-gray-400 hover:bg-slate-100/70 dark:hover:bg-white/[0.04] hover:text-slate-900 dark:hover:text-gray-100"
                                    )}
                                  >
                                    <Icon
                                      className={cn(
                                        "shrink-0 w-4 h-4",
                                        isActive ? "text-slate-900 dark:text-white" : "text-slate-400 dark:text-gray-500"
                                      )}
                                      strokeWidth={isActive ? 2 : 1.6}
                                    />
                                    <span className="truncate leading-none flex-1">{item.label}</span>
                                    {isActive && (
                                      <span className="w-1.5 h-1.5 rounded-full bg-[#8ba32b] dark:bg-[#c8e558] shrink-0" />
                                    )}
                                  </button>
                                );
                              })}
                            </div>
                          ))}
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              )}

              {/* COLLAPSED: icon button */}
              {isRail && (
                <div className="flex justify-center mt-0.5 mb-0.5">
                  <button
                    ref={moreButtonRef}
                    onClick={() => {
                      if (!isMoreFlyoutOpen && moreButtonRef.current) {
                        const rect = moreButtonRef.current.getBoundingClientRect();
                        const estimatedH = 540;
                        const padding = 12;
                        let top = rect.top;
                        if (top + estimatedH > window.innerHeight - padding) {
                          top = Math.max(padding, window.innerHeight - estimatedH - padding);
                        }
                        const maxHeight = Math.max(200, window.innerHeight - top - padding);
                        setMoreFlyoutStyle({
                          position: 'fixed',
                          top,
                          left: rect.right + 8,
                          width: 232,
                          maxHeight,
                          zIndex: 9999,
                        });
                        setIsMoreFlyoutOpen(true);
                      } else {
                        setIsMoreFlyoutOpen(false);
                      }
                    }}
                    className={cn(
                      "flex items-center justify-center w-8 h-8 rounded-lg transition-colors duration-150 group antialiased",
                      isMoreFlyoutOpen || isAnyMoreItemActive
                        ? "bg-slate-100 dark:bg-white/[0.07]"
                        : "hover:bg-slate-100/70 dark:hover:bg-white/[0.04]"
                    )}
                    title="More"
                    aria-label="More navigation options"
                    aria-expanded={isMoreFlyoutOpen}
                  >
                    <Menu
                      className={cn(
                        "w-4 h-4",
                        isMoreFlyoutOpen || isAnyMoreItemActive
                          ? "text-slate-900 dark:text-white"
                          : "text-slate-400 group-hover:text-slate-700 dark:text-gray-500 dark:group-hover:text-gray-200"
                      )}
                      strokeWidth={isMoreFlyoutOpen || isAnyMoreItemActive ? 2 : 1.6}
                    />
                  </button>
                </div>
              )}

              {/* Portal flyout — only shown when collapsed on desktop */}
              {createPortal(
                <AnimatePresence>
                  {isMoreFlyoutOpen && isRail && (
                    <motion.div
                      ref={moreFlyoutRef}
                      key="more-flyout"
                      initial={{ opacity: 0, x: -6, scale: 0.97 }}
                      animate={{ opacity: 1, x: 0, scale: 1 }}
                      exit={{ opacity: 0, x: -4, scale: 0.97 }}
                      transition={{ duration: 0.15, ease: [0.16, 1, 0.3, 1] }}
                      className="bg-white dark:bg-[#1c1c1e] border border-slate-200 dark:border-white/[0.09] rounded-xl shadow-2xl overflow-y-auto custom-scrollbar"
                      style={{
                        ...moreFlyoutStyle,
                        transformOrigin: 'top left',
                      }}
                    >
                      <div className="p-2">
                        {MORE_NAV.map((group, gi) => (
                          <div key={group.group} className={cn(gi > 0 && "mt-1 pt-1 border-t border-slate-100 dark:border-white/[0.05]")}>
                            <div className="px-2 py-1 text-[10.5px] font-semibold uppercase tracking-widest text-slate-400 dark:text-gray-500">
                              {group.group}
                            </div>
                            {group.items.map((item) => {
                              const isActive = location.pathname === item.path || (location.pathname.startsWith(item.path) && item.path !== "/");
                              const Icon = item.icon;
                              return (
                                <button
                                  key={item.path}
                                  onClick={() => {
                                    navigate(item.path);
                                    setIsMoreFlyoutOpen(false);
                                    setIsMobileMenuOpen(false);
                                  }}
                                  className={cn(
                                    "w-full flex items-center gap-2.5 px-2.5 h-8 rounded-lg text-[12.5px] transition-colors duration-100 text-left",
                                    isActive
                                      ? "bg-slate-100 dark:bg-white/[0.07] text-slate-900 dark:text-white font-medium"
                                      : "text-slate-600 dark:text-gray-400 hover:bg-slate-50 dark:hover:bg-white/[0.04] hover:text-slate-900 dark:hover:text-gray-100"
                                  )}
                                >
                                  <Icon
                                    className={cn(
                                      "shrink-0 w-3.5 h-3.5",
                                      isActive ? "text-slate-900 dark:text-white" : "text-slate-400 dark:text-gray-500"
                                    )}
                                    strokeWidth={isActive ? 2 : 1.6}
                                  />
                                  <span className="truncate leading-none flex-1">{item.label}</span>
                                  {isActive && (
                                    <span className="w-1.5 h-1.5 rounded-full bg-[#8ba32b] dark:bg-[#c8e558] shrink-0" />
                                  )}
                                </button>
                              );
                            })}
                          </div>
                        ))}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>,
                document.body
              )}
           </nav>

           {/* Recent — collapsible list of recent chat sessions */}
           {!isRail && (
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
                 <div className="mt-1 pl-2.5 ml-2.5 border-l border-slate-200/60 dark:border-white/[0.06] space-y-0.5 max-h-[160px] overflow-y-auto custom-scrollbar">
                   {recentSessions.length === 0 ? (
                     <div className="px-2 py-1.5 text-[11px] text-slate-400 dark:text-gray-500">
                       No recent chats
                     </div>
                   ) : (
                     recentSessions.map((s) => (
                       <Link
                         key={s.sessionId}
                         to={`/chat?session=${s.sessionId}`}
                         onClick={() => setIsMobileMenuOpen(false)}
                         title={s.title || 'Study Assistant'}
                         className="flex items-center gap-1.5 px-2 h-[28px] md:h-[25px] rounded-md text-[12px] md:text-[11.5px] text-slate-500 dark:text-gray-400 hover:bg-slate-100/70 hover:text-slate-900 dark:hover:bg-white/[0.04] dark:hover:text-gray-100 transition-colors group"
                       >
                         <MessageSquare className="w-3 h-3 shrink-0 text-slate-400 dark:text-gray-500 group-hover:text-slate-700 dark:group-hover:text-gray-300" strokeWidth={1.5} />
                         <span className="truncate leading-none">
                           {s.title || (s.topicType === 'chat' ? 'Study Assistant' : s.topicType) || 'Untitled chat'}
                         </span>
                       </Link>
                     ))
                   )}
                 </div>
               )}
             </div>
           )}

           {/* Upgrade card */}
           {!isRail && (
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
                     onClick={() => {
                       navigate('/checkout');
                       setIsMobileMenuOpen(false);
                     }}
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

        <div className={cn("pb-safe pt-2 shrink-0 border-t border-slate-200 dark:border-white/5 transition-colors", isRail ? "px-1 pt-1.5 pb-2 flex flex-col items-center" : "px-3 pb-4")}>
          <Link to="#" onClick={() => setIsMobileMenuOpen(false)} className={cn("flex items-center transition-colors duration-200 font-medium text-[13.5px] text-slate-600 dark:text-gray-400 hover:text-slate-900 dark:hover:text-gray-200 hover:bg-slate-100 dark:hover:bg-[#1a1a1a] cursor-pointer", isRail ? "justify-center w-8 h-8 mx-auto rounded-lg" : "gap-3 px-3 py-2 rounded-lg mb-0.5")} title={isRail ? "Changelog" : undefined}>
            <Package className={cn("shrink-0", isRail ? "w-4 h-4" : "w-[18px] h-[18px]")} strokeWidth={1.6} />
            {!isRail && <span className="truncate flex-1">Changelog</span>}
          </Link>
          <button onClick={() => { setIsFeedbackModalOpen(true); setIsMobileMenuOpen(false); }} className={cn("flex items-center transition-colors duration-200 font-medium text-[13.5px] text-slate-600 dark:text-gray-400 hover:text-slate-900 dark:hover:text-gray-200 hover:bg-slate-100 dark:hover:bg-[#1a1a1a] cursor-pointer", isRail ? "justify-center w-8 h-8 mx-auto rounded-lg" : "gap-3 px-3 py-2 rounded-lg mb-2")} title={isRail ? "Share Feedback" : undefined}>
            <MessageSquareShare className={cn("shrink-0", isRail ? "w-4 h-4" : "w-[18px] h-[18px]")} strokeWidth={1.6} />
            {!isRail && <span className="truncate flex-1">Share Feedback</span>}
          </button>
          
          <div className="relative" ref={profileMenuRef}>
            <div 
              onClick={() => setIsProfileMenuOpen(!isProfileMenuOpen)}
              className={cn("flex justify-between items-center transition-colors duration-200 cursor-pointer pt-2 border-t border-slate-200 dark:border-white/5 hover:bg-slate-50 dark:hover:bg-[#1a1a1a]", isRail ? "justify-center w-8 h-8 rounded-full mt-1 mx-auto" : "px-3 py-2 rounded-lg")}
            >
               {isRail ? (
                 <div className="w-8 h-8 rounded-full bg-purple-600 flex items-center justify-center text-white text-sm font-bold shadow-sm shrink-0 uppercase overflow-hidden">
                   {user?.photoURL ? <img src={user.photoURL} alt="User" className="w-full h-full object-cover" /> : (user?.displayName?.charAt(0) || user?.email?.charAt(0) || 'U')}
                 </div>
               ) : (
                 <>
                   <div className="flex items-center gap-3 overflow-hidden">
                     <div className="w-7 h-7 rounded-full bg-purple-600 flex items-center justify-center text-white text-xs font-bold shadow-sm shrink-0 uppercase overflow-hidden">
                       {user?.photoURL ? <img src={user.photoURL} alt="User" className="w-full h-full object-cover" /> : (user?.displayName?.charAt(0) || user?.email?.charAt(0) || 'U')}
                     </div>
                     <div className="text-[13.5px] font-medium text-slate-700 dark:text-gray-200 truncate pr-2">
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
                {!isRail && (
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
                  {!isRail && "Sign out"}
                </button>
              </div>
            )}
          </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0 h-full relative">
        {/* Floating hamburger on mobile for full-bleed immersive routes without header bar */}
        {(location.pathname.startsWith('/podcasts') ||
          location.pathname.startsWith('/community')) && (
          <button
            onClick={() => setIsMobileMenuOpen(true)}
            className="fixed top-3.5 left-3.5 z-30 md:hidden w-9 h-9 rounded-xl bg-white/90 dark:bg-[#1c1c1f]/90 backdrop-blur-md shadow-md border border-slate-200/80 dark:border-white/10 flex items-center justify-center text-slate-700 dark:text-gray-200 active:scale-95 transition-all"
            aria-label="Open navigation menu"
          >
            <Menu className="w-5 h-5" />
          </button>
        )}

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
              
              
              {/* Interactive Profile Dropdown Popover */}
              <div className="pl-1 md:pl-2">
                <TopProfileDropdown />
              </div>
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
               {children || <Outlet context={{ openMobileMenu: () => setIsMobileMenuOpen(true) }} />}
             </motion.div>
           </AnimatePresence>
        </main>
      </div>

      <ShareModal isOpen={isShareModalOpen} onClose={() => setIsShareModalOpen(false)} />
      <FeedbackModal isOpen={isFeedbackModalOpen} onClose={() => setIsFeedbackModalOpen(false)} />
      <AppearanceModal isOpen={isAppearanceOpen} onClose={() => setIsAppearanceOpen(false)} />
      <CommandPalette open={isCommandPaletteOpen} onClose={() => setIsCommandPaletteOpen(false)} />
      <HighlightAction />

      {/* Create New Flyout — only used in collapsed mode to anchor directly right of the rail on desktop */}
      {createPortal(
        <AnimatePresence>
          {isNewMenuOpen && isRail && (
            <motion.div
              ref={newMenuRef}
              key="new-menu-collapsed-flyout"
              initial={{ opacity: 0, x: -6, scale: 0.97 }}
              animate={{ opacity: 1, x: 0, scale: 1 }}
              exit={{ opacity: 0, x: -4, scale: 0.97 }}
              transition={{ duration: 0.15, ease: [0.16, 1, 0.3, 1] }}
              className="bg-white dark:bg-[#18181b] border border-slate-200/90 dark:border-white/[0.09] rounded-xl shadow-2xl overflow-y-auto custom-scrollbar"
              style={{
                ...newMenuStyle,
                maxHeight: 'calc(100vh - 24px)',
                transformOrigin: 'top left',
              }}
            >
              <div className="p-2">
                {CREATE_NEW_NAV.map((group, gi) => (
                  <div key={group.group} className={cn(gi > 0 && "mt-1.5 pt-1.5 border-t border-slate-100 dark:border-white/[0.06]")}>
                    <div className="px-2 py-0.5 text-[9.5px] font-semibold uppercase tracking-widest text-slate-400 dark:text-gray-500">
                      {group.group}
                    </div>
                    <div className="space-y-0.5 mt-0.5">
                      {group.items.map((item) => {
                        const Icon = item.icon;
                        return (
                          <button
                            key={item.label}
                            onClick={() => {
                              navigate(`${item.path}?type=${item.type}`);
                              window.dispatchEvent(new CustomEvent('new-chat', { detail: item.type }));
                              setIsNewMenuOpen(false);
                            }}
                            className="w-full flex items-center gap-2.5 px-2.5 h-[30px] rounded-lg text-[12.5px] font-normal text-slate-600 dark:text-gray-300 hover:bg-slate-100/80 dark:hover:bg-white/[0.06] hover:text-slate-900 dark:hover:text-white transition-colors duration-150 text-left group antialiased"
                          >
                            <Icon className="w-3.5 h-3.5 shrink-0 text-slate-400 dark:text-gray-400 group-hover:text-slate-900 dark:group-hover:text-[#c8e558] transition-colors duration-150" strokeWidth={1.6} />
                            <span className="truncate leading-none flex-1">{item.label}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>,
        document.body
      )}
    </motion.div>
  );
}
