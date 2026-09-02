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

/*
 * The clock needs its own, because the shared one ends at opacity 1 and fill:both makes an
 * animation's final value persist at animation priority — which outranks a plain declaration
 * AND a :hover rule. Reusing sky-rise would therefore have pinned the readout at full opacity
 * forever and silently made both the 0.55 resting state and the hover lift dead code.
 *
 * Ends on the resting value instead, with fill:backwards rather than both: it holds opacity 0
 * before the animation starts, then hands control back to the stylesheet when it finishes, so
 * hover works and there is no jump at the handover.
 */
@keyframes sky-clock-rise { from { opacity: 0; } to { opacity: 0.55; } }

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

/*
 * No card. The readout sits directly on the sky.
 *
 * It used to be a 200x60 panel — 1px border, rgba(10,10,12,0.55) fill, 14px backdrop blur — and
 * a frosted rectangle is precisely the thing you notice instead of the sky behind it. Since the
 * whole point of this component is the backdrop, the instrument reading it should recede.
 *
 * What replaces the panel for legibility is a text-shadow rather than a fill: the sky runs from
 * a washed pale blue at noon to near-black at 21:00, so the readout needs to survive a light
 * ground without ever drawing an edge of its own. A shadow does that and has no shape.
 *
 * It also rests at 55% opacity and comes up to full on hover — present when looked for, quiet
 * when not.
 */
.sky-clock {
  position: fixed;
  left: 18px;
  bottom: 16px;
  z-index: 20;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 0;
  border: 0;
  background: none;
  color: rgba(255,255,255,0.9);
  font-variant-numeric: tabular-nums;
  pointer-events: auto;
  opacity: 0.55;
  text-shadow: 0 1px 10px rgba(0,0,0,0.85), 0 0 2px rgba(0,0,0,0.6);
  animation: sky-clock-rise 3s ease-out backwards;
  transition: opacity 0.4s ease;
}

.sky-clock:hover { opacity: 1; }

/* The dial gets the same lift as the type, since it has no fill to sit on either. */
.sky-clock-dial {
  display: block;
  flex: none;
  filter: drop-shadow(0 1px 6px rgba(0,0,0,0.8));
}

.sky-clock-read {
  display: flex;
  flex-direction: column;
  gap: 1px;
  line-height: 1.2;
}

.sky-clock-time {
  font-family: ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace;
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0.01em;
}

.sky-clock-phase {
  font-size: 9px;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  font-weight: 600;
  color: var(--phase-tint, rgba(255,255,255,0.7));
  white-space: nowrap;
}

.sky-clock-note { font-size: 9px; font-weight: 500; color: rgba(255,255,255,0.5); }

/* Below sm the readout drops to the dial and the time — the rest is not worth the width. */
@media (max-width: 640px) {
  .sky-clock { left: 12px; bottom: 12px; gap: 7px; }
  .sky-clock-note { display: none; }
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
