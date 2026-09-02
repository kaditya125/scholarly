import { Suspense, lazy } from 'react';
import { useLocation } from 'react-router-dom';
import { useTheme } from '../../../lib/ThemeContext';
import type { SkyPhase } from './phase';

/**
 * SkyAmbience — the public site's sky, on the visitor's own clock.
 *
 * The day runs through five phases and the backdrop follows it: a red sun climbing at dawn,
 * a washed-out blue at midday, the same sun swelling and reddening as it goes down, aurora
 * over a mountain skyline through the evening, and the full star field after 21:00. A
 * readout in the corner shows the time and where in that cycle you are.
 *
 * Dark mode only. Every phase is drawn as light against a dark ground — on a white page the
 * whole thing would be either invisible or filthy, so rather than build a second, worse
 * version of it for light mode, it simply does not appear there.
 *
 * Rendering it: drop `<SkyAmbience />` directly after `<SiteHeader />` in a public page, and
 * give that page's `<main>` and its footer `relative z-10`. The sky is `position: fixed` at
 * `z-index: 0`, which puts it above the page wrapper's own background but below any content
 * lifted out of the static flow — the header is already `z-50`, and the readout sits at 20.
 *
 * Previewing out of hours:
 *   ?sky=aurora        pin a phase (dawn | day | dusk | aurora | night)
 *   ?sky=dusk&t=0.85   pin a point within it, 0 at its start and 1 at its end
 *   ?sky=off           suppress it
 * You still have to be in dark mode for any of these to show anything.
 */

const PHASE_NAMES: readonly SkyPhase[] = ['dawn', 'day', 'dusk', 'aurora', 'night'];

interface Override {
  on: boolean;
  phase?: SkyPhase;
  progress?: number;
}

function readOverride(search: string): Override | null {
  const params = new URLSearchParams(search);
  // `nightsky` is the name this shipped under when it only knew how to draw one phase.
  const raw = params.get('sky') ?? params.get('nightsky');
  if (!raw) return null;

  if (raw === 'off' || raw === '0') return { on: false };
  if (raw === 'on' || raw === '1') return { on: true };

  const phase = PHASE_NAMES.find((p) => p === raw);
  if (!phase) return null;

  const t = Number.parseFloat(params.get('t') ?? '');
  return {
    on: true,
    phase,
    progress: Number.isFinite(t) ? Math.min(Math.max(t, 0), 1) : undefined,
  };
}

const Stage = lazy(() => import('./Stage'));

export default function SkyAmbience() {
  const { theme } = useTheme();
  const { search } = useLocation();

  const override = readOverride(search);
  if (theme !== 'dark' || override?.on === false) return null;

  return (
    <Suspense fallback={null}>
      <Stage forcePhase={override?.phase} forceProgress={override?.progress} />
    </Suspense>
  );
}

export { momentAt, PHASES } from './phase';
export type { SkyPhase } from './phase';
