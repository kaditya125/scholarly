import { useMemo, useState } from 'react';
import {
  GraduationCap, Search, Check, X, PlayCircle, Clock, ChevronDown, History,
} from 'lucide-react';
import { useTeacherQueue, useTeacherVerification, useSetTeacherStatus } from '../../lib/api/hooks';
import { LoadingState, ErrorState, EmptyState } from '../components/DataStates';
import { PageHeader, Panel, Badge, Button, statusTone } from '../ui';
import { cn } from '../../lib/utils';

/**
 * /admin/teacher-verification — D-3, the piece that was missing.
 *
 * Phase 3A shipped the state machine (draft → pending → under_review → approved/rejected →
 * suspended), the admin transition endpoint, and a full audit trail. None of it was usable,
 * because nothing let a human see who was waiting or act on it — the "review" in "under review"
 * had no reviewer. This page is that reviewer's desk.
 *
 * Deliberately absent: any automated pass/fail criteria. D-3 in the architecture doc is
 * explicit that what verification checks and who performs it is a policy decision, not a
 * technical one — this page surfaces exactly what the teacher submitted (subjects, boards,
 * classes, exams, languages, teaching style, bio, experience) and lets a human decide, rather
 * than inventing rules nobody has actually approved.
 *
 * Only teachers in `pending` or `under_review` appear here — that is what GET /admin/teacher/queue
 * returns. `draft` accounts (still mid-wizard) are correctly invisible to a reviewer.
 */

type TeacherRow = {
  uid: string;
  displayName: string | null;
  email: string | null;
  teacherStatus: 'pending' | 'under_review' | string;
  subjects?: string[];
  boards?: string[];
  classesTaught?: string[];
  exams?: string[];
  languages?: string[];
  teachingStyle?: string | null;
  bio?: string | null;
  yearsExperience?: number | null;
  createdAt?: { _seconds?: number } | string | null;
  updatedAt?: { _seconds?: number } | string | null;
};

