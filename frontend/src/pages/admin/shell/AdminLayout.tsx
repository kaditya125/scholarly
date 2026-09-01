/**
 * Admin shell — sidebar, header, content well.
 *
 * DESIGN. Deliberately built from the student app's own tokens rather than an admin
 * theme (§2, §39): the same `#f4f7fc` / `#131314` grounds as `body`, Inter with the same
 * optical tracking, the brand lime `#c8e558` as the single accent, and the `rounded-xl`
 * radius used across the marketing and product surfaces. Density is raised a step —
 * tighter rows, smaller type, more per screen — because this is an operations tool, but
 * nothing here introduces a colour or a shape the product does not already use.
 */
import { ReactNode, useState } from 'react';
import { Link, NavLink, useLocation } from 'react-router-dom';
/**
 * Named imports, NOT `import * as Icons`.
 *
 * The wildcard form defeats tree-shaking: rollup cannot prove which members are used, so
 * the whole of lucide-react lands in the bundle. It took the admin chunk to 750 KB, which
 * the production build caught. Every icon the nav can name must appear in ICONS below.
 */
import {
  Activity, AlertTriangle, Bell, ChevronLeft, Circle, ClipboardCheck, CreditCard,
  FileText, Gauge, IndianRupee, LayoutDashboard, MessageSquare, Mic, Radio,
  RefreshCw, ScrollText, Settings, TrendingUp, Users,
} from 'lucide-react';
import { useAuth } from '../../../lib/AuthContext';
import { ADMIN_NAV } from './adminNav';
import { ADMIN_ROLE_LABEL, isAdminRole } from './adminRoles';

/** Explicit registry — the only icons the sidebar can resolve. */
const ICONS = {
  Activity, AlertTriangle, Bell, ClipboardCheck, CreditCard, FileText, Gauge,
  IndianRupee, LayoutDashboard, MessageSquare, Mic, Radio, RefreshCw, ScrollText,
  Settings, TrendingUp, Users,
} as const;

/** Brand mark, matching public/favicon.svg. Inlined so the shell has no asset dependency. */
function Mark({ className = '' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden>
      <circle cx="17.8" cy="5.4" r="2.5" fill="#c8e558" />
      <path d="M2.6 20.4l6.2-8.4 3.6 4.6" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M12.4 20.4l4.2-5.4 4.8 5.4" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" opacity="0.5" />
    </svg>
  );
}

function NavIcon({ name, className }: { name: string; className?: string }) {
  const Cmp = ICONS[name as keyof typeof ICONS];
  // Unknown name means a nav entry names an icon absent from ICONS — render a neutral
  // placeholder rather than crashing the whole shell over a sidebar glyph.
  if (!Cmp) return <Circle className={className} strokeWidth={1.9} />;
  return <Cmp className={className} strokeWidth={1.9} />;
}

