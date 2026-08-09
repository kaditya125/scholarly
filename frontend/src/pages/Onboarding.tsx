import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'motion/react';
import {
  GraduationCap, ArrowRight, ArrowLeft, Check, Sparkles, Target as TargetIcon,
  BookOpen, Clock, Languages, Palette, Layers, Compass, Loader2,
} from 'lucide-react';
import { useAuth } from '../lib/AuthContext';
import { useProfile } from '../hooks/api/useProfile';
import {
  LearningProfile, GOAL_GROUPS, BOARDS, STREAMS, SUBJECTS, LEVELS, TARGET_SUGGESTIONS,
  STUDY_TIMES, LEARNING_STYLES, LANGUAGES, autoStream, showStreamStep, suggestedSubjects,
} from '../lib/onboardingOptions';

type StepKey =
  | 'welcome' | 'goal' | 'board' | 'stream' | 'subjects'
  | 'level' | 'target' | 'studyTime' | 'style' | 'language';

interface StepDef {
  key: StepKey;
  /** Single-select steps auto-advance on choice; multi-select use the Continue button. */
  multi?: boolean;
}

const GEN_MESSAGES = [
  'Building your AI Learning Profile…',
  'Analyzing your goals…',
  'Selecting your syllabus…',
  'Preparing an adaptive roadmap…',
  'Creating your personalized dashboard…',
  'Configuring your AI Tutor…',
  'Building your knowledge context…',
  'Almost done…',
];

