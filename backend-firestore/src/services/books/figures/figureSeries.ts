/**
 * Figure-series questions ("which figure comes next?"), generated with a computed answer.
 *
 * One to three elements each follow a rule from step to step:
 *   - spin: rotate about its own centre by a fixed multiple of 45°, clockwise or anticlockwise
 *   - walk: move around the four corner cells, clockwise or anticlockwise
 * The problem shows steps 0..4; the answer is step 5 — the rule applied once more. Distractors
 * are the natural slips (one element's rule applied wrongly, the wrong direction, the correct
 * figure mirrored, the last figure repeated). Every option is checked to differ from every other.
 */
import { Figure, Primitive, Pt, rng, shuffle, signature, renderSvg } from './figureModel';

export interface GeneratedSeriesQuestion {
  archetype: 'FIGURE_SERIES';
  seed: number;
  prompt: string;
  problem: Figure[];
  problemSvgs: string[];
  options: Figure[];
  optionSvgs: string[];
  answerIndex: number;
  optionKinds: string[];
  rules: string[];
  /** The element rules the question was built from, so the answer can be recomputed for audit. */
  elements: Element[];
  explanation: string;
}

type Shape = (c: Pt) => Primitive[];

// Shapes are drawn pointing "up" at angle 0, at a size that fills a corner cell, and must look
// different at every 45° turn.
const K = 1.6;
const SHAPES: Record<string, Shape> = {
  arrow: ([x, y]) => [{ kind: 'arrow', a: [x, y + 10 * K], b: [x, y - 10 * K] }],
  flag: ([x, y]) => [{ kind: 'line', a: [x, y + 10 * K], b: [x, y - 10 * K] }, { kind: 'poly', closed: true, filled: true, pts: [[x, y - 10 * K], [x + 8 * K, y - 6 * K], [x, y - 2 * K]] }],
  hook: ([x, y]) => [{ kind: 'poly', closed: false, pts: [[x - 6 * K, y + 9 * K], [x - 6 * K, y - 9 * K], [x + 7 * K, y - 9 * K]] }],
  tee: ([x, y]) => [{ kind: 'line', a: [x, y + 10 * K], b: [x, y - 8 * K] }, { kind: 'line', a: [x - 7 * K, y - 8 * K], b: [x + 3 * K, y - 8 * K] }],
};

const CORNERS: Pt[] = [[27, 27], [73, 27], [73, 73], [27, 73]]; // clockwise from top-left

function rotateAbout(prims: Primitive[], c: Pt, deg: number): Primitive[] {
  const t = (deg * Math.PI) / 180, cos = Math.cos(t), sin = Math.sin(t);
  const f = ([x, y]: Pt): Pt => [c[0] + (x - c[0]) * cos - (y - c[1]) * sin, c[1] + (x - c[0]) * sin + (y - c[1]) * cos];
  return prims.map((p): Primitive => {
    switch (p.kind) {
      case 'line': return { kind: 'line', a: f(p.a), b: f(p.b) };
      case 'arrow': return { kind: 'arrow', a: f(p.a), b: f(p.b) };
      case 'poly': return { ...p, pts: p.pts.map(f) };
      case 'dot': return { ...p, c: f(p.c) };
      case 'circle': return { ...p, c: f(p.c) };
      case 'glyph': return { ...p, c: f(p.c) };
    }
  });
}

function mirrorFig(fig: Figure): Figure {
  const f = ([x, y]: Pt): Pt => [100 - x, y];
  return fig.map((p): Primitive => {
    switch (p.kind) {
      case 'line': return { kind: 'line', a: f(p.a), b: f(p.b) };
      case 'arrow': return { kind: 'arrow', a: f(p.a), b: f(p.b) };
      case 'poly': return { ...p, pts: p.pts.map(f) };
      case 'dot': return { ...p, c: f(p.c) };
      case 'circle': return { ...p, c: f(p.c) };
      case 'glyph': return { ...p, c: f(p.c), m: [-p.m[0], p.m[1], -p.m[2], p.m[3]] };
    }
  });
}

export interface Element { shape: string; corner: number; angle: number; spin: number; walk: number }

