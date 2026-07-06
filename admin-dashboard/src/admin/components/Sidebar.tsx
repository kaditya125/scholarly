import React, { useMemo, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { motion } from "motion/react";
import { cn } from "../../lib/utils";
import {
  Activity, BarChart2, BookOpen, BrainCircuit, Database,
  Flag, FolderOpen, HeartPulse, History, LayoutDashboard, Library,
  MessageSquare, Network, Settings, ShieldAlert, Users, Bell,
  Save, Search
} from "lucide-react";

type MenuItem = { label: string; path: string; icon: React.ComponentType<{ className?: string }> };
type MenuGroup = { group: string; items: MenuItem[] };

const ADMIN_MENU: MenuGroup[] = [
  {
    group: "Overview",
    items: [
      { label: "Dashboard", path: "/admin/dashboard", icon: LayoutDashboard },
      { label: "AI Monitoring", path: "/admin/ai-monitoring", icon: Activity },
      { label: "System Health", path: "/admin/system-health", icon: HeartPulse },
      { label: "Cost Analytics", path: "/admin/costs", icon: BarChart2 },
    ],
  },
  {
    group: "Knowledge & Data",
    items: [
      { label: "Curriculum Ingestion", path: "/admin/curriculum", icon: BookOpen },
      { label: "Knowledge Graph", path: "/admin/knowledge-graph", icon: Network },
      { label: "Vector Database", path: "/admin/vector-db", icon: Database },
    ],
  },
  {
    group: "Content & AI",
    items: [
      { label: "Prompt Studio", path: "/admin/prompts", icon: MessageSquare },
      { label: "Learning Assets", path: "/admin/assets", icon: Library },
      { label: "Notebooks", path: "/admin/notebooks", icon: FolderOpen },
      { label: "Feature Flags", path: "/admin/feature-flags", icon: Flag },
      { label: "Continuous Eval", path: "/admin/evaluation", icon: BrainCircuit },
    ],
  },
  {
    group: "Operations",
    items: [
      { label: "User Management", path: "/admin/users", icon: Users },
      { label: "Security", path: "/admin/security", icon: ShieldAlert },
      { label: "Logs", path: "/admin/logs", icon: History },
      { label: "Notifications", path: "/admin/notifications", icon: Bell },
      { label: "Backups", path: "/admin/backups", icon: Save },
      { label: "Settings", path: "/admin/settings", icon: Settings },
    ],
  },
];

const NavItem: React.FC<{ item: MenuItem; currentPath: string; collapsed?: boolean }> = ({ item, currentPath, collapsed }) => {
  const isActive = currentPath === item.path || (currentPath.startsWith(item.path) && item.path !== "/admin");
  const Icon = item.icon;

  return (
    <Link
      to={item.path}
      className={cn(
        "relative flex items-center transition-all duration-200 font-medium text-[13.5px] group",
        collapsed ? "justify-center w-10 h-10 mx-auto rounded-xl mb-0.5" : "gap-3 px-3 py-2 rounded-xl mx-3 mb-0.5",
        isActive
          ? "bg-slate-100 dark:bg-white/[0.06] text-slate-900 dark:text-white font-semibold"
          : "text-slate-600 dark:text-gray-400 hover:text-slate-900 dark:hover:text-gray-200 hover:bg-slate-50 dark:hover:bg-white/[0.03]"
      )}
      title={collapsed ? item.label : undefined}
    >
      {isActive && (
        <motion.span
          layoutId={collapsed ? undefined : "admin-active-bar"}
          className={cn(
            "absolute bg-indigo-500 rounded-full",
            collapsed ? "left-0 top-1/2 -translate-y-1/2 w-1 h-5" : "left-0 top-1/2 -translate-y-1/2 w-1 h-5"
          )}
        />
      )}
      <Icon className={cn("shrink-0", collapsed ? "w-5 h-5" : "w-[18px] h-[18px]", isActive ? "text-indigo-600 dark:text-indigo-400" : "text-slate-500 dark:text-gray-400 group-hover:text-slate-700 dark:group-hover:text-gray-300")} />
      {!collapsed && <span className="truncate flex-1">{item.label}</span>}
    </Link>
  );
};

export const AdminSidebar: React.FC<{ isCollapsed: boolean }> = ({ isCollapsed }) => {
  const location = useLocation();
  const [query, setQuery] = useState("");

  const groups = useMemo(() => {
    if (!query.trim()) return ADMIN_MENU;
    const q = query.toLowerCase();
    return ADMIN_MENU
      .map((g) => ({ ...g, items: g.items.filter((it) => it.label.toLowerCase().includes(q)) }))
      .filter((g) => g.items.length > 0);
  }, [query]);

  return (
    <div className="flex flex-col h-full py-4 overflow-y-auto custom-scrollbar">
      {/* Brand */}
      <div className={cn("flex items-center px-4 mb-5 shrink-0", isCollapsed && "justify-center px-0")}>
        <Link to="/admin/dashboard" className="flex items-center gap-2.5 overflow-hidden">
          <svg className="shrink-0" width="26" height="26" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M12 2L2 7L12 12L22 7L12 2Z" fill="#facc15" />
            <path d="M2 17L12 22L22 17M2 12L12 17L22 12" stroke="#facc15" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          {!isCollapsed && (
            <div className="flex items-center gap-2 min-w-0">
              <span className="font-bold text-[15px] tracking-tight text-slate-900 dark:text-white uppercase">Scholarly</span>
              <span className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-md bg-indigo-500/10 text-indigo-600 dark:text-indigo-400">Admin</span>
            </div>
          )}
        </Link>
      </div>

      {/* Quick search */}
      {!isCollapsed && (
        <div className="px-3 mb-3 shrink-0">
          <div className="flex items-center gap-2 rounded-lg border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-white/[0.03] px-2.5 py-2 focus-within:border-indigo-400 dark:focus-within:border-indigo-500 transition-colors">
            <Search className="w-3.5 h-3.5 text-slate-400 shrink-0" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Quick find..."
              className="flex-1 bg-transparent border-none outline-none text-[13px] text-slate-700 dark:text-gray-200 placeholder:text-slate-400 dark:placeholder:text-gray-500"
            />
          </div>
        </div>
      )}

      {/* Navigation */}
      <nav className="flex-1 space-y-0.5">
        {groups.map((g) => (
          <div key={g.group} className="mb-1.5">
            <div className={cn("px-5 pt-2 pb-1.5 text-[10px] font-semibold text-slate-400 dark:text-gray-500 uppercase tracking-wider", isCollapsed && "text-center px-0")}>
              {isCollapsed ? "•" : g.group}
            </div>
            {g.items.map((item) => (
              <NavItem key={item.path} item={item} currentPath={location.pathname} collapsed={isCollapsed} />
            ))}
          </div>
        ))}
        {groups.length === 0 && !isCollapsed && (
          <div className="px-5 py-4 text-xs text-slate-400">No modules match "{query}".</div>
        )}
      </nav>

      {/* Footer status */}
      {!isCollapsed && (
        <div className="px-4 pt-3 shrink-0 border-t border-slate-200 dark:border-white/5">
          <div className="flex items-center gap-2 text-[11px] text-slate-500 dark:text-gray-400">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 live-dot" />
            Enterprise AI Operations
          </div>
        </div>
      )}
    </div>
  );
};
