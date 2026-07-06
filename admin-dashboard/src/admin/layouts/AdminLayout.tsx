import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { Outlet, useLocation, useNavigate, Link } from "react-router-dom";
import { AnimatePresence, motion } from "motion/react";
import { LoadingState } from "../components/DataStates";
import { useTheme } from "../../lib/ThemeContext";
import { AdminGuard } from "../components/AdminGuard";
import { AdminSidebar } from "../components/Sidebar";
import { CommandPalette } from "../components/CommandPalette";
import {
  Menu, X, PanelLeftClose, PanelLeft, Sun, Moon, LogOut, Search, Bell,
  ChevronRight, ChevronDown, Zap
} from "lucide-react";
import { cn } from "../../lib/utils";
import { useAuth } from "../../lib/AuthContext";

const TITLES: Record<string, string> = {
  "/admin/dashboard": "Overview",
  "/admin/ai-monitoring": "AI Monitoring",
  "/admin/system-health": "System Health",
  "/admin/costs": "Cost Analytics",
  "/admin/curriculum": "Curriculum Ingestion",
  "/admin/knowledge-graph": "Knowledge Graph",
  "/admin/vector-db": "Vector Database",
  "/admin/prompts": "Prompt Studio",
  "/admin/assets": "Learning Assets",
  "/admin/notebooks": "Notebooks",
  "/admin/feature-flags": "Feature Flags",
  "/admin/evaluation": "Continuous Eval",
  "/admin/users": "User Management",
  "/admin/security": "Security",
  "/admin/logs": "Logs",
  "/admin/notifications": "Notifications",
  "/admin/backups": "Backups",
  "/admin/settings": "Settings",
};

function useClock() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  return now;
}

