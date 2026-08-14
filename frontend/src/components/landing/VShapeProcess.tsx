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
 * VShapeProcess — the six-step reasoning pipeline for the "You can watch it think" section,
 * drawn as an alternating V-shape process chain modelled on the PowerPoint template of the
 * same name.
 *
 *      [ coloured title ]              [ coloured title ]
 *      [   body copy    ]              [   body copy    ]
 *              ╱╲                              ╱╲
 *   ▔▔▔▔▔▔╱▔▔╲▔▔▔▔▔▔▔▔╱▔▔╲▔▔▔▔▔▔        every chevron begins and ends
 *    ╲   ╱  ⚙   ╲   ╱      ╲   ╱          on the SAME mid line; valleys
 *     ╲ ╱   icon  ╲ ╱        ╲ ╱           dip below it, peaks rise above
 *      ╲╱          ╲╱          ╲╱
 *   [ coloured title ]              [ coloured title ]
 *
 * Three details carry the template's look, and all three are easy to get wrong:
 *
 *  1. CONTINUITY. Every chevron starts and ends at Y_MID. Anchoring valleys to a "top row"
 *     and peaks to a "bottom row" instead leaves a 2*AMP break between each pair.
 *
 *  2. ICON PLACEMENT. Icons do NOT sit on the vertices. They sit in the diamond of empty
 *     space on the OPPOSITE side of the mid line from their own vertex — above each valley,
 *     below each peak — as plain line art with no badge behind them.
 *
 *  3. TWO-TONE ARMS. The incoming (left) arm is the lighter shade, the outgoing (right) arm
 *     and its arrowhead are the darker one.
 *
 * COLOUR. Titles are coloured to match their chevron, as in the template. The template's own
 * title colours sit at 2.4–3:1 on white, so each hue here is darkened to clear 4.5:1 while
 * staying unmistakably the same colour. No single value can clear 4.5:1 against both white
 * and #0b0b0c, so every step carries a light-mode and a dark-mode triple, swapped by the
 * `.dark` class through CSS custom properties (see STEP_THEME_CSS).
 *
 * Desktop (xl and up): the full horizontal zigzag.
 * Below xl: a vertical numbered timeline — six 154px columns cannot hold this much text.
 */

type Step = {
  icon: typeof ScanSearch;
  title: string;
  body: string;
  /** light mode: [incoming arm, outgoing arm + head, title] */
  light: [string, string, string];
  /** dark mode: same triple, lifted so nothing sinks into the page background */
  dark: [string, string, string];
};

const STEPS: Step[] = [
  {
    icon: ScanSearch,
    title: 'It reads the question properly',
    body: 'Intent, the core concept and the entities involved — so "explain this" and "quiz me" take different paths.',
    light: ['#83a06a', '#4d6b3e', '#4f7a3d'],
    dark: ['#8fb877', '#6a9455', '#93cc80'],
  },
  {
    icon: UserCircle2,
    title: 'It loads who you are',
    body: 'Your exam, target year, level, subjects, and the topics you have struggled with before.',
    light: ['#e9b44c', '#c8871f', '#a8761a'],
    dark: ['#edc06b', '#d19a35', '#e8bd63'],
  },
  {
    icon: Network,
    title: 'It maps the concept',
    body: 'A walk across the knowledge graph: what this topic depends on, and what sits next to it.',
    light: ['#6cc5de', '#3d9dc0', '#2b7d9c'],
    dark: ['#86d3e8', '#55aecd', '#78cde4'],
  },
  {
    icon: BookOpenText,
    title: 'It retrieves the material',
    body: 'Semantic search across indexed curriculum, reranked so NCERT outranks a stray web page.',
    light: ['#e2604c', '#c0392b', '#bb3826'],
    dark: ['#ea8271', '#d05b47', '#f0907c'],
  },
  {
    icon: BrainCircuit,
    title: 'It plans the explanation',
    body: 'Prerequisites first, then the idea, then where the exam actually tests it.',
    light: ['#7b87dc', '#4a57b5', '#4550a8'],
    dark: ['#9aa4e8', '#6f7ccd', '#a2abe8'],
  },
  {
    icon: ShieldCheck,
    title: 'It writes and checks',
    body: 'Every claim in the draft is checked back against the retrieved passages before you see it.',
    light: ['#2d4a6b', '#17293e', '#1c3350'],
    dark: ['#6b87a8', '#4c6785', '#9db4cc'],
  },
];

