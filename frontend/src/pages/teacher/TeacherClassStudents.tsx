import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  ArrowLeft, Copy, Check, Link2, Loader2, UserCheck, UserX, Inbox, Users,
  AlertTriangle, Ban, Lock,
} from 'lucide-react';
import { useClass } from '../../hooks/api/useClasses';
import { useRoster, useEnrollmentMutations } from '../../hooks/api/useEnrollments';
import { useCapabilities } from '../../hooks/api/useCapabilities';
import { invitationLink, type EnrollmentRecord, type EnrollmentState } from '../../lib/api/enrollments';
import { cn } from '../../lib/utils';

/**
 * /teach/classes/:id/students — invitations, the request inbox, and the roster.
 *
 * The page is organised around the consent model rather than around a flat member list, because
 * the states genuinely mean different things:
 *
 *   · REQUESTED sits in an inbox, because it is waiting on the TEACHER to act.
 *   · INVITED is shown separately and explicitly as "grants nothing yet" — a teacher who has
 *     sent twenty invitations has not got twenty students, and the UI should not let them
 *     believe otherwise.
 *   · ACTIVE is the roster. Only these students exist as far as access is concerned.
 *
 * Students are identified by uid. There is no name lookup here on purpose: the roster endpoint
 * returns edges only, and deciding what a teacher may see about an enrolled student is its own
 * decision rather than something to slip into a list view.
 */

const STATE_LABEL: Record<EnrollmentState, string> = {
  INVITED: 'Invited', REQUESTED: 'Requested', ACTIVE: 'Active', DECLINED: 'Declined',
  REJECTED: 'Rejected', LEFT: 'Left', REMOVED: 'Removed', BLOCKED: 'Blocked',
};

function short(uid: string) {
  return uid.length > 12 ? `${uid.slice(0, 6)}…${uid.slice(-4)}` : uid;
}

function Card({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn('rounded-2xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#141416]', className)}>
      {children}
    </div>
  );
}

function PersonRow({
  edge, children,
}: { edge: EnrollmentRecord; children?: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3 px-5 py-3.5 border-b border-slate-100 dark:border-white/[0.06] last:border-0">
      <span className="w-8 h-8 shrink-0 rounded-full bg-slate-100 dark:bg-white/[0.08] flex items-center justify-center text-[11px] font-semibold text-slate-600 dark:text-gray-300">
        {edge.studentUid.slice(0, 2).toUpperCase()}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-[13.5px] font-medium truncate" title={edge.studentUid}>{short(edge.studentUid)}</p>
        <p className="text-[11.5px] text-slate-500 dark:text-gray-400">
          {STATE_LABEL[edge.state]} · joined via {edge.source}
        </p>
      </div>
      {children}
    </div>
  );
}

