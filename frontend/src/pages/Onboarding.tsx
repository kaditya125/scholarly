import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence, useReducedMotion } from 'motion/react';
import {
  ArrowRight, ArrowLeft, Check, Sparkles, Target as TargetIcon,
  BookOpen, Clock, Languages, Palette, Layers, Compass,
} from 'lucide-react';
import { useAuth } from '../lib/AuthContext';
import GoalCapture from '../components/onboarding/GoalCapture';
import { useProfile } from '../hooks/api/useProfile';
import { BrandMark } from '../components/common/BrandMark';
import { baselineAssessmentApi } from '../lib/api/baselineAssessment';
import { sendRealNotification } from '../lib/api/realtimeNotifications';
import {
  LearningProfile, GOAL_GROUPS, BOARDS, STREAMS, SUBJECTS, LEVELS, TARGET_SUGGESTIONS,
  STUDY_TIMES, LEARNING_STYLES, LANGUAGES, autoStream, showStreamStep, suggestedSubjects,
} from '../lib/onboardingOptions';

/**
 * Student onboarding wizard.
 *
 * DESIGN LANGUAGE — inherited wholesale from the landing page and AuthShell, which are the
 * two surfaces a student sees immediately before this one. Previously this wizard ran on an
 * indigo/violet palette with pill buttons and its own graduation-cap logo, so signing up went
 * lime → lime → purple and read as a different product mid-flow.
 *
 *   · lime #c8e558 is the ONLY accent; slate carries everything else
 *   · labels on lime are slate-900 — white text on this lime is ~1.7:1 and unreadable
 *   · rounded-xl controls, h-11 primary actions, hairline borders
 *   · Inter with the same negative tracking the landing headings use
 *   · one easing curve, one gesture (rise + fade); nothing scales or spins
 *
 * The brand mark is imported rather than redrawn — see BrandMark's note in AuthShell.
 */

