import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  ArrowLeft, ClipboardCheck, Plus, Loader2, AlertTriangle, Send, Lock,
  ChevronDown, Users, CheckCircle2, BarChart3,
} from 'lucide-react';
import { useClass } from '../../hooks/api/useClasses';
import { useClassAssignments, useClassAssignmentMutations, useAssignmentResults } from '../../hooks/api/useClassAssignments';
import type { AssignmentStatus, ClassAssignment } from '../../lib/api/classAssignments';
import { cn } from '../../lib/utils';

/**
 * /teach/classes/:id/assignments — create tests, publish them, watch results come in.
 *
 * Every assignment here uses the SAME AI quiz engine and scoring pipeline as a student's
 * self-serve practice test (see backend-firestore/src/types/classAssignment.ts) — the only new
 * thing this page does is generate the question set ONCE and let the teacher control when
 * students can see it, so a class average means something.
 */

const STATUS_STYLE: Record<AssignmentStatus, string> = {
  draft: 'border-slate-300/70 bg-slate-100 text-slate-600 dark:border-white/12 dark:bg-white/[0.06] dark:text-gray-300',
  published: 'border-[#c8e558] bg-[#c8e558]/15 text-[#5f7516] dark:text-[#c8e558]',
  closed: 'border-slate-200 bg-transparent text-slate-400 dark:border-white/10 dark:text-gray-500',
};

function Card({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn('rounded-2xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#141416]', className)}>
      {children}
    </div>
  );
}

function CreateForm({ classId, onDone }: { classId: string; onDone: () => void }) {
  const { create } = useClassAssignmentMutations(classId);
  const [title, setTitle] = useState('');
  const [topic, setTopic] = useState('');
  const [count, setCount] = useState(10);
  const [durationMinutes, setDurationMinutes] = useState(30);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setError(null);
    if (!topic.trim()) { setError('A topic is required — this is what the questions are generated on.'); return; }
    try {
      await create.mutateAsync({ title: title.trim() || undefined, topic: topic.trim(), count, durationMinutes });
      onDone();
    } catch (e: any) {
      setError(e?.response?.data?.error ?? 'We couldn’t generate that test. Please try again.');
    }
  };

  const inputCls = 'w-full h-10 px-3 rounded-lg border border-slate-200 dark:border-white/12 bg-white dark:bg-white/[0.04] text-[14px]';

  return (
    <div className="space-y-3">
      {error && <p className="text-[13px] text-red-700 dark:text-red-400">{error}</p>}
      <div>
        <label className="block mb-1.5 text-[12.5px] font-medium text-slate-600 dark:text-gray-300">
          Topic <span className="text-slate-400">(required — what the AI generates questions on)</span>
        </label>
        <input value={topic} onChange={(e) => setTopic(e.target.value)} placeholder="e.g. Newton's Laws of Motion" className={inputCls} maxLength={200} />
      </div>
      <div>
        <label className="block mb-1.5 text-[12.5px] font-medium text-slate-600 dark:text-gray-300">Title (optional)</label>
        <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Defaults to the topic" className={inputCls} maxLength={160} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block mb-1.5 text-[12.5px] font-medium text-slate-600 dark:text-gray-300">Questions</label>
          <input type="number" min={3} max={20} value={count} onChange={(e) => setCount(Number(e.target.value))} className={inputCls} />
        </div>
        <div>
          <label className="block mb-1.5 text-[12.5px] font-medium text-slate-600 dark:text-gray-300">Duration (minutes)</label>
          <input type="number" min={5} max={180} value={durationMinutes} onChange={(e) => setDurationMinutes(Number(e.target.value))} className={inputCls} />
        </div>
      </div>
      <p className="text-[12px] leading-relaxed text-slate-500 dark:text-gray-400">
        Every student sees the same {count} questions — that&rsquo;s what makes a class average
        meaningful. Generation takes a few seconds.
      </p>
      <div className="flex gap-2">
        <button
          onClick={submit}
          disabled={create.isPending}
          className="inline-flex items-center gap-2 h-10 px-4 rounded-xl bg-[#c8e558] hover:bg-[#bcd94c] text-slate-900 text-[13.5px] font-semibold disabled:opacity-60"
        >
          {create.isPending ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden /> : null}
          Generate test
        </button>
        <button onClick={onDone} className="h-10 px-4 rounded-xl border border-slate-200 dark:border-white/12 text-[13.5px] font-medium">
          Cancel
        </button>
      </div>
    </div>
  );
}

