/**
 * Figure model for code-generated non-verbal reasoning questions (Track B of the non-verbal plan).
 *
 * A figure is DATA — a list of primitives on a 100×100 grid — never a picture. Every transform a
 * question relies on (reflection, rotation) is exact arithmetic on that data, so the correct
 * answer is computed, not judged. `signature()` gives a canonical form so "do these two options
 * look identical?" is an equality check, which is how generators guarantee exactly one correct
 * option.
 */

export type Pt = [number, number];

export type Primitive =
  | { kind: 'line'; a: Pt; b: Pt }
  | { kind: 'arrow'; a: Pt; b: Pt }                    // head at b
  | { kind: 'poly'; pts: Pt[]; closed: boolean; filled?: boolean }
  | { kind: 'dot'; c: Pt; r: number }
  | { kind: 'circle'; c: Pt; r: number; filled?: boolean }
  /** A text glyph with an orientation matrix [a, b, c, d] (x' = a·x + b·y, y' = c·x + d·y). */
  | { kind: 'glyph'; c: Pt; ch: string; m: [number, number, number, number] };

export type Figure = Primitive[];

export type Transform = 'identity' | 'mirrorV' | 'mirrorH' | 'rot90' | 'rot180' | 'rot270';

/** Point maps about the grid centre (50, 50). mirrorV: left↔right; mirrorH: top↔bottom. */
const MAP: Record<Transform, (p: Pt) => Pt> = {
  identity: ([x, y]) => [x, y],
  mirrorV: ([x, y]) => [100 - x, y],
  mirrorH: ([x, y]) => [x, 100 - y],
  rot90: ([x, y]) => [100 - y, x],     // clockwise in screen coordinates (y down)
  rot180: ([x, y]) => [100 - x, 100 - y],
  rot270: ([x, y]) => [y, 100 - x],
};

/** The same maps as linear parts, for glyph orientation. */
const LIN: Record<Transform, [number, number, number, number]> = {
  identity: [1, 0, 0, 1],
  mirrorV: [-1, 0, 0, 1],
  mirrorH: [1, 0, 0, -1],
  rot90: [0, -1, 1, 0],
  rot180: [-1, 0, 0, -1],
  rot270: [0, 1, -1, 0],
};

const mul = (p: [number, number, number, number], q: [number, number, number, number]): [number, number, number, number] => [
  p[0] * q[0] + p[1] * q[2], p[0] * q[1] + p[1] * q[3],
  p[2] * q[0] + p[3] * q[2], p[2] * q[1] + p[3] * q[3],
];

export function transform(fig: Figure, t: Transform): Figure {
  const f = MAP[t];
  return fig.map((p): Primitive => {
    switch (p.kind) {
      case 'line': return { kind: 'line', a: f(p.a), b: f(p.b) };
      case 'arrow': return { kind: 'arrow', a: f(p.a), b: f(p.b) };
      case 'poly': return { ...p, pts: p.pts.map(f) };
      case 'dot': return { kind: 'dot', c: f(p.c), r: p.r };
      case 'circle': return { ...p, c: f(p.c) };
      case 'glyph': return { kind: 'glyph', c: f(p.c), ch: p.ch, m: mul(LIN[t], p.m) };
    }
  });
}

const r1 = (n: number) => Math.round(n * 10) / 10;
const ps = (p: Pt) => `${r1(p[0])},${r1(p[1])}`;
const cmpPt = (a: Pt, b: Pt) => a[0] - b[0] || a[1] - b[1];

function polySig(pts: Pt[], closed: boolean): string {
  const fwd = pts.map(ps);
  if (!closed) {
    const rev = [...fwd].reverse();
    return fwd.join(' ') < rev.join(' ') ? fwd.join(' ') : rev.join(' ');
  }
  // A closed polygon is the same shape from any start vertex, in either direction.
  const cands: string[] = [];
  for (const seq of [fwd, [...fwd].reverse()]) {
    for (let i = 0; i < seq.length; i++) cands.push([...seq.slice(i), ...seq.slice(0, i)].join(' '));
  }
  return cands.sort()[0];
}