export function AdminLayout() {
  const { theme, toggleTheme } = useTheme();
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const profileRef = useRef<HTMLDivElement>(null);
  const now = useClock();

  const title = useMemo(() => TITLES[location.pathname] || "Admin", [location.pathname]);
  const envMode = import.meta.env.MODE === "production" ? "Production" : "Development";

  useEffect(() => setIsMobileMenuOpen(false), [location.pathname]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPaletteOpen((o) => !o);
      }
    };
    const onClick = (e: MouseEvent) => {
      if (profileRef.current && !profileRef.current.contains(e.target as Node)) setProfileOpen(false);
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onClick);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onClick);
    };
  }, []);

  const handleLogout = async () => {
    await logout();
    navigate("/");
  };

  const initial = (user?.displayName || user?.email || "A").charAt(0).toUpperCase();

  return (
    <AdminGuard>
      <div className={cn("flex h-screen overflow-hidden bg-slate-50 dark:bg-[#131314] text-slate-900 dark:text-gray-100")}>
        {/* Desktop Sidebar */}
        <div
          className={cn(
            "hidden md:flex flex-col border-r border-slate-200 dark:border-white/5 bg-white dark:bg-[#111111] transition-all duration-300 ease-in-out z-20",
            isCollapsed ? "w-[76px]" : "w-[264px]"
          )}
        >
          <AdminSidebar isCollapsed={isCollapsed} />
        </div>

        {/* Mobile Sidebar */}
        <AnimatePresence>
          {isMobileMenuOpen && (
            <>
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="fixed inset-0 bg-black/50 z-40 md:hidden"
                onClick={() => setIsMobileMenuOpen(false)}
              />
              <motion.div
                initial={{ x: "-100%" }}
                animate={{ x: 0 }}
                exit={{ x: "-100%" }}
                transition={{ type: "tween", duration: 0.25 }}
                className="fixed inset-y-0 left-0 z-50 w-[264px] bg-white dark:bg-[#111111] border-r border-slate-200 dark:border-white/5 md:hidden"
              >
                <button onClick={() => setIsMobileMenuOpen(false)} className="absolute top-4 right-4 z-10 p-1.5 rounded-lg bg-slate-100 dark:bg-white/10 text-slate-500">
                  <X className="w-4 h-4" />
                </button>
                <AdminSidebar isCollapsed={false} />
              </motion.div>
            </>
          )}
        </AnimatePresence>

        {/* Main */}
        <div className="flex-1 flex flex-col min-w-0 h-screen overflow-hidden">
          {/* Executive header */}
          <header className="h-16 shrink-0 flex items-center justify-between gap-3 px-4 lg:px-6 border-b border-slate-200 dark:border-white/5 glass-strong z-30">
            <div className="flex items-center gap-3 min-w-0">
              <button onClick={() => setIsMobileMenuOpen(true)} className="md:hidden p-2 -ml-2 rounded-lg hover:bg-slate-100 dark:hover:bg-white/5 text-slate-500" aria-label="Open menu">
                <Menu className="w-5 h-5" />
              </button>
              <button
                onClick={() => setIsCollapsed(!isCollapsed)}
                className="hidden md:flex p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-white/5 text-slate-500 transition-colors"
                title={isCollapsed ? "Expand sidebar" : "Collapse sidebar"}
                aria-label="Toggle sidebar"
              >
                {isCollapsed ? <PanelLeft className="w-5 h-5" /> : <PanelLeftClose className="w-5 h-5" />}
              </button>
              <div className="min-w-0">
                <nav className="hidden sm:flex items-center gap-1 text-[12px] font-medium text-slate-400 dark:text-gray-500">
                  <span>Admin</span>
                  <ChevronRight className="w-3 h-3" />
                  <span className="text-slate-700 dark:text-gray-300">{title}</span>
                </nav>
                <h1 className="text-base md:text-lg font-bold tracking-tight text-slate-900 dark:text-white truncate">{title}</h1>
              </div>
            </div>

            <div className="flex items-center gap-2 md:gap-3 shrink-0">
              {/* Command palette trigger */}
              <button
                onClick={() => setPaletteOpen(true)}
                className="hidden lg:flex items-center gap-2 w-[220px] rounded-full border border-slate-200 dark:border-white/10 bg-white dark:bg-[#1a1a1a] px-3.5 py-2 text-slate-400 hover:border-slate-300 dark:hover:border-white/20 transition-colors shadow-[0_2px_10px_rgb(0,0,0,0.02)]"
              >
                <Search className="w-4 h-4 shrink-0" />
                <span className="flex-1 text-left text-[13px]">Search modules...</span>
                <kbd className="text-[10px] font-medium bg-slate-100 dark:bg-white/10 px-1.5 py-0.5 rounded">⌘K</kbd>
              </button>

              {/* Status cluster */}
              <div className="hidden xl:flex items-center gap-2">
                <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 dark:border-white/10 px-2.5 py-1 text-[11px] font-medium text-slate-600 dark:text-gray-300">
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-500" /> {envMode}
                </span>
                <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 dark:border-white/10 px-2.5 py-1 text-[11px] font-medium text-slate-600 dark:text-gray-300">
                  <Zap className="w-3 h-3 text-indigo-500" /> Groq
                </span>
                <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 dark:border-white/10 px-2.5 py-1 text-[11px] font-medium text-emerald-600 dark:text-emerald-400">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 live-dot" /> Live
                </span>
              </div>

              <span className="hidden lg:block text-[12px] tabular-nums text-slate-500 dark:text-gray-400">
                {now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
              </span>

              <button className="relative w-9 h-9 rounded-full border border-slate-200 dark:border-white/10 bg-white dark:bg-[#1a1a1a] flex items-center justify-center text-slate-500 dark:text-gray-400 hover:text-slate-700 dark:hover:text-gray-200 hover:border-slate-300 dark:hover:border-white/20 transition-colors shadow-[0_2px_10px_rgb(0,0,0,0.02)]" aria-label="Notifications" title="Notifications">
                <Bell className="w-[18px] h-[18px]" />
                <span className="absolute top-2 right-2.5 w-1.5 h-1.5 bg-indigo-500 rounded-full" />
              </button>

              <button
                onClick={toggleTheme}
                className="w-9 h-9 rounded-full border border-slate-200 dark:border-white/10 bg-white dark:bg-[#1a1a1a] flex items-center justify-center text-slate-500 dark:text-gray-400 hover:text-slate-700 dark:hover:text-gray-200 hover:border-slate-300 dark:hover:border-white/20 transition-colors shadow-[0_2px_10px_rgb(0,0,0,0.02)]"
                title={theme === "dark" ? "Light mode" : "Dark mode"}
                aria-label="Toggle theme"
              >
                {theme === "dark" ? <Sun className="w-[18px] h-[18px]" /> : <Moon className="w-[18px] h-[18px]" />}
              </button>

              {/* Profile */}
              <div className="relative" ref={profileRef}>
                <button onClick={() => setProfileOpen((o) => !o)} className="flex items-center gap-2 pl-1 group" aria-label="Account menu">
                  <div className="w-9 h-9 rounded-full bg-indigo-600 flex items-center justify-center text-white text-sm font-bold uppercase border-2 border-white dark:border-[#131314] group-hover:ring-2 ring-indigo-500 transition-all">
                    {initial}
                  </div>
                  <ChevronDown className={cn("hidden sm:block w-4 h-4 text-slate-400 transition-transform", profileOpen && "rotate-180")} />
                </button>
                <AnimatePresence>
                  {profileOpen && (
                    <motion.div
                      initial={{ opacity: 0, y: -6, scale: 0.98 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, y: -6, scale: 0.98 }}
                      transition={{ duration: 0.15 }}
                      className="absolute right-0 mt-2 w-60 rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#1a1a1a] shadow-xl p-1.5 z-50"
                    >
                      <div className="px-3 py-2.5 border-b border-slate-100 dark:border-white/5 mb-1">
                        <div className="text-sm font-semibold text-slate-900 dark:text-white truncate">{user?.displayName || "Administrator"}</div>
                        <div className="text-xs text-slate-500 dark:text-gray-400 truncate">{user?.email}</div>
                      </div>
                      <Link
                        to="/admin/settings"
                        onClick={() => setProfileOpen(false)}
                        className="w-full flex items-center gap-2 px-3 py-2 text-sm text-slate-700 dark:text-gray-200 hover:bg-slate-50 dark:hover:bg-white/5 rounded-lg transition-colors"
                      >
                        Settings
                      </Link>
                      <button
                        onClick={handleLogout}
                        className="w-full flex items-center gap-2 px-3 py-2 text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-500/10 rounded-lg transition-colors font-medium"
                      >
                        <LogOut className="w-4 h-4" /> Sign out
                      </button>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </div>
          </header>

          {/* Content with ambient backdrop + page transitions */}
          <main className="flex-1 overflow-y-auto custom-scrollbar admin-ambient">
            <AnimatePresence mode="wait">
              <motion.div
                key={location.pathname}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.25 }}
              >
                <Suspense fallback={<div className="p-8"><LoadingState label="Loading module..." /></div>}>
                  <Outlet />
                </Suspense>
              </motion.div>
            </AnimatePresence>
          </main>
        </div>
      </div>

      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} />
    </AdminGuard>
  );
}