export default function TeacherClassStudents() {
  const { id } = useParams<{ id: string }>();
  const { data: record } = useClass(id);
  const { data: roster, isLoading, isError } = useRoster(id);
  const { capabilities } = useCapabilities();
  const { createInvitation, setState } = useEnrollmentMutations(id);

  const [code, setCode] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const canInvite = !!capabilities?.inviteStudents;

  const groups = useMemo(() => {
    const g: Record<'requests' | 'active' | 'invited' | 'past', EnrollmentRecord[]> = {
      requests: [], active: [], invited: [], past: [],
    };
    for (const e of roster ?? []) {
      if (e.state === 'REQUESTED') g.requests.push(e);
      else if (e.state === 'ACTIVE') g.active.push(e);
      else if (e.state === 'INVITED') g.invited.push(e);
      else g.past.push(e);
    }
    return g;
  }, [roster]);

  const act = async (state: EnrollmentState, studentUid: string) => {
    setActionError(null);
    try {
      await setState.mutateAsync({ state, studentUid });
    } catch (e: any) {
      setActionError(e?.response?.data?.error ?? 'That action could not be completed.');
    }
  };

  const handleInvite = async () => {
    setActionError(null);
    setCopied(false);
    try {
      const inv = await createInvitation.mutateAsync({});
      setCode(inv.code);
    } catch (e: any) {
      setActionError(e?.response?.data?.error ?? 'We could not create an invitation.');
    }
  };

  const copy = async () => {
    if (!code) return;
    try {
      await navigator.clipboard.writeText(invitationLink(code));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setActionError('Copying failed — select the link and copy it manually.');
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <Link to={`/teach/classes/${id}`} className="inline-flex items-center gap-1.5 text-[13px] font-medium text-slate-500 dark:text-gray-400 hover:text-slate-900 dark:hover:text-white transition-colors">
          <ArrowLeft className="w-3.5 h-3.5" strokeWidth={2} aria-hidden />
          {record?.title || 'Class'}
        </Link>
        <h1 className="mt-3 text-[24px] sm:text-[28px] font-semibold tracking-[-0.03em]">Students</h1>
        <p className="mt-1.5 text-[14px] text-slate-500 dark:text-gray-400">
          Invite students, answer requests, and manage who is in this class.
        </p>
      </div>

      {actionError && (
        <div role="alert" className="rounded-2xl border border-red-500/30 bg-red-50 dark:bg-red-500/[0.07] p-4 text-[13.5px] text-red-800 dark:text-red-300">
          {actionError}
        </div>
      )}

      {/* ── Invite ───────────────────────────────────────────────────────── */}
      <Card className="p-5 sm:p-6">
        <div className="flex items-start gap-3">
          <span className="inline-flex w-9 h-9 shrink-0 rounded-xl bg-slate-900 dark:bg-white items-center justify-center">
            <Link2 className="w-[17px] h-[17px] text-white dark:text-slate-900" strokeWidth={1.9} aria-hidden />
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="text-[15.5px] font-semibold tracking-[-0.015em]">Invite by link</h2>
            <p className="mt-1 text-[13px] leading-relaxed text-slate-500 dark:text-gray-400">
              Anyone with the link can see this class and choose to join. Sharing a link enrols
              nobody on its own — each student still has to accept.
            </p>

            {record?.status === 'draft' && (
              <p className="mt-3 inline-flex items-start gap-2 text-[12.5px] text-amber-700 dark:text-amber-400">
                <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" strokeWidth={2} aria-hidden />
                Publish the class before inviting students.
              </p>
            )}

            {record?.pricing.type === 'paid' && (
              <p className="mt-3 inline-flex items-start gap-2 text-[12.5px] text-amber-700 dark:text-amber-400">
                <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" strokeWidth={2} aria-hidden />
                This is a paid class. Students cannot join until purchasing is available.
              </p>
            )}

            {code ? (
              <div className="mt-4 flex flex-wrap items-center gap-2">
                <code className="flex-1 min-w-0 truncate rounded-lg border border-slate-200 dark:border-white/12 bg-slate-50 dark:bg-white/[0.04] px-3 py-2 text-[12.5px] font-mono">
                  {invitationLink(code)}
                </code>
                <button
                  onClick={copy}
                  className="inline-flex items-center gap-1.5 h-9 px-3 rounded-lg bg-slate-900 dark:bg-white text-white dark:text-slate-900 text-[13px] font-semibold"
                >
                  {copied ? <Check className="w-3.5 h-3.5" strokeWidth={2.5} aria-hidden /> : <Copy className="w-3.5 h-3.5" strokeWidth={2} aria-hidden />}
                  {copied ? 'Copied' : 'Copy'}
                </button>
              </div>
            ) : (
              <button
                onClick={handleInvite}
                disabled={!canInvite || createInvitation.isPending || record?.status === 'draft'}
                className="mt-4 inline-flex items-center gap-2 h-10 px-4 rounded-xl bg-[#c8e558] hover:bg-[#bcd94c] text-slate-900 text-[13.5px] font-semibold disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {createInvitation.isPending ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden /> : <Link2 className="w-4 h-4" strokeWidth={2.25} aria-hidden />}
                Create invite link
              </button>
            )}

            {!canInvite && (
              <p className="mt-3 inline-flex items-start gap-2 text-[12.5px] text-slate-500 dark:text-gray-400">
                <Lock className="w-3.5 h-3.5 mt-0.5 shrink-0" strokeWidth={2} aria-hidden />
                Inviting students unlocks once your teaching account is approved.
              </p>
            )}
          </div>
        </div>
      </Card>

      {isLoading && (
        <div className="flex items-center gap-2.5 text-[13.5px] text-slate-500 dark:text-gray-400 py-6">
          <Loader2 className="w-4 h-4 animate-spin" aria-hidden />
          Loading students…
        </div>
      )}

      {isError && (
        <Card className="p-5 border-red-500/30">
          <p className="text-[13.5px] text-red-800 dark:text-red-300">We couldn&rsquo;t load this class&rsquo;s students.</p>
        </Card>
      )}

      {/* ── Request inbox ────────────────────────────────────────────────── */}
      {!isLoading && (
        <section>
          <h2 className="flex items-center gap-2 text-[12px] font-semibold uppercase tracking-[0.11em] text-slate-500 dark:text-gray-400 mb-3">
            <Inbox className="w-3.5 h-3.5" strokeWidth={2} aria-hidden />
            Requests to join
            {groups.requests.length > 0 && (
              <span className="inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full bg-[#c8e558] text-slate-900 text-[10.5px] font-bold">
                {groups.requests.length}
              </span>
            )}
          </h2>
          <Card>
            {groups.requests.length === 0 ? (
              <p className="px-5 py-4 text-[13px] text-slate-500 dark:text-gray-400">
                No pending requests.
              </p>
            ) : (
              groups.requests.map((e) => (
                <PersonRow key={e.id} edge={e}>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      onClick={() => act('ACTIVE', e.studentUid)}
                      disabled={setState.isPending}
                      className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg bg-slate-900 dark:bg-white text-white dark:text-slate-900 text-[12.5px] font-semibold disabled:opacity-60"
                    >
                      <UserCheck className="w-3.5 h-3.5" strokeWidth={2} aria-hidden />
                      Accept
                    </button>
                    <button
                      onClick={() => act('REJECTED', e.studentUid)}
                      disabled={setState.isPending}
                      className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg border border-slate-200 dark:border-white/12 text-[12.5px] font-medium disabled:opacity-60"
                    >
                      Decline
                    </button>
                  </div>
                </PersonRow>
              ))
            )}
          </Card>
        </section>
      )}

      {/* ── Roster ───────────────────────────────────────────────────────── */}
      {!isLoading && (
        <section>
          <h2 className="flex items-center gap-2 text-[12px] font-semibold uppercase tracking-[0.11em] text-slate-500 dark:text-gray-400 mb-3">
            <Users className="w-3.5 h-3.5" strokeWidth={2} aria-hidden />
            In this class ({groups.active.length})
          </h2>
          <Card>
            {groups.active.length === 0 ? (
              <p className="px-5 py-4 text-[13px] text-slate-500 dark:text-gray-400">
                Nobody has joined yet. Share the invite link above.
              </p>
            ) : (
              groups.active.map((e) => (
                <PersonRow key={e.id} edge={e}>
                  <button
                    onClick={() => act('REMOVED', e.studentUid)}
                    disabled={setState.isPending}
                    className="shrink-0 inline-flex items-center gap-1.5 h-8 px-3 rounded-lg border border-slate-200 dark:border-white/12 text-[12.5px] font-medium text-slate-600 dark:text-gray-300 hover:text-red-600 dark:hover:text-red-400 disabled:opacity-60"
                  >
                    <UserX className="w-3.5 h-3.5" strokeWidth={2} aria-hidden />
                    Remove
                  </button>
                </PersonRow>
              ))
            )}
          </Card>
        </section>
      )}

      {/* ── Invited (explicitly not members) ─────────────────────────────── */}
      {!isLoading && groups.invited.length > 0 && (
        <section>
          <h2 className="text-[12px] font-semibold uppercase tracking-[0.11em] text-slate-500 dark:text-gray-400 mb-3">
            Invited — not joined yet
          </h2>
          <Card>
            <p className="px-5 pt-4 text-[12.5px] leading-relaxed text-slate-500 dark:text-gray-400">
              These people have been invited but have not accepted. An invitation grants no access
              on its own.
            </p>
            <div className="mt-2">
              {groups.invited.map((e) => <PersonRow key={e.id} edge={e} />)}
            </div>
          </Card>
        </section>
      )}

      {/* ── History ──────────────────────────────────────────────────────── */}
      {!isLoading && groups.past.length > 0 && (
        <section>
          <h2 className="flex items-center gap-2 text-[12px] font-semibold uppercase tracking-[0.11em] text-slate-500 dark:text-gray-400 mb-3">
            <Ban className="w-3.5 h-3.5" strokeWidth={2} aria-hidden />
            Past and declined
          </h2>
          <Card>
            {groups.past.map((e) => <PersonRow key={e.id} edge={e} />)}
          </Card>
        </section>
      )}
    </div>
  );
}
