import { useEffect, useMemo, useRef, useState } from 'react';
import { useReducedMotion } from 'motion/react';
import { momentAt, type SkyPhase } from './phase';
import { skyVarsFor } from './palette';
import { SKY_CSS } from './styles';
import StarLayer from './StarLayer';
import SolarLayer from './SolarLayer';
import AuroraLayer from './AuroraLayer';
import NightLayer from './NightLayer';
import SkyClock from './SkyClock';

/**
 * The fixed layer behind the page, and the thing that decides which parts of the sky are
 * on stage at this hour.
 *
 * Phase and progress are recomputed once a minute; everything they feed is a custom
 * property with a long CSS transition on it, so the sun crosses the viewport and the sky
 * reddens continuously rather than stepping once a minute.
 *
 * Layers are mounted per phase rather than kept at zero opacity — an invisible star field
 * still costs the compositor work on every frame, and there is no reason to pay it at noon.
 */

interface Props {
  /** Set by `?sky=<phase>`, which pins a phase so it can be looked at out of hours. */
  forcePhase?: SkyPhase;
  /** Set by `?sky=<phase>&t=0.8`, to look at a particular point within that phase. */
  forceProgress?: number;
}

export default function Stage({ forcePhase, forceProgress }: Props) {
  const reducedMotion = useReducedMotion();
  const veilRef = useRef<HTMLDivElement>(null);
  const [compact, setCompact] = useState(false);
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const mq = window.matchMedia('(max-width: 640px)');
    const sync = () => setCompact(mq.matches);
    sync();
    mq.addEventListener('change', sync);
    return () => mq.removeEventListener('change', sync);
  }, []);

  // Once a minute is enough: the slowest phase runs 8 hours and the fastest 2, so a minute
  // is a fraction of a percent of progress either way.
  useEffect(() => {
    const tick = () => setNow(new Date());
    const id = window.setInterval(tick, 60_000);
    document.addEventListener('visibilitychange', tick);
    return () => {
      window.clearInterval(id);
      document.removeEventListener('visibilitychange', tick);
    };
  }, []);

  // The sky belongs to the top of the page. Past the first screen it recedes, so no section
  // of body copy has to compete with it for contrast. Written straight to a custom property
  // rather than to state — this runs on every scroll frame.
  useEffect(() => {
    let frame = 0;
    const apply = () => {
      frame = 0;
      const travel = Math.min(window.scrollY / (window.innerHeight * 0.9), 1);
      veilRef.current?.style.setProperty('--sky-fade', (1 - travel * 0.72).toFixed(3));
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(apply);
    };
    apply();
    window.addEventListener('scroll', onScroll, { passive: true });
    // A resize changes the viewport height the fade is measured against, and fires no scroll.
    window.addEventListener('resize', onScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
      if (frame) cancelAnimationFrame(frame);
    };
  }, []);

  const live = momentAt(now);
  const phase = forcePhase ?? live.window.phase;
  const progress = forcePhase ? (forceProgress ?? 0.5) : live.progress;

  const vars = useMemo(() => skyVarsFor(phase, progress), [phase, progress]);

  const showStars = phase !== 'day';
  const showSun = phase === 'dawn' || phase === 'day' || phase === 'dusk';
  // The moon is up during an aurora too — carrying it across the 21:00 boundary at partial
  // strength is what stops that handover reading as a cut.
  const nightIntensity = phase === 'night' ? 1 : phase === 'aurora' ? 0.18 + progress * 0.34 : 0;

  return (
    <>
      <style>{SKY_CSS}</style>

      <div className="sky-root" style={vars as React.CSSProperties} aria-hidden>
        <div className="sky-veil" ref={veilRef}>
          <div className="sky-wash" />
          <div className="sky-horizon" />

          {showStars && <StarLayer compact={compact} />}
          {showSun && <SolarLayer compact={compact} />}
          {phase === 'aurora' && <AuroraLayer compact={compact} />}
          {nightIntensity > 0 && (
            <NightLayer compact={compact} reducedMotion={!!reducedMotion} intensity={nightIntensity} />
          )}
        </div>
      </div>

      <SkyClock pinnedPhase={forcePhase} />
    </>
  );
}
