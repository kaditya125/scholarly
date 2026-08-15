import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Video, Loader2, Radio, History } from 'lucide-react';
import { useClass } from '../../hooks/api/useClasses';
import { useClassSessions, useClassSessionMutations } from '../../hooks/api/useClassSessions';
import { cn } from '../../lib/utils';

/** /teach/classes/:id/live — start (or rejoin) a live session for this class. */

function Card({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn('rounded-2xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#141416]', className)}>
      {children}
    </div>
  );
}

function formatDate(value: unknown): string {
  let date: Date | null = null;
  if (typeof value === 'string' || typeof value === 'number') date = new Date(value);
  else if (value && typeof value === 'object' && '_seconds' in (value as any)) date = new Date((value as any)._seconds * 1000);
  if (!date || Number.isNaN(date.getTime())) return '';
  return date.toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

export default function TeacherClassLive() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data: record } = useClass(id);
  const { data: sessions, isLoading } = useClassSessions(id);
  const { goLive } = useClassSessionMutations(id as string);
  const [error, setError] = useState<string | null>(null);

  const live = sessions?.find((s) => s.status === 'live');
  const past = sessions?.filter((s) => s.status !== 'live') ?? [];

  const start = async () => {
    setError(null);
    try {
      const session = await goLive.mutateAsync(undefined);
      navigate(`/classes/${id}/sessions/${session.id}/join`);
    } catch (e: any) {
      setError(e?.response?.data?.error ?? 'Could not start the session.');
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <Link to={`/teach/classes/${id}`} className="inline-flex items-center gap-1.5 text-[13px] font-medium text-slate-500 dark:text-gray-400 hover:text-slate-900 dark:hover:text-white transition-colors">
          <ArrowLeft className="w-3.5 h-3.5" strokeWidth={2} aria-hidden />
          {record?.title || 'Class'}
        </Link>
        <h1 className="mt-3 text-[24px] sm:text-[28px] font-semibold tracking-[-0.03em]">Live class</h1>
        <p className="mt-1.5 text-[14px] text-slate-500 dark:text-gray-400">
          Start a video session — students who are ACTIVE in this class can join while it&rsquo;s live.
        </p>
      </div>

      {error && (
        <div role="alert" className="rounded-2xl border border-red-500/30 bg-red-50 dark:bg-red-500/[0.07] p-4 text-[13.5px] text-red-800 dark:text-red-300">
          {error}
        </div>
      )}

      <Card className="p-6 text-center">
        {live ? (
          <>
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-red-50 dark:bg-red-500/10 text-red-700 dark:text-red-400 text-[11.5px] font-semibold uppercase tracking-[0.06em]">
              <Radio className="w-3 h-3" strokeWidth={2.5} aria-hidden />
              Live now
            </span>
            <p className="mt-3 text-[14px] text-slate-600 dark:text-gray-300">{live.title}</p>
            <Link
              to={`/classes/${id}/sessions/${live.id}/join`}
              className="mt-5 inline-flex items-center gap-2 h-11 px-6 rounded-xl bg-slate-900 dark:bg-white text-white dark:text-slate-900 text-[14px] font-semibold"
            >
              <Video className="w-4 h-4" strokeWidth={2} aria-hidden />
              Rejoin session
            </Link>
          </>
        ) : (
          <>
            <span className="inline-flex w-12 h-12 rounded-xl bg-slate-100 dark:bg-white/[0.06] items-center justify-center">
              <Video className="w-5 h-5 text-slate-500 dark:text-gray-400" strokeWidth={1.9} aria-hidden />
            </span>
            <p className="mt-3 text-[14px] text-slate-500 dark:text-gray-400">No live session right now.</p>
            <button
              onClick={start}
              disabled={goLive.isPending}
              className="mt-5 inline-flex items-center gap-2 h-11 px-6 rounded-xl bg-[#c8e558] hover:bg-[#bcd94c] text-slate-900 text-[14px] font-semibold disabled:opacity-60"
            >
              {goLive.isPending ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden /> : <Video className="w-4 h-4" strokeWidth={2} aria-hidden />}
              Go live
            </button>
          </>
        )}
      </Card>

      <section>
        <h2 className="flex items-center gap-2 text-[12px] font-semibold uppercase tracking-[0.11em] text-slate-500 dark:text-gray-400 mb-3">
          <History className="w-3.5 h-3.5" strokeWidth={2} aria-hidden />
          Past sessions
        </h2>
        {isLoading ? (
          <div className="flex items-center gap-2 text-[12.5px] text-slate-500 dark:text-gray-400 py-2">
            <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden /> Loading…
          </div>
        ) : past.length === 0 ? (
          <p className="text-[12.5px] text-slate-500 dark:text-gray-400">No past sessions yet.</p>
        ) : (
          <Card>
            {past.map((s) => (
              <div key={s.id} className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-5 py-3.5 border-b border-slate-100 dark:border-white/[0.06] last:border-0">
                <div className="flex flex-col min-w-0 flex-1">
                  <span className="text-[13.5px] font-medium truncate">{s.title}</span>
                  <span className="text-[11.5px] text-slate-500 dark:text-gray-400 mt-0.5">{formatDate(s.startedAt)}</span>
                </div>
                {s.recordingRef && (
                  <a
                    href={s.recordingRef}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-50 dark:bg-indigo-500/10 text-indigo-700 dark:text-indigo-400 hover:bg-indigo-100 dark:hover:bg-indigo-500/20 text-[12px] font-medium transition-colors shrink-0"
                  >
                    <Video className="w-3.5 h-3.5" aria-hidden />
                    Watch Recording
                  </a>
                )}
              </div>
            ))}
          </Card>
        )}
      </section>
    </div>
  );
}
