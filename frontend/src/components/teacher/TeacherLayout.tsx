import { useEffect, useState } from 'react';
import { Link, Navigate, Outlet, useLocation, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard, BotMessageSquare, NotebookPen, FileText, Headphones,
  GraduationCap, Users, Video, BarChart3, Wallet, UserRound, Settings,
  Lock, Menu, X, Loader2, LogOut, Sun, Moon,
} from 'lucide-react';
import { useAuth } from '../../lib/AuthContext';
import { useTheme } from '../../lib/ThemeContext';
import { teacherApi, type TeacherProfile } from '../../lib/api/teacher';
import { cn } from '../../lib/utils';
import { LogoMark as Mark } from '../brand/Logo';

/**
 * The teacher workspace shell (Phase 3C).
 *
 * A separate shell from AppLayout rather than a role branch inside it. AppLayout's MAIN_MENU is
 * a hard-coded student menu inside a 700-line component; threading a second role through it
 * would make the most complex component in the app more complex, to produce a navigation that
 * shares almost no items. The two shells share the design language, not the code.
 *
 * Three guards, in order:
 *   1. Wait for auth AND claims — acting on `role` before claims resolve bounces every teacher.
 *   2. Non-teachers go to /dashboard. Previously a student reaching /teach was pushed into
 *      TEACHER onboarding, because an unreadable profile (403, correctly) was treated as
 *      "not set up yet".
 *   3. A teacher without a completed profile goes to /teacher/onboarding.
 *
 * Navigation is honest by construction: items whose backing phase does not exist are rendered as
 * inert, labelled rows rather than links. Nothing in this sidebar leads somewhere that 404s or
 * shows an empty shell pretending to be a feature.
 */

interface NavLeaf {
  label: string;
  icon: typeof LayoutDashboard;
  /** Present when the destination exists. Absent means "not built yet". */
  to?: string;
  /** Shown on locked rows so the reason is visible, not guessed. */
  note?: string;
  /** Matches nested paths for the active state. */
  matchPrefix?: string;
}

interface NavGroup {
  title: string;
  items: NavLeaf[];
}

const NAV: NavGroup[] = [
  {
    title: 'Workspace',
    items: [{ label: 'Dashboard', icon: LayoutDashboard, to: '/teach' }],
  },
  {
    // Shared platform surfaces — same tool and same component as the student app, mounted
    // under /teach so they render inside THIS sidebar instead of the student one. See the
    // matching routes in App.tsx.
    title: 'Prepare',
    items: [
      { label: 'AI Assistant', icon: BotMessageSquare, to: '/teach/chat' },
      { label: 'Notebooks', icon: NotebookPen, to: '/teach/notebooks' },
      { label: 'Tests', icon: FileText, to: '/teach/tests' },
      { label: 'Podcasts', icon: Headphones, to: '/teach/podcasts' },
    ],
  },
  {
    title: 'Teaching',
    items: [
      { label: 'Classes', icon: GraduationCap, to: '/teach/classes', matchPrefix: '/teach/classes' },
      { label: 'Students', icon: Users, to: '/teach/students', matchPrefix: '/teach/students' },
      { label: 'Live Classes', icon: Video, note: 'Being prepared' },
      { label: 'Analytics', icon: BarChart3, note: 'Needs classes first' },
    ],
  },
  {
    title: 'Business',
    items: [
      { label: 'Earnings', icon: Wallet, to: '/teach/earnings' },
      { label: 'Referrals', icon: Users, to: '/teach/referrals' },
    ],
  },
  {
    title: 'Account',
    items: [
      { label: 'Teaching profile', icon: UserRound, to: '/teacher/onboarding' },
      { label: 'Settings', icon: Settings, to: '/teach/settings' },
    ],
  },
];

function FullScreenSpinner({ label }: { label: string }) {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-3 bg-[#faf9f7] dark:bg-[#0b0b0c]">
      <Loader2 className="w-6 h-6 animate-spin text-slate-400 dark:text-gray-500" />
      <p className="text-[13.5px] text-slate-500 dark:text-gray-400">{label}</p>
    </div>
  );
}

