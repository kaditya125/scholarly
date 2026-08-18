import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  GraduationCap, Loader2, Clock, LogOut, AlertTriangle, IndianRupee, CalendarDays,
  NotebookPen, ChevronDown, ExternalLink, ClipboardCheck, MessageCircle, Radio, History,
} from 'lucide-react';
import { useMyEnrollments, useEnrollmentMutations } from '../hooks/api/useEnrollments';
import { useClassResources } from '../hooks/api/useClassResources';
import { useClassAssignments, useClassAssignmentMutations } from '../hooks/api/useClassAssignments';
import { useClassSessions } from '../hooks/api/useClassSessions';
import type { MyEnrollment } from '../lib/api/enrollments';
import { cn } from '../lib/utils';
import ClassFeed from '../components/ClassFeed';

/**
 * /my-classes — the student's side of the enrolment loop.
 *
 * Split by what each state actually means, rather than shown as one list:
 *   · Active     — classes you are in.
 *   · Waiting    — an invitation you have not answered, or a request the teacher has not
 *                  answered. Shown clearly as NOT membership, because it isn't.
 *   · Past       — left, removed, declined, rejected. Kept visible so nothing silently vanishes.
 *
 * Leaving is available on active classes and is deliberately immediate: consent is withdrawable
 * by the person who gave it, without asking the teacher.
 */

function Card({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn('rounded-2xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#141416]', className)}>
      {children}
    </div>
  );
}

function ClassRow({ e, action }: { e: MyEnrollment; action?: React.ReactNode }) {
  const c = e.class;
  const meta = c ? [c.subject, c.grade, c.board].filter(Boolean).join(' · ') : null;

  return (
    <div className="flex items-start gap-3 px-5 py-4 border-b border-slate-100 dark:border-white/[0.06] last:border-0">
      <span className="w-9 h-9 shrink-0 rounded-xl bg-slate-100 dark:bg-white/[0.08] flex items-center justify-center">
        <GraduationCap className="w-[17px] h-[17px] text-slate-600 dark:text-gray-300" strokeWidth={1.9} aria-hidden />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-[14.5px] font-semibold tracking-[-0.01em] truncate">
          {c?.title || <span className="text-slate-400 dark:text-gray-500">This class is no longer available</span>}
        </p>
        {meta && <p className="mt-0.5 text-[12.5px] text-slate-500 dark:text-gray-400">{meta}</p>}
        {c && (
          <div className="mt-1.5 flex flex-wrap items-center gap-3 text-[12px] text-slate-500 dark:text-gray-400">
            <span className="inline-flex items-center gap-1">
              <IndianRupee className="w-3 h-3" strokeWidth={2} aria-hidden />
              {c.pricing.type === 'free' ? 'Free' : `₹${c.pricing.amountINR.toLocaleString('en-IN')}`}
            </span>
            {c.startDate && (
              <span className="inline-flex items-center gap-1">
                <CalendarDays className="w-3 h-3" strokeWidth={2} aria-hidden />
                {c.startDate}
              </span>
            )}
            <span className="capitalize">{c.status}</span>
          </div>
        )}
      </div>
      {action}
    </div>
  );
}

/**
 * An active class's row, expandable to show attached resources.
 *
 * Fetches resources only when expanded, not eagerly for every active class on page load — a
 * student in several classes shouldn't pay for N requests to see a page they may not open. The
 * server enforces the same "ACTIVE member only" visibility this page's own routing already
 * implies, so there is nothing extra to check client-side before rendering the fetched list.
 */