/** Canonical form: two figures that render identically have the same signature. */
export function signature(fig: Figure): string {
  return fig.map((p) => {
    switch (p.kind) {
      case 'line': { const [a, b] = [p.a, p.b].sort(cmpPt); return `L ${ps(a)} ${ps(b)}`; }
      case 'arrow': return `A ${ps(p.a)} ${ps(p.b)}`;
      case 'poly': return `P${p.closed ? 'c' : 'o'}${p.filled ? 'f' : ''} ${polySig(p.pts, p.closed)}`;
      case 'dot': return `D ${ps(p.c)} ${r1(p.r)}`;
      case 'circle': return `C${p.filled ? 'f' : ''} ${ps(p.c)} ${r1(p.r)}`;
      case 'glyph': return `G ${p.ch} ${ps(p.c)} ${p.m.map(r1).join(',')}`;
    }
  }).sort().join(' | ');
}

// ── rendering ─────────────────────────────────────────────────────────────────────────────────

const STROKE = 'stroke="#111" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"';

function arrowHead(a: Pt, b: Pt): string {
  const ang = Math.atan2(b[1] - a[1], b[0] - a[0]);
  const L = 7, W = 0.5;
  const p1: Pt = [b[0] - L * Math.cos(ang - W), b[1] - L * Math.sin(ang - W)];
  const p2: Pt = [b[0] - L * Math.cos(ang + W), b[1] - L * Math.sin(ang + W)];
  return `<polygon points="${ps(b)} ${ps(p1)} ${ps(p2)}" fill="#111"/>`;
}

export function renderSvg(fig: Figure, opts: { size?: number; frame?: boolean; extra?: string } = {}): string {
  const size = opts.size ?? 120;
  const body = fig.map((p) => {
    switch (p.kind) {
      case 'line': return `<line x1="${r1(p.a[0])}" y1="${r1(p.a[1])}" x2="${r1(p.b[0])}" y2="${r1(p.b[1])}" ${STROKE}/>`;
      case 'arrow': return `<line x1="${r1(p.a[0])}" y1="${r1(p.a[1])}" x2="${r1(p.b[0])}" y2="${r1(p.b[1])}" ${STROKE}/>${arrowHead(p.a, p.b)}`;
      case 'poly': {
        const tag = p.closed ? 'polygon' : 'polyline';
        return `<${tag} points="${p.pts.map(ps).join(' ')}" fill="${p.filled ? '#111' : 'none'}" ${STROKE}/>`;
      }
      case 'dot': return `<circle cx="${r1(p.c[0])}" cy="${r1(p.c[1])}" r="${r1(p.r)}" fill="#111"/>`;
      case 'circle': return `<circle cx="${r1(p.c[0])}" cy="${r1(p.c[1])}" r="${r1(p.r)}" fill="${p.filled ? '#111' : 'none'}" ${STROKE}/>`;
      case 'glyph': {
        const [a, b, c, d] = p.m;
        return `<text transform="matrix(${a} ${c} ${b} ${d} ${r1(p.c[0])} ${r1(p.c[1])})" font-family="Arial, Helvetica, sans-serif" font-weight="700" font-size="20" text-anchor="middle" dominant-baseline="central" fill="#111">${p.ch}</text>`;
      }
    }
  }).join('');
  const frame = opts.frame === false ? '' : '<rect x="1" y="1" width="98" height="98" fill="none" stroke="#111" stroke-width="1.5"/>';
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="${size}" height="${size}">${frame}${body}${opts.extra ?? ''}</svg>`;
}

// ── seeded randomness ─────────────────────────────────────────────────────────────────────────

/** mulberry32 — small, fast, and the same sequence for the same seed on every platform. */
export function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function shuffle<T>(arr: T[], rand: () => number): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
