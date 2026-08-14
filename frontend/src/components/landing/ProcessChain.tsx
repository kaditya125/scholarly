import { useId, useRef, type CSSProperties } from 'react';
import { motion, useInView, useReducedMotion } from 'motion/react';
import {
  ScanSearch,
  UserCircle2,
  Network,
  BookOpenText,
  BrainCircuit,
  ShieldCheck,
} from 'lucide-react';

/**
 * ProcessChain — the six-step reasoning pipeline for the "You can watch it think" section,
 * drawn as a rounded zigzag ribbon threaded through diamond nodes.
 *
 *        ╭───╮ label            ╭───╮ label
 *          │                      │              leader + dot
 *      ╭───────╮             ╭───────╮
 *   ───│   ◇   │───╮     ╭───│   ◇   │───         ribbon turns above/below each node
 *      ╰───────╯    ╲   ╱    ╰───────╯
 *            ◇        ╳        ◇                  nodes sit ON the mid line
 *
 * THE STRUCTURE THAT MAKES IT READ. Every node sits on the mid line, and the ribbon's rounded
 * turn is directly above or below it — so each diamond nests into the opening of its own turn
 * and the ribbon appears to pass behind it. Putting the nodes AT the turns instead (the obvious
 * reading) produces a different, flatter diagram: the ribbon then has nothing to wrap around.
 *
 * The turn direction also decides which side the label goes: a node whose turn dips below it
 * gets its label below, and vice versa. That keeps every leader line short and unambiguous.
 *
 * COLOUR. Monochrome, like the reference. That happens to suit this page better than the
 * multicolour chevron version did — the landing page runs on greys plus a single lime accent,
 * so a grey ribbon needs no special pleading. Light/dark values swap through CSS custom
 * properties on `.pc` rather than per-element classes.
 *
 * Desktop (xl and up): the full ribbon.
 * Below xl: a vertical numbered timeline — six 172px columns cannot hold this much text.
 */

/**
 * COLOUR. A ramp, not a rainbow — six hues walking from slate-blue round to the olive-lime
 * that neighbours the brand accent, so the chain reads as one journey arriving at an answer
 * rather than six unrelated stages. In dark mode the last title lands on #c8e558 itself.
 *
 * `hue` is used for the ribbon gradient, the node outline and the icon. Every one of the six
 * clears 3:1 against BOTH page backgrounds, which is the bar for meaningful graphics, so those
 * need no light/dark variants.
 *
 * Titles are text and need 4.5:1, and no single value clears that against both white and
 * #0b0b0c — hence the separate `tl` / `td` pair, swapped by the `.dark` class.
 */
const STEPS = [
  {
    icon: ScanSearch,
    title: 'It reads the question properly',
    body: 'Intent, the core concept and the entities involved — so "explain this" and "quiz me" take different paths.',
    hue: '#4a6fa5',
    tl: '#3d5c8a',
    td: '#8fb0e0',
  },
  {
    icon: UserCircle2,
    title: 'It loads who you are',
    body: 'Your exam, target year, level, subjects, and the topics you have struggled with before.',
    hue: '#3d8296',
    tl: '#2f6a7c',
    td: '#79c3d8',
  },
  {
    icon: Network,
    title: 'It maps the concept',
    body: 'A walk across the knowledge graph: what this topic depends on, and what sits next to it.',
    hue: '#35907e',
    tl: '#2a7566',
    td: '#6fcdb6',
  },
  {
    icon: BookOpenText,
    title: 'It retrieves the material',
    body: 'Semantic search across indexed curriculum, reranked so NCERT outranks a stray web page.',
    hue: '#3f9560',
    tl: '#337a4d',
    td: '#7ed19a',
  },
  {
    icon: BrainCircuit,
    title: 'It plans the explanation',
    body: 'Prerequisites first, then the idea, then where the exam actually tests it.',
    hue: '#5c9636',
    tl: '#4a7a2b',
    td: '#a3d472',
  },
  {
    icon: ShieldCheck,
    title: 'It writes and checks',
    body: 'Every claim in the draft is checked back against the retrieved passages before you see it.',
    hue: '#7d9420',
    tl: '#64781a',
    td: '#c8e558',
  },
];

