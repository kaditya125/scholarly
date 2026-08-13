import { useEffect, useState } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import {
  ArrowLeft, Plus, Trash2, Loader2, Check, AlertTriangle, Lock, Send, Archive, Users, NotebookPen, ClipboardCheck,
} from 'lucide-react';
import { useClass, useClassMutations } from '../../hooks/api/useClasses';
import { BOARDS, SUBJECTS, LANGUAGES, GOALS } from '../../lib/onboardingOptions';
import type { ClassMode, ClassStatus, ClassUpdate, SyllabusTopic } from '../../lib/api/classes';
import { cn } from '../../lib/utils';

/**
 * /teach/classes/new and /teach/classes/:id — create and edit a class.
 *
 * One component for both, because the only difference is whether a record exists yet: create
 * POSTs a draft then redirects into edit mode, so there is exactly one form to maintain rather
 * than two that drift.
 *
 * Two server rules are surfaced rather than hidden:
 *   · Pricing is editable only while the class is a draft. Afterwards the inputs are replaced by
 *     a read-only row explaining why, instead of failing on save with a 409.
 *   · Publishing runs completeness checks server-side and returns every problem at once (422).
 *     Those are rendered as a checklist — the client does not duplicate the validation, because
 *     two copies of a rule are two chances to disagree.
 *
 * Pricing is captured but inert platform-wide: no purchase flow exists yet. The form says so
 * where a teacher will look for it, so nobody publishes a paid class expecting to be paid.
 */

/** Mirrors CLASSES_TAUGHT in the teacher onboarding wizard. */
const GRADES = ['Class 6', 'Class 7', 'Class 8', 'Class 9', 'Class 10', 'Class 11', 'Class 12', 'Undergraduate', 'Competitive'];
const MODES: { value: ClassMode; label: string }[] = [
  { value: 'online', label: 'Online' },
  { value: 'offline', label: 'In person' },
  { value: 'hybrid', label: 'Hybrid' },
];
const DAYS = [
  { value: 'mon', label: 'Mon' }, { value: 'tue', label: 'Tue' }, { value: 'wed', label: 'Wed' },
  { value: 'thu', label: 'Thu' }, { value: 'fri', label: 'Fri' }, { value: 'sat', label: 'Sat' },
  { value: 'sun', label: 'Sun' },
];

interface Draft {
  title: string;
  description: string;
  subject: string;
  grade: string;
  board: string;
  exam: string;
  language: string;
  mode: ClassMode;
  startDate: string;
  endDate: string;
  days: string[];
  startTime: string;
  endTime: string;
  capacity: string;
  pricingType: 'free' | 'paid';
  amountINR: string;
  syllabus: SyllabusTopic[];
}

const EMPTY: Draft = {
  title: '', description: '', subject: '', grade: '', board: '', exam: '', language: '',
  mode: 'online', startDate: '', endDate: '', days: [], startTime: '', endTime: '',
  capacity: '', pricingType: 'free', amountINR: '', syllabus: [],
};

/* ── Field primitives ──────────────────────────────────────────────────────────────── */

const inputCls =
  'w-full h-10 px-3 rounded-lg border border-slate-200 dark:border-white/12 bg-white dark:bg-white/[0.04] text-[14px] text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-slate-400 disabled:opacity-60';

function Field({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
  return (
    <label className="block">
      <span className="block mb-1.5 text-[12.5px] font-medium text-slate-600 dark:text-gray-300">{label}</span>
      {children}
      {hint && <span className="block mt-1 text-[11.5px] text-slate-500 dark:text-gray-400">{hint}</span>}
    </label>
  );
}

function Select({ value, onChange, options, placeholder, disabled }: {
  value: string; onChange: (v: string) => void; options: string[]; placeholder: string; disabled?: boolean;
}) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} disabled={disabled} className={inputCls}>
      <option value="">{placeholder}</option>
      {options.map((o) => <option key={o} value={o}>{o}</option>)}
    </select>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#141416] p-5 sm:p-6">
      <h2 className="text-[12px] font-semibold uppercase tracking-[0.11em] text-slate-500 dark:text-gray-400 mb-4">
        {title}
      </h2>
      {children}
    </section>
  );
}

/* ── Page ──────────────────────────────────────────────────────────────────────────── */