function ResultsPanel({ classId, assignment }: { classId: string; assignment: ClassAssignment }) {
  const { data: results, isLoading } = useAssignmentResults(classId, assignment.id, { poll: assignment.status === 'published' });

  if (isLoading) {
    return <div className="flex items-center gap-2 text-[12.5px] text-slate-500 dark:text-gray-400 py-3"><Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden /> Loading results…</div>;
  }
  if (!results) return null;

  return (
    <div className="pt-3 space-y-3">
      <div className="flex flex-wrap items-center gap-4 text-[13px]">
        <span className="inline-flex items-center gap-1.5"><Users className="w-3.5 h-3.5 text-slate-400" strokeWidth={2} aria-hidden /> {results.started} started</span>
        <span className="inline-flex items-center gap-1.5"><CheckCircle2 className="w-3.5 h-3.5 text-slate-400" strokeWidth={2} aria-hidden /> {results.completed} completed</span>
        {results.averageAccuracy != null && (
          <span className="inline-flex items-center gap-1.5"><BarChart3 className="w-3.5 h-3.5 text-slate-400" strokeWidth={2} aria-hidden /> {results.averageAccuracy}% class average</span>
        )}
      </div>

      {results.students.length === 0 ? (
        <p className="text-[12.5px] text-slate-500 dark:text-gray-400">No one has started yet.</p>
      ) : (
        <div className="rounded-xl border border-slate-100 dark:border-white/[0.06] overflow-hidden">
          {results.students.map((s) => (
            <div key={s.studentUid} className="flex items-center gap-3 px-3.5 py-2.5 border-b border-slate-100 dark:border-white/[0.06] last:border-0 text-[12.5px]">
              <span className="w-7 h-7 shrink-0 rounded-full bg-slate-100 dark:bg-white/[0.08] flex items-center justify-center text-[10.5px] font-semibold text-slate-600 dark:text-gray-300">
                {s.studentUid.slice(0, 2).toUpperCase()}
              </span>
              <span className="text-slate-600 dark:text-gray-300 truncate" title={s.studentUid}>{s.studentUid.slice(0, 10)}…</span>
              <span className="ml-auto text-slate-500 dark:text-gray-400">
                {s.status === 'completed' ? `${s.accuracy}% · ${s.score}/${s.maxMarks}` : 'In progress'}
              </span>
            </div>
          ))}
        </div>
      )}

      {results.topicAverages.length > 0 && (
        <div>
          <p className="text-[11.5px] font-semibold uppercase tracking-[0.08em] text-slate-500 dark:text-gray-400 mb-1.5">Weakest topics</p>
          <div className="flex flex-wrap gap-1.5">
            {results.topicAverages.slice(0, 5).map((t) => (
              <span key={t.topic} className="px-2 py-1 rounded-md bg-slate-100 dark:bg-white/[0.06] text-[11.5px] text-slate-600 dark:text-gray-300">
                {t.topic} — {t.averageAccuracy}%
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function AssignmentRow({ classId, a }: { classId: string; a: ClassAssignment }) {
  const [open, setOpen] = useState(false);
  const { setStatus } = useClassAssignmentMutations(classId);
  const [error, setError] = useState<string | null>(null);

  const act = async (status: 'published' | 'closed') => {
    setError(null);
    try { await setStatus.mutateAsync({ assignmentId: a.id, status }); }
    catch (e: any) { setError(e?.response?.data?.error ?? 'That action could not be completed.'); }
  };

  return (
    <div className="border-b border-slate-100 dark:border-white/[0.06] last:border-0">
      <button onClick={() => setOpen((v) => !v)} className="w-full flex items-center gap-3 px-5 py-3.5 text-left hover:bg-slate-50/60 dark:hover:bg-white/[0.02] transition-colors">
        <ClipboardCheck className="w-4 h-4 shrink-0 text-slate-500 dark:text-gray-400" strokeWidth={1.9} aria-hidden />
        <div className="min-w-0 flex-1">
          <p className="text-[13.5px] font-medium truncate">{a.title}</p>
          <p className="text-[11.5px] text-slate-500 dark:text-gray-400">{a.totalQuestions} questions · {a.durationMinutes} min</p>
        </div>
        <span className={cn('shrink-0 inline-flex items-center h-[22px] px-2 rounded-full border text-[11px] font-semibold capitalize', STATUS_STYLE[a.status])}>
          {a.status}
        </span>
        <ChevronDown className={cn('w-4 h-4 text-slate-400 transition-transform shrink-0', open && 'rotate-180')} aria-hidden />
      </button>

      {open && (
        <div className="px-5 pb-4">
          {error && <p className="text-[12.5px] text-red-700 dark:text-red-400 mb-2">{error}</p>}
          <div className="flex gap-2 mb-2">
            {a.status === 'draft' && (
              <button onClick={() => act('published')} disabled={setStatus.isPending} className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg bg-slate-900 dark:bg-white text-white dark:text-slate-900 text-[12.5px] font-semibold disabled:opacity-60">
                <Send className="w-3.5 h-3.5" strokeWidth={2} aria-hidden /> Publish
              </button>
            )}
            {a.status === 'published' && (
              <button onClick={() => act('closed')} disabled={setStatus.isPending} className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg border border-slate-200 dark:border-white/12 text-[12.5px] font-medium disabled:opacity-60">
                <Lock className="w-3.5 h-3.5" strokeWidth={2} aria-hidden /> Close to new attempts
              </button>
            )}
          </div>

          {a.status === 'draft' ? (
            <p className="text-[12.5px] text-slate-500 dark:text-gray-400">
              Only you can see this. Publish it once you&rsquo;re happy with the topic and length.
            </p>
          ) : (
            <ResultsPanel classId={classId} assignment={a} />
          )}
        </div>
      )}
    </div>
  );
}

export default function TeacherClassAssignments() {
  const { id } = useParams<{ id: string }>();
  const { data: record } = useClass(id);
  const { data: assignments, isLoading, isError } = useClassAssignments(id);
  const [creating, setCreating] = useState(false);

  return (
    <div className="space-y-6">
      <div>
        <Link to={`/teach/classes/${id}`} className="inline-flex items-center gap-1.5 text-[13px] font-medium text-slate-500 dark:text-gray-400 hover:text-slate-900 dark:hover:text-white transition-colors">
          <ArrowLeft className="w-3.5 h-3.5" strokeWidth={2} aria-hidden />
          {record?.title || 'Class'}
        </Link>
        <h1 className="mt-3 text-[24px] sm:text-[28px] font-semibold tracking-[-0.03em]">Tests</h1>
        <p className="mt-1.5 text-[14px] text-slate-500 dark:text-gray-400">
          Generate a test once, publish it, and every student answers the same questions.
        </p>
      </div>

      <Card className="p-5 sm:p-6">
        {creating ? (
          <CreateForm classId={id as string} onDone={() => setCreating(false)} />
        ) : (
          <button onClick={() => setCreating(true)} className="inline-flex items-center gap-2 h-10 px-4 rounded-xl bg-[#c8e558] hover:bg-[#bcd94c] text-slate-900 text-[13.5px] font-semibold transition-colors">
            <Plus className="w-4 h-4" strokeWidth={2.5} aria-hidden />
            New test
          </button>
        )}
      </Card>

      {isLoading && <div className="flex items-center gap-2.5 text-[13.5px] text-slate-500 dark:text-gray-400 py-6"><Loader2 className="w-4 h-4 animate-spin" aria-hidden /> Loading tests…</div>}
      {isError && <Card className="p-5 border-red-500/30"><p className="text-[13.5px] text-red-800 dark:text-red-300">We couldn&rsquo;t load this class&rsquo;s tests.</p></Card>}
      {!isLoading && !isError && assignments?.length === 0 && (
        <div className="rounded-2xl border border-dashed border-slate-300 dark:border-white/12 p-8 text-center">
          <p className="text-[13.5px] text-slate-500 dark:text-gray-400">No tests yet.</p>
        </div>
      )}
      {!!assignments?.length && (
        <Card>{assignments.map((a) => <AssignmentRow key={a.id} classId={id as string} a={a} />)}</Card>
      )}

      <div className="flex items-start gap-2.5 rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-white/[0.03] p-3.5">
        <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0 text-slate-500 dark:text-gray-400" strokeWidth={2} aria-hidden />
        <p className="text-[12px] leading-relaxed text-slate-500 dark:text-gray-400">
          Results only ever include students currently active in this class — someone who leaves
          after taking a test drops out of these numbers immediately.
        </p>
      </div>
    </div>
  );
}
