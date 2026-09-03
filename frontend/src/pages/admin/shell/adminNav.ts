/**
 * Admin information architecture.
 *
 * Single source of truth for the sidebar, the route table and the page titles, so a
 * section cannot exist in the nav without a route or vice versa.
 *
 * SCOPE. Student ecosystem only. Teacher administration is a separate domain that will
 * be added later (§46) — `domain: 'student'` exists so a `'teacher'` group can be added
 * beside it without restructuring anything here.
 *
 * `minRole` is presentation only. It hides nav entries the current admin cannot use, so
 * the sidebar reflects their access — but it is NOT a security boundary. Every admin API
 * independently verifies the caller's role server-side via requireRoles(); see
 * backend-firestore/src/admin/middleware/rbac.middleware.ts.
 */
import type { AdminRole } from './adminRoles';

export interface AdminNavItem {
  /** Route path, relative to /admin. */
  path: string;
  label: string;
  /** Shown as the page's H1 and in the browser title. */
  title: string;
  /** lucide-react icon name, resolved by the Sidebar. */
  icon: string;
  /** Roles that may see this entry. Omitted = every admin role. */
  minRole?: AdminRole[];
  /** Present but not yet implemented — rendered disabled rather than linking nowhere. */
  planned?: boolean;
}

export interface AdminNavGroup {
  label: string;
  domain: 'student' | 'platform';
  items: AdminNavItem[];
}

export const ADMIN_NAV: AdminNavGroup[] = [
  {
    label: 'Overview',
    domain: 'student',
    items: [
      { path: '', label: 'Dashboard', title: 'Dashboard', icon: 'LayoutDashboard' },
    ],
  },
  {
    label: 'Students',
    domain: 'student',
    items: [
      { path: 'students', label: 'Students', title: 'Students', icon: 'Users' },
      { path: 'performance', label: 'Performance', title: 'Student performance', icon: 'TrendingUp' },
      { path: 'engagement', label: 'Engagement', title: 'Engagement', icon: 'Activity' },
    ],
  },
  {
    label: 'Usage',
    domain: 'student',
    items: [
      { path: 'usage/chat', label: 'AI Chat', title: 'AI Chat usage', icon: 'MessageSquare', planned: true },
      { path: 'usage/voice', label: 'Voice', title: 'Voice usage', icon: 'Mic', planned: true },
      { path: 'usage/documents', label: 'Documents', title: 'Documents', icon: 'FileText', planned: true },
      { path: 'usage/podcasts', label: 'Podcasts', title: 'Podcasts', icon: 'Radio', planned: true },
      { path: 'usage/tests', label: 'Tests', title: 'Tests & exams', icon: 'ClipboardCheck', planned: true },
      { path: 'quotas', label: 'Quotas', title: 'Quotas & entitlements', icon: 'Gauge' },
    ],
  },
  {
    label: 'Billing',
    domain: 'student',
    items: [
      { path: 'billing', label: 'Revenue', title: 'Revenue', icon: 'IndianRupee', minRole: ['super_admin', 'admin'] },
      { path: 'billing/subscriptions', label: 'Subscriptions', title: 'Subscriptions', icon: 'RefreshCw', minRole: ['super_admin', 'admin'], planned: true },
      { path: 'billing/payments', label: 'Payments', title: 'Payments', icon: 'CreditCard', minRole: ['super_admin', 'admin'] },
    ],
  },
  {
    label: 'Operations',
    domain: 'platform',
    items: [
      { path: 'errors', label: 'Errors', title: 'Errors', icon: 'AlertTriangle', planned: true },
      { path: 'alerts', label: 'Alerts', title: 'Alert centre', icon: 'Bell', planned: true },
      { path: 'audit', label: 'Audit log', title: 'Admin audit log', icon: 'ScrollText', minRole: ['super_admin', 'admin'], planned: true },
    ],
  },
  {
    label: 'System',
    domain: 'platform',
    items: [
      { path: 'settings', label: 'Settings', title: 'Admin settings', icon: 'Settings', planned: true },
    ],
  },
];

/** Flat lookup for titles and route generation. */
export const ADMIN_NAV_ITEMS: AdminNavItem[] = ADMIN_NAV.flatMap((g) => g.items);

export function titleForPath(relPath: string): string {
  return ADMIN_NAV_ITEMS.find((i) => i.path === relPath)?.title ?? 'Admin';
}