/**
 * Each step element carries its six raw colours inline; this resolves them to the three the
 * markup actually consumes, so the light/dark swap is a class change rather than a re-render.
 */
const STEP_THEME_CSS = `
.vsp-step { --arm-in: var(--l0); --arm-out: var(--l1); --ttl: var(--l2); }
.dark .vsp-step { --arm-in: var(--d0); --arm-out: var(--d1); --ttl: var(--d2); }
`;

function stepVars(step: Step): CSSProperties {
  return {
    '--l0': step.light[0], '--l1': step.light[1], '--l2': step.light[2],
    '--d0': step.dark[0], '--d1': step.dark[1], '--d2': step.dark[2],
  } as CSSProperties;
}

// ─── Layout ──────────────────────────────────────────────────────────────────
// TOTAL_W (1084) fits the 1160px page container minus its 32px gutters (1096),
// which is why the zigzag is gated at xl rather than lg.

const SIDE_PAD = 24;      // lets the first and last label stay centred on their vertex
const COL_W = 172;        // pitch from one chevron's vertex to the next
const GAP = 30;           // clear space between an arrow tip and the next chevron's tail
const AMP = 66;           // vertical travel from the mid line to a vertex
const ARM_T = 26;         // PERPENDICULAR thickness of an arm (it is a stroke width)
const HEAD_L = 26;        // arrowhead length, measured along the arm
const HEAD_FLARE = 1.9;   // arrowhead width as a multiple of the arm's half thickness
const FOLD = 26;          // reach of the crease shadow along each arm from the inner corner
const ICON = 34;
const ICON_OFF = 30;      // icon distance from the mid line, opposite its own vertex
const LABEL_W = 200;
const LABEL_GAP = 14;     // chevron outer edge → label
const PAD_Y = 122;        // vertical room reserved for a label block

const TOTAL_W = SIDE_PAD * 2 + COL_W * STEPS.length;
const Y_MID = PAD_Y + AMP + ARM_T / 2 + LABEL_GAP;
const TOTAL_H = Y_MID * 2;

type Pt = { x: number; y: number };

/** Unit vector from `p0` towards `p1`. */
function unit(p0: Pt, p1: Pt) {
  const dx = p1.x - p0.x;
  const dy = p1.y - p0.y;
  const m = Math.hypot(dx, dy) || 1;
  return { x: dx / m, y: dy / m };
}

/**
 * Triangular head whose TIP lands exactly on `to`, pointing along `from`→`to`.
 *
 * Anchoring the tip (rather than growing the head past the arm) is what lets one chevron end
 * precisely where the next begins: the arrow reads as the join instead of floating in a gap.
 * The base is pulled 2px further back so it always overlaps the arm stroke — same colour, so
 * the overlap is invisible and no seam can appear at the shoulders.
 *
 * `halfW` needs no cos-correction: the arms are strokes, so ARM_T is already measured
 * perpendicular to the arm rather than vertically.
 */
function headPath(from: Pt, to: Pt): string {
  const u = unit(from, to);
  const nx = -u.y;
  const ny = u.x;
  const halfW = (ARM_T / 2) * HEAD_FLARE;
  const base = { x: to.x - u.x * (HEAD_L + 2), y: to.y - u.y * (HEAD_L + 2) };

  return `M ${base.x + nx * halfW},${base.y + ny * halfW} L ${to.x},${to.y} L ${base.x - nx * halfW},${base.y - ny * halfW} Z`;
}

/**
 * Chevron `i` as a centreline: a → v → d, inset by GAP/2 at each end so consecutive chevrons
 * stand clear of one another while their vertices stay exactly COL_W apart (which is what keeps
 * the icons and labels on a regular pitch).
 *
 * The vertex needs no explicit blunting: drawing the centreline as a stroke with a round
 * linejoin rounds the OUTER corner by exactly ARM_T/2 and leaves the inner corner sharp, which
 * is the template's apex and cheaper than modelling it as geometry.
 *
 * FOLD GEOMETRY. Fold a paper ribbon and the crease lands on the BISECTOR of the bend — not
 * square to either arm. So the two tones must change along that bisector, and the crease shadow
 * sits in the notch behind it:
 *
 *   · `crease`    unit vector from the vertex towards the inner corner (the bisector itself)
 *   · `foldClip`  half-plane on the OUTGOING side of the crease; painting the whole chevron a
 *                 second time in the dark tone through this clip puts the tone change exactly
 *                 on the crease while preserving the round join on both sides
 *   · `foldShade` a small wedge hugging the inner corner, darkened slightly, which is the
 *                 shadow the near face casts on the far one at a fold
 */
