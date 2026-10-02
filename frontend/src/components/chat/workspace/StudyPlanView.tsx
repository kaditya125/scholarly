import { BookOpen, ExternalLink, GraduationCap, Layers, ListChecks, PenLine, RotateCcw } from 'lucide-react';
import { StudyPlanSpec } from '../../../lib/api/agent';
import { cn } from '../../../lib/utils';

/**
 * A study plan. A revision plan (Phase 6) is days of timed tasks. An exam preparation plan
 * (Phase 7, "Prepare me for SSC CGL in 90 days") adds what it covers, whether it fits the time,
 * the phases, a milestone for every week, how to practise, and where its numbers come from —
 * this week is still shown day by day.
 */

type Task = StudyPlanSpec['days'][number]['tasks'][number];
type Phase = NonNullable<StudyPlanSpec['weeks']>[number]['phase'];

const KIND: Record<Task['kind'], { icon: typeof BookOpen; label: string; tone: string }> = {
  learn: { icon: GraduationCap, label: 'Learn', tone: 'text-indigo-700 dark:text-indigo-300 bg-indigo-50 dark:bg-indigo-500/10' },
  revise: { icon: BookOpen, label: 'Revise', tone: 'text-violet-700 dark:text-violet-300 bg-violet-50 dark:bg-violet-500/10' },
  practice: { icon: PenLine, label: 'Practise', tone: 'text-sky-700 dark:text-sky-300 bg-sky-50 dark:bg-sky-500/10' },
  flashcards: { icon: Layers, label: 'Flashcards', tone: 'text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-500/10' },
  review: { icon: RotateCcw, label: 'Review', tone: 'text-slate-700 dark:text-slate-300 bg-slate-100 dark:bg-white/[0.06]' },
  test: { icon: ListChecks, label: 'Check-quiz', tone: 'text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-500/10' },
};

const PHASE: Record<Phase, { label: string; bar: string; chip: string }> = {
  learn: { label: 'Learn', bar: 'bg-indigo-500', chip: 'text-indigo-700 dark:text-indigo-300 bg-indigo-50 dark:bg-indigo-500/10' },
  practise: { label: 'Timed practice', bar: 'bg-sky-500', chip: 'text-sky-700 dark:text-sky-300 bg-sky-50 dark:bg-sky-500/10' },
  revise: { label: 'Full tests', bar: 'bg-emerald-500', chip: 'text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-500/10' },
};

const dayLabel = (iso: string) => new Date(`${iso}T00:00:00`).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });
const dateLabel = (iso: string) => new Date(`${iso}T00:00:00`).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
const hours = (minutes: number) => (minutes >= 60 ? `${Math.round((minutes / 60) * 10) / 10} h` : `${minutes} min`);

const Heading = ({ children }: { children: React.ReactNode }) => (
  <h3 className="text-[12px] uppercase tracking-[0.08em] font-semibold text-slate-400 dark:text-gray-500">{children}</h3>
);

function DayCards({ days, offset = 0 }: { days: StudyPlanSpec['days']; offset?: number }) {
  return (
    <ol className="flex flex-col gap-3">
      {days.map((day, i) => {
        const minutes = day.tasks.reduce((n, t) => n + t.minutes, 0);
        return (
          <li key={day.date} className="rounded-xl border border-neutral-200 dark:border-white/10 p-4">
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-[13.5px] font-semibold text-neutral-900 dark:text-neutral-50">
                Day {offset + i + 1} <span className="font-normal text-slate-500 dark:text-gray-400">· {dayLabel(day.date)}</span>
              </span>
              <span className="text-[12px] tabular-nums text-slate-500 dark:text-gray-400">{minutes} min</span>
            </div>
            <ul className="mt-3 flex flex-col gap-2.5">
              {day.tasks.map((t, ti) => {
                const k = KIND[t.kind] ?? KIND.review;
                const Icon = k.icon;
                return (
                  <li key={ti} className="flex items-start gap-3">
                    <span className={cn('mt-0.5 w-6 h-6 rounded-md flex items-center justify-center shrink-0', k.tone)} title={k.label}>
                      <Icon className="w-3.5 h-3.5" strokeWidth={2} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-[13.5px] leading-snug text-neutral-800 dark:text-neutral-100">{t.title}</span>
                      {t.ref && <span className="block text-[12px] text-slate-500 dark:text-gray-400">{t.ref}</span>}
                    </span>
                    <span className="text-[12px] tabular-nums text-slate-400 dark:text-gray-500 shrink-0">{t.minutes}m</span>
                  </li>
                );
              })}
            </ul>
          </li>
        );
      })}
    </ol>
  );
}