export function AdminLayout({ title, children }: { title: string; children: ReactNode }) {
  const { user, adminRole, logout } = useAuth();
  const [collapsed, setCollapsed] = useState(false);
  const location = useLocation();

  const roleLabel = isAdminRole(adminRole) ? ADMIN_ROLE_LABEL[adminRole] : 'Admin';

  return (
    <div className="min-h-screen bg-[#f4f7fc] dark:bg-[#131314] flex">
      {/* ── Sidebar ─────────────────────────────────────────────────────────── */}
      <aside
        className={`${collapsed ? 'w-[68px]' : 'w-[228px]'} shrink-0 hidden md:flex flex-col
          border-r border-slate-200/70 dark:border-white/[0.07]
          bg-white dark:bg-[#171719] transition-[width] duration-200`}
      >
        <div className="h-14 flex items-center gap-2.5 px-4 border-b border-slate-200/70 dark:border-white/[0.07]">
          <Mark className="w-[22px] h-[22px] text-slate-900 dark:text-white shrink-0" />
          {!collapsed && (
            <div className="min-w-0">
              <div className="text-[14px] font-bold text-slate-900 dark:text-white leading-none">Sadhya</div>
              <div className="text-[10.5px] font-medium text-slate-400 dark:text-gray-500 mt-1 leading-none tracking-wide">
                ADMIN
              </div>
            </div>
          )}
        </div>

        <nav className="flex-1 overflow-y-auto py-3 px-2.5 space-y-5">
          {ADMIN_NAV.map((group) => (
            <div key={group.label}>
              {!collapsed && (
                <div className="px-2.5 pb-1.5 text-[10px] font-semibold tracking-[0.08em] text-slate-400 dark:text-gray-500 uppercase">
                  {group.label}
                </div>
              )}
              <div className="space-y-0.5">
                {group.items.map((item) => {
                  const to = item.path ? `/admin/${item.path}` : '/admin';
                  const active = item.path
                    ? location.pathname.startsWith(to)
                    : location.pathname === '/admin';

                  // Planned sections render disabled rather than linking to a blank page —
                  // the IA stays visible so the shape of the tool is legible, without
                  // pretending a screen exists.
                  if (item.planned) {
                    return (
                      <div
                        key={to}
                        title={collapsed ? `${item.label} — coming soon` : 'Coming soon'}
                        className="flex items-center gap-2.5 px-2.5 py-[7px] rounded-lg text-[13px] text-slate-300 dark:text-gray-600 cursor-not-allowed select-none"
                      >
                        <NavIcon name={item.icon} className="w-[15px] h-[15px] shrink-0" />
                        {!collapsed && (
                          <>
                            <span className="truncate">{item.label}</span>
                            <span className="ml-auto text-[9.5px] font-medium text-slate-300 dark:text-gray-600">soon</span>
                          </>
                        )}
                      </div>
                    );
                  }

                  return (
                    <NavLink
                      key={to}
                      to={to}
                      end={!item.path}
                      title={collapsed ? item.label : undefined}
                      className={`flex items-center gap-2.5 px-2.5 py-[7px] rounded-lg text-[13px] font-medium transition-colors ${
                        active
                          ? 'bg-[#f2f7e3] dark:bg-[#1e2416] text-slate-900 dark:text-white'
                          : 'text-slate-600 dark:text-gray-400 hover:bg-slate-50 dark:hover:bg-white/[0.04] hover:text-slate-900 dark:hover:text-white'
                      }`}
                    >
                      <NavIcon name={item.icon} className="w-[15px] h-[15px] shrink-0" />
                      {!collapsed && <span className="truncate">{item.label}</span>}
                      {active && !collapsed && (
                        <span className="ml-auto w-1.5 h-1.5 rounded-full bg-[#c8e558]" aria-hidden />
                      )}
                    </NavLink>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>

        <button
          onClick={() => setCollapsed((c) => !c)}
          className="h-11 border-t border-slate-200/70 dark:border-white/[0.07] flex items-center justify-center text-slate-400 dark:text-gray-500 hover:text-slate-700 dark:hover:text-gray-300 transition-colors"
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          <ChevronLeft className={`w-4 h-4 transition-transform ${collapsed ? 'rotate-180' : ''}`} strokeWidth={2} />
        </button>
      </aside>

      {/* ── Main ────────────────────────────────────────────────────────────── */}
      <div className="flex-1 min-w-0 flex flex-col">
        <header className="h-14 shrink-0 sticky top-0 z-20 flex items-center gap-3 px-4 sm:px-6
          border-b border-slate-200/70 dark:border-white/[0.07]
          bg-[#f4f7fc]/85 dark:bg-[#131314]/85 backdrop-blur-md">
          <Mark className="w-5 h-5 md:hidden text-slate-900 dark:text-white" />
          <h1 className="text-[15px] font-semibold text-slate-900 dark:text-white truncate">{title}</h1>

          <div className="ml-auto flex items-center gap-2.5">
            <span className="hidden sm:inline-flex items-center gap-1.5 rounded-full border border-slate-200 dark:border-white/10 bg-white dark:bg-white/[0.04] px-2.5 py-1 text-[11px] font-semibold text-slate-600 dark:text-gray-300">
              <span className="w-1.5 h-1.5 rounded-full bg-[#c8e558]" aria-hidden />
              {roleLabel}
            </span>
            <span className="hidden lg:block text-[12px] text-slate-500 dark:text-gray-400 max-w-[200px] truncate">
              {user?.email}
            </span>
            <Link
              to="/dashboard"
              className="text-[12px] font-medium text-slate-500 dark:text-gray-400 hover:text-slate-900 dark:hover:text-white transition-colors"
            >
              Exit
            </Link>
            <button
              onClick={() => logout()}
              className="text-[12px] font-medium text-slate-500 dark:text-gray-400 hover:text-slate-900 dark:hover:text-white transition-colors"
            >
              Sign out
            </button>
          </div>
        </header>

        <main className="flex-1 px-4 sm:px-6 py-5 sm:py-6">{children}</main>
      </div>
    </div>
  );
}