function ActiveClassTests({ classId }: { classId: string }) {
  const navigate = useNavigate();
  const { data: assignments, isLoading, isError } = useClassAssignments(classId);
  const { start } = useClassAssignmentMutations(classId);
  const [error, setError] = useState<string | null>(null);
  const visible = (assignments ?? []).filter((a) => a.status === 'published' || a.status === 'closed');

  const begin = async (assignmentId: string) => {
    setError(null);
    try {
      const { quizAttemptId } = await start.mutateAsync(assignmentId);
      navigate(`/quiz/attempts/${quizAttemptId}`);
    } catch (e: any) {
      setError(e?.response?.data?.error ?? 'That test could not be started.');
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 text-[12.5px] text-slate-500 dark:text-gray-400 py-2">
        <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden /> Loading tests…
      </div>
    );
  }
  if (isError) return <p className="text-[12.5px] text-red-700 dark:text-red-400 py-2">Couldn&rsquo;t load tests.</p>;
  if (visible.length === 0) {
    return <p className="text-[12.5px] text-slate-500 dark:text-gray-400 py-2">No tests published yet.</p>;
  }

  return (
    <div className="space-y-1.5">
      {error && <p className="text-[12.5px] text-red-700 dark:text-red-400">{error}</p>}
      {visible.map((a) => (
        <div key={a.id} className="flex items-center gap-3 pl-12">
          <span className="text-[13px] font-medium text-slate-700 dark:text-gray-200 truncate">{a.title}</span>
          <span className="text-[11.5px] text-slate-400 dark:text-gray-500">{a.totalQuestions} Q · {a.durationMinutes} min</span>
          {a.status === 'closed' ? (
            <span className="ml-auto text-[11.5px] text-slate-400 dark:text-gray-500">Closed</span>
          ) : (
            <button
              onClick={() => begin(a.id)}
              disabled={start.isPending}
              className="ml-auto h-7 px-3 rounded-lg bg-slate-900 dark:bg-white text-white dark:text-slate-900 text-[11.5px] font-semibold disabled:opacity-60"
            >
              Start
            </button>
          )}
        </div>
      ))}
    </div>
  );
}

function ActiveClassSessions({ classId }: { classId: string }) {
  const { data: sessions, isLoading, isError } = useClassSessions(classId);
  const past = sessions?.filter((s) => s.status !== 'live') ?? [];

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 text-[12.5px] text-slate-500 dark:text-gray-400 py-2">
        <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden /> Loading sessions…
      </div>
    );
  }
  if (isError) return <p className="text-[12.5px] text-red-700 dark:text-red-400 py-2">Couldn&rsquo;t load sessions.</p>;
  if (past.length === 0) {
    return <p className="text-[12.5px] text-slate-500 dark:text-gray-400 py-2">No past sessions.</p>;
  }

  return (
    <div className="space-y-1.5 pl-12">
      {past.map((s) => (
        <div key={s.id} className="flex items-center gap-3 py-1">
          <span className="text-[13px] font-medium text-slate-700 dark:text-gray-200 truncate flex-1">{s.title}</span>
          <span className="text-[11.5px] text-slate-400 dark:text-gray-500 shrink-0">
            {s.startedAt ? new Date((s.startedAt as any)._seconds ? (s.startedAt as any)._seconds * 1000 : s.startedAt as string).toLocaleDateString() : ''}
          </span>
          {s.recordingRef && (
            <a
              href={s.recordingRef}
              target="_blank"
              rel="noopener noreferrer"
              className="ml-2 inline-flex items-center gap-1.5 h-7 px-3 rounded-lg bg-indigo-50 dark:bg-indigo-500/10 text-indigo-700 dark:text-indigo-400 text-[11.5px] font-semibold hover:bg-indigo-100 dark:hover:bg-indigo-500/20 transition-colors shrink-0"
            >
              <Radio className="w-3 h-3" aria-hidden />
              Watch
            </a>
          )}
        </div>
      ))}
    </div>
  );
}

/**
 * A quiet "is this class live right now" check, always on (not behind an accordion like the
 * others) — a live indicator that only shows up when clicked defeats its own purpose. Renders
 * nothing when there's no live session, so a student in several quiet classes sees no clutter.
 */
