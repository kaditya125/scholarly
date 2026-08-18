import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  ArrowLeft, NotebookPen, Plus, Trash2, Loader2, AlertTriangle, ExternalLink,
} from 'lucide-react';
import { useClass } from '../../hooks/api/useClasses';
import { useClassResources, useClassResourceMutations } from '../../hooks/api/useClassResources';
import { notebooksApi } from '../../lib/api/notebooks';
import { useAuth } from '../../lib/AuthContext';
import { useQuery } from '@tanstack/react-query';
import type { ResourceProvenanceSource } from '../../lib/api/classResources';
import { cn } from '../../lib/utils';

/**
 * /teach/classes/:id/resources
 *
 * A resource IS a notebook — attaching one here does not upload or generate anything new. The
 * picker below lists the teacher's own notebooks (built and populated already, elsewhere in the
 * app) and lets them attach one to this class. Opening an attached resource goes straight to the
 * real /notebooks/:id experience — there is no separate "resource viewer" to build or maintain.
 */

const SOURCE_LABEL: Record<ResourceProvenanceSource, string> = {
  teacher_authored: 'Written by me',
  teacher_uploaded: 'Uploaded by me',
  platform_generated: 'AI-generated',
  licensed: 'Licensed material',
};

function Card({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn('rounded-2xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#141416]', className)}>
      {children}
    </div>
  );
}