export default function TeacherLayout() {
  const { user, loading: authLoading, role, claimsLoading, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const location = useLocation();
  const navigate = useNavigate();

  const [profile, setProfile] = useState<TeacherProfile | null>(null);
  const [profileState, setProfileState] = useState<'loading' | 'incomplete' | 'ready' | 'error'>('loading');
  const [drawerOpen, setDrawerOpen] = useState(false);

  useEffect(() => setDrawerOpen(false), [location.pathname]);

  // Only fetch once we know the caller is a teacher — a student's request would 403 and the
  // failure would be indistinguishable from "profile missing".
  useEffect(() => {
    if (authLoading || claimsLoading || role !== 'teacher') return;
    let alive = true;
    (async () => {
      try {
        const res = await teacherApi.getProfile();
        if (!alive) return;
        if (!res.exists || res.onboardingStatus !== 'complete') setProfileState('incomplete');
        else {
          setProfile(res);
          setProfileState('ready');
        }
      } catch {
        if (alive) setProfileState('error');
      }
    })();
    return () => { alive = false; };
  }, [authLoading, claimsLoading, role]);

  if (authLoading || claimsLoading) return <FullScreenSpinner label="Loading your workspace…" />;
  if (!user) return <Navigate to="/signin" state={{ from: location }} replace />;
  if (!role) return <Navigate to="/select-role" replace />;
  if (role !== 'teacher') return <Navigate to="/dashboard" replace />;

  if (profileState === 'loading') return <FullScreenSpinner label="Loading your workspace…" />;
  if (profileState === 'incomplete') return <Navigate to="/teacher/onboarding" replace />;

  if (profileState === 'error') {
    return (
      <div className="min-h-screen flex items-center justify-center px-6 bg-[#faf9f7] dark:bg-[#0b0b0c]">
        <div className="max-w-sm text-center">
          <p className="text-[15px] font-semibold text-slate-900 dark:text-white">
            We couldn&rsquo;t load your teaching profile
          </p>
          <p className="mt-2 text-[13.5px] leading-relaxed text-slate-500 dark:text-gray-400">
            This is usually a connection problem rather than anything wrong with your account.
          </p>
          <button
            onClick={() => window.location.reload()}
            className="mt-5 inline-flex h-10 items-center px-4 rounded-lg bg-slate-900 dark:bg-white text-white dark:text-slate-900 text-[13.5px] font-semibold"
          >
            Try again
          </button>
        </div>
      </div>
    );
  }

  const firstName = (user.displayName || '').trim().split(' ')[0] || 'there';

  const sidebar = (
    <nav aria-label="Teacher workspace" className="flex flex-col h-full">
      <div className="px-4 py-4 flex items-center gap-2.5">
        <Mark />
        <span className="text-[15px] font-semibold tracking-[-0.02em]">Sadhya</span>
        <span className="ml-0.5 px-1.5 py-0.5 rounded-md text-[10.5px] font-semibold uppercase tracking-[0.06em] bg-[#c8e558] text-slate-900">
          Teach
        </span>
      </div>

      <div className="flex-1 overflow-y-auto px-2 pb-4 space-y-5">
        {NAV.map((group) => (
          <div key={group.title}>
            <p className="px-2 mb-1.5 text-[10.5px] font-semibold uppercase tracking-[0.11em] text-slate-500 dark:text-gray-500">
              {group.title}
            </p>
            <ul className="space-y-0.5">
              {group.items.map((item) => {
                const active = item.to
                  ? item.to === '/teach'
                    ? location.pathname === '/teach'
                    : location.pathname.startsWith(item.matchPrefix ?? item.to)
                  : false;

                if (!item.to) {
                  // Inert by design: a locked row is not a link, is not focusable, and states
                  // why. Screen readers get the reason via the visible note.
                  return (
                    <li key={item.label}>
                      <div
                        aria-disabled="true"
                        className="flex items-center gap-2.5 px-2 py-2 rounded-lg text-slate-400 dark:text-gray-600 cursor-default select-none"
                      >
                        <item.icon className="w-[17px] h-[17px] shrink-0" strokeWidth={1.9} aria-hidden />
                        <span className="text-[13.5px] font-medium truncate">{item.label}</span>
                        <Lock className="w-3 h-3 ml-auto shrink-0" strokeWidth={2.25} aria-hidden />
                        <span className="sr-only">— {item.note}</span>
                      </div>
                    </li>
                  );
                }

                return (
                  <li key={item.label}>
                    <Link
                      to={item.to}
                      aria-current={active ? 'page' : undefined}
                      className={cn(
                        'flex items-center gap-2.5 px-2 py-2 rounded-lg text-[13.5px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400',
                        active
                          ? 'bg-slate-900 dark:bg-white text-white dark:text-slate-900'
                          : 'text-slate-700 dark:text-gray-300 hover:bg-slate-100 dark:hover:bg-white/[0.06]',
                      )}
                    >
                      <item.icon className="w-[17px] h-[17px] shrink-0" strokeWidth={1.9} aria-hidden />
                      <span className="truncate">{item.label}</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </div>

      <div className="px-2 py-3 border-t border-slate-200 dark:border-white/[0.07] space-y-0.5">
        <button
          onClick={toggleTheme}
          className="w-full flex items-center gap-2.5 px-2 py-2 rounded-lg text-[13.5px] font-medium text-slate-700 dark:text-gray-300 hover:bg-slate-100 dark:hover:bg-white/[0.06] transition-colors"
        >
          {theme === 'dark'
            ? <Sun className="w-[17px] h-[17px]" strokeWidth={1.9} aria-hidden />
            : <Moon className="w-[17px] h-[17px]" strokeWidth={1.9} aria-hidden />}
          {theme === 'dark' ? 'Light mode' : 'Dark mode'}
        </button>
        <button
          onClick={() => void logout().then(() => navigate('/signin', { replace: true }))}
          className="w-full flex items-center gap-2.5 px-2 py-2 rounded-lg text-[13.5px] font-medium text-slate-700 dark:text-gray-300 hover:bg-slate-100 dark:hover:bg-white/[0.06] transition-colors"
        >
          <LogOut className="w-[17px] h-[17px]" strokeWidth={1.9} aria-hidden />
          Sign out
        </button>
      </div>
    </nav>
  );

  return (
    <div className="min-h-screen bg-[#faf9f7] dark:bg-[#0b0b0c] text-slate-900 dark:text-white antialiased">
      {/* Desktop sidebar */}
      <aside className="hidden lg:flex fixed inset-y-0 left-0 w-[232px] flex-col border-r border-slate-200 dark:border-white/[0.07] bg-white dark:bg-[#101011]">
        {sidebar}
      </aside>

      {/* Mobile bar */}
      <header className="lg:hidden sticky top-0 z-40 flex items-center gap-3 h-14 px-4 border-b border-slate-200 dark:border-white/[0.07] bg-white/90 dark:bg-[#101011]/90 backdrop-blur-xl">
        <button
          onClick={() => setDrawerOpen((v) => !v)}
          aria-label={drawerOpen ? 'Close navigation' : 'Open navigation'}
          aria-expanded={drawerOpen}
          className="w-9 h-9 -ml-1.5 rounded-lg flex items-center justify-center text-slate-600 dark:text-gray-300"
        >
          {drawerOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
        </button>
        <Mark className="w-5 h-5" />
        <span className="text-[14.5px] font-semibold tracking-[-0.02em]">Teach</span>
      </header>

      {drawerOpen && (
        <div className="lg:hidden fixed inset-0 z-50 flex">
          <div className="w-[264px] max-w-[82vw] bg-white dark:bg-[#101011] border-r border-slate-200 dark:border-white/[0.07]">
            {sidebar}
          </div>
          <button
            aria-label="Close navigation"
            onClick={() => setDrawerOpen(false)}
            className="flex-1 bg-slate-900/40 dark:bg-black/60"
          />
        </div>
      )}

      <main className="lg:pl-[232px]">
        <div className="max-w-[1100px] mx-auto px-5 sm:px-8 py-8 sm:py-10">
          <Outlet context={{ profile, firstName }} />
        </div>
      </main>
    </div>
  );
}
