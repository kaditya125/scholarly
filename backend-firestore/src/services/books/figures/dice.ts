/**
 * Dice questions — "two positions of a die are shown; which number is opposite X?" — with a
 * solver-verified answer.
 *
 * A die is modelled as six physical faces with outward normals; a view is (top, front, right),
 * where right = top × front (right-handed). Every question is checked by brute force: of all 720
 * ways to number the faces, keep those that could produce BOTH views; the question is used only if
 * every one of them puts the same number opposite X. So the answer is not just computed — it is
 * provably the only answer the two views allow. Views are drawn as isometric cubes.
 */
import { rng, shuffle } from './figureModel';

type V3 = [number, number, number];
// Physical faces: 0 U, 1 D, 2 F, 3 B, 4 L, 5 R — normals with x right, y back, z up.
const N: V3[] = [[0, 0, 1], [0, 0, -1], [0, -1, 0], [0, 1, 0], [-1, 0, 0], [1, 0, 0]];
const OPP = [1, 0, 3, 2, 5, 4];
const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const faceOf = (v: V3) => N.findIndex((n) => n[0] === v[0] && n[1] === v[1] && n[2] === v[2]);

/** The 24 orientations as [topFace, frontFace, rightFace] physical indices. */
const ORIENTATIONS: [number, number, number][] = [];
for (let t = 0; t < 6; t++) for (let f = 0; f < 6; f++) {
  if (f === t || f === OPP[t]) continue;
  ORIENTATIONS.push([t, f, faceOf(cross(N[t], N[f]))]);
}

export type View = [number, number, number]; // numbers seen on top, front, right

const viewOf = (label: number[], [t, f, r]: [number, number, number]): View => [label[t], label[f], label[r]];
const sameView = (a: View, b: View) => a[0] === b[0] && a[1] === b[1] && a[2] === b[2];

function permutations(xs: number[]): number[][] {
  if (xs.length <= 1) return [xs];
  return xs.flatMap((x, i) => permutations([...xs.slice(0, i), ...xs.slice(i + 1)]).map((p) => [x, ...p]));
}
const ALL_LABELINGS = permutations([1, 2, 3, 4, 5, 6]);

/** Every numbering of the die that could show both views. */
export function consistentDice(views: View[]): number[][] {
  return ALL_LABELINGS.filter((lab) => views.every((v) => ORIENTATIONS.some((o) => sameView(viewOf(lab, o), v))));
}

/** The number opposite x, if the views determine it; null if they don't. */
export function determinedOpposite(views: View[], x: number): number | null {
  const answers = new Set(consistentDice(views).map((lab) => lab[OPP[lab.indexOf(x)]]));
  return answers.size === 1 ? [...answers][0] : null;
}

// ── rendering ─────────────────────────────────────────────────────────────────────────────────

function cubeSvg([top, front, right]: View, size = 120): string {
  // Isometric cube: top rhombus, front face on the left, right face on the right.
  const P = { t: [50, 12], l: [16, 30], r: [84, 30], c: [50, 48], bl: [16, 74], br: [84, 74], b: [50, 92] } as const;
  const pts = (...k: (keyof typeof P)[]) => k.map((x) => P[x].join(',')).join(' ');
  const num = (n: number, x: number, y: number) => `<text x="${x}" y="${y}" font-family="Arial, Helvetica, sans-serif" font-weight="700" font-size="17" text-anchor="middle" dominant-baseline="central" fill="#111">${n}</text>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="${size}" height="${size}">`
    + `<polygon points="${pts('t', 'r', 'c', 'l')}" fill="#fff" stroke="#111" stroke-width="2"/>`
    + `<polygon points="${pts('l', 'c', 'b', 'bl')}" fill="#fff" stroke="#111" stroke-width="2"/>`
    + `<polygon points="${pts('c', 'r', 'br', 'b')}" fill="#fff" stroke="#111" stroke-width="2"/>`
    + num(top, 50, 30) + num(front, 33, 61) + num(right, 67, 61) + '</svg>';
}

export interface GeneratedDiceQuestion {
  archetype: 'CUBES_AND_DICE';
  seed: number;
  prompt: string;
  views: View[];
  viewSvgs: string[];
  asked: number;
  options: number[];
  answerIndex: number;
  explanation: string;
}

export function generateDiceQuestion(seed: number): GeneratedDiceQuestion {
  const rand = rng(seed);
  for (let attempt = 0; attempt < 500; attempt++) {
    const label = shuffle([1, 2, 3, 4, 5, 6], rand);          // label[physicalFace]
    const [o1, o2] = shuffle(ORIENTATIONS, rand);
    const views: View[] = [viewOf(label, o1), viewOf(label, o2)];
    if (sameView(views[0], views[1])) continue;
    // Ask about a visible number whose opposite the two views pin down (checked by the solver).
    const candidates = shuffle([...new Set(views.flat())], rand);
    for (const asked of candidates) {
      const answer = determinedOpposite(views, asked);
      if (answer === null) continue;
      if (answer !== label[OPP[label.indexOf(asked)]]) continue;   // solver and truth must agree
      // Distractors: faces seen next to `asked` are the classic wrong picks (adjacent ≠ opposite).
      const adjacent = views.filter((v) => v.includes(asked)).flat().filter((n) => n !== asked);
      const pool = shuffle([...new Set([...adjacent, 1, 2, 3, 4, 5, 6])].filter((n) => n !== asked && n !== answer), rand);
      const distractors = pool.slice(0, 3);
      if (distractors.length < 3) continue;
      const options = shuffle([answer, ...distractors], rand);
      return {
        archetype: 'CUBES_AND_DICE',
        seed,
        prompt: `Two positions of the same die are shown. Which number is on the face opposite ${asked}?`,
        views,
        viewSvgs: views.map((v) => cubeSvg(v)),
        asked,
        options,
        answerIndex: options.indexOf(answer),
        explanation: `A face is adjacent to every face it is ever seen next to, and never adjacent to its opposite. The two positions leave exactly one number that can sit opposite ${asked}: ${answer}.`,
      };
    }
  }
  throw new Error(`could not build a determined CUBES_AND_DICE question from seed ${seed}`);
}
