/**
 * Mirror-image and water-image questions, generated with a computed answer.
 *
 *   MIRROR_IMAGE — "Choose the correct mirror image of the figure when the mirror is placed
 *                   vertically to its right (MN)": answer = reflection across the vertical axis.
 *   WATER_IMAGE  — "Choose the water image (reflection in water below the figure)": answer =
 *                   reflection across the horizontal axis.
 *
 * Distractors are the classic slips: the other reflection, 180° and 90° rotations, and the figure
 * unchanged. A figure is regenerated until every option looks different from every other, so
 * there is exactly one correct answer by construction — verified again in the unit tests.
 */
import { Figure, Pt, Transform, rng, shuffle, signature, transform, renderSvg } from './figureModel';

export type ReflectionArchetype = 'MIRROR_IMAGE' | 'WATER_IMAGE';

export interface GeneratedFigureQuestion {
  archetype: ReflectionArchetype;
  seed: number;
  prompt: string;
  question: Figure;
  questionSvg: string;
  options: Figure[];
  optionSvgs: string[];
  /** Index into options of the one correct answer — computed, never model-judged. */
  answerIndex: number;
  /** Which transform each option is, for audit and for explaining the answer. */
  optionTransforms: Transform[];
  explanation: string;
}

/** Letters and digits that change under reflection AND are unambiguous in a bold sans face. */
const ASYM_GLYPHS = ['F', 'G', 'J', 'L', 'P', 'R', 'Q', 'K', '4', '7', '2', '3', '5'];

function randomFigure(rand: () => number): Figure {
  const at = (lo: number, hi: number) => lo + Math.floor(rand() * (hi - lo + 1));
  // Four quadrant-ish cells so elements don't overlap; keep off the central axes so reflections move them.
  const cells: Pt[] = [[26, 26], [74, 26], [26, 74], [74, 74], [50, 22], [22, 50]];
  const chosen = shuffle(cells, rand).slice(0, 3 + (rand() < 0.5 ? 1 : 0));
  const fig: Figure = [];
  for (const [cx, cy] of chosen) {
    const jx = cx + at(-6, 6), jy = cy + at(-6, 6);
    switch (at(0, 5)) {
      case 0: { // arrow in a random non-axial direction
        const ang = (at(0, 7) * 45 + 20) * Math.PI / 180;
        fig.push({ kind: 'arrow', a: [jx - 11 * Math.cos(ang), jy - 11 * Math.sin(ang)], b: [jx + 11 * Math.cos(ang), jy + 11 * Math.sin(ang)] });
        break;
      }
      case 1: // L-shape (open polyline)
        fig.push({ kind: 'poly', closed: false, pts: [[jx - 9, jy - 10], [jx - 9, jy + 9], [jx + 8, jy + 9]] });
        break;
      case 2: // right triangle (asymmetric about both axes through its own centre)
        fig.push({ kind: 'poly', closed: true, filled: rand() < 0.4, pts: [[jx - 9, jy + 8], [jx + 10, jy + 8], [jx - 9, jy - 10]] });
        break;
      case 3:
        fig.push({ kind: 'dot', c: [jx, jy], r: 3.5 });
        break;
      case 4:
        fig.push({ kind: 'circle', c: [jx, jy], r: 7, filled: rand() < 0.5 });
        break;
      default:
        fig.push({ kind: 'glyph', c: [jx, jy], ch: ASYM_GLYPHS[at(0, ASYM_GLYPHS.length - 1)], m: [1, 0, 0, 1] });
    }
  }
  return fig;
}

export function generateReflectionQuestion(archetype: ReflectionArchetype, seed: number): GeneratedFigureQuestion {
  const rand = rng(seed);
  const correct: Transform = archetype === 'MIRROR_IMAGE' ? 'mirrorV' : 'mirrorH';
  const other: Transform = archetype === 'MIRROR_IMAGE' ? 'mirrorH' : 'mirrorV';

  for (let attempt = 0; attempt < 200; attempt++) {
    const fig = randomFigure(rand);
    // Three distractors from the classic slips; the unchanged figure is always tempting.
    const pool: Transform[] = shuffle([other, 'rot180', 'rot90', 'identity'] as Transform[], rand).slice(0, 3);
    const transforms = shuffle([correct, ...pool], rand);
    const options = transforms.map((t) => transform(fig, t));
    const sigs = options.map(signature);
    if (new Set(sigs).size !== sigs.length) continue;          // two options look identical
    if (signature(fig) === sigs[transforms.indexOf(correct)]) continue; // figure is its own reflection
    const answerIndex = transforms.indexOf(correct);
    const mirrorLine = archetype === 'MIRROR_IMAGE'
      ? '<line x1="104" y1="-6" x2="104" y2="106" stroke="#111" stroke-width="1.2" stroke-dasharray="4 3"/><text x="108" y="4" font-size="9" font-family="Arial">M</text><text x="108" y="104" font-size="9" font-family="Arial">N</text>'
      : '<line x1="-6" y1="104" x2="106" y2="104" stroke="#111" stroke-width="1.2" stroke-dasharray="4 3"/>';
    return {
      archetype,
      seed,
      prompt: archetype === 'MIRROR_IMAGE'
        ? 'Choose the correct mirror image of the given figure, if the mirror is placed vertically to the right (along MN).'
        : 'Choose the correct water image of the given figure (its reflection in water below it).',
      question: fig,
      questionSvg: renderSvg(fig, { extra: mirrorLine }).replace('viewBox="0 0 100 100"', 'viewBox="-8 -8 124 124"'),
      options,
      optionSvgs: options.map((o) => renderSvg(o)),
      answerIndex,
      optionTransforms: transforms,
      explanation: archetype === 'MIRROR_IMAGE'
        ? 'A vertical mirror swaps left and right but keeps top and bottom: every element moves to the opposite side and faces the other way, at the same height.'
        : 'Water reflects top and bottom but keeps left and right: every element flips upside down and moves to the opposite height, on the same side.',
    };
  }
  throw new Error(`could not build a valid ${archetype} question from seed ${seed}`);
}