function PrepHeader({ spec }: { spec: StudyPlanSpec }) {
  const weeks = spec.weeks ?? [];
  const o = spec.outlook;
  const spans = (['learn', 'practise', 'revise'] as Phase[])
    .map((phase) => ({ phase, ws: weeks.filter((w) => w.phase === phase).map((w) => w.week) }))
    .filter((p) => p.ws.length);
  return (
    <section className="flex flex-col gap-3">
      {spec.exam && (
        <div className="flex flex-col gap-1.5">
          <p className="text-[13.5px] font-semibold text-neutral-900 dark:text-neutral-50">{spec.exam.name}</p>
          <div className="flex flex-wrap gap-1.5">
            {spec.exam.scope.map((s) => (
              <span key={s} className="text-[11.5px] font-medium px-2 py-0.5 rounded-full bg-neutral-100 dark:bg-white/[0.06] text-neutral-700 dark:text-neutral-300">
                {s}
              </span>
            ))}
          </div>
          {spec.exam.notIncluded.length > 0 && (
            <p className="text-[12px] text-slate-500 dark:text-gray-400">Not included: {spec.exam.notIncluded.join(', ')} — ask me to add them.</p>
          )}
        </div>
      )}

      <p className="text-[12.5px] text-slate-600 dark:text-gray-300 tabular-nums">
        {spec.horizon ? `${spec.horizon.days} days · ${dateLabel(spec.startDate)} – ${dateLabel(spec.horizon.endDate)}` : `from ${dateLabel(spec.startDate)}`} · {spec.dailyMinutes} min a day
        {spec.horizon?.source === 'default' && <span className="text-slate-500 dark:text-gray-400"> · no exam date given, so four weeks</span>}
      </p>

      {o && (
        <div
          className={cn(
            'rounded-lg px-3.5 py-2.5 text-[12.5px] leading-relaxed',
            o.fitsInTime
              ? 'bg-emerald-50 dark:bg-emerald-500/10 text-emerald-800 dark:text-emerald-200'
              : 'bg-amber-50 dark:bg-amber-500/10 text-amber-900 dark:text-amber-200',
          )}
        >
          {o.fitsInTime
            ? `A first pass over all ${o.units} topics needs about ${o.firstPassHours} h; the learning weeks give ${o.availableHours} h. It fits.`
            : `A first pass over all ${o.units} topics needs about ${o.firstPassHours} h; the learning weeks give ${o.availableHours} h. ${o.note ?? ''}`}
        </div>
      )}

      {weeks.length > 0 && (
        <div className="flex flex-col gap-1.5" aria-label="Plan phases">
          <div className="flex gap-[3px]">
            {weeks.map((w) => (
              <span key={w.week} className={cn('h-2 flex-1 rounded-sm', PHASE[w.phase].bar)} title={`Week ${w.week}: ${PHASE[w.phase].label}`} />
            ))}
          </div>
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-[12px] text-slate-500 dark:text-gray-400">
            {spans.map(({ phase, ws }) => (
              <span key={phase} className="inline-flex items-center gap-1.5">
                <span className={cn('w-2 h-2 rounded-sm', PHASE[phase].bar)} />
                {PHASE[phase].label} · {ws.length === 1 ? `week ${ws[0]}` : `weeks ${ws[0]}–${ws[ws.length - 1]}`}
              </span>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}

function WeekList({ weeks }: { weeks: NonNullable<StudyPlanSpec['weeks']> }) {
  return (
    <ol className="flex flex-col gap-2.5">
      {weeks.map((w) => {
        const units = w.focus.flatMap((f) => f.units.map((u) => ({ subject: f.subject, unit: u })));
        return (
          <li key={w.week} className="rounded-xl border border-neutral-200 dark:border-white/10 p-4 flex flex-col gap-2">
            <div className="flex items-center justify-between gap-3">
              <span className="text-[13.5px] font-semibold text-neutral-900 dark:text-neutral-50">
                Week {w.week} <span className="font-normal text-slate-500 dark:text-gray-400 tabular-nums">· {dateLabel(w.startDate)} – {dateLabel(w.endDate)}</span>
              </span>
              <span className={cn('text-[11px] font-medium px-2 py-0.5 rounded-full shrink-0', PHASE[w.phase].chip)}>{PHASE[w.phase].label}</span>
            </div>
            <p className="text-[13px] leading-relaxed text-neutral-800 dark:text-neutral-200">{w.milestone}</p>
            {w.focus.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {w.focus.map((f) => (
                  <span key={f.subject} className="text-[11.5px] px-2 py-0.5 rounded-md bg-neutral-100 dark:bg-white/[0.06] text-neutral-600 dark:text-neutral-300 tabular-nums">
                    {f.subject} · {hours(f.minutes)}
                  </span>
                ))}
              </div>
            )}
            {units.length > 0 && (
              <details className="group text-[12.5px]">
                <summary className="cursor-pointer select-none text-slate-500 dark:text-gray-400 hover:text-neutral-800 dark:hover:text-neutral-200">
                  {units.length} {units.length === 1 ? 'topic' : 'topics'}
                </summary>
                <ul className="mt-2 flex flex-col gap-1">
                  {units.map(({ subject, unit }) => (
                    <li key={`${subject}:${unit}`} className="leading-snug text-neutral-700 dark:text-neutral-300">
                      {unit} <span className="text-slate-400 dark:text-gray-500">· {subject}</span>
                    </li>
                  ))}
                </ul>
              </details>
            )}
          </li>
        );
      })}
    </ol>
  );
}

export default function StudyPlanView({ spec }: { spec: StudyPlanSpec }) {
  const isPrep = Boolean(spec.weeks?.length);

  const focus = (
    <ul className="flex flex-col gap-1.5">
      {spec.focus.map((f) => (
        <li key={f.topic} className="text-[13px] leading-relaxed text-neutral-800 dark:text-neutral-200">
          <span className="font-semibold">{f.topic}</span> <span className="text-slate-500 dark:text-gray-400">— {f.reason}</span>
        </li>
      ))}
    </ul>
  );

  if (!isPrep) {
    return (
      <div className="h-full overflow-y-auto p-5 flex flex-col gap-6 *:shrink-0">
        <section className="flex flex-col gap-2">
          <p className="text-[12.5px] text-slate-500 dark:text-gray-400">
            {spec.dailyMinutes} minutes a day · from {dayLabel(spec.startDate)} · {spec.days.length} days
          </p>
          {focus}
        </section>
        <DayCards days={spec.days} />
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto p-5 flex flex-col gap-6 *:shrink-0">
      <PrepHeader spec={spec} />

      <section className="flex flex-col gap-3">
        <Heading>This week, day by day</Heading>
        <DayCards days={spec.days} />
      </section>

      <section className="flex flex-col gap-3">
        <Heading>Week by week</Heading>
        <WeekList weeks={spec.weeks!} />
      </section>

      {spec.strategy && spec.strategy.length > 0 && (
        <section className="flex flex-col gap-3">
          <Heading>How to practise</Heading>
          <dl className="flex flex-col gap-3">
            {spec.strategy.map((s) => (
              <div key={s.title}>
                <dt className="text-[13px] font-semibold text-neutral-900 dark:text-neutral-100">{s.title}</dt>
                <dd className="mt-0.5 text-[13px] leading-relaxed text-neutral-700 dark:text-neutral-300">{s.detail}</dd>
              </div>
            ))}
          </dl>
        </section>
      )}

      <section className="flex flex-col gap-3">
        <Heading>First priorities</Heading>
        {focus}
      </section>

      {spec.sources && spec.sources.length > 0 && (
        <section className="flex flex-col gap-2">
          <Heading>Where this comes from</Heading>
          <ul className="flex flex-col gap-1.5">
            {spec.sources.map((s) => (
              <li key={s.label} className="text-[12.5px] leading-relaxed text-slate-600 dark:text-gray-300">
                {s.url ? (
                  <a href={s.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-medium text-neutral-800 dark:text-neutral-100 hover:underline">
                    {s.label} <ExternalLink className="w-3 h-3" strokeWidth={2} />
                  </a>
                ) : (
                  <span className="font-medium text-neutral-800 dark:text-neutral-100">{s.label}</span>
                )}
                {s.detail && <span className="text-slate-500 dark:text-gray-400"> — {s.detail}</span>}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