const THEME_CSS = `
.pc { --node-fill:#ffffff; }
.dark .pc { --node-fill:#141416; }
.pc-step { --ttl: var(--tl); }
.dark .pc-step { --ttl: var(--td); }
`;

const stepVars = (s: (typeof STEPS)[number]) =>
  ({ '--tl': s.tl, '--td': s.td }) as CSSProperties;

// ─── Layout ──────────────────────────────────────────────────────────────────
// TOTAL_W (1080) fits the 1160px page container minus its 32px gutters (1096),
// which is why the ribbon is gated at xl rather than lg.

const SIDE_PAD = 24;
const PITCH = 172;        // node-to-node spacing
const RIBBON_T = 13;      // ribbon stroke width
const CORNER_R = 36;      // radius of each turn
const NODE_D = 96;        // diamond diagonal
const NODE_R = 20;        // corner radius of the diamond
const NODE_CLEAR = 12;    // white space between a diamond's tip and the ribbon — never zero
const ICON = 28;
const LEADER_L = 26;
const DOT_R = 3.5;
const LABEL_W = 190;
const LABEL_GAP = 12;
// Room for a label block. Sized for a two-line title, not the one-line common case: the
// scroll container's overflow-y computes to `auto`, so an under-sized canvas would clip.
const PAD_Y = 118;

const TOTAL_W = SIDE_PAD * 2 + PITCH * STEPS.length;

/**
 * The ribbon has to CLEAR each diamond, not graze it, so the amplitude is derived from the
 * clearance rather than guessed at.
 *
 * Two things make that non-obvious. A rounded turn never reaches its own corner point — the
 * quadratic through it peaks at (a + 2p + b)/4 — so the usable extent is always less than the
 * amplitude, and the shortfall itself depends on the amplitude. Hence the fixed-point solve,
 * which converges quickly here because d(extent)/d(amp) stays comfortably below 1.
 *
 * The tightest point is directly at a node's x, where the diamond's outer tip is nearest the
 * turn; everywhere else the arms are already falling away, so this one clearance governs.
 */
const TURN_EXTENT = NODE_D / 2 + RIBBON_T / 2 + NODE_CLEAR;   // centreline
const AMP = (() => {
  let amp = TURN_EXTENT;
  for (let i = 0; i < 60; i++) {
    const extent = amp - (CORNER_R * (2 * amp)) / Math.hypot(PITCH, 2 * amp) / 2;
    amp += TURN_EXTENT - extent;
  }
  return amp;
})();
const TURN_OUTER = TURN_EXTENT + RIBBON_T / 2;       // painted edge

const Y_MID = PAD_Y + TURN_OUTER + LEADER_L + DOT_R + LABEL_GAP;
const TOTAL_H = Y_MID * 2;

type Pt = { x: number; y: number };

const nodeX = (i: number) => SIDE_PAD + PITCH / 2 + i * PITCH;
/** Even steps turn downwards (label below); odd steps turn upwards (label above). */
const turnsDown = (i: number) => i % 2 === 0;

function unit(p0: Pt, p1: Pt) {
  const dx = p1.x - p0.x;
  const dy = p1.y - p0.y;
  const m = Math.hypot(dx, dy) || 1;
  return { x: dx / m, y: dy / m };
}

/**
 * Polyline through `pts` with every interior corner rounded to radius `r`.
 *
 * Each corner is cut back along both edges and bridged with a quadratic through the original
 * vertex. The cut is clamped to half the shorter edge so tight corners degrade to a smaller
 * radius instead of overshooting into the neighbouring segment.
 */
function roundedPolyline(pts: Pt[], r: number): string {
  if (pts.length < 3) return `M ${pts.map((p) => `${p.x},${p.y}`).join(' L ')}`;

  let d = `M ${pts[0].x},${pts[0].y}`;
  for (let i = 1; i < pts.length - 1; i++) {
    const p = pts[i];
    const prev = pts[i - 1];
    const next = pts[i + 1];
    const uPrev = unit(p, prev);
    const uNext = unit(p, next);
    const back = Math.min(r, Math.hypot(p.x - prev.x, p.y - prev.y) / 2);
    const fwd = Math.min(r, Math.hypot(p.x - next.x, p.y - next.y) / 2);

    d += ` L ${p.x + uPrev.x * back},${p.y + uPrev.y * back}`;
    d += ` Q ${p.x},${p.y} ${p.x + uNext.x * fwd},${p.y + uNext.y * fwd}`;
  }
  const last = pts[pts.length - 1];
  return `${d} L ${last.x},${last.y}`;
}

