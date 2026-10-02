/**
 * Counting-figures questions ("how many triangles / rectangles are there?") with a computed answer.
 *
 *   TRIANGLES — a triangle cut by k lines from the apex to the base and h lines parallel to the
 *               base contains C(k+2, 2) · (h+1) triangles.
 *   RECTANGLES — an r × c grid of cells contains C(r+1, 2) · C(c+1, 2) rectangles (squares included).
 *
 * The drawing is produced from the same parameters as the count, and the unit test re-counts
 * every figure by brute force from its line segments, so the formula and the picture are checked
 * against each other. Distractors are the usual miscounts (only the smallest pieces, one short
 * family forgotten, off-by-a-row).
 */
import { Figure, Pt, rng, shuffle, renderSvg } from './figureModel';

const C2 = (n: number) => (n * (n - 1)) / 2;

export interface GeneratedCountingQuestion {
  archetype: 'FIGURE_COUNTING';
  seed: number;
  kind: 'TRIANGLES' | 'RECTANGLES';
  params: { k?: number; h?: number; rows?: number; cols?: number };
  prompt: string;
  figure: Figure;
  figureSvg: string;
  options: number[];
  answerIndex: number;
  explanation: string;
}

/** Segments of the subdivided triangle: apex (50,8), base from (8,92) to (92,92). */
export function triangleFigure(k: number, h: number): Figure {
  const A: Pt = [50, 8], BL: Pt = [8, 92], BR: Pt = [92, 92];
  const fig: Figure = [{ kind: 'poly', closed: true, pts: [A, BL, BR] }];
  for (let i = 1; i <= k; i++) {                         // cevians from the apex
    const x = BL[0] + ((BR[0] - BL[0]) * i) / (k + 1);
    fig.push({ kind: 'line', a: A, b: [x, 92] });
  }
  for (let j = 1; j <= h; j++) {                         // parallels to the base
    const y = A[1] + ((92 - A[1]) * j) / (h + 1);
    const t = (y - A[1]) / (92 - A[1]);
    fig.push({ kind: 'line', a: [A[0] + (BL[0] - A[0]) * t, y], b: [A[0] + (BR[0] - A[0]) * t, y] });
  }
  return fig;
}

export function gridFigure(rows: number, cols: number): Figure {
  const x0 = 10, y0 = 18, w = 80, hgt = 64;
  const fig: Figure = [];
  for (let r = 0; r <= rows; r++) fig.push({ kind: 'line', a: [x0, y0 + (hgt * r) / rows], b: [x0 + w, y0 + (hgt * r) / rows] });
  for (let c = 0; c <= cols; c++) fig.push({ kind: 'line', a: [x0 + (w * c) / cols, y0], b: [x0 + (w * c) / cols, y0 + hgt] });
  return fig;
}

export function generateCountingQuestion(seed: number): GeneratedCountingQuestion {
  const rand = rng(seed);
  const at = (lo: number, hi: number) => lo + Math.floor(rand() * (hi - lo + 1));
  const kind: 'TRIANGLES' | 'RECTANGLES' = rand() < 0.6 ? 'TRIANGLES' : 'RECTANGLES';

  let answer: number, figure: Figure, params: GeneratedCountingQuestion['params'], wrong: number[], explanation: string;
  if (kind === 'TRIANGLES') {
    const k = at(1, 4), h = at(0, 3);
    params = { k, h };
    answer = C2(k + 2) * (h + 1);
    figure = triangleFigure(k, h);
    // Miscounts: only the smallest regions; forgetting the triangles that span several strips;
    // counting one strip too few or too many.
    wrong = [(k + 1) * (2 * h + 1), C2(k + 2), C2(k + 2) * h || C2(k + 2) + 1, C2(k + 2) * (h + 2), answer - 1, answer + 2];
    explanation = `Every triangle has the apex-side fixed by one horizontal line (${h + 1} choices, the base included) and two sides chosen from the ${k + 2} lines through the apex (C(${k + 2}, 2) = ${C2(k + 2)} choices): ${C2(k + 2)} × ${h + 1} = ${answer}.`;
  } else {
    const rows = at(1, 3), cols = at(2, 4);
    params = { rows, cols };
    answer = C2(rows + 1) * C2(cols + 1);
    figure = gridFigure(rows, cols);
    wrong = [rows * cols, answer - rows * cols, C2(rows + 1) + C2(cols + 1), answer + rows, answer - 1];
    explanation = `A rectangle is fixed by choosing 2 of the ${rows + 1} horizontal lines and 2 of the ${cols + 1} vertical lines: ${C2(rows + 1)} × ${C2(cols + 1)} = ${answer}.`;
  }

  const distractors = shuffle([...new Set(wrong.filter((w) => w > 0 && w !== answer))], rand).slice(0, 3);
  let bump = 1;
  while (distractors.length < 3) { const w = answer + bump++; if (!distractors.includes(w)) distractors.push(w); }
  const options = shuffle([answer, ...distractors], rand);
  return {
    archetype: 'FIGURE_COUNTING',
    seed,
    kind,
    params,
    prompt: kind === 'TRIANGLES' ? 'How many triangles are there in the given figure?' : 'How many rectangles (including squares) are there in the given figure?',
    figure,
    figureSvg: renderSvg(figure, { frame: false, size: 160 }),
    options,
    answerIndex: options.indexOf(answer),
    explanation,
  };
}