function chevron(i: number) {
  const x0 = SIDE_PAD + i * COL_W;
  const xMid = x0 + COL_W / 2;
  const isValley = i % 2 === 0;
  const yV = isValley ? Y_MID + AMP : Y_MID - AMP;
  const h = ARM_T / 2;

  const a: Pt = { x: x0 + GAP / 2, y: Y_MID };
  const v: Pt = { x: xMid, y: yV };
  const d: Pt = { x: x0 + COL_W - GAP / 2, y: Y_MID };
  const uIn = unit(a, v);
  const uOut = unit(v, d);

  // Bisector of the bend. uOut - uIn points from the vertex towards the inner corner.
  const cRaw = { x: uOut.x - uIn.x, y: uOut.y - uIn.y };
  const cLen = Math.hypot(cRaw.x, cRaw.y) || 1;
  const crease = { x: cRaw.x / cLen, y: cRaw.y / cLen };
  const across = { x: -crease.y, y: crease.x };
  // orient `across` towards the outgoing arm so the clip keeps the right half
  const s = uOut.x * across.x + uOut.y * across.y >= 0 ? 1 : -1;

  const L = 600; // comfortably larger than the drawing
  const corner = (alongCrease: number, offAcross: number) =>
    `${v.x + crease.x * alongCrease * L + across.x * offAcross * s * L},` +
    `${v.y + crease.y * alongCrease * L + across.y * offAcross * s * L}`;

  // Where the two inner edges actually meet: h / sin(angle between crease and arm).
  const sinA = Math.abs(crease.x * uOut.y - crease.y * uOut.x) || 1;
  const inner: Pt = { x: v.x + crease.x * (h / sinA), y: v.y + crease.y * (h / sinA) };

  return {
    isValley,
    a,
    v,
    d,
    /** where the outgoing arm stops so the arrowhead occupies the last HEAD_L of it */
    armEnd: { x: d.x - uOut.x * HEAD_L, y: d.y - uOut.y * HEAD_L } as Pt,
    foldClip: `M ${corner(1, 0)} L ${corner(-1, 0)} L ${corner(-1, 1)} L ${corner(1, 1)} Z`,
    foldShade:
      `M ${inner.x},${inner.y} ` +
      `L ${inner.x - uIn.x * FOLD},${inner.y - uIn.y * FOLD} ` +
      `L ${inner.x + uOut.x * FOLD},${inner.y + uOut.y * FOLD} Z`,
    vertexX: xMid,
    vertexY: yV,
  };
}

// ─── Desktop zigzag ──────────────────────────────────────────────────────────

