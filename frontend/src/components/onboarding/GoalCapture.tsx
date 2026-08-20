import { useState } from 'react';
import { Loader2, AlertCircle } from 'lucide-react';
import { studentGoalApi, validateGoalValue, type GoalKind, type ScoreUnit } from '../../lib/api/studentGoal';
import { cn } from '../../lib/utils';

/**
 * Structured goal capture, replacing the free-text target the onboarding step used to collect.
 *
 * The old field stored strings like "95%" or "AIR under 500". The intent was real but
 * unparseable, which is exactly why the mentor could never answer "how far am I from my target?"
 * — there was nothing to compare against.
 *
 * The student picks the target TYPE rather than the app inferring it, because the frontend has no
 * exam scoring metadata and guessing (rank for JEE, percentile for CUET…) would hardcode
 * assumptions that belong in exam configuration, not a form.
 */

const KINDS: Array<{ kind: GoalKind; label: string; placeholder: string; hint: string }> = [
  // The score hint used to read "Marks or percentage" — which is exactly the ambiguity that made
  // the stored target uncomparable to anything. The unit is now asked for explicitly below.
  { kind: 'score', label: 'Score', placeholder: '90', hint: 'The score you\'re aiming for' },
  { kind: 'rank', label: 'Rank', placeholder: '500', hint: 'Best rank you want to land' },
  { kind: 'percentile', label: 'Percentile', placeholder: '99', hint: 'Percentile you\'re chasing' },
];

const SCORE_UNITS: Array<{ unit: ScoreUnit; label: string }> = [
  { unit: 'PERCENT', label: 'Percent (%)' },
  { unit: 'MARKS', label: 'Marks' },
];

interface Props {
  userId: string;
  examId?: string;
  examCycle?: string;
  /** Called once the goal is genuinely persisted. */
  onSaved: () => void;
  /** Called when the student chooses not to set a target — a legitimate state, not a failure. */
  onSkip: () => void;
}

