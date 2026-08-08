import { useEffect, useState } from 'react';
import { Loader2, Check, Sparkles } from 'lucide-react';
import { useProfile } from '../../hooks/api/useProfile';
import {
  LearningProfile, GOALS, BOARDS, STREAMS, SUBJECTS, LEVELS, TARGET_SUGGESTIONS,
  STUDY_TIMES, LEARNING_STYLES, LANGUAGES, profileCompletion,
} from '../../lib/onboardingOptions';
import { cn } from '../../lib/utils';

/**
 * Editable Learning Profile (Settings tab). Wired to the same profile the AI context block reads,
 * so saving here immediately re-personalizes the tutor on the next message — no historical learning
 * data is touched (this only writes the onboarding profile doc). Reuses the shared option lists so
 * it can never drift from the onboarding wizard.
 */
export function LearningProfileSettings() {
  const { profile, isLoading, updateProfile, isUpdating } = useProfile();
  const [form, setForm] = useState<LearningProfile>({});
  const [seeded, setSeeded] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (!seeded && profile) { setForm(profile); setSeeded(true); }
  }, [profile, seeded]);

  const set = (p: Partial<LearningProfile>) => { setForm((f) => ({ ...f, ...p })); setSaved(false); };
  const toggleArr = (key: 'subjects' | 'learningStyles', v: string) => {
    const cur = new Set<string>((form[key] as string[]) || []);
    if (cur.has(v)) cur.delete(v); else cur.add(v);
    set({ [key]: Array.from(cur) } as Partial<LearningProfile>);
  };

  const save = async () => {
    try {
      await updateProfile({ ...form, targetExam: form.goal || form.targetExam, markComplete: !!form.goal });
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch { /* surfaced by the mutation state; keep the form intact */ }
  };

  if (isLoading) {
    return <div className="py-16 flex justify-center"><Loader2 className="w-6 h-6 animate-spin text-indigo-500" /></div>;
  }

  const pct = profileCompletion(form);

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="rounded-2xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#1a1a1b] p-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-indigo-50 dark:bg-indigo-500/10 flex items-center justify-center">
            <Sparkles className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
          </div>
          <div className="flex-1">
            <h2 className="text-[17px] font-bold text-slate-900 dark:text-white">Learning Profile</h2>
            <p className="text-[13px] text-slate-500 dark:text-gray-400">This powers your AI tutor's personalization. Update anytime — changes apply to your next message.</p>
          </div>
          <div className="text-right shrink-0">
            <div className="text-[20px] font-bold text-slate-900 dark:text-white">{pct}%</div>
            <div className="text-[11px] text-slate-400 dark:text-gray-500">complete</div>
          </div>
        </div>
      </div>

      {/* Fields */}
      <div className="rounded-2xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#1a1a1b] p-6 space-y-6">
        <Field label="Goal — what are you preparing for?">
          <Select value={form.goal || ''} onChange={(v) => set({ goal: v })} options={GOALS} placeholder="Select your goal" />
        </Field>

        <div className="grid sm:grid-cols-2 gap-5">
          <Field label="Board">
            <Select value={form.board || ''} onChange={(v) => set({ board: v })} options={BOARDS} placeholder="Select board" />
          </Field>
          <Field label="Class (optional)">
            <input
              value={form.classLevel || ''} onChange={(e) => set({ classLevel: e.target.value })}
              placeholder="e.g. Class 12" className={inputCls}
            />
          </Field>
        </div>

        <div className="grid sm:grid-cols-2 gap-5">
          <Field label="Stream">
            <Select value={form.stream || ''} onChange={(v) => set({ stream: v })} options={STREAMS} placeholder="Select stream" />
          </Field>
          <Field label="Target year (optional)">
            <input
              value={form.targetYear || ''} onChange={(e) => set({ targetYear: e.target.value })}
              placeholder="e.g. 2027" className={inputCls}
            />
          </Field>
        </div>

        <Field label="Subjects">
          <ChipMulti options={SUBJECTS} values={form.subjects || []} onToggle={(v) => toggleArr('subjects', v)} />
        </Field>

        <Field label="Current level">
          <div className="flex flex-wrap gap-2">
            {LEVELS.map((l) => (
              <Chip key={l.value} label={l.label} selected={form.preparationLevel === l.value} onClick={() => set({ preparationLevel: l.value })} />
            ))}
          </div>
        </Field>

        <Field label="Target / aspiration">
          <div className="flex flex-wrap gap-2 mb-2.5">
            {TARGET_SUGGESTIONS.map((t) => (
              <Chip key={t} label={t} selected={form.target === t} onClick={() => set({ target: t })} />
            ))}
          </div>
          <input value={form.target || ''} onChange={(e) => set({ target: e.target.value })} placeholder="…or type your own" className={inputCls} />
        </Field>

        <Field label="Daily study time">
          <div className="flex flex-wrap gap-2">
            {STUDY_TIMES.map((s) => (
              <Chip key={s.value} label={s.label} selected={form.dailyStudyHours === s.value} onClick={() => set({ dailyStudyHours: s.value })} />
            ))}
          </div>
        </Field>

        <Field label="Learning style">
          <ChipMulti options={LEARNING_STYLES} values={form.learningStyles || []} onToggle={(v) => toggleArr('learningStyles', v)} />
        </Field>

        <Field label="Preferred language">
          <div className="flex flex-wrap gap-2">
            {LANGUAGES.map((l) => (
              <Chip key={l} label={l} selected={form.preferredLanguage === l} onClick={() => set({ preferredLanguage: l })} />
            ))}
          </div>
        </Field>

        <div className="flex items-center gap-3 pt-2">
          <button
            onClick={save} disabled={isUpdating}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white text-[13.5px] font-semibold transition-colors"
          >
            {isUpdating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
            {isUpdating ? 'Saving…' : 'Save profile'}
          </button>
          {saved && <span className="text-[13px] font-medium text-emerald-600 dark:text-emerald-400">Saved — your AI tutor is updated</span>}
        </div>
      </div>
    </div>
  );
}

const inputCls = 'w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#0f0f10] text-slate-900 dark:text-white text-[14px] placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-colors';

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-[13px] font-semibold text-slate-700 dark:text-gray-300 mb-2">{label}</label>
      {children}
    </div>
  );
}

function Select({ value, onChange, options, placeholder }: { value: string; onChange: (v: string) => void; options: string[]; placeholder: string }) {
  return (
    <div className="relative">
      <select value={value} onChange={(e) => onChange(e.target.value)} className={cn(inputCls, 'appearance-none cursor-pointer pr-9')}>
        <option value="">{placeholder}</option>
        {options.map((o) => <option key={o} value={o}>{o}</option>)}
      </select>
      <svg className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m6 9 6 6 6-6" /></svg>
    </div>
  );
}

function Chip({ label, selected, onClick }: { label: string; selected?: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'px-3.5 py-2 rounded-full text-[13px] font-medium border transition-all',
        selected
          ? 'bg-indigo-600 border-indigo-600 text-white'
          : 'bg-white dark:bg-white/5 border-slate-200 dark:border-white/10 text-slate-700 dark:text-gray-200 hover:border-indigo-300 dark:hover:border-indigo-500/40',
      )}
    >
      {label}
    </button>
  );
}

function ChipMulti({ options, values, onToggle }: { options: string[]; values: string[]; onToggle: (v: string) => void }) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((o) => (
        <Chip key={o} label={o} selected={values.includes(o)} onClick={() => onToggle(o)} />
      ))}
    </div>
  );
}