export default function TeacherClassResources() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const { data: record } = useClass(id);
  const { data: resources, isLoading, isError } = useClassResources(id);
  const { attach, detach } = useClassResourceMutations(id as string);

  const [picking, setPicking] = useState(false);
  const [source, setSource] = useState<ResourceProvenanceSource>('teacher_authored');
  const [error, setError] = useState<string | null>(null);

  // The teacher's own notebooks only — attach() requires strict ownership server-side, so
  // filtering here avoids sending a picker full of notebooks that would just 409.
  const { data: myNotebooks, isLoading: notebooksLoading } = useQuery({
    queryKey: ['my-notebooks-for-attach'],
    queryFn: () => notebooksApi.getNotebooks(),
    enabled: picking,
  });
  const ownedNotebooks = (myNotebooks ?? []).filter((n) => (n.owner ?? n.userId) === user?.uid);
  const attachedIds = new Set((resources ?? []).map((r) => r.notebookId));
  const pickable = ownedNotebooks.filter((n) => !attachedIds.has(n.id));

  const handleAttach = async (notebookId: string, title: string) => {
    setError(null);
    try {
      await attach.mutateAsync({ notebookId, title, source });
      setPicking(false);
    } catch (e: any) {
      setError(e?.response?.data?.error ?? 'We couldn’t attach that notebook.');
    }
  };

  const handleDetach = async (resourceId: string) => {
    setError(null);
    try {
      await detach.mutateAsync(resourceId);
    } catch (e: any) {
      setError(e?.response?.data?.error ?? 'We couldn’t remove that resource.');
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <Link to={`/teach/classes/${id}`} className="inline-flex items-center gap-1.5 text-[13px] font-medium text-slate-500 dark:text-gray-400 hover:text-slate-900 dark:hover:text-white transition-colors">
          <ArrowLeft className="w-3.5 h-3.5" strokeWidth={2} aria-hidden />
          {record?.title || 'Class'}
        </Link>
        <h1 className="mt-3 text-[24px] sm:text-[28px] font-semibold tracking-[-0.03em]">Resources</h1>
        <p className="mt-1.5 text-[14px] text-slate-500 dark:text-gray-400">
          Attach a notebook to this class. Everyone currently active in the class gets access
          immediately, and anyone who joins later gets it the moment they do.
        </p>
      </div>

      {error && (
        <div role="alert" className="rounded-2xl border border-red-500/30 bg-red-50 dark:bg-red-500/[0.07] p-4 text-[13.5px] text-red-800 dark:text-red-300">
          {error}
        </div>
      )}

      {/* ── Attach ─────────────────────────────────────────────────────── */}
      <Card className="p-5 sm:p-6">
        {!picking ? (
          <button
            onClick={() => setPicking(true)}
            className="inline-flex items-center gap-2 h-10 px-4 rounded-xl bg-[#c8e558] hover:bg-[#bcd94c] text-slate-900 text-[13.5px] font-semibold transition-colors"
          >
            <Plus className="w-4 h-4" strokeWidth={2.5} aria-hidden />
            Attach a notebook
          </button>
        ) : (
          <div>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-[14px] font-semibold">Choose one of your notebooks</h2>
              <button onClick={() => setPicking(false)} className="text-[12.5px] text-slate-500 dark:text-gray-400 hover:text-slate-900 dark:hover:text-white">
                Cancel
              </button>
            </div>

            <div className="mb-4">
              <span className="block mb-1.5 text-[12.5px] font-medium text-slate-600 dark:text-gray-300">
                How should this be described to students?
              </span>
              <select
                value={source}
                onChange={(e) => setSource(e.target.value as ResourceProvenanceSource)}
                className="h-9 px-3 rounded-lg border border-slate-200 dark:border-white/12 bg-white dark:bg-white/[0.04] text-[13.5px]"
              >
                {Object.entries(SOURCE_LABEL).map(([v, label]) => <option key={v} value={v}>{label}</option>)}
              </select>
              <p className="mt-1.5 text-[11.5px] text-slate-500 dark:text-gray-400">
                This is your own description — Sadhya doesn&rsquo;t verify it.
              </p>
            </div>

            {notebooksLoading ? (
              <div className="flex items-center gap-2 text-[13px] text-slate-500 dark:text-gray-400 py-4">
                <Loader2 className="w-4 h-4 animate-spin" aria-hidden /> Loading your notebooks…
              </div>
            ) : pickable.length === 0 ? (
              <p className="text-[13px] text-slate-500 dark:text-gray-400 py-2">
                {ownedNotebooks.length === 0
                  ? 'You don’t have any notebooks yet — create one first.'
                  : 'Every notebook you own is already attached to this class.'}
              </p>
            ) : (
              <ul className="space-y-1.5">
                {pickable.map((n) => (
                  <li key={n.id}>
                    <button
                      onClick={() => handleAttach(n.id, n.title)}
                      disabled={attach.isPending}
                      className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg border border-slate-200 dark:border-white/10 hover:bg-slate-50 dark:hover:bg-white/[0.05] text-left transition-colors disabled:opacity-60"
                    >
                      <NotebookPen className="w-4 h-4 shrink-0 text-slate-500 dark:text-gray-400" strokeWidth={1.9} aria-hidden />
                      <span className="text-[13.5px] font-medium truncate">{n.title}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </Card>

      {/* ── Attached resources ─────────────────────────────────────────── */}
      {isLoading && (
        <div className="flex items-center gap-2.5 text-[13.5px] text-slate-500 dark:text-gray-400 py-6">
          <Loader2 className="w-4 h-4 animate-spin" aria-hidden /> Loading resources…
        </div>
      )}
      {isError && (
        <Card className="p-5 border-red-500/30">
          <p className="text-[13.5px] text-red-800 dark:text-red-300">We couldn&rsquo;t load this class&rsquo;s resources.</p>
        </Card>
      )}
      {!isLoading && !isError && resources?.length === 0 && (
        <div className="rounded-2xl border border-dashed border-slate-300 dark:border-white/12 p-8 text-center">
          <p className="text-[13.5px] text-slate-500 dark:text-gray-400">No resources attached yet.</p>
        </div>
      )}
      {!!resources?.length && (
        <Card>
          {resources.map((r) => (
            <div key={r.id} className="flex items-center gap-3 px-5 py-3.5 border-b border-slate-100 dark:border-white/[0.06] last:border-0">
              <NotebookPen className="w-4 h-4 shrink-0 text-slate-500 dark:text-gray-400" strokeWidth={1.9} aria-hidden />
              <div className="min-w-0 flex-1">
                <p className="text-[13.5px] font-medium truncate">{r.title}</p>
                <p className="text-[11.5px] text-slate-500 dark:text-gray-400">{SOURCE_LABEL[r.provenance.source]}</p>
              </div>
              {/* /notebooks has no per-notebook route of its own — selection lives in that
                  page's component state, opened here via the ?open= param it now reads. */}
              <a
                href={`/notebooks?open=${encodeURIComponent(r.notebookId)}`}
                target="_blank"
                rel="noopener noreferrer"
                className="shrink-0 inline-flex items-center gap-1.5 h-8 px-3 rounded-lg border border-slate-200 dark:border-white/12 text-[12.5px] font-medium hover:bg-slate-50 dark:hover:bg-white/[0.05] transition-colors"
              >
                Open
                <ExternalLink className="w-3 h-3" strokeWidth={2} aria-hidden />
              </a>
              <button
                onClick={() => handleDetach(r.id)}
                disabled={detach.isPending}
                className="shrink-0 inline-flex items-center gap-1.5 h-8 px-3 rounded-lg border border-slate-200 dark:border-white/12 text-[12.5px] font-medium text-slate-600 dark:text-gray-300 hover:text-red-600 dark:hover:text-red-400 disabled:opacity-60"
              >
                <Trash2 className="w-3.5 h-3.5" strokeWidth={2} aria-hidden />
              </button>
            </div>
          ))}
        </Card>
      )}

      <div className="flex items-start gap-2.5 rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-white/[0.03] p-3.5">
        <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0 text-slate-500 dark:text-gray-400" strokeWidth={2} aria-hidden />
        <p className="text-[12px] leading-relaxed text-slate-500 dark:text-gray-400">
          Removing a resource here only removes it from this class — the notebook itself, and
          anything in it, stays exactly where it was.
        </p>
      </div>
    </div>
  );
}
