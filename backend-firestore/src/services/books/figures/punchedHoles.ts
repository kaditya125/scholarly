/**
 * Paper folding + punched holes ("how will the sheet look when unfolded?"), with a computed answer.
 *
 * A square sheet is folded one or two times; holes are punched through the folded stack; each
 * unfold reflects every hole across that fold's line, last fold first. So k folds turn one punch
 * into up to 2^k holes, at exact positions. Distractors are the classic slips: forgetting the
 * last unfold, reflecting across the wrong axis, or unfolding nothing. Every option is checked to
 * differ from every other.
 */
import { Figure, Pt, rng, shuffle, signature, renderSvg } from './figureModel';

export type Fold = 'V' | 'H' | 'D';  // V: right half onto left (x = 50); H: bottom onto top (y = 50); D: along y = x

export interface Hole { c: Pt; shape: 'circle' | 'square' }

export interface GeneratedPunchQuestion {
  archetype: 'PAPER_CUTTING';
  seed: number;
  prompt: string;
  folds: Fold[];
  punched: Hole[];
  stepSvgs: string[];
  options: Figure[];
  optionSvgs: string[];
  answerIndex: number;
  optionKinds: string[];
  explanation: string;
}

export const reflect = (f: Fold, [x, y]: Pt): Pt => (f === 'V' ? [100 - x, y] : f === 'H' ? [x, 100 - y] : [y, x]);

/** Unfold: every fold, last first, adds the mirror image of every hole so far. */
export function unfold(folds: Fold[], punched: Hole[]): Hole[] {
  let holes = punched;
  for (const f of [...folds].reverse()) holes = [...holes, ...holes.map((h) => ({ ...h, c: reflect(f, h.c) }))];
  const seen = new Set<string>();
  return holes.filter((h) => { const k = `${h.shape}${Math.round(h.c[0])},${Math.round(h.c[1])}`; return seen.has(k) ? false : (seen.add(k), true); });
}

/** Is a point inside the part of the sheet that stays visible after these folds? */
function inFolded(folds: Fold[], [x, y]: Pt): boolean {
  return folds.every((f) => (f === 'V' ? x < 50 : f === 'H' ? y < 50 : x > y));
}

function holeFig(holes: Hole[]): Figure {
  return holes.map((h): Figure[number] => h.shape === 'circle'
    ? { kind: 'circle', c: h.c, r: 4 }
    : { kind: 'poly', closed: true, pts: [[h.c[0] - 4, h.c[1] - 4], [h.c[0] + 4, h.c[1] - 4], [h.c[0] + 4, h.c[1] + 4], [h.c[0] - 4, h.c[1] + 4]] });
}

/** Outline of the folded sheet after the given folds (for the step figures). */
function foldedOutline(folds: Fold[]): Pt[] {
  // Clip the unit square by each half-plane (Sutherland–Hodgman on a convex polygon).
  let poly: Pt[] = [[0, 0], [100, 0], [100, 100], [0, 100]];
  for (const f of folds) {
    const inside = (p: Pt) => (f === 'V' ? p[0] <= 50 : f === 'H' ? p[1] <= 50 : p[0] >= p[1]);
    const cross = (a: Pt, b: Pt): Pt => {
      if (f === 'V') { const t = (50 - a[0]) / (b[0] - a[0]); return [50, a[1] + t * (b[1] - a[1])]; }
      if (f === 'H') { const t = (50 - a[1]) / (b[1] - a[1]); return [a[0] + t * (b[0] - a[0]), 50]; }
      const t = (a[1] - a[0]) / ((b[0] - a[0]) - (b[1] - a[1])); return [a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1])];
    };
    const out: Pt[] = [];
    poly.forEach((cur, i) => {
      const prev = poly[(i + poly.length - 1) % poly.length];
      if (inside(cur)) { if (!inside(prev)) out.push(cross(prev, cur)); out.push(cur); }
      else if (inside(prev)) out.push(cross(prev, cur));
    });
    poly = out;
  }
  return poly;
}

