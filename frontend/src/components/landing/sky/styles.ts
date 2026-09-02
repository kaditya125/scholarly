/**
 * The whole sky's stylesheet, injected once by the stage rather than a <style> tag per
 * layer. Keeping it in one place is what lets every phase share the same keyframes and
 * the same set of custom properties.
 *
 * The rule everything here obeys: animate `opacity` and `transform` only, so the browser
 * can run the sky on the compositor without repainting. The few properties that do change
 * on a phase tick — the wash gradient, the sun's position and colour — are given a long
 * `transition`, so a value recomputed once a minute slides instead of stepping.
 */

export const SKY_CSS = `
/* ── Stage ───────────────────────────────────────────────────────────────── */

.sky-root {
  position: fixed;
  inset: 0;
  z-index: 0;
  overflow: hidden;
  pointer-events: none;
  contain: layout paint style;
  animation: sky-rise 3s ease-out both;
}

/* Carries the scroll fade, kept separate from the root so the entrance animation and the
   scroll response multiply instead of fighting over one opacity. */
.sky-veil {
  position: absolute;
  inset: 0;
  opacity: var(--sky-fade, 1);
}

/* The base gradient. Everything else sits on top of this. */
.sky-wash {
  position: absolute;
  inset: 0;
  background: var(--sky-wash, transparent);
  transition: background 4s linear;
}

/* Colour pooled along the bottom edge — strongest at sunrise and sunset. */
.sky-horizon {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  height: 62%;
  background: linear-gradient(to top, rgba(var(--sky-horizon, 0,0,0), var(--sky-horizon-a, 0)) 0%, rgba(var(--sky-horizon, 0,0,0), 0) 100%);
  transition: background 4s linear;
}

@keyframes sky-rise { from { opacity: 0; } to { opacity: 1; } }

/* ── Stars ───────────────────────────────────────────────────────────────── */

/* One opacity for the whole star system, so a phase can fade them in or out as a unit. */
.sky-stars {
  position: absolute;
  inset: 0;
  opacity: var(--sky-star-a, 1);
  transition: opacity 6s linear;
}

.sky-field {
  position: absolute;
  inset: -14%;
  background-repeat: repeat;
}

.sky-field--dust { animation: sky-shimmer-a 13s ease-in-out infinite alternate, sky-drift-a 260s linear infinite alternate; }
.sky-field--far  { animation: sky-shimmer-b 17s ease-in-out infinite alternate, sky-drift-b 210s linear infinite alternate; }
.sky-field--mid  { animation: sky-shimmer-a 9s  ease-in-out infinite alternate, sky-drift-c 150s linear infinite alternate; }
.sky-field--near { animation: sky-shimmer-b 6s  ease-in-out infinite alternate, sky-drift-b 110s linear infinite alternate; }

.sky-glint {
  position: absolute;
  border-radius: 9999px;
  opacity: 0;
  animation: sky-glint var(--d) ease-in-out var(--delay) infinite;
}

@keyframes sky-shimmer-a { from { opacity: 0.62; } to { opacity: 1; } }
@keyframes sky-shimmer-b { from { opacity: 1; } to { opacity: 0.55; } }

@keyframes sky-drift-a { from { transform: translate3d(0,0,0); } to { transform: translate3d(28px,-16px,0); } }
@keyframes sky-drift-b { from { transform: translate3d(0,0,0); } to { transform: translate3d(-34px,12px,0); } }
@keyframes sky-drift-c { from { transform: translate3d(0,0,0); } to { transform: translate3d(18px,22px,0); } }

@keyframes sky-glint {
  0%, 100% { opacity: 0.06; transform: scale(0.55); }
  50%      { opacity: var(--a); transform: scale(1); }
}

/* ── Night: galactic band, moon, planets, meteors ────────────────────────── */

.sky-band {
  position: absolute;
  left: -28%;
  right: -28%;
  top: -20%;
  height: 96%;
  transform: rotate(-13deg);
  background:
    radial-gradient(58% 40% at 50% 50%, rgba(171,153,255,0.14) 0%, rgba(124,143,255,0.07) 40%, rgba(124,143,255,0) 74%),
    radial-gradient(36% 19% at 31% 45%, rgba(255,197,152,0.09) 0%, rgba(255,197,152,0) 72%),
    radial-gradient(29% 15% at 71% 56%, rgba(142,221,255,0.085) 0%, rgba(142,221,255,0) 72%);
}

.sky-body {
  position: absolute;
  animation: sky-float var(--d) ease-in-out infinite alternate;
}

@keyframes sky-float {
  from { transform: translate3d(0,0,0); }
  to   { transform: translate3d(0,-14px,0); }
}

.sky-meteor {
  position: absolute;
  width: 150px;
  height: 1.5px;
  border-radius: 9999px;
  background: linear-gradient(90deg, rgba(255,255,255,0) 0%, rgba(255,255,255,0.35) 55%, rgba(255,255,255,0.95) 100%);
  opacity: 0;
  animation: sky-meteor var(--d) linear var(--delay) infinite;
}

/* Idle for most of the cycle — a meteor you can predict stops being a meteor. */
@keyframes sky-meteor {
  0%   { opacity: 0; transform: translate3d(0,0,0) rotate(var(--angle)); }
  1.5% { opacity: 0; }
  3%   { opacity: 0.85; }
  9%   { opacity: 0; transform: translate3d(var(--dx), var(--dy), 0) rotate(var(--angle)); }
  100% { opacity: 0; transform: translate3d(var(--dx), var(--dy), 0) rotate(var(--angle)); }
}

/* ── Sun: dawn, day, dusk ────────────────────────────────────────────────── */

/* Positioned by its centre, so the disc can sit half-below the bottom edge. */
.sky-sun, .sky-sun-halo {
  position: absolute;
  left: var(--sun-x);
  top: var(--sun-y);
  border-radius: 9999px;
  transform: translate(-50%, -50%);
  transition: left 4s linear, top 4s linear, width 4s linear, height 4s linear, background 4s linear, opacity 4s linear;
}

.sky-sun {
  width: var(--sun-size);
  height: var(--sun-size);
  background: radial-gradient(circle at 50% 50%,
    rgba(var(--sun-core), 0.96) 0%,
    rgba(var(--sun-core), 0.82) 38%,
    rgba(var(--sun-edge), 0.42) 68%,
    rgba(var(--sun-edge), 0) 100%);
  opacity: var(--sun-a, 0);
}

/* A separate, much larger bloom — this is what makes a low sun read as *low*. */
.sky-sun-halo {
  width: calc(var(--sun-size) * 5.2);
  height: calc(var(--sun-size) * 5.2);
  background: radial-gradient(circle at 50% 50%,
    rgba(var(--sun-edge), 0.30) 0%,
    rgba(var(--sun-edge), 0.13) 32%,
    rgba(var(--sun-edge), 0.04) 58%,
    rgba(var(--sun-edge), 0) 100%);
  opacity: var(--sun-a, 0);
}

.sky-cloud {
  position: absolute;
  border-radius: 9999px;
  background: radial-gradient(60% 100% at 50% 60%, rgba(var(--cloud), var(--cloud-a)) 0%, rgba(var(--cloud), 0) 100%);
  animation: sky-drift-cloud var(--d) linear infinite alternate;
  transition: background 4s linear;
}

@keyframes sky-drift-cloud {
  from { transform: translate3d(-4%, 0, 0); }
  to   { transform: translate3d(6%, -1.5%, 0); }
}

/* ── Aurora ──────────────────────────────────────────────────────────────── */

/*
 * Each curtain is a soft vertical band of colour, striated along its length to suggest
 * the field lines, masked so it dissolves before it reaches the ground, and blended
 * additively so overlapping curtains brighten the way real ones do.
 */
.sky-curtain {
  position: absolute;
  top: -12%;
  height: 80%;
  background:
    repeating-linear-gradient(94deg,
      rgba(255,255,255,0) 0px,
      rgba(255,255,255,0.05) 3px,
      rgba(255,255,255,0) 9px),
    linear-gradient(to right,
      rgba(var(--c), 0) 0%,
      rgba(var(--c), 0.42) 30%,
      rgba(var(--c), 0.72) 50%,
      rgba(var(--c), 0.38) 70%,
      rgba(var(--c), 0) 100%);
  -webkit-mask-image: linear-gradient(to bottom, rgba(0,0,0,0) 0%, rgba(0,0,0,0.9) 24%, rgba(0,0,0,0.5) 64%, rgba(0,0,0,0) 100%);
  mask-image: linear-gradient(to bottom, rgba(0,0,0,0) 0%, rgba(0,0,0,0.9) 24%, rgba(0,0,0,0.5) 64%, rgba(0,0,0,0) 100%);
  filter: blur(16px);
  mix-blend-mode: screen;
  opacity: var(--a);
  animation: sky-curtain var(--d) ease-in-out var(--delay) infinite alternate;
}

@keyframes sky-curtain {
  0%   { transform: translate3d(0, 0, 0) skewX(-7deg) scaleY(1); }
  50%  { transform: translate3d(3%, -2%, 0) skewX(5deg) scaleY(1.09); }
  100% { transform: translate3d(-2%, 1%, 0) skewX(-3deg) scaleY(0.95); }
}

/* The ground the aurora is seen from. Flat black silhouette, no detail — at this size
   detail would read as noise, and the shape alone is what says "mountains". */
.sky-ridge {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  width: 100%;
  height: clamp(88px, 17vh, 190px);
  display: block;
}

/* ── Clock ───────────────────────────────────────────────────────────────── */

.sky-clock {
  position: fixed;
  left: 20px;
  bottom: 20px;
  z-index: 20;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 12px 8px 9px;
  border-radius: 12px;
  border: 1px solid rgba(255,255,255,0.10);
  background: rgba(10,10,12,0.55);
  backdrop-filter: blur(14px);
  -webkit-backdrop-filter: blur(14px);
  color: rgba(255,255,255,0.86);
  font-variant-numeric: tabular-nums;
  pointer-events: auto;
  animation: sky-rise 3s ease-out both;
  transition: border-color 0.25s, background 0.25s;
}

.sky-clock:hover { border-color: rgba(255,255,255,0.2); background: rgba(10,10,12,0.72); }

.sky-clock-dial { display: block; flex: none; }

.sky-clock-read {
  display: flex;
  flex-direction: column;
  gap: 1px;
  line-height: 1.25;
}

.sky-clock-time {
  font-family: ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace;
  font-size: 13px;
  font-weight: 600;
  letter-spacing: 0.02em;
}

.sky-clock-zone {
  font-family: ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace;
  font-size: 9.5px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: rgba(255,255,255,0.45);
}

.sky-clock-phase {
  font-size: 10px;
  letter-spacing: 0.09em;
  text-transform: uppercase;
  font-weight: 600;
  color: var(--phase-tint, rgba(255,255,255,0.7));
}

.sky-clock-note { font-size: 10px; color: rgba(255,255,255,0.42); }

/* Below sm the readout drops to the dial and the time — the rest is not worth the width. */
@media (max-width: 640px) {
  .sky-clock { left: 12px; bottom: 12px; padding: 6px 10px 6px 7px; gap: 8px; }
  .sky-clock-zone, .sky-clock-note { display: none; }
}

/* ── Reach ───────────────────────────────────────────────────────────────── */

/* On small screens the sky sits behind body copy with no side gutters to hide in. */
@media (max-width: 640px) {
  .sky-veil { opacity: calc(var(--sky-fade, 1) * 0.72); }
  .sky-curtain { filter: blur(11px); }
}

@media (prefers-reduced-motion: reduce) {
  .sky-root, .sky-root *, .sky-clock { animation: none !important; }
  .sky-glint { opacity: var(--a); }
  .sky-meteor { display: none; }
}
`;
