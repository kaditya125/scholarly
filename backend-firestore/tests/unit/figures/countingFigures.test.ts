import { Figure, Pt } from '../../../src/services/books/figures/figureModel';
import { generateCountingQuestion, gridFigure, triangleFigure } from '../../../src/services/books/figures/countingFigures';

// ── brute force, independent of the formulas ───────────────────────────────────────────────────
type Seg = [Pt, Pt];
const EPS = 1e-6;

function segments(fig: Figure): Seg[] {
  return fig.flatMap((p): Seg[] => p.kind === 'line' ? [[p.a, p.b]]
    : p.kind === 'poly' ? p.pts.map((q, i): Seg => [q, p.pts[(i + 1) % p.pts.length]]).slice(0, p.closed ? p.pts.length : p.pts.length - 1)
    : []);
}
function intersect([p1, p2]: Seg, [p3, p4]: Seg): Pt | null {
  const d = (p2[0] - p1[0]) * (p4[1] - p3[1]) - (p2[1] - p1[1]) * (p4[0] - p3[0]);
  if (Math.abs(d) < EPS) return null;
  const t = ((p3[0] - p1[0]) * (p4[1] - p3[1]) - (p3[1] - p1[1]) * (p4[0] - p3[0])) / d;
  const u = ((p3[0] - p1[0]) * (p2[1] - p1[1]) - (p3[1] - p1[1]) * (p2[0] - p1[0])) / d;
  return t > -EPS && t < 1 + EPS && u > -EPS && u < 1 + EPS ? [p1[0] + t * (p2[0] - p1[0]), p1[1] + t * (p2[1] - p1[1])] : null;
}
const onSeg = (p: Pt, [a, b]: Seg) => Math.abs((b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0])) < 1e-4
  && p[0] >= Math.min(a[0], b[0]) - EPS && p[0] <= Math.max(a[0], b[0]) + EPS && p[1] >= Math.min(a[1], b[1]) - EPS && p[1] <= Math.max(a[1], b[1]) + EPS;

function points(fig: Figure): Pt[] {
  const segs = segments(fig), out: Pt[] = [];
  for (let i = 0; i < segs.length; i++) for (let j = i + 1; j < segs.length; j++) {
    const p = intersect(segs[i], segs[j]);
    if (p && !out.some((q) => Math.hypot(q[0] - p[0], q[1] - p[1]) < 1e-3)) out.push(p);
  }
  return out;
}
/** Two points are joined if a single drawn segment contains both. */
const joined = (segs: Seg[], a: Pt, b: Pt) => segs.some((s) => onSeg(a, s) && onSeg(b, s));
const area2 = (a: Pt, b: Pt, c: Pt) => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);

function bruteTriangles(fig: Figure): number {
  const segs = segments(fig), pts = points(fig);
  let n = 0;
  for (let i = 0; i < pts.length; i++) for (let j = i + 1; j < pts.length; j++) for (let k = j + 1; k < pts.length; k++) {
    if (Math.abs(area2(pts[i], pts[j], pts[k])) < 1e-3) continue;
    if (joined(segs, pts[i], pts[j]) && joined(segs, pts[j], pts[k]) && joined(segs, pts[i], pts[k])) n++;
  }
  return n;
}
function bruteRectangles(fig: Figure): number {
  const segs = segments(fig), pts = points(fig);
  // Distinct coordinates by tolerance, keeping exact values (rounding would push corners off their lines).
  const uniq = (vs: number[]) => vs.sort((a, b) => a - b).filter((v, i, a) => i === 0 || v - a[i - 1] > 1e-6);
  const xs = uniq(pts.map((p) => p[0])), ys = uniq(pts.map((p) => p[1]));
  let n = 0;
  for (let a = 0; a < xs.length; a++) for (let b = a + 1; b < xs.length; b++) for (let c = 0; c < ys.length; c++) for (let d = c + 1; d < ys.length; d++) {
    const tl: Pt = [xs[a], ys[c]], tr: Pt = [xs[b], ys[c]], bl: Pt = [xs[a], ys[d]], br: Pt = [xs[b], ys[d]];
    if (joined(segs, tl, tr) && joined(segs, bl, br) && joined(segs, tl, bl) && joined(segs, tr, br)) n++;
  }
  return n;
}

describe('counting formulas match a brute-force count of the drawn figure', () => {
  it.each([[1, 0], [2, 1], [3, 2], [4, 3], [2, 3]])('triangle with k=%i cevians, h=%i parallels', (k, h) => {
    expect(bruteTriangles(triangleFigure(k, h))).toBe(((k + 2) * (k + 1) / 2) * (h + 1));
  });
  it.each([[1, 2], [2, 3], [3, 4], [2, 2]])('grid %i×%i', (r, c) => {
    expect(bruteRectangles(gridFigure(r, c))).toBe((r * (r + 1) / 2) * (c * (c + 1) / 2));
  });
});

describe('FIGURE_COUNTING generator', () => {
  const seeds = Array.from({ length: 120 }, (_, i) => 700 + i * 3571);
  it('the answer equals the brute-force count of the figure it draws', () => {
    for (const seed of seeds) {
      const q = generateCountingQuestion(seed);
      const count = q.kind === 'TRIANGLES' ? bruteTriangles(q.figure) : bruteRectangles(q.figure);
      expect(q.options[q.answerIndex]).toBe(count);
      expect(new Set(q.options).size).toBe(4);
      expect(q.options.every((o) => o > 0)).toBe(true);
    }
  });
  it('is deterministic', () => {
    expect(JSON.stringify(generateCountingQuestion(5))).toBe(JSON.stringify(generateCountingQuestion(5)));
  });
});