/** The figure at a step: each element's rule applied `step` times. */
function figureAt(els: Element[], step: number): Figure {
  return els.flatMap((e) => {
    const corner = (((e.corner + e.walk * step) % 4) + 4) % 4;
    const c = CORNERS[corner];
    return rotateAbout(SHAPES[e.shape](c), c, e.angle + e.spin * step);
  });
}

function describe(e: Element): string {
  const parts: string[] = [];
  if (e.spin) parts.push(`the ${e.shape} turns ${Math.abs(e.spin)}° ${e.spin > 0 ? 'clockwise' : 'anticlockwise'} each step`);
  if (e.walk) parts.push(`it moves one corner ${e.walk > 0 ? 'clockwise' : 'anticlockwise'} each step`);
  return parts.join(' and ');
}

export function generateFigureSeriesQuestion(seed: number): GeneratedSeriesQuestion {
  const rand = rng(seed);
  const pick = <T>(xs: T[]) => xs[Math.floor(rand() * xs.length)];
  for (let attempt = 0; attempt < 300; attempt++) {
    const n = 1 + Math.floor(rand() * 2) + (rand() < 0.25 ? 1 : 0);
    const shapes = shuffle(Object.keys(SHAPES), rand).slice(0, n);
    const startCorners = shuffle([0, 1, 2, 3], rand);
    const els: Element[] = shapes.map((shape, i) => ({
      shape,
      corner: startCorners[i],
      angle: pick([0, 45, 90, 135, 180, 225, 270, 315]),
      spin: pick([45, 90, -45, -90, 0]),
      walk: pick([1, -1, 0]),
    }));
    if (els.some((e) => !e.spin && !e.walk)) continue;             // every element must change
    const steps = Array.from({ length: 6 }, (_, s) => figureAt(els, s));
    // Every step must look different, or the pattern is ambiguous.
    if (new Set(steps.map(signature)).size !== 6) continue;
    const answer = steps[5];

    // Distractors: perturb one element's rule for the final step, wrong direction, mirror, repeat.
    const k = Math.floor(rand() * els.length);
    const perturbed = (mut: (e: Element) => Element) => figureAt(els.map((e, i) => (i === k ? mut(e) : e)), 5);
    const candidates: [string, Figure][] = [
      ['one element turned too far', perturbed((e) => ({ ...e, angle: e.angle + (e.spin >= 0 ? 45 : -45) }))],
      ['one element turned the wrong way', perturbed((e) => ({ ...e, angle: e.angle - 2 * 5 * e.spin }))],
      ['one element in the wrong corner', perturbed((e) => ({ ...e, corner: e.corner + (e.walk === 0 ? 1 : -2 * e.walk) }))],
      ['correct figure mirrored', mirrorFig(answer)],
      ['last figure repeated', steps[4]],
    ];
    const seen = new Set([signature(answer)]);
    const distractors: [string, Figure][] = [];
    for (const [kind, fig] of shuffle(candidates, rand)) {
      const s = signature(fig);
      if (!seen.has(s)) { seen.add(s); distractors.push([kind, fig]); }
      if (distractors.length === 3) break;
    }
    if (distractors.length < 3) continue;
    const order = shuffle<[string, Figure]>([['correct', answer], ...distractors], rand);
    return {
      archetype: 'FIGURE_SERIES',
      seed,
      prompt: 'Select the figure which will continue the series established by the five problem figures.',
      problem: steps.slice(0, 5),
      problemSvgs: steps.slice(0, 5).map((f) => renderSvg(f)),
      options: order.map(([, f]) => f),
      optionSvgs: order.map(([, f]) => renderSvg(f)),
      answerIndex: order.findIndex(([k2]) => k2 === 'correct'),
      optionKinds: order.map(([k2]) => k2),
      rules: els.map(describe),
      elements: els,
      explanation: `In each step, ${els.map(describe).join('; ')}. Applying the rule once more gives the answer.`,
    };
  }
  throw new Error(`could not build a valid FIGURE_SERIES question from seed ${seed}`);
}

/** Exposed for tests: the figure at any step, recomputed independently of the generator's output. */
export const _internal = { figureAt };
