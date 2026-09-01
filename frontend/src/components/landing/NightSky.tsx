import { Suspense, lazy, useEffect, useState } from 'react';
import { useTheme } from '../../lib/ThemeContext';

/**
 * NightSky — the public site's after-dark backdrop.
 *
 * Between 9pm and 5am on the visitor's own clock, and only in dark mode, a galaxy fades in
 * behind the page: a soft Milky Way band, four tiled star fields at different depths, a
 * handful of individually scintillating stars, a crescent moon, a ringed planet and a
 * distant one, and the occasional meteor. The drawing lives in `NightSkyLayers.tsx`; this
 * module is only the gate, so the heavy half never loads in daylight or in light mode.
 *
 * Rendering it: drop `<NightSky />` directly after `<SiteHeader />` in a public page, and
 * give that page's `<main>` and its footer `relative z-10`. The sky is `position: fixed`
 * at `z-index: 0`, which puts it above the page wrapper's own background but below any
 * content lifted out of the static flow — the header is already `z-50`.
 *
 * Testing outside the window: append `?nightsky=on` to the URL. You still have to be in
 * dark mode — the sky is drawn for a dark canvas and nothing else. `?nightsky=off`
 * suppresses it.
 */

/** Local wall-clock hour the sky rises at. */
export const NIGHT_START_HOUR = 21; // 9pm
/** Local wall-clock hour it sets at. */
export const NIGHT_END_HOUR = 5; // 5am

const isNightHour = (now = new Date()) => {
  const h = now.getHours();
  return h >= NIGHT_START_HOUR || h < NIGHT_END_HOUR;
};

const readOverride = (): boolean | null => {
  if (typeof window === 'undefined') return null;
  const v = new URLSearchParams(window.location.search).get('nightsky');
  if (v === 'on' || v === '1') return true;
  if (v === 'off' || v === '0') return false;
  return null;
};

/**
 * True when the visitor is looking at a dark page after dark. Re-checked once a minute and
 * whenever the tab comes back to the front, so a page left open through 9pm picks the sky
 * up on its own rather than waiting for a reload.
 */
export function useIsNight(): boolean {
  const { theme } = useTheme();
  const [afterDark, setAfterDark] = useState(() => readOverride() ?? isNightHour());

  useEffect(() => {
    const check = () => setAfterDark(readOverride() ?? isNightHour());
    check();
    const id = window.setInterval(check, 60_000);
    document.addEventListener('visibilitychange', check);
    return () => {
      window.clearInterval(id);
      document.removeEventListener('visibilitychange', check);
    };
  }, []);

  return afterDark && theme === 'dark';
}

const NightSkyLayers = lazy(() => import('./NightSkyLayers'));

export default function NightSky() {
  const night = useIsNight();
  if (!night) return null;

  return (
    <Suspense fallback={null}>
      <NightSkyLayers />
    </Suspense>
  );
}