const FOLD_LINE: Record<Fold, string> = {
  V: '<line x1="50" y1="0" x2="50" y2="100" stroke="#111" stroke-width="1.3" stroke-dasharray="5 4"/>',
  H: '<line x1="0" y1="50" x2="100" y2="50" stroke="#111" stroke-width="1.3" stroke-dasharray="5 4"/>',
  D: '<line x1="0" y1="0" x2="100" y2="100" stroke="#111" stroke-width="1.3" stroke-dasharray="5 4"/>',
};

export function generatePunchQuestion(seed: number): GeneratedPunchQuestion {
  const rand = rng(seed);
  const pick = <T>(xs: T[]) => xs[Math.floor(rand() * xs.length)];
  for (let attempt = 0; attempt < 300; attempt++) {
    const nFolds = rand() < 0.35 ? 1 : 2;
    const folds: Fold[] = [];
    for (let i = 0; i < nFolds; i++) {
      const f = pick<Fold>(['V', 'H', 'D']);
      if (folds.includes(f)) continue;
      folds.push(f);
    }
    if (!folds.length) continue;

    // Punch 1–3 holes well inside the folded region, away from fold lines and from each other.
    const punched: Hole[] = [];
    for (let tries = 0; punched.length < 1 + Math.floor(rand() * 3) && tries < 60; tries++) {
      const c: Pt = [8 + Math.floor(rand() * 84), 8 + Math.floor(rand() * 84)];
      const clear = inFolded(folds, c)
        && Math.abs(c[0] - 50) > 8 && Math.abs(c[1] - 50) > 8 && Math.abs(c[0] - c[1]) > 11
        && punched.every((h) => Math.hypot(h.c[0] - c[0], h.c[1] - c[1]) > 16);
      if (clear) punched.push({ c, shape: rand() < 0.75 ? 'circle' : 'square' });
    }
    if (!punched.length) continue;

    const answer = unfold(folds, punched);
    const others = (['V', 'H', 'D'] as Fold[]).filter((f) => !folds.includes(f));
    const candidates: [string, Hole[]][] = [
      ['last unfold forgotten', unfold(folds.slice(0, -1), punched)],
      ['reflected across the wrong line', unfold([...folds.slice(0, -1), others[0]], punched)],
      ['nothing unfolded', punched],
      ['first fold reflected wrongly', unfold([others[others.length - 1], ...folds.slice(1)], punched)],
    ];
    const answerSig = signature(holeFig(answer));
    const seen = new Set([answerSig]);
    const distractors: [string, Hole[]][] = [];
    for (const [kind, holes] of shuffle(candidates, rand)) {
      const s = signature(holeFig(holes));
      if (!seen.has(s)) { seen.add(s); distractors.push([kind, holes]); }
      if (distractors.length === 3) break;
    }
    if (distractors.length < 3) continue;
    const order = shuffle<[string, Hole[]]>([['correct', answer], ...distractors], rand);

    // Step figures: each fold shown on the sheet as it is, then the folded sheet with the punches.
    const stepSvgs: string[] = [];
    for (let i = 0; i < folds.length; i++) {
      const outline = foldedOutline(folds.slice(0, i));
      stepSvgs.push(renderSvg([{ kind: 'poly', closed: true, pts: outline }], { frame: false, extra: FOLD_LINE[folds[i]] }));
    }
    stepSvgs.push(renderSvg([{ kind: 'poly', closed: true, pts: foldedOutline(folds) }, ...holeFig(punched)], { frame: false }));

    return {
      archetype: 'PAPER_CUTTING',
      seed,
      prompt: 'A square sheet of paper is folded along the dotted line(s) as shown, and holes are punched through the folded sheet. How will the sheet look when unfolded?',
      folds,
      punched,
      stepSvgs,
      options: order.map(([, h]) => holeFig(h)),
      optionSvgs: order.map(([, h]) => renderSvg(holeFig(h))),
      answerIndex: order.findIndex(([k]) => k === 'correct'),
      optionKinds: order.map(([k]) => k),
      explanation: 'Unfold one fold at a time, starting with the last: each unfold adds the mirror image of every hole across that fold line, so each punch appears 2^(number of folds) times.',
    };
  }
  throw new Error(`could not build a valid PAPER_CUTTING question from seed ${seed}`);
}