function fmtDate(v: TeacherRow['createdAt']): string {
  if (!v) return '—';
  const d = typeof v === 'object' && v?._seconds ? new Date(v._seconds * 1000) : new Date(v as string);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

function Chips({ items }: { items?: string[] }) {
  if (!items || items.length === 0) return <span className="text-slate-400 dark:text-gray-600">—</span>;
  return (
    <div className="flex flex-wrap gap-1">
      {items.map((it) => (
        <span key={it} className="px-2 py-0.5 rounded-md bg-slate-100 dark:bg-white/5 text-xs text-slate-600 dark:text-gray-300">
          {it}
        </span>
      ))}
    </div>
  );
}

function ReviewRow({ row }: { row: TeacherRow }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  const { data: history } = useTeacherVerification(open ? row.uid : null);
  const setStatus = useSetTeacherStatus();
  const [error, setError] = useState<string | null>(null);

  const act = async (status: 'under_review' | 'approved' | 'rejected') => {
    setError(null);
    if (status === 'rejected' && !reason.trim()) {
      setError('A reason is required when rejecting — the teacher deserves to know why.');
      return;
    }
    try {
      await setStatus.mutateAsync({ uid: row.uid, status, reason: reason.trim() || undefined });
      setReason('');
    } catch (e: any) {
      setError(e?.response?.data?.error ?? 'That action could not be completed.');
    }
  };

  return (
    <div className="border-b border-slate-100 dark:border-white/5 last:border-0">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-4 px-5 py-3.5 text-left hover:bg-slate-50/60 dark:hover:bg-white/[0.02] transition-colors"
      >
        <div className="w-8 h-8 rounded-full bg-indigo-100 dark:bg-indigo-500/20 text-indigo-600 dark:text-indigo-400 flex items-center justify-center text-xs font-bold shrink-0">
          {(row.displayName || row.email || '?').charAt(0).toUpperCase()}
        </div>
        <div className="min-w-0 flex-1">
          <div className="font-semibold text-slate-900 dark:text-white truncate">{row.displayName || 'Unnamed teacher'}</div>
          <div className="text-xs text-slate-500 dark:text-gray-400 truncate">{row.email || row.uid}</div>
        </div>
        <div className="hidden sm:block max-w-[16rem]"><Chips items={row.subjects} /></div>
        <Badge tone={statusTone(row.teacherStatus)}>{row.teacherStatus.replace('_', ' ')}</Badge>
        <span className="hidden md:inline text-xs text-slate-400 dark:text-gray-500 w-24 text-right">{fmtDate(row.createdAt)}</span>
        <ChevronDown className={cn('w-4 h-4 text-slate-400 transition-transform shrink-0', open && 'rotate-180')} />
      </button>

      {open && (
        <div className="px-5 pb-5 pt-1 bg-slate-50/50 dark:bg-white/[0.015]">
          <div className="grid sm:grid-cols-2 gap-x-8 gap-y-3 mb-4 text-sm">
            <div><div className="text-xs text-slate-500 dark:text-gray-400 mb-1">Subjects</div><Chips items={row.subjects} /></div>
            <div><div className="text-xs text-slate-500 dark:text-gray-400 mb-1">Classes taught</div><Chips items={row.classesTaught} /></div>
            <div><div className="text-xs text-slate-500 dark:text-gray-400 mb-1">Boards</div><Chips items={row.boards} /></div>
            <div><div className="text-xs text-slate-500 dark:text-gray-400 mb-1">Exams</div><Chips items={row.exams} /></div>
            <div><div className="text-xs text-slate-500 dark:text-gray-400 mb-1">Languages</div><Chips items={row.languages} /></div>
            <div>
              <div className="text-xs text-slate-500 dark:text-gray-400 mb-1">Experience</div>
              <span className="text-slate-700 dark:text-gray-200">
                {row.yearsExperience != null ? `${row.yearsExperience} years` : '—'}
                {row.teachingStyle ? ` · ${row.teachingStyle}` : ''}
              </span>
            </div>
            {row.bio && (
              <div className="sm:col-span-2">
                <div className="text-xs text-slate-500 dark:text-gray-400 mb-1">Bio</div>
                <p className="text-slate-700 dark:text-gray-200 leading-relaxed">{row.bio}</p>
              </div>
            )}
          </div>

          {Array.isArray((history as any)?.history) && (history as any).history.length > 0 && (
            <details className="mb-4 text-xs text-slate-500 dark:text-gray-400">
              <summary className="cursor-pointer inline-flex items-center gap-1.5 font-medium">
                <History className="w-3.5 h-3.5" /> Verification history ({(history as any).history.length})
              </summary>
              <ul className="mt-2 space-y-1 pl-5">
                {(history as any).history.map((h: any, i: number) => (
                  <li key={i}>
                    {h.previousState ?? 'created'} → {h.newState} · {h.actorRole}
                    {h.reason ? ` — "${h.reason}"` : ''}
                  </li>
                ))}
              </ul>
            </details>
          )}

          {error && <div className="mb-3 text-xs text-rose-600 dark:text-rose-400">{error}</div>}

          <div className="flex flex-wrap items-center gap-2">
            <input
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Reason (required to reject, optional otherwise)"
              className="flex-1 min-w-[14rem] px-3 py-2 bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
            {row.teacherStatus === 'pending' && (
              <Button variant="secondary" size="sm" icon={<PlayCircle className="w-4 h-4" />} loading={setStatus.isPending} onClick={() => act('under_review')}>
                Start review
              </Button>
            )}
            {row.teacherStatus === 'under_review' && (
              <>
                <Button variant="success" size="sm" icon={<Check className="w-4 h-4" />} loading={setStatus.isPending} onClick={() => act('approved')}>
                  Approve
                </Button>
                <Button variant="danger" size="sm" icon={<X className="w-4 h-4" />} loading={setStatus.isPending} onClick={() => act('rejected')}>
                  Reject
                </Button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export function TeacherVerification() {
  const { data, isLoading, error, refetch } = useTeacherQueue();
  const [search, setSearch] = useState('');

  const rows: TeacherRow[] = useMemo(() => {
    const list = (data as any)?.queue ?? [];
    if (!search.trim()) return list;
    const q = search.toLowerCase();
    return list.filter((r: TeacherRow) =>
      r.displayName?.toLowerCase().includes(q) ||
      r.email?.toLowerCase().includes(q) ||
      r.subjects?.some((s) => s.toLowerCase().includes(q)),
    );
  }, [data, search]);

  const pendingCount = ((data as any)?.queue ?? []).filter((r: TeacherRow) => r.teacherStatus === 'pending').length;

  return (
    <div className="p-4 md:p-8 space-y-6 max-w-6xl mx-auto">
      <PageHeader
        title="Teacher Verification"
        subtitle="Teachers awaiting a decision. There are no automated criteria — review the submitted profile and decide."
        icon={GraduationCap}
      />

      {isLoading ? (
        <LoadingState label="Loading the review queue..." />
      ) : error ? (
        <ErrorState error={error} onRetry={() => refetch()} />
      ) : (
        <Panel
          flush
          title="Review queue"
          subtitle={`${pendingCount} waiting to start · ${((data as any)?.queue?.length ?? 0) - pendingCount} in review`}
          actions={
            <div className="relative">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search name, email, subject..."
                className="pl-9 pr-4 py-2 bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 w-64"
              />
            </div>
          }
        >
          {rows.length === 0 ? (
            <EmptyState message={search ? `No matches for "${search}".` : 'Nobody is waiting on a decision right now.'} />
          ) : (
            <div>{rows.map((row) => <ReviewRow key={row.uid} row={row} />)}</div>
          )}
        </Panel>
      )}

      <div className="flex items-start gap-2.5 rounded-xl border border-blue-500/20 bg-blue-500/5 dark:bg-blue-500/10 px-4 py-3 text-xs text-blue-700 dark:text-blue-300">
        <Clock className="w-4 h-4 mt-0.5 shrink-0" />
        <span className="leading-relaxed">
          Teachers keep full access to Scholarly while they wait here — this queue gates
          teaching-specific capabilities only, not the platform itself.
        </span>
      </div>
    </div>
  );
}