export default function GoalCapture({ userId, examId, examCycle, onSaved, onSkip }: Props) {
  const [kind, setKind] = useState<GoalKind>('score');
  const [value, setValue] = useState('');
  // Deliberately starts unselected. Pre-selecting "Percent" would be the form deciding what the
  // student meant, and a wrongly-attributed unit is worse than an unanswered question — it makes
  // every later "how far am I from my goal?" quietly wrong.
  const [scoreUnit, setScoreUnit] = useState<ScoreUnit | null>(null);
  const [targetDate, setTargetDate] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const active = KINDS.find((k) => k.kind === kind)!;

  const submit = async () => {
    const localError = validateGoalValue(kind, value);
    if (localError) { setError(localError); return; }
    if (kind === 'score' && !scoreUnit) {
      setError('Tell us whether that\'s a percentage or a mark out of the paper total.');
      return;
    }
    if (kind === 'score' && scoreUnit === 'PERCENT' && Number(value.trim()) > 100) {
      setError('A percentage target can\'t be above 100.');
      return;
    }

    setSaving(true);
    setError(null);
    try {
      await studentGoalApi.saveGoal(userId, {
        kind, value: Number(value.trim()), scoreUnit: scoreUnit ?? undefined,
        targetDate: targetDate || undefined, examId, examCycle,
      });
      onSaved();
    } catch (e: any) {
      // Surface the backend's own field message where it sent one — it knows exam-specific rules
      // this form deliberately does not duplicate. Onboarding does NOT advance on failure:
      // pretending a goal was saved would leave the mentor reasoning about a target that isn't there.
      const details = e?.response?.data?.details;
      setError(
        Array.isArray(details) && details[0]?.message
          ? details[0].message
          : e?.message || 'Could not save your target. Check your connection and try again.',
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      {/* Target type */}
      <div role="radiogroup" aria-label="Target type" className="flex gap-2 mb-4">
        {KINDS.map((k) => (
          <button
            key={k.kind}
            type="button"
            role="radio"
            aria-checked={kind === k.kind}
            onClick={() => { setKind(k.kind); setError(null); }}
            className={cn(
              'px-3.5 py-1.5 rounded-xl text-[13px] font-medium border transition-colors',
              kind === k.kind
                ? 'border-[#c8e558] bg-[#c8e558]/15 text-slate-900 dark:text-white'
                : 'border-slate-200 dark:border-white/10 text-slate-600 dark:text-gray-300 hover:border-slate-300',
            )}
          >
            {k.label}
          </button>
        ))}
      </div>

      <label htmlFor="goal-value" className="block text-[12.5px] text-slate-500 dark:text-gray-400 mb-1.5">
        {active.hint}
      </label>
      <input
        id="goal-value"
        // `inputMode` rather than type="number": avoids the scroll-wheel/spinner quirks and the
        // silent decimal coercion browsers apply to number inputs.
        inputMode="decimal"
        value={value}
        onChange={(e) => { setValue(e.target.value); setError(null); }}
        onKeyDown={(e) => { if (e.key === 'Enter' && !saving) submit(); }}
        placeholder={active.placeholder}
        aria-invalid={!!error}
        aria-describedby={error ? 'goal-error' : undefined}
        className="w-full h-11 px-3.5 rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-white/[0.04] text-[14px] text-slate-900 dark:text-white placeholder:text-slate-400 outline-none transition-colors focus:border-[#c8e558] focus:ring-4 focus:ring-[#c8e558]/20"
      />

      {/* Unit — only meaningful for a score. "90" is a fine percentage and a poor mark out of 200,
          and without knowing which, the target can never be compared to a measurement. */}
      {kind === 'score' && (
        <>
          <span id="goal-unit-label" className="block text-[12.5px] text-slate-500 dark:text-gray-400 mt-3 mb-1.5">
            Is that a percentage or marks?
          </span>
          <div role="radiogroup" aria-labelledby="goal-unit-label" className="flex gap-2">
            {SCORE_UNITS.map((u) => (
              <button
                key={u.unit}
                type="button"
                role="radio"
                aria-checked={scoreUnit === u.unit}
                onClick={() => { setScoreUnit(u.unit); setError(null); }}
                className={`h-10 px-4 rounded-xl border text-[13px] transition-colors ${
                  scoreUnit === u.unit
                    ? 'border-[#c8e558] bg-[#c8e558]/10 text-slate-900 dark:text-white'
                    : 'border-slate-200 dark:border-white/10 text-slate-600 dark:text-gray-400 hover:border-slate-300'
                }`}
              >
                {u.label}
              </button>
            ))}
          </div>
        </>
      )}

      <label htmlFor="goal-date" className="block text-[12.5px] text-slate-500 dark:text-gray-400 mt-4 mb-1.5">
        When are we aiming for it? <span className="text-slate-400">(optional)</span>
      </label>
      <input
        id="goal-date"
        type="date"
        value={targetDate}
        onChange={(e) => setTargetDate(e.target.value)}
        className="w-full h-11 px-3.5 rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-white/[0.04] text-[14px] text-slate-900 dark:text-white outline-none transition-colors focus:border-[#c8e558] focus:ring-4 focus:ring-[#c8e558]/20"
      />

      {error && (
        <p id="goal-error" role="alert" className="mt-3 flex items-start gap-1.5 text-[12.5px] text-rose-600 dark:text-rose-400">
          <AlertCircle className="w-4 h-4 shrink-0 mt-px" />
          {error}
        </p>
      )}

      <div className="mt-5 flex items-center gap-3">
        <button
          type="button"
          onClick={submit}
          disabled={saving}
          className="inline-flex items-center gap-2 rounded-xl px-5 py-2.5 text-[14px] font-semibold text-slate-900 bg-[#c8e558] disabled:opacity-60 transition-transform hover:scale-[1.02] disabled:hover:scale-100"
        >
          {saving && <Loader2 className="w-4 h-4 animate-spin" />}
          {saving ? 'Saving…' : 'Lock it in'}
        </button>
        {/* Skipping is legitimate. A student who does not yet know their target must not be
            assigned one, and "no goal" must never be read downstream as "target of zero". */}
        <button
          type="button"
          onClick={onSkip}
          disabled={saving}
          className="text-[13px] text-slate-500 dark:text-gray-400 hover:text-slate-800 dark:hover:text-gray-200 transition-colors disabled:opacity-60"
        >
          I'm not sure yet
        </button>
      </div>
    </div>
  );
}