export default function TeacherClassEditor() {
  const { id } = useParams<{ id: string }>();
  const isNew = !id || id === 'new';
  const navigate = useNavigate();

  const { data: record, isLoading } = useClass(isNew ? undefined : id);
  const { create, update, setStatus } = useClassMutations();

  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [publishProblems, setPublishProblems] = useState<string[]>([]);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  // Seed the form once the record arrives.
  useEffect(() => {
    if (!record) return;
    setDraft({
      title: record.title ?? '',
      description: record.description ?? '',
      subject: record.subject ?? '',
      grade: record.grade ?? '',
      board: record.board ?? '',
      exam: record.exam ?? '',
      language: record.language ?? '',
      mode: record.mode ?? 'online',
      startDate: record.startDate ?? '',
      endDate: record.endDate ?? '',
      days: record.schedule?.days ?? [],
      startTime: record.schedule?.startTime ?? '',
      endTime: record.schedule?.endTime ?? '',
      capacity: record.capacity != null ? String(record.capacity) : '',
      pricingType: record.pricing?.type ?? 'free',
      amountINR: record.pricing?.amountINR ? String(record.pricing.amountINR) : '',
      syllabus: record.syllabus ?? [],
    });
  }, [record]);

  const status: ClassStatus = record?.status ?? 'draft';
  const isDraft = status === 'draft';
  const isArchived = status === 'archived';
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setDraft((d) => ({ ...d, [k]: v }));

  /** Builds the payload. Pricing is omitted once the class has left draft — the server rejects it. */
  const toPayload = (): ClassUpdate => {
    const payload: ClassUpdate = {
      title: draft.title,
      description: draft.description || null,
      subject: draft.subject || null,
      grade: draft.grade || null,
      board: draft.board || null,
      exam: draft.exam || null,
      language: draft.language || null,
      mode: draft.mode,
      startDate: draft.startDate || null,
      endDate: draft.endDate || null,
      schedule: draft.days.length || draft.startTime || draft.endTime
        ? { days: draft.days, startTime: draft.startTime || null, endTime: draft.endTime || null }
        : null,
      capacity: draft.capacity ? Number(draft.capacity) : null,
      syllabus: draft.syllabus.map((t) => ({ id: t.id, title: t.title, status: t.status })),
    };
    if (isNew || isDraft) {
      payload.pricing = draft.pricingType === 'paid'
        ? { type: 'paid', amountINR: Number(draft.amountINR || 0) }
        : { type: 'free' };
    }
    return payload;
  };

  const handleSave = async () => {
    setSaveError(null);
    setPublishProblems([]);
    try {
      if (isNew) {
        const created = await create.mutateAsync(toPayload());
        navigate(`/teach/classes/${created.id}`, { replace: true });
      } else {
        await update.mutateAsync({ id: id as string, patch: toPayload() });
        setSavedAt(Date.now());
      }
    } catch (e: any) {
      setSaveError(e?.response?.data?.error ?? 'We couldn’t save those changes.');
    }
  };

  const handleStatus = async (next: ClassStatus) => {
    setSaveError(null);
    setPublishProblems([]);
    try {
      await setStatus.mutateAsync({ id: id as string, status: next });
    } catch (e: any) {
      const data = e?.response?.data;
      if (Array.isArray(data?.problems) && data.problems.length) setPublishProblems(data.problems);
      else setSaveError(data?.error ?? 'We couldn’t update the class status.');
    }
  };

  const busy = create.isPending || update.isPending || setStatus.isPending;

  if (!isNew && isLoading) {
    return (
      <div className="flex items-center gap-2.5 text-[13.5px] text-slate-500 dark:text-gray-400 py-10">
        <Loader2 className="w-4 h-4 animate-spin" aria-hidden />
        Loading class…
      </div>
    );
  }

  return (
    <div className="space-y-5 pb-24">
      <div>
        <Link to="/teach/classes" className="inline-flex items-center gap-1.5 text-[13px] font-medium text-slate-500 dark:text-gray-400 hover:text-slate-900 dark:hover:text-white transition-colors">
          <ArrowLeft className="w-3.5 h-3.5" strokeWidth={2} aria-hidden />
          Classes
        </Link>
        <h1 className="mt-3 text-[24px] sm:text-[28px] font-semibold tracking-[-0.03em]">
          {isNew ? 'New class' : draft.title || 'Untitled class'}
        </h1>
        {!isNew && (
          <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1">
            <p className="text-[13.5px] text-slate-500 dark:text-gray-400">
              Status: <span className="font-medium text-slate-700 dark:text-gray-200">{status}</span>
              {isArchived && ' — archived classes are read-only.'}
            </p>
            <Link
              to={`/teach/classes/${id}/students`}
              className="inline-flex items-center gap-1.5 text-[13.5px] font-semibold text-slate-900 dark:text-white underline underline-offset-2"
            >
              <Users className="w-3.5 h-3.5" strokeWidth={2} aria-hidden />
              Students
            </Link>
            <Link
              to={`/teach/classes/${id}/resources`}
              className="inline-flex items-center gap-1.5 text-[13.5px] font-semibold text-slate-900 dark:text-white underline underline-offset-2"
            >
              <NotebookPen className="w-3.5 h-3.5" strokeWidth={2} aria-hidden />
              Resources
            </Link>
            <Link
              to={`/teach/classes/${id}/assignments`}
              className="inline-flex items-center gap-1.5 text-[13.5px] font-semibold text-slate-900 dark:text-white underline underline-offset-2"
            >
              <ClipboardCheck className="w-3.5 h-3.5" strokeWidth={2} aria-hidden />
              Tests
            </Link>
          </div>
        )}
      </div>

      {publishProblems.length > 0 && (
        <div role="alert" className="rounded-2xl border border-amber-500/30 bg-amber-50 dark:bg-amber-500/[0.07] p-5">
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0 text-amber-700 dark:text-amber-400" strokeWidth={2} aria-hidden />
            <div>
              <p className="text-[14px] font-semibold text-amber-800 dark:text-amber-300">
                Not ready to publish yet
              </p>
              <ul className="mt-2 space-y-1">
                {publishProblems.map((p) => (
                  <li key={p} className="text-[13px] leading-relaxed text-amber-800 dark:text-amber-300">• {p}</li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      )}

      {saveError && (
        <div role="alert" className="rounded-2xl border border-red-500/30 bg-red-50 dark:bg-red-500/[0.07] p-4 text-[13.5px] text-red-800 dark:text-red-300">
          {saveError}
        </div>
      )}

      <fieldset disabled={isArchived || busy} className="space-y-5">
        <Section title="Basics">
          <div className="space-y-4">
            <Field label="Title">
              <input className={inputCls} value={draft.title} onChange={(e) => set('title', e.target.value)} placeholder="e.g. Class 10 Mathematics — CBSE" maxLength={120} />
            </Field>
            <Field label="Description">
              <textarea className={cn(inputCls, 'h-24 py-2 resize-y')} value={draft.description} onChange={(e) => set('description', e.target.value)} placeholder="What will students learn, and who is it for?" maxLength={2000} />
            </Field>
            <div className="grid sm:grid-cols-2 gap-4">
              <Field label="Subject"><Select value={draft.subject} onChange={(v) => set('subject', v)} options={SUBJECTS} placeholder="Choose a subject" /></Field>
              <Field label="Class / grade"><Select value={draft.grade} onChange={(v) => set('grade', v)} options={GRADES} placeholder="Choose a level" /></Field>
              <Field label="Board"><Select value={draft.board} onChange={(v) => set('board', v)} options={BOARDS} placeholder="Optional" /></Field>
              <Field label="Exam"><Select value={draft.exam} onChange={(v) => set('exam', v)} options={GOALS} placeholder="Optional" /></Field>
              <Field label="Language"><Select value={draft.language} onChange={(v) => set('language', v)} options={LANGUAGES} placeholder="Optional" /></Field>
              <Field label="Mode">
                <select className={inputCls} value={draft.mode} onChange={(e) => set('mode', e.target.value as ClassMode)}>
                  {MODES.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
                </select>
              </Field>
            </div>
          </div>
        </Section>

        <Section title="Schedule">
          <div className="space-y-4">
            <div className="grid sm:grid-cols-2 gap-4">
              <Field label="Starts"><input type="date" className={inputCls} value={draft.startDate} onChange={(e) => set('startDate', e.target.value)} /></Field>
              <Field label="Ends"><input type="date" className={inputCls} value={draft.endDate} onChange={(e) => set('endDate', e.target.value)} /></Field>
            </div>
            <div>
              <span className="block mb-1.5 text-[12.5px] font-medium text-slate-600 dark:text-gray-300">Days</span>
              <div className="flex flex-wrap gap-1.5">
                {DAYS.map((d) => {
                  const on = draft.days.includes(d.value);
                  return (
                    <button
                      key={d.value}
                      type="button"
                      aria-pressed={on}
                      onClick={() => set('days', on ? draft.days.filter((x) => x !== d.value) : [...draft.days, d.value])}
                      className={cn(
                        'h-9 px-3 rounded-lg border text-[13px] font-medium transition-colors',
                        on
                          ? 'border-slate-900 dark:border-white bg-slate-900 dark:bg-white text-white dark:text-slate-900'
                          : 'border-slate-200 dark:border-white/12 text-slate-600 dark:text-gray-300 hover:bg-slate-50 dark:hover:bg-white/[0.05]',
                      )}
                    >
                      {d.label}
                    </button>
                  );
                })}
              </div>
            </div>
            <div className="grid sm:grid-cols-2 gap-4">
              <Field label="Start time"><input type="time" className={inputCls} value={draft.startTime} onChange={(e) => set('startTime', e.target.value)} /></Field>
              <Field label="End time"><input type="time" className={inputCls} value={draft.endTime} onChange={(e) => set('endTime', e.target.value)} /></Field>
            </div>
          </div>
        </Section>

        <Section title="Syllabus">
          <div className="space-y-2">
            {draft.syllabus.length === 0 && (
              <p className="text-[13px] text-slate-500 dark:text-gray-400">
                No topics yet. Add the chapters you plan to cover — you can mark progress later.
              </p>
            )}
            {draft.syllabus.map((topic, i) => (
              <div key={topic.id} className="flex items-center gap-2">
                <input
                  className={inputCls}
                  value={topic.title}
                  onChange={(e) => {
                    const next = [...draft.syllabus];
                    next[i] = { ...topic, title: e.target.value };
                    set('syllabus', next);
                  }}
                  placeholder={`Topic ${i + 1}`}
                  maxLength={160}
                />
                <select
                  className={cn(inputCls, 'w-[9.5rem]')}
                  value={topic.status}
                  onChange={(e) => {
                    const next = [...draft.syllabus];
                    next[i] = { ...topic, status: e.target.value as SyllabusTopic['status'] };
                    set('syllabus', next);
                  }}
                >
                  <option value="not_started">Not started</option>
                  <option value="in_progress">In progress</option>
                  <option value="completed">Completed</option>
                </select>
                <button
                  type="button"
                  aria-label={`Remove topic ${i + 1}`}
                  onClick={() => set('syllabus', draft.syllabus.filter((_, j) => j !== i))}
                  className="w-10 h-10 shrink-0 rounded-lg border border-slate-200 dark:border-white/12 flex items-center justify-center text-slate-500 hover:text-red-600 dark:hover:text-red-400 transition-colors"
                >
                  <Trash2 className="w-4 h-4" strokeWidth={2} aria-hidden />
                </button>
              </div>
            ))}
            <button
              type="button"
              onClick={() => set('syllabus', [...draft.syllabus, { id: `t_${Date.now().toString(36)}`, title: '', status: 'not_started' }])}
              className="mt-1 inline-flex items-center gap-1.5 h-9 px-3 rounded-lg border border-slate-200 dark:border-white/12 text-[13px] font-medium hover:bg-slate-50 dark:hover:bg-white/[0.05] transition-colors"
            >
              <Plus className="w-3.5 h-3.5" strokeWidth={2.5} aria-hidden />
              Add topic
            </button>
          </div>
        </Section>

        <Section title="Access and pricing">
          <div className="space-y-4">
            <Field label="Capacity" hint="Leave empty for no limit.">
              <input type="number" min={1} className={inputCls} value={draft.capacity} onChange={(e) => set('capacity', e.target.value)} placeholder="No limit" />
            </Field>

            {isNew || isDraft ? (
              <>
                <div>
                  <span className="block mb-1.5 text-[12.5px] font-medium text-slate-600 dark:text-gray-300">Price</span>
                  <div className="flex gap-1.5">
                    {(['free', 'paid'] as const).map((t) => (
                      <button
                        key={t}
                        type="button"
                        aria-pressed={draft.pricingType === t}
                        onClick={() => set('pricingType', t)}
                        className={cn(
                          'h-10 px-4 rounded-lg border text-[13.5px] font-medium capitalize transition-colors',
                          draft.pricingType === t
                            ? 'border-slate-900 dark:border-white bg-slate-900 dark:bg-white text-white dark:text-slate-900'
                            : 'border-slate-200 dark:border-white/12 text-slate-600 dark:text-gray-300',
                        )}
                      >
                        {t}
                      </button>
                    ))}
                  </div>
                </div>
                {draft.pricingType === 'paid' && (
                  <Field label="Amount (₹)" hint="Whole rupees.">
                    <input type="number" min={1} className={inputCls} value={draft.amountINR} onChange={(e) => set('amountINR', e.target.value)} placeholder="e.g. 2500" />
                  </Field>
                )}
                <p className="text-[12px] leading-relaxed text-slate-500 dark:text-gray-400">
                  Pricing can only be set while the class is a draft — once published, the price a
                  student saw cannot change.
                </p>
              </>
            ) : (
              <div className="flex items-start gap-2.5 rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-white/[0.03] p-3.5">
                <Lock className="w-4 h-4 mt-0.5 shrink-0 text-slate-500 dark:text-gray-400" strokeWidth={2} aria-hidden />
                <div>
                  <p className="text-[13.5px] font-medium">
                    {draft.pricingType === 'paid' ? `₹${Number(draft.amountINR || 0).toLocaleString('en-IN')}` : 'Free'}
                  </p>
                  <p className="mt-0.5 text-[12px] leading-relaxed text-slate-500 dark:text-gray-400">
                    Locked because this class is no longer a draft.
                  </p>
                </div>
              </div>
            )}

            {/* Stated where a teacher will actually look for it. */}
            <div className="flex items-start gap-2.5 rounded-xl border border-amber-500/30 bg-amber-50 dark:bg-amber-500/[0.07] p-3.5">
              <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0 text-amber-700 dark:text-amber-400" strokeWidth={2} aria-hidden />
              <p className="text-[12.5px] leading-relaxed text-amber-800 dark:text-amber-300">
                Purchasing isn&rsquo;t live yet. A price recorded here is stored with the class, but
                students cannot pay for it and no earnings are generated.
              </p>
            </div>
          </div>
        </Section>
      </fieldset>

      {/* ── Actions ──────────────────────────────────────────────────────── */}
      <div className="sticky bottom-0 -mx-5 sm:-mx-8 px-5 sm:px-8 py-3 border-t border-slate-200 dark:border-white/10 bg-[#faf9f7]/95 dark:bg-[#0b0b0c]/95 backdrop-blur-xl flex flex-wrap items-center gap-2.5">
        <button
          type="button"
          onClick={handleSave}
          disabled={busy || isArchived}
          className="inline-flex items-center gap-2 h-10 px-4 rounded-xl bg-slate-900 dark:bg-white text-white dark:text-slate-900 text-[13.5px] font-semibold disabled:opacity-60"
        >
          {busy ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden /> : <Check className="w-4 h-4" strokeWidth={2.5} aria-hidden />}
          {isNew ? 'Create draft' : 'Save changes'}
        </button>

        {!isNew && isDraft && (
          <button
            type="button"
            onClick={() => handleStatus('published')}
            disabled={busy}
            className="inline-flex items-center gap-2 h-10 px-4 rounded-xl bg-[#c8e558] hover:bg-[#bcd94c] text-slate-900 text-[13.5px] font-semibold disabled:opacity-60"
          >
            <Send className="w-4 h-4" strokeWidth={2.25} aria-hidden />
            Publish
          </button>
        )}
        {!isNew && status === 'published' && (
          <button type="button" onClick={() => handleStatus('active')} disabled={busy}
            className="inline-flex items-center gap-2 h-10 px-4 rounded-xl border border-slate-200 dark:border-white/12 text-[13.5px] font-semibold">
            Mark as started
          </button>
        )}
        {!isNew && status === 'active' && (
          <button type="button" onClick={() => handleStatus('completed')} disabled={busy}
            className="inline-flex items-center gap-2 h-10 px-4 rounded-xl border border-slate-200 dark:border-white/12 text-[13.5px] font-semibold">
            Mark as completed
          </button>
        )}
        {!isNew && !isArchived && (
          <button type="button" onClick={() => handleStatus('archived')} disabled={busy}
            className="ml-auto inline-flex items-center gap-2 h-10 px-4 rounded-xl border border-slate-200 dark:border-white/12 text-[13.5px] font-medium text-slate-600 dark:text-gray-300">
            <Archive className="w-4 h-4" strokeWidth={2} aria-hidden />
            Archive
          </button>
        )}

        {savedAt && !busy && (
          <span className="text-[12.5px] text-slate-500 dark:text-gray-400">Saved</span>
        )}
      </div>
    </div>
  );
}