/** The ribbon: a flat stub at the mid line, a turn under or over each node, a stub out again. */
const RIBBON_PTS: Pt[] = [
  { x: SIDE_PAD, y: Y_MID },
  ...STEPS.map((_, i) => ({ x: nodeX(i), y: Y_MID + (turnsDown(i) ? AMP : -AMP) })),
  { x: TOTAL_W - SIDE_PAD, y: Y_MID },
];
const RIBBON_D = roundedPolyline(RIBBON_PTS, CORNER_R);

// ─── Desktop ribbon ──────────────────────────────────────────────────────────

function DesktopChain() {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, amount: 0.15 });
  const reduced = useReducedMotion();
  const revealed = reduced || inView;
  const gradId = `pc-grad-${useId().replace(/:/g, '')}`;

  return (
    <div ref={ref} className="pc hidden xl:block mt-16">
      <div className="w-full overflow-x-auto">
        <div className="relative mx-auto" style={{ width: TOTAL_W, height: TOTAL_H }}>
          <svg
            viewBox={`0 0 ${TOTAL_W} ${TOTAL_H}`}
            className="absolute inset-0 w-full h-full"
            aria-hidden
          >
            <defs>
              {/* Stops sit at the real node positions, so each node stands in its own colour
                  and the ribbon reads as one continuous ramp between them. userSpaceOnUse
                  keeps the stops in the same coordinates as the path. */}
              <linearGradient
                id={gradId}
                gradientUnits="userSpaceOnUse"
                x1={SIDE_PAD}
                y1={0}
                x2={TOTAL_W - SIDE_PAD}
                y2={0}
              >
                {STEPS.map((step, i) => (
                  <stop
                    key={step.title}
                    offset={(nodeX(i) - SIDE_PAD) / (TOTAL_W - SIDE_PAD * 2)}
                    stopColor={step.hue}
                  />
                ))}
              </linearGradient>
            </defs>

            {/* The ribbon draws itself left to right — it is a single stroke, so pathLength
                does the whole job without clips or masks. */}
            <motion.path
              d={RIBBON_D}
              fill="none"
              stroke={`url(#${gradId})`}
              strokeWidth={RIBBON_T}
              strokeLinecap="round"
              strokeLinejoin="round"
              initial={reduced ? false : { pathLength: 0 }}
              animate={{ pathLength: revealed ? 1 : 0 }}
              transition={{ duration: reduced ? 0 : 1.5, ease: [0.16, 1, 0.3, 1] }}
            />

            {STEPS.map((step, i) => {
              const x = nodeX(i);
              const down = turnsDown(i);
              const edge = Y_MID + (down ? TURN_OUTER : -TURN_OUTER);
              const tip = edge + (down ? LEADER_L : -LEADER_L);
              const delay = reduced ? 0 : 0.45 + i * 0.12;

              return (
                <motion.g
                  key={step.title}
                  initial={reduced ? false : { opacity: 0 }}
                  animate={{ opacity: revealed ? 1 : 0 }}
                  transition={{ duration: 0.4, delay }}
                >
                  <line
                    x1={x}
                    y1={edge}
                    x2={x}
                    y2={tip}
                    stroke={step.hue}
                    strokeOpacity={0.45}
                    strokeWidth={1.5}
                  />
                  <circle cx={x} cy={tip} r={DOT_R} fill={step.hue} />
                  {/* Rotated square = diamond. Drawn after the ribbon so it sits on top. */}
                  <rect
                    x={-NODE_D / 2 / Math.SQRT2}
                    y={-NODE_D / 2 / Math.SQRT2}
                    width={NODE_D / Math.SQRT2}
                    height={NODE_D / Math.SQRT2}
                    rx={NODE_R}
                    transform={`translate(${x},${Y_MID}) rotate(45)`}
                    fill="var(--node-fill)"
                    stroke={step.hue}
                    strokeWidth={3}
                  />
                </motion.g>
              );
            })}
          </svg>

          {/* Icons and labels as HTML so the type inherits the page's font stack */}
          {STEPS.map((step, i) => {
            const x = nodeX(i);
            const down = turnsDown(i);
            const Icon = step.icon;
            const delay = reduced ? 0 : 0.45 + i * 0.12;
            const labelEdge = TURN_OUTER + LEADER_L + DOT_R + LABEL_GAP;

            return (
              <div key={step.title} className="pc-step" style={stepVars(step)}>
                <motion.div
                  className="absolute"
                  style={{ left: x - ICON / 2, top: Y_MID - ICON / 2, color: step.hue }}
                  initial={reduced ? false : { opacity: 0, scale: 0.7 }}
                  animate={{ opacity: revealed ? 1 : 0, scale: revealed ? 1 : 0.7 }}
                  transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1], delay: delay + 0.08 }}
                  aria-hidden
                >
                  <Icon width={ICON} height={ICON} strokeWidth={1.5} />
                </motion.div>

                <motion.div
                  className="absolute text-center"
                  style={{
                    left: x - LABEL_W / 2,
                    width: LABEL_W,
                    ...(down
                      ? { top: Y_MID + labelEdge }
                      : { bottom: TOTAL_H - (Y_MID - labelEdge) }),
                  }}
                  initial={reduced ? false : { opacity: 0, y: down ? -6 : 6 }}
                  animate={{ opacity: revealed ? 1 : 0, y: revealed ? 0 : down ? -6 : 6 }}
                  transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1], delay: delay + 0.12 }}
                >
                  <h3
                    className="text-[14px] font-semibold leading-snug tracking-[-0.01em]"
                    style={{ color: 'var(--ttl)' }}
                  >
                    {step.title}
                  </h3>
                  <p className="mt-1.5 text-[11.5px] leading-[1.55] text-slate-500 dark:text-gray-400">
                    {step.body}
                  </p>
                </motion.div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ─── Vertical timeline (below xl) ────────────────────────────────────────────

