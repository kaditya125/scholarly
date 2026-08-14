import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'motion/react';
import {
  GraduationCap, ArrowRight, ArrowLeft, Presentation, BookOpen, Layers,
  Target as TargetIcon, Languages as LanguagesIcon, Palette, UserRound, Loader2, Check,
} from 'lucide-react';
import { useAuth } from '../lib/AuthContext';
import { BOARDS, SUBJECTS, GOALS, LANGUAGES } from '../lib/onboardingOptions';
import { teacherApi, TeacherProfileUpdate, TeacherVisibility } from '../lib/api/teacher';

/**
 * /teacher/onboarding — the teacher setup wizard.
 *
 * ARCHITECTURE: ONE route with internal step state, deliberately mirroring the student wizard
 * (pages/Onboarding.tsx). App.tsx renders <Routes key={location.pathname}> paired with
 * AnimatePresence, so any sub-routed wizard (/step1 → /step2) would remount on every step and
 * lose all entered state. Step transitions here are index changes, never navigations — which is
 * exactly why the student wizard is immune to the same problem. Do not convert these to routes.
 *
 * Only fields a shipped or specified feature consumes are collected. Availability and location
 * are not asked for; formal qualifications belong to verification, which is a later phase.
 */

// Teaching-specific option sets. Subjects/boards/exams/languages reuse the existing student
// constants so the two sides of the platform stay on one vocabulary.
const CLASSES_TAUGHT = [
  'Class 6', 'Class 7', 'Class 8', 'Class 9', 'Class 10',
  'Class 11', 'Class 12', 'Undergraduate', 'Competitive',
];

const TEACHING_STYLES = [
  { value: 'conceptual', label: 'Concept-first', hint: 'Build intuition before drilling problems' },
  { value: 'practice', label: 'Practice-heavy', hint: 'Learn by working through many questions' },
  { value: 'exam', label: 'Exam-focused', hint: 'Pattern recognition, speed and scoring strategy' },
  { value: 'socratic', label: 'Socratic', hint: 'Guide with questions rather than answers' },
];

type StepKey = 'welcome' | 'subjects' | 'classes' | 'boards' | 'exams' | 'languages' | 'style' | 'about';

interface StepDef {
  key: StepKey;
  /** Steps that cannot be left empty. */
  required?: boolean;
}

const STEPS: StepDef[] = [
  { key: 'welcome' },
  { key: 'subjects', required: true },
  { key: 'classes' },
  { key: 'boards' },
  { key: 'exams' },
  { key: 'languages' },
  { key: 'style' },
  { key: 'about' },
];

interface Draft {
  subjects: string[];
  classesTaught: string[];
  boards: string[];
  exams: string[];
  languages: string[];
  teachingStyle: string | null;
  bio: string | null;
  yearsExperience: number | null;
  visibility: TeacherVisibility;
}

const EMPTY: Draft = {
  subjects: [], classesTaught: [], boards: [], exams: [], languages: [],
  teachingStyle: null, bio: null, yearsExperience: null, visibility: 'private',
};

