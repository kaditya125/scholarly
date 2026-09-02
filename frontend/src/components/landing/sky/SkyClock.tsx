import { useEffect, useState } from 'react';
import { PHASES, formatBoundary, formatGap, hoursOf, momentAt, type SkyPhase } from './phase';
import { PHASE_TINT } from './palette';

/**
 * The instrument that reads the sky: local time to the second, and a 24-hour dial with each
 * phase drawn as an arc so you can see at a glance where in the day you are and how far the
 * next change is.
 *
 * A 24-hour dial rather than the usual 12 — a 12-hour face would put dawn and dusk on top of
 * each other, which is precisely the distinction this thing exists to show.
 */

const R = 15;
const CIRC = 2 * Math.PI * R;

/** Phase windows flattened onto a 0–24 face. Night straddles midnight, so it becomes two. */
const SEGMENTS = PHASES.flatMap((w) =>
  w.end <= 24
    ? [{ phase: w.phase, from: w.start, to: w.end }]
    : [
        { phase: w.phase, from: w.start, to: 24 },
        { phase: w.phase, from: 0, to: w.end - 24 },
      ],
);

function utcOffsetLabel(d: Date): string {
  // getTimezoneOffset is minutes *behind* UTC, so the sign is inverted from what is written.
  const mins = -d.getTimezoneOffset();
  const sign = mins < 0 ? '-' : '+';
  const abs = Math.abs(mins);
  const h = Math.floor(abs / 60);
  const m = abs % 60;
  return `UTC${sign}${h}${m ? `:${String(m).padStart(2, '0')}` : ''}`;
}

/**
 * "IST", "CET" — but many zones have no abbreviation and Intl hands back the offset
 * instead ("GMT+5:30"), which would then be printed twice alongside the UTC offset. In
 * that case the offset alone is the whole label.
 */
function zoneLabel(d: Date): string {
  const offset = utcOffsetLabel(d);
  let abbrev = '';
  try {
    const parts = new Intl.DateTimeFormat('en-US', { timeZoneName: 'short' }).formatToParts(d);
    abbrev = parts.find((p) => p.type === 'timeZoneName')?.value ?? '';
  } catch {
    abbrev = '';
  }
  if (!abbrev || /^(GMT|UTC)/i.test(abbrev)) return offset;
  return `${abbrev} · ${offset}`;
}

interface Props {
  /** When `?sky=` pins a phase, the readout follows it — otherwise the two disagree. */
  pinnedPhase?: SkyPhase;
}

export default function SkyClock({ pinnedPhase }: Props) {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(id);
  }, []);

  const live = momentAt(now);
  const shown = pinnedPhase ? (PHASES.find((w) => w.phase === pinnedPhase) ?? live.window) : live.window;
  const moment = { ...live, window: shown };
  const hour = hoursOf(now);
  const time = now.toLocaleTimeString('en-GB', { hour12: false });
  const tint = PHASE_TINT[shown.phase];

  return (
    <div
      className="sky-clock"
      style={{ ['--phase-tint' as string]: tint }}
      title={`${moment.window.label} — ${moment.window.note}. Runs ${formatBoundary(moment.window.start)}–${formatBoundary(moment.window.end)}.`}
    >
      <svg className="sky-clock-dial" width="38" height="38" viewBox="0 0 36 36" aria-hidden>
        {/* 0h at the top, clockwise through the day. */}
        <g transform="rotate(-90 18 18)">
          <circle cx="18" cy="18" r={R} fill="none" stroke="rgba(255,255,255,0.07)" strokeWidth="3.4" />
          {SEGMENTS.map((s, i) => {
            const dash = ((s.to - s.from) / 24) * CIRC;
            return (
              <circle
                key={i}
                cx="18"
                cy="18"
                r={R}
                fill="none"
                stroke={PHASE_TINT[s.phase]}
                strokeOpacity={s.phase === moment.window.phase ? 0.95 : 0.32}
                strokeWidth="3.4"
                strokeDasharray={`${dash} ${CIRC - dash}`}
                strokeDashoffset={-(s.from / 24) * CIRC}
              />
            );
          })}
        </g>

        {/* Quarter marks: midnight, 06:00, noon, 18:00. */}
        {[0, 6, 12, 18].map((h) => (
          <g key={h} transform={`rotate(${(h / 24) * 360} 18 18)`}>
            <line x1="18" y1="1.4" x2="18" y2="3.4" stroke="rgba(255,255,255,0.35)" strokeWidth="1" strokeLinecap="round" />
          </g>
        ))}

        <g transform={`rotate(${(hour / 24) * 360} 18 18)`}>
          <line x1="18" y1="18" x2="18" y2="7" stroke="#ffffff" strokeWidth="1.3" strokeLinecap="round" />
        </g>
        <circle cx="18" cy="18" r="1.7" fill="#ffffff" />
      </svg>

      <div className="sky-clock-read">
        <span className="sky-clock-time">{time}</span>
        <span className="sky-clock-zone">{zoneLabel(now)}</span>
        <span className="sky-clock-phase">
          {shown.label}
          <span className="sky-clock-note">
            {' '}
            ·{' '}
            {pinnedPhase
              ? `${formatBoundary(shown.start)}–${formatBoundary(shown.end)}`
              : `${moment.next.label.toLowerCase()} in ${formatGap(moment.hoursToNext)}`}
          </span>
        </span>
      </div>
    </div>
  );
}