function Timeline() {
  const reduced = useReducedMotion();

  return (
    <ol className="pc xl:hidden mt-12 sm:mt-14">
      {STEPS.map((step, i) => {
        const Icon = step.icon;
        return (
          <motion.li
            key={step.title}
            className="pc-step flex gap-4 sm:gap-5"
            style={stepVars(step)}
            initial={reduced ? false : { opacity: 0, y: 10 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: '-60px' }}
            transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1], delay: reduced ? 0 : i * 0.05 }}
          >
            <div className="flex flex-col items-center shrink-0">
              {/* Same diamond, at list scale */}
              <span
                className="w-11 h-11 flex items-center justify-center rotate-45 rounded-[10px] border-2"
                style={{
                  borderColor: step.hue,
                  backgroundColor: 'var(--node-fill)',
                  color: step.hue,
                }}
              >
                <Icon className="-rotate-45" width={19} height={19} strokeWidth={1.5} />
              </span>
              {i < STEPS.length - 1 && (
                <span
                  aria-hidden
                  className="w-0.5 flex-1 min-h-[28px] my-1.5 rounded-full"
                  // fades towards the next step's hue, mirroring the ribbon's ramp
                  style={{ backgroundImage: `linear-gradient(${step.hue}, ${STEPS[i + 1].hue})` }}
                />
              )}
            </div>

            <div className="pb-8">
              <span
                className="text-[11.5px] font-semibold tabular-nums tracking-[0.06em]"
                style={{ color: 'var(--ttl)' }}
              >
                STEP {String(i + 1).padStart(2, '0')}
              </span>
              <h3
                className="mt-1 text-[16px] font-semibold tracking-[-0.015em]"
                style={{ color: 'var(--ttl)' }}
              >
                {step.title}
              </h3>
              <p className="mt-1.5 max-w-[34rem] text-[14px] leading-relaxed text-slate-500 dark:text-gray-400">
                {step.body}
              </p>
            </div>
          </motion.li>
        );
      })}
    </ol>
  );
}

export default function ProcessChain() {
  return (
    <>
      <style>{THEME_CSS}</style>
      <DesktopChain />
      <Timeline />
    </>
  );
}