export default function TeacherOnboarding() {
  const navigate = useNavigate();
  const { user } = useAuth();

  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [index, setIndex] = useState(0);
  const [dir, setDir] = useState(1);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const seeded = useRef(false);

  const firstName = (user?.displayName || '').trim().split(' ')[0] || 'there';

  // Seed from any previously-saved profile once. A teacher who already finished is sent on
  // rather than made to repeat the wizard — same contract as the student flow.
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await teacherApi.getProfile();
        if (!alive || seeded.current) return;
        seeded.current = true;
        if (res.exists) {
          if (res.onboardingStatus === 'complete') {
            navigate('/teach', { replace: true });
            return;
          }
          setDraft({
            subjects: res.subjects ?? [],
            classesTaught: res.classesTaught ?? [],
            boards: res.boards ?? [],
            exams: res.exams ?? [],
            languages: res.languages ?? [],
            teachingStyle: res.teachingStyle ?? null,
            bio: res.bio ?? null,
            yearsExperience: res.yearsExperience ?? null,
            visibility: res.visibility ?? 'private',
          });
        }
      } catch {
        // Non-fatal: start from an empty draft. Autosave will create the profile on step 1.
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [navigate]);

  const total = STEPS.length;
  const step = STEPS[Math.min(index, total - 1)];
  const pct = Math.round(((index + 1) / total) * 100);

  const patch = (p: Partial<Draft>) => setDraft((prev) => ({ ...prev, ...p }));
  const toggle = (key: 'subjects' | 'classesTaught' | 'boards' | 'exams' | 'languages', v: string) =>
    setDraft((prev) => ({
      ...prev,
      [key]: prev[key].includes(v) ? prev[key].filter((x) => x !== v) : [...prev[key], v],
    }));

  /** Fire-and-forget autosave so a teacher who drops off keeps what they entered. */
  const persist = (extra?: TeacherProfileUpdate) => {
    teacherApi.saveProfile({ ...draft, ...extra }).catch(() => {});
  };

  const stepValid = useMemo(() => {
    if (step.key === 'subjects') return draft.subjects.length > 0;
    return true;
  }, [step.key, draft.subjects.length]);

  const goNext = () => {
    if (!stepValid) {
      setError('Pick at least one subject so we can set up your teaching workspace.');
      return;
    }
    setError(null);
    if (index >= total - 1) { void finish(); return; }
    persist();
    setDir(1);
    setIndex((i) => i + 1);
  };

  const goBack = () => {
    if (index === 0) return;
    setError(null);
    setDir(-1);
    setIndex((i) => i - 1);
  };

  const finish = async () => {
    setSaving(true);
    setError(null);
    try {
      await teacherApi.saveProfile({ ...draft, markComplete: true });
      navigate('/teach', { replace: true });
    } catch {
      setError('We could not save your profile. Please check your connection and try again.');
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen w-full bg-[#faf9f7] dark:bg-[#0b0b0c] flex flex-col items-center justify-center gap-3">
        <Loader2 className="w-6 h-6 text-indigo-500 animate-spin" />
        <p className="text-sm text-slate-500 dark:text-gray-400">Loading your teacher profile…</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen w-full bg-[#faf9f7] dark:bg-[#0b0b0c] text-slate-900 dark:text-white flex flex-col">
      <div className="w-full max-w-2xl mx-auto px-5 sm:px-6 pt-6">
        <div className="flex items-center justify-between mb-4">
          <div className="inline-flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-indigo-600 flex items-center justify-center">
              <GraduationCap className="w-4 h-4 text-white" />
            </div>
            <span className="font-semibold text-[15px] tracking-tight">Scholarly</span>
            <span className="ml-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-indigo-50 dark:bg-indigo-500/15 text-indigo-700 dark:text-indigo-300">
              Teacher
            </span>
          </div>
          <div className="text-[12.5px] font-medium text-slate-400 dark:text-gray-500">
            Step {index + 1} of {total} · {pct}%
          </div>
        </div>
        <div className="h-1.5 rounded-full bg-slate-200 dark:bg-white/10 overflow-hidden">
          <motion.div
            className="h-full rounded-full bg-gradient-to-r from-indigo-500 to-violet-500"
            initial={false}
            animate={{ width: `${pct}%` }}
            transition={{ type: 'spring', stiffness: 120, damping: 20 }}
          />
        </div>
      </div>

      <div className="flex-1 w-full max-w-2xl mx-auto px-5 sm:px-6 py-8 flex flex-col">
        <AnimatePresence mode="wait" custom={dir}>
          <motion.div
            key={step.key}
            custom={dir}
            initial={{ opacity: 0, x: dir * 40 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: dir * -40 }}
            transition={{ duration: 0.28, ease: 'easeOut' }}
            className="flex-1 flex flex-col"
          >
            <StepBody step={step} draft={draft} firstName={firstName} patch={patch} toggle={toggle} />
          </motion.div>
        </AnimatePresence>

        {error && (
          <p className="mt-4 text-[13px] text-rose-600 dark:text-rose-400" role="alert">
            {error}
          </p>
        )}

        <div className="flex items-center justify-between pt-6 mt-auto">
          <button
            onClick={goBack}
            disabled={index === 0 || saving}
            className="inline-flex items-center gap-1.5 text-[13.5px] font-semibold text-slate-500 dark:text-gray-400 hover:text-slate-800 dark:hover:text-gray-200 disabled:opacity-0 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" /> Back
          </button>

          <button
            onClick={goNext}
            disabled={saving}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-indigo-600 hover:bg-indigo-700 disabled:opacity-70 text-white text-[13.5px] font-semibold transition-colors shadow-sm"
          >
            {saving ? (
              <>Saving<Loader2 className="w-4 h-4 animate-spin" /></>
            ) : (
              <>{index >= total - 1 ? 'Finish setup' : 'Continue'}<ArrowRight className="w-4 h-4" /></>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Steps ────────────────────────────────────────────────────────────────────

function StepBody({
  step, draft, firstName, patch, toggle,
}: {
  step: StepDef;
  draft: Draft;
  firstName: string;
  patch: (p: Partial<Draft>) => void;
  toggle: (k: 'subjects' | 'classesTaught' | 'boards' | 'exams' | 'languages', v: string) => void;
}) {
  switch (step.key) {
    case 'welcome':
      return (
        <div className="flex-1 flex flex-col items-center justify-center text-center">
          <motion.div
            initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
            transition={{ type: 'spring', stiffness: 140, damping: 12 }}
            className="w-14 h-14 rounded-2xl bg-indigo-600 flex items-center justify-center mb-5"
          >
            <Presentation className="w-7 h-7 text-white" />
          </motion.div>
          <h1 className="text-[26px] sm:text-[30px] font-bold tracking-tight mb-2">
            Welcome, {firstName}
          </h1>
          <p className="max-w-md text-[15px] leading-relaxed text-slate-500 dark:text-gray-400">
            A few questions about what you teach. This shapes how Scholarly's AI assists you —
            and nothing here is visible to students unless you choose to publish it.
          </p>
        </div>
      );

    case 'subjects':
      return (
        <Prompt icon={BookOpen} title="What do you teach?" subtitle="Pick every subject you cover. Required.">
          <MultiGrid options={SUBJECTS} values={draft.subjects} onToggle={(v) => toggle('subjects', v)} />
        </Prompt>
      );

    case 'classes':
      return (
        <Prompt icon={Layers} title="Which classes?" subtitle="The levels you currently teach.">
          <MultiGrid options={CLASSES_TAUGHT} values={draft.classesTaught} onToggle={(v) => toggle('classesTaught', v)} />
        </Prompt>
      );

    case 'boards':
      return (
        <Prompt icon={Layers} title="Which boards?" subtitle="Curricula you're familiar with.">
          <MultiGrid options={BOARDS} values={draft.boards} onToggle={(v) => toggle('boards', v)} />
        </Prompt>
      );

    case 'exams':
      return (
        <Prompt icon={TargetIcon} title="Any exams you prepare students for?" subtitle="Optional — skip if this isn't your focus.">
          <MultiGrid options={GOALS} values={draft.exams} onToggle={(v) => toggle('exams', v)} />
        </Prompt>
      );

    case 'languages':
      return (
        <Prompt icon={LanguagesIcon} title="Which languages do you teach in?" subtitle="Used to match your material to your students.">
          <MultiGrid options={LANGUAGES} values={draft.languages} onToggle={(v) => toggle('languages', v)} />
        </Prompt>
      );

    case 'style':
      return (
        <Prompt icon={Palette} title="How would you describe your teaching?" subtitle="This tunes how the AI drafts material for you.">
          <div className="space-y-2.5">
            {TEACHING_STYLES.map((s) => (
              <BigOption
                key={s.value}
                title={s.label}
                hint={s.hint}
                selected={draft.teachingStyle === s.value}
                onClick={() => patch({ teachingStyle: draft.teachingStyle === s.value ? null : s.value })}
              />
            ))}
          </div>
        </Prompt>
      );

    case 'about':
      return (
        <Prompt icon={UserRound} title="A little about you" subtitle="All optional. You can change any of this later.">
          <div className="space-y-5">
            <div>
              <label htmlFor="bio" className="block text-[13px] font-semibold mb-1.5 text-slate-700 dark:text-gray-300">
                Short bio
              </label>
              <textarea
                id="bio"
                rows={3}
                maxLength={600}
                value={draft.bio ?? ''}
                onChange={(e) => patch({ bio: e.target.value })}
                placeholder="What you teach, and how you like to work with students."
                className="w-full rounded-xl px-3.5 py-3 text-[14px] bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/40 focus:border-indigo-400 transition-shadow resize-none"
              />
            </div>

            <div>
              <label htmlFor="years" className="block text-[13px] font-semibold mb-1.5 text-slate-700 dark:text-gray-300">
                Years of teaching experience
              </label>
              <input
                id="years"
                type="number"
                min={0}
                max={70}
                value={draft.yearsExperience ?? ''}
                onChange={(e) => patch({ yearsExperience: e.target.value === '' ? null : Number(e.target.value) })}
                placeholder="e.g. 6"
                className="w-full sm:w-40 rounded-xl px-3.5 py-2.5 text-[14px] bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/40 focus:border-indigo-400 transition-shadow"
              />
            </div>

            <div className="rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-white/5 p-4">
              <p className="text-[13px] font-semibold mb-2 text-slate-700 dark:text-gray-300">Profile visibility</p>
              <div className="space-y-2">
                <BigOption
                  title="Private"
                  hint="Only you can see your profile. You can change this any time."
                  selected={draft.visibility === 'private'}
                  onClick={() => patch({ visibility: 'private' })}
                />
                <BigOption
                  title="Discoverable"
                  hint="Students can find your name, subjects and bio, and ask to join your classes."
                  selected={draft.visibility === 'public'}
                  onClick={() => patch({ visibility: 'public' })}
                />
              </div>
            </div>
          </div>
        </Prompt>
      );
  }
}

// ─── Shared bits (styling matched to the student wizard) ──────────────────────

function Prompt({
  icon: Icon, title, subtitle, children,
}: { icon: any; title: string; subtitle: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="inline-flex items-center justify-center w-10 h-10 rounded-xl bg-indigo-50 dark:bg-indigo-500/15 mb-4">
        <Icon className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
      </div>
      <h2 className="text-[21px] sm:text-[23px] font-bold tracking-tight mb-1">{title}</h2>
      <p className="text-[14px] text-slate-500 dark:text-gray-400 mb-6">{subtitle}</p>
      {children}
    </div>
  );
}

function MultiGrid({
  options, values, onToggle,
}: { options: string[]; values: string[]; onToggle: (v: string) => void }) {
  return (
    <div className="flex flex-wrap gap-2.5">
      {options.map((o) => {
        const selected = values.includes(o);
        return (
          <button
            key={o}
            type="button"
            aria-pressed={selected}
            onClick={() => onToggle(o)}
            className={[
              'inline-flex items-center gap-1.5 px-3.5 py-2 rounded-full text-[13.5px] font-medium border transition-all',
              selected
                ? 'bg-indigo-600 border-indigo-600 text-white shadow-sm'
                : 'bg-white dark:bg-white/5 border-slate-200 dark:border-white/10 text-slate-700 dark:text-gray-200 hover:border-indigo-300 dark:hover:border-indigo-500/40',
            ].join(' ')}
          >
            {selected && <Check className="w-3.5 h-3.5" strokeWidth={2.5} />}
            {o}
          </button>
        );
      })}
    </div>
  );
}

function BigOption({
  title, hint, selected, onClick,
}: { title: string; hint: string; selected?: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onClick}
      className={[
        'w-full text-left px-4 py-3 rounded-xl border transition-all',
        selected
          ? 'bg-indigo-50 dark:bg-indigo-500/15 border-indigo-500 dark:border-indigo-400/60'
          : 'bg-white dark:bg-white/5 border-slate-200 dark:border-white/10 hover:border-indigo-300 dark:hover:border-indigo-500/40',
      ].join(' ')}
    >
      <div className="text-[14px] font-semibold text-slate-900 dark:text-white">{title}</div>
      <div className="text-[12.5px] text-slate-500 dark:text-gray-400 mt-0.5">{hint}</div>
    </button>
  );
}
