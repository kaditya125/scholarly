/**
 * Student directory.
 *
 * ─── EVERYTHING IS SERVER-SIDE ───────────────────────────────────────────────────────
 * Search, filtering, sorting and pagination are all query parameters on
 * GET /api/admin/students. This component never holds more than one page of students and
 * never filters an array in the browser (§38) — at 31 students that would work fine and
 * at 31,000 it would not, and the difference would only appear once it mattered.
 *
 * ─── HONEST ABOUT LIMITS ─────────────────────────────────────────────────────────────
 * The endpoint returns `searchNote` (search is prefix-only — Firestore has no substring
 * search) and `unsupported[]` (filters it cannot serve). Both are rendered rather than
 * swallowed: an operator who searches "ditya", gets nothing, and concludes the account
 * does not exist has been misled by software that looked like it worked.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  AlertCircle, ChevronLeft, ChevronRight, Info, RefreshCw, Search, Users, X,
} from 'lucide-react';
import { api } from '../../lib/api/client';

interface StudentRow {
  id: string;
  name: string;
  email: string;
  plan: 'free' | 'pro';
  subscriptionStatus: string | null;
  createdAt: string | null;
  onboardingStatus: string | null;
  accountStatus: 'active' | 'suspended' | 'pending';
  lastSignInAt: string | null;
  emailVerified: boolean;
}

interface ListResponse {
  students: StudentRow[];
  nextCursor: string | null;
  hasMore: boolean;
  pageSize: number;
  searchNote?: string;
  unsupported?: string[];
}

interface Stats {
  total: number; free: number; pro: number;
  newLast7Days: number; newLast30Days: number;
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

const PLAN_FILTERS = [
  { value: '', label: 'All plans' },
  { value: 'free', label: 'Free' },
  { value: 'pro', label: 'Pro' },
] as const;

const SORTS = [
  { value: 'createdAt:desc', label: 'Newest first' },
  { value: 'createdAt:asc', label: 'Oldest first' },
  { value: 'email:asc', label: 'Email A–Z' },
  { value: 'displayName:asc', label: 'Name A–Z' },
] as const;

export default function AdminStudents() {
  const [data, setData] = useState<ListResponse | null>(null);
  const [stats, setStats] = useState<Stats | null>(null);
  const [statsError, setStatsError] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [plan, setPlan] = useState('');
  const [sort, setSort] = useState<string>('createdAt:desc');

  /**
   * Cursor pagination keeps a stack of the cursors used to reach each page, because
   * Firestore cursors only move forward. "Previous" pops the stack rather than trying to
   * run the query backwards.
   */
  const [cursorStack, setCursorStack] = useState<(string | null)[]>([null]);
  const [pageIndex, setPageIndex] = useState(0);

  const load = useCallback(async (cursor: string | null) => {
    setLoading(true);
    setError(null);
    try {
      const [sortField, dir] = sort.split(':');
      const res = await api.get<ListResponse>('/admin/students', {
        params: {
          cursor: cursor || undefined,
          limit: 25,
          search: search || undefined,
          plan: plan || undefined,
          sort: sortField,
          dir,
        },
      });
      setData(res.data);
    } catch (err: unknown) {
      const r = (err as { response?: { status?: number; data?: { error?: string } } }).response;
      setError(
        r?.status === 403
          ? 'This account is not authorised to view students.'
          : r?.data?.error || 'Unable to load students. Try again.',
      );
    } finally {
      setLoading(false);
    }
  }, [search, plan, sort]);

  // Filters reset pagination — page 3 of the old query is meaningless under a new one.
  useEffect(() => {
    setCursorStack([null]);
    setPageIndex(0);
    void load(null);
  }, [load]);

  useEffect(() => {
    api.get<Stats>('/admin/students/stats')
      .then((r) => setStats(r.data))
      .catch(() => setStatsError(true));
  }, []);

  // Debounced search: one request when typing settles, not one per keystroke.
  const debounceRef = useRef<number | undefined>(undefined);
  const onSearchChange = (v: string) => {
    setSearchInput(v);
    window.clearTimeout(debounceRef.current);
    debounceRef.current = window.setTimeout(() => setSearch(v.trim()), 350);
  };

  const next = () => {
    if (!data?.nextCursor) return;
    setCursorStack((s) => [...s.slice(0, pageIndex + 1), data.nextCursor]);
    setPageIndex((i) => i + 1);
    void load(data.nextCursor);
  };
  const prev = () => {
    if (pageIndex === 0) return;
    const target = cursorStack[pageIndex - 1] ?? null;
    setPageIndex((i) => i - 1);
    void load(target);
  };

  return (
    <div className="space-y-5">
      <div>
        <p className="text-[13px] text-slate-500 dark:text-gray-400 max-w-2xl">
          The administrative directory of every registered student. Search, filtering and
          paging all run on the server — this page holds one page at a time.
        </p>
      </div>

      {/* ── Totals ──────────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {statsError ? (
          <div className="col-span-2 sm:col-span-4 rounded-xl border border-slate-200/80 dark:border-white/[0.07] bg-white dark:bg-[#171719] px-4 py-3">
            <p className="text-[12.5px] text-slate-500 dark:text-gray-400">
              Totals unavailable — the directory below is unaffected.
            </p>
          </div>
        ) : !stats ? (
          [0, 1, 2, 3].map((i) => (
            <div key={i} className="rounded-xl border border-slate-200/80 dark:border-white/[0.07] bg-white dark:bg-[#171719] p-4">
              <div className="h-3 w-16 rounded bg-slate-100 dark:bg-white/[0.06] animate-pulse" />
              <div className="mt-3 h-6 w-12 rounded bg-slate-100 dark:bg-white/[0.06] animate-pulse" />
            </div>
          ))
        ) : (
          [
            { label: 'Total students', value: stats.total },
            { label: 'Pro', value: stats.pro },
            { label: 'Free', value: stats.free },
            { label: 'New in 30 days', value: stats.newLast30Days },
          ].map((s) => (
            <div key={s.label} className="rounded-xl border border-slate-200/80 dark:border-white/[0.07] bg-white dark:bg-[#171719] p-4">
              <div className="text-[12px] font-medium text-slate-500 dark:text-gray-400">{s.label}</div>
              <div className="mt-2 text-[24px] font-bold tracking-tight text-slate-900 dark:text-white tabular-nums leading-none">
                {s.value.toLocaleString('en-IN')}
              </div>
            </div>
          ))
        )}
      </div>

      {/* ── Controls ────────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-2.5">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-[15px] h-[15px] text-slate-400" strokeWidth={1.9} />
          <input
            value={searchInput}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Search by email, name or user ID"
            className="w-full rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#171719] pl-9 pr-9 py-2.5 text-[13px] text-slate-900 dark:text-white placeholder:text-slate-400 outline-none focus:border-[#8FAE2B] focus:ring-2 focus:ring-[#c8e558]/25 transition"
          />
          {searchInput && (
            <button
              onClick={() => { setSearchInput(''); setSearch(''); }}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 dark:hover:text-gray-200"
              aria-label="Clear search"
            >
              <X className="w-3.5 h-3.5" strokeWidth={2} />
            </button>
          )}
        </div>

        <div className="flex rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#171719] p-0.5">
          {PLAN_FILTERS.map((f) => (
            <button
              key={f.value}
              onClick={() => setPlan(f.value)}
              className={`px-3 py-2 rounded-[10px] text-[12.5px] font-medium transition-colors ${
                plan === f.value
                  ? 'bg-[#f2f7e3] dark:bg-[#1e2416] text-slate-900 dark:text-white'
                  : 'text-slate-500 dark:text-gray-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>

        <select
          value={sort}
          onChange={(e) => setSort(e.target.value)}
          className="rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#171719] px-3 py-2.5 text-[12.5px] font-medium text-slate-700 dark:text-gray-200 outline-none focus:border-[#8FAE2B] transition"
        >
          {SORTS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
        </select>

        <button
          onClick={() => void load(cursorStack[pageIndex] ?? null)}
          className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#171719] px-3 py-2.5 text-[12.5px] font-medium text-slate-600 dark:text-gray-300 hover:text-slate-900 dark:hover:text-white transition-colors"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} strokeWidth={2} />
          Refresh
        </button>
      </div>

      {/* Search semantics and unserviceable filters, stated rather than hidden. */}
      {(data?.searchNote || data?.unsupported?.length) && (
        <div className="rounded-xl border border-slate-200/80 dark:border-white/[0.07] bg-slate-50/70 dark:bg-white/[0.03] px-3.5 py-2.5 space-y-1">
          {data?.searchNote && (
            <p className="flex items-start gap-1.5 text-[12px] text-slate-600 dark:text-gray-400">
              <Info className="w-3.5 h-3.5 mt-px shrink-0" strokeWidth={1.9} />{data.searchNote}
            </p>
          )}
          {data?.unsupported?.map((u) => (
            <p key={u} className="flex items-start gap-1.5 text-[12px] text-amber-700 dark:text-amber-400">
              <AlertCircle className="w-3.5 h-3.5 mt-px shrink-0" strokeWidth={1.9} />{u}
            </p>
          ))}
        </div>
      )}

      {/* ── Table ───────────────────────────────────────────────────────────── */}
      <div className="rounded-xl border border-slate-200/80 dark:border-white/[0.07] bg-white dark:bg-[#171719] overflow-hidden">
        {error ? (
          <div className="px-4 py-12 text-center">
            <AlertCircle className="w-5 h-5 mx-auto text-slate-400" strokeWidth={1.9} />
            <p className="mt-2.5 text-[13.5px] text-slate-600 dark:text-gray-300">{error}</p>
            <button
              onClick={() => void load(cursorStack[pageIndex] ?? null)}
              className="mt-4 inline-flex items-center gap-1.5 rounded-lg border border-slate-200 dark:border-white/10 px-3 py-1.5 text-[12.5px] font-medium text-slate-700 dark:text-gray-200 hover:bg-slate-50 dark:hover:bg-white/[0.04]"
            >
              <RefreshCw className="w-3.5 h-3.5" strokeWidth={2} /> Retry
            </button>
          </div>
        ) : loading ? (
          <div className="p-4 space-y-2">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="h-10 rounded-lg bg-slate-50 dark:bg-white/[0.04] animate-pulse" />
            ))}
          </div>
        ) : !data || data.students.length === 0 ? (
          <div className="px-4 py-14 text-center">
            <Users className="w-5 h-5 mx-auto text-slate-300 dark:text-gray-600" strokeWidth={1.9} />
            <p className="mt-2.5 text-[13.5px] text-slate-600 dark:text-gray-300">
              {search || plan ? 'No students match these filters.' : 'No students registered yet.'}
            </p>
            {(search || plan) && (
              <button
                onClick={() => { setSearchInput(''); setSearch(''); setPlan(''); }}
                className="mt-3 text-[12.5px] font-medium text-slate-500 dark:text-gray-400 hover:text-slate-900 dark:hover:text-white underline"
              >
                Clear filters
              </button>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left min-w-[820px]">
              <thead>
                <tr className="text-[11px] font-semibold uppercase tracking-wide text-slate-400 dark:text-gray-500 border-b border-slate-200/70 dark:border-white/[0.07]">
                  <th className="px-4 py-2.5 font-semibold">Student</th>
                  <th className="px-4 py-2.5 font-semibold">Plan</th>
                  <th className="px-4 py-2.5 font-semibold">Account</th>
                  <th className="px-4 py-2.5 font-semibold">Subscription</th>
                  <th className="px-4 py-2.5 font-semibold">Registered</th>
                  <th className="px-4 py-2.5 font-semibold">Last seen</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-white/[0.05]">
                {data.students.map((s) => (
                  <tr key={s.id} className="hover:bg-slate-50/70 dark:hover:bg-white/[0.03] transition-colors">
                    <td className="px-4 py-2.5">
                      <Link to={`/admin/students/${s.id}`} className="group block">
                        <div className="text-[13px] font-medium text-slate-900 dark:text-white truncate max-w-[240px] group-hover:underline">
                          {s.name}
                        </div>
                        <div className="text-[11.5px] text-slate-400 dark:text-gray-500 truncate max-w-[240px]">{s.email}</div>
                      </Link>
                    </td>
                    <td className="px-4 py-2.5">
                      <span className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                        s.plan === 'pro'
                          ? 'bg-[#f2f7e3] dark:bg-[#1e2416] text-[#5A7410] dark:text-[#c8e558]'
                          : 'bg-slate-100 dark:bg-white/[0.06] text-slate-500 dark:text-gray-400'
                      }`}>
                        {s.plan === 'pro' ? 'Pro' : 'Free'}
                      </span>
                    </td>
                    <td className="px-4 py-2.5">
                      <span className={`inline-flex items-center gap-1.5 text-[12px] font-medium ${
                        s.accountStatus === 'suspended'
                          ? 'text-red-600 dark:text-red-400'
                          : s.accountStatus === 'active'
                          ? 'text-slate-700 dark:text-gray-200'
                          : 'text-slate-400 dark:text-gray-500'
                      }`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${
                          s.accountStatus === 'suspended' ? 'bg-red-500'
                            : s.accountStatus === 'active' ? 'bg-[#c8e558]' : 'bg-slate-300 dark:bg-gray-600'
                        }`} />
                        {s.accountStatus === 'pending' ? 'never signed in' : s.accountStatus}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-[12.5px] text-slate-500 dark:text-gray-400">
                      {s.subscriptionStatus ?? <span className="text-slate-300 dark:text-gray-600">—</span>}
                    </td>
                    <td className="px-4 py-2.5 text-[12.5px] text-slate-500 dark:text-gray-400 tabular-nums">{relative(s.createdAt)}</td>
                    <td className="px-4 py-2.5 text-[12.5px] text-slate-500 dark:text-gray-400 tabular-nums">{relative(s.lastSignInAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Cursor paging. No total page count: that needs a count query per page turn,
            and the aggregate above already answers "how many students are there". */}
        {!loading && !error && data && data.students.length > 0 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-slate-200/70 dark:border-white/[0.07]">
            <span className="text-[12px] text-slate-500 dark:text-gray-400">
              Page {pageIndex + 1} · showing {data.pageSize}
            </span>
            <div className="flex gap-2">
              <button
                onClick={prev}
                disabled={pageIndex === 0}
                className="inline-flex items-center gap-1 rounded-lg border border-slate-200 dark:border-white/10 px-2.5 py-1.5 text-[12.5px] font-medium text-slate-600 dark:text-gray-300 disabled:opacity-40 disabled:cursor-not-allowed hover:text-slate-900 dark:hover:text-white transition-colors"
              >
                <ChevronLeft className="w-3.5 h-3.5" strokeWidth={2} /> Previous
              </button>
              <button
                onClick={next}
                disabled={!data.hasMore}
                className="inline-flex items-center gap-1 rounded-lg border border-slate-200 dark:border-white/10 px-2.5 py-1.5 text-[12.5px] font-medium text-slate-600 dark:text-gray-300 disabled:opacity-40 disabled:cursor-not-allowed hover:text-slate-900 dark:hover:text-white transition-colors"
              >
                Next <ChevronRight className="w-3.5 h-3.5" strokeWidth={2} />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