const ACCENT = '#c8e558';
const EASE = [0.16, 1, 0.3, 1] as const;

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
  const reduced = useReducedMotion();

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
      if (user?.uid) {
        await baselineAssessmentApi.resetAssessment(user.uid).catch(() => {});
        // Send real welcome notification with target goal
        sendRealNotification({
          userId: user.uid,
          type: 'welcome',
          category: 'system',
          title: `Welcome to Sadhya, ${firstName}! 🎉`,
          body: `Your academic profile is ready for ${profile.goal || 'your target exam'}. Take the AI Baseline Assessment to calibrate your Digital Twin.`,
          actionUrl: '/baseline-assessment',
          priority: 'high',
        }).catch(() => {});
      }
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

  const slide = reduced ? 0 : 32;

  return (
    <div className="min-h-screen w-full bg-white dark:bg-[#0b0b0c] text-slate-900 dark:text-white antialiased flex flex-col">
      {/* ── Header: brand + progress ─────────────────────────────────────────── */}
      <header className="w-full border-b border-slate-100 dark:border-white/[0.07]">
        <div className="w-full max-w-[640px] mx-auto px-6 pt-6 pb-5">
          <div className="flex items-center justify-between mb-4">
            <BrandMark size={24} />
            <span className="text-[12px] font-medium tabular-nums text-slate-500 dark:text-gray-400">
              Step {index + 1} of {total}
            </span>
          </div>

          <div
            className="h-1 rounded-full bg-slate-100 dark:bg-white/10 overflow-hidden"
            role="progressbar"
            aria-valuenow={pct}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label="Onboarding progress"
          >
            <motion.div
              className="h-full rounded-full"
              style={{ backgroundColor: ACCENT }}
              initial={false}
              animate={{ width: `${pct}%` }}
              transition={{ duration: reduced ? 0 : 0.5, ease: EASE }}
            />
          </div>
        </div>
      </header>

      {/* ── Step body ────────────────────────────────────────────────────────── */}
      <div className="flex-1 w-full max-w-[640px] mx-auto px-6 py-10 sm:py-14 flex flex-col">
        <AnimatePresence mode="wait" custom={dir}>
          <motion.div
            key={step.key}
            custom={dir}
            initial={{ opacity: 0, x: dir * slide }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: dir * -slide }}
            transition={{ duration: reduced ? 0 : 0.32, ease: EASE }}
            className="flex-1 flex flex-col"
          >
            <StepContent
              step={step}
              userId={user?.uid}
              profile={profile}
              firstName={firstName}
              patch={patch}
              choose={choose}
              goNext={goNext}
            />
          </motion.div>
        </AnimatePresence>

        {/* ── Footer nav ─────────────────────────────────────────────────────── */}
        <div className="flex items-center justify-between gap-4 pt-10 mt-auto">
          <button
            onClick={goBack}
            disabled={index === 0}
            className="group inline-flex items-center gap-1.5 text-[13.5px] font-semibold text-slate-500 dark:text-gray-400 hover:text-slate-900 dark:hover:text-white disabled:opacity-0 disabled:pointer-events-none transition-colors"
          >
            <ArrowLeft className="w-4 h-4 transition-transform group-hover:-translate-x-0.5" strokeWidth={2.25} />
            Back
          </button>

          <div className="flex items-center gap-4">
            <button
              onClick={skipAll}
              className="text-[13px] font-medium text-slate-400 dark:text-gray-500 hover:text-slate-700 dark:hover:text-gray-300 transition-colors"
            >
              Skip for now
            </button>
            {step.key !== 'welcome' && (
              <PrimaryButton onClick={() => goNext()}>
                {index >= total - 1 ? 'Finish' : 'Continue'}
              </PrimaryButton>
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
  userId?: string;
}

function StepContent({ step, profile, firstName, patch, choose, goNext, userId }: StepContentProps) {
  switch (step.key) {
    case 'welcome':
      return (
        <div className="flex-1 flex flex-col items-center justify-center text-center">
          <span
            className="w-14 h-14 rounded-2xl flex items-center justify-center mb-7"
            style={{ backgroundColor: ACCENT }}
          >
            <Sparkles className="w-7 h-7 text-slate-900" strokeWidth={1.9} />
          </span>

          <h1 className="text-[32px] sm:text-[38px] leading-[1.1] font-semibold tracking-[-0.03em]">
            Welcome, <Underline>{firstName}</Underline>
          </h1>
          <p className="mt-5 text-[15.5px] sm:text-[16.5px] leading-relaxed text-slate-500 dark:text-gray-400 max-w-[26rem]">
            Let&rsquo;s build your personal AI study companion — one that understands exactly what
            you&rsquo;re working toward. This takes less than two minutes.
          </p>

          <div className="mt-9">
            <PrimaryButton onClick={() => goNext()} size="lg">
              Let&rsquo;s begin
            </PrimaryButton>
          </div>
        </div>
      );

    case 'goal':
      return (
        <Prompt icon={Compass} eyebrow="Your goal" title="What are you preparing for?" subtitle="This shapes everything — pick your primary goal.">
          <div className="space-y-6">
            {GOAL_GROUPS.map((group) => (
              <div key={group.label}>
                <div className="text-[11px] font-semibold uppercase tracking-[0.13em] text-slate-400 dark:text-gray-500 mb-2.5">
                  {group.label}
                </div>
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
        <Prompt icon={BookOpen} eyebrow="Your syllabus" title="Which syllabus do you follow?" subtitle="We'll ground answers in your board's curriculum.">
          <ChoiceGrid options={BOARDS} value={profile.board} onSelect={(v) => choose({ board: v })} />
        </Prompt>
      );

    case 'stream':
      return (
        <Prompt icon={Layers} eyebrow="Your stream" title="Which stream?" subtitle="Pick the stream you're studying.">
          <ChoiceGrid options={STREAMS} value={profile.stream} onSelect={(v) => choose({ stream: v, subjects: suggestedSubjects(profile.goal, v) })} />
        </Prompt>
      );

    case 'subjects':
      return (
        <Prompt icon={BookOpen} eyebrow="Your subjects" title="Which subjects?" subtitle="Choose all that apply — you can change these later.">
          <MultiGrid
            options={SUBJECTS}
            values={profile.subjects || []}
            onToggle={(v) => patch({ subjects: toggle(profile.subjects, v) })}
          />
        </Prompt>
      );

    case 'level':
      return (
        <Prompt icon={TargetIcon} eyebrow="Your level" title="Where are you right now?" subtitle="So the tutor pitches explanations at the right level.">
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
        <Prompt icon={TargetIcon} eyebrow="Your target" title="What's the target?" subtitle="Give us something concrete to chase.">
          {/* Structured capture replacing the previous free-text field. That field stored strings
              like "95%" or "AIR under 500" — real intent, but unparseable, which is precisely why
              the mentor could never say how far the student was from their goal. Persisted through
              the backend (which owns validation and provenance), never written directly. */}
          {userId ? (
            <GoalCapture
              userId={userId}
              examId={profile.targetExam || profile.goal}
              examCycle={profile.targetYear}
              onSaved={() => goNext()}
              onSkip={() => goNext()}
            />
          ) : (
            <p className="text-[13px] text-slate-500 dark:text-gray-400">
              Sign-in is still initialising — one moment.
            </p>
          )}
        </Prompt>
      );

    case 'studyTime':
      return (
        <Prompt icon={Clock} eyebrow="Your time" title="How much time can you study daily?" subtitle="We'll size your roadmap to fit your day.">
          <div className="flex flex-wrap gap-2.5">
            {STUDY_TIMES.map((s) => (
              <PillOption
                key={s.value}
                label={s.label}
                selected={profile.dailyStudyHours === s.value}
                onClick={() => choose({ dailyStudyHours: s.value })}
              />
            ))}
          </div>
        </Prompt>
      );

    case 'style':
      return (
        <Prompt icon={Palette} eyebrow="How you learn" title="How do you learn best?" subtitle="Pick a few — the tutor will lean on these formats.">
          <MultiGrid
            options={LEARNING_STYLES}
            values={profile.learningStyles || []}
            onToggle={(v) => patch({ learningStyles: toggle(profile.learningStyles, v) })}
          />
        </Prompt>
      );

    case 'language':
      return (
        <Prompt icon={Languages} eyebrow="Your language" title="Preferred language?" subtitle="Your tutor will teach in the language you're most comfortable with.">
          <ChoiceGrid options={LANGUAGES} value={profile.preferredLanguage} onSelect={(v) => choose({ preferredLanguage: v })} />
        </Prompt>
      );

    default:
      return null;
  }
}

// ─── Generation screen ─────────────────────────────────────────────────────────

function GenerationScreen({ genStep, firstName }: { genStep: number; firstName: string }) {
  const reduced = useReducedMotion();

  return (
    <div className="min-h-screen w-full bg-white dark:bg-[#0b0b0c] flex flex-col items-center justify-center px-6 text-center">
      <span
        className="w-14 h-14 rounded-2xl flex items-center justify-center mb-8"
        style={{ backgroundColor: ACCENT }}
      >
        <Sparkles className="w-7 h-7 text-slate-900" strokeWidth={1.9} />
      </span>

      <h2 className="text-[24px] sm:text-[28px] font-semibold tracking-[-0.03em] leading-[1.15] text-slate-900 dark:text-white">
        Setting up your AI mentor, {firstName}
      </h2>

      <div className="mt-3 h-6">
        <AnimatePresence mode="wait">
          <motion.p
            key={genStep}
            initial={reduced ? false : { opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={reduced ? undefined : { opacity: 0, y: -6 }}
            transition={{ duration: 0.3, ease: EASE }}
            className="text-[15px] text-slate-500 dark:text-gray-400"
          >
            {GEN_MESSAGES[genStep]}
          </motion.p>
        </AnimatePresence>
      </div>

      {/* Indeterminate sweep rather than a spinner — matches the progress bar it replaces. */}
      <div className="mt-8 w-[200px] h-1 rounded-full bg-slate-100 dark:bg-white/10 overflow-hidden">
        <motion.div
          className="h-full w-1/3 rounded-full"
          style={{ backgroundColor: ACCENT }}
          animate={reduced ? { x: 0 } : { x: ['-100%', '300%'] }}
          transition={{ duration: 1.4, repeat: Infinity, ease: 'easeInOut' }}
        />
      </div>
    </div>
  );
}

// ─── Small building blocks ──────────────────────────────────────────────────────

/** The hand-drawn arc from the landing hero and the auth footer — the brand's one flourish. */
function Underline({ children }: { children: ReactNode }) {
  const reduced = useReducedMotion();
  return (
    <span className="relative inline-block whitespace-nowrap">
      {children}
      <svg
        className="absolute -bottom-1 left-0 w-full overflow-visible pointer-events-none"
        height="11"
        viewBox="0 0 100 11"
        preserveAspectRatio="none"
        fill="none"
        aria-hidden
      >
        <motion.path
          d="M1.5 5C18 8.8 44 9.6 98.5 2.6"
          stroke={ACCENT}
          strokeWidth="3"
          strokeLinecap="round"
          initial={reduced ? false : { pathLength: 0 }}
          animate={{ pathLength: 1 }}
          transition={{ duration: reduced ? 0 : 0.7, ease: EASE, delay: reduced ? 0 : 0.35 }}
        />
      </svg>
    </span>
  );
}

/**
 * Primary action. Lime with a slate-900 label — white on this lime is ~1.7:1, so the dark
 * label is a contrast requirement rather than a style choice.
 */
function PrimaryButton({
  children,
  onClick,
  size = 'md',
}: {
  children: ReactNode;
  onClick: () => void;
  size?: 'md' | 'lg';
}) {
  return (
    <button
      onClick={onClick}
      className={[
        'group inline-flex items-center justify-center gap-2 rounded-xl bg-[#c8e558] hover:bg-[#bcd94c] active:bg-[#b0cd40] text-slate-900 font-semibold transition-colors',
        size === 'lg' ? 'h-12 px-6 text-[14.5px]' : 'h-11 px-5 text-[14px]',
      ].join(' ')}
    >
      {children}
      <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-0.5" strokeWidth={2.25} />
    </button>
  );
}

function Prompt({
  icon: Icon,
  eyebrow,
  title,
  subtitle,
  children,
}: {
  icon: React.ElementType;
  eyebrow: string;
  title: string;
  subtitle: string;
  children: ReactNode;
}) {
  return (
    <div>
      {/* Inverted slate tile — the same icon treatment the landing capability cards use. */}
      <span className="inline-flex w-10 h-10 rounded-xl bg-slate-900 dark:bg-white items-center justify-center">
        <Icon className="w-[18px] h-[18px] text-white dark:text-slate-900" strokeWidth={1.9} />
      </span>

      <p className="mt-5 text-[12px] font-semibold uppercase tracking-[0.13em] text-slate-500 dark:text-gray-400">
        {eyebrow}
      </p>
      <h2 className="mt-2.5 text-[26px] sm:text-[30px] leading-[1.12] font-semibold tracking-[-0.03em]">
        {title}
      </h2>
      <p className="mt-3 mb-8 text-[15px] leading-relaxed text-slate-500 dark:text-gray-400">
        {subtitle}
      </p>

      {children}
    </div>
  );
}

/** Shared selected/unselected treatment, so every control type stays in step. */
const selectedCls = 'border-[#c8e558] bg-[#c8e558]/[0.09] ring-1 ring-[#c8e558]/40 text-slate-900 dark:text-white';
const restCls =
  'border-slate-200 dark:border-white/10 bg-white dark:bg-white/[0.04] text-slate-700 dark:text-gray-200 hover:border-slate-300 dark:hover:border-white/20 hover:bg-slate-50 dark:hover:bg-white/[0.07]';

function Chip({ label, selected, onClick }: { label: string; selected?: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      aria-pressed={selected}
      className={[
        'px-3.5 py-2 rounded-lg text-[13px] font-medium border transition-colors',
        selected ? selectedCls : restCls,
      ].join(' ')}
    >
      {label}
    </button>
  );
}

function PillOption({ label, selected, onClick }: { label: string; selected?: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      aria-pressed={selected}
      className={[
        'h-11 px-5 rounded-xl text-[14px] font-semibold border transition-colors',
        selected ? selectedCls : restCls,
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
          aria-pressed={value === o}
          className={[
            'px-4 py-3 rounded-xl text-[14px] font-semibold border text-left transition-colors',
            value === o ? selectedCls : restCls,
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
            aria-pressed={on}
            className={[
              'flex items-center gap-2.5 px-3.5 py-3 rounded-xl text-[13.5px] font-medium border text-left transition-colors',
              on ? selectedCls : restCls,
            ].join(' ')}
          >
            <span
              className={[
                'w-4 h-4 rounded-[5px] border flex items-center justify-center shrink-0 transition-colors',
                on ? 'bg-[#c8e558] border-[#c8e558]' : 'border-slate-300 dark:border-white/25',
              ].join(' ')}
              aria-hidden
            >
              {on && <Check className="w-3 h-3 text-slate-900" strokeWidth={3} />}
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
      aria-pressed={selected}
      className={[
        'w-full text-left px-4 py-3.5 rounded-xl border transition-colors',
        selected ? selectedCls : restCls,
      ].join(' ')}
    >
      <div className="text-[15px] font-semibold text-slate-900 dark:text-white">{title}</div>
      <div className="text-[12.5px] text-slate-500 dark:text-gray-400 mt-0.5">{hint}</div>
    </button>
  );
}

function toggle(arr: string[] | undefined, v: string): string[] {
  const set = new Set(arr || []);
  if (set.has(v)) set.delete(v); else set.add(v);
  return Array.from(set);
}