function LiveJoinButton({ classId }: { classId: string }) {
  const { data: sessions } = useClassSessions(classId, true);
  const live = sessions?.find((s) => s.status === 'live');
  if (!live) return null;

  return (
    <Link
      to={`/classes/${classId}/sessions/${live.id}/join`}
      className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg bg-red-600 hover:bg-red-700 text-white text-[12.5px] font-semibold animate-pulse"
    >
      <Radio className="w-3.5 h-3.5" strokeWidth={2.5} aria-hidden />
      Live — Join
    </Link>
  );
}

function ActiveClassRow({ e, onLeave, leaving }: { e: MyEnrollment; onLeave: () => void; leaving: boolean }) {
  const [openResources, setOpenResources] = useState(false);
  const [openTests, setOpenTests] = useState(false);
  const [openDiscussion, setOpenDiscussion] = useState(false);
  const [openSessions, setOpenSessions] = useState(false);
  const { data: resources, isLoading, isError } = useClassResources(e.classId, openResources);

  return (
    <div className="border-b border-slate-100 dark:border-white/[0.06] last:border-0">
      <ClassRow
        e={e}
        action={
          <div className="flex items-center gap-1.5 shrink-0">
            <LiveJoinButton classId={e.classId} />
            <button
              onClick={() => setOpenTests((v) => !v)}
              aria-expanded={openTests}
              className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg border border-slate-200 dark:border-white/12 text-[12.5px] font-medium hover:bg-slate-50 dark:hover:bg-white/[0.05] transition-colors"
            >
              <ClipboardCheck className="w-3.5 h-3.5" strokeWidth={2} aria-hidden />
              Tests
              <ChevronDown className={cn('w-3.5 h-3.5 transition-transform', openTests && 'rotate-180')} strokeWidth={2} aria-hidden />
            </button>
            <button
              onClick={() => setOpenResources((v) => !v)}
              aria-expanded={openResources}
              className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg border border-slate-200 dark:border-white/12 text-[12.5px] font-medium hover:bg-slate-50 dark:hover:bg-white/[0.05] transition-colors"
            >
              <NotebookPen className="w-3.5 h-3.5" strokeWidth={2} aria-hidden />
              Resources
              <ChevronDown className={cn('w-3.5 h-3.5 transition-transform', openResources && 'rotate-180')} strokeWidth={2} aria-hidden />
            </button>
            <button
              onClick={() => setOpenDiscussion((v) => !v)}
              aria-expanded={openDiscussion}
              className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg border border-slate-200 dark:border-white/12 text-[12.5px] font-medium hover:bg-slate-50 dark:hover:bg-white/[0.05] transition-colors"
            >
              <MessageCircle className="w-3.5 h-3.5" strokeWidth={2} aria-hidden />
              Discussion
              <ChevronDown className={cn('w-3.5 h-3.5 transition-transform', openDiscussion && 'rotate-180')} strokeWidth={2} aria-hidden />
            </button>
            <button
              onClick={() => setOpenSessions((v) => !v)}
              aria-expanded={openSessions}
              className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg border border-slate-200 dark:border-white/12 text-[12.5px] font-medium hover:bg-slate-50 dark:hover:bg-white/[0.05] transition-colors"
            >
              <History className="w-3.5 h-3.5" strokeWidth={2} aria-hidden />
              Recordings
              <ChevronDown className={cn('w-3.5 h-3.5 transition-transform', openSessions && 'rotate-180')} strokeWidth={2} aria-hidden />
            </button>
            <button
              onClick={onLeave}
              disabled={leaving}
              className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg border border-slate-200 dark:border-white/12 text-[12.5px] font-medium text-slate-600 dark:text-gray-300 hover:text-red-600 dark:hover:text-red-400 disabled:opacity-60"
            >
              <LogOut className="w-3.5 h-3.5" strokeWidth={2} aria-hidden />
              Leave
            </button>
          </div>
        }
      />
      {openTests && (
        <div className="px-5 pb-4 -mt-1">
          <ActiveClassTests classId={e.classId} />
        </div>
      )}
      {openSessions && (
        <div className="px-5 pb-4 -mt-1">
          <ActiveClassSessions classId={e.classId} />
        </div>
      )}
      {openResources && (
        <div className="px-5 pb-4 -mt-1">
          {isLoading && (
            <div className="flex items-center gap-2 text-[12.5px] text-slate-500 dark:text-gray-400 py-2">
              <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden /> Loading resources…
            </div>
          )}
          {isError && (
            <p className="text-[12.5px] text-red-700 dark:text-red-400 py-2">Couldn&rsquo;t load resources.</p>
          )}
          {!isLoading && !isError && resources?.length === 0 && (
            <p className="text-[12.5px] text-slate-500 dark:text-gray-400 py-2">
              Your teacher hasn&rsquo;t added any resources to this class yet.
            </p>
          )}
          {!!resources?.length && (
            <ul className="space-y-1 pl-12">
              {resources.map((r) => (
                <li key={r.id}>
                  <a
                    href={`/notebooks?open=${encodeURIComponent(r.notebookId)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 text-[13px] font-medium text-slate-700 dark:text-gray-200 hover:text-slate-900 dark:hover:text-white transition-colors"
                  >
                    {r.title}
                    <ExternalLink className="w-3 h-3 text-slate-400 dark:text-gray-500" strokeWidth={2} aria-hidden />
                  </a>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
      {openDiscussion && (
        <div className="px-5 pb-4 -mt-1">
          <ClassFeed classId={e.classId} viewerRole="student" />
        </div>
      )}
    </div>
  );
}

export default function MyClasses() {
  const { data: enrollments, isLoading, isError } = useMyEnrollments();
  const { setState } = useEnrollmentMutations();
  const [error, setError] = useState<string | null>(null);

  const groups = useMemo(() => {
    const g = { active: [] as MyEnrollment[], waiting: [] as MyEnrollment[], past: [] as MyEnrollment[] };
    for (const e of enrollments ?? []) {
      if (e.state === 'ACTIVE') g.active.push(e);
      else if (e.state === 'INVITED' || e.state === 'REQUESTED') g.waiting.push(e);
      else g.past.push(e);
    }
    return g;
  }, [enrollments]);

  const act = async (e: MyEnrollment, state: 'ACTIVE' | 'DECLINED' | 'LEFT') => {
    setError(null);
    try {
      await setState.mutateAsync({ state, forClassId: e.classId });
    } catch (err: any) {
      setError(err?.response?.data?.error ?? 'That action could not be completed.');
    }
  };

  return (
    <div className="max-w-[900px] mx-auto px-5 sm:px-6 py-8 space-y-6">
      <header>
        <h1 className="text-[24px] sm:text-[28px] font-semibold tracking-[-0.03em]">My classes</h1>
        <p className="mt-1.5 text-[14px] text-slate-500 dark:text-gray-400">
          Classes you&rsquo;ve joined through a teacher&rsquo;s invitation.
        </p>
      </header>

      {error && (
        <div role="alert" className="rounded-2xl border border-red-500/30 bg-red-50 dark:bg-red-500/[0.07] p-4 text-[13.5px] text-red-800 dark:text-red-300">
          {error}
        </div>
      )}

      {isLoading && (
        <div className="flex items-center gap-2.5 text-[13.5px] text-slate-500 dark:text-gray-400 py-6">
          <Loader2 className="w-4 h-4 animate-spin" aria-hidden />
          Loading…
        </div>
      )}

      {isError && (
        <Card className="p-5 border-red-500/30">
          <p className="text-[13.5px] text-red-800 dark:text-red-300">We couldn&rsquo;t load your classes.</p>
        </Card>
      )}

      {!isLoading && !isError && (enrollments?.length ?? 0) === 0 && (
        <div className="rounded-2xl border border-dashed border-slate-300 dark:border-white/12 p-10 text-center">
          <span className="inline-flex w-11 h-11 rounded-xl border border-slate-200 dark:border-white/10 items-center justify-center">
            <GraduationCap className="w-5 h-5 text-slate-500 dark:text-gray-400" strokeWidth={1.9} aria-hidden />
          </span>
          <h2 className="mt-4 text-[16px] font-semibold tracking-[-0.015em]">You&rsquo;re not in any classes</h2>
          <p className="mt-1.5 mx-auto max-w-sm text-[13.5px] leading-relaxed text-slate-500 dark:text-gray-400">
            If a teacher sends you an invitation link, opening it will bring you here. Everything
            else in Sadhya works without a class.
          </p>
          <Link to="/dashboard" className="mt-5 inline-flex items-center h-10 px-4 rounded-xl bg-slate-900 dark:bg-white text-white dark:text-slate-900 text-[13.5px] font-semibold">
            Back to learning
          </Link>
        </div>
      )}

      {groups.waiting.length > 0 && (
        <section>
          <h2 className="flex items-center gap-2 text-[12px] font-semibold uppercase tracking-[0.11em] text-slate-500 dark:text-gray-400 mb-3">
            <Clock className="w-3.5 h-3.5" strokeWidth={2} aria-hidden />
            Waiting
          </h2>
          <Card>
            <p className="px-5 pt-4 text-[12.5px] leading-relaxed text-slate-500 dark:text-gray-400">
              You are not in these classes yet — an invitation or request on its own gives nobody
              access to anything.
            </p>
            <div className="mt-2">
              {groups.waiting.map((e) => (
                <ClassRow
                  key={e.id}
                  e={e}
                  action={
                    e.state === 'INVITED' ? (
                      <div className="flex items-center gap-1.5 shrink-0">
                        <button
                          onClick={() => act(e, 'ACTIVE')}
                          disabled={setState.isPending}
                          className="h-8 px-3 rounded-lg bg-slate-900 dark:bg-white text-white dark:text-slate-900 text-[12.5px] font-semibold disabled:opacity-60"
                        >
                          Join
                        </button>
                        <button
                          onClick={() => act(e, 'DECLINED')}
                          disabled={setState.isPending}
                          className="h-8 px-3 rounded-lg border border-slate-200 dark:border-white/12 text-[12.5px] font-medium disabled:opacity-60"
                        >
                          Decline
                        </button>
                      </div>
                    ) : (
                      <span className="shrink-0 text-[12px] text-slate-500 dark:text-gray-400">
                        Awaiting teacher
                      </span>
                    )
                  }
                />
              ))}
            </div>
          </Card>
        </section>
      )}

      {groups.active.length > 0 && (
        <section>
          <h2 className="text-[12px] font-semibold uppercase tracking-[0.11em] text-slate-500 dark:text-gray-400 mb-3">
            Active ({groups.active.length})
          </h2>
          <Card>
            {groups.active.map((e) => (
              <ActiveClassRow key={e.id} e={e} onLeave={() => act(e, 'LEFT')} leaving={setState.isPending} />
            ))}
          </Card>
          <p className="mt-2.5 flex items-start gap-2 text-[12px] leading-relaxed text-slate-500 dark:text-gray-400">
            <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" strokeWidth={2} aria-hidden />
            Your teacher can see you on the roster of these classes. They cannot see your private
            notebooks, conversations, or anything outside the class.
          </p>
        </section>
      )}

      {groups.past.length > 0 && (
        <section>
          <h2 className="text-[12px] font-semibold uppercase tracking-[0.11em] text-slate-500 dark:text-gray-400 mb-3">
            Past
          </h2>
          <Card>{groups.past.map((e) => <ClassRow key={e.id} e={e} />)}</Card>
        </section>
      )}
    </div>
  );
}