function DesktopVShape() {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, amount: 0.15 });
  const reduced = useReducedMotion();
  const clipId = useId().replace(/:/g, '');

  const revealed = reduced || inView;

  return (
    <div ref={ref} className="hidden xl:block mt-16">
      {/* overflow guard: the drawing is fixed-width, so it scrolls itself rather than the page */}
      <div className="w-full overflow-x-auto">
        <div className="relative mx-auto" style={{ width: TOTAL_W, height: TOTAL_H }}>
          <svg
            viewBox={`0 0 ${TOTAL_W} ${TOTAL_H}`}
            className="absolute inset-0 w-full h-full"
            aria-hidden
          >
            <defs>
              <clipPath id={clipId}>
                {/* One wipe reveals the whole chain left-to-right — the flow itself is the
                    animation, so no per-chevron SVG transforms are needed. */}
                <motion.rect
                  x={0}
                  y={0}
                  height={TOTAL_H}
                  initial={{ width: reduced ? TOTAL_W : 0 }}
                  animate={{ width: revealed ? TOTAL_W : 0 }}
                  transition={{ duration: reduced ? 0 : 1.2, ease: [0.16, 1, 0.3, 1] }}
                />
              </clipPath>
            </defs>

            <g clipPath={`url(#${clipId})`}>
              {STEPS.map((step, i) => {
                const { a, v, d, armEnd, foldClip, foldShade } = chevron(i);
                const spine = `M ${a.x},${a.y} L ${v.x},${v.y} L ${armEnd.x},${armEnd.y}`;
                const foldId = `${clipId}-fold-${i}`;
                return (
                  <g
                    key={step.title}
                    className="vsp-step"
                    style={stepVars(step)}
                    fill="none"
                    strokeWidth={ARM_T}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <clipPath id={foldId}>
                      <path d={foldClip} />
                    </clipPath>

                    {/* The ribbon's near face. The round linecap is what gives the tail its
                        rounded end; the round linejoin is the apex. */}
                    <path d={spine} stroke="var(--arm-in)" />

                    {/* The same ribbon again in the far-face tone, clipped to the outgoing side
                        of the crease — so the tones change exactly along the fold line. */}
                    <g clipPath={`url(#${foldId})`}>
                      <path d={spine} stroke="var(--arm-out)" />
                    </g>

                    {/* Shadow in the notch behind the fold. Plain black at low alpha rather than
                        a per-step colour, so it reads the same in light and dark mode. */}
                    <path d={foldShade} fill="#000" fillOpacity={0.13} stroke="none" />

                    <path d={headPath(v, d)} fill="var(--arm-out)" stroke="none" />
                  </g>
                );
              })}
            </g>
          </svg>

          {/* Overlay: line icon in the empty diamond opposite the vertex, label outside it */}
          {STEPS.map((step, i) => {
            const { isValley, vertexX, vertexY } = chevron(i);
            const Icon = step.icon;
            const delay = reduced ? 0 : 0.2 + i * 0.12;
            const iconY = isValley ? Y_MID - ICON_OFF : Y_MID + ICON_OFF;

            return (
              <div key={step.title} className="vsp-step" style={stepVars(step)}>
                <motion.div
                  className="absolute text-slate-700 dark:text-gray-300"
                  style={{ left: vertexX - ICON / 2, top: iconY - ICON / 2, zIndex: 10 }}
                  initial={reduced ? false : { opacity: 0, scale: 0.75 }}
                  animate={revealed ? { opacity: 1, scale: 1 } : { opacity: 0, scale: 0.75 }}
                  transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1], delay }}
                  aria-hidden
                >
                  <Icon width={ICON} height={ICON} strokeWidth={1.4} />
                </motion.div>

                <motion.div
                  className="absolute text-center"
                  style={{
                    left: vertexX - LABEL_W / 2,
                    width: LABEL_W,
                    // valleys hang below their vertex; peaks are anchored by their bottom edge
                    ...(isValley
                      ? { top: vertexY + ARM_T / 2 + LABEL_GAP }
                      : { bottom: TOTAL_H - (vertexY - ARM_T / 2 - LABEL_GAP) }),
                    zIndex: 5,
                  }}
                  initial={reduced ? false : { opacity: 0, y: isValley ? -6 : 6 }}
                  animate={revealed ? { opacity: 1, y: 0 } : { opacity: 0, y: isValley ? -6 : 6 }}
                  transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1], delay: delay + 0.05 }}
                >
                  <h3
                    className="text-[15px] font-bold leading-snug tracking-[-0.01em]"
                    style={{ color: 'var(--ttl)' }}
                  >
                    {step.title}
                  </h3>
                  <p className="mt-1.5 text-[12px] leading-[1.55] text-slate-500 dark:text-gray-400">
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
    <ol className="xl:hidden mt-12 sm:mt-14">
      {STEPS.map((step, i) => {
        const Icon = step.icon;
        return (
          <motion.li
            key={step.title}
            className="vsp-step flex gap-4 sm:gap-5"
            style={stepVars(step)}
            initial={reduced ? false : { opacity: 0, y: 10 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: '-60px' }}
            transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1], delay: reduced ? 0 : i * 0.05 }}
          >
            <div className="flex flex-col items-center shrink-0">
              <span
                className="w-11 h-11 rounded-full flex items-center justify-center text-slate-700 dark:text-gray-300"
                style={{ border: '2px solid var(--arm-out)' }}
              >
                <Icon width={20} height={20} strokeWidth={1.5} />
              </span>
              {i < STEPS.length - 1 && (
                <span
                  aria-hidden
                  className="w-0.5 flex-1 min-h-[28px] my-1.5 rounded-full opacity-40"
                  style={{ backgroundColor: 'var(--arm-out)' }}
                />
              )}
            </div>

            <div className="pb-8">
              <span
                className="text-[11.5px] font-bold tabular-nums tracking-[0.06em]"
                style={{ color: 'var(--ttl)' }}
              >
                STEP {String(i + 1).padStart(2, '0')}
              </span>
              <h3
                className="mt-1 text-[16px] font-bold tracking-[-0.015em]"
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

export default function VShapeProcess() {
  return (
    <>
      <style>{STEP_THEME_CSS}</style>
      <DesktopVShape />
      <Timeline />
    </>
  );
}
