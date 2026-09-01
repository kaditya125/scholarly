/**
 * Admin overview.
 *
 * ─── REAL DATA ONLY (§36) ────────────────────────────────────────────────────────────
 * Every number on this page comes from GET /api/admin/users, which lists real accounts
 * through the Firebase Admin SDK. There is no seeded or illustrative data here.
 *
 * The sections this page does NOT yet show — revenue, quota consumption, feature usage,
 * errors — are deliberately absent rather than mocked. Their endpoints do not exist yet
 * and are the subject of later slices; inventing plausible figures would make the
 * dashboard actively misleading, which is worse than an honest gap.
 */
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertCircle, ArrowRight, RefreshCw, ShieldAlert, UserCheck, Users } from 'lucide-react';
import { api } from '../../lib/api/client';

interface AdminUser {
  id: string;
  name: string;
  email: string;
  role: string;
  status: 'active' | 'suspended' | 'pending';
  lastLogin: string | null;
  joined: string | null;
  emailVerified: boolean;
}

interface UsersResponse {
  users: AdminUser[];
  stats: { totalUsers: number; activeStudents: number; staffAndAdmins: number; suspended: number };
  note?: string;
}

const relative = (iso: string | null): string => {
  if (!iso) return 'never';
  const ms = Date.now() - new Date(iso).getTime();
  if (Number.isNaN(ms)) return '—';
  const m = Math.floor(ms / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return d < 30 ? `${d}d ago` : `${Math.floor(d / 30)}mo ago`;
};

function StatCard({ label, value, hint, icon: Icon, tone = 'default' }: {
  label: string; value: string | number; hint?: string;
  icon: React.ComponentType<{ className?: string; strokeWidth?: number }>;
  tone?: 'default' | 'warn';
}) {
  return (
    <div className="rounded-xl border border-slate-200/80 dark:border-white/[0.07] bg-white dark:bg-[#171719] p-4">
      <div className="flex items-center gap-2 text-slate-500 dark:text-gray-400">
        <Icon className={`w-[15px] h-[15px] ${tone === 'warn' ? 'text-amber-500' : ''}`} strokeWidth={1.9} />
        <span className="text-[12px] font-medium">{label}</span>
      </div>
      <div className="mt-2.5 text-[28px] font-bold tracking-tight text-slate-900 dark:text-white tabular-nums leading-none">
        {value}
      </div>
      {hint && <div className="mt-1.5 text-[11.5px] text-slate-400 dark:text-gray-500">{hint}</div>}
    </div>
  );
}

function SkeletonCard() {
  return (
    <div className="rounded-xl border border-slate-200/80 dark:border-white/[0.07] bg-white dark:bg-[#171719] p-4">
      <div className="h-3 w-20 rounded bg-slate-100 dark:bg-white/[0.06] animate-pulse" />
      <div className="mt-3 h-7 w-14 rounded bg-slate-100 dark:bg-white/[0.06] animate-pulse" />
    </div>
  );
}

export default function AdminDashboard() {
  const [data, setData] = useState<UsersResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.get<UsersResponse>('/api/admin/users', { params: { limit: 1000 } });
      setData(res.data);
    } catch (err: unknown) {
      const status = (err as { response?: { status?: number } })?.response?.status;
      setError(
        status === 403
          ? 'This account is not authorised for admin data.'
          : 'Unable to load student data. Try again.',
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, []);

  const students = (data?.users ?? []).filter((u) => u.role === 'student');
  const now = Date.now();
  const since = (days: number) =>
    students.filter((u) => u.joined && now - new Date(u.joined).getTime() < days * 86400000).length;

  const recent = [...students]
    .filter((u) => u.joined)
    .sort((a, b) => new Date(b.joined!).getTime() - new Date(a.joined!).getTime())
    .slice(0, 8);

  if (error) {
    return (
      <div className="rounded-xl border border-slate-200/80 dark:border-white/[0.07] bg-white dark:bg-[#171719] p-8 text-center">
        <AlertCircle className="w-5 h-5 mx-auto text-slate-400" strokeWidth={1.9} />
        <p className="mt-2.5 text-[13.5px] text-slate-600 dark:text-gray-300">{error}</p>
        <button
          onClick={() => void load()}
          className="mt-4 inline-flex items-center gap-1.5 rounded-lg border border-slate-200 dark:border-white/10 px-3 py-1.5 text-[12.5px] font-medium text-slate-700 dark:text-gray-200 hover:bg-slate-50 dark:hover:bg-white/[0.04] transition-colors"
        >
          <RefreshCw className="w-3.5 h-3.5" strokeWidth={2} /> Retry
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {loading ? (
          <>{[0, 1, 2, 3].map((i) => <SkeletonCard key={i} />)}</>
        ) : (
          <>
            <StatCard label="Students" value={students.length} hint={`${since(7)} joined this week`} icon={Users} />
            <StatCard
              label="Active"
              value={students.filter((u) => u.status === 'active').length}
              hint="has signed in at least once"
              icon={UserCheck}
            />
            <StatCard
              label="Never active"
              value={students.filter((u) => u.status === 'pending').length}
              hint="registered, never signed in"
              icon={AlertCircle}
            />
            <StatCard
              label="Suspended"
              value={data?.stats.suspended ?? 0}
              hint="account disabled"
              icon={ShieldAlert}
              tone="warn"
            />
          </>
        )}
      </div>

      {data?.note && (
        <p className="text-[11.5px] text-amber-600 dark:text-amber-400">{data.note}</p>
      )}

      <div className="rounded-xl border border-slate-200/80 dark:border-white/[0.07] bg-white dark:bg-[#171719] overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200/70 dark:border-white/[0.07]">
          <h2 className="text-[13.5px] font-semibold text-slate-900 dark:text-white">Recent registrations</h2>
          <Link
            to="/admin/students"
            className="inline-flex items-center gap-1 text-[12px] font-medium text-slate-500 dark:text-gray-400 hover:text-slate-900 dark:hover:text-white transition-colors"
          >
            All students <ArrowRight className="w-3.5 h-3.5" strokeWidth={2} />
          </Link>
        </div>

        {loading ? (
          <div className="p-4 space-y-2.5">
            {[0, 1, 2, 3, 4].map((i) => (
              <div key={i} className="h-9 rounded-lg bg-slate-50 dark:bg-white/[0.04] animate-pulse" />
            ))}
          </div>
        ) : recent.length === 0 ? (
          <p className="px-4 py-10 text-center text-[13px] text-slate-500 dark:text-gray-400">
            No student registrations yet.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="text-[11px] font-semibold uppercase tracking-wide text-slate-400 dark:text-gray-500">
                  <th className="px-4 py-2 font-semibold">Student</th>
                  <th className="px-4 py-2 font-semibold">Status</th>
                  <th className="px-4 py-2 font-semibold">Registered</th>
                  <th className="px-4 py-2 font-semibold">Last seen</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-white/[0.05]">
                {recent.map((u) => (
                  <tr key={u.id} className="hover:bg-slate-50/70 dark:hover:bg-white/[0.03] transition-colors">
                    <td className="px-4 py-2.5">
                      <div className="text-[13px] font-medium text-slate-900 dark:text-white truncate max-w-[220px]">{u.name}</div>
                      <div className="text-[11.5px] text-slate-400 dark:text-gray-500 truncate max-w-[220px]">{u.email}</div>
                    </td>
                    <td className="px-4 py-2.5">
                      <span className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-medium ${
                        u.status === 'active'
                          ? 'bg-[#f2f7e3] dark:bg-[#1e2416] text-[#5A7410] dark:text-[#c8e558]'
                          : u.status === 'suspended'
                          ? 'bg-red-50 dark:bg-red-500/10 text-red-600 dark:text-red-400'
                          : 'bg-slate-100 dark:bg-white/[0.06] text-slate-500 dark:text-gray-400'
                      }`}>
                        {u.status}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-[12.5px] text-slate-500 dark:text-gray-400 tabular-nums">{relative(u.joined)}</td>
                    <td className="px-4 py-2.5 text-[12.5px] text-slate-500 dark:text-gray-400 tabular-nums">{relative(u.lastLogin)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/*
        An explicit statement of what is not here yet. Preferred over rendering empty
        revenue and quota cards, which would read as "zero" rather than "not built".
      */}
      <div className="rounded-xl border border-dashed border-slate-200 dark:border-white/[0.09] px-4 py-3.5">
        <p className="text-[12.5px] text-slate-500 dark:text-gray-400">
          <span className="font-medium text-slate-700 dark:text-gray-200">Not yet wired:</span>{' '}
          revenue, subscriptions, quota consumption, feature usage, performance and errors.
          These need admin endpoints that don’t exist yet and are deliberately left out rather
          than filled with placeholder figures.
        </p>
      </div>
    </div>
  );
}