export default function Onboarding() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { profile: saved, updateProfile } = useProfile();

  const [profile, setProfile] = useState<LearningProfile>({});
  const [index, setIndex] = useState(0);
  const [dir, setDir] = useState(1);
  const [phase, setPhase] = useState<'wizard' | 'generating'>('wizard');
  const [genStep, setGenStep] = useState(0);
  const seeded = useRef(false);
  const advancing = useRef(false);

  const firstName = (user?.displayName || '').trim().split(' ')[0] || 'there';

  // Seed local state from any previously-saved profile once (returning/partial users). If the
  // student already finished onboarding, don't force them through it again.
  useEffect(() => {
    if (seeded.current || !saved) return;
    seeded.current = true;
    if (saved.isComplete) { navigate('/dashboard', { replace: true }); return; }
    setProfile(saved);
  }, [saved, navigate]);

  // The step list is dynamic: the Stream step only appears when the goal calls for it.
  const steps: StepDef[] = useMemo(() => {
    const list: StepDef[] = [
      { key: 'welcome' }, { key: 'goal' }, { key: 'board' },
    ];
    if (showStreamStep(profile.goal)) list.push({ key: 'stream' });
    list.push(
      { key: 'subjects', multi: true }, { key: 'level' }, { key: 'target' },
      { key: 'studyTime' }, { key: 'style', multi: true }, { key: 'language' },
    );
    return list;
  }, [profile.goal]);

  const total = steps.length;
  const step = steps[Math.min(index, total - 1)];
  const pct = Math.round(((index + 1) / total) * 100);

  const patch = (p: Partial<LearningProfile>) => setProfile((prev) => ({ ...prev, ...p }));

  const persist = (extra?: Partial<LearningProfile>) => {
    // Fire-and-forget autosave so a student who drops off keeps everything they entered.
    updateProfile({ ...profile, ...extra }).catch(() => {});
  };

  const goNext = (extra?: Partial<LearningProfile>) => {
    if (advancing.current) return;
    advancing.current = true;
    setTimeout(() => { advancing.current = false; }, 260);
    persist(extra);
    if (index >= total - 1) { finish(extra); return; }
    setDir(1);
    setIndex((i) => i + 1);
  };

  const goBack = () => {
    if (index === 0) return;
    setDir(-1);
    setIndex((i) => i - 1);
  };

  const skipAll = () => {
    sessionStorage.setItem('onboarding_skipped', 'true');
    persist();
    navigate('/dashboard', { replace: true });
  };

  const finish = async (extra?: Partial<LearningProfile>) => {
    setPhase('generating');
    const startedAt = Date.now();
    // Real backend profile creation happens here (not fake loading) — mark onboarding complete.
    try {
      await updateProfile({ ...profile, ...extra, markComplete: true });
    } catch { /* non-fatal — the partial autosaves already persisted their data */ }
    // Keep the generation animation on screen for a minimum beat so it doesn't flash by.
    const elapsed = Date.now() - startedAt;
    const wait = Math.max(0, 5200 - elapsed);
    setTimeout(() => navigate('/baseline-assessment', { replace: true }), wait);
  };

  // Single-select choice: set + auto-advance for a snappy, non-form feel.
  const choose = (p: Partial<LearningProfile>) => goNext(p);

  // Cycle the generation messages while the profile is created.
  useEffect(() => {
    if (phase !== 'generating') return;
    const t = setInterval(() => setGenStep((s) => Math.min(s + 1, GEN_MESSAGES.length - 1)), 650);
    return () => clearInterval(t);
  }, [phase]);

  if (phase === 'generating') return <GenerationScreen genStep={genStep} firstName={firstName} />;

  return (
    <div className="min-h-screen w-full bg-[#faf9f7] dark:bg-[#0b0b0c] text-slate-900 dark:text-white flex flex-col">
      {/* Top bar: brand + progress */}
      <div className="w-full max-w-2xl mx-auto px-6 pt-6">
        <div className="flex items-center justify-between mb-4">
          <div className="inline-flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-indigo-600 flex items-center justify-center">
              <GraduationCap className="w-4 h-4 text-white" />
            </div>
            <span className="font-semibold text-[15px] tracking-tight">Scholarly</span>
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

      {/* Step body */}
      <div className="flex-1 w-full max-w-2xl mx-auto px-6 py-8 flex flex-col">
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
            <StepContent
              step={step}
              profile={profile}
              firstName={firstName}
              patch={patch}
              choose={choose}
              goNext={goNext}
            />
          </motion.div>
        </AnimatePresence>

        {/* Footer nav */}
        <div className="flex items-center justify-between pt-6 mt-auto">
          <button
            onClick={goBack}
            disabled={index === 0}
            className="inline-flex items-center gap-1.5 text-[13.5px] font-semibold text-slate-500 dark:text-gray-400 hover:text-slate-800 dark:hover:text-gray-200 disabled:opacity-0 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" /> Back
          </button>

          <div className="flex items-center gap-3">
            <button
              onClick={skipAll}
              className="text-[13px] font-medium text-slate-400 dark:text-gray-500 hover:text-slate-600 dark:hover:text-gray-300 transition-colors"
            >
              Skip for now
            </button>
            {step.key !== 'welcome' && (
              <button
                onClick={() => goNext()}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-indigo-600 hover:bg-indigo-700 text-white text-[13.5px] font-semibold transition-colors shadow-sm"
              >
                {index >= total - 1 ? 'Finish' : 'Continue'} <ArrowRight className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Step content ─────────────────────────────────────────────────────────────

interface StepContentProps {
  step: StepDef;
  profile: LearningProfile;
  firstName: string;
  patch: (p: Partial<LearningProfile>) => void;
  choose: (p: Partial<LearningProfile>) => void;
  goNext: (extra?: Partial<LearningProfile>) => void;
}

function StepContent({ step, profile, firstName, patch, choose, goNext }: StepContentProps) {
  switch (step.key) {
    case 'welcome':
      return (
        <div className="flex-1 flex flex-col items-center justify-center text-center">
          <motion.div
            initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
            transition={{ type: 'spring', stiffness: 140, damping: 12 }}
            className="w-16 h-16 rounded-2xl bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center mb-6 shadow-lg"
          >
            <Sparkles className="w-8 h-8 text-white" />
          </motion.div>
          <h1 className="text-[30px] md:text-[34px] font-bold tracking-tight leading-tight">
            Welcome, {firstName} <span className="inline-block">👋</span>
          </h1>
          <p className="mt-3 text-[15.5px] text-slate-500 dark:text-gray-400 max-w-md leading-relaxed">
            Let's build your personal AI study companion — one that understands exactly what you're
            working toward. This takes less than 2 minutes.
          </p>
          <button
            onClick={() => goNext()}
            className="mt-8 inline-flex items-center gap-2 px-7 py-3 rounded-full bg-indigo-600 hover:bg-indigo-700 text-white text-[15px] font-semibold transition-colors shadow-md"
          >
            Let's begin <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      );

    case 'goal':
      return (
        <Prompt icon={Compass} title="What are you preparing for?" subtitle="This shapes everything — pick your primary goal.">
          <div className="space-y-5">
            {GOAL_GROUPS.map((group) => (
              <div key={group.label}>
                <div className="text-[11.5px] font-bold uppercase tracking-wide text-slate-400 dark:text-gray-500 mb-2">{group.label}</div>
                <div className="flex flex-wrap gap-2">
                  {group.options.map((g) => (
                    <Chip
                      key={g}
                      label={g}
                      selected={profile.goal === g}
                      onClick={() => {
                        const stream = autoStream(g) || undefined;
                        choose({ goal: g, targetExam: g, stream, subjects: suggestedSubjects(g, stream) });
                      }}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
        </Prompt>
      );

    case 'board':
      return (
        <Prompt icon={BookOpen} title="Which syllabus do you follow?" subtitle="We'll ground answers in your board's curriculum.">
          <ChoiceGrid options={BOARDS} value={profile.board} onSelect={(v) => choose({ board: v })} />
        </Prompt>
      );

    case 'stream':
      return (
        <Prompt icon={Layers} title="Which stream?" subtitle="Pick the stream you're studying.">
          <ChoiceGrid options={STREAMS} value={profile.stream} onSelect={(v) => choose({ stream: v, subjects: suggestedSubjects(profile.goal, v) })} />
        </Prompt>
      );

    case 'subjects':
      return (
        <Prompt icon={BookOpen} title="Which subjects?" subtitle="Choose all that apply — you can change these later.">
          <MultiGrid
            options={SUBJECTS}
            values={profile.subjects || []}
            onToggle={(v) => patch({ subjects: toggle(profile.subjects, v) })}
          />
        </Prompt>
      );

    case 'level':
      return (
        <Prompt icon={TargetIcon} title="Where are you right now?" subtitle="So the tutor pitches explanations at the right level.">
          <div className="grid gap-2.5">
            {LEVELS.map((l) => (
              <BigOption
                key={l.value}
                title={l.label}
                hint={l.hint}
                selected={profile.preparationLevel === l.value}
                onClick={() => choose({ preparationLevel: l.value })}
              />
            ))}
          </div>
        </Prompt>
      );

    case 'target':
      return (
        <Prompt icon={TargetIcon} title="What's your target?" subtitle="Your aspiration keeps every session pointed at the goal.">
          <div className="flex flex-wrap gap-2 mb-4">
            {TARGET_SUGGESTIONS.map((t) => (
              <Chip key={t} label={t} selected={profile.target === t} onClick={() => patch({ target: t })} />
            ))}
          </div>
          <input
            value={profile.target || ''}
            onChange={(e) => patch({ target: e.target.value })}
            placeholder="…or type your own target"
            className="w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#1a1a1b] text-[14px] placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-colors"
          />
        </Prompt>
      );

    case 'studyTime':
      return (
        <Prompt icon={Clock} title="How much time can you study daily?" subtitle="We'll size your roadmap to fit your day.">
          <div className="flex flex-wrap gap-2.5">
            {STUDY_TIMES.map((s) => (
              <button
                key={s.value}
                onClick={() => choose({ dailyStudyHours: s.value })}
                className={pillCls(profile.dailyStudyHours === s.value)}
              >
                {s.label}
              </button>
            ))}
          </div>
        </Prompt>
      );

    case 'style':
      return (
        <Prompt icon={Palette} title="How do you learn best?" subtitle="Pick a few — the tutor will lean on these formats.">
          <MultiGrid
            options={LEARNING_STYLES}
            values={profile.learningStyles || []}
            onToggle={(v) => patch({ learningStyles: toggle(profile.learningStyles, v) })}
          />
        </Prompt>
      );

    case 'language':
      return (
        <Prompt icon={Languages} title="Preferred language?" subtitle="Your tutor will teach in the language you're most comfortable with.">
          <ChoiceGrid options={LANGUAGES} value={profile.preferredLanguage} onSelect={(v) => choose({ preferredLanguage: v })} />
        </Prompt>
      );

    default:
      return null;
  }
}

// ─── Generation screen ─────────────────────────────────────────────────────────

function GenerationScreen({ genStep, firstName }: { genStep: number; firstName: string }) {
  return (
    <div className="min-h-screen w-full bg-[#faf9f7] dark:bg-[#0b0b0c] flex flex-col items-center justify-center px-6 text-center">
      <motion.div
        animate={{ rotate: 360 }}
        transition={{ repeat: Infinity, duration: 2.4, ease: 'linear' }}
        className="w-16 h-16 rounded-2xl bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center mb-7 shadow-xl"
      >
        <Sparkles className="w-8 h-8 text-white" />
      </motion.div>
      <h2 className="text-[22px] md:text-[26px] font-bold tracking-tight text-slate-900 dark:text-white mb-2">
        Setting up your AI mentor, {firstName}
      </h2>
      <AnimatePresence mode="wait">
        <motion.p
          key={genStep}
          initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }}
          transition={{ duration: 0.3 }}
          className="text-[15px] text-slate-500 dark:text-gray-400 h-6"
        >
          {GEN_MESSAGES[genStep]}
        </motion.p>
      </AnimatePresence>
      <div className="mt-6 flex items-center gap-2 text-slate-400 dark:text-gray-500">
        <Loader2 className="w-4 h-4 animate-spin" />
        <span className="text-[12.5px]">This only takes a moment</span>
      </div>
    </div>
  );
}

// ─── Small building blocks ──────────────────────────────────────────────────────

function Prompt({ icon: Icon, title, subtitle, children }: { icon: any; title: string; subtitle: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="w-11 h-11 rounded-xl bg-indigo-50 dark:bg-indigo-500/10 flex items-center justify-center mb-4">
        <Icon className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
      </div>
      <h2 className="text-[24px] md:text-[27px] font-bold tracking-tight leading-tight">{title}</h2>
      <p className="mt-2 mb-6 text-[14.5px] text-slate-500 dark:text-gray-400">{subtitle}</p>
      {children}
    </div>
  );
}

function Chip({ label, selected, onClick }: { label: string; selected?: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={[
        'px-3.5 py-2 rounded-full text-[13.5px] font-medium border transition-all',
        selected
          ? 'bg-indigo-600 border-indigo-600 text-white shadow-sm'
          : 'bg-white dark:bg-white/5 border-slate-200 dark:border-white/10 text-slate-700 dark:text-gray-200 hover:border-indigo-300 dark:hover:border-indigo-500/40',
      ].join(' ')}
    >
      {label}
    </button>
  );
}

function ChoiceGrid({ options, value, onSelect }: { options: string[]; value?: string; onSelect: (v: string) => void }) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
      {options.map((o) => (
        <button
          key={o}
          onClick={() => onSelect(o)}
          className={[
            'px-4 py-3 rounded-xl text-[14px] font-semibold border text-left transition-all',
            value === o
              ? 'bg-indigo-600 border-indigo-600 text-white shadow-sm'
              : 'bg-white dark:bg-white/5 border-slate-200 dark:border-white/10 text-slate-700 dark:text-gray-200 hover:border-indigo-300 dark:hover:border-indigo-500/40',
          ].join(' ')}
        >
          {o}
        </button>
      ))}
    </div>
  );
}

function MultiGrid({ options, values, onToggle }: { options: string[]; values: string[]; onToggle: (v: string) => void }) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
      {options.map((o) => {
        const on = values.includes(o);
        return (
          <button
            key={o}
            onClick={() => onToggle(o)}
            className={[
              'flex items-center gap-2 px-3.5 py-3 rounded-xl text-[13.5px] font-medium border text-left transition-all',
              on
                ? 'bg-indigo-50 dark:bg-indigo-500/10 border-indigo-400 dark:border-indigo-500/50 text-indigo-700 dark:text-indigo-300'
                : 'bg-white dark:bg-white/5 border-slate-200 dark:border-white/10 text-slate-700 dark:text-gray-200 hover:border-indigo-300 dark:hover:border-indigo-500/40',
            ].join(' ')}
          >
            <span className={[
              'w-4 h-4 rounded-[5px] border flex items-center justify-center shrink-0 transition-colors',
              on ? 'bg-indigo-600 border-indigo-600' : 'border-slate-300 dark:border-white/25',
            ].join(' ')}>
              {on && <Check className="w-3 h-3 text-white" strokeWidth={3} />}
            </span>
            {o}
          </button>
        );
      })}
    </div>
  );
}

function BigOption({ title, hint, selected, onClick }: { title: string; hint: string; selected?: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={[
        'w-full text-left px-4 py-3.5 rounded-xl border transition-all',
        selected
          ? 'bg-indigo-50 dark:bg-indigo-500/10 border-indigo-400 dark:border-indigo-500/50'
          : 'bg-white dark:bg-white/5 border-slate-200 dark:border-white/10 hover:border-indigo-300 dark:hover:border-indigo-500/40',
      ].join(' ')}
    >
      <div className={['text-[15px] font-semibold', selected ? 'text-indigo-700 dark:text-indigo-300' : 'text-slate-800 dark:text-gray-100'].join(' ')}>{title}</div>
      <div className="text-[12.5px] text-slate-500 dark:text-gray-400 mt-0.5">{hint}</div>
    </button>
  );
}

const pillCls = (on: boolean) => [
  'px-5 py-3 rounded-xl text-[14px] font-semibold border transition-all',
  on
    ? 'bg-indigo-600 border-indigo-600 text-white shadow-sm'
    : 'bg-white dark:bg-white/5 border-slate-200 dark:border-white/10 text-slate-700 dark:text-gray-200 hover:border-indigo-300 dark:hover:border-indigo-500/40',
].join(' ');

function toggle(arr: string[] | undefined, v: string): string[] {
  const set = new Set(arr || []);
  if (set.has(v)) set.delete(v); else set.add(v);
  return Array.from(set);
}
